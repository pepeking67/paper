import { NextResponse } from "next/server";
import { findPaper } from "@/lib/papers/catalog";
import { getAiProvider, type ChatTurn, type StudyAreaContext, type StudyContext } from "@/lib/ai/provider";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isChatRequest(body) || !findPaper(body.context.paperId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const provider = getAiProvider();
  if (!provider) return NextResponse.json({ error: "Gemini API is not configured", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  try {
    const message = await provider.answer(body.message, sanitizeContext(body.context), sanitizeHistory(body.history));
    return NextResponse.json({ message });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ error: timeout ? "AI response timed out" : "AI response failed", code: timeout ? "AI_TIMEOUT" : "AI_PROVIDER_ERROR" }, { status: timeout ? 504 : 502 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

function isChatRequest(value: unknown): value is { message: string; context: StudyContext; history?: ChatTurn[] } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { message?: unknown; context?: Partial<StudyContext> };
  return typeof candidate.message === "string" && candidate.message.trim().length > 0 && candidate.message.length <= 4_000 && typeof candidate.context?.paperId === "string" && Number.isInteger(candidate.context.page);
}

function sanitizeContext(context: StudyContext): StudyContext {
  const selectedAreas = Array.isArray(context.selectedAreas)
    ? context.selectedAreas.filter(isSafeAreaContext).slice(0, 4).map((area) => ({ id: typeof area.id === "string" ? area.id : undefined, page: area.page, imageDataUrl: area.imageDataUrl }))
    : undefined;

  return {
    paperId: context.paperId,
    page: context.page,
    selectedText: typeof context.selectedText === "string" ? context.selectedText : undefined,
    selectedAreas,
    pageText: typeof context.pageText === "string" ? context.pageText : undefined,
    chunks: Array.isArray(context.chunks) ? context.chunks : undefined,
  };
}

function isSafeAreaContext(value: unknown): value is StudyAreaContext {
  if (!value || typeof value !== "object") return false;
  const area = value as Partial<StudyAreaContext>;
  return Number.isInteger(area.page)
    && typeof area.imageDataUrl === "string"
    && area.imageDataUrl.length <= 1_500_000
    && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/u.test(area.imageDataUrl);
}

function sanitizeHistory(history: ChatTurn[] | undefined): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  return history.filter((turn) => (turn?.role === "user" || turn?.role === "assistant") && typeof turn.content === "string").slice(-8);
}
