export interface ClassroomSettings {
  title: string;
  description: string;
  updatedAt: any;
  updatedBy: string;
}

export interface Resource {
  id: string;
  title: string;
  description: string;
  fileName: string;
  storagePath: string;
  fileType: string;
  fileExtension: string;
  fileSizeBytes: number;
  isPublished: boolean;
  downloadInitiations: number;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
}

export interface PublicResource {
  id: string;
  title: string;
  description: string;
  fileType: string;
  fileExtension: string;
  fileSize: number;
  publishedAt: any;
}

export interface DownloadLog {
  id?: string;
  resourceId: string;
  downloadedAt: any;
  expireAt: any;
}

export interface AdminRecord {
  email: string;
  role: "admin";
  authorizedAt: any;
}

