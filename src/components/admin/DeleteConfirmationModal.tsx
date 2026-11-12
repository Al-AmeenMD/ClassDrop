import React, { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { Resource } from "../../types/database";

export interface DeleteConfirmationModalProps {
  isOpen: boolean;
  resource: Resource | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  resource,
  onClose,
  onSuccess,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !resource) return null;

  const handleDelete = async () => {
    if (!functions) {
      setErrorMessage("Cloud Functions service is not initialized or configured.");
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const deleteResourceFn = httpsCallable<{ resourceId: string }, { success: boolean }>(
        functions,
        "deleteResource"
      );

      const result = await deleteResourceFn({ resourceId: resource.id });

      if (result.data && result.data.success) {
        onSuccess(`Resource "${resource.title}" was permanently deleted.`);
        onClose();
      } else {
        throw new Error("Deletion failed on the server.");
      }
    } catch (err: any) {
      console.error("Cloud Function deletion error:", err);
      const displayMsg =
        err?.message ||
        err?.details ||
        "An unexpected error occurred while deleting the file. Please try again.";
      setErrorMessage(displayMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark-navy/40 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div className="relative w-full max-w-md bg-brand-white border border-brand-border rounded-lg shadow-lg flex flex-col">
        <div className="p-6">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="delete-dialog-title" className="text-base font-semibold text-brand-dark-navy">
                Delete Learning Material
              </h2>
              <p className="text-xs text-brand-slate mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete{" "}
                <strong className="text-brand-dark-navy font-semibold">"{resource.title}"</strong>?
              </p>
              <p className="text-xs text-brand-slate mt-1 leading-relaxed">
                This action will delete the file from storage and immediately remove all access for
                students. This cannot be undone.
              </p>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed"
            >
              {errorMessage}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 px-6 py-3.5 border-t border-brand-border bg-brand-off-white rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-3.5 py-1.5 text-xs font-medium text-brand-slate hover:text-brand-dark-navy border border-brand-border rounded bg-brand-white hover:bg-brand-off-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-4 py-1.5 text-xs font-medium text-brand-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed rounded shadow-sm transition-colors flex items-center space-x-1.5"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Confirm Delete</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
export default DeleteConfirmationModal;

