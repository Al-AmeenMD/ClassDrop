// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFile = {
  delete: vi.fn(),
};

const mockBucket = {
  file: vi.fn(() => mockFile),
};

const mockBatch = {
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

const mockDocRef = (path: string) => ({
  id: path.split("/").pop(),
  path,
  get: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
});

const mockFirestore = {
  collection: vi.fn((collName: string) => ({
    doc: vi.fn((docId?: string) => mockDocRef(`${collName}/${docId || "generated-id"}`)),
  })),
  batch: vi.fn(() => mockBatch),
};

vi.mock("firebase-admin", () => {
  return {
    initializeApp: vi.fn(),
    firestore: Object.assign(vi.fn(() => mockFirestore), {
      FieldValue: {
        increment: vi.fn((n) => `INCREMENT(${n})`),
        serverTimestamp: vi.fn(() => "MOCK_SERVER_TIMESTAMP"),
      },
      Timestamp: {
        fromDate: vi.fn((date) => ({ toDate: () => date, seconds: Math.floor(date.getTime() / 1000) })),
      },
    }),
    storage: vi.fn(() => ({
      bucket: vi.fn(() => mockBucket),
    })),
  };
});

import { deleteResource } from "../../functions/src/index";

describe("Resource Deletion (Cloud Functions deleteResource Callable)", () => {
  const validAdminUid = "admin-uid-verified";
  const validResourceId = "res-to-delete-123";
  const validStoragePath = `materials/${validResourceId}/notes.pdf`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const invokeDelete = async (req: any) => {
    // In firebase-functions v2, onCall exports .run(request) for direct unit testing
    if (typeof (deleteResource as any).run === "function") {
      return await (deleteResource as any).run(req);
    }
    return await (deleteResource as any)(req);
  };

  it("rejects unauthenticated caller with 'unauthenticated' HttpsError", async () => {
    await expect(
      invokeDelete({
        auth: null,
        data: { resourceId: validResourceId },
      })
    ).rejects.toThrow("Authentication is required");
  });

  it("rejects authenticated caller not present in /admins/{uid} registry with 'permission-denied'", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockResolvedValue({
          exists: false, // Not in /admins/{uid}
          data: () => null,
        }),
      })),
    }) as any);

    await expect(
      invokeDelete({
        auth: { uid: "non-admin-uid" },
        data: { resourceId: validResourceId },
      })
    ).rejects.toThrow("Access denied: Caller is not registered in the administrator registry.");
  });

  it("rejects invalid resourceId format with 'invalid-argument'", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockResolvedValue({
          exists: true, // adminDoc exists
          data: () => ({ email: "admin@classdrop.edu" }),
        }),
      })),
    }) as any);

    await expect(
      invokeDelete({
        auth: { uid: validAdminUid },
        data: { resourceId: "invalid/traversal/id" },
      })
    ).rejects.toThrow("A valid resourceId parameter is required.");

    await expect(
      invokeDelete({
        auth: { uid: validAdminUid },
        data: { resourceId: "" },
      })
    ).rejects.toThrow("A valid resourceId parameter is required.");
  });

  it("rejects malformed or directory-escaping storagePath with 'failed-precondition'", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockImplementation(async () => {
          if (collName === "admins") {
            return { exists: true, data: () => ({ email: "admin@classdrop.edu" }) };
          }
          if (collName === "resources") {
            return {
              exists: true,
              data: () => ({
                storagePath: `materials/other-resource-id/stolen.pdf`, // Path outside materials/{resourceId}/
              }),
            };
          }
          return { exists: false, data: () => null };
        }),
      })),
    }) as any);

    await expect(
      invokeDelete({
        auth: { uid: validAdminUid },
        data: { resourceId: validResourceId },
      })
    ).rejects.toThrow("Resource storagePath is malformed, invalid, or outside the expected resource directory.");
  });

  it("aborts metadata deletion when Storage deletion fails with non-404 error", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockImplementation(async () => {
          if (collName === "admins") {
            return { exists: true, data: () => ({ email: "admin@classdrop.edu" }) };
          }
          if (collName === "resources") {
            return {
              exists: true,
              data: () => ({ storagePath: validStoragePath }),
            };
          }
          return { exists: true, data: () => ({}) };
        }),
      })),
    }) as any);

    // Simulate network error / permission error on storage bucket
    mockFile.delete.mockRejectedValueOnce(new Error("GCS connection timeout"));

    await expect(
      invokeDelete({
        auth: { uid: validAdminUid },
        data: { resourceId: validResourceId },
      })
    ).rejects.toThrow("Failed to delete resource file from storage. Metadata deletion aborted to prevent orphans.");

    // Verify batch deletion was NOT committed
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it("successfully deletes storage file and executes atomic batch deletion of /resources and /public_resources", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockImplementation(async () => {
          if (collName === "admins") {
            return { exists: true, data: () => ({ email: "admin@classdrop.edu" }) };
          }
          if (collName === "resources") {
            return {
              exists: true,
              data: () => ({ storagePath: validStoragePath }),
            };
          }
          return { exists: true, data: () => ({}) };
        }),
      })),
    }) as any);

    mockFile.delete.mockResolvedValueOnce([{}]); // GCS delete success

    const result = await invokeDelete({
      auth: { uid: validAdminUid },
      data: { resourceId: validResourceId },
    });

    expect(result).toEqual({ success: true, resourceId: validResourceId });
    expect(mockFile.delete).toHaveBeenCalled();
    expect(mockBatch.delete).toHaveBeenCalledTimes(2); // Deletes both private and public records
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it("handles missing Storage file (404) gracefully and proceeds with metadata cleanup", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockImplementation(async () => {
          if (collName === "admins") {
            return { exists: true, data: () => ({ email: "admin@classdrop.edu" }) };
          }
          if (collName === "resources") {
            return {
              exists: true,
              data: () => ({ storagePath: validStoragePath }),
            };
          }
          return { exists: true, data: () => ({}) };
        }),
      })),
    }) as any);

    const notFoundError: any = new Error("Not Found");
    notFoundError.code = 404;
    mockFile.delete.mockRejectedValueOnce(notFoundError);

    const result = await invokeDelete({
      auth: { uid: validAdminUid },
      data: { resourceId: validResourceId },
    });

    expect(result.success).toBe(true);
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it("idempotently cleans up orphan public record if private resource record is already gone", async () => {
    const mockPublicDoc = {
      path: `public_resources/${validResourceId}`,
      get: vi.fn().mockResolvedValue({ exists: true }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => {
        if (collName === "admins") {
          return { get: vi.fn().mockResolvedValue({ exists: true }) };
        }
        if (collName === "resources") {
          return { get: vi.fn().mockResolvedValue({ exists: false }) }; // Already gone
        }
        if (collName === "public_resources") {
          return mockPublicDoc;
        }
        return { get: vi.fn().mockResolvedValue({ exists: false }) };
      }),
    }) as any);

    const result = await invokeDelete({
      auth: { uid: validAdminUid },
      data: { resourceId: validResourceId },
    });

    expect(result.success).toBe(true);
    expect(mockPublicDoc.delete).toHaveBeenCalled();
  });
});

