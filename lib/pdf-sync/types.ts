import type { PdfManifestEntry } from "@/lib/papers/types";

export type SyncStatus = "uploaded" | "skipped" | "failed";
export type SyncResult = {
  paperId: string;
  status: SyncStatus;
  reason?: string;
  blobPathname?: string;
  sizeBytes?: number;
  sha256?: string;
};

export type SyncDependencies = {
  getEntry: (paperId: string) => PdfManifestEntry | undefined;
  blobExists: (pathname: string) => Promise<boolean>;
  upload: (pathname: string, bytes: Uint8Array) => Promise<unknown>;
  fetchPdf: typeof fetch;
};

export class PdfSyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) { super(message); }
}
