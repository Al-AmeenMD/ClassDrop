import QRCode from "qrcode";

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

/**
 * Returns the canonical public student portal URL based on the current application origin.
 * Defaults to current origin + "/" without exposing any backend paths or admin state.
 */
export function getPublicClassroomUrl(): string {
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.origin}/`;
  }
  return "/";
}

/**
 * Generates a base64 PNG data URL representing a high-contrast, scannable QR code.
 * Uses error correction level 'M' (15%) or 'Q' (25%) by default to guarantee camera readability.
 */
export async function generateQRCodeDataUrl(
  text: string,
  options?: QRCodeOptions
): Promise<string> {
  return QRCode.toDataURL(text, {
    width: options?.width || 360,
    margin: options?.margin ?? 2,
    errorCorrectionLevel: options?.errorCorrectionLevel || "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

/**
 * Generates a high-resolution branded PNG image data URL suitable for download.
 * Places the unobstructed QR code onto a clean, high-contrast presentation card
 * with ClassDrop institutional typography outside the quiet zone so scan reliability is 100% preserved.
 */
export async function generateDownloadableQRCodeCard(
  url: string,
  classroomTitle?: string
): Promise<string> {
  // Generate high-res raw QR code
  const rawQrDataUrl = await QRCode.toDataURL(url, {
    width: 600,
    margin: 2,
    errorCorrectionLevel: "H",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  if (typeof document === "undefined") {
    return rawQrDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const cardWidth = 720;
      const cardHeight = 880;
      const canvas = document.createElement("canvas");
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(rawQrDataUrl);
        return;
      }

      // Background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cardWidth, cardHeight);

      // Card border
      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, cardWidth - 24, cardHeight - 24);

      // Header Brand
      ctx.fillStyle = "#163A5F";
      ctx.font = "bold 32px Inter, system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ClassDrop", cardWidth / 2, 70);

      // Classroom Title / Subtitle
      ctx.fillStyle = "#64748B";
      ctx.font = "500 18px Inter, system-ui, -apple-system, sans-serif";
      const displayTitle = classroomTitle?.trim() || "Classroom Learning Materials";
      const truncatedTitle =
        displayTitle.length > 40 ? displayTitle.substring(0, 37) + "..." : displayTitle;
      ctx.fillText(truncatedTitle, cardWidth / 2, 105);

      // Unobscured QR Code
      const qrSize = 540;
      const qrX = (cardWidth - qrSize) / 2;
      const qrY = 135;
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      // Caption
      ctx.fillStyle = "#172B4D";
      ctx.font = "600 18px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Scan with smartphone camera to view materials", cardWidth / 2, 720);

      // Public URL
      ctx.fillStyle = "#2563EB";
      ctx.font = "16px monospace, sans-serif";
      const truncatedUrl = url.length > 55 ? url.substring(0, 52) + "..." : url;
      ctx.fillText(truncatedUrl, cardWidth / 2, 755);

      // Subtitle
      ctx.fillStyle = "#64748B";
      ctx.font = "14px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Zero-Auth Student Access · No account or app required", cardWidth / 2, 810);

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      resolve(rawQrDataUrl);
    };
    img.src = rawQrDataUrl;
  });
}

/**
 * Triggers a native browser file download for a base64 data URL.
 */
export function downloadDataUrlAsFile(dataUrl: string, filename: string): void {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

