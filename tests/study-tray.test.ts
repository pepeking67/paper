import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyPacket } from "../lib/study-tray/build-packet";

test("buildStudyPacket includes saved material, page sources, and final instructions", () => {
  const packet = buildStudyPacket({ id: "P_1", title: "Test Paper", authors: "A", year: 2024, tag: "Test", done: true, keys: [], sourceUrl: "", notionUrl: "" }, {
    highlights: [{ id: "h", text: "original passage", page: 3, memo: "remember this", createdAt: "now" }],
    insights: [{ id: "i", question: "Why?", answer: "Because.", page: 4, sourceText: "source", createdAt: "now" }],
    memos: [{ id: "m", text: "my free note", createdAt: "now" }],
  });
  assert.match(packet, /# Paper Study Material/);
  assert.match(packet, /### Page 3/);
  assert.match(packet, /original passage/);
  assert.match(packet, /Question:\nWhy\?/);
  assert.match(packet, /Sources:\nPage 4 — source/);
  assert.match(packet, /my free note/);
  assert.match(packet, /AI 답변보다 논문 원문을 우선하고/);
});
