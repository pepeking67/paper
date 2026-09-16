import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("workspace uses independent button-controlled sidebars and keeps question context out of the PDF", async () => {
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const library = await readFile("components/paper-list/paper-list.tsx", "utf8");
  const chat = await readFile("components/study-chat/study-chat.tsx", "utf8");

  assert.match(workspace, /data-library-open/);
  assert.match(workspace, /data-chat-drawer-open/);
  assert.match(workspace, /data-chat-open="false"/);
  assert.doesNotMatch(workspace, /workspace-resizer/);
  assert.match(workspace, /fixed inset-y-0 right-0 z-50/);
  assert.match(workspace, /header \+ div \+ div:not\(\.scrollbar\)/);
  assert.match(workspace, /PDF 뷰어.*논문 목록 닫기/s);

  assert.match(viewer, /onToggleLibrary/);
  assert.match(viewer, /onToggleChat/);
  assert.match(viewer, /질의응답 열기/);

  assert.match(library, /<select/);
  assert.match(library, /전체 카테고리/);
  assert.match(library, /논문 목록 닫기/);

  assert.match(chat, /aria-label="질문 문맥"/);
  assert.match(chat, /questionHighlights/);
  assert.match(chat, /questionAreas/);
  assert.match(chat, /onRemoveQuestionHighlight/);
  assert.match(chat, /onRemoveQuestionArea/);
  assert.match(chat, /전체 비우기/);
  assert.match(chat, /질의응답 닫기/);
});
