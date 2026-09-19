export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function validatePdfFile(file: File) {
  if (file.type !== "application/pdf") throw new Error("application/pdf 형식의 파일만 업로드할 수 있습니다.");
  if (file.size <= 0 || file.size > MAX_PDF_BYTES) throw new Error("PDF는 50MB 이하여야 합니다.");
  const signature = new TextDecoder("ascii").decode(await file.slice(0, 5).arrayBuffer());
  if (signature !== "%PDF-") throw new Error("파일 내용이 유효한 PDF가 아닙니다.");
  const filename = sanitizePdfFilename(file.name);
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { filename, checksum, size: file.size, contentType: "application/pdf" as const };
}

export function sanitizePdfFilename(value: string) {
  const withoutExtension = value.replace(/\.pdf$/iu, "");
  const stem = withoutExtension.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/-+/gu, "-").replace(/^[-.]+|[-.]+$/gu, "").slice(0, 116);
  return `${stem || "paper"}.pdf`;
}

export function isOwnedStoragePath(path: string, userId: string, paperId: string) {
  return path.startsWith(`${userId}/${paperId}/`) && !path.includes("..") && !path.includes("//");
}
