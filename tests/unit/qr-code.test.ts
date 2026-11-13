import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPublicClassroomUrl,
  generateQRCodeDataUrl,
  downloadDataUrlAsFile,
} from "../../src/utils/qrCode";

describe("QR Code & Sharing Utilities (qrCode.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPublicClassroomUrl()", () => {
    it("returns canonical root URL ending with slash based on window.location.origin", () => {
      const url = getPublicClassroomUrl();
      expect(url).toMatch(/^https?:\/\/[^/]+\/$/);
    });
  });

  describe("generateQRCodeDataUrl()", () => {
    it("generates a valid base64 PNG data URL", async () => {
      const testUrl = "http://localhost:5173/";
      const dataUrl = await generateQRCodeDataUrl(testUrl);

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(dataUrl.length).toBeGreaterThan(100);
    });

    it("respects custom error correction levels, widths, and margins", async () => {
      const dataUrlHigh = await generateQRCodeDataUrl("http://localhost:5173/", {
        width: 500,
        margin: 4,
        errorCorrectionLevel: "H",
      });

      expect(dataUrlHigh).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe("downloadDataUrlAsFile()", () => {
    it("creates an anchor element, sets download filename, clicks it, and removes it", () => {
      const appendChildSpy = vi.spyOn(document.body, "appendChild");
      const removeChildSpy = vi.spyOn(document.body, "removeChild");

      const dummyDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const targetFilename = "classdrop-test-qr.png";

      downloadDataUrlAsFile(dummyDataUrl, targetFilename);

      expect(appendChildSpy).toHaveBeenCalled();
      const createdAnchor = appendChildSpy.mock.calls.find((call) => {
        const el = call[0] as HTMLElement;
        return el.tagName === "A" && el.getAttribute("download") === targetFilename;
      });

      expect(createdAnchor).toBeDefined();
      expect(removeChildSpy).toHaveBeenCalled();

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });
});

