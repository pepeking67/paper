import type { Paper } from "@/lib/papers/types";
import type { StudyTrayData } from "./types";

export function buildStudyPacket(paper: Paper, tray: StudyTrayData) {
  const studyAnnotations = tray.highlights.filter((item) => item.kind !== "dictionary");
  const annotations = studyAnnotations.length
    ? [...studyAnnotations]
      .sort((left, right) => left.page - right.page)
      .map((item) => {
        const kind = item.kind === "text" ? "Text memo" : (item.kind ?? "highlight") === "underline" ? "Underline" : "Highlight";
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

  return `# Paper Study Material

Paper: ${paper.title}
Paper ID: ${paper.id}

## 내가 중요하다고 표시한 논문 원문 — 페이지 순서
${annotations}

## 내가 선택해서 저장한 수식/그림/표 영역 — 페이지 순서
${areas}

주의: 위 Area의 실제 이미지 픽셀은 앱 안의 학습 노트 생성 시 멀티모달 입력으로 전달된다. 각 Area의 [[PDF_AREA:<id>]] 표시는 앱이 실제 저장된 crop 이미지로 렌더링하기 위한 안정적인 marker다. 최종 노트에서 해당 이미지를 보여줄 때는 URL을 만들거나 일반 Markdown 이미지 문법을 쓰지 말고 이 marker를 그대로 독립된 줄에 배치한다.

## 내 자유 메모
${memos}

## 내가 직접 Save Insight 한 중요 Q&A
${savedInsights}

주의: 일반 채팅 기록은 학습 노트 재료가 아니다. 사용자가 명시적으로 Save Insight 한 Q&A만 위 섹션에 포함된다.

## 학습 노트 작성 방식
논문의 전체 구조와 전개 순서는 노트의 **뼈대**로 사용한다. 하지만 실제로 어떤 내용을 자세히 적을지는 사용자가 밑줄·형광펜·영역 선택으로 표시한 부분을 **주된 근거**로 결정한다. 즉, 논문 전체를 일반적으로 요약하지 말고 사용자가 중요하다고 표시한 내용을 논문 구조 속 알맞은 위치에 재배치해 하나의 paper note로 만든다.

반드시 다음 원칙을 지켜라.
1. 최상위 heading과 큰 흐름은 논문의 자연스러운 section 순서를 따른다. 보통 Introduction에서 시작하고, 이후 논문에 맞는 Model / Architecture / Method, Training / Data, Experiments, Ablations / Analysis, Limitations, Conclusion 등의 순서를 사용한다. 단, 사용자가 표시한 근거가 없는 section을 완성형 논문 요약처럼 억지로 채우지 않는다.
2. **내용 선택의 1순위는 사용자가 표시한 원문이다.** Underline, Highlight, 선택한 Area, 그리고 여기에 붙인 메모를 중심으로 설명한다. 특히 밑줄, 메모가 붙은 Annotation, 선택한 수식·그림·표 영역은 높은 우선순위로 다룬다.
3. 표시된 내용을 단순히 페이지 순서로 복사하지 말고, 각각이 속하는 논문 section과 component를 판단해 재배치한다. Model / Architecture / Method 안에서는 실제 처리·개념 순서대로, Experiments 안에서는 setup → baseline → result → analysis / ablation처럼 논문의 전개를 따른다.
4. 선택한 Area가 수식·그림·표라면 실제 이미지를 직접 읽고, 관련된 밑줄·형광펜 설명과 함께 같은 section 안에서 정리한다. 최종 노트에 이미지를 포함할 때는 해당 Area의 정확한 [[PDF_AREA:<id>]] marker를 독립된 줄에 넣고 일반 Markdown 이미지 URL은 만들지 않는다.
5. **Saved Insight Q&A는 보충 자료다.** 사용자가 질문한 것은 그 지점에서 의문이 생겼다는 신호이므로, 질문/답변을 별도 Q&A 목록으로 복사하지 말고 해당 개념을 설명하는 section에 추가 이해로 자연스럽게 녹인다.
6. Q&A 답변이 Annotation에 이미 있는 개념을 더 잘 이해하게 해 준다면 그 설명을 조금 더 자세히 보완한다. 반대로 Q&A에만 있고 사용자가 표시한 원문이나 선택 영역과 연결되지 않는 내용은 노트의 중심 주제로 확장하지 않는다.
7. Q&A 답변과 논문 원문이 충돌하거나 Q&A 설명의 근거가 불확실하면 논문 원문 Annotation과 선택 영역을 우선한다. 필요한 경우 '보충 설명' 또는 '확인 필요' 정도로 짧게 구분한다.
8. Annotation과 Saved Insight에 페이지가 있으면 가능한 한 논문의 페이지 순서를 참고하되, 서로 관련된 내용은 같은 하위 section으로 묶는다. 페이지 번호는 다시 원문을 찾아볼 가치가 있을 때 유지한다.
9. 자유 메모는 사용자가 직접 남긴 해석이므로 관련 section에 반영하되, 논문 원문 사실과 사용자의 메모를 혼동하지 않는다.
10. 문체는 기존 Notion paper note처럼 짧고 직접적인 설명 위주로 한다. 핵심 용어는 **bold**, 수식은 $...$ 또는 $$...$$, 필요한 경우 표와 목록을 사용한다.
11. 별도의 '내 질문 모음', '전체 Q&A', 'Annotation 모음', '체크리스트'를 기본적으로 만들지 않는다. 논문 section 중심의 노트가 우선이다. 아직 해결되지 않은 내용이 실제로 있을 때만 마지막에 # Open Questions 형태로 짧게 남긴다.

권장 형태의 예시는 다음과 같다. 단, 실제 논문의 구조와 사용자가 표시한 내용에 맞게 heading 이름과 개수를 바꿔라.

# Introduction
사용자가 표시한 문제 설정, 기존 방법의 한계, 핵심 아이디어와 기여

# Model 또는 # Architecture
표시된 구조/수식/그림을 중심으로 전체 메커니즘 설명

## 1. 첫 번째 핵심 component
밑줄·형광펜·선택 영역을 근거로 세부 메커니즘 정리
필요하면 이 개념에 대한 Saved Insight의 답변을 보충 설명으로 통합

## 2. 두 번째 핵심 component
앞 component와의 연결

# Experiments
사용자가 표시한 평가 설정과 핵심 결과

## 1. Main Results
## 2. Generalization / Robustness / Ablation

# Limitations
실제로 표시된 자료에서 확인되는 한계만 정리

설명은 다시 논문을 공부할 때 바로 사용할 수 있을 만큼 구체적으로 쓰되, **논문 구조를 뼈대로 삼고 사용자 표시 내용을 중심으로 채우며 Q&A는 의문이 생긴 부분의 보충 설명으로만 사용하라.**`;
}
