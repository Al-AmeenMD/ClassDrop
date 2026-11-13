import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { StudentPortal } from "../../src/pages/StudentPortal";
import * as firestoreModule from "firebase/firestore";

vi.mock("../../src/lib/firebase", () => ({
  db: {},
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, coll) => ({ path: coll })),
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  query: vi.fn((coll) => coll),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
}));

describe("Student Portal (Zero-Auth Public Access)", () => {
  let settingsCallback: any;
  let resourcesCallback: any;
  let resourcesErrorCallback: any;

  const mockPublicResources = [
    {
      id: "pub-res-1",
      title: "Lecture 1: Introduction to Computer Systems",
      description: "Architecture overview and processor pipelines",
      fileType: "application/pdf",
      fileExtension: "pdf",
      fileSize: 2097152,
      publishedAt: { toDate: () => new Date("2026-09-01T10:00:00Z") },
    },
    {
      id: "pub-res-2",
      title: "Lab 1 Starter Code Documentation",
      description: "Setup guide and compiler instructions",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileExtension: "docx",
      fileSize: 524288,
      publishedAt: { toDate: () => new Date("2026-09-02T14:30:00Z") },
    },
    {
      id: "pub-res-3",
      title: "Dataset Samples 2026",
      description: "Tabular benchmarks for lab assignment",
      fileType: "text/csv",
      fileExtension: "csv",
      fileSize: 1048576,
      publishedAt: { toDate: () => new Date("2026-09-03T09:15:00Z") },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(firestoreModule.onSnapshot).mockImplementation(
      (queryOrRef: any, onNext: any, onError?: any) => {
        if (queryOrRef.path === "settings/classroom") {
          settingsCallback = onNext;
        } else if (queryOrRef.path === "public_resources") {
          resourcesCallback = onNext;
          resourcesErrorCallback = onError;
        }
        return () => {};
      }
    );
  });

  const renderPortal = (initialEntries = ["/"]) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <StudentPortal />
      </MemoryRouter>
    );
  };

  it("subscribes strictly to /public_resources and /settings/classroom (never private /resources)", () => {
    renderPortal();

    expect(firestoreModule.collection).toHaveBeenCalledWith(
      expect.anything(),
      "public_resources"
    );
    expect(firestoreModule.collection).not.toHaveBeenCalledWith(
      expect.anything(),
      "resources"
    );
    expect(firestoreModule.doc).toHaveBeenCalledWith(
      expect.anything(),
      "settings",
      "classroom"
    );
    expect(firestoreModule.doc).not.toHaveBeenCalledWith(
      expect.anything(),
      "admins",
      expect.anything()
    );
  });

  it("renders classroom title, description, and list of published materials without authentication", () => {
    renderPortal();

    // Emit classroom settings
    act(() => {
      settingsCallback({
        exists: () => true,
        data: () => ({
          title: "CS 101: Systems Programming",
          description: "Fall 2026 course repository for lecture slides and assignments.",
        }),
      });
    });

    // Emit public resources
    act(() => {
      resourcesCallback({
        forEach: (fn: any) => {
          mockPublicResources.forEach((res) => {
            fn({ id: res.id, data: () => res });
          });
        },
      });
    });

    expect(screen.getByText("CS 101: Systems Programming")).toBeInTheDocument();
    expect(
      screen.getByText("Fall 2026 course repository for lecture slides and assignments.")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Lecture 1: Introduction to Computer Systems")
    ).toBeInTheDocument();
    expect(screen.getByText("Lab 1 Starter Code Documentation")).toBeInTheDocument();
    expect(screen.getByText("Dataset Samples 2026")).toBeInTheDocument();

    // Verify format badges and file sizes
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();
    expect(screen.getByText("512.0 KB")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
  });

  it("filters resources by format categories (PDF, DOCX, CSV)", async () => {
    renderPortal();

    act(() => {
      resourcesCallback({
        forEach: (fn: any) => {
          mockPublicResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const user = userEvent.setup();

    // Filter by PDF
    const pdfButton = screen.getByRole("button", { name: /^PDF/i });
    await user.click(pdfButton);

    expect(
      screen.getByText("Lecture 1: Introduction to Computer Systems")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Lab 1 Starter Code Documentation")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Dataset Samples 2026")).not.toBeInTheDocument();

    // Filter by CSV
    const csvButton = screen.getByRole("button", { name: /^CSV/i });
    await user.click(csvButton);

    expect(
      screen.queryByText("Lecture 1: Introduction to Computer Systems")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Dataset Samples 2026")).toBeInTheDocument();

    // Restore All
    const allButton = screen.getByRole("button", { name: /^All/i });
    await user.click(allButton);

    expect(
      screen.getByText("Lecture 1: Introduction to Computer Systems")
    ).toBeInTheDocument();
    expect(screen.getByText("Lab 1 Starter Code Documentation")).toBeInTheDocument();
    expect(screen.getByText("Dataset Samples 2026")).toBeInTheDocument();
  });

  it("filters resources by keyword search query across title and description", async () => {
    renderPortal();

    act(() => {
      resourcesCallback({
        forEach: (fn: any) => {
          mockPublicResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const user = userEvent.setup();
    const searchInput = screen.getByPlaceholderText(/Search materials by title or topic/i);

    // Search by title keyword
    await user.type(searchInput, "Processor");
    expect(
      screen.getByText("Lecture 1: Introduction to Computer Systems")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Lab 1 Starter Code Documentation")
    ).not.toBeInTheDocument();

    // Search by description keyword
    await user.clear(searchInput);
    await user.type(searchInput, "benchmarks");
    expect(screen.getByText("Dataset Samples 2026")).toBeInTheDocument();
    expect(
      screen.queryByText("Lecture 1: Introduction to Computer Systems")
    ).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByTitle("Clear search");
    await user.click(clearBtn);
    expect(
      screen.getByText("Lecture 1: Introduction to Computer Systems")
    ).toBeInTheDocument();
  });

  it("renders empty classroom state when no materials are published", () => {
    renderPortal();

    act(() => {
      resourcesCallback({
        forEach: () => {},
      });
    });

    expect(screen.getByText("No Materials Published Yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Your instructor has not published any learning materials/i)
    ).toBeInTheDocument();
  });

  it("renders connection error state and supports retry", async () => {
    renderPortal();

    act(() => {
      resourcesErrorCallback(new Error("Network timeout"));
    });

    expect(screen.getByText("Connection Problem")).toBeInTheDocument();
    expect(screen.getByText(/Unable to load learning materials/i)).toBeInTheDocument();

    const user = userEvent.setup();
    const retryButton = screen.getByRole("button", { name: /Try Again/i });
    await user.click(retryButton);

    // Verify re-subscription attempted
    expect(firestoreModule.onSnapshot).toHaveBeenCalledTimes(4); // 2 initially + 2 on retry
  });

  it("initiates native download navigation via /api/download/:id when button is clicked", async () => {
    renderPortal();

    act(() => {
      resourcesCallback({
        forEach: (fn: any) => {
          mockPublicResources.forEach((res) => fn({ id: res.id, data: () => res }));
        },
      });
    });

    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");

    const user = userEvent.setup();
    const downloadButtons = screen.getAllByRole("button", {
      name: /Download/i,
    });
    expect(downloadButtons.length).toBe(3);

    await user.click(downloadButtons[0]);

    // Check that an anchor was appended with href targeting /api/download/pub-res-1
    expect(appendChildSpy).toHaveBeenCalled();
    const createdAnchor = appendChildSpy.mock.calls.find((call) => {
      const el = call[0] as HTMLElement;
      return el.tagName === "A" && el.getAttribute("href") === "/api/download/pub-res-1";
    });

    expect(createdAnchor).toBeDefined();
    expect(removeChildSpy).toHaveBeenCalled();

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});

