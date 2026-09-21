import test from "node:test";
import assert from "node:assert/strict";
import { buildGeminiModelCandidates, buildStudyPrompt, CHAT_MAX_OUTPUT_TOKENS, extractGeminiSseText } from "../lib/ai/provider";

test("Gemini prompt uses bounded current-page, selection, chunks and recent history", () => {
  const prompt = buildStudyPrompt("왜 중요한가?", { paperId: "VLA_4", page: 3, selectedText: "selected", pageText: "x".repeat(13_000), chunks: [{ page: 2, section: "Method", text: "chunk" }] }, Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `turn-${index}` })));
  assert.match(prompt, /Current page: 3/);
  assert.match(prompt, /Selected text:\nselected/);
  assert.match(prompt, /\[p\.2 · Method\] chunk/);
  assert.doesNotMatch(prompt, /turn-0/);
  assert.match(prompt, /turn-9/);
  assert(prompt.length < 40_000);
});


test("Gemini model candidates keep the primary model and provide stable fallbacks", () => {
  assert.deepEqual(
    buildGeminiModelCandidates("gemini-primary", "gemini-custom-fallback"),
    ["gemini-primary", "gemini-custom-fallback", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"],
  );
  assert.deepEqual(
    buildGeminiModelCandidates("gemini-3.5-flash-lite", "gemini-3.5-flash-lite"),
    ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"],
  );
});

test("Gemini SSE events expose incremental answer text", () => {
  assert.equal(CHAT_MAX_OUTPUT_TOKENS, 2_048);
  assert.equal(extractGeminiSseText('data: {"candidates":[{"content":{"parts":[{"text":"첫 토큰"}]}}]}'), "첫 토큰");
  assert.equal(extractGeminiSseText("data: [DONE]"), "");
  assert.equal(extractGeminiSseText("event: message\ndata: invalid-json"), "");
});
