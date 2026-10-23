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

function storageFailure(error: unknown, stage = "PDF 다운로드"): PdfDownloadError {
  const record = error && typeof error === "object" ? error as { statusCode?: unknown; status?: unknown } : {};
  const status = Number(record.statusCode ?? record.status) || undefined;
  if (status === 401) return new PdfDownloadError("로그인이 만료되었습니다. 다시 로그인한 뒤 PDF를 불러와 주세요.", status);
  if (status === 403) return new PdfDownloadError("이 PDF를 읽을 권한이 없습니다.", status);
  if (status === 404) return new PdfDownloadError("저장소에서 PDF 파일을 찾을 수 없습니다.", status);
  return new PdfDownloadError(`${stage} 단계에서 연결이 중단되었습니다. PDF 다시 불러오기를 눌러 주세요.`, status);
}

async function validateBytes(bytes: Uint8Array, asset: PdfAsset): Promise<Uint8Array> {
  if (!bytes.byteLength || bytes.byteLength > MAX_PDF_BYTES) throw new PdfDownloadError("받은 PDF 파일의 크기가 올바르지 않습니다.");
  if (asset.byteSize && bytes.byteLength !== asset.byteSize) {
    throw new PdfDownloadError(`PDF를 완전히 받지 못했습니다. 예상 ${asset.byteSize.toLocaleString()}바이트 / 수신 ${bytes.byteLength.toLocaleString()}바이트. 다시 불러와 주세요.`);
  }

  if (!new TextDecoder("ascii").decode(bytes.subarray(0, 1024)).includes("%PDF-")) {
    throw new PdfDownloadError("저장소에서 PDF 형식이 아닌 응답을 받았습니다. 다시 불러와 주세요.");
  }
  if (asset.checksum && /^[a-f\d]{64}$/i.test(asset.checksum)) {
    const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
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
    return await validateBytes(new Uint8Array(await data.arrayBuffer()), asset);
  } catch (error) {
    const failure = error instanceof PdfDownloadError ? error : storageFailure(error);
    if (failure.status && [401, 403, 404].includes(failure.status)) throw failure;
  }

  // RLS authorizes signing with the current user's JWT. Never persist or log this bearer URL.
  let stage = "PDF 다운로드 주소 생성";
  try {
    const { data, error } = await bucket.createSignedUrl(asset.objectPath, 120);
    if (error) throw error;
    if (!data?.signedUrl) throw new PdfDownloadError("PDF를 다시 다운로드할 주소를 만들지 못했습니다.");
    const url = new URL(data.signedUrl);
    url.searchParams.set("cacheNonce", crypto.randomUUID());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      stage = "PDF 서버 연결";
      const response = await fetcher(url.toString(), {
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (!response.ok) throw storageFailure({ status: response.status });
      // This code requests the complete object. A partial response must never reach PDF.js.
      if (response.status === 206) throw new PdfDownloadError("PDF 전체 대신 일부만 수신했습니다. 다시 불러와 주세요.");
      const declaredSize = Number(response.headers.get("content-length"));
      if (declaredSize > MAX_PDF_BYTES) throw new PdfDownloadError("PDF는 50MB 이하여야 합니다.");
      stage = "PDF 수신";
      return await validateBytes(await readPdfResponse(response, asset.byteSize), asset);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error instanceof PdfDownloadError) throw error;
    throw storageFailure(error, stage);
  }
}


/** Avoid response.blob(): Chromium can spill large Blobs to profile disk storage. */
async function readPdfResponse(response: Response, expectedSize?: number | null): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const limit = expectedSize && expectedSize > 0 ? Math.min(expectedSize, MAX_PDF_BYTES) : MAX_PDF_BYTES;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        await reader.cancel().catch(() => undefined);
        throw new PdfDownloadError("서버에서 예상 용량을 초과한 PDF 응답을 받았습니다.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PdfDownloadError) throw error;
    const expected = expectedSize ? ` / 예상 ${expectedSize.toLocaleString()}바이트` : "";
    throw new PdfDownloadError(`PDF 수신 중 연결이 중단되었습니다. 수신 ${received.toLocaleString()}바이트${expected}. PDF 다시 불러오기를 눌러 주세요.`);
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
