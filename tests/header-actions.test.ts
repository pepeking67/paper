import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Study Tray renders in the PDF header while legacy PDF management keeps its portal", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const sync = await readFile("components/pdf-sync/pdf-sync-panel.tsx", "utf8");
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");
  assert.match(viewer, /id="study-tray-actions"/);
  assert.match(sync, /createPortal/);
  assert.match(sync, /paper-header-actions/);
  assert.match(tray, /createPortal/);
  assert.match(tray, /study-tray-actions/);
  assert.doesNotMatch(sync + tray, /fixed bottom-/);
});
