import React, { useState, useEffect, useRef } from "react";
import {
  Minimize2,
  Maximize2,
  Search,
  Download,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  File,
  Loader2,
  QrCode,
  X,
  BookOpen,
} from "lucide-react";
import { PublicResource, ClassroomSettings } from "../../types/database";
import { formatFileSize, formatDisplayDate } from "../../utils/fileValidation";
import { getPublicClassroomUrl, generateQRCodeDataUrl } from "../../utils/qrCode";

interface ProjectorViewProps {
  classroomSettings: ClassroomSettings | null;
  resources: PublicResource[];
  totalPublishedCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedFormat: string;
  setSelectedFormat: (format: string) => void;
  availableFormats: string[];
  onDownload: (resource: PublicResource) => void;
  downloadingId: string | null;
  onExit: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const ProjectorView: React.FC<ProjectorViewProps> = ({
  classroomSettings,
  resources,
  totalPublishedCount,
  searchQuery,
  setSearchQuery,
  selectedFormat,
  setSelectedFormat,
  availableFormats,
  onDownload,
  downloadingId,
  onExit,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const classroomUrl = getPublicClassroomUrl();

  // Accessibility refs for QR modal focus containment and restoration
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus trap, focus restoration, and modal-specific Escape handling
  useEffect(() => {
    if (!showQrModal) return;

    // Move keyboard focus into the modal when opened
    const focusTimer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 40);

    const handleModalKeyDown = (e: KeyboardEvent) => {
      // 1. Escape key: Close ONLY the modal, preventing projector mode exit
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setShowQrModal(false);
        return;
      }

      // 2. Tab key: Keep keyboard focus trapped inside the modal
      if (e.key === "Tab" && modalContainerRef.current) {
        const focusableElements = modalContainerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            document.activeElement === modalContainerRef.current
          ) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    // Attach in capture phase so Escape is handled before parent/window handlers
    window.addEventListener("keydown", handleModalKeyDown, true);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleModalKeyDown, true);
      // Return focus to the trigger button when the modal closes
      triggerButtonRef.current?.focus();
    };
  }, [showQrModal]);

  // Generate QR code for on-screen scanning
  useEffect(() => {
    let isMounted = true;
    generateQRCodeDataUrl(classroomUrl, { width: 400, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (isMounted) setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error("Failed to generate projector QR code:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [classroomUrl]);

  const getFormatIcon = (ext: string) => {
    const lower = ext.toLowerCase();
    switch (lower) {
      case "pdf":
        return <FileText className="w-6 h-6 text-red-600" />;
      case "docx":
      case "txt":
        return <FileText className="w-6 h-6 text-brand-royal-blue" />;
      case "xlsx":
      case "csv":
        return <FileSpreadsheet className="w-6 h-6 text-green-600" />;
      case "pptx":
        return <FileText className="w-6 h-6 text-orange-600" />;
      case "zip":
        return <FileArchive className="w-6 h-6 text-amber-600" />;
      case "png":
      case "jpg":
      case "jpeg":
        return <ImageIcon className="w-6 h-6 text-purple-600" />;
      default:
        return <File className="w-6 h-6 text-brand-slate" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-brand-white flex flex-col overflow-y-auto selection:bg-brand-royal-blue selection:text-brand-white">
      {/* Top Presentation Bar: High-contrast, minimal, zero administrative clutter */}
      <header className="sticky top-0 z-30 bg-brand-white/95 backdrop-blur-xs border-b border-brand-border px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded bg-brand-deep-blue text-brand-white font-bold flex items-center justify-center text-sm shadow-xs">
            CD
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base text-brand-deep-blue tracking-tight">
                ClassDrop
              </span>
              <span className="inline-flex items-center text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-brand-deep-blue border border-blue-200">
                Projector Mode
              </span>
            </div>
            <span className="text-xs text-brand-slate font-medium hidden sm:inline-block">
              {classroomUrl}
            </span>
          </div>
        </div>

        {/* Presentation Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Toggle On-Screen QR Code for students to scan off the projector */}
          <button
            ref={triggerButtonRef}
            type="button"
            onClick={() => setShowQrModal(true)}
            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-brand-deep-blue bg-brand-light-blue hover:bg-blue-100 border border-blue-200 rounded-md transition-colors shadow-xs"
            title="Display classroom QR code for students to scan"
          >
            <QrCode className="w-3.5 h-3.5 mr-1.5 text-brand-royal-blue" />
            <span>Show QR Code</span>
          </button>

          {/* Toggle Fullscreen API if supported */}
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="hidden md:inline-flex items-center px-3 py-1.5 text-xs font-medium text-brand-dark-navy bg-brand-white hover:bg-brand-off-white border border-brand-border rounded-md transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Enter browser fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 mr-1.5 text-brand-slate" />
                <span>Windowed</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 mr-1.5 text-brand-slate" />
                <span>Fullscreen</span>
              </>
            )}
          </button>

          {/* Prominent Exit Control */}
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-brand-white bg-brand-deep-blue hover:bg-brand-dark-navy rounded-md shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-brand-deep-blue/40"
            title="Exit Projector Mode (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 mr-1.5" />
            <span>Exit Projector Mode</span>
            <kbd className="hidden lg:inline-block ml-2 px-1.5 py-0.5 text-[10px] bg-white/20 rounded font-mono font-normal">
              Esc
            </kbd>
          </button>
        </div>
      </header>

      {/* Main Projector Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 lg:px-12 py-8 flex flex-col justify-start">
        {/* Prominent Classroom Title & Description */}
        <div className="pb-8 border-b border-brand-border mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-dark-navy tracking-tight leading-tight">
            {classroomSettings?.title || "Classroom Learning Materials"}
          </h1>
          {classroomSettings?.description && (
            <p className="text-base sm:text-lg md:text-xl text-brand-slate mt-3 leading-relaxed max-w-5xl">
              {classroomSettings.description}
            </p>
          )}

          {/* Direct Classroom URL Banner */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-brand-slate">
            <span className="font-semibold text-brand-dark-navy">Student Access Portal:</span>
            <span className="font-mono bg-brand-off-white px-2.5 py-1 rounded border border-brand-border text-brand-royal-blue font-medium select-all">
              {classroomUrl}
            </span>
            <span className="text-brand-slate hidden sm:inline">·</span>
            <span className="text-brand-slate hidden sm:inline">Zero registration or app download needed</span>
          </div>
        </div>

        {/* Projector Controls: Filter chips and Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          {/* Format Filter Chips with Larger Readable Typography */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-0 text-xs sm:text-sm font-semibold">
            <button
              type="button"
              onClick={() => setSelectedFormat("all")}
              className={`px-4 py-2 rounded-full border transition-colors whitespace-nowrap shadow-xs ${
                selectedFormat === "all"
                  ? "bg-brand-deep-blue text-brand-white border-brand-deep-blue font-bold"
                  : "bg-brand-white text-brand-slate border-brand-border hover:border-brand-royal-blue"
              }`}
            >
              All Materials ({totalPublishedCount})
            </button>

            {availableFormats.map((fmt) => {
              const isSelected = selectedFormat === fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setSelectedFormat(fmt)}
                  className={`px-4 py-2 rounded-full border uppercase transition-colors whitespace-nowrap shadow-xs ${
                    isSelected
                      ? "bg-brand-deep-blue text-brand-white border-brand-deep-blue font-bold"
                      : "bg-brand-white text-brand-slate border-brand-border hover:border-brand-royal-blue"
                  }`}
                >
                  {fmt}
                </button>
              );
            })}
          </div>

          {/* Search Box - Large, accessible */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-brand-slate absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search materials..."
              className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm border border-brand-border rounded-lg bg-brand-white text-brand-dark-navy placeholder-brand-slate/70 focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/30 focus:border-brand-royal-blue transition-colors shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-slate hover:text-brand-dark-navy"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Learning Materials Cards: Large, projector-optimized cards */}
        {resources.length === 0 ? (
          <div className="border border-brand-border rounded-xl bg-brand-off-white/60 p-12 text-center max-w-lg mx-auto space-y-3 my-8">
            <div className="w-14 h-14 rounded-full bg-brand-light-blue text-brand-royal-blue flex items-center justify-center mx-auto">
              <BookOpen className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-brand-dark-navy">
              No Matching Learning Materials
            </h3>
            <p className="text-sm text-brand-slate leading-relaxed">
              {totalPublishedCount === 0
                ? "Your instructor has not published any learning materials to this classroom yet."
                : "No learning materials matched your active filter or search terms."}
            </p>
            {searchQuery || selectedFormat !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedFormat("all");
                }}
                className="mt-2 inline-flex items-center text-xs font-semibold text-brand-royal-blue hover:underline"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {resources.map((resource) => {
              const isDownloading = downloadingId === resource.id;

              return (
                <article
                  key={resource.id}
                  className="border-2 border-brand-border hover:border-brand-royal-blue/60 rounded-xl p-6 bg-brand-white flex flex-col justify-between shadow-xs transition-colors"
                >
                  <div>
                    {/* Format Badge & Metadata */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-10 h-10 rounded-lg bg-brand-off-white border border-brand-border flex items-center justify-center flex-shrink-0">
                          {getFormatIcon(resource.fileExtension)}
                        </div>
                        <div>
                          <span className="uppercase text-xs font-bold tracking-wider px-2 py-0.5 rounded bg-brand-off-white border border-brand-border text-brand-dark-navy">
                            {resource.fileExtension || "FILE"}
                          </span>
                          <span className="text-xs text-brand-slate font-medium ml-2">
                            {formatFileSize(resource.fileSize)}
                          </span>
                        </div>
                      </div>

                      {resource.publishedAt && (
                        <span className="text-xs text-brand-slate">
                          {formatDisplayDate(resource.publishedAt)}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h2
                      className="text-lg sm:text-xl font-bold text-brand-dark-navy leading-snug line-clamp-2"
                      title={resource.title}
                    >
                      {resource.title}
                    </h2>

                    {/* Description */}
                    {resource.description ? (
                      <p className="text-xs sm:text-sm text-brand-slate mt-2 line-clamp-3 leading-relaxed">
                        {resource.description}
                      </p>
                    ) : (
                      <p className="text-xs text-brand-slate/60 italic mt-2">
                        No additional notes provided.
                      </p>
                    )}
                  </div>

                  {/* Prominent Download Button */}
                  <div className="pt-5 mt-5 border-t border-brand-border">
                    <button
                      type="button"
                      onClick={() => onDownload(resource)}
                      disabled={isDownloading}
                      className="w-full inline-flex items-center justify-center px-5 py-3 text-sm font-bold text-brand-white bg-brand-royal-blue hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/40"
                      aria-label={`Download ${resource.title}`}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          <span>Preparing file download...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          <span>Download Material</span>
                        </>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* On-Screen QR Code Modal: Designed to be displayed on projector so entire room can scan */}
      {showQrModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="projector-qr-title"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            ref={modalContainerRef}
            tabIndex={-1}
            className="bg-brand-white border border-brand-border rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-4 focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-brand-border">
              <div className="flex items-center space-x-2">
                <QrCode className="w-5 h-5 text-brand-royal-blue" />
                <h2
                  id="projector-qr-title"
                  className="text-base sm:text-lg font-bold text-brand-dark-navy"
                >
                  Join Classroom
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1 rounded-md text-brand-slate hover:text-brand-dark-navy hover:bg-brand-off-white"
                aria-label="Close QR display"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-brand-slate">
              Point your smartphone camera at this screen to view and download learning materials.
            </p>

            {/* High-Contrast Large QR Preview */}
            <div className="w-64 h-64 sm:w-72 sm:h-72 mx-auto bg-brand-white border-2 border-brand-border rounded-xl p-3 flex items-center justify-center shadow-sm">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Classroom Portal QR Code"
                  className="w-full h-full object-contain block"
                />
              ) : (
                <Loader2 className="w-8 h-8 text-brand-royal-blue animate-spin" />
              )}
            </div>

            <div className="bg-brand-off-white border border-brand-border rounded-lg p-2.5 font-mono text-xs sm:text-sm text-brand-royal-blue select-all break-all">
              {classroomUrl}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-full py-2.5 px-4 bg-brand-deep-blue hover:bg-brand-dark-navy text-brand-white font-semibold text-xs sm:text-sm rounded-lg transition-colors"
              >
                Close QR Display
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectorView;
