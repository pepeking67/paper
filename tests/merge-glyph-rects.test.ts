import assert from "node:assert/strict";
import test from "node:test";
import { mergeGlyphRects } from "../lib/pdf/merge-glyph-rects";

test("neighboring glyphs merge into a line-local marker stroke", () => {
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
