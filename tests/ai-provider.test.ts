import test from "node:test";
import assert from "node:assert/strict";
import { buildStudyPrompt } from "../lib/ai/provider";

test("Gemini prompt uses bounded current-page, selection, chunks and recent history", () => {
  const prompt = buildStudyPrompt("왜 중요한가?", { paperId: "VLA_4", page: 3, selectedText: "selected", pageText: "x".repeat(13_000), chunks: [{ page: 2, section: "Method", text: "chunk" }] }, Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `turn-${index}` })));
  assert.match(prompt, /Current page: 3/);
  assert.match(prompt, /Selected text:\nselected/);
  assert.match(prompt, /\[p\.2 · Method\] chunk/);
  assert.doesNotMatch(prompt, /turn-0/);
  assert.match(prompt, /turn-9/);
  assert(prompt.length < 40_000);
});
