import { NextResponse } from "next/server";
import { AiProviderRequestError, getAiProvider, type StudyAreaContext } from "@/lib/ai/provider";
import { authorizePersonalPaper } from "@/lib/auth/authorize-personal-paper";
import { buildStudyPacket } from "@/lib/study-tray/build-packet";
import type { StudyArea, StudyHighlight, StudyInsight, StudyMemo, StudyTrayData } from "@/lib/study-tray/types";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const candidate = body as { paperId?: unknown; tray?: unknown };
  if (typeof candidate.paperId !== "string") return NextResponse.json({ error: "Invalid paper" }, { status: 400 });
  const authorization = await authorizePersonalPaper(request, candidate.paperId);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error, code: authorization.code }, { status: authorization.status });
  const paper = authorization.paper;

  const provider = getAiProvider();
  if (!provider) return NextResponse.json({ error: "Gemini API is not configured", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const tray = sanitizeTray(candidate.tray);
  const packet = buildStudyPacket(paper, tray);
  const areas: StudyAreaContext[] = (tray.areas ?? []).flatMap((area) => area.imageDataUrl ? [{ id: area.id, page: area.page, imageDataUrl: area.imageDataUrl }] : []).slice(0, 4);

  try {
    const markdown = await provider.composeStudyNote(packet, areas);
    return NextResponse.json({ markdown });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "학습 노트 생성 시간이 초과되었습니다. 잠시 후 다시 시도하세요.", code: "AI_TIMEOUT" }, { status: 504 });
    }

    if (error instanceof AiProviderRequestError) {
      console.error("[study-note] Gemini request failed", { status: error.status, detail: error.detail });
      if (error.status === 429) {
        return NextResponse.json({ error: "Gemini 사용량 제한에 도달했습니다. 잠시 후 다시 시도하세요.", code: "AI_RATE_LIMIT" }, { status: 429 });
      }
      if ([500, 502, 503, 504].includes(error.status)) {
        return NextResponse.json({ error: "Gemini 서비스가 일시적으로 응답하지 않습니다. 자동 재시도 후에도 실패했습니다.", code: "AI_PROVIDER_UNAVAILABLE" }, { status: 503 });
      }
      if (error.status === 400 || error.status === 413) {
        return NextResponse.json({ error: "Gemini가 현재 학습 자료 요청을 처리하지 못했습니다. 선택 영역이나 저장 자료가 너무 큰지 확인하세요.", code: "AI_REQUEST_REJECTED" }, { status: 400 });
      }
      return NextResponse.json({ error: "Gemini 요청이 실패했습니다.", code: "AI_PROVIDER_ERROR" }, { status: 502 });
    }

    console.error("[study-note] Unexpected generation failure", error);
    return NextResponse.json({ error: "학습 노트 생성에 실패했습니다.", code: "AI_PROVIDER_ERROR" }, { status: 502 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

function sanitizeTray(value: unknown): StudyTrayData {
  if (!value || typeof value !== "object") return { highlights: [], areas: [], insights: [], memos: [] };
  const tray = value as Partial<StudyTrayData>;
  return {
    highlights: Array.isArray(tray.highlights) ? tray.highlights.filter(isHighlight).slice(0, 80).map((item) => ({ ...item, text: item.text.slice(0, 4_000), memo: item.memo.slice(0, 2_000) })) : [],
    areas: Array.isArray(tray.areas) ? tray.areas.filter(isArea).slice(0, 8).map((item) => ({ ...item, memo: item.memo.slice(0, 2_000) })) : [],
    insights: Array.isArray(tray.insights) ? tray.insights.filter(isInsight).slice(0, 40).map((item) => ({ ...item, question: item.question.slice(0, 4_000), answer: item.answer.slice(0, 8_000), sourceText: item.sourceText?.slice(0, 4_000) })) : [],
    memos: Array.isArray(tray.memos) ? tray.memos.filter(isMemo).slice(0, 60).map((item) => ({ ...item, text: item.text.slice(0, 4_000) })) : [],
  };
}

function isHighlight(value: unknown): value is StudyHighlight {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudyHighlight>;
  return typeof item.id === "string" && typeof item.text === "string" && Number.isInteger(item.page) && Array.isArray(item.rects) && typeof item.memo === "string" && typeof item.createdAt === "string";
}

function isArea(value: unknown): value is StudyArea {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudyArea>;
  const rect = item.rect as Partial<StudyArea["rect"]> | undefined;
  return typeof item.id === "string"
    && Number.isInteger(item.page)
    && Boolean(rect)
    && Number.isFinite(rect?.x)
    && Number.isFinite(rect?.y)
    && Number.isFinite(rect?.width)
    && Number.isFinite(rect?.height)
    && typeof item.imageDataUrl === "string"
    && item.imageDataUrl.length <= 1_500_000
    && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/u.test(item.imageDataUrl)
    && typeof item.memo === "string"
    && typeof item.createdAt === "string";
}

function isInsight(value: unknown): value is StudyInsight {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudyInsight>;
  return typeof item.id === "string" && typeof item.question === "string" && typeof item.answer === "string" && Number.isInteger(item.page) && typeof item.createdAt === "string";
}

function isMemo(value: unknown): value is StudyMemo {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudyMemo>;
  return typeof item.id === "string" && typeof item.text === "string" && typeof item.createdAt === "string";
}
