export type Paper = {
  id: string; title: string; authors: string; year: number | null; tag: string;
  done: boolean; keys: string[]; sourceUrl: string | null; notionUrl: string | null;
  library?: "legacy" | "personal";
  categoryId?: string | null;
  readingStatus?: "unread" | "reading" | "read" | "archived";
  asset?: { id: string; bucketId: string; objectPath: string; originalFilename: string | null; checksum: string | null };
};
export type PdfManifestEntry = {
  id: string; title: string; sourceUrl: string | null; pdfSourceUrl: string | null;
  blobPathname: string | null; sha256: string | null; sizeBytes: number | null;
  version: string | null; uploadStatus: "pending" | "excluded" | "ready" | "failed";
  processingStatus: "pending" | "ready" | "failed" | "not-applicable"; reason: string;
};
