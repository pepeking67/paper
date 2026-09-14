import assert from "node:assert/strict";
import test from "node:test";
import { mergeGlyphRects } from "../lib/pdf/merge-glyph-rects";

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
