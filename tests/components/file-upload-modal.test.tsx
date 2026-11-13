import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileUploadModal } from "../../src/components/admin/FileUploadModal";
import * as storageModule from "firebase/storage";
import * as firestoreModule from "firebase/firestore";

vi.mock("../../src/lib/firebase", () => ({
  storage: {},
  db: {},
  isFirebaseConfigured: true,
}));

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { uid: "admin-uid-1", email: "admin@classdrop.edu" },
    isAdmin: true,
  }),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn((_storage, path) => ({ path })),
  uploadBytesResumable: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "MOCK_SERVER_TIMESTAMP"),
}));

describe("File Upload Workflow (FileUploadModal)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <FileUploadModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders upload modal with empty dropzone when isOpen is true", () => {
    render(<FileUploadModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("Upload Classroom Materials")).toBeInTheDocument();
    expect(screen.getByText(/Click to browse or drag and drop files here/i)).toBeInTheDocument();
    expect(screen.getByText(/Max 50MB per file/i)).toBeInTheDocument();
  });

  it("stages valid files and shows staged status", async () => {
    render(<FileUploadModal isOpen={true} onClose={vi.fn()} />);

    const file = new File(["Lecture notes content"], "lecture1.pdf", {
      type: "application/pdf",
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("lecture1.pdf")).toBeInTheDocument();
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload\s*\(1\)/i })).toBeInTheDocument();
  });

  it("displays validation error immediately for invalid/unsupported files", async () => {
    render(<FileUploadModal isOpen={true} onClose={vi.fn()} />);

    const invalidFile = new File(["malicious script"], "hack.exe", {
      type: "application/x-msdownload",
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(screen.getByText("hack.exe")).toBeInTheDocument();
    expect(screen.getByText(/Unsupported file type/i)).toBeInTheDocument();
    // Upload button must remain disabled when all staged files are invalid
    expect(screen.getByRole("button", { name: /^Upload/i })).toBeDisabled();
  });

  it("allows removing a staged file from the queue before uploading", async () => {
    render(<FileUploadModal isOpen={true} onClose={vi.fn()} />);

    const file1 = new File(["content 1"], "notes1.pdf", { type: "application/pdf" });
    const file2 = new File(["content 2"], "notes2.pdf", { type: "application/pdf" });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file1, file2] } });

    expect(screen.getByText("notes1.pdf")).toBeInTheDocument();
    expect(screen.getByText("notes2.pdf")).toBeInTheDocument();

    const user = userEvent.setup();
    // Click remove button on the first file
    const removeButton = screen.getByRole("button", { name: "Remove notes1.pdf" });
    await user.click(removeButton);

    expect(screen.queryByText("notes1.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("notes2.pdf")).toBeInTheDocument();
  });

  it("cancels active upload tasks when modal is closed / unmounted", async () => {
    const cancelMock = vi.fn();
    let onProgressCallback: any;

    vi.mocked(storageModule.uploadBytesResumable).mockImplementation(() => {
      return {
        on: vi.fn((_event, progressCb) => {
          onProgressCallback = progressCb;
        }),
        cancel: cancelMock,
      } as any;
    });

    const { unmount } = render(
      <FileUploadModal isOpen={true} onClose={vi.fn()} />
    );

    const file = new File(["file content"], "syllabus.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const user = userEvent.setup();
    const uploadButton = screen.getByRole("button", { name: /Upload\s*\(1\)/i });
    await user.click(uploadButton);

    // Unmount modal while upload is in progress
    unmount();

    expect(cancelMock).toHaveBeenCalled();
  });

  it("retries failed Firestore metadata creation without re-uploading bytes to Storage", async () => {
    // 1. Setup mocks
    // Storage upload succeeds immediately
    vi.mocked(storageModule.uploadBytesResumable).mockImplementation(() => {
      return {
        on: vi.fn((_event, progressCb, _errorCb, completeCb) => {
          if (progressCb) {
            progressCb({ bytesTransferred: 5000, totalBytes: 5000 });
          }
          if (completeCb) {
            completeCb();
          }
        }),
        cancel: vi.fn(),
      } as any;
    });

    // Firestore setDoc fails on first call, succeeds on retry (second call)
    vi.mocked(firestoreModule.setDoc)
      .mockRejectedValueOnce(new Error("Network timeout during metadata save"))
      .mockResolvedValueOnce(undefined as any);

    const onUploadComplete = vi.fn();
    render(
      <FileUploadModal
        isOpen={true}
        onClose={vi.fn()}
        onUploadComplete={onUploadComplete}
      />
    );

    const file = new File(["Lecture notes PDF content"], "lecture1.pdf", {
      type: "application/pdf",
    });

    // 2. Select and stage file
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("lecture1.pdf")).toBeInTheDocument();

    const user = userEvent.setup();
    const uploadButton = screen.getByRole("button", { name: /Upload\s*\(1\)/i });

    // 3. Initiate upload
    await user.click(uploadButton);

    // 4. Assert initial Storage upload completed and Firestore metadata write failed
    // The component should display the specific error message and the "Retry Save" button
    const retryButton = await screen.findByRole("button", { name: /Retry Save/i });
    expect(retryButton).toBeInTheDocument();
    expect(
      screen.getByText(/File uploaded to storage, but failed to save metadata\. Click retry to complete\./i)
    ).toBeInTheDocument();

    // Storage was called exactly once
    expect(storageModule.uploadBytesResumable).toHaveBeenCalledTimes(1);
    // Firestore setDoc was attempted once and failed
    expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);

    // Capture first setDoc call arguments
    const firstCallArgs = vi.mocked(firestoreModule.setDoc).mock.calls[0];
    const initialResourceId = firstCallArgs[1].id;
    const initialStoragePath = firstCallArgs[1].storagePath;

    // 5. User clicks "Retry Save"
    await user.click(retryButton);

    // 6. Assert item transitions to successful state
    await screen.findByText("Uploaded");
    expect(screen.queryByRole("button", { name: /Retry Save/i })).not.toBeInTheDocument();

    // 7. Verify required assertions:
    // - Storage upload was NOT repeated during retry (still called exactly 1 time)
    expect(storageModule.uploadBytesResumable).toHaveBeenCalledTimes(1);

    // - The retry action invoked Firestore setDoc again (now called 2 times)
    expect(firestoreModule.setDoc).toHaveBeenCalledTimes(2);

    // - The retry uses the exact same resource ID, storage path, and metadata (no duplicate created)
    const retryCallArgs = vi.mocked(firestoreModule.setDoc).mock.calls[1];
    expect(retryCallArgs[0].path).toBe(firstCallArgs[0].path);
    expect(retryCallArgs[0].path).toBe(`resources/${initialResourceId}`);
    expect(retryCallArgs[1].id).toBe(initialResourceId);
    expect(retryCallArgs[1].storagePath).toBe(initialStoragePath);
    expect(retryCallArgs[1].storagePath).toBe(`materials/${initialResourceId}/lecture1.pdf`);
    expect(retryCallArgs[1].fileName).toBe("lecture1.pdf");
    expect(retryCallArgs[1].fileSizeBytes).toBe(file.size);
    expect(retryCallArgs[1].fileType).toBe("application/pdf");
    expect(retryCallArgs[1].fileExtension).toBe("pdf");
    expect(retryCallArgs[1].isPublished).toBe(false);
    expect(retryCallArgs[1].createdBy).toBe("admin-uid-1");

    // onUploadComplete was triggered upon successful retry
    expect(onUploadComplete).toHaveBeenCalled();
  });

  it("remains recoverable in error state if metadata retry fails again", async () => {
    // 1. Setup mocks: Storage succeeds, Firestore setDoc fails both times
    vi.mocked(storageModule.uploadBytesResumable).mockImplementation(() => {
      return {
        on: vi.fn((_event, progressCb, _errorCb, completeCb) => {
          if (progressCb) {
            progressCb({ bytesTransferred: 2048, totalBytes: 2048 });
          }
          if (completeCb) {
            completeCb();
          }
        }),
        cancel: vi.fn(),
      } as any;
    });

    vi.mocked(firestoreModule.setDoc)
      .mockRejectedValueOnce(new Error("Initial Firestore failure"))
      .mockRejectedValueOnce(new Error("Second Firestore failure on retry"));

    render(
      <FileUploadModal isOpen={true} onClose={vi.fn()} />
    );

    const file = new File(["Syllabus content"], "syllabus.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const user = userEvent.setup();
    const uploadButton = screen.getByRole("button", { name: /Upload\s*\(1\)/i });
    await user.click(uploadButton);

    // Initial failure displays "Retry Save"
    const retryButton = await screen.findByRole("button", { name: /Retry Save/i });
    expect(retryButton).toBeInTheDocument();
    expect(storageModule.uploadBytesResumable).toHaveBeenCalledTimes(1);
    expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);

    // User clicks "Retry Save", but retry also fails
    await user.click(retryButton);

    // Item must remain in error state with "Retry Save" button still available and interactive
    await waitFor(() => {
      expect(
        screen.getByText(/File uploaded to storage, but failed to save metadata\. Click retry to complete\./i)
      ).toBeInTheDocument();
    });

    const persistentRetryButton = screen.getByRole("button", { name: /Retry Save/i });
    expect(persistentRetryButton).toBeInTheDocument();
    expect(persistentRetryButton).not.toBeDisabled();

    // Storage was STILL only called once (never repeated)
    expect(storageModule.uploadBytesResumable).toHaveBeenCalledTimes(1);
    // Firestore setDoc was called twice
    expect(firestoreModule.setDoc).toHaveBeenCalledTimes(2);

    // Never transitioned to uploaded / success
    expect(screen.queryByText("Uploaded")).not.toBeInTheDocument();
  });
});
