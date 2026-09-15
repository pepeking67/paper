import type { ChatTurn } from "@/lib/ai/provider";
import type { Paper } from "@/lib/papers/types";
import type { StudyTrayData } from "./types";

export function buildStudyPacket(paper: Paper, tray: StudyTrayData, chatHistory: ChatTurn[] = []) {
  const annotations = tray.highlights.length
    ? tray.highlights.map((item) => {
      const kind = (item.kind ?? "highlight") === "underline" ? "Underline" : "Highlight";
      const priority = kind === "Underline" || item.memo ? "중요도 높음" : "참고";
      return `### Page ${item.page} · ${kind} · ${item.color ?? "yellow"} · ${priority}\nOriginal:\n${item.text}\n\nMy memo:\n${item.memo || "(없음)"}`;
    }).join("\n\n")
    : "(저장된 Annotation 없음)";

  const areas = tray.areas?.length
    ? tray.areas.map((item, index) => `### Area ${index + 1} · Page ${item.page}\nType: PDF image/figure/equation region\nNormalized region: x=${item.rect.x.toFixed(4)}, y=${item.rect.y.toFixed(4)}, width=${item.rect.width.toFixed(4)}, height=${item.rect.height.toFixed(4)}\nMy memo:\n${item.memo || "(없음)"}`).join("\n\n")
    : "(저장된 영역 Annotation 없음)";

  const savedInsights = tray.insights.length
    ? tray.insights.map((item) => `Question:\n${item.question}\n\nAnswer:\n${item.answer}\n\nSources:\nPage ${item.page}${item.sourceText ? ` — ${item.sourceText}` : ""}`).join("\n\n---\n\n")
    : "(별도로 저장한 중요 Q&A 없음)";

  const memos = tray.memos.length
    ? tray.memos.map((item) => `- ${item.text}`).join("\n")
    : "(저장된 메모 없음)";

  const conversation = buildConversation(chatHistory);

  return `# Paper Study Material\n\nPaper: ${paper.title}\nPaper ID: ${paper.id}\n\n## 내가 중요하다고 표시한 논문 원문\n${annotations}\n\n## 내가 사각형으로 저장한 수식/그림/표 영역\n${areas}\n\n주의: 위 Area의 실제 이미지 픽셀은 앱의 Study Tray에 저장되어 있으며 이 텍스트 복사본에는 포함되지 않는다. 앱 안에서 Gemini에게 질문할 때는 선택한 Area 이미지 자체가 멀티모달 입력으로 전달된다.\n\n## 내 자유 메모\n${memos}\n\n## 이 논문을 공부하면서 나눈 전체 질문과 답변\n${conversation}\n\n## 별도로 저장한 중요 Q&A\n${savedInsights}\n\n## ChatGPT 정리 지시문\n이 자료는 내가 논문을 읽으면서 만든 개인 학습 기록이다. 단순히 항목을 나열하지 말고, 내가 무엇을 궁금해했고 무엇을 중요하게 봤는지가 드러나는 하나의 공부 노트로 재구성해줘.\n\n반드시 다음 원칙을 지켜라.\n1. 내가 실제로 했던 질문을 중심으로, 각 질문에서 무엇을 이해하려 했는지와 답변의 핵심을 정리한다.\n2. 밑줄(Underline), 내가 직접 작성한 메모, 메모가 붙은 Annotation은 내가 중요하다고 판단한 내용이므로 특히 높은 우선순위로 반영한다. 일반 Highlight도 중요한 참고 자료로 사용한다.\n3. Area Annotation은 수식·그림·표 등 텍스트 드래그가 어려워 내가 직접 영역을 지정한 부분이다. 이 텍스트 패킷에 이미지 자체가 없으므로 보이지 않는 내용을 추측하지 말고, 페이지/메모/관련 Q&A가 있을 때만 연결한다.\n4. AI 답변은 틀릴 수 있으므로 논문 원문과 내가 표시한 원문을 더 높은 근거로 취급한다. AI 답변과 원문이 충돌하거나 확신할 수 없는 부분은 그대로 지적한다.\n5. 서로 관련된 질문, 답변, Annotation, 메모를 하나의 개념 아래 묶고 연결 관계를 설명한다. 같은 내용을 중복해서 반복하지 않는다.\n6. 원문에서 페이지 정보가 제공된 경우 페이지 출처를 유지한다. 없는 출처를 만들어내지 않는다.\n7. 내가 아직 이해하지 못했거나 다시 확인해야 할 부분이 보이면 '남은 의문 / 재검증 필요'에 따로 모은다.\n\n최종 결과는 다음 구조로 작성해라.\n- 핵심 개념과 논문 흐름\n- 내가 했던 질문과 답변 정리\n- 중요 표시한 원문과 메모에서 드러나는 핵심 포인트\n- 영역으로 저장한 수식/그림/표 확인 목록\n- 개념 간 연결 관계\n- 남은 의문 / 재검증 필요\n- 나중에 빠르게 복습할 체크리스트\n\n설명은 내가 다시 논문을 공부할 때 바로 사용할 수 있을 정도로 구체적으로 작성하되, 불필요하게 장황하게 늘리지 마라.`;
}

function buildConversation(history: ChatTurn[]) {
  if (!history.length) return "(저장된 학습 대화 없음)";

  const entries: string[] = [];
  let questionNumber = 0;
  for (let index = 0; index < history.length; index++) {
    const turn = history[index];
    if (turn.role !== "user") continue;
    questionNumber += 1;
    const next = history[index + 1];
    const answer = next?.role === "assistant" ? next.content : "(답변 없음)";
    entries.push(`### Q${questionNumber}\nQuestion:\n${turn.content}\n\nAnswer:\n${answer}`);
  }

  return entries.length ? entries.join("\n\n---\n\n") : "(저장된 학습 대화 없음)";
}
