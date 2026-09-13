import { manifestEntry, isSafeBlobPath } from "@/lib/papers/manifest";
import { privateBlobExists, putPrivatePdf } from "@/lib/blob/private-pdf";
import { assertMatchingArxivId, readPdfResponse, sha256 } from "./validate-pdf";
import { PdfSyncError, type SyncDependencies, type SyncResult } from "./types";

const DOWNLOAD_TIMEOUT_MS = 25_000;
const defaults: SyncDependencies = { getEntry: manifestEntry, blobExists: privateBlobExists, upload: putPrivatePdf, fetchPdf: fetch };

export async function syncPaper(paperId: string, dependencies: SyncDependencies = defaults): Promise<SyncResult> {
  if (!/^[A-Za-z]+_\d+$/.test(paperId)) throw new PdfSyncError("INVALID_PAPER_ID", "Invalid paper ID", 400);
  const entry = dependencies.getEntry(paperId);
  if (!entry) throw new PdfSyncError("UNKNOWN_PAPER", "Unknown paper ID", 404);
  if (entry.uploadStatus === "excluded") throw new PdfSyncError("EXCLUDED_PAPER", entry.reason || "Paper is excluded", 422);
  if (!entry.pdfSourceUrl) throw new PdfSyncError("MISSING_PDF_URL", "Paper has no PDF source URL", 422);
  if (!entry.blobPathname || !isSafeBlobPath(entry.blobPathname)) throw new PdfSyncError("INVALID_BLOB_PATH", "Paper has no safe Blob pathname", 422);
  if (await dependencies.blobExists(entry.blobPathname)) return { paperId, status: "skipped", reason: "Already uploaded", blobPathname: entry.blobPathname };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    let response: Response;
    try { response = await dependencies.fetchPdf(entry.pdfSourceUrl, { signal: controller.signal, redirect: "follow" }); }
    catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new PdfSyncError("DOWNLOAD_TIMEOUT", "PDF download timed out", 504);
      throw new PdfSyncError("DOWNLOAD_FAILED", "PDF download failed", 502);
    }
    assertMatchingArxivId(entry.sourceUrl ?? entry.pdfSourceUrl, response.url);
    const bytes = await readPdfResponse(response);
    const digest = sha256(bytes);
    try { await dependencies.upload(entry.blobPathname, bytes); }
    catch { throw new PdfSyncError("UPLOAD_FAILED", "Private Blob upload failed", 502); }
    return { paperId, status: "uploaded", blobPathname: entry.blobPathname, sizeBytes: bytes.byteLength, sha256: digest };
  } finally { clearTimeout(timeout); }
}
