import type { AnnotationColor, AnnotationKind } from "@/lib/study-tray/types";

export type AnnotationTool = AnnotationKind | "area" | "erase";

export type PaperUiState = {
  version: 1;
  page: number;
  zoom: number;
  annotationTool: AnnotationTool;
  annotationColor: AnnotationColor;
  chatDraft: string;
  questionHighlightIds: string[];
  questionAreaIds: string[];
  updatedAt: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const annotationTools = new Set<AnnotationTool>(["highlight", "underline", "area", "erase"]);
const annotationColors = new Set<AnnotationColor>(["yellow", "green", "blue", "pink", "purple"]);

export function paperUiStorageKey(userId: string, paperId: string) {
  return `paper-study-ui:v1:${userId}:${paperId}`;
}

export function defaultPaperUiState(): PaperUiState {
  return {
    version: 1,
    page: 1,
    zoom: 100,
    annotationTool: "highlight",
    annotationColor: "yellow",
    chatDraft: "",
    questionHighlightIds: [],
    questionAreaIds: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function readPaperUiState(userId: string, paperId: string, storage = getBrowserStorage()): PaperUiState {
  const fallback = defaultPaperUiState();
  if (!storage) return fallback;
  try {
    const parsed = JSON.parse(storage.getItem(paperUiStorageKey(userId, paperId)) ?? "null") as Partial<PaperUiState> | null;
    if (!parsed || parsed.version !== 1) return fallback;
    return {
      version: 1,
      page: clampInteger(parsed.page, 1, 100_000, fallback.page),
      zoom: clampInteger(parsed.zoom, 75, 250, fallback.zoom),
      annotationTool: annotationTools.has(parsed.annotationTool as AnnotationTool) ? parsed.annotationTool as AnnotationTool : fallback.annotationTool,
      annotationColor: annotationColors.has(parsed.annotationColor as AnnotationColor) ? parsed.annotationColor as AnnotationColor : fallback.annotationColor,
      chatDraft: typeof parsed.chatDraft === "string" ? parsed.chatDraft.slice(0, 4_000) : fallback.chatDraft,
      questionHighlightIds: sanitizeIds(parsed.questionHighlightIds),
      questionAreaIds: sanitizeIds(parsed.questionAreaIds).slice(-4),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : fallback.updatedAt,
    };
  } catch {
    return fallback;
  }
}

export function updatePaperUiState(userId: string, paperId: string, patch: Partial<Omit<PaperUiState, "version" | "updatedAt">>, storage = getBrowserStorage()) {
  if (!storage) return;
  const current = readPaperUiState(userId, paperId, storage);
  const next: PaperUiState = {
    ...current,
    ...patch,
    version: 1,
    page: clampInteger(patch.page ?? current.page, 1, 100_000, current.page),
    zoom: clampInteger(patch.zoom ?? current.zoom, 75, 250, current.zoom),
    chatDraft: (patch.chatDraft ?? current.chatDraft).slice(0, 4_000),
    questionHighlightIds: sanitizeIds(patch.questionHighlightIds ?? current.questionHighlightIds),
    questionAreaIds: sanitizeIds(patch.questionAreaIds ?? current.questionAreaIds).slice(-4),
    updatedAt: new Date().toISOString(),
  };
  try { storage.setItem(paperUiStorageKey(userId, paperId), JSON.stringify(next)); }
  catch { /* Keep the current in-memory UI state when browser storage is unavailable. */ }
}

export function chatHistoryStorageKey(userId: string, paperId: string) {
  return `paper-study-chat:v2:${userId}:${paperId}`;
}

export function migrateLegacyChatHistory(userId: string, paperId: string, storage = getBrowserStorage()) {
  if (!storage) return null;
  const accountKey = chatHistoryStorageKey(userId, paperId);
  const existing = storage.getItem(accountKey);
  if (existing !== null) return existing;

  const markerKey = `paper-study-chat-migrated:v2:${paperId}`;
  if (storage.getItem(markerKey) === "true") return null;
  const legacy = storage.getItem(`paper-study-chat:${paperId}`);
  try {
    if (legacy !== null) storage.setItem(accountKey, legacy);
    storage.setItem(markerKey, "true");
  } catch { /* The legacy record remains untouched as a backup. */ }
  return legacy;
}

function sanitizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))].slice(-100);
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value)))
    : fallback;
}

function getBrowserStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
