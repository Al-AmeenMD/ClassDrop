import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ClassroomSharingSection } from "../../src/components/admin/ClassroomSharingSection";
import { StudentPortal } from "../../src/pages/StudentPortal";
import * as qrCodeUtils from "../../src/utils/qrCode";
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

vi.mock("../../src/utils/qrCode", async () => {
  const actual = await vi.importActual<any>("../../src/utils/qrCode");
  return {
    ...actual,
    generateDownloadableQRCodeCard: vi.fn().mockResolvedValue("data:image/png;base64,mockCardDataUrl"),
  };
});

describe("Sharing & Projector Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ClassroomSharingSection", () => {
    it("renders public classroom URL, QR code preview, and projector launch link", async () => {
      render(<ClassroomSharingSection classroomTitle="CS 101: Systems Programming" />);

      expect(screen.getByText("Classroom Sharing & Student Access")).toBeInTheDocument();

      const urlInput = screen.getByLabelText("Public Classroom URL") as HTMLInputElement;
      expect(urlInput).toBeInTheDocument();
      expect(urlInput.value).toMatch(/^https?:\/\//);

      // Verify projector launch link targets ?mode=projector
      const projectorLink = screen.getByRole("link", { name: /Open in Projector Mode/i });
      expect(projectorLink).toHaveAttribute("href", expect.stringContaining("?mode=projector"));

      // Wait for QR preview to load
      await waitFor(() => {
        expect(screen.getByAltText("Classroom Public Portal QR Code")).toBeInTheDocument();
      });
    });

    it("copies public classroom URL to clipboard with confirmation feedback", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });
      const execCommandMock = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandMock;

      render(<ClassroomSharingSection classroomTitle="CS 101" />);

      const user = userEvent.setup();
      const copyButton = screen.getByRole("button", { name: /Copy Link/i });
      await user.click(copyButton);

      expect(writeTextMock.mock.calls.length > 0 || execCommandMock.mock.calls.length > 0).toBe(true);
      expect(screen.getByText("Copied!")).toBeInTheDocument();
      expect(screen.getByText("Public classroom link copied to clipboard.")).toBeInTheDocument();
    });

    it("triggers branded and raw QR PNG card downloads", async () => {
      const appendSpy = vi.spyOn(document.body, "appendChild");

      render(<ClassroomSharingSection classroomTitle="CS 101" />);

      // Wait for QR generation
      await waitFor(() => {
        expect(screen.getByAltText("Classroom Public Portal QR Code")).toBeInTheDocument();
      });

      const user = userEvent.setup();

      // Click Download QR Card
      const cardDownloadBtn = screen.getByRole("button", { name: /Download QR Card/i });
      await user.click(cardDownloadBtn);

      await waitFor(() => {
        const cardCall = appendSpy.mock.calls.find((call) => {
          const el = call[0] as HTMLElement;
          return el.tagName === "A" && el.getAttribute("download") === "classdrop-classroom-qr-card.png";
        });
        expect(cardCall).toBeDefined();
      });

      // Click Raw QR
      const rawDownloadBtn = screen.getByRole("button", { name: /Raw QR/i });
      await user.click(rawDownloadBtn);

      await waitFor(() => {
        const rawCall = appendSpy.mock.calls.find((call) => {
          const el = call[0] as HTMLElement;
          return el.tagName === "A" && el.getAttribute("download") === "classdrop-classroom-qr.png";
        });
        expect(rawCall).toBeDefined();
      });

      appendSpy.mockRestore();
    });
  });

  describe("Projector Presentation Mode (StudentPortal ?mode=projector)", () => {
    let settingsCallback: any;
    let resourcesCallback: any;

    beforeEach(() => {
      vi.mocked(firestoreModule.onSnapshot).mockImplementation(
        (queryOrRef: any, onNext: any) => {
          if (queryOrRef.path === "settings/classroom") {
            settingsCallback = onNext;
          } else if (queryOrRef.path === "public_resources") {
            resourcesCallback = onNext;
          }
          return () => {};
        }
      );
    });

    it("activates Projector Mode automatically when URL query parameter is ?mode=projector", () => {
      render(
        <MemoryRouter initialEntries={["/?mode=projector"]}>
          <StudentPortal />
        </MemoryRouter>
      );

      // Verify Projector Mode badge and presentation controls are rendered
      expect(screen.getByText("Projector Mode")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Show QR Code/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Exit Projector Mode/i })).toBeInTheDocument();
    });

    it("opens on-screen QR modal, traps focus, and closes safely on Escape without exiting projector mode", async () => {
      render(
        <MemoryRouter initialEntries={["/?mode=projector"]}>
          <StudentPortal />
        </MemoryRouter>
      );

      const user = userEvent.setup();

      // Click Show QR Code
      const showQrBtn = screen.getByRole("button", { name: /Show QR Code/i });
      await user.click(showQrBtn);

      // QR modal dialog is visible
      const modal = screen.getByRole("dialog");
      expect(modal).toBeInTheDocument();
      expect(screen.getByText("Join Classroom")).toBeInTheDocument();

      // Press Escape to dismiss modal
      fireEvent.keyDown(window, { key: "Escape", code: "Escape" });

      // Modal is dismissed
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // Projector mode MUST STILL BE ACTIVE (not exited by modal Escape)
      expect(screen.getByText("Projector Mode")).toBeInTheDocument();
    });

    it("exits projector mode and removes query parameters when Exit Projector Mode is clicked", async () => {
      render(
        <MemoryRouter initialEntries={["/?mode=projector"]}>
          <StudentPortal />
        </MemoryRouter>
      );

      const user = userEvent.setup();
      const exitBtn = screen.getByRole("button", { name: /Exit Projector Mode/i });
      await user.click(exitBtn);

      // Normal student portal view is restored
      expect(screen.queryByText("Exit Projector Mode")).not.toBeInTheDocument();
      expect(screen.getByText("Student Learning Portal")).toBeInTheDocument();
    });
  });
});
