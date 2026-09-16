import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("study chat offers annotation-aware prompts and consumes used context", async () => {
  const chat = await readFile("components/study-chat/study-chat.tsx", "utf8");
  assert.match(chat, /표시한 내용을 설명해줘/);
  assert.match(chat, /표시한 주장의 근거를 분석해줘/);
  assert.match(chat, /표시한 수식이나 영역을 단계별로 설명해줘/);
  assert.match(chat, /현재 페이지의 핵심을 요약해줘/);
  assert.match(chat, /논문의 가정과 한계를 비판적으로 검토해줘/);
  assert.match(chat, /ask\(prompt\)/);
  assert.match(chat, /주석 문장 포함/);
  assert.match(chat, /영역 \$\{context\.selectedAreas\?\.length\}개 포함/);
  assert.match(chat, /usedAnnotationContext = hasAnnotationContext/);
  assert.match(chat, /if \(usedAnnotationContext\) onQuestionContextConsumed\?\.\(\)/);
});
