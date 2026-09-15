import assert from "node:assert/strict";
import test from "node:test";
import { getTextFragmentRect, mergeGlyphRects, normalizeClientRects, normalizeHighlightRects, projectHighlightRect } from "../lib/pdf/merge-glyph-rects";

test("a single-line selection keeps its exact horizontal extent", () => {
  assert.deepEqual(mergeGlyphRects([{ left: 12, top: 8, width: 63, height: 9 }]), [{ left: 12, top: 8, width: 63, height: 9 }]);
});

test("neighboring selection fragments merge into a line-local marker stroke", () => {
  assert.deepEqual(mergeGlyphRects([
    { left: 10, top: 10, width: 5, height: 10 },
    { left: 16, top: 10, width: 5, height: 10 },
    { left: 10, top: 30, width: 5, height: 10 },
    { left: 100, top: 30, width: 5, height: 10 },
  ]), [
    { left: 10, top: 10, width: 11, height: 10 },
    { left: 10, top: 30, width: 5, height: 10 },
    { left: 100, top: 30, width: 5, height: 10 },
  ]);
});

test("same-line fragments retain representative vertical geometry", () => {
  const [line] = mergeGlyphRects([
    { left: 10, top: 10, width: 20, height: 10 },
    { left: 31, top: 11, width: 20, height: 8 },
  ]);
  assert.equal(line.left, 10);
  assert.equal(line.width, 41);
  assert.equal(line.top, 10.5);
  assert.equal(line.height, 9);
  assert.notEqual(line.height, 10);
});

test("nearby columns are not merged across a wide horizontal gap", () => {
  assert.equal(mergeGlyphRects([
    { left: 10, top: 10, width: 40, height: 8 },
    { left: 180, top: 10, width: 40, height: 8 },
  ]).length, 2);
});

test("multi-line selections retain different line widths", () => {
  assert.deepEqual(mergeGlyphRects([
    { left: 10, top: 10, width: 80, height: 8 },
    { left: 10, top: 22, width: 35, height: 8 },
  ]).map(({ left, width }) => ({ left, width })), [{ left: 10, width: 80 }, { left: 10, width: 35 }]);
});

test("a selection ending mid-fragment does not include the line remainder", () => {
  assert.deepEqual(getTextFragmentRect({ left: 20, top: 10, width: 100, height: 10 }, "abcdefghij", 2, 6), { left: 40, top: 10, width: 40, height: 10 });
});

test("partial fragments honor proportional text measurement", () => {
  const measure = (value: string) => [...value].reduce((width, character) => width + (character === "W" ? 3 : 1), 0);
  assert.deepEqual(getTextFragmentRect({ left: 0, top: 5, width: 80, height: 8 }, "WWii", 0, 1, measure), { left: 0, top: 5, width: 30, height: 8 });
});

test("native range rectangles preserve each visual line instead of filling to the page edge", () => {
  const surface = { left: 100, top: 50, right: 500, bottom: 650, width: 400, height: 600 };
  const rects = normalizeClientRects([
    { left: 120, top: 80, right: 360, bottom: 92, width: 240, height: 12 },
    { left: 120, top: 98, right: 245, bottom: 110, width: 125, height: 12 },
  ], surface);

  assert.deepEqual(rects, [
    { x: 0.05, y: 0.05, width: 0.6, height: 0.02 },
    { x: 0.05, y: 0.08, width: 0.3125, height: 0.02 },
  ]);
});

test("native range rectangles are clipped to the rendered PDF surface", () => {
  const surface = { left: 100, top: 50, right: 500, bottom: 650, width: 400, height: 600 };
  const [rect] = normalizeClientRects([
    { left: 90, top: 45, right: 130, bottom: 70, width: 40, height: 25 },
  ], surface);
  assert.deepEqual(rect, { x: 0, y: 0, width: 0.075, height: 0.03333333333333333 });
});

test("normalized highlight geometry projects correctly after zoom", () => {
  const [normalized] = normalizeHighlightRects([{ left: 20, top: 30, width: 50, height: 10 }], 200, 300);
  assert.deepEqual(projectHighlightRect(normalized, 400, 600), { left: 40, top: 60, width: 100, height: 20 });
});
