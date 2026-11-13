import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

describe("Firestore Security Rules Verification", () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = "demo-classdrop";

  beforeAll(async () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rules = fs.readFileSync(rulesPath, "utf8");

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: "127.0.0.1",
        port: 8080,
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

    // Provision admin in admin registry via security-bypassing admin context
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "admins", "admin-uid-1"), {
        email: "admin@classdrop.edu",
        role: "admin",
        authorizedAt: new Date(),
      });
      await setDoc(doc(db, "settings", "classroom"), {
        title: "CS 101: Systems Programming",
        description: "Materials and lecture slides",
        updatedAt: new Date(),
        updatedBy: "admin-uid-1",
      });
      await setDoc(doc(db, "resources", "res-private-1"), {
        id: "res-private-1",
        title: "Midterm Exam Solutions",
        description: "Confidential",
        storagePath: "materials/res-private-1/midterm.pdf",
        isPublished: false,
        downloadInitiations: 0,
        createdBy: "admin-uid-1",
      });
      await setDoc(doc(db, "public_resources", "res-pub-1"), {
        id: "res-pub-1",
        title: "Lecture 1 Slides",
        description: "Introduction slides",
        fileType: "application/pdf",
        fileExtension: "pdf",
        fileSize: 1048576,
        publishedAt: new Date(),
      });
      await setDoc(doc(db, "download_logs", "log-1"), {
        id: "log-1",
        resourceId: "res-pub-1",
        downloadedAt: new Date(),
      });
    });
  });

  // -------------------------------------------------------------
  // 1. Settings Collection
  // -------------------------------------------------------------
  describe("Classroom Settings (/settings/{docId})", () => {
    it("allows unauthenticated public read for /settings/classroom", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(unauthDb, "settings", "classroom")));
    });

    it("allows authenticated non-admin read for /settings/classroom", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertSucceeds(getDoc(doc(studentDb, "settings", "classroom")));
    });

    it("denies unauthenticated write to /settings/classroom", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(
        setDoc(doc(unauthDb, "settings", "classroom"), { title: "Hacked" })
      );
    });

    it("denies authenticated non-admin write to /settings/classroom", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertFails(
        setDoc(doc(studentDb, "settings", "classroom"), { title: "Student Update" })
      );
    });

    it("allows verified administrator write to /settings/classroom", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      await assertSucceeds(
        setDoc(doc(adminDb, "settings", "classroom"), { title: "Updated Course Title" }, { merge: true })
      );
    });

    it("denies access to non-classroom settings document IDs", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();

      await assertFails(getDoc(doc(unauthDb, "settings", "internal_secrets")));
      await assertFails(
        setDoc(doc(adminDb, "settings", "internal_secrets"), { secret: "123" })
      );
    });
  });

  // -------------------------------------------------------------
  // 2. Private Administrative Resources Collection (/resources/{resourceId})
  // -------------------------------------------------------------
  describe("Administrative Resources (/resources/{resourceId})", () => {
    it("denies unauthenticated read on private resources", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(unauthDb, "resources", "res-private-1")));
    });

    it("denies authenticated non-admin read on private resources", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertFails(getDoc(doc(studentDb, "resources", "res-private-1")));
    });

    it("allows verified administrator read on private resources", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      await assertSucceeds(getDoc(doc(adminDb, "resources", "res-private-1")));
    });

    it("denies unauthenticated create on private resources", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(
        setDoc(doc(unauthDb, "resources", "res-new"), { title: "Unauth Upload" })
      );
    });

    it("denies authenticated non-admin create on private resources", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertFails(
        setDoc(doc(studentDb, "resources", "res-new"), { title: "Student Upload" })
      );
    });

    it("allows verified administrator create on private resources", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      await assertSucceeds(
        setDoc(doc(adminDb, "resources", "res-new"), {
          id: "res-new",
          title: "Lab 2 Manual",
          isPublished: false,
          downloadInitiations: 0,
        })
      );
    });

    it("allows verified administrator update on private resources", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      await assertSucceeds(
        updateDoc(doc(adminDb, "resources", "res-private-1"), {
          title: "Updated Title",
        })
      );
    });

    it("STRICTLY BLOCKS client-side deletion on private resources (enforces server-side Cloud Function deletion)", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      // Even admin cannot delete /resources doc directly from client
      await assertFails(deleteDoc(doc(adminDb, "resources", "res-private-1")));
      await assertFails(deleteDoc(doc(studentDb, "resources", "res-private-1")));
      await assertFails(deleteDoc(doc(unauthDb, "resources", "res-private-1")));
    });
  });

  // -------------------------------------------------------------
  // 3. Public Resources Collection (/public_resources/{resourceId})
  // -------------------------------------------------------------
  describe("Public Resources (/public_resources/{resourceId})", () => {
    it("allows unauthenticated public read on public resources", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(unauthDb, "public_resources", "res-pub-1")));
    });

    it("allows authenticated student read on public resources", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertSucceeds(getDoc(doc(studentDb, "public_resources", "res-pub-1")));
    });

    it("denies unauthenticated writes to public resources", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(
        setDoc(doc(unauthDb, "public_resources", "res-fake"), { title: "Spoofed" })
      );
      await assertFails(deleteDoc(doc(unauthDb, "public_resources", "res-pub-1")));
    });

    it("denies authenticated non-admin writes to public resources", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertFails(
        setDoc(doc(studentDb, "public_resources", "res-fake"), { title: "Student Post" })
      );
      await assertFails(deleteDoc(doc(studentDb, "public_resources", "res-pub-1")));
    });

    it("allows administrator write (publish, edit, unpublish) to public resources", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();

      // Publish / create
      await assertSucceeds(
        setDoc(doc(adminDb, "public_resources", "res-pub-2"), {
          id: "res-pub-2",
          title: "Lecture 2",
          fileType: "application/pdf",
          fileExtension: "pdf",
          fileSize: 2048,
          publishedAt: new Date(),
        })
      );

      // Edit / update
      await assertSucceeds(
        updateDoc(doc(adminDb, "public_resources", "res-pub-2"), {
          title: "Lecture 2 - Revised",
        })
      );

      // Unpublish / delete
      await assertSucceeds(deleteDoc(doc(adminDb, "public_resources", "res-pub-2")));
    });
  });

  // -------------------------------------------------------------
  // 4. Download Logs Collection (/download_logs/{logId})
  // -------------------------------------------------------------
  describe("Download Logs (/download_logs/{logId})", () => {
    it("denies unauthenticated read on download logs", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(unauthDb, "download_logs", "log-1")));
    });

    it("denies authenticated non-admin read on download logs", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertFails(getDoc(doc(studentDb, "download_logs", "log-1")));
    });

    it("allows verified administrator read on download logs", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      await assertSucceeds(getDoc(doc(adminDb, "download_logs", "log-1")));
    });

    it("STRICTLY BLOCKS client writes on download logs (even for administrator)", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      // Client writes disabled; logs must only be written by trusted Cloud Functions
      await assertFails(
        setDoc(doc(adminDb, "download_logs", "log-fake"), { resourceId: "123" })
      );
      await assertFails(
        setDoc(doc(studentDb, "download_logs", "log-fake"), { resourceId: "123" })
      );
      await assertFails(
        setDoc(doc(unauthDb, "download_logs", "log-fake"), { resourceId: "123" })
      );
      await assertFails(deleteDoc(doc(adminDb, "download_logs", "log-1")));
    });
  });

  // -------------------------------------------------------------
  // 5. Admin Registry (/admins/{uid})
  // -------------------------------------------------------------
  describe("Administrator Registry (/admins/{uid})", () => {
    it("allows authenticated user to read their own admin document", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      await assertSucceeds(getDoc(doc(adminDb, "admins", "admin-uid-1")));
    });

    it("allows authenticated non-admin user to read their own (missing) document for self-check", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertSucceeds(getDoc(doc(studentDb, "admins", "student-uid")));
    });

    it("denies authenticated user reading another user's admin document", async () => {
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();
      await assertFails(getDoc(doc(studentDb, "admins", "admin-uid-1")));
    });

    it("denies unauthenticated user reading admin documents", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(unauthDb, "admins", "admin-uid-1")));
    });

    it("STRICTLY BLOCKS client-side writes to /admins/{uid} even for the admin themselves", async () => {
      const adminDb = testEnv.authenticatedContext("admin-uid-1").firestore();
      const studentDb = testEnv.authenticatedContext("student-uid").firestore();

      // Self-promotion blocked
      await assertFails(
        setDoc(doc(studentDb, "admins", "student-uid"), {
          email: "student@classdrop.edu",
          role: "admin",
        })
      );

      // Admin modification blocked
      await assertFails(
        updateDoc(doc(adminDb, "admins", "admin-uid-1"), {
          role: "superadmin",
        })
      );

      // Deletion blocked
      await assertFails(deleteDoc(doc(adminDb, "admins", "admin-uid-1")));
    });
  });
});
