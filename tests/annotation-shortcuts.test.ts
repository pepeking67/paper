import test from "node:test";
import assert from "node:assert/strict";
import { annotationShortcut, annotationAtPoint } from "../lib/pdf/annotation-shortcuts";

const key = { code: "KeyA", key: "ㅁ", ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, isComposing: false };
test("physical Ctrl/Alt ASDF selects tools including Korean keyboard layout", () => {
  for (const [code, tool] of Object.entries({ KeyA: "highlight", KeyS: "underline", KeyD: "select", KeyF: "text" })) {
    assert.equal(annotationShortcut({ ...key, code }), tool);
    assert.equal(annotationShortcut({ ...key, code, ctrlKey: false, altKey: true }), tool);
  }
});
test("typing, IME composition and unrelated modifier combinations do not change tools", () => {
  for (const change of [{ ctrlKey: false }, { altKey: true }, { shiftKey: true }, { metaKey: true }, { isComposing: true }, { code: "KeyZ" }]) {
    assert.equal(annotationShortcut({ ...key, ...change }), null);
  }
});
test("right-click hit testing respects zoomed screen bounds and uppermost saved block", () => {
  const block = (id: string, area = false) => ({ dataset: area ? { pdfAreaId: id } : { pdfAnnotationId: id }, getBoundingClientRect: () => ({ left: 100, top: 200, right: 300, bottom: 240, width: 200, height: 40 }) });
  const root = { querySelectorAll: () => [block("underline"), block("area", true)] } as unknown as Element;
  assert.deepEqual(annotationAtPoint(root, 150, 220), { id: "area", area: true });
  assert.equal(annotationAtPoint(root, 99, 220), null);
  assert.equal(annotationAtPoint(root, 150, 241), null);
});
