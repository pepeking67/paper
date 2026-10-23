import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/papers/types";
import { MAX_PDF_BYTES } from "@/lib/library/pdf-file";

type PdfAsset = NonNullable<Paper["asset"]>;

export class PdfDownloadError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PdfDownloadError";
  }
}

function storageFailure(error: unknown): PdfDownloadError {
  const record = error && typeof error === "object" ? error as { statusCode?: unknown; status?: unknown } : {};
  const status = Number(record.statusCode ?? record.status) || undefined;
  if (status === 401) return new PdfDownloadError("로그인이 만료되었습니다. 다시 로그인한 뒤 PDF를 불러와 주세요.", status);
  if (status === 403) return new PdfDownloadError("이 PDF를 읽을 권한이 없습니다.", status);
  if (status === 404) return new PdfDownloadError("저장소에서 PDF 파일을 찾을 수 없습니다.", status);
  return new PdfDownloadError("PDF 다운로드가 중단되었습니다. 연결을 확인하고 다시 불러와 주세요.", status);
}

async function validateBytes(blob: Blob, asset: PdfAsset): Promise<Uint8Array> {
  if (!blob.size || blob.size > MAX_PDF_BYTES) throw new PdfDownloadError("받은 PDF 파일의 크기가 올바르지 않습니다.");
  if (asset.byteSize && blob.size !== asset.byteSize) {
    throw new PdfDownloadError(`PDF를 완전히 받지 못했습니다. 예상 ${asset.byteSize.toLocaleString()}바이트 / 수신 ${blob.size.toLocaleString()}바이트. 다시 불러와 주세요.`);
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!new TextDecoder("ascii").decode(bytes.subarray(0, 1024)).includes("%PDF-")) {
    throw new PdfDownloadError("저장소에서 PDF 형식이 아닌 응답을 받았습니다. 다시 불러와 주세요.");
  }
  if (asset.checksum && /^[a-f\d]{64}$/i.test(asset.checksum)) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (checksum !== asset.checksum.toLowerCase()) throw new PdfDownloadError("받은 PDF가 업로드한 원본과 일치하지 않습니다. 다시 불러와 주세요.");
  }
  return bytes;
}

/** Keep the normal cacheable path; only a failed/incomplete download costs a second request. */
export async function downloadPersonalPdf(client: SupabaseClient, asset: PdfAsset, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const bucket = client.storage.from(asset.bucketId);
  try {
    const { data, error } = await bucket.download(asset.objectPath);
    if (error) throw error;
    if (!data) throw new PdfDownloadError("PDF 응답이 비어 있습니다.");
    return await validateBytes(data, asset);
  } catch (error) {
    const failure = error instanceof PdfDownloadError ? error : storageFailure(error);
    if (failure.status && [401, 403, 404].includes(failure.status)) throw failure;
  }

  // RLS authorizes signing with the current user's JWT. Never persist or log this bearer URL.
  try {
    const { data, error } = await bucket.createSignedUrl(asset.objectPath, 120);
    if (error) throw error;
    if (!data?.signedUrl) throw new PdfDownloadError("PDF를 다시 다운로드할 주소를 만들지 못했습니다.");
    const url = new URL(data.signedUrl);
    url.searchParams.set("cacheNonce", crypto.randomUUID());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetcher(url.toString(), {
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (!response.ok) throw storageFailure({ status: response.status });
      // This code requests the complete object. A partial response must never reach PDF.js.
      if (response.status === 206) throw new PdfDownloadError("PDF 전체 대신 일부만 수신했습니다. 다시 불러와 주세요.");
      const declaredSize = Number(response.headers.get("content-length"));
      if (declaredSize > MAX_PDF_BYTES) throw new PdfDownloadError("PDF는 50MB 이하여야 합니다.");
      return await validateBytes(await response.blob(), asset);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error instanceof PdfDownloadError) throw error;
    throw storageFailure(error);
  }
}
