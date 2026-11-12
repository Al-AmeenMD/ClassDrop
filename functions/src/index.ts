import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

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
