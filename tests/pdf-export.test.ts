import assert from "node:assert/strict";
import test from "node:test";
import { placeDictionaryPdfLabel, projectNormalizedRectToPdf, renderTextMemoMarkup, textMemoToPlainText } from "../lib/pdf/export-annotated-pdf";

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

test("keeps text memo content readable when PDF export falls back from rich math rendering", () => {
  assert.equal(textMemoToPlainText("**메모**: $x^2 + y^2$\n`policy`"), "메모: x^2 + y^2\npolicy");
});

test("PDF memo renderer recognizes a multiline aligned formula inside single dollar delimiters", async () => {
  const source = "$\\begin{aligned}\nE_q[f(z)] &= \\int q(z)f(z)\\,dz \\\\\n&= \\frac{q(z)}{p_\\theta(z)}\n\\end{aligned}$";
  const markup = await renderTextMemoMarkup(source);

  assert.match(markup, /<math/u);
  assert.match(markup, /<mtable/u);
  assert.doesNotMatch(markup, /\$\\begin\{aligned\}/u);
  assert.equal(textMemoToPlainText(source).startsWith("\\begin{aligned}"), true);
  assert.equal(textMemoToPlainText(source).endsWith("\\end{aligned}"), true);
});
