import assert from "node:assert/strict";
import test from "node:test";
import { getTextFragmentRect, mergeGlyphRects, normalizeHighlightRects, projectHighlightRect } from "../lib/pdf/merge-glyph-rects";

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

test("normalized highlight geometry projects correctly after zoom", () => {
  const [normalized] = normalizeHighlightRects([{ left: 20, top: 30, width: 50, height: 10 }], 200, 300);
  assert.deepEqual(projectHighlightRect(normalized, 400, 600), { left: 40, top: 60, width: 100, height: 20 });
});
