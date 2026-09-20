import type { SupabaseClient } from "@supabase/supabase-js";

type CleanupItem = { bucket: "paper-pdfs" | "paper-area-crops"; path: string };

function key(userId: string) { return `paper-study-storage-cleanup:${userId}`; }

export function queueStorageCleanup(userId: string, items: CleanupItem[]) {
  const pending = readQueue(userId);
  const combined = [...pending, ...items].filter((item, index, all) => all.findIndex((candidate) => candidate.bucket === item.bucket && candidate.path === item.path) === index);
  localStorage.setItem(key(userId), JSON.stringify(combined));
}

export async function flushStorageCleanup(client: SupabaseClient, userId: string) {
  const pending = readQueue(userId);
  const failed: CleanupItem[] = [];
  for (const bucket of ["paper-pdfs", "paper-area-crops"] as const) {
    const items = pending.filter((item) => item.bucket === bucket);
    if (!items.length) continue;
    const result = await client.storage.from(bucket).remove(items.map((item) => item.path));
    if (result.error) failed.push(...items);
  }
  if (failed.length) localStorage.setItem(key(userId), JSON.stringify(failed));
  else localStorage.removeItem(key(userId));
  return failed.length;
}

function readQueue(userId: string): CleanupItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CleanupItem => Boolean(item && typeof item === "object" && (item as CleanupItem).bucket && typeof (item as CleanupItem).path === "string"));
  } catch { return []; }
}
