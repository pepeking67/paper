import { NextResponse } from "next/server";
import { AiProviderRequestError, getAiProvider, type ChatTurn, type StudyAreaContext, type StudyContext } from "@/lib/ai/provider";
import { authorizePersonalPaper } from "@/lib/auth/authorize-personal-paper";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isChatRequest(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const authorization = await authorizePersonalPaper(request, body.context.paperId);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error, code: authorization.code }, { status: authorization.status });
  const provider = getAiProvider();
  if (!provider) return NextResponse.json({ error: "Gemini API is not configured", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  try {
    const message = await provider.answer(body.message, sanitizeContext(body.context), sanitizeHistory(body.history));
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.", code: "AI_TIMEOUT" }, { status: 504 });
    }

    if (error instanceof AiProviderRequestError) {
      console.error("[chat] Gemini request failed", { model: error.model, status: error.status, detail: error.detail });
      if (error.status === 429) {
        return NextResponse.json({ error: "Gemini 사용량 제한에 도달했습니다. 다른 모델 fallback도 사용할 수 없었습니다.", code: "AI_RATE_LIMIT" }, { status: 429 });
      }
      if ([500, 502, 503, 504].includes(error.status)) {
        return NextResponse.json({ error: "Gemini 서비스가 일시적으로 응답하지 않습니다. fallback 모델까지 시도했지만 실패했습니다.", code: "AI_PROVIDER_UNAVAILABLE" }, { status: 503 });
      }
      if (error.status === 404) {
        return NextResponse.json({ error: "현재 Gemini 모델을 이 API 프로젝트에서 사용할 수 없습니다.", code: "AI_MODEL_UNAVAILABLE" }, { status: 502 });
      }
      if (error.status === 400 || error.status === 413) {
        return NextResponse.json({ error: "현재 질문 자료를 Gemini가 처리하지 못했습니다. 선택 영역이나 문맥 크기를 줄여 다시 시도하세요.", code: "AI_REQUEST_REJECTED" }, { status: 400 });
      }
      return NextResponse.json({ error: "Gemini 요청이 실패했습니다.", code: "AI_PROVIDER_ERROR" }, { status: 502 });
    }

    console.error("[chat] Unexpected generation failure", error);
    return NextResponse.json({ error: "AI 응답 생성에 실패했습니다.", code: "AI_PROVIDER_ERROR" }, { status: 502 });
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
