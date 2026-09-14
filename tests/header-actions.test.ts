import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("PDF management and Study Tray render beside the Notion action", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const sync = await readFile("components/pdf-sync/pdf-sync-panel.tsx", "utf8");
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");
  assert.match(viewer, /id="paper-header-actions"/);
  assert.match(sync, /createPortal/);
  assert.match(sync, /paper-header-actions/);
  assert.match(tray, /createPortal/);
  assert.match(tray, /paper-header-actions/);
  assert.doesNotMatch(sync + tray, /fixed bottom-/);
});
