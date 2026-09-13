import { createHash } from "node:crypto";
import { PdfSyncError } from "./types";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function readPdfResponse(
  response: Response,
  maximumBytes = MAX_PDF_BYTES,
): Promise<Uint8Array> {
  if (!response.ok) throw new PdfSyncError("SOURCE_HTTP_ERROR", `PDF source returned HTTP ${response.status}`, 502);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/pdf")) throw new PdfSyncError("NOT_A_PDF", "Source did not return a PDF", 422);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new PdfSyncError("PDF_TOO_LARGE", "PDF exceeds the maximum size", 413);
  if (!response.body) throw new PdfSyncError("EMPTY_RESPONSE", "PDF source returned no body", 502);

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) { await reader.cancel(); throw new PdfSyncError("PDF_TOO_LARGE", "PDF exceeds the maximum size", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") throw new PdfSyncError("NOT_A_PDF", "Downloaded file is not a PDF", 422);
  return bytes;
}

export function assertMatchingArxivId(sourceUrl: string, finalUrl: string): void {
  const expected = sourceUrl.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i)?.[1];
  if (expected && !decodeURIComponent(finalUrl).includes(expected)) throw new PdfSyncError("ARXIV_ID_MISMATCH", "Downloaded arXiv ID does not match the manifest", 422);
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
