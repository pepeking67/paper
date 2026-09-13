import type { Paper } from "@/lib/papers/types";
import type { StudyContext } from "./provider";

export function buildChatGptPrompt(paper: Paper, question: string, context: StudyContext): string {
  const selected = context.selectedText?.trim();
  const pageText = context.pageText?.trim().slice(0, 12_000);
  return [
    `논문: ${paper.title}`,
    `저자: ${paper.authors}`,
    `현재 페이지: ${context.page}`,
    selected ? `선택한 텍스트:\n${selected}` : "",
    pageText ? `현재 페이지 추출 텍스트:\n${pageText}` : "",
    `질문:\n${question.trim()}`,
    "논문의 제공된 문맥을 우선 사용하고, 문맥만으로 확정할 수 없는 내용은 명확히 구분해서 답해줘.",
  ].filter(Boolean).join("\n\n");
}
