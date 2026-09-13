import type { Paper } from "@/lib/papers/types";
import type { StudyTrayData } from "./types";

export function buildStudyPacket(paper: Paper, tray: StudyTrayData) {
  const highlights = tray.highlights.length
    ? tray.highlights.map((item) => `### Page ${item.page}\nOriginal:\n${item.text}\n\nMy memo:\n${item.memo || "(없음)"}`).join("\n\n")
    : "(저장된 Highlight 없음)";
  const insights = tray.insights.length
    ? tray.insights.map((item) => `Question:\n${item.question}\n\nAnswer:\n${item.answer}\n\nSources:\nPage ${item.page}${item.sourceText ? ` — ${item.sourceText}` : ""}`).join("\n\n---\n\n")
    : "(저장된 Q&A Insight 없음)";
  const memos = tray.memos.length ? tray.memos.map((item) => `- ${item.text}`).join("\n") : "(저장된 메모 없음)";

  return `# Paper Study Material\n\nPaper: ${paper.title}\nPaper ID: ${paper.id}\n\n## Highlights\n${highlights}\n\n## Q&A Insights\n${insights}\n\n## My Notes\n${memos}\n\n## ChatGPT 정리 지시문\n위 자료를 기반으로 논문 내용을 정리해줘.\nAI 답변보다 논문 원문을 우선하고,\n관련된 Highlight와 Q&A를 하나의 개념으로 묶고,\n페이지 출처를 유지하며,\n다시 공부하기 좋은 형태로 설명해줘.`;
}
