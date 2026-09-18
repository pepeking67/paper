import { getAccountSyncConfig } from "./config";
import type { AccountSession, AccountUser } from "./types";

const ACCOUNT_SESSION_KEY = "paper-study-account-session";
export const ACCOUNT_SESSION_EVENT = "paper-study-account-session-changed";

type RawAuthResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  expires_in?: unknown;
  user?: { id?: unknown; email?: unknown } | null;
};

export function getStoredAccountSession(): AccountSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNT_SESSION_KEY) ?? "null") as AccountSession | null;
    return isAccountSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAccountSession(session: AccountSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) localStorage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(ACCOUNT_SESSION_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(ACCOUNT_SESSION_EVENT));
}

export async function signInWithPassword(email: string, password: string): Promise<AccountSession> {
  const raw = await authRequest("/auth/v1/token?grant_type=password", { email, password });
  const session = normalizeSession(raw);
  if (!session) throw new Error("로그인 세션을 받지 못했습니다.");
  saveAccountSession(session);
  return session;
}

export async function signUpWithPassword(email: string, password: string): Promise<{ session: AccountSession | null; user: AccountUser | null }> {
  const raw = await authRequest("/auth/v1/signup", { email, password });
  const session = normalizeSession(raw);
  const user = normalizeUser(raw.user);
  if (session) saveAccountSession(session);
  return { session, user };
}

export async function resolveAccountSession(session = getStoredAccountSession()): Promise<AccountSession | null> {
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session;
  try {
    const raw = await authRequest("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refreshToken });
    const refreshed = normalizeSession(raw);
    if (!refreshed) throw new Error("세션 갱신 응답이 비어 있습니다.");
    saveAccountSession(refreshed);
    return refreshed;
  } catch {
    saveAccountSession(null);
    return null;
  }
}

export async function signOutAccount(session: AccountSession | null) {
  const config = getAccountSyncConfig();
  if (config && session?.accessToken) {
    try {
      await fetch(`${config.url}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: config.anonKey, Authorization: `Bearer ${session.accessToken}` },
      });
    } catch {}
  }
  saveAccountSession(null);
}

async function authRequest(path: string, body: Record<string, string>): Promise<RawAuthResponse> {
  const config = getAccountSyncConfig();
  if (!config) throw new Error("Supabase 계정 동기화 환경 변수가 설정되지 않았습니다.");
  const response = await fetch(`${config.url}${path}`, {
    method: "POST",
    headers: { apikey: config.anonKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as RawAuthResponse & { message?: unknown; error_description?: unknown; msg?: unknown };
  if (!response.ok) {
    const detail = [data.message, data.error_description, data.msg].find((value): value is string => typeof value === "string");
    throw new Error(detail || `계정 요청 실패 (HTTP ${response.status})`);
  }
  return data;
}

function normalizeSession(raw: RawAuthResponse): AccountSession | null {
  if (typeof raw.access_token !== "string" || typeof raw.refresh_token !== "string") return null;
  const user = normalizeUser(raw.user);
  if (!user) return null;
  const expiresAtSeconds = typeof raw.expires_at === "number"
    ? raw.expires_at
    : Math.floor(Date.now() / 1000) + (typeof raw.expires_in === "number" ? raw.expires_in : 3600);
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: expiresAtSeconds * 1000,
    user,
  };
}

function normalizeUser(raw: RawAuthResponse["user"]): AccountUser | null {
  if (!raw || typeof raw.id !== "string") return null;
  return { id: raw.id, email: typeof raw.email === "string" ? raw.email : undefined };
}

function isAccountSession(value: unknown): value is AccountSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AccountSession>;
  return typeof session.accessToken === "string"
    && typeof session.refreshToken === "string"
    && typeof session.expiresAt === "number"
    && Boolean(session.user && typeof session.user.id === "string");
}
