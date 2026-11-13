import { describe, it, expect } from "vitest";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  getFileExtension,
  formatFileSize,
  formatDisplayDate,
  validateFile,
  EXTENSION_TO_CANONICAL_MIME,
  ACCEPTED_MIMES_BY_EXTENSION,
  GENERIC_MIME_TYPES,
} from "../../src/utils/fileValidation";

describe("File Validation & Formatting Utilities", () => {
  describe("Allowed Extensions & MIME Mappings", () => {
    it("contains exactly the 10 approved institutional file extensions", () => {
      const expected = ["pdf", "docx", "xlsx", "pptx", "csv", "txt", "zip", "png", "jpg", "jpeg"];
      expect(ALLOWED_EXTENSIONS).toEqual(expected);
    });

    it("maps each extension to a valid canonical MIME type accepted by storage.rules", () => {
      ALLOWED_EXTENSIONS.forEach((ext) => {
        const mime = EXTENSION_TO_CANONICAL_MIME[ext];
        expect(mime).toBeDefined();
        expect(typeof mime).toBe("string");
        expect(mime.length).toBeGreaterThan(0);
      });
    });

    it("recognizes accepted browser MIME variations including generic types", () => {
      expect(ACCEPTED_MIMES_BY_EXTENSION.xlsx).toContain("application/vnd.ms-excel");
      expect(ACCEPTED_MIMES_BY_EXTENSION.csv).toContain("text/plain");
      expect(ACCEPTED_MIMES_BY_EXTENSION.zip).toContain("application/x-zip-compressed");
      expect(GENERIC_MIME_TYPES).toContain("application/octet-stream");
    });
  });

  describe("getFileExtension()", () => {
    it("correctly extracts standard file extensions in lowercase", () => {
      expect(getFileExtension("syllabus.pdf")).toBe("pdf");
      expect(getFileExtension("SLIDES.PPTX")).toBe("pptx");
      expect(getFileExtension("data.sheet.XLSX")).toBe("xlsx");
    });

    it("returns empty string for files without extension or trailing dots", () => {
      expect(getFileExtension("Makefile")).toBe("");
      expect(getFileExtension("notes.")).toBe("");
      expect(getFileExtension("")).toBe("");
    });
  });

  describe("formatFileSize()", () => {
    it("formats 0 and negative bytes as 0 B", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(-10)).toBe("0 B");
    });

    it("formats bytes (< 1024) with B unit", () => {
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("formats kilobytes (< 1MB) with KB unit", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(2048)).toBe("2.0 KB");
      expect(formatFileSize(500 * 1024)).toBe("500.0 KB");
    });

    it("formats megabytes with MB unit", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
      expect(formatFileSize(15.5 * 1024 * 1024)).toBe("15.5 MB");
      expect(formatFileSize(MAX_FILE_SIZE_BYTES)).toBe("50.0 MB");
    });
  });

  describe("formatDisplayDate()", () => {
    it("formats null or undefined timestamp safely", () => {
      expect(formatDisplayDate(null)).toBe("—");
      expect(formatDisplayDate(undefined)).toBe("—");
    });

    it("formats Firestore Timestamp with toDate() method", () => {
      const mockTimestamp = {
        toDate: () => new Date("2026-09-15T10:30:00Z"),
      };
      const formatted = formatDisplayDate(mockTimestamp);
      expect(formatted).toContain("2026");
    });

    it("formats standard Date objects and numeric timestamps", () => {
      const date = new Date("2026-10-01T08:00:00Z");
      expect(formatDisplayDate(date)).toContain("2026");
      expect(formatDisplayDate(date.getTime())).toContain("2026");
    });
  });

  describe("validateFile()", () => {
    it("accepts valid PDF file under 50MB", () => {
      const file = new File([new Uint8Array(1024)], "lecture1.pdf", {
        type: "application/pdf",
      });
      const result = validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.resolvedMimeType).toBe("application/pdf");
    });

    it("accepts valid image file (PNG / JPEG)", () => {
      const pngFile = new File([new Uint8Array(2048)], "diagram.png", {
        type: "image/png",
      });
      expect(validateFile(pngFile).valid).toBe(true);

      const jpgFile = new File([new Uint8Array(2048)], "photo.jpg", {
        type: "image/jpeg",
      });
      expect(validateFile(jpgFile).valid).toBe(true);
    });

    it("resolves generic/missing MIME types when extension is valid", () => {
      const file = new File([new Uint8Array(1024)], "spreadsheet.xlsx", {
        type: "", // Browser failed to detect MIME
      });
      const result = validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.resolvedMimeType).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    });

    it("rejects 0-byte files", () => {
      const emptyFile = new File([], "empty.pdf", {
        type: "application/pdf",
      });
      const result = validateFile(emptyFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty (0 bytes)");
    });

    it("rejects files exceeding 50MB exactly", () => {
      // Create fake File with size property exceeding limit
      const oversizedFile = new File([new Uint8Array(100)], "huge_video.pdf", {
        type: "application/pdf",
      });
      Object.defineProperty(oversizedFile, "size", {
        value: MAX_FILE_SIZE_BYTES + 1,
      });

      const result = validateFile(oversizedFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds the 50MB limit");
    });

    it("rejects disallowed extensions (e.g. .exe, .sh, .js, .html)", () => {
      const exe = new File([new Uint8Array(1024)], "setup.exe", {
        type: "application/x-msdownload",
      });
      expect(validateFile(exe).valid).toBe(false);
      expect(validateFile(exe).error).toContain("Unsupported file type (.exe)");

      const script = new File([new Uint8Array(1024)], "hack.sh", {
        type: "text/x-sh",
      });
      expect(validateFile(script).valid).toBe(false);
    });

    it("rejects MIME mismatch when file extension does not match content type", () => {
      // Renamed executable pretending to be PDF
      const spoofed = new File([new Uint8Array(1024)], "trojan.pdf", {
        type: "application/x-msdownload",
      });
      const result = validateFile(spoofed);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not match the expected format for .pdf files");
    });
  });
});
