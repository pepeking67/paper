import { NextResponse } from "next/server";
import { getAiProvider, type ChatTurn, type StudyAreaContext } from "@/lib/ai/provider";
import { findPaper } from "@/lib/papers/catalog";
import { buildStudyPacket } from "@/lib/study-tray/build-packet";
import type { StudyArea, StudyHighlight, StudyInsight, StudyMemo, StudyTrayData } from "@/lib/study-tray/types";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const candidate = body as { paperId?: unknown; tray?: unknown; chatHistory?: unknown };
  if (typeof candidate.paperId !== "string") return NextResponse.json({ error: "Invalid paper" }, { status: 400 });
  const paper = findPaper(candidate.paperId);
  if (!paper) return NextResponse.json({ error: "Unknown paper" }, { status: 404 });

  const provider = getAiProvider();
  if (!provider) return NextResponse.json({ error: "Gemini API is not configured", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const tray = sanitizeTray(candidate.tray);
  const chatHistory = sanitizeHistory(candidate.chatHistory);
  const packet = buildStudyPacket(paper, tray, chatHistory);
  const areas: StudyAreaContext[] = (tray.areas ?? []).slice(0, 4).map((area) => ({ id: area.id, page: area.page, imageDataUrl: area.imageDataUrl }));

  try {
    const markdown = await provider.composeStudyNote(packet, areas);
    return NextResponse.json({ markdown });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ error: timeout ? "Study note generation timed out" : "Study note generation failed", code: timeout ? "AI_TIMEOUT" : "AI_PROVIDER_ERROR" }, { status: timeout ? 504 : 502 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

function sanitizeTray(value: unknown): StudyTrayData {
  if (!value || typeof value !== "object") return { highlights: [], areas: [], insights: [], memos: [] };
  const tray = value as Partial<StudyTrayData>;
  return {
    highlights: Array.isArray(tray.highlights) ? tray.highlights.filter(isHighlight).slice(0, 80).map((item) => ({ ...item, text: item.text.slice(0, 4_000), memo: item.memo.slice(0, 2_000) })) : [],
    areas: Array.isArray(tray.areas) ? tray.areas.filter(isArea).slice(0, 8) : [],
    insights: Array.isArray(tray.insights) ? tray.insights.filter(isInsight).slice(0, 40).map((item) => ({ ...item, question: item.question.slice(0, 4_000), answer: item.answer.slice(0, 8_000), sourceText: item.sourceText?.slice(0, 4_000) })) : [],
    memos: Array.isArray(tray.memos) ? tray.memos.filter(isMemo).slice(0, 60).map((item) => ({ ...item, text: item.text.slice(0, 4_000) })) : [],
  };
}

function sanitizeHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChatTurn => Boolean(item && typeof item === "object" && ((item as ChatTurn).role === "user" || (item as ChatTurn).role === "assistant") && typeof (item as ChatTurn).content === "string")).slice(-40).map((item) => ({ ...item, content: item.content.slice(0, 8_000) }));
}

function isHighlight(value: unknown): value is StudyHighlight {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudyHighlight>;
  return typeof item.id === "string" && typeof item.text === "string" && Number.isInteger(item.page) && Array.isArray(item.rects) && typeof item.memo === "string" && typeof item.createdAt === "string";
}

function isArea(value: unknown): value is StudyArea {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudyArea>;
  return typeof item.id === "string"
    && Number.isInteger(item.page)
    && Boolean(item.rect && typeof item.rect === "object")
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
