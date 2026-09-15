import type { Paper } from "@/lib/papers/types";
import type { StudyTrayData } from "./types";

export function buildStudyPacket(paper: Paper, tray: StudyTrayData) {
  const annotations = tray.highlights.length
    ? [...tray.highlights]
      .sort((left, right) => left.page - right.page)
      .map((item) => {
        const kind = (item.kind ?? "highlight") === "underline" ? "Underline" : "Highlight";
        const priority = kind === "Underline" || item.memo ? "중요도 높음" : "참고";
        return `### Page ${item.page} · ${kind} · ${item.color ?? "yellow"} · ${priority}\nOriginal:\n${item.text}\n\nMy memo:\n${item.memo || "(없음)"}`;
      }).join("\n\n")
    : "(저장된 Annotation 없음)";

  const areas = tray.areas?.length
    ? [...tray.areas]
      .sort((left, right) => left.page - right.page)
      .map((item, index) => `### Area ${index + 1} · Page ${item.page}\nStable image marker: [[PDF_AREA:${item.id}]]\nType: PDF image/figure/equation region\nNormalized region: x=${item.rect.x.toFixed(4)}, y=${item.rect.y.toFixed(4)}, width=${item.rect.width.toFixed(4)}, height=${item.rect.height.toFixed(4)}\nMy memo:\n${item.memo || "(없음)"}`)
      .join("\n\n")
    : "(저장된 영역 Annotation 없음)";

  const savedInsights = tray.insights.length
    ? [...tray.insights]
      .sort((left, right) => left.page - right.page)
      .map((item) => `### Page ${item.page} · Saved Insight\nQuestion:\n${item.question}\n\nAnswer:\n${item.answer}\n\nSource context:\n${item.sourceText || "(별도 선택 원문 없음)"}`)
      .join("\n\n---\n\n")
    : "(Save Insight로 저장한 Q&A 없음)";

  const memos = tray.memos.length
    ? tray.memos.map((item) => `- ${item.text}`).join("\n")
    : "(저장된 메모 없음)";

  return `# Paper Study Material\n\nPaper: ${paper.title}\nPaper ID: ${paper.id}\n\n## 내가 중요하다고 표시한 논문 원문 — 페이지 순서\n${annotations}\n\n## 내가 사각형으로 저장한 수식/그림/표 영역 — 페이지 순서\n${areas}\n\n주의: 위 Area의 실제 이미지 픽셀은 앱 안의 학습 노트 생성 시 멀티모달 입력으로 전달된다. 각 Area의 [[PDF_AREA:<id>]] 표시는 앱이 실제 저장된 crop 이미지로 렌더링하기 위한 안정적인 marker다. 최종 노트에서 해당 이미지를 보여줄 때는 URL을 만들거나 일반 Markdown 이미지 문법을 쓰지 말고 이 marker를 그대로 독립된 줄에 배치한다.\n\n## 내 자유 메모\n${memos}\n\n## 내가 직접 Save Insight 한 중요 Q&A\n${savedInsights}\n\n주의: 일반 채팅 기록은 학습 노트 재료가 아니다. 사용자가 명시적으로 Save Insight 한 Q&A만 위 섹션에 포함된다.\n\n## 학습 노트 작성 방식\n이 자료를 질문 순서대로 나열하지 말고, 논문 자체의 전개 순서를 뼈대로 삼아 내가 Notion에 정리하듯 하나의 paper note로 재구성한다.\n\n반드시 다음 원칙을 지켜라.\n1. 최상위 heading은 논문의 자연스러운 section 순서를 따른다. 보통 Introduction에서 시작하고, 이후 논문에 맞는 Model / Architecture / Method, Training / Data, Experiments, Ablations / Analysis, Limitations, Conclusion 등의 순서를 사용한다. 모든 heading을 억지로 만들지 말고 실제 자료로 뒷받침되는 section만 사용한다.\n2. Model / Architecture / Method 아래에서는 실제 구조의 처리 순서대로 세부 component를 ## 또는 ### heading으로 나눈다. 예: Image tokenization → TokenLearner → Transformer처럼 입력에서 출력으로 이어지는 순서를 보존한다.\n3. Experiments 아래에서는 평가 기준, 데이터셋, baseline, main result, generalization/robustness, ablation 등의 실험 흐름을 논문 순서에 맞춰 하위 section으로 배치한다.\n4. Save Insight의 질문과 답변을 별도의 Q&A section으로 만들지 않는다. 해당 질문으로 얻은 이해를 Introduction, Model, Experiments 등 가장 관련 있는 section 본문에 자연스럽게 녹인다.\n5. 밑줄(Underline), 내가 직접 작성한 메모, 메모가 붙은 Annotation, Saved Insight는 높은 우선순위로 반영한다. 일반 Highlight도 중요한 근거로 사용한다.\n6. Annotation과 Saved Insight에 페이지가 있으면 가능한 한 논문의 페이지 순서를 유지하고, 서로 관련된 내용만 같은 하위 section으로 묶는다.\n7. AI 답변은 틀릴 수 있으므로 논문 원문 Annotation과 영역 이미지를 더 높은 근거로 취급한다. 충돌하거나 확신할 수 없는 부분은 명확히 표시한다.\n8. Area Annotation이 수식·그림·표라면 실제 이미지를 직접 읽고 관련 section 안에 배치한다. 최종 노트에 이미지를 포함할 때는 해당 Area의 정확한 [[PDF_AREA:<id>]] marker를 독립된 줄에 넣는다. 일반 Markdown 이미지 URL은 만들지 않는다.\n9. 문체는 기존 Notion paper note처럼 짧고 직접적인 설명 위주로 한다. 핵심 용어는 **bold**, 수식은 $...$ 또는 $$...$$, 필요한 경우 표와 목록을 사용한다.\n10. 별도의 '내 질문 모음', '전체 Q&A', '체크리스트'를 기본적으로 만들지 않는다. 논문 section 중심의 노트가 우선이다. 아직 해결되지 않은 내용이 실제로 있을 때만 마지막에 # Limitations 또는 # Open Questions 형태로 짧게 남긴다.\n\n권장 형태의 예시는 다음과 같다. 단, 실제 논문에 맞게 heading 이름과 개수는 바꿔라.\n\n# Introduction\n문제 설정, 기존 방법의 한계, 이 논문의 핵심 아이디어와 기여\n\n# Model 또는 # Architecture\n전체 구조 설명\n\n## 1. 첫 번째 핵심 component\n세부 메커니즘과 중요한 수식\n\n## 2. 두 번째 핵심 component\n앞 component와의 연결\n\n# Experiments\n평가 설정과 핵심 결과\n\n## 1. Main Results\n## 2. Generalization / Robustness / Ablation\n\n# Limitations\n실제로 자료에서 확인되는 한계만 정리\n\n설명은 다시 논문을 공부할 때 바로 사용할 수 있을 만큼 구체적으로 쓰되, 논문 순서를 깨면서까지 Q&A를 따로 모으지 마라.`;
}
