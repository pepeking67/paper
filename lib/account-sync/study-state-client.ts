import type { StudyTrayData } from "@/lib/study-tray/types";
import { getAccountSyncConfig } from "./config";
import type { AccountSession } from "./types";

export type RemoteStudyState = {
  paperId: string;
  tray: StudyTrayData;
  noteMarkdown: string;
  revision: number;
  updatedAt: string;
};

export class StudySyncConflictError extends Error {
  constructor() {
    super("다른 기기에서 더 새 버전이 저장되어 있습니다.");
    this.name = "StudySyncConflictError";
  }
}

type RemoteRow = { paper_id?: unknown; tray?: unknown; note_markdown?: unknown; revision?: unknown; updated_at?: unknown };

export async function fetchRemoteStudyState(paperId: string, session: AccountSession): Promise<RemoteStudyState | null> {
  const config = requiredConfig();
  const params = new URLSearchParams({ paper_id: `eq.${paperId}`, select: "paper_id,tray,note_markdown,revision,updated_at", limit: "1" });
  const response = await fetch(`${config.url}/rest/v1/paper_study_states?${params}`, {
    headers: authHeaders(config.anonKey, session),
    cache: "no-store",
  });
  const rows = await readRows(response);
  return rows[0] ? normalizeRemoteRow(rows[0]) : null;
}

export async function saveRemoteStudyState(paperId: string, tray: StudyTrayData, noteMarkdown: string, session: AccountSession, expectedRevision: number | null): Promise<RemoteStudyState> {
  const config = requiredConfig();
  const select = "paper_id,tray,note_markdown,revision,updated_at";
  let response: Response;
  if (expectedRevision === null) {
    response = await fetch(`${config.url}/rest/v1/paper_study_states?select=${encodeURIComponent(select)}`, {
      method: "POST",
      headers: { ...authHeaders(config.anonKey, session), "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ user_id: session.user.id, paper_id: paperId, tray, note_markdown: noteMarkdown, revision: 1 }),
    });
    if (response.status === 409) throw new StudySyncConflictError();
  } else {
    const params = new URLSearchParams({ paper_id: `eq.${paperId}`, revision: `eq.${expectedRevision}`, select });
    response = await fetch(`${config.url}/rest/v1/paper_study_states?${params}`, {
      method: "PATCH",
      headers: { ...authHeaders(config.anonKey, session), "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ tray, note_markdown: noteMarkdown, revision: expectedRevision + 1 }),
    });
  }
  const rows = await readRows(response);
  if (!rows[0]) throw new StudySyncConflictError();
  return normalizeRemoteRow(rows[0]);
}

function requiredConfig() {
  const config = getAccountSyncConfig();
  if (!config) throw new Error("Supabase 계정 동기화 환경 변수가 설정되지 않았습니다.");
  return config;
}
function authHeaders(anonKey: string, session: AccountSession) { return { apikey: anonKey, Authorization: `Bearer ${session.accessToken}` }; }
async function readRows(response: Response): Promise<RemoteRow[]> {
  const data = await response.json().catch(() => null) as RemoteRow[] | { message?: unknown; details?: unknown } | null;
  if (!response.ok) {
    const detail = data && !Array.isArray(data) ? [data.message, data.details].find((value): value is string => typeof value === "string") : undefined;
    throw new Error(detail || `동기화 요청 실패 (HTTP ${response.status})`);
  }
  return Array.isArray(data) ? data : [];
}
function normalizeRemoteRow(row: RemoteRow): RemoteStudyState {
  if (typeof row.paper_id !== "string" || typeof row.revision !== "number" || typeof row.updated_at !== "string") throw new Error("서버 학습 데이터 형식이 올바르지 않습니다.");
  const rawTray = row.tray && typeof row.tray === "object" ? row.tray as Partial<StudyTrayData> : {};
  return {
    paperId: row.paper_id,
    tray: {
      highlights: Array.isArray(rawTray.highlights) ? rawTray.highlights : [],
      areas: Array.isArray(rawTray.areas) ? rawTray.areas : [],
      insights: Array.isArray(rawTray.insights) ? rawTray.insights : [],
      memos: Array.isArray(rawTray.memos) ? rawTray.memos : [],
    },
    noteMarkdown: typeof row.note_markdown === "string" ? row.note_markdown : "",
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}
