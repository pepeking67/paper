import assert from "node:assert/strict";
import test from "node:test";
import { projectNormalizedRectToPdf } from "../lib/pdf/export-annotated-pdf";

test("projects top-left normalized PDF marks into bottom-left PDF coordinates", () => {
  const rect = projectNormalizedRectToPdf({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, 600, 800);
  assert.deepEqual(rect, { x: 60, y: 560, width: 180, height: 80 });
});

test("clamps exported annotation rectangles to the PDF page", () => {
  const rect = projectNormalizedRectToPdf({ x: 0.9, y: 0.95, width: 0.3, height: 0.2 }, 100, 200);
  assert.deepEqual(rect, { x: 90, y: 0, width: 10, height: 10 });
});
