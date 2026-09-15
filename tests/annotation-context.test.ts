import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("highlight, underline, and area annotations drive question context", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");

  assert.doesNotMatch(viewer, /label="선택"/);
  assert.match(viewer, /questionHighlights\.map/);
  assert.match(viewer, /onDeleteHighlight\(highlight\.id\)/);
  assert.match(viewer, /onDeleteArea\(area\.id\)/);
  assert.match(viewer, /저장된 PDF 영역/);
  assert.match(viewer, /pointer-events:auto!important/);

  assert.match(workspace, /setQuestionHighlights/);
  assert.match(workspace, /function createHighlight/);
  assert.match(workspace, /function removeHighlight/);
  assert.match(workspace, /function removeArea/);
  assert.match(workspace, /selectedText,/);
});
