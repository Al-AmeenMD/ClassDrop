// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mockTransaction = {
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
};

const mockFile = {
  exists: vi.fn(),
  getSignedUrl: vi.fn(),
};

const mockBucket = {
  file: vi.fn(() => mockFile),
};

const mockDocRef = (path: string) => ({
  id: path.split("/").pop(),
  path,
  get: vi.fn(),
});

const mockFirestore = {
  collection: vi.fn((collName: string) => ({
    doc: vi.fn((docId?: string) => mockDocRef(`${collName}/${docId || "generated-id"}`)),
  })),
  runTransaction: vi.fn(async (updateFunction: any) => {
    return await updateFunction(mockTransaction);
  }),
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

import { downloadApp } from "../../functions/src/index";

describe("Download Gateway (Cloud Functions HTTP Gateway)", () => {
  const validResourceId = "res-lecture-101";
  const validStoragePath = `materials/${validResourceId}/intro_slides.pdf`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET methods with 405 Method Not Allowed and Allow: GET header", async () => {
    const postRes = await request(downloadApp).post(`/api/download/${validResourceId}`);
    expect(postRes.status).toBe(405);
    expect(postRes.headers["allow"]).toBe("GET");
    expect(postRes.body.error).toContain("Method not allowed");

    const putRes = await request(downloadApp).put(`/api/download/${validResourceId}`);
    expect(putRes.status).toBe(405);

    const deleteRes = await request(downloadApp).delete(`/api/download/${validResourceId}`);
    expect(deleteRes.status).toBe(405);
  });

  it("applies strict anti-caching headers on all responses", async () => {
    const res = await request(downloadApp).get(`/api/download/invalid!!id`);

    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["cache-control"]).toContain("no-cache");
    expect(res.headers["pragma"]).toBe("no-cache");
    expect(res.headers["expires"]).toBe("0");
    expect(res.headers["surrogate-control"]).toBe("no-store");
  });

  it("rejects invalid resource IDs with HTTP 400", async () => {
    const res = await request(downloadApp).get("/api/download/invalid@!#$%");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid resource identifier format");
  });

  it("returns 404 when private resource document is missing in /resources", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
      })),
    }) as any);

    const res = await request(downloadApp).get(`/api/download/${validResourceId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Resource not found or has been removed");
  });

  it("returns 404 when resource document has isPublished === false (unpublished)", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            isPublished: false,
            storagePath: validStoragePath,
          }),
        }),
      })),
    }) as any);

    const res = await request(downloadApp).get(`/api/download/${validResourceId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Resource is not published");
  });

  it("returns 404 when public resource record is missing in /public_resources", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockImplementation(async () => {
          if (collName === "resources") {
            return {
              exists: true,
              data: () => ({
                isPublished: true,
                storagePath: validStoragePath,
                fileName: "slides.pdf",
              }),
            };
          }
          return { exists: false, data: () => null }; // public_resources missing
        }),
      })),
    }) as any);

    const res = await request(downloadApp).get(`/api/download/${validResourceId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Public resource record not found");
  });

  it("returns 500 when storagePath attempts path traversal or directory escaping", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            isPublished: true,
            storagePath: `materials/${validResourceId}/../../etc/passwd`,
            fileName: "bad.pdf",
          }),
        }),
      })),
    }) as any);

    const res = await request(downloadApp).get(`/api/download/${validResourceId}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Invalid resource storage reference");
  });

  it("returns 404 when Cloud Storage object is missing from bucket", async () => {
    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "id",
        path: `${collName}/${docId}`,
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            isPublished: true,
            storagePath: validStoragePath,
            fileName: "slides.pdf",
          }),
        }),
      })),
    }) as any);

    mockFile.exists.mockResolvedValueOnce([false]); // File missing in bucket

    const res = await request(downloadApp).get(`/api/download/${validResourceId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("The requested file could not be found in storage");
  });

  it("handles valid download with 302 redirect, V4 signed URL, atomic counter increment, and PII-free download log", async () => {
    const mockSignedUrl = "https://storage.googleapis.com/demo-bucket/materials/res-101/slides.pdf?X-Goog-Signature=abcdef123";

    vi.mocked(mockFirestore.collection).mockImplementation((collName: string) => ({
      doc: vi.fn((docId?: string) => ({
        id: docId || "generated-log-id",
        path: `${collName}/${docId || "generated-log-id"}`,
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            isPublished: true,
            storagePath: validStoragePath,
            fileName: "Course Syllabus & Notes (Fall 2026).pdf",
          }),
        }),
      })),
    }) as any);

    mockFile.exists.mockResolvedValueOnce([true]);
    mockFile.getSignedUrl.mockResolvedValueOnce([mockSignedUrl]);

    // Setup transaction mock
    mockTransaction.get.mockImplementation(async (ref: any) => ({
      exists: true,
      data: () => ({
        isPublished: true,
        storagePath: validStoragePath,
      }),
    }));

    const res = await request(downloadApp).get(`/api/download/${validResourceId}`);

    // Verify HTTP 302 redirect
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(mockSignedUrl);

    // Verify V4 signed URL generation options
    expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "v4",
        action: "read",
        responseDisposition: expect.stringContaining("attachment;"),
      })
    );

    // Verify Content-Disposition encoding (RFC 5987 UTF-8 safe)
    const callArgs = mockFile.getSignedUrl.mock.calls[0][0];
    expect(callArgs.responseDisposition).toContain("filename*=");
    expect(callArgs.responseDisposition).not.toContain("\n");

    // Verify atomic transaction was executed
    expect(mockFirestore.runTransaction).toHaveBeenCalled();
    expect(mockTransaction.update).toHaveBeenCalled();
    expect(mockTransaction.set).toHaveBeenCalled();

    // Verify download log contains NO student PII
    const logSetCall = mockTransaction.set.mock.calls[0];
    const logData = logSetCall[1];
    expect(logData.resourceId).toBe(validResourceId);
    expect(logData.downloadedAt).toBe("MOCK_SERVER_TIMESTAMP");
    expect(logData.expireAt).toBeDefined();

    // Verify no IP, headers, student uid, or browser cookies were stored
    expect(logData.ip).toBeUndefined();
    expect(logData.ipAddress).toBeUndefined();
    expect(logData.userAgent).toBeUndefined();
    expect(logData.userId).toBeUndefined();
    expect(logData.studentId).toBeUndefined();
  });
});

