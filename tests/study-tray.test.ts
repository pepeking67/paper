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
  assert.match(packet, /별도의 Q&A section으로 만들지 않는다/);
  assert.doesNotMatch(packet, /이 논문을 공부하면서 나눈 전체 질문과 답변/);
});
