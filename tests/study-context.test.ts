import test from "node:test";
import assert from "node:assert/strict";
import { buildChatGptPrompt } from "../lib/ai/chatgpt-handoff";
import { papers } from "../lib/papers/catalog";

test("ChatGPT handoff contains bounded page and selection context", () => {
  const pageText = "x".repeat(13_000);
  const prompt = buildChatGptPrompt(papers[0], "왜 중요한가?", { paperId: papers[0].id, page: 3, selectedText: "attention", pageText });
  assert.match(prompt, /현재 페이지: 3/);
  assert.match(prompt, /선택한 텍스트:\nattention/);
  assert.match(prompt, /질문:\n왜 중요한가\?/);
  assert(prompt.length < 13_000);
});
