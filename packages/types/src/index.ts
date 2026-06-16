/**
 * Shared TypeScript contracts between the web client and the API.
 * These mirror the Prisma models plus the request/response payloads
 * exchanged over HTTP.
 */

export type FileStatus = "PENDING" | "PROCESSING" | "DONE" | "ERROR";

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  userId: string;
  parentId: string | null;
  createdAt: string;
}

export interface AudioJob {
  id: string;
  fileId: string;
  audioPath: string | null;
  duration: number | null;
  /** Conversion progress, 0–100. */
  progress: number;
  lastPosition: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileRecord {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  status: FileStatus;
  userId: string;
  folderId: string | null;
  audioJob: AudioJob | null;
  createdAt: string;
}

/**
 * A folder enriched with its child folders and files — the recursive shape
 * returned by `GET /files`.
 */
export interface FolderNode extends Folder {
  children: FolderNode[];
  files: FileRecord[];
}

/** Full tree returned by `GET /files`. */
export interface FileTree {
  folders: FolderNode[];
  /** Files that live at the root (no folder). */
  files: FileRecord[];
}

/* ----------------------------- Auth payloads ----------------------------- */

export interface RegisterBody {
  email: string;
  password: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

/* ----------------------------- File payloads ----------------------------- */

export interface UploadResponse {
  file: FileRecord;
}

/* ---------------------------- Folder payloads ---------------------------- */

export interface CreateFolderBody {
  name: string;
  parentId?: string | null;
}

export interface CreateFolderResponse {
  folder: Folder;
}

/* ----------------------------- Job payloads ------------------------------ */

/** Which text-to-speech engine to use for a conversion. */
export type TtsProvider = "gemini" | "azure";

export interface CreateJobBody {
  fileId: string;
  /** Defaults to "gemini" when omitted. */
  provider?: TtsProvider;
}

export interface CreateJobResponse {
  jobId: string;
  fileId: string;
  status: FileStatus;
}

export interface JobStatusResponse {
  id: string;
  fileId: string;
  status: FileStatus;
  audioPath: string | null;
  duration: number | null;
  /** Conversion progress, 0–100. */
  progress: number;
  lastPosition: number;
}

export interface UpdatePositionBody {
  lastPosition: number;
}

/* ----------------------------- TTS quota --------------------------------- */

/** Gemini free-tier daily-usage snapshot, returned by `GET /tts/quota`. */
export interface TtsQuotaResponse {
  gemini: {
    /** Requests counted as used today (estimate). */
    used: number;
    /** Daily request cap on the free tier (100). */
    limit: number;
    /** max(0, limit - used). */
    remaining: number;
    /** Rough estimate of book-pages still convertible today via Gemini. */
    estimatedPagesRemaining: number;
    /** True once Gemini returned a per-day quota 429. */
    exhausted: boolean;
    /** Seconds until the daily quota resets, when known. */
    resetsInSeconds: number | null;
  };
  /** Whether an Azure Speech key is configured (so Azure can be offered). */
  azureAvailable: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
