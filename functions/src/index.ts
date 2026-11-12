import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import express, { Request, Response } from "express";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Configure default global options for 2nd Gen Cloud Functions
setGlobalOptions({
  region: "us-central1", // Default deployment region, aligned with project settings
  maxInstances: 10,
  timeoutSeconds: 60,
});

/**
 * deleteResource (2nd Gen Callable Cloud Function)
 *
 * Implements approved server-side resource deletion:
 * 1. Verifies caller is authenticated.
 * 2. Verifies caller exists in /admins/{uid}.
 * 3. Validates resourceId format.
 * 4. Retrieves the administrator resource record from /resources/{resourceId}.
 * 5. Uses and validates trusted storagePath stored in /resources/{resourceId} (must belong to materials/{resourceId}/).
 * 6. Deletes Storage object (ignoring 404 not found only; other errors abort).
 * 7. Deletes /resources/{resourceId} and /public_resources/{resourceId} in batch.
 * 8. If resource record is missing, cleans up public record idempotently.
 */
export const deleteResource = onCall(async (request) => {
  // 1. Verify authentication
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication is required to perform resource deletion."
    );
  }

  const callerUid = request.auth.uid;
  const db = admin.firestore();

  // 2. Verify caller in /admins/{uid} registry
  const adminDoc = await db.collection("admins").doc(callerUid).get();
  if (!adminDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "Access denied: Caller is not registered in the administrator registry."
    );
  }

  // 3. Validate resourceId
  const resourceId = request.data?.resourceId;
  if (!resourceId || typeof resourceId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(resourceId)) {
    throw new HttpsError(
      "invalid-argument",
      "A valid resourceId parameter is required."
    );
  }

  const resourceDocRef = db.collection("resources").doc(resourceId);
  const publicDocRef = db.collection("public_resources").doc(resourceId);

  // 4. Retrieve administrator resource record
  const resourceSnap = await resourceDocRef.get();

  if (!resourceSnap.exists) {
    // Resource already missing: handle idempotently by cleaning up orphaned public record if present
    const publicSnap = await publicDocRef.get();
    if (publicSnap.exists) {
      await publicDocRef.delete();
    }
    return { success: true, message: "Resource already deleted or not found." };
  }

  const resourceData = resourceSnap.data();
  const storagePath = resourceData?.storagePath;

  if (!storagePath || typeof storagePath !== "string") {
    throw new HttpsError(
      "failed-precondition",
      "Resource metadata is corrupt or missing storagePath."
    );
  }

  // 5. Validate that the trusted stored path belongs strictly to materials/{resourceId}/
  const expectedPrefix = `materials/${resourceId}/`;
  if (
    !storagePath.startsWith(expectedPrefix) ||
    storagePath.length <= expectedPrefix.length ||
    storagePath.includes("..") ||
    storagePath.includes("\\") ||
    storagePath.substring(expectedPrefix.length).includes("/")
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Resource storagePath is malformed, invalid, or outside the expected resource directory."
    );
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  // 6. Delete Storage object with selective error handling
  try {
    await file.delete();
  } catch (storageErr: any) {
    // Ignore Storage not-found error only (HTTP 404 / code 404)
    const isNotFound = storageErr?.code === 404 || storageErr?.errors?.[0]?.reason === "notFound";
    if (!isNotFound) {
      console.error(`Storage deletion failed for ${storagePath}:`, storageErr);
      throw new HttpsError(
        "internal",
        "Failed to delete resource file from storage. Metadata deletion aborted to prevent orphans."
      );
    }
  }

  // 7. Atomic batch deletion of administrator and public records
  const batch = db.batch();
  batch.delete(resourceDocRef);
  batch.delete(publicDocRef);
  await batch.commit();

  return { success: true, resourceId };
});

/**
 * downloadResource (2nd Gen HTTP Cloud Function via Express)
 *
 * Implements approved public zero-auth download gateway:
 * 1. Accepts GET /api/download/:resourceId (routed via Firebase Hosting rewrite).
 * 2. Requires zero student authentication.
 * 3. Validates resourceId format.
 * 4. Checks /resources/{resourceId} exists and isPublished === true.
 * 5. Checks /public_resources/{resourceId} exists.
 * 6. Validates storagePath from trusted Firestore metadata.
 * 7. Verifies Storage object exists before incrementing statistics.
 * 8. Generates a 5-minute V4 signed URL with attachment Content-Disposition.
 * 9. Atomically executes Firestore transaction to increment downloadInitiations and write /download_logs.
 * 10. Returns HTTP 302 redirect with no-cache headers.
 */
/**
 * RFC 5987 encode helper for Content-Disposition filename* parameter.
 * JavaScript encodeURIComponent does not percent-encode: ' ( ) *
 * RFC 5987 requires these characters to be percent-encoded.
 */
