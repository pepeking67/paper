import assert from "node:assert/strict";
import test from "node:test";
import { placeDictionaryPdfLabel, projectNormalizedRectToPdf } from "../lib/pdf/export-annotated-pdf";

test("projects top-left normalized PDF marks into bottom-left PDF coordinates", () => {
  const rect = projectNormalizedRectToPdf({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, 600, 800);
  assert.deepEqual(rect, { x: 60, y: 560, width: 180, height: 80 });
});

test("clamps exported annotation rectangles to the PDF page", () => {
  const rect = projectNormalizedRectToPdf({ x: 0.9, y: 0.95, width: 0.3, height: 0.2 }, 100, 200);
  assert.deepEqual(rect, { x: 90, y: 0, width: 10, height: 10 });
});

test("places dictionary meanings below their underlined term and avoids collisions", () => {
  const anchor = { x: 100, y: 500, width: 40, height: 10 };
  const first = placeDictionaryPdfLabel(anchor, { width: 60, height: 7 }, 600, 800);
  assert.deepEqual(first, { x: 100, y: 492.25, width: 60, height: 7 });

  const second = placeDictionaryPdfLabel(anchor, { width: 60, height: 7 }, 600, 800, [first]);
  assert.deepEqual(second, { x: 100, y: 484.5, width: 60, height: 7 });
});

test("moves a dictionary meaning above the term when the page bottom has no room", () => {
  const placement = placeDictionaryPdfLabel({ x: 590, y: 3, width: 20, height: 10 }, { width: 60, height: 7 }, 600, 800);
  assert.deepEqual(placement, { x: 538, y: 13.75, width: 60, height: 7 });
});
