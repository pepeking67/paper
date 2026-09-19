import { emptyStudyTray, type StudyArea, type StudyTrayData } from "@/lib/study-tray/types";
import type { AccountStudyCache, StudyStateSnapshot } from "./types";

export function normalizeTray(value: unknown): StudyTrayData {
  const input = value && typeof value === "object" ? value as Partial<StudyTrayData> : {};
  return {
    ...emptyStudyTray(),
    highlights: Array.isArray(input.highlights) ? input.highlights : [],
    areas: Array.isArray(input.areas) ? input.areas : [],
    insights: Array.isArray(input.insights) ? input.insights : [],
    memos: Array.isArray(input.memos) ? input.memos : [],
  };
}

export function sanitizeTrayForServer(tray: StudyTrayData): StudyTrayData {
  return {
    ...tray,
    areas: (tray.areas ?? []).map((area) => {
      const metadata = { ...area };
      delete metadata.imageDataUrl;
      return metadata as StudyArea;
    }),
  };
}

export function accountCacheKey(userId: string, paperId: string) {
  return `paper-study-account:${userId}:${paperId}`;
}

export function migrationMarkerKey(userId: string, paperId: string) {
  return `paper-study-migrated:${userId}:${paperId}`;
}

export function readAccountCache(userId: string, paperId: string): AccountStudyCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(accountCacheKey(userId, paperId)) ?? "null") as Partial<AccountStudyCache> | null;
    if (!parsed) return null;
    return {
      tray: normalizeTray(parsed.tray),
      noteMarkdown: typeof parsed.noteMarkdown === "string" ? parsed.noteMarkdown : "",
      baseRevision: Number.isInteger(parsed.baseRevision) ? Number(parsed.baseRevision) : 0,
      dirty: parsed.dirty === true,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch { return null; }
}

export function writeAccountCache(userId: string, paperId: string, cache: AccountStudyCache) {
  localStorage.setItem(accountCacheKey(userId, paperId), JSON.stringify(cache));
}

export function readLegacyStudyState(paperId: string): StudyStateSnapshot {
  let tray = emptyStudyTray();
  let noteMarkdown = "";
  try { tray = normalizeTray(JSON.parse(localStorage.getItem(`paper-study-tray:${paperId}`) ?? "null")); } catch { /* Keep empty tray. */ }
  try { noteMarkdown = localStorage.getItem(`paper-study-note:${paperId}`) ?? ""; } catch { /* Keep empty note. */ }
  return { tray, noteMarkdown, revision: 0, updatedAt: new Date().toISOString() };
}

export function hasStudyContent(snapshot: Pick<StudyStateSnapshot, "tray" | "noteMarkdown">) {
  const tray = snapshot.tray;
  return Boolean(snapshot.noteMarkdown.trim() || tray.highlights.length || (tray.areas ?? []).length || tray.insights.length || tray.memos.length);
}

export function hasRevisionConflict(baseRevision: number, serverRevision: number) {
  return baseRevision !== serverRevision;
}
