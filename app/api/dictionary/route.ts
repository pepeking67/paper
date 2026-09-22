import { NextResponse } from "next/server";
import { AiProviderRequestError, getAiProvider } from "@/lib/ai/provider";
import { authorizePersonalPaper } from "@/lib/auth/authorize-personal-paper";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isDictionaryRequest(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const authorization = await authorizePersonalPaper(request, body.paperId);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error, code: authorization.code }, { status: authorization.status });
  const provider = getAiProvider();
  if (!provider) return NextResponse.json({ error: "Gemini API is not configured", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  try {
    const meaning = await provider.defineTerm(body.term, body.pageText);
    return NextResponse.json({ meaning: meaning.trim().slice(0, 100) });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "사전 검색 시간이 초과되었습니다.", code: "AI_TIMEOUT" }, { status: 504 });
    }
    if (error instanceof AiProviderRequestError) {
      console.error("[dictionary] Gemini request failed", { model: error.model, status: error.status, detail: error.detail });
      return NextResponse.json({ error: "단어 뜻을 불러오지 못했습니다.", code: "AI_PROVIDER_ERROR" }, { status: 502 });
    }
    console.error("[dictionary] Unexpected generation failure", error);
    return NextResponse.json({ error: "단어 뜻을 불러오지 못했습니다.", code: "AI_PROVIDER_ERROR" }, { status: 502 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

function isDictionaryRequest(value: unknown): value is { paperId: string; term: string; pageText?: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { paperId?: unknown; term?: unknown; pageText?: unknown };
  return typeof candidate.paperId === "string"
    && typeof candidate.term === "string"
    && candidate.term.trim().length > 0
    && candidate.term.length <= 200
    && (candidate.pageText === undefined || (typeof candidate.pageText === "string" && candidate.pageText.length <= 12_000));
}
