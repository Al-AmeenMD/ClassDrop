export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "csv",
  "txt",
  "zip",
  "png",
  "jpg",
  "jpeg",
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

/**
 * Canonical MIME types for each allowed extension strictly accepted by storage.rules
 */
export const EXTENSION_TO_CANONICAL_MIME: Record<AllowedExtension, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/**
 * Permitted browser-reported MIME types for each allowed extension
 */
export const ACCEPTED_MIMES_BY_EXTENSION: Record<AllowedExtension, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  csv: [
    "text/csv",
    "text/plain",
    "application/csv",
    "text/x-csv",
    "application/vnd.ms-excel",
  ],
  txt: ["text/plain"],
  zip: ["application/zip", "application/x-zip-compressed"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
};

/**
 * Generic or placeholder MIME types reported by browsers/OS when specific type cannot be determined
 */
export const GENERIC_MIME_TYPES = [
  "",
  "application/octet-stream",
  "application/x-download",
  "binary/octet-stream",
  "application/unknown",
];

export const ALLOWED_MIME_TYPES: Record<string, AllowedExtension[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
  "application/zip": ["zip"],
  "application/x-zip-compressed": ["zip"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
};

export const MAX_FILE_SIZE_BYTES = 52428800; // 50MB exactly

/**
 * Extracts and normalizes the extension from a file name
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return "";
  }
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Formats a byte number into human-readable units (KB, MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  resolvedMimeType?: string;
}

/**
 * Validates a file against allowed extensions, MIME types, and maximum size (50MB).
 * Resolves the appropriate canonical MIME type accepted by Cloud Storage.
 */
export function validateFile(file: File): FileValidationResult {
  if (file.size <= 0) {
    return { valid: false, error: "File is empty (0 bytes)." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 50MB limit (${formatFileSize(file.size)}).`,
    };
  }

  const ext = getFileExtension(file.name);
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    return {
      valid: false,
      error: `Unsupported file type (.${ext || "unknown"}). Allowed: ${ALLOWED_EXTENSIONS.join(", ").toUpperCase()}.`,
    };
  }

  const allowedExt = ext as AllowedExtension;
  const canonicalMime = EXTENSION_TO_CANONICAL_MIME[allowedExt];
  const reportedType = file.type ? file.type.trim().toLowerCase() : "";

  // If File.type is empty or generic, infer the canonical MIME type from the validated extension
  if (!reportedType || GENERIC_MIME_TYPES.includes(reportedType)) {
    return {
      valid: true,
      resolvedMimeType: canonicalMime,
    };
  }

  // If browser reported a specific MIME type, verify it matches the extension
  const acceptableMimes = ACCEPTED_MIMES_BY_EXTENSION[allowedExt] || [];
  if (acceptableMimes.includes(reportedType)) {
    return {
      valid: true,
      resolvedMimeType: canonicalMime,
    };
  }

  // The supplied MIME type is specific but conflicts with the extension
  return {
    valid: false,
    error: `MIME type "${file.type}" does not match the expected format for .${ext} files.`,
  };
}

/**
 * Formats timestamps or dates for display
 */
export function formatDisplayDate(dateInput: any): string {
  if (!dateInput) return "—";

  let date: Date;
  if (typeof dateInput.toDate === "function") {
    date = dateInput.toDate();
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else if (typeof dateInput === "number" || typeof dateInput === "string") {
    date = new Date(dateInput);
  } else {
    return "—";
  }

  if (isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

