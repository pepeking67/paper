import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyPacket } from "../lib/study-tray/build-packet";

test("buildStudyPacket includes annotations, memos, full Q&A, and study instructions", () => {
  const packet = buildStudyPacket({ id: "P_1", title: "Test Paper", authors: "A", year: 2024, tag: "Test", done: true, keys: [], sourceUrl: "", notionUrl: "" }, {
    highlights: [{ id: "h", text: "original passage", page: 3, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }], memo: "remember this", kind: "underline", color: "blue", createdAt: "now" }],
    insights: [{ id: "i", question: "Why?", answer: "Because.", page: 4, sourceText: "source", createdAt: "now" }],
    memos: [{ id: "m", text: "my free note", createdAt: "now" }],
  }, [
    { role: "user", content: "What is self-attention?" },
    { role: "assistant", content: "It relates positions within a sequence." },
    { role: "user", content: "Why is it useful?" },
    { role: "assistant", content: "It shortens dependency paths." },
  ]);

  assert.match(packet, /# Paper Study Material/);
  assert.match(packet, /### Page 3 · Underline · blue · 중요도 높음/);
  assert.match(packet, /original passage/);
  assert.match(packet, /remember this/);
  assert.match(packet, /my free note/);
  assert.match(packet, /### Q1\nQuestion:\nWhat is self-attention\?/);
  assert.match(packet, /It relates positions within a sequence/);
  assert.match(packet, /### Q2\nQuestion:\nWhy is it useful\?/);
  assert.match(packet, /별도로 저장한 중요 Q&A/);
  assert.match(packet, /Sources:\nPage 4 — source/);
  assert.match(packet, /밑줄\(Underline\).*높은 우선순위/s);
  assert.match(packet, /AI 답변은 틀릴 수 있으므로 논문 원문/);
  assert.match(packet, /남은 의문 \/ 재검증 필요/);
});
