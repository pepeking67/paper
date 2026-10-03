import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Study Tray renders in the PDF header without legacy PDF management", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");
  assert.match(viewer, /id="study-tray-actions"/);
  assert.match(tray, /createPortal/);
  assert.match(tray, /study-tray-actions/);
  assert.doesNotMatch(tray, /fixed bottom-/);
});
