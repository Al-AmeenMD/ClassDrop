import React, { useState, useEffect, useCallback } from "react";
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Download,
  Presentation,
  Loader2,
  AlertCircle,
  Eye,
} from "lucide-react";
import {
  getPublicClassroomUrl,
  generateQRCodeDataUrl,
  generateDownloadableQRCodeCard,
  downloadDataUrlAsFile,
} from "../../utils/qrCode";

interface ClassroomSharingSectionProps {
  classroomTitle?: string;
}

export const ClassroomSharingSection: React.FC<ClassroomSharingSectionProps> = ({
  classroomTitle,
}) => {
  const [classroomUrl, setClassroomUrl] = useState<string>("");
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(true);
  const [qrError, setQrError] = useState<string | null>(null);

  // Copy feedback state
  const [copied, setCopied] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Download state
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Initialize public URL and QR code preview
  useEffect(() => {
    const url = getPublicClassroomUrl();
    setClassroomUrl(url);

    let isMounted = true;
    setIsGeneratingQr(true);
    setQrError(null);

    generateQRCodeDataUrl(url, { width: 280, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (isMounted) {
          setQrPreviewUrl(dataUrl);
          setIsGeneratingQr(false);
        }
      })
      .catch((err) => {
        console.error("Failed to generate QR code preview:", err);
        if (isMounted) {
          setQrError("Could not generate QR code preview.");
          setIsGeneratingQr(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Copy to clipboard with legacy fallback
  const handleCopyLink = useCallback(async () => {
    if (!classroomUrl) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(classroomUrl);
      } else {
        // Fallback for non-secure contexts or legacy browsers
        const textArea = document.createElement("textarea");
        textArea.value = classroomUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!successful) throw new Error("Clipboard copy command was rejected");
      }

      setCopied(true);
      setCopyFeedback({
        type: "success",
        message: "Public classroom link copied to clipboard.",
      });

      setTimeout(() => {
        setCopied(false);
        setCopyFeedback(null);
      }, 3500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
      setCopyFeedback({
        type: "error",
        message: "Unable to copy automatically. Please copy the link manually.",
      });
      setTimeout(() => {
        setCopyFeedback(null);
      }, 4500);
    }
  }, [classroomUrl]);

  // Download Branded Presentation QR Card (PNG)
  const handleDownloadBrandedQr = async () => {
    if (!classroomUrl || isDownloading) return;
    setIsDownloading(true);

    try {
      const cardDataUrl = await generateDownloadableQRCodeCard(classroomUrl, classroomTitle);
      downloadDataUrlAsFile(cardDataUrl, "classdrop-classroom-qr-card.png");
    } catch (err) {
      console.error("Failed to generate branded QR card:", err);
      // Fallback to raw QR code download if card generation encounters an issue
      if (qrPreviewUrl) {
        downloadDataUrlAsFile(qrPreviewUrl, "classdrop-classroom-qr.png");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // Download Raw QR Code (PNG)
  const handleDownloadRawQr = async () => {
    if (!classroomUrl || isDownloading) return;
    setIsDownloading(true);

    try {
      const rawDataUrl = await generateQRCodeDataUrl(classroomUrl, {
        width: 1024,
        margin: 2,
        errorCorrectionLevel: "H",
      });
      downloadDataUrlAsFile(rawDataUrl, "classdrop-classroom-qr.png");
    } catch (err) {
      console.error("Failed to generate raw QR PNG:", err);
      if (qrPreviewUrl) {
        downloadDataUrlAsFile(qrPreviewUrl, "classdrop-classroom-qr.png");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section
      aria-labelledby="sharing-section-title"
      className="border border-brand-border rounded-lg bg-brand-white p-5 sm:p-6 mb-8 shadow-xs"
    >
      {/* Section Header */}
      <div className="flex items-center space-x-2.5 pb-4 border-b border-brand-border">
        <div className="w-8 h-8 rounded bg-brand-light-blue text-brand-royal-blue flex items-center justify-center flex-shrink-0">
          <Share2 className="w-4 h-4" />
        </div>
        <div>
          <h2
            id="sharing-section-title"
            className="text-base font-bold text-brand-dark-navy tracking-tight"
          >
            Classroom Sharing & Student Access
          </h2>
          <p className="text-xs text-brand-slate mt-0.5">
            Share this link or QR code with students. Materials are accessed directly without
            student logins or registration.
          </p>
        </div>
      </div>

      {/* Copy / Action Feedback Message */}
      {copyFeedback && (
        <div
          role="status"
          className={`mt-4 p-3 rounded-md border text-xs flex items-center space-x-2 transition-all ${
            copyFeedback.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {copyFeedback.type === "success" ? (
            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          <span className="font-medium">{copyFeedback.message}</span>
        </div>
      )}

      {/* Grid: Link Management (Left) + QR Code (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5 items-start">
        {/* Left Column: Shareable URL & Actions */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          <div>
            <label
              htmlFor="classroom-public-url"
              className="text-xs font-semibold uppercase tracking-wider text-brand-slate block mb-1.5"
            >
              Public Classroom URL
            </label>
            <div className="flex items-center space-x-2">
              <input
                id="classroom-public-url"
                type="text"
                readOnly
                value={classroomUrl}
                aria-label="Public Classroom URL"
                className="w-full font-mono text-xs text-brand-dark-navy bg-brand-off-white border border-brand-border rounded-md px-3 py-2 select-all focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/30 focus:bg-brand-white transition-colors"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`inline-flex items-center justify-center px-3.5 py-2 text-xs font-medium rounded-md border transition-colors flex-shrink-0 ${
                  copied
                    ? "bg-green-50 border-green-300 text-green-700 font-semibold"
                    : "bg-brand-royal-blue hover:bg-blue-700 text-brand-white border-transparent shadow-xs"
                }`}
                title="Copy public URL to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-green-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <a
              href={classroomUrl || "/"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-brand-dark-navy bg-brand-white hover:bg-brand-off-white border border-brand-border rounded-md shadow-xs transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-brand-slate" />
              Open Student Portal
            </a>

            <a
              href={`${classroomUrl || "/"}?mode=projector`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-brand-deep-blue bg-brand-light-blue hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
            >
              <Presentation className="w-3.5 h-3.5 mr-1.5 text-brand-royal-blue" />
              Open in Projector Mode
            </a>
          </div>

          {/* Architecture / Zero-Auth Notice */}
          <div className="bg-brand-off-white/80 border border-brand-border rounded-md p-3 text-xs text-brand-slate leading-relaxed">
            <div className="flex items-start space-x-2">
              <Eye className="w-4 h-4 text-brand-royal-blue flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-brand-dark-navy">Student Access Policy: </span>
                Students connect to this public URL directly. They do not require Google accounts,
                passwords, or app installations to view and download published materials.
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: QR Code Preview & Download */}
        <div className="lg:col-span-5 border border-brand-border rounded-md p-4 bg-brand-off-white/40 flex flex-col items-center text-center">
          <div className="flex items-center space-x-1.5 mb-2.5 self-start sm:self-center">
            <QrCode className="w-4 h-4 text-brand-royal-blue" />
            <span className="text-xs font-semibold text-brand-dark-navy uppercase tracking-wider">
              Classroom QR Code
            </span>
          </div>

          {/* QR Code Canvas Preview Container */}
          <div className="w-48 h-48 sm:w-52 sm:h-52 bg-brand-white border border-brand-border rounded-lg p-2.5 flex items-center justify-center shadow-xs">
            {isGeneratingQr ? (
              <div className="flex flex-col items-center space-y-2 text-xs text-brand-slate">
                <Loader2 className="w-5 h-5 text-brand-royal-blue animate-spin" />
                <span>Generating QR...</span>
              </div>
            ) : qrError ? (
              <div className="p-3 text-center text-xs text-red-600">
                <AlertCircle className="w-5 h-5 mx-auto text-red-500 mb-1" />
                <span>{qrError}</span>
              </div>
            ) : qrPreviewUrl ? (
              <img
                src={qrPreviewUrl}
                alt="Classroom Public Portal QR Code"
                className="w-full h-full object-contain block"
              />
            ) : null}
          </div>

          <p className="text-[11px] text-brand-slate mt-2 max-w-xs">
            Readable by standard iOS and Android camera apps.
          </p>

          {/* Download Options */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-3 w-full">
            <button
              type="button"
              onClick={handleDownloadBrandedQr}
              disabled={isDownloading || !qrPreviewUrl}
              className="w-full sm:w-auto inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-brand-white bg-brand-royal-blue hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 rounded-md shadow-xs transition-colors"
              title="Download presentation-ready PNG card"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 mr-1.5" />
              )}
              Download QR Card (PNG)
            </button>

            <button
              type="button"
              onClick={handleDownloadRawQr}
              disabled={isDownloading || !qrPreviewUrl}
              className="w-full sm:w-auto inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-brand-slate hover:text-brand-dark-navy bg-brand-white hover:bg-brand-off-white border border-brand-border disabled:opacity-50 rounded-md transition-colors"
              title="Download pure high-resolution QR code PNG"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Raw QR
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClassroomSharingSection;

