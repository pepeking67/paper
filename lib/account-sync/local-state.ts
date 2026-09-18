import { emptyStudyTray, type StudyTrayData } from "@/lib/study-tray/types";

export type LocalStudySnapshot = {
  tray: StudyTrayData;
  noteMarkdown: string;
  dirty: boolean;
  changedAt: number | null;
  remoteRevision: number | null;
  remoteUpdatedAt: string | null;
};

const ACCOUNT_CACHE_PREFIX = "paper-study-account-cache:";
const LEGACY_MIGRATION_PREFIX = "paper-study-legacy-migrated:";

export function emptyLocalStudySnapshot(): LocalStudySnapshot {
  return { tray: emptyStudyTray(), noteMarkdown: "", dirty: false, changedAt: null, remoteRevision: null, remoteUpdatedAt: null };
}

export function hasStudyContent(snapshot: Pick<LocalStudySnapshot, "tray" | "noteMarkdown">): boolean {
  const tray = snapshot.tray;
  return Boolean(snapshot.noteMarkdown.trim() || tray.highlights.length || (tray.areas?.length ?? 0) || tray.insights.length || tray.memos.length);
}

export function hasAccountStudySnapshot(paperId: string, accountId: string): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(accountCacheKey(accountId, paperId)) !== null; } catch { return false; }
}

export function readLocalStudySnapshot(paperId: string, accountId?: string): LocalStudySnapshot {
  if (typeof window === "undefined") return emptyLocalStudySnapshot();
  if (accountId) {
    try {
      const parsed = JSON.parse(localStorage.getItem(accountCacheKey(accountId, paperId)) ?? "null") as Partial<LocalStudySnapshot> | null;
      return parsed ? normalizeSnapshot(parsed) : emptyLocalStudySnapshot();
    } catch { return emptyLocalStudySnapshot(); }
  }
  try {
    const trayRaw = JSON.parse(localStorage.getItem(`paper-study-tray:${paperId}`) ?? "null") as Partial<StudyTrayData> | null;
    const tray = normalizeTray(trayRaw);
    const noteMarkdown = localStorage.getItem(`paper-study-note:${paperId}`) ?? "";
    return { ...emptyLocalStudySnapshot(), tray, noteMarkdown };
  } catch { return emptyLocalStudySnapshot(); }
}

export function migrateLegacyStudyStateToAccount(paperId: string, accountId: string): LocalStudySnapshot | null {
  if (typeof window === "undefined") return null;
  if (hasAccountStudySnapshot(paperId, accountId)) return readLocalStudySnapshot(paperId, accountId);
  const marker = migrationMarkerKey(accountId, paperId);
  try {
    if (localStorage.getItem(marker)) return null;
    const legacy = readLocalStudySnapshot(paperId);
    localStorage.setItem(marker, new Date().toISOString());
    if (!hasStudyContent(legacy)) return null;
    const migrated: LocalStudySnapshot = { ...legacy, dirty: true, changedAt: Date.now() };
    writeLocalStudySnapshot(paperId, accountId, migrated);
    return migrated;
  } catch { return null; }
}

export function persistLocalStudyContent(paperId: string, accountId: string | undefined, tray: StudyTrayData, noteMarkdown: string): LocalStudySnapshot {
  const current = readLocalStudySnapshot(paperId, accountId);
  const next: LocalStudySnapshot = { ...current, tray: normalizeTray(tray), noteMarkdown, dirty: Boolean(accountId), changedAt: Date.now() };
  writeLocalStudySnapshot(paperId, accountId, next);
  return next;
}

export function writeRemoteStudySnapshot(paperId: string, accountId: string, tray: StudyTrayData, noteMarkdown: string, revision: number, updatedAt: string): LocalStudySnapshot {
  const next: LocalStudySnapshot = {
    tray: normalizeTray(tray),
    noteMarkdown,
    dirty: false,
    changedAt: Date.parse(updatedAt) || Date.now(),
    remoteRevision: revision,
    remoteUpdatedAt: updatedAt,
  };
  writeLocalStudySnapshot(paperId, accountId, next);
  return next;
}

export function markLocalStudySynced(paperId: string, accountId: string, revision: number, updatedAt: string): LocalStudySnapshot {
  const current = readLocalStudySnapshot(paperId, accountId);
  const next = { ...current, dirty: false, changedAt: Date.parse(updatedAt) || current.changedAt, remoteRevision: revision, remoteUpdatedAt: updatedAt };
  writeLocalStudySnapshot(paperId, accountId, next);
  return next;
}

export function writeLocalStudySnapshot(paperId: string, accountId: string | undefined, snapshot: LocalStudySnapshot) {
  if (typeof window === "undefined") return;
  try {
    if (accountId) {
      localStorage.setItem(accountCacheKey(accountId, paperId), JSON.stringify(snapshot));
      return;
    }
    localStorage.setItem(`paper-study-tray:${paperId}`, JSON.stringify(snapshot.tray));
    localStorage.setItem(`paper-study-note:${paperId}`, snapshot.noteMarkdown);
  } catch {}
}

function normalizeSnapshot(value: Partial<LocalStudySnapshot>): LocalStudySnapshot {
  return {
    tray: normalizeTray(value.tray),
    noteMarkdown: typeof value.noteMarkdown === "string" ? value.noteMarkdown : "",
    dirty: value.dirty === true,
    changedAt: typeof value.changedAt === "number" ? value.changedAt : null,
    remoteRevision: typeof value.remoteRevision === "number" ? value.remoteRevision : null,
    remoteUpdatedAt: typeof value.remoteUpdatedAt === "string" ? value.remoteUpdatedAt : null,
  };
}

function normalizeTray(value: Partial<StudyTrayData> | StudyTrayData | null | undefined): StudyTrayData {
  return {
    highlights: Array.isArray(value?.highlights) ? value.highlights : [],
    areas: Array.isArray(value?.areas) ? value.areas : [],
    insights: Array.isArray(value?.insights) ? value.insights : [],
    memos: Array.isArray(value?.memos) ? value.memos : [],
  };
}

function accountCacheKey(accountId: string, paperId: string) { return `${ACCOUNT_CACHE_PREFIX}${accountId}:${paperId}`; }
function migrationMarkerKey(accountId: string, paperId: string) { return `${LEGACY_MIGRATION_PREFIX}${accountId}:${paperId}`; }
