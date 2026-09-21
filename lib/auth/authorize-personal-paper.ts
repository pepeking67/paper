import { createClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/papers/types";

type AuthorizedPaper = {
  ok: true;
  paper: Paper;
  userId: string;
};

type PaperAuthorizationFailure = {
  ok: false;
  status: 401 | 403 | 503;
  error: string;
  code: "AUTH_REQUIRED" | "PAPER_FORBIDDEN" | "SUPABASE_NOT_CONFIGURED" | "SUPABASE_UNAVAILABLE";
};

export type PersonalPaperAuthorization = AuthorizedPaper | PaperAuthorizationFailure;

export async function authorizePersonalPaper(request: Request, paperId: string): Promise<PersonalPaperAuthorization> {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return { ok: false, status: 401, error: "로그인이 필요합니다.", code: "AUTH_REQUIRED" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { ok: false, status: 503, error: "Supabase가 설정되지 않았습니다.", code: "SUPABASE_NOT_CONFIGURED" };
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) {
    return { ok: false, status: 401, error: "로그인 세션이 만료되었습니다. 다시 로그인하세요.", code: "AUTH_REQUIRED" };
  }

  const { data, error } = await client
    .from("user_papers")
    .select("id,category_id,title,authors,year,source_url,notion_url,reading_status,aliases")
    .eq("id", paperId)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (error) {
    console.error("[ai-auth] personal paper lookup failed", { code: error.code });
    return { ok: false, status: 503, error: "개인 논문 정보를 확인하지 못했습니다.", code: "SUPABASE_UNAVAILABLE" };
  }
  if (!data) {
    return { ok: false, status: 403, error: "이 계정의 논문이 아닙니다.", code: "PAPER_FORBIDDEN" };
  }

  return {
    ok: true,
    userId: authData.user.id,
    paper: {
      id: String(data.id),
      title: String(data.title),
      authors: String(data.authors ?? ""),
      year: data.year === null ? null : Number(data.year),
      tag: "개인 논문",
      done: data.reading_status === "read",
      keys: Array.isArray(data.aliases) ? data.aliases.filter((value): value is string => typeof value === "string") : [],
      sourceUrl: data.source_url ? String(data.source_url) : null,
      notionUrl: data.notion_url ? String(data.notion_url) : null,
      library: "personal",
      categoryId: data.category_id ? String(data.category_id) : null,
      readingStatus: normalizeReadingStatus(data.reading_status),
    },
  };
}

export function readBearerToken(value: string | null): string | null {
  const match = /^Bearer\s+([^\s]+)$/iu.exec(value?.trim() ?? "");
  return match?.[1] ?? null;
}

function normalizeReadingStatus(value: unknown): Paper["readingStatus"] {
  return value === "reading" || value === "read" || value === "archived" ? value : "unread";
}
