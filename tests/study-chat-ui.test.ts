import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("study chat offers contextual paper-reading prompts", async () => {
  const chat = await readFile("components/study-chat/study-chat.tsx", "utf8");
  assert.match(chat, /선택한 내용을 설명해줘/);
  assert.doesNotMatch(chat, /쉽게 설명해줘/);
  assert.match(chat, /선택한 주장의 근거를 분석해줘/);
  assert.doesNotMatch(chat, /근거와 한계/);
  assert.match(chat, /현재 페이지의 핵심을 요약해줘/);
  assert.match(chat, /논문의 가정과 한계를 비판적으로 검토해줘/);
  assert.match(chat, /ask\(prompt\)/);
  assert.doesNotMatch(chat, /선택 텍스트 ·/);
  assert.match(chat, /선택 문장 포함/);
});
