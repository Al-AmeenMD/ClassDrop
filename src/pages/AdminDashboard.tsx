import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import {
  UploadCloud,
  Search,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  File,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  LogOut,
  X,
} from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { Resource } from "../types/database";
import { formatFileSize, formatDisplayDate } from "../utils/fileValidation";
import { FileUploadModal } from "../components/admin/FileUploadModal";
import { EditResourceModal } from "../components/admin/EditResourceModal";
import { DeleteConfirmationModal } from "../components/admin/DeleteConfirmationModal";

export const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null);

  // Operation loading state (e.g. publishing/unpublishing per resource ID)
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  // User feedback toast / banner
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  // Real-time Firestore subscription to /resources collection
  useEffect(() => {
    if (!db) {
      setLoadError("Firestore database service is unavailable.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const resourcesQuery = query(collection(db, "resources"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      resourcesQuery,
      (snapshot) => {
        const items: Resource[] = [];
        snapshot.forEach((docSnap) => {
          items.push({
            ...(docSnap.data() as Resource),
            id: docSnap.id,
          });
        });
        setResources(items);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to subscribe to resources collection:", err);
        setLoadError("Unable to load classroom materials. Please check your network connection.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filtered resources computation
  const filteredResources = useMemo(() => {
    return resources.filter((item) => {
      // Status filter
      if (statusFilter === "published" && !item.isPublished) return false;
      if (statusFilter === "draft" && item.isPublished) return false;

      // Search query filter (title or filename)
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim();
        const titleMatch = item.title?.toLowerCase().includes(queryLower);
        const fileNameMatch = item.fileName?.toLowerCase().includes(queryLower);
        return titleMatch || fileNameMatch;
      }

      return true;
    });
  }, [resources, statusFilter, searchQuery]);

  // Statistics derived directly from actual Firestore data
  const totalCount = resources.length;
  const publishedCount = resources.filter((r) => r.isPublished).length;
  const draftCount = resources.filter((r) => !r.isPublished).length;

  // Publishing / Unpublishing action using single Firestore batch write
  const handleTogglePublish = async (resource: Resource) => {
    if (!db) return;

    setActionPendingId(resource.id);
    const targetPublished = !resource.isPublished;

    try {
      const resourceDocRef = doc(db, "resources", resource.id);
      const publicDocRef = doc(db, "public_resources", resource.id);
      const batch = writeBatch(db);

      if (targetPublished) {
        // Publish: update private record AND create public record
        batch.update(resourceDocRef, {
          isPublished: true,
          updatedAt: serverTimestamp(),
        });

        batch.set(publicDocRef, {
          id: resource.id,
          title: resource.title,
          description: resource.description || "",
          fileType: resource.fileType,
          fileExtension: resource.fileExtension,
          fileSize: resource.fileSizeBytes ?? (resource as any).fileSize ?? 0,
          publishedAt: serverTimestamp(),
        });

        await batch.commit();
        showNotification(`"${resource.title}" is now published and accessible to students.`);
      } else {
        // Unpublish: update private record AND delete public record
        batch.update(resourceDocRef, {
          isPublished: false,
          updatedAt: serverTimestamp(),
        });

        batch.delete(publicDocRef);

        await batch.commit();
        showNotification(`"${resource.title}" unpublished. Access revoked for students.`);
      }
    } catch (err: any) {
      console.error("Failed to update publication status:", err);
      showNotification(
        err?.message || "Failed to update publication status. Please try again.",
        "error"
      );
    } finally {
      setActionPendingId(null);
    }
  };

  const getFileIcon = (ext: string) => {
    const lower = ext.toLowerCase();
    switch (lower) {
      case "pdf":
        return <FileText className="w-4 h-4 text-red-600" />;
      case "docx":
      case "txt":
        return <FileText className="w-4 h-4 text-brand-royal-blue" />;
      case "xlsx":
      case "csv":
        return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
      case "pptx":
        return <FileText className="w-4 h-4 text-orange-600" />;
      case "zip":
        return <FileArchive className="w-4 h-4 text-amber-600" />;
      case "png":
      case "jpg":
      case "jpeg":
        return <ImageIcon className="w-4 h-4 text-purple-600" />;
      default:
        return <File className="w-4 h-4 text-brand-slate" />;
    }
  };

  return (
    <div className="min-h-screen bg-brand-white flex flex-col justify-between">
      {/* Top Navigation Bar */}
      <header className="border-b border-brand-border bg-brand-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-brand-deep-blue flex items-center justify-center text-brand-white font-semibold text-sm">
              CD
            </div>
            <div>
              <span className="font-semibold text-base text-brand-deep-blue tracking-tight block leading-tight">
                ClassDrop
              </span>
              <span className="text-[11px] text-brand-slate font-medium">
                Facilitator Administration
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              to="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center text-xs text-brand-slate hover:text-brand-dark-navy px-2.5 py-1.5 rounded transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Preview Student Portal
            </Link>

            <span className="text-xs text-brand-slate hidden md:inline px-2">|</span>

            <span className="text-xs text-brand-dark-navy font-medium hidden sm:inline truncate max-w-[200px]">
              {user?.email}
            </span>

            <button
              onClick={() => logout()}
              className="inline-flex items-center text-xs font-medium text-brand-slate hover:text-red-600 px-3 py-1.5 rounded border border-brand-border hover:border-red-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Toast / Notification Banner */}
        {notification && (
          <div
            role="status"
            className={`mb-6 p-3.5 rounded-md border text-xs flex items-center justify-between shadow-sm transition-all ${
              notification.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            <div className="flex items-center space-x-2">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              )}
              <span className="font-medium">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 rounded text-brand-slate hover:opacity-75"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Dashboard Header & Primary Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-brand-border">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark-navy tracking-tight">
              Classroom Materials
            </h1>
            <p className="text-xs text-brand-slate mt-1">
              Manage learning resources, control publication status, and distribute materials to students.
            </p>
          </div>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 bg-brand-royal-blue hover:bg-blue-700 active:bg-blue-800 text-brand-white font-medium text-xs rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/30"
          >
            <UploadCloud className="w-4 h-4 mr-1.5" />
            Upload Materials
          </button>
        </div>

        {/* Real-time Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
          <div className="border border-brand-border rounded-md p-4 bg-brand-white">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-slate block">
              Total Materials
            </span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-brand-dark-navy">
                {loading ? "—" : totalCount}
              </span>
              <span className="text-xs text-brand-slate">files uploaded</span>
            </div>
          </div>

          <div className="border border-brand-border rounded-md p-4 bg-brand-white">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-green-700 block">
              Published Live
            </span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-green-700">
                {loading ? "—" : publishedCount}
              </span>
              <span className="text-xs text-brand-slate">accessible to students</span>
            </div>
          </div>

          <div className="border border-brand-border rounded-md p-4 bg-brand-white">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-slate block">
              Drafts / Unpublished
            </span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-brand-dark-navy">
                {loading ? "—" : draftCount}
              </span>
              <span className="text-xs text-brand-slate">private to admin</span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          {/* Status Tabs */}
          <div className="flex items-center p-1 bg-brand-off-white border border-brand-border rounded-md text-xs font-medium self-start sm:self-auto">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded transition-colors ${
                statusFilter === "all"
                  ? "bg-brand-white text-brand-dark-navy shadow-xs font-semibold"
                  : "text-brand-slate hover:text-brand-dark-navy"
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter("published")}
              className={`px-3 py-1 rounded transition-colors ${
                statusFilter === "published"
                  ? "bg-brand-white text-green-700 shadow-xs font-semibold"
                  : "text-brand-slate hover:text-green-700"
              }`}
            >
              Published ({publishedCount})
            </button>
            <button
              onClick={() => setStatusFilter("draft")}
              className={`px-3 py-1 rounded transition-colors ${
                statusFilter === "draft"
                  ? "bg-brand-white text-brand-dark-navy shadow-xs font-semibold"
                  : "text-brand-slate hover:text-brand-dark-navy"
              }`}
            >
              Drafts ({draftCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-brand-slate absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or filename..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-brand-border rounded-md bg-brand-white text-brand-dark-navy placeholder-brand-slate/70 focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/20 focus:border-brand-royal-blue transition-colors"
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

        {/* Resources Table */}
        <div className="border border-brand-border rounded-md bg-brand-white overflow-hidden shadow-xs">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-6 h-6 text-brand-royal-blue animate-spin" />
              <span className="text-xs text-brand-slate">Loading classroom materials...</span>
            </div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-red-600 space-y-2">
              <AlertCircle className="w-6 h-6 mx-auto text-red-500" />
              <p className="font-semibold">{loadError}</p>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="p-12 text-center">
              {resources.length === 0 ? (
                <div className="space-y-3 max-w-sm mx-auto">
                  <div className="w-12 h-12 rounded-full bg-brand-light-blue text-brand-royal-blue flex items-center justify-center mx-auto">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-brand-dark-navy">
                    No learning materials uploaded yet
                  </h3>
                  <p className="text-xs text-brand-slate leading-relaxed">
                    Upload presentation slides, reading assignments, spreadsheets, or syllabus files to share with students.
                  </p>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="mt-2 inline-flex items-center px-3.5 py-1.5 text-xs font-medium text-brand-white bg-brand-royal-blue hover:bg-blue-700 rounded transition-colors"
                  >
                    <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                    Upload your first file
                  </button>
                </div>
              ) : (
                <div className="space-y-2 text-xs text-brand-slate py-4">
                  <p className="font-medium text-brand-dark-navy">No matching resources found</p>
                  <p>
                    No materials matched your filter criteria. Try adjusting your search query or status filter.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                    className="text-xs text-brand-royal-blue hover:underline font-medium inline-block mt-1"
                  >
                    Reset all filters
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-off-white text-[11px] font-semibold uppercase tracking-wider text-brand-slate">
                    <th scope="col" className="py-3 px-4">Material / File</th>
                    <th scope="col" className="py-3 px-3 hidden sm:table-cell">Format</th>
                    <th scope="col" className="py-3 px-3 hidden md:table-cell">Size</th>
                    <th scope="col" className="py-3 px-3 hidden lg:table-cell">Upload Date</th>
                    <th scope="col" className="py-3 px-3">Status</th>
                    <th scope="col" className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border text-xs">
                  {filteredResources.map((item) => {
                    const isPending = actionPendingId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-brand-off-white/40 transition-colors"
                      >
                        {/* File & Title */}
                        <td className="py-3 px-4 max-w-xs sm:max-w-md">
                          <div className="flex items-start space-x-3">
                            <div className="w-7 h-7 rounded bg-brand-off-white border border-brand-border flex items-center justify-center flex-shrink-0 mt-0.5">
                              {getFileIcon(item.fileExtension)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-brand-dark-navy block truncate" title={item.title}>
                                {item.title}
                              </span>
                              <span className="text-[11px] font-mono text-brand-slate block truncate" title={item.fileName}>
                                {item.fileName}
                              </span>
                              {item.description && (
                                <p className="text-[11px] text-brand-slate mt-0.5 line-clamp-1 italic">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Format */}
                        <td className="py-3 px-3 hidden sm:table-cell whitespace-nowrap">
                          <span className="uppercase font-semibold text-[10px] bg-brand-off-white border border-brand-border px-1.5 py-0.5 rounded text-brand-dark-navy">
                            {item.fileExtension || "FILE"}
                          </span>
                        </td>

                        {/* Size */}
                        <td className="py-3 px-3 hidden md:table-cell text-brand-slate whitespace-nowrap">
                          {formatFileSize(item.fileSizeBytes ?? (item as any).fileSize ?? 0)}
                        </td>

                        {/* Upload Date */}
                        <td className="py-3 px-3 hidden lg:table-cell text-brand-slate whitespace-nowrap">
                          {formatDisplayDate(item.createdAt)}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {item.isPublished ? (
                            <span className="inline-flex items-center text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                              Published
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-medium text-brand-slate bg-brand-off-white border border-brand-border px-2 py-0.5 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-slate mr-1.5"></span>
                              Draft
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center space-x-1.5">
                            {/* Toggle Publish */}
                            <button
                              onClick={() => handleTogglePublish(item)}
                              disabled={isPending}
                              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors inline-flex items-center space-x-1 ${
                                item.isPublished
                                  ? "border-brand-border text-brand-slate hover:text-brand-dark-navy hover:bg-brand-off-white"
                                  : "border-green-300 text-green-700 bg-green-50 hover:bg-green-100"
                              } disabled:opacity-50`}
                              title={item.isPublished ? "Revoke student access" : "Publish to students"}
                            >
                              {isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : item.isPublished ? (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span className="hidden sm:inline">Unpublish</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span className="hidden sm:inline">Publish</span>
                                </>
                              )}
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => setEditingResource(item)}
                              className="p-1 rounded text-brand-slate hover:text-brand-dark-navy hover:bg-brand-off-white border border-transparent hover:border-brand-border transition-colors"
                              title="Edit title & description"
                              aria-label={`Edit ${item.title}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => setDeletingResource(item)}
                              className="p-1 rounded text-brand-slate hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                              title="Delete permanently"
                              aria-label={`Delete ${item.title}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadComplete={() => {
          showNotification("Materials uploaded to collection.");
        }}
      />

      <EditResourceModal
        isOpen={Boolean(editingResource)}
        resource={editingResource}
        onClose={() => setEditingResource(null)}
        onSuccess={(msg) => showNotification(msg)}
      />

      <DeleteConfirmationModal
        isOpen={Boolean(deletingResource)}
        resource={deletingResource}
        onClose={() => setDeletingResource(null)}
        onSuccess={(msg) => showNotification(msg)}
      />

      {/* Institutional Footer */}
      <footer className="border-t border-brand-border bg-brand-off-white px-6 py-4 mt-12">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-brand-slate">
          <span>ClassDrop Administrator</span>
          <span>Phase 3: File Management & Publishing</span>
        </div>
      </footer>
    </div>
  );
};
export default AdminDashboard;

