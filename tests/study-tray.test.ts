import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyPacket } from "../lib/study-tray/build-packet";

test("buildStudyPacket keeps review structure, print style, centered images, and Korean spacing instructions", () => {
  const packet = buildStudyPacket({ id: "P_1", title: "Test Paper", authors: "A", year: 2024, tag: "Test", done: true, keys: [], sourceUrl: "https://example.org/paper.pdf", notionUrl: "" }, {
    highlights: [{ id: "h", text: "original passage", page: 3, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }], memo: "remember this", kind: "underline", color: "blue", createdAt: "now" }],
    insights: [{ id: "i", question: "Why does this component matter?", answer: "Because it changes the representation.", page: 4, sourceText: "source", createdAt: "now" }],
    memos: [{ id: "m", text: "my free note", createdAt: "now" }],
  });

  assert.match(packet, /# Paper Study Material/);
  assert.match(packet, /Authors: A/);
  assert.match(packet, /Year: 2024/);
  assert.match(packet, /Paper source URL: https:\/\/example.org\/paper.pdf/);
  assert.match(packet, /Markdown 논문 리뷰/);
  assert.match(packet, /논문 전체 PDF는 자동 첨부되지 않는다/);
  assert.match(packet, /발췌 자료 기반 리뷰/);
  assert.match(packet, /UTF-8 .md 파일/);
  assert.match(packet, /존재하지 않는 다운로드 링크나 검증 결과를 만들지 않는다/);

  assert.match(packet, /### Page 3 · Underline · blue · 중요도 높음/);
  assert.match(packet, /original passage/);
  assert.match(packet, /remember this/);
  assert.match(packet, /my free note/);
  assert.match(packet, /내가 직접 Save Insight 한 중요 Q&A/);
  assert.match(packet, /Why does this component matter\?/);
  assert.match(packet, /Because it changes the representation\./);
  assert.match(packet, /Source context:\nsource/);
  assert.match(packet, /일반 채팅 기록은 학습 노트 재료가 아니다/);

  assert.match(packet, /Introduction/);
  assert.match(packet, /Model \/ Architecture \/ Method/);
  assert.match(packet, /Experiments/);
  assert.match(packet, /Limitations/);
  assert.match(packet, /사용자가 표시한 범위를 정리의 \*\*뼈대\*\*/);
  assert.match(packet, /사용자가 표시한 영역으로 정리 범위를 제한하는 것/);
  assert.match(packet, /Saved Insight Q&A는 보충 자료다/);
  assert.match(packet, /표시된 영역이 하나도 없으면 전체 요약을 대신 생성하지 말고/);
  assert.match(packet, /같은 페이지나 section에 표시가 하나 있다는 이유로 나머지 내용까지 요약하지 않는다/);
  assert.match(packet, /모든 본문 소제목과 이미지가 어느 Annotation 또는 Area에 근거하는지/);
  assert.doesNotMatch(packet, /사용자 표시 여부와 관계없이 검토/);
  assert.doesNotMatch(packet, /논문 전체의 핵심 문제 설정, 방법, 실험 논리를 먼저/);
  assert.match(packet, /질문과 답변을 별도 Q&A나 독립 문단으로 복사하지 말고/);

  assert.match(packet, /## 한국어 문장과 띄어쓰기/);
  assert.match(packet, /표준 맞춤법과 일반적인 학술 문장 관습에 맞춰 자연스럽게 띄어 쓴다/);
  assert.match(packet, /문장부호 앞의 공백/);
  assert.match(packet, /영문·숫자 사이의 이중 공백/);
  assert.match(packet, /내용은 바꾸지 말고 표기와 띄어쓰기만 바로잡는다/);

  assert.match(packet, /## 인쇄 타이포그래피와 이미지 정렬/);
  assert.match(packet, /A4 기준 여백은 약 20mm/);
  assert.match(packet, /본문은 약 10~10\.5pt/);
  assert.match(packet, /줄간격은 약 1\.35~1\.45배/);
  assert.match(packet, /Noto Serif CJK KR/);
  assert.match(packet, /Latin Modern 계열/);
  assert.match(packet, /모든 이미지는 가로 가운데 정렬한다/);
  assert.match(packet, /이미지가 가운데 정렬됐는지 확인한다/);
  assert.doesNotMatch(packet, /본문 폭의 약 65~85%/);
  assert.doesNotMatch(packet, /이미지 크기는 본문 폭의 90~100%로 고정하지 않는다/);
  assert.doesNotMatch(packet, /keepaspectratio/);
  assert.doesNotMatch(packet, /이미지와 캡션을 같은 페이지에 유지/);

  assert.match(packet, /A4로 바로 인쇄할 수 있는 PDF 파일/);
  assert.match(packet, /Markdown heading, 목록, 표, bold 등의 문법 기호를 원문 그대로 노출하지 말고 실제 서식으로 렌더링/);
  assert.match(packet, /LaTeX의 백슬래시·중괄호·첨자·위첨자·행렬·정렬 환경을 임의로 변형하거나 이스케이프해 깨뜨리지 않는다/);
  assert.match(packet, /수식, 표, 코드, 이미지 marker 주변 내용이 잘리거나 겹치지 않는지/);
  assert.match(packet, /한국어 띄어쓰기와 문장부호 간격도 다시 확인/);
  assert.match(packet, /Markdown과 LaTeX가 올바르게 렌더링된 인쇄용 파일을 반드시 제공하라/);
  assert.match(packet, /클립보드 프롬프트에는 Area 이미지 픽셀이 자동 첨부되지 않는다/);
  assert.match(packet, /이미지가 별도로 첨부되지 않았다면/);

  assert.doesNotMatch(packet, /A4 용지에서 여백을 제외한 본문 폭의 90~100%를 우선 사용/);
  assert.doesNotMatch(packet, /앱 안의 학습 노트 생성/);
  assert.doesNotMatch(packet, /이 논문을 공부하면서 나눈 전체 질문과 답변/);
});