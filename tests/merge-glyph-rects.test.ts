import assert from "node:assert/strict";
import test from "node:test";
import { getTextFragmentRect, getUnderlinePaintRect, mergeClientRectsIntoLineRects, mergeGlyphRects, normalizeClientRects, normalizeHighlightRects, projectHighlightRect } from "../lib/pdf/merge-glyph-rects";

const clientRect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height });

test("formula glyphs become one continuous annotation line", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(10, 10, 8, 10),
    clientRect(20, 5, 5, 6),
    clientRect(32, 10, 8, 10),
    clientRect(49, 15, 5, 6),
    clientRect(58, 10, 8, 10),
  ]), [clientRect(10, 10, 56, 10)]);
});

test("a formula highlight uses one full bounding block for operators and limits", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(10, 30, 30, 10),
    { ...clientRect(42, 10, 12, 50), character: "∑" },
    clientRect(55, 8, 8, 8),
    clientRect(55, 50, 8, 8),
    clientRect(66, 30, 100, 10),
    clientRect(210, 30, 80, 10),
  ], { referenceLineHeight: 10, clampTallMath: true, fullFormulaBounds: true }), [
    clientRect(10, 8, 280, 52),
  ]);
});

test("garbled formula text still uses its full geometry when requested", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(10, 30, 90, 10),
    clientRect(102, 8, 18, 52),
    clientRect(122, 30, 120, 10),
  ], { referenceLineHeight: 10, fullFormulaBounds: true }), [
    clientRect(10, 8, 232, 52),
  ]);
});

test("full formula bounds still preserve separate visual equation rows", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(10, 10, 100, 10),
    clientRect(42, 2, 8, 6),
    clientRect(10, 40, 100, 10),
    clientRect(42, 52, 8, 6),
  ], { referenceLineHeight: 10, clampTallMath: true, fullFormulaBounds: true }), [
    clientRect(10, 2, 100, 18),
    clientRect(10, 40, 100, 18),
  ]);
});

test("full formula bounds do not bridge separate PDF columns", () => {
  assert.equal(mergeClientRectsIntoLineRects([
    clientRect(10, 20, 60, 10),
    { ...clientRect(72, 8, 12, 34), character: "∑" },
    clientRect(180, 20, 60, 10),
  ], { referenceLineHeight: 10, clampTallMath: true, fullFormulaBounds: true }).length, 2);
});

test("underline paint sits below the complete formula bounds", () => {
  assert.deepEqual(getUnderlinePaintRect(clientRect(10, 8, 280, 52)), {
    left: 10,
    top: 61.5,
    width: 280,
    height: 2,
  });
});

test("a product operator uses the surrounding body-text band instead of painting into the line above", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    { ...clientRect(10, 4, 12, 22), character: "∏" },
    clientRect(23, 11, 7, 10),
  ], { referenceLineHeight: 10 }), [clientRect(10, 11, 20, 10)]);
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(10, 4, 12, 22),
  ], { referenceLineHeight: 10, clampTallMath: true }), [clientRect(10, 10, 12, 10)]);
});

test("a product operator attaches to the equation row rather than the preceding prose row", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(45, 5, 55, 10),
    clientRect(10, 22, 18, 10),
    { ...clientRect(30, 12, 12, 26), character: "∏" },
    clientRect(44, 22, 56, 10),
  ], { referenceLineHeight: 10, clampTallMath: true }), [
    clientRect(45, 5, 55, 10),
    clientRect(10, 22, 90, 10),
  ]);
});

test("a selected tall square bracket is clamped to the normal equation band", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    { ...clientRect(50, 2, 5, 28), character: "[" },
  ], { referenceLineHeight: 10 }), [clientRect(50, 11, 5, 10)]);

  // Stored annotations no longer contain per-character metadata. Their text
  // still enables the same compatibility normalization during display.
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(50, 2, 5, 28),
  ], { referenceLineHeight: 10, clampTallMath: true }), [clientRect(50, 11, 5, 10)]);
});

test("garbled legacy math rects use geometry instead of extracted symbols", () => {
  const rows = mergeClientRectsIntoLineRects([
    clientRect(10, 20, 90, 10),
    clientRect(102, 6, 18, 38),
    clientRect(122, 10, 22, 30),
    clientRect(146, 5, 16, 40),
    clientRect(164, 20, 150, 10),
  ]);

  assert.deepEqual(rows, [clientRect(10, 20, 304, 10)]);
});

test("a geometry-detected operator stays on the equation row below prose", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(55, 4, 65, 10),
    clientRect(10, 22, 22, 10),
    clientRect(34, 10, 16, 34),
    clientRect(52, 22, 68, 10),
  ], { referenceLineHeight: 10 }), [
    clientRect(55, 4, 65, 10),
    clientRect(10, 22, 110, 10),
  ]);
});

test("a large ordinary heading is not mistaken for a math operator", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(10, 4, 120, 22),
  ], { referenceLineHeight: 10 }), [clientRect(10, 4, 120, 22)]);
});

test("fraction bars and tall operators remain in one body-height equation band", () => {
  const rows = mergeClientRectsIntoLineRects([
    clientRect(10, 20, 22, 10),
    clientRect(34, 5, 18, 2),
    { ...clientRect(54, 8, 12, 28), character: "∏" },
    clientRect(68, 13, 7, 6),
    clientRect(77, 27, 7, 6),
    clientRect(86, 20, 32, 10),
  ], { referenceLineHeight: 10, clampTallMath: true });

  assert.deepEqual(rows, [clientRect(10, 20, 108, 10)]);
});

test("math fragments attach to the nearest body row instead of creating thin extra rows", () => {
  const rows = mergeClientRectsIntoLineRects([
    clientRect(10, 10, 40, 10),
    clientRect(55, 1, 18, 2),
    clientRect(75, 4, 10, 24),
    clientRect(10, 34, 40, 10),
  ], { referenceLineHeight: 10, clampTallMath: true });

  assert.deepEqual(rows, [
    clientRect(10, 10, 75, 10),
    clientRect(10, 34, 40, 10),
  ]);
});

test("continuous annotation lines do not bridge PDF columns", () => {
  assert.equal(mergeClientRectsIntoLineRects([
    clientRect(10, 10, 40, 10),
    clientRect(180, 10, 40, 10),
  ]).length, 2);
});

test("continuous annotation lines preserve separate paragraph rows", () => {
  assert.deepEqual(mergeClientRectsIntoLineRects([
    clientRect(10, 10, 40, 10),
    clientRect(10, 23, 25, 10),
  ]).map(({ left, top, width }) => ({ left, top, width })), [
    { left: 10, top: 10, width: 40 },
    { left: 10, top: 23, width: 25 },
  ]);
});

test("a tall equation band does not absorb the following selected row", () => {
  assert.equal(mergeClientRectsIntoLineRects([
    clientRect(10, 5, 100, 16),
    clientRect(10, 23, 100, 10),
  ]).length, 2);
});

test("adjacent formula rows are not bridged by subscripts and superscripts", () => {
  const rows = mergeClientRectsIntoLineRects([
    clientRect(10, 10, 36, 10),
    clientRect(48, 17, 5, 6),
    clientRect(10, 20, 5, 6),
    clientRect(17, 25, 36, 10),
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ left, top, right, bottom }) => ({ left, top, right, bottom })), [
    { left: 10, top: 10, right: 53, bottom: 20 },
    { left: 10, top: 25, right: 53, bottom: 35 },
  ]);
});

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
