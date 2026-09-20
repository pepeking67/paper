import type { StudyArea } from "@/lib/study-tray/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { isOwnedStoragePath } from "@/lib/library/pdf-file";

const AREA_BUCKET = "paper-area-crops";
const MAX_AREA_BYTES = 5 * 1024 * 1024;

export async function uploadAreaCrop(userId: string, paperId: string, area: StudyArea) {
  if (!area.imageDataUrl) throw new Error("업로드할 영역 이미지가 없습니다.");
  const client = getBrowserSupabase();
  if (!client) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const blob = await compressAreaImage(area.imageDataUrl);
  if (blob.size > MAX_AREA_BYTES) throw new Error("압축된 영역 이미지가 5MB를 초과합니다.");
  const objectPath = `${userId}/${paperId}/${area.id}.webp`;
  if (!isOwnedStoragePath(objectPath, userId, paperId)) throw new Error("잘못된 영역 이미지 경로입니다.");
  const upload = await client.storage.from(AREA_BUCKET).upload(objectPath, blob, { contentType: "image/webp", upsert: true });
  if (upload.error) throw upload.error;
  const metadata = await client.from("paper_area_assets").upsert({
    user_id: userId,
    paper_id: paperId,
    area_id: area.id,
    page: area.page,
    rect: area.rect,
    bucket_id: AREA_BUCKET,
    object_path: objectPath,
    memo: area.memo,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,paper_id,area_id" });
  if (metadata.error) { await client.storage.from(AREA_BUCKET).remove([objectPath]); throw metadata.error; }
  return objectPath;
}

export async function loadAreaDataUrl(storagePath: string) {
  const client = getBrowserSupabase();
  if (!client) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { data, error } = await client.storage.from(AREA_BUCKET).download(storagePath);
  if (error) throw error;
  return blobToDataUrl(data);
}

export function queueAreaDeletion(userId: string, paperId: string, area: StudyArea) {
  if (!area.storagePath || !isOwnedStoragePath(area.storagePath, userId, paperId)) return;
  const key = deletionQueueKey(userId);
  const current = readDeletionQueue(userId);
  if (!current.some((item) => item.storagePath === area.storagePath)) {
    current.push({ paperId, areaId: area.id, storagePath: area.storagePath });
    localStorage.setItem(key, JSON.stringify(current));
  }
}

export async function flushAreaDeletionQueue(userId: string) {
  if (!navigator.onLine) return;
  const client = getBrowserSupabase();
  if (!client) return;
  const remaining: AreaDeletion[] = [];
  for (const item of readDeletionQueue(userId)) {
    const row = await client.from("paper_area_assets").delete().eq("user_id", userId).eq("paper_id", item.paperId).eq("area_id", item.areaId);
    const object = row.error ? { error: row.error } : await client.storage.from(AREA_BUCKET).remove([item.storagePath]);
    if (row.error || object.error) remaining.push(item);
  }
  localStorage.setItem(deletionQueueKey(userId), JSON.stringify(remaining));
}

async function compressAreaImage(dataUrl: string) {
  if (!/^data:image\/(?:png|jpeg|webp);base64,/u.test(dataUrl)) throw new Error("지원하지 않는 영역 이미지 형식입니다.");
  const image = await loadImage(dataUrl);
  const maximum = 1800;
  const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("영역 이미지를 처리할 수 없습니다.");
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("영역 이미지 압축에 실패했습니다.");
  return blob;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("영역 이미지를 읽을 수 없습니다."));
    image.src = src;
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("영역 이미지를 변환할 수 없습니다."));
    reader.onerror = () => reject(reader.error ?? new Error("영역 이미지를 변환할 수 없습니다."));
    reader.readAsDataURL(blob);
  });
}

type AreaDeletion = { paperId: string; areaId: string; storagePath: string };
function deletionQueueKey(userId: string) { return `paper-study-area-delete-queue:${userId}`; }
function readDeletionQueue(userId: string): AreaDeletion[] {
  try {
    const value = JSON.parse(localStorage.getItem(deletionQueueKey(userId)) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is AreaDeletion => Boolean(item && typeof item === "object" && typeof (item as AreaDeletion).paperId === "string" && typeof (item as AreaDeletion).areaId === "string" && typeof (item as AreaDeletion).storagePath === "string")) : [];
  } catch { return []; }
}
