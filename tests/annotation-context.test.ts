import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("question context is separate from persistent PDF annotations", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");

  assert.doesNotMatch(viewer, /label="선택"/);
  assert.match(viewer, /questionHighlights\.map/);
  assert.match(viewer, /onRemoveQuestionHighlight\(highlight\.id\)/);
  assert.match(viewer, /onRemoveQuestionArea\(area\.id\)/);
  assert.doesNotMatch(viewer, /onDeleteHighlight\(highlight\.id\)/);
  assert.doesNotMatch(viewer, /onDeleteArea\(area\.id\)/);
  assert.match(viewer, /저장된 PDF 영역/);
  assert.match(viewer, /pointer-events:auto!important/);

  assert.match(workspace, /function removeQuestionHighlight/);
  assert.match(workspace, /function removeQuestionArea/);
  assert.match(workspace, /function clearQuestionAnnotations\(\) \{\s*setQuestionHighlights\(\[\]\);\s*setQuestionAreas\(\[\]\);\s*\}/s);
  assert.match(workspace, /onDeleteHighlight=\{removeHighlight\}/);
  assert.match(workspace, /onDeleteArea=\{removeArea\}/);
  assert.match(workspace, /selectedText,/);
});
