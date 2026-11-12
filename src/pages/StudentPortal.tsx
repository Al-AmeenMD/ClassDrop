import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import {
  Download,
  Search,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  File,
  Loader2,
  AlertCircle,
  BookOpen,
  X,
  LogIn,
  RotateCcw,
  Presentation,
} from "lucide-react";
import { db } from "../lib/firebase";
import { PublicResource, ClassroomSettings } from "../types/database";
import { formatFileSize, formatDisplayDate } from "../utils/fileValidation";
import { ProjectorView } from "../components/student/ProjectorView";

export const StudentPortal: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [resources, setResources] = useState<PublicResource[]>([]);
  const [classroomSettings, setClassroomSettings] = useState<ClassroomSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Projector Presentation Mode State
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(() => {
    return (
      searchParams.get("mode") === "projector" ||
      searchParams.get("projector") === "true"
    );
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<string>("all");

  // Download Action State
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Fullscreen and Presentation Mode Controls
  const handleEnterProjectorMode = async () => {
    setIsProjectorMode(true);
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn(
        "Fullscreen permission unavailable or denied; operating in windowed presentation mode:",
        err
      );
    }
  };

  const handleExitProjectorMode = useCallback(async () => {
    setIsProjectorMode(false);

    // Clean mode and projector query parameters while preserving unrelated parameters and hash
    const currentParams = new URLSearchParams(location.search);
    if (currentParams.has("mode") || currentParams.has("projector")) {
      currentParams.delete("mode");
      currentParams.delete("projector");
      const searchStr = currentParams.toString() ? `?${currentParams.toString()}` : "";
      navigate(
        {
          pathname: location.pathname,
          search: searchStr,
          hash: location.hash,
        },
        { replace: true }
      );
    }

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Error exiting fullscreen:", err);
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  };

  // Synchronize Escape key & Fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Accurately reflect document.fullscreenElement without terminating Projector Mode
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isProjectorMode) {
        e.preventDefault();
        handleExitProjectorMode();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProjectorMode, handleExitProjectorMode]);

  // Real-time Firestore subscriptions for classroom info and public resources
  const subscribeToData = useCallback(() => {
    if (!db) {
      setLoadError("Database service is currently unavailable. Please refresh.");
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    setLoadError(null);

    // 1. Subscribe to public classroom settings (/settings/classroom)
    const classroomDocRef = doc(db, "settings", "classroom");
    const unsubscribeSettings = onSnapshot(
      classroomDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Extract strictly title and description (never expose admin metadata)
          setClassroomSettings({
            title: data.title || "Classroom Learning Materials",
            description: data.description || "",
            updatedAt: null,
            updatedBy: "",
          });
        } else {
          // Graceful default if settings document is not yet configured
          setClassroomSettings({
            title: "Classroom Learning Materials",
            description: "Access and download learning materials published by your instructor.",
            updatedAt: null,
            updatedBy: "",
          });
        }
      },
      (err) => {
        console.warn("Could not read classroom settings:", err);
        // Fallback default on permission or read error
        setClassroomSettings({
          title: "Classroom Learning Materials",
          description: "Access and download learning materials published by your instructor.",
          updatedAt: null,
          updatedBy: "",
        });
      }
    );

    // 2. Subscribe to public resources collection (/public_resources)
    const publicResourcesQuery = query(
      collection(db, "public_resources"),
      orderBy("publishedAt", "desc")
    );

    const unsubscribeResources = onSnapshot(
      publicResourcesQuery,
      (snapshot) => {
        const items: PublicResource[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as PublicResource;
          items.push({
            id: docSnap.id,
            title: data.title,
            description: data.description || "",
            fileType: data.fileType,
            fileExtension: data.fileExtension || "",
            fileSize: data.fileSize || 0,
            publishedAt: data.publishedAt,
          });
        });
        setResources(items);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load public classroom materials:", err);
        setLoadError("Unable to load learning materials. Please check your network connection.");
        setLoading(false);
      }
    );

    return () => {
      unsubscribeSettings();
      unsubscribeResources();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToData();
    return () => {
      unsubscribe();
    };
  }, [subscribeToData]);

  // Derive available format categories from the retrieved public resources
  const availableFormats = useMemo(() => {
    const formatSet = new Set<string>();
    resources.forEach((r) => {
      if (r.fileExtension) {
        formatSet.add(r.fileExtension.toLowerCase());
      }
    });
    return Array.from(formatSet).sort();
  }, [resources]);

  // Client-side search and filtering over public resources
  const filteredResources = useMemo(() => {
    return resources.filter((item) => {
      // Format filter
      if (selectedFormat !== "all") {
        if (item.fileExtension?.toLowerCase() !== selectedFormat.toLowerCase()) {
          return false;
        }
      }

      // Search query (matches title or description)
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim();
        const titleMatch = item.title?.toLowerCase().includes(queryLower);
        const descMatch = item.description?.toLowerCase().includes(queryLower);
        return Boolean(titleMatch || descMatch);
      }

      return true;
    });
  }, [resources, selectedFormat, searchQuery]);

  // Download handler initiating browser-native stream via gateway
  const handleDownload = (resource: PublicResource) => {
    if (downloadingId) return; // Prevent concurrent or duplicate download initiations
    setDownloadingId(resource.id);
    setDownloadError(null);

    try {
      // Initiate native browser download request to the Cloud Functions download gateway
      const downloadEndpoint = `/api/download/${encodeURIComponent(resource.id)}`;

      // Create an invisible anchor tag to trigger native download navigation without unloading page state
      const downloadLink = document.createElement("a");
      downloadLink.href = downloadEndpoint;
      downloadLink.setAttribute("download", "");
      downloadLink.style.display = "none";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err: any) {
      console.error("Failed to initiate file download:", err);
      setDownloadError(
        `Unable to initiate download for "${resource.title}". Please try again.`
      );
    } finally {
      // Release downloading state after visual feedback delay
      setTimeout(() => {
        setDownloadingId(null);
      }, 1500);
    }
  };

  const getFormatIcon = (ext: string) => {
    const lower = ext.toLowerCase();
    switch (lower) {
      case "pdf":
        return <FileText className="w-5 h-5 text-red-600" />;
      case "docx":
      case "txt":
        return <FileText className="w-5 h-5 text-brand-royal-blue" />;
      case "xlsx":
      case "csv":
        return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
      case "pptx":
        return <FileText className="w-5 h-5 text-orange-600" />;
      case "zip":
        return <FileArchive className="w-5 h-5 text-amber-600" />;
      case "png":
      case "jpg":
      case "jpeg":
        return <ImageIcon className="w-5 h-5 text-purple-600" />;
      default:
        return <File className="w-5 h-5 text-brand-slate" />;
    }
  };

  // Render Projector Presentation Mode if active
  if (isProjectorMode) {
    return (
      <ProjectorView
        classroomSettings={classroomSettings}
        resources={filteredResources}
        totalPublishedCount={resources.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedFormat={selectedFormat}
        setSelectedFormat={setSelectedFormat}
        availableFormats={availableFormats}
        onDownload={handleDownload}
        downloadingId={downloadingId}
        onExit={handleExitProjectorMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />
    );
  }

  return (
    <div className="min-h-screen bg-brand-white flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-brand-border bg-brand-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-brand-deep-blue flex items-center justify-center text-brand-white font-semibold text-sm shadow-xs">
              CD
            </div>
            <div>
              <span className="font-semibold text-base text-brand-deep-blue tracking-tight block leading-tight">
                ClassDrop
              </span>
              <span className="text-[11px] text-brand-slate font-medium">
                Student Learning Portal
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={handleEnterProjectorMode}
              className="inline-flex items-center text-xs font-semibold text-brand-dark-navy bg-brand-white hover:bg-brand-off-white border border-brand-border px-3 py-1.5 rounded-md transition-colors shadow-xs"
              title="Launch presentation-friendly Projector Mode"
            >
              <Presentation className="w-3.5 h-3.5 mr-1.5 text-brand-royal-blue" />
              Projector Mode
            </button>

            <Link
              to="/login"
              className="inline-flex items-center text-xs font-medium text-brand-slate hover:text-brand-dark-navy bg-brand-white hover:bg-brand-off-white border border-brand-border px-3 py-1.5 rounded-md transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 mr-1.5 text-brand-slate" />
              Facilitator Login
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Download Error Banner */}
        {downloadError && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between shadow-xs transition-all"
          >
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{downloadError}</span>
            </div>
            <button
              onClick={() => setDownloadError(null)}
              className="p-1 rounded text-red-600 hover:text-red-800"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Classroom Title & Context Hero */}
        <div className="pb-6 border-b border-brand-border mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark-navy tracking-tight">
            {classroomSettings?.title || "Classroom Learning Materials"}
          </h1>
          {classroomSettings?.description && (
            <p className="text-sm text-brand-slate mt-2 leading-relaxed max-w-3xl">
              {classroomSettings.description}
            </p>
          )}
        </div>

        {/* Search & Filter Bar (Visible once initial load finishes) */}
        {!loading && !loadError && resources.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
            {/* Format Filter Chips */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-medium">
              <button
                onClick={() => setSelectedFormat("all")}
                className={`px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                  selectedFormat === "all"
                    ? "bg-brand-deep-blue text-brand-white border-brand-deep-blue font-semibold"
                    : "bg-brand-white text-brand-slate border-brand-border hover:border-brand-royal-blue/50"
                }`}
              >
                All ({resources.length})
              </button>

              {availableFormats.map((fmt) => {
                const count = resources.filter(
                  (r) => r.fileExtension?.toLowerCase() === fmt
                ).length;
                const isSelected = selectedFormat === fmt;

                return (
                  <button
                    key={fmt}
                    onClick={() => setSelectedFormat(fmt)}
                    className={`px-3 py-1.5 rounded-full border transition-colors uppercase whitespace-nowrap ${
                      isSelected
                        ? "bg-brand-deep-blue text-brand-white border-brand-deep-blue font-semibold"
                        : "bg-brand-white text-brand-slate border-brand-border hover:border-brand-royal-blue/50"
                    }`}
                  >
                    {fmt} ({count})
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-brand-slate absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search materials by title or topic..."
                className="w-full pl-9 pr-8 py-1.5 text-xs border border-brand-border rounded-md bg-brand-white text-brand-dark-navy placeholder-brand-slate/70 focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/20 focus:border-brand-royal-blue transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-slate hover:text-brand-dark-navy"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Resources Presentation */}
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-7 h-7 text-brand-royal-blue animate-spin" />
            <span className="text-xs text-brand-slate font-medium">
              Loading classroom materials...
            </span>
          </div>
        ) : loadError ? (
          <div className="p-10 border border-red-200 rounded-lg bg-red-50 text-center max-w-lg mx-auto space-y-3">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <h3 className="text-sm font-semibold text-brand-dark-navy">
              Connection Problem
            </h3>
            <p className="text-xs text-red-700 leading-relaxed">{loadError}</p>
            <button
              onClick={() => subscribeToData()}
              className="mt-2 inline-flex items-center px-3.5 py-1.5 text-xs font-medium text-brand-white bg-brand-royal-blue hover:bg-blue-700 rounded transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Try Again
            </button>
          </div>
        ) : resources.length === 0 ? (
          /* Empty Classroom State */
          <div className="border border-brand-border rounded-lg bg-brand-off-white/50 p-12 text-center max-w-md mx-auto space-y-3 my-6">
            <div className="w-12 h-12 rounded-full bg-brand-light-blue text-brand-royal-blue flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-brand-dark-navy">
              No Materials Published Yet
            </h3>
            <p className="text-xs text-brand-slate leading-relaxed">
              Your instructor has not published any learning materials to this classroom yet.
              Please check back during your class session or refresh this page.
            </p>
          </div>
        ) : filteredResources.length === 0 ? (
          /* Empty Search / Filter State */
          <div className="border border-brand-border rounded-lg bg-brand-white p-10 text-center max-w-md mx-auto space-y-3 my-6">
            <p className="text-sm font-semibold text-brand-dark-navy">
              No Matching Learning Materials
            </p>
            <p className="text-xs text-brand-slate">
              No materials matched your filter criteria. Try adjusting your search keywords or format selection.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedFormat("all");
              }}
              className="inline-flex items-center text-xs font-medium text-brand-royal-blue hover:underline mt-1"
            >
              Reset search & filters
            </button>
          </div>
        ) : (
          /* Learning Materials Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredResources.map((resource) => {
              const isDownloading = downloadingId === resource.id;

              return (
                <div
                  key={resource.id}
                  className="border border-brand-border rounded-lg p-5 bg-brand-white hover:border-brand-royal-blue/40 hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Format Badge & File Metadata */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded bg-brand-off-white border border-brand-border flex items-center justify-center flex-shrink-0">
                          {getFormatIcon(resource.fileExtension)}
                        </div>
                        <div>
                          <span className="uppercase text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-brand-off-white border border-brand-border text-brand-dark-navy">
                            {resource.fileExtension || "FILE"}
                          </span>
                          <span className="text-[11px] text-brand-slate ml-2">
                            {formatFileSize(resource.fileSize)}
                          </span>
                        </div>
                      </div>

                      {resource.publishedAt && (
                        <span className="text-[11px] text-brand-slate hidden sm:inline">
                          {formatDisplayDate(resource.publishedAt)}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h2
                      className="text-sm sm:text-base font-semibold text-brand-dark-navy leading-snug line-clamp-2"
                      title={resource.title}
                    >
                      {resource.title}
                    </h2>

                    {/* Description */}
                    {resource.description ? (
                      <p className="text-xs text-brand-slate mt-2 line-clamp-3 leading-relaxed">
                        {resource.description}
                      </p>
                    ) : (
                      <p className="text-xs text-brand-slate/60 italic mt-2">
                        No additional notes provided.
                      </p>
                    )}
                  </div>

                  {/* Card Action Footer */}
                  <div className="pt-4 mt-4 border-t border-brand-border flex items-center justify-between">
                    <span className="text-[11px] text-brand-slate sm:hidden">
                      {formatDisplayDate(resource.publishedAt)}
                    </span>

                    <button
                      onClick={() => handleDownload(resource)}
                      disabled={isDownloading}
                      className="ml-auto inline-flex items-center justify-center px-4 py-2 text-xs font-medium text-brand-white bg-brand-royal-blue hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed rounded shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/30"
                      aria-label={`Download ${resource.title}`}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          <span>Preparing...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          <span>Download Material</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-brand-border bg-brand-off-white px-6 py-4 mt-12">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-brand-slate gap-2 text-center sm:text-left">
          <span>ClassDrop Classroom Portal · Zero-Auth Student Access</span>
          <span>Learning materials provided by your course instructor</span>
        </div>
      </footer>
    </div>
  );
};
export default StudentPortal;

