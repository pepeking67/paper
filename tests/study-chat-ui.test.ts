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
  assert.match(chat, /ask\(item\.prompt\)/);
  assert.match(chat, /questionHighlights\.length \+ questionAreas\.length/);
  assert.match(chat, /aria-label="질문 문맥"/);
  assert.match(chat, /usedAnnotationContext = hasAnnotationContext/);
  assert.match(chat, /if \(usedAnnotationContext\) onQuestionContextConsumed\?\.\(\)/);
});

test("saved insights become visibly disabled and duplicate saves are blocked", async () => {
  const chat = await readFile("components/study-chat/study-chat.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  assert.match(chat, /savedInsights\.some/);
  assert.match(chat, /disabled=\{insightSaved\}/);
  assert.match(chat, /✓ Saved to Tray/);
  assert.match(chat, /data-saved=\{insightSaved \? "true" : "false"\}/);
  assert.match(workspace, /savedInsights=\{tray\.insights\}/);
  assert.match(workspace, /current\.insights\.some\(\(insight\) => insight\.question === question && insight\.answer === answer\)/);
});
