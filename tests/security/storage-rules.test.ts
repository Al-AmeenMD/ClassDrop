// @vitest-environment node
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

describe("Cloud Storage Security Rules Verification", () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = "demo-classdrop";
  let idCounter = 0;
  const getUniqueId = () => `res-sec-${Date.now()}-${++idCounter}`;

  beforeAll(async () => {
    const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
    const storageRules = fs.readFileSync(path.resolve(process.cwd(), "storage.rules"), "utf8");

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: firestoreRules,
        host: "127.0.0.1",
        port: 8080,
      },
      storage: {
        rules: storageRules,
        host: "127.0.0.1",
        port: 9199,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();

    // Register admin in Firestore so storage.rules isAdmin() check:
    // firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid)) evaluates to true
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "admins", "admin-uid-1"), {
        email: "admin@classdrop.edu",
        role: "admin",
      });
    });
  });

  const dummyBuffer = Buffer.from("ClassDrop test file content");

  // -------------------------------------------------------------
  // Read Permissions
  // -------------------------------------------------------------
  describe("Read Permissions (materials/{resourceId}/{fileName})", () => {
    it("DENIES direct public unauthenticated read (downloads must be mediated via Cloud Function signed URLs)", async () => {
      const rid = getUniqueId();
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const seedRef = adminStorage.ref(`materials/${rid}/test.pdf`);
      await seedRef.put(dummyBuffer, { contentType: "application/pdf" });

      const unauthStorage = testEnv.unauthenticatedContext().storage();
      const fileRef = unauthStorage.ref(`materials/${rid}/test.pdf`);
      await assertFails(fileRef.getDownloadURL());
    });

    it("DENIES direct read by authenticated non-admin students", async () => {
      const rid = getUniqueId();
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const seedRef = adminStorage.ref(`materials/${rid}/test.pdf`);
      await seedRef.put(dummyBuffer, { contentType: "application/pdf" });

      const studentStorage = testEnv.authenticatedContext("student-uid").storage();
      const fileRef = studentStorage.ref(`materials/${rid}/test.pdf`);
      await assertFails(fileRef.getDownloadURL());
    });

    it("ALLOWS direct read by verified administrator", async () => {
      const rid = getUniqueId();
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const seedRef = adminStorage.ref(`materials/${rid}/test.pdf`);
      await seedRef.put(dummyBuffer, { contentType: "application/pdf" });

      const fileRef = adminStorage.ref(`materials/${rid}/test.pdf`);
      await assertSucceeds(fileRef.getDownloadURL());
    });
  });

  // -------------------------------------------------------------
  // Create / Upload Permissions
  // -------------------------------------------------------------
  describe("Create / Upload Permissions", () => {
    it("ALLOWS administrator upload with permitted MIME type (application/pdf) and <= 50MB", async () => {
      const rid = getUniqueId();
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const fileRef = adminStorage.ref(`materials/${rid}/document.pdf`);
      await assertSucceeds(
        fileRef.put(dummyBuffer, { contentType: "application/pdf" })
      );
    });

    it("ALLOWS administrator upload for all approved MIME types", async () => {
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const allowedMimes = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/x-zip-compressed",
        "image/png",
        "image/jpeg",
      ];

      for (let i = 0; i < allowedMimes.length; i++) {
        const rid = getUniqueId();
        const fileRef = adminStorage.ref(`materials/${rid}/file-${i}`);
        await assertSucceeds(
          fileRef.put(dummyBuffer, { contentType: allowedMimes[i] })
        );
      }
    });

    it("DENIES upload from unauthenticated caller", async () => {
      const rid = getUniqueId();
      const unauthStorage = testEnv.unauthenticatedContext().storage();
      const fileRef = unauthStorage.ref(`materials/${rid}/unauth.pdf`);
      await assertFails(
        fileRef.put(dummyBuffer, { contentType: "application/pdf" })
      );
    });

    it("DENIES upload from authenticated non-admin caller", async () => {
      const rid = getUniqueId();
      const studentStorage = testEnv.authenticatedContext("student-uid").storage();
      const fileRef = studentStorage.ref(`materials/${rid}/student.pdf`);
      await assertFails(
        fileRef.put(dummyBuffer, { contentType: "application/pdf" })
      );
    });

    it("DENIES upload with disallowed MIME type (e.g. executable, binary stream)", async () => {
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();

      const exeRef = adminStorage.ref(`materials/${getUniqueId()}/malware.exe`);
      await assertFails(
        exeRef.put(dummyBuffer, { contentType: "application/x-msdownload" })
      );

      const octetRef = adminStorage.ref(`materials/${getUniqueId()}/blob.bin`);
      await assertFails(
        octetRef.put(dummyBuffer, { contentType: "application/octet-stream" })
      );
    });

    it("DENIES upload of 0-byte file", async () => {
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const emptyRef = adminStorage.ref(`materials/${getUniqueId()}/empty.pdf`);
      await assertFails(
        emptyRef.put(Buffer.alloc(0), { contentType: "application/pdf" })
      );
    });

    it("DENIES upload outside materials/{resourceId}/{fileName} directory hierarchy", async () => {
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const rootFileRef = adminStorage.ref("rootfile.pdf");
      await assertFails(
        rootFileRef.put(dummyBuffer, { contentType: "application/pdf" })
      );

      const nestedRef = adminStorage.ref(`materials/${getUniqueId()}/subfolder/file.pdf`);
      await assertFails(
        nestedRef.put(dummyBuffer, { contentType: "application/pdf" })
      );
    });
  });

  // -------------------------------------------------------------
  // Client Update and Delete Restrictions
  // -------------------------------------------------------------
  describe("Client Update and Delete Restrictions", () => {
    it("STRICTLY BLOCKS client-side deletion (enforces server-side Cloud Function deletion)", async () => {
      const rid = getUniqueId();
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const fileRef = adminStorage.ref(`materials/${rid}/file.pdf`);
      await fileRef.put(dummyBuffer, { contentType: "application/pdf" });

      const studentStorage = testEnv.authenticatedContext("student-uid").storage();
      const studentFileRef = studentStorage.ref(`materials/${rid}/file.pdf`);

      await assertFails(fileRef.delete());
      await assertFails(studentFileRef.delete());
    });

    it("STRICTLY BLOCKS client-side overwriting/updating of existing files (resource == null check)", async () => {
      const rid = getUniqueId();
      const adminStorage = testEnv.authenticatedContext("admin-uid-1").storage();
      const fileRef = adminStorage.ref(`materials/${rid}/file.pdf`);
      await fileRef.put(dummyBuffer, { contentType: "application/pdf" });

      const newBuffer = Buffer.from("New overwritten content");

      // storage.rules specifies resource == null on create, and allow update: if false
      await assertFails(
        fileRef.put(newBuffer, { contentType: "application/pdf" })
      );
    });
  });
});
