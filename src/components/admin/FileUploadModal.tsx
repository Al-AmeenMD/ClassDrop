import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  X,
  File,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { ref, uploadBytesResumable, UploadTask } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import {
  validateFile,
  formatFileSize,
  getFileExtension,
  ALLOWED_EXTENSIONS,
} from "../../utils/fileValidation";

export interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete?: () => void;
}

interface StagedFileItem {
  id: string; // Internal client tracking ID
  file: File;
  resourceId: string;
  extension: string;
  resolvedMimeType: string;
  status: "staged" | "uploading" | "saving_metadata" | "success" | "error";
  progress: number;
  errorMessage?: string;
  storageUploaded: boolean;
  uploadTask?: UploadTask;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
}) => {
  const { user } = useAuth();
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingGlobal, setIsUploadingGlobal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef<boolean>(true);
  const stagedFilesRef = useRef<StagedFileItem[]>(stagedFiles);

  // Sync ref with staged files state for safe access during unmount cleanup
  useEffect(() => {
    stagedFilesRef.current = stagedFiles;
  }, [stagedFiles]);

  // Lifecycle cleanup: cancel active upload tasks and prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stagedFilesRef.current.forEach((item) => {
        if (item.uploadTask && item.status === "uploading" && !item.storageUploaded) {
          try {
            item.uploadTask.cancel();
          } catch {
            // Ignore cancellation errors during unmount
          }
        }
      });
    };
  }, []);

  const generateResourceId = (): string => {
    if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    return `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  };

  const handleFilesSelected = (files: FileList | File[]) => {
    const newItems: StagedFileItem[] = [];

    Array.from(files).forEach((file) => {
      const ext = getFileExtension(file.name);
      const validation = validateFile(file);

      newItems.push({
        id: `${file.name}_${Date.now()}_${Math.random()}`,
        file,
        resourceId: generateResourceId(),
        extension: ext,
        resolvedMimeType: validation.resolvedMimeType || "application/octet-stream",
        status: validation.valid ? "staged" : "error",
        progress: 0,
        errorMessage: validation.error,
        storageUploaded: false,
      });
    });

    if (isMountedRef.current) {
      setStagedFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const removeStagedFile = (id: string) => {
    if (!isMountedRef.current) return;
    setStagedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (!target) return prev;
      // Do not silently discard an item whose Storage upload succeeded but metadata creation failed
      if (target.storageUploaded && target.status !== "success") {
        return prev;
      }
      if (target.uploadTask && target.status === "uploading" && !target.storageUploaded) {
        try {
          target.uploadTask.cancel();
        } catch {
          // Ignore cancellation errors
        }
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const saveMetadataToFirestore = async (item: StagedFileItem): Promise<void> => {
    if (!db || !user) {
      throw new Error("Firestore or authenticated user is unavailable.");
    }

    const defaultTitle = item.file.name.replace(/\.[^/.]+$/, "");
    const storagePath = `materials/${item.resourceId}/${item.file.name}`;
    const resourceDocRef = doc(db, "resources", item.resourceId);

    // Save private resource record with approved schema (fileSizeBytes: number)
    await setDoc(resourceDocRef, {
      id: item.resourceId,
      title: defaultTitle,
      description: "",
      fileName: item.file.name,
      storagePath,
      fileType: item.resolvedMimeType,
      fileExtension: item.extension,
      fileSizeBytes: item.file.size,
      isPublished: false,
      downloadInitiations: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
    });
  };

  const uploadSingleItem = async (item: StagedFileItem): Promise<void> => {
    if (!storage || !db || !user) {
      if (isMountedRef.current) {
        setStagedFiles((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "error", errorMessage: "Firebase services unavailable." }
              : i
          )
        );
      }
      return;
    }

    // Step 1: Upload file to Firebase Storage if not already uploaded
    if (!item.storageUploaded) {
      const storagePath = `materials/${item.resourceId}/${item.file.name}`;
      const storageRef = ref(storage, storagePath);

      if (isMountedRef.current) {
        setStagedFiles((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "uploading", progress: 0 } : i))
        );
      }

      try {
        const uploadTask = uploadBytesResumable(storageRef, item.file, {
          contentType: item.resolvedMimeType,
        });

        // Store upload task reference so it can be monitored or cancelled
        if (isMountedRef.current) {
          setStagedFiles((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, uploadTask } : i))
          );
        }

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              if (!isMountedRef.current) return;
              const pct = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              setStagedFiles((prev) =>
                prev.map((i) => (i.id === item.id ? { ...i, progress: pct } : i))
              );
            },
            (error) => {
              reject(error);
            },
            () => {
              resolve();
            }
          );
        });

        // Storage upload succeeded
        if (isMountedRef.current) {
          setStagedFiles((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, storageUploaded: true, status: "saving_metadata", progress: 100 }
                : i
            )
          );
        }
      } catch (uploadErr: any) {
        if (isMountedRef.current) {
          setStagedFiles((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "error",
                    errorMessage: uploadErr?.message || "Storage upload failed.",
                  }
                : i
            )
          );
        }
        return;
      }
    }

    // Step 2: Create Administrator metadata in Firestore (/resources/{resourceId})
    try {
      if (isMountedRef.current) {
        setStagedFiles((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "saving_metadata" } : i))
        );
      }

      await saveMetadataToFirestore(item);

      if (isMountedRef.current) {
        setStagedFiles((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "success", errorMessage: undefined }
              : i
          )
        );
      }
    } catch (dbErr: any) {
      if (isMountedRef.current) {
        setStagedFiles((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "error",
                  errorMessage:
                    "File uploaded to storage, but failed to save metadata. Click retry to complete.",
                }
              : i
          )
        );
      }
    }
  };

  const handleStartUpload = async () => {
    const readyItems = stagedFiles.filter(
      (item) => item.status === "staged" || (item.status === "error" && item.storageUploaded)
    );

    if (readyItems.length === 0) return;

    setIsUploadingGlobal(true);

    // Upload items concurrently with independent failure isolation
    await Promise.all(
      readyItems.map(async (item) => {
        await uploadSingleItem(item);
      })
    );

    if (isMountedRef.current) {
      setIsUploadingGlobal(false);
    }
    if (onUploadComplete) {
      onUploadComplete();
    }
  };

  const handleRetryItem = async (item: StagedFileItem) => {
    await uploadSingleItem(item);
    if (onUploadComplete) {
      onUploadComplete();
    }
  };

  const handleClose = () => {
    const hasRecoverableItems = stagedFiles.some(
      (item) => item.storageUploaded && item.status !== "success"
    );
    const hasInProgressItems = stagedFiles.some(
      (item) => item.status === "uploading" || item.status === "saving_metadata"
    );

    if (hasRecoverableItems) {
      const confirmClose = window.confirm(
        "One or more files have uploaded to storage but their metadata is not yet saved. Closing now will leave these files incomplete. Please retry saving metadata before exiting.\n\nAre you sure you want to close anyway?"
      );
      if (!confirmClose) return;
    } else if (hasInProgressItems) {
      const confirmClose = window.confirm(
        "Uploads are currently in progress. Closing will cancel unfinished uploads. Are you sure?"
      );
      if (!confirmClose) return;
    }

    stagedFiles.forEach((item) => {
      if (item.uploadTask && item.status === "uploading" && !item.storageUploaded) {
        try {
          item.uploadTask.cancel();
        } catch {
          // Ignore cancellation errors
        }
      }
    });

    setStagedFiles([]);
    setIsUploadingGlobal(false);
    onClose();
  };

  if (!isOpen) return null;

  const validStagedCount = stagedFiles.filter((item) => item.status === "staged").length;
  const inProgressCount = stagedFiles.filter(
    (item) => item.status === "uploading" || item.status === "saving_metadata"
  ).length;
  const successCount = stagedFiles.filter((item) => item.status === "success").length;
  const errorCount = stagedFiles.filter((item) => item.status === "error").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark-navy/40 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-brand-white border border-brand-border rounded-lg shadow-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-white rounded-t-lg">
          <div>
            <h2 id="upload-modal-title" className="text-base font-semibold text-brand-dark-navy">
              Upload Classroom Materials
            </h2>
            <p className="text-xs text-brand-slate mt-0.5">
              Select or drag files to stage and upload to your classroom collection.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded text-brand-slate hover:text-brand-dark-navy hover:bg-brand-off-white transition-colors"
            aria-label="Close upload modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragOver
                ? "border-brand-royal-blue bg-brand-light-blue"
                : "border-brand-border hover:border-brand-royal-blue/60 bg-brand-off-white"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
              onChange={(e) => {
                if (e.target.files) {
                  handleFilesSelected(e.target.files);
                  e.target.value = ""; // Reset to permit re-selection
                }
              }}
              className="hidden"
            />
            <div className="flex flex-col items-center">
              <UploadCloud
                className={`w-10 h-10 mb-2 ${
                  isDragOver ? "text-brand-royal-blue" : "text-brand-slate"
                }`}
              />
              <span className="text-sm font-medium text-brand-dark-navy">
                Click to browse or drag and drop files here
              </span>
              <span className="text-xs text-brand-slate mt-1">
                Supported: PDF, Word, Excel, PowerPoint, CSV, TXT, ZIP, PNG, JPG (Max 50MB per file)
              </span>
            </div>
          </div>

          {/* Staged Files List */}
          {stagedFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-brand-dark-navy">
                <span>Selected Files ({stagedFiles.length})</span>
                <span className="text-brand-slate font-normal">
                  {successCount > 0 && `${successCount} completed · `}
                  {validStagedCount > 0 && `${validStagedCount} ready · `}
                  {errorCount > 0 && `${errorCount} with issues`}
                </span>
              </div>

              <div className="divide-y divide-brand-border border border-brand-border rounded-md max-h-60 overflow-y-auto">
                {stagedFiles.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between hover:bg-brand-off-white/50 text-xs transition-colors"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0 pr-3">
                      <div className="w-7 h-7 rounded bg-brand-light-blue text-brand-royal-blue flex items-center justify-center flex-shrink-0 font-bold uppercase text-[10px]">
                        {item.extension || <File className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-brand-dark-navy truncate" title={item.file.name}>
                          {item.file.name}
                        </p>
                        <p className="text-brand-slate text-[11px]">
                          {formatFileSize(item.file.size)}
                        </p>

                        {/* Progress Bar for uploading state */}
                        {item.status === "uploading" && (
                          <div className="w-full bg-brand-border rounded-full h-1.5 mt-1.5 overflow-hidden">
                            <div
                              className="bg-brand-royal-blue h-1.5 rounded-full transition-all duration-200"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}

                        {/* Error Message */}
                        {item.status === "error" && item.errorMessage && (
                          <p className="text-red-600 text-[11px] mt-0.5 flex items-center">
                            <AlertCircle className="w-3 h-3 mr-1 flex-shrink-0" />
                            {item.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action / Status Icon */}
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {item.status === "staged" && (
                        <button
                          onClick={() => removeStagedFile(item.id)}
                          disabled={isUploadingGlobal}
                          className="p-1 rounded text-brand-slate hover:text-red-600 transition-colors"
                          title="Remove from selection"
                          aria-label={`Remove ${item.file.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      {item.status === "uploading" && (
                        <span className="text-xs font-medium text-brand-royal-blue flex items-center space-x-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{item.progress}%</span>
                        </span>
                      )}

                      {item.status === "saving_metadata" && (
                        <span className="text-[11px] font-medium text-brand-slate flex items-center space-x-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Saving...</span>
                        </span>
                      )}

                      {item.status === "success" && (
                        <span className="text-green-700 flex items-center space-x-1 font-medium text-xs">
                          <CheckCircle className="w-4 h-4" />
                          <span>Uploaded</span>
                        </span>
                      )}

                      {item.status === "error" && (
                        <div className="flex items-center space-x-1">
                          {item.storageUploaded ? (
                            <button
                              onClick={() => handleRetryItem(item)}
                              className="inline-flex items-center text-[11px] font-medium text-brand-royal-blue bg-brand-light-blue border border-brand-royal-blue/30 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors"
                              title="Retry saving metadata (file is already uploaded to storage)"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Retry Save
                            </button>
                          ) : (
                            <button
                              onClick={() => removeStagedFile(item.id)}
                              disabled={isUploadingGlobal}
                              className="p-1 rounded text-brand-slate hover:text-red-600 transition-colors"
                              title="Remove"
                              aria-label={`Remove ${item.file.name}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-brand-border bg-brand-off-white rounded-b-lg">
          <button
            type="button"
            onClick={handleClose}
            className="px-3.5 py-1.5 text-xs font-medium text-brand-slate hover:text-brand-dark-navy border border-brand-border rounded bg-brand-white hover:bg-brand-off-white transition-colors"
          >
            {successCount > 0 && validStagedCount === 0 ? "Done" : "Cancel"}
          </button>

          <button
            type="button"
            onClick={handleStartUpload}
            disabled={validStagedCount === 0 || inProgressCount > 0}
            className="px-4 py-2 text-xs font-medium text-brand-white bg-brand-royal-blue hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded shadow-sm transition-colors flex items-center space-x-1.5"
          >
            {inProgressCount > 0 ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading ({inProgressCount})...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                <span>Upload {validStagedCount > 0 ? `(${validStagedCount})` : ""}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
export default FileUploadModal;
