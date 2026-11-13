import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminDashboard } from "../../src/pages/AdminDashboard";
import * as firestoreModule from "firebase/firestore";
import * as functionsModule from "firebase/functions";

vi.mock("../../src/lib/firebase", () => ({
  db: {},
  functions: {},
  isFirebaseConfigured: true,
}));

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { uid: "admin-uid-1", email: "admin@classdrop.edu" },
    isAdmin: true,
    logout: vi.fn(),
  }),
}));

const mockBatch = {
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, coll) => ({ path: coll })),
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  query: vi.fn((coll) => coll),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  writeBatch: vi.fn(() => mockBatch),
  serverTimestamp: vi.fn(() => "MOCK_TIMESTAMP"),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { success: true } })),
}));

describe("Admin Dashboard & Materials Management (AdminDashboard)", () => {
  let resourcesSnapshotCallback: any;
  let settingsSnapshotCallback: any;

  const sampleResources = [
    {
      id: "res-1",
      title: "Lecture 1: Introduction to Algorithms",
      description: "Introductory slides and complexity analysis",
      fileName: "lecture1.pdf",
      storagePath: "materials/res-1/lecture1.pdf",
      fileType: "application/pdf",
      fileExtension: "pdf",
      fileSizeBytes: 2048576,
      isPublished: true,
      downloadInitiations: 14,
      createdAt: { toDate: () => new Date("2026-09-01") },
      updatedAt: { toDate: () => new Date("2026-09-01") },
      createdBy: "admin-uid-1",
    },
    {
      id: "res-2",
      title: "Lab 1 Assignment Sheet",
      description: "Draft instructions",
      fileName: "lab1.docx",
      storagePath: "materials/res-2/lab1.docx",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileExtension: "docx",
      fileSizeBytes: 512000,
      isPublished: false,
      downloadInitiations: 0,
      createdAt: { toDate: () => new Date("2026-09-05") },
      updatedAt: { toDate: () => new Date("2026-09-05") },
      createdBy: "admin-uid-1",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(firestoreModule.onSnapshot).mockImplementation((queryOrRef: any, onNext: any) => {
      if (queryOrRef.path === "settings/classroom") {
        settingsSnapshotCallback = onNext;
      } else {
        resourcesSnapshotCallback = onNext;
      }
      return () => {};
    });
  });

  const renderDashboard = () => {
    return render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
  };

  it("renders materials table and updates list from live Firestore subscription", async () => {
    renderDashboard();

    expect(screen.getByText("Facilitator Administration")).toBeInTheDocument();

    // Emit live Firestore resources
    act(() => {
      resourcesSnapshotCallback({
        forEach: (fn: any) => {
          sampleResources.forEach((res) => {
            fn({ id: res.id, data: () => res });
          });
        },
      });
    });

    expect(screen.getByText("Lecture 1: Introduction to Algorithms")).toBeInTheDocument();
    expect(screen.getByText("Lab 1 Assignment Sheet")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("filters materials by status tabs (all, published, draft)", async () => {
    renderDashboard();

    act(() => {
      resourcesSnapshotCallback({
        forEach: (fn: any) => {
          sampleResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const user = userEvent.setup();

    // Click 'Published' filter tab
    const publishedTab = screen.getByRole("button", { name: /^Published/i });
    await user.click(publishedTab);

    expect(screen.getByText("Lecture 1: Introduction to Algorithms")).toBeInTheDocument();
    expect(screen.queryByText("Lab 1 Assignment Sheet")).not.toBeInTheDocument();

    // Click 'Draft' filter tab
    const draftTab = screen.getByRole("button", { name: /^Draft/i });
    await user.click(draftTab);

    expect(screen.queryByText("Lecture 1: Introduction to Algorithms")).not.toBeInTheDocument();
    expect(screen.getByText("Lab 1 Assignment Sheet")).toBeInTheDocument();
  });

  it("filters materials by keyword search in title, description, or filename", async () => {
    renderDashboard();

    act(() => {
      resourcesSnapshotCallback({
        forEach: (fn: any) => {
          sampleResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const user = userEvent.setup();
    const searchInput = screen.getByPlaceholderText(/Search by title or filename/i);

    await user.type(searchInput, "Algorithms");
    expect(screen.getByText("Lecture 1: Introduction to Algorithms")).toBeInTheDocument();
    expect(screen.queryByText("Lab 1 Assignment Sheet")).not.toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, "lab1.docx");
    expect(screen.queryByText("Lecture 1: Introduction to Algorithms")).not.toBeInTheDocument();
    expect(screen.getByText("Lab 1 Assignment Sheet")).toBeInTheDocument();
  });

  it("publishes draft material with atomic Firestore batch update and public resource sync", async () => {
    renderDashboard();

    act(() => {
      resourcesSnapshotCallback({
        forEach: (fn: any) => {
          sampleResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const user = userEvent.setup();

    // Find publish button for Lab 1 (Draft material)
    const publishButton = screen.getByTitle("Publish to students");
    await user.click(publishButton);

    expect(firestoreModule.writeBatch).toHaveBeenCalled();
    expect(mockBatch.update).toHaveBeenCalled();
    expect(mockBatch.set).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it("unpublishes published material with atomic Firestore batch update and public record deletion", async () => {
    renderDashboard();

    act(() => {
      resourcesSnapshotCallback({
        forEach: (fn: any) => {
          sampleResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const user = userEvent.setup();

    // Find unpublish button for Lecture 1 (Published material)
    const unpublishButton = screen.getByTitle("Revoke student access");
    await user.click(unpublishButton);

    expect(firestoreModule.writeBatch).toHaveBeenCalled();
    expect(mockBatch.update).toHaveBeenCalled();
    expect(mockBatch.delete).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it("opens edit modal when edit button is clicked", async () => {
    renderDashboard();

    act(() => {
      resourcesSnapshotCallback({
        forEach: (fn: any) => {
          sampleResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const user = userEvent.setup();
    const editButtons = screen.getAllByTitle("Edit title & description");
    await user.click(editButtons[0]);

    expect(screen.getByText(/Edit Learning Material Details/i)).toBeInTheDocument();
  });

  it("opens delete confirmation modal and triggers server-side deletion", async () => {
    renderDashboard();

    act(() => {
      resourcesSnapshotCallback({
        forEach: (fn: any) => {
          sampleResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const user = userEvent.setup();
    const deleteButtons = screen.getAllByTitle("Delete permanently");
    await user.click(deleteButtons[0]);

    expect(screen.getByText("Delete Learning Material")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to permanently delete/i)).toBeInTheDocument();

    const confirmDeleteBtn = screen.getByRole("button", { name: "Confirm Delete" });
    await user.click(confirmDeleteBtn);

    expect(functionsModule.httpsCallable).toHaveBeenCalledWith(expect.anything(), "deleteResource");
  });
});
