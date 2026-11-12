import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { doc, writeBatch, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Resource } from "../../types/database";

export interface EditResourceModalProps {
  isOpen: boolean;
  resource: Resource | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const EditResourceModal: React.FC<EditResourceModalProps> = ({
  isOpen,
  resource,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState(resource?.title || "");
  const [description, setDescription] = useState(resource?.description || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state when resource prop updates
  React.useEffect(() => {
    if (resource) {
      setTitle(resource.title || "");
      setDescription(resource.description || "");
      setErrorMessage(null);
    }
  }, [resource]);

  if (!isOpen || !resource) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("Resource title cannot be empty.");
      return;
    }

    if (trimmedTitle.length > 120) {
      setErrorMessage("Title must not exceed 120 characters.");
      return;
    }

    if (description.length > 500) {
      setErrorMessage("Description must not exceed 500 characters.");
      return;
    }

    if (!db) {
      setErrorMessage("Database service is currently unavailable.");
      return;
    }

    setIsSubmitting(true);

    try {
      const resourceDocRef = doc(db, "resources", resource.id);

      if (resource.isPublished) {
        // If resource is published, atomically update both private and public records
        const publicDocRef = doc(db, "public_resources", resource.id);
        const batch = writeBatch(db);

        batch.update(resourceDocRef, {
          title: trimmedTitle,
          description: description.trim(),
          updatedAt: serverTimestamp(),
        });

        batch.update(publicDocRef, {
          title: trimmedTitle,
          description: description.trim(),
        });

        await batch.commit();
      } else {
        // If draft, update private resource record only
        await updateDoc(resourceDocRef, {
          title: trimmedTitle,
          description: description.trim(),
          updatedAt: serverTimestamp(),
        });
      }

      onSuccess(`Resource "${trimmedTitle}" updated successfully.`);
      onClose();
    } catch (err: any) {
      console.error("Failed to update resource metadata:", err);
      setErrorMessage(err?.message || "Failed to save changes. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark-navy/40 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-resource-title"
    >
      <div className="relative w-full max-w-lg bg-brand-white border border-brand-border rounded-lg shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-white rounded-t-lg">
          <div>
            <h2 id="edit-resource-title" className="text-base font-semibold text-brand-dark-navy">
              Edit Learning Material Details
            </h2>
            <p className="text-xs text-brand-slate mt-0.5">
              Update the display title and optional description for students.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded text-brand-slate hover:text-brand-dark-navy hover:bg-brand-off-white transition-colors disabled:opacity-50"
            aria-label="Close edit modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="p-6 space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {errorMessage}
              </div>
            )}

            <div>
              <label
                htmlFor="edit-title"
                className="block text-xs font-semibold uppercase tracking-wider text-brand-dark-navy mb-1"
              >
                Resource Title <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-title"
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm border border-brand-border rounded-md bg-brand-white text-brand-dark-navy focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/20 focus:border-brand-royal-blue transition-colors disabled:bg-brand-off-white"
                placeholder="e.g. Chapter 4 Practice Questions"
              />
              <div className="flex justify-between text-[11px] text-brand-slate mt-1">
                <span>Display title seen by students when published</span>
                <span>{title.length}/120</span>
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-description"
                className="block text-xs font-semibold uppercase tracking-wider text-brand-dark-navy mb-1"
              >
                Description <span className="text-brand-slate font-normal normal-case">(Optional)</span>
              </label>
              <textarea
                id="edit-description"
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm border border-brand-border rounded-md bg-brand-white text-brand-dark-navy focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/20 focus:border-brand-royal-blue transition-colors disabled:bg-brand-off-white"
                placeholder="Add context, instructions, or reading suggestions..."
              />
              <div className="flex justify-end text-[11px] text-brand-slate mt-1">
                <span>{description.length}/500</span>
              </div>
            </div>

            <div className="p-3 bg-brand-off-white border border-brand-border rounded text-xs text-brand-slate space-y-1">
              <div className="flex items-center justify-between">
                <span>File Name:</span>
                <span className="font-mono text-brand-dark-navy truncate max-w-[240px]">
                  {resource.fileName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status:</span>
                <span
                  className={`font-medium ${
                    resource.isPublished ? "text-green-700" : "text-brand-slate"
                  }`}
                >
                  {resource.isPublished ? "Published (Live for students)" : "Draft (Unpublished)"}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t border-brand-border bg-brand-off-white rounded-b-lg">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-medium text-brand-slate hover:text-brand-dark-navy border border-brand-border rounded bg-brand-white hover:bg-brand-off-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-brand-white bg-brand-royal-blue hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded shadow-sm transition-colors flex items-center space-x-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default EditResourceModal;

