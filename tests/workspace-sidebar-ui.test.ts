import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("workspace uses button-controlled library and chat sidebars", async () => {
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const library = await readFile("components/paper-list/paper-list.tsx", "utf8");
  const chat = await readFile("components/study-chat/study-chat.tsx", "utf8");
  const css = await readFile("app/globals.css", "utf8");

  assert.match(workspace, /data-library-open/);
  assert.match(workspace, /data-chat-open/);
  assert.doesNotMatch(workspace, /workspace-resizer/);
  assert.match(viewer, /onToggleLibrary/);
  assert.match(viewer, /onToggleChat/);
  assert.match(viewer, /질의응답 열기/);
  assert.match(library, /<select/);
  assert.match(library, /전체 카테고리/);
  assert.match(chat, /질의응답 닫기/);
  assert.match(css, /grid-template-columns: 280px minmax\(0, 1fr\) 420px/);
});
