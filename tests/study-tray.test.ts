import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyPacket } from "../lib/study-tray/build-packet";

test("buildStudyPacket uses saved insights and paper-section ordering instructions", () => {
  const packet = buildStudyPacket({ id: "P_1", title: "Test Paper", authors: "A", year: 2024, tag: "Test", done: true, keys: [], sourceUrl: "", notionUrl: "" }, {
    highlights: [{ id: "h", text: "original passage", page: 3, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }], memo: "remember this", kind: "underline", color: "blue", createdAt: "now" }],
    insights: [{ id: "i", question: "Why does this component matter?", answer: "Because it changes the representation.", page: 4, sourceText: "source", createdAt: "now" }],
    memos: [{ id: "m", text: "my free note", createdAt: "now" }],
  });

  assert.match(packet, /# Paper Study Material/);
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
  assert.match(packet, /논문의 전체 구조와 전개 순서는 노트의 \*\*뼈대\*\*/);
  assert.match(packet, /내용 선택의 1순위는 사용자가 표시한 원문/);
  assert.match(packet, /Saved Insight Q&A는 보충 자료다/);
  assert.match(packet, /Q&A는 의문이 생긴 부분의 보충 설명으로만 사용하라/);
  assert.match(packet, /A4로 바로 인쇄할 수 있는 PDF 파일/);
  assert.match(packet, /Markdown heading, 목록, 표, bold 등의 문법 기호를 원문 그대로 노출하지 말고 실제 서식으로 렌더링/);
  assert.match(packet, /LaTeX의 백슬래시·중괄호·첨자·위첨자·행렬·정렬 환경을 임의로 변형하거나 이스케이프해 깨뜨리지 않는다/);
  assert.match(packet, /수식, 표, 코드, 이미지 marker 주변 내용이 잘리거나 겹치지 않는지/);
  assert.match(packet, /Markdown과 LaTeX가 올바르게 렌더링된 인쇄용 파일을 반드시 제공하라/);
  assert.match(packet, /클립보드 프롬프트에는 Area 이미지 픽셀이 자동 첨부되지 않는다/);
  assert.match(packet, /이미지가 별도로 첨부되지 않았다면/);
  assert.doesNotMatch(packet, /앱 안의 학습 노트 생성/);
  assert.doesNotMatch(packet, /이 논문을 공부하면서 나눈 전체 질문과 답변/);
});