function rfc5987Encode(str: string): string {
  return encodeURIComponent(str).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

const downloadApp = express();
downloadApp.disable("x-powered-by");

const handleDownloadRequest = async (req: Request, res: Response): Promise<void> => {
  // 1. Restrict strictly to GET (reject HEAD and all other methods)
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed. Use GET to access materials." });
    return;
  }

  // Set strict anti-caching headers on all gateway responses
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  // Extract resourceId from route parameters or path segments
  let resourceId = req.params.resourceId;
  if (!resourceId) {
    const pathParts = req.path.split("/").filter(Boolean);
    resourceId = pathParts[pathParts.length - 1];
  }

  // 1. Validate resourceId format
  if (!resourceId || !/^[a-zA-Z0-9_-]{1,128}$/.test(resourceId)) {
    res.status(400).json({ error: "Invalid resource identifier format." });
    return;
  }

  const db = admin.firestore();
  const resourceDocRef = db.collection("resources").doc(resourceId);
  const publicDocRef = db.collection("public_resources").doc(resourceId);

  try {
    // 2. Retrieve private resource metadata
    const resourceSnap = await resourceDocRef.get();
    if (!resourceSnap.exists) {
      res.status(404).json({ error: "Resource not found or has been removed." });
      return;
    }

    const resourceData = resourceSnap.data();

    // 3. Verify publication status
    if (!resourceData?.isPublished) {
      res.status(404).json({ error: "Resource is not published." });
      return;
    }

    // 4. Verify corresponding public resource document exists
    const publicSnap = await publicDocRef.get();
    if (!publicSnap.exists) {
      res.status(404).json({ error: "Public resource record not found." });
      return;
    }

    // 5. Obtain and validate Storage path from trusted metadata
    const storagePath = resourceData.storagePath;
    if (!storagePath || typeof storagePath !== "string") {
      res.status(500).json({ error: "Resource storage path is missing or invalid." });
      return;
    }

    const expectedPrefix = `materials/${resourceId}/`;
    if (
      !storagePath.startsWith(expectedPrefix) ||
      storagePath.length <= expectedPrefix.length ||
      storagePath.includes("..") ||
      storagePath.includes("\\") ||
      storagePath.substring(expectedPrefix.length).includes("/")
    ) {
      res.status(500).json({ error: "Invalid resource storage reference." });
      return;
    }

    // 6. Verify Storage object exists before any database transaction
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [fileExists] = await file.exists();

    if (!fileExists) {
      console.warn(`Storage object missing for published resource ${resourceId} at ${storagePath}`);
      res.status(404).json({ error: "The requested file could not be found in storage." });
      return;
    }

    // 7. Generate V4 signed URL with 5-minute expiry and RFC 5987-hardened attachment disposition
    const fileName = resourceData.fileName || "classroom-material";
    // Sanitize fallback filename: must be strictly printable ASCII (0x20-0x7E),
    // with control characters, quotes, backslashes, CR, LF, slashes, and semicolons replaced.
    const safeAsciiFilename = fileName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\r\n\\/;]/g, "_")
      .trim() || "classroom-material";
    const encodedFilename = rfc5987Encode(fileName);
    const responseDisposition = `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodedFilename}`;

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      responseDisposition,
    });

    // Generate the download log document reference and 90-day expiry timestamp outside the transaction
    // to ensure stable values across potential transaction retries.
    const logRef = db.collection("download_logs").doc();
    const now = new Date();
    const expireAtDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const expireAtTimestamp = admin.firestore.Timestamp.fromDate(expireAtDate);

    // 8. Atomic transaction: Re-verify published state, increment downloadInitiations, and create download log
    await db.runTransaction(async (transaction) => {
      const currentResSnap = await transaction.get(resourceDocRef);
      if (!currentResSnap.exists) {
        throw new Error("RESOURCE_DELETED");
      }

      const currentResData = currentResSnap.data();
      if (!currentResData?.isPublished) {
        throw new Error("RESOURCE_UNPUBLISHED");
      }

      const currentPubSnap = await transaction.get(publicDocRef);
      if (!currentPubSnap.exists) {
        throw new Error("PUBLIC_RECORD_DELETED");
      }

      // Increment downloadInitiations counter
      transaction.update(resourceDocRef, {
        downloadInitiations: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create download log record with 90-day retention (no student PII) using stable logRef
      transaction.set(logRef, {
        id: logRef.id,
        resourceId,
        downloadedAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: expireAtTimestamp,
      });
    });

    // 9. Redirect client to temporary signed URL via HTTP 302
    res.redirect(302, signedUrl);
  } catch (err: any) {
    if (
      err?.message === "RESOURCE_DELETED" ||
      err?.message === "RESOURCE_UNPUBLISHED" ||
      err?.message === "PUBLIC_RECORD_DELETED"
    ) {
      res.status(404).json({ error: "Resource is no longer available for download." });
      return;
    }

    console.error(`Download gateway error for resource ${resourceId}:`, err);
    res.status(500).json({ error: "Unable to process download. Please try again later." });
  }
};

// Mount gateway routes supporting /api/download/:resourceId and rewritten path
downloadApp.all("/api/download/:resourceId", handleDownloadRequest);
downloadApp.all("/:resourceId", handleDownloadRequest);

// Catch-all route for missing parameters or unexpected endpoints
downloadApp.all("*", (_req: Request, res: Response) => {
  res.status(400).json({ error: "Missing or invalid resource download route." });
});

export const downloadResource = onRequest(
  {
    region: "us-central1",
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  downloadApp
);
