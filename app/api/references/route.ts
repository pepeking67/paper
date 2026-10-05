import { NextResponse } from "next/server";
import { authorizePersonalPaper } from "@/lib/auth/authorize-personal-paper";
import { AiProviderRequestError, getAiProvider } from "@/lib/ai/provider";
import { parseReferenceResult } from "@/lib/references/reference-context";

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 80000) return NextResponse.json({ error: "요청이 너무 큽니다." }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  if (!body || typeof body.paperId !== "string" || body.paperId.length > 100
    || typeof body.citation !== "string" || !body.citation.trim() || body.citation.length > 2000
    || typeof body.references !== "string" || !body.references.trim() || body.references.length > 50000
    || typeof body.context !== "string" || body.context.length > 4000) {
    return NextResponse.json({ error: "인용과 참고문헌 원문을 확인하세요." }, { status: 400 });
  }
  const auth = await authorizePersonalPaper(request, body.paperId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const provider = getAiProvider();
  if (!provider) return NextResponse.json({ error: "Gemini 설정이 필요합니다." }, { status: 503 });
  try {
    const raw = await provider.describeReference(body.citation, body.references, body.context);
    let result;
    try { result = parseReferenceResult(raw, body.references); } catch { result = null; }
    if (!result) return NextResponse.json({ error: "참고문헌을 확실히 식별하지 못했습니다. References의 해당 항목 전체를 선택해 다시 시도하세요." }, { status: 422 });
    return NextResponse.json(result);
  } catch (error) {
    const limited = error instanceof AiProviderRequestError && error.status === 429;
    return NextResponse.json({ error: limited ? "API 사용량 제한입니다. 잠시 후 다시 시도하세요." : "참고문헌 조회에 실패했습니다. 잠시 후 다시 시도하세요." }, { status: limited ? 429 : 502 });
  }
}
export const runtime = "nodejs";
export const maxDuration = 25;
