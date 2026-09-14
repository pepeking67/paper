import assert from "node:assert/strict";
import test from "node:test";
import { installPdfJsCompatibility } from "../lib/pdf/uint8array-to-hex";

test("PDF.js Uint8Array toHex compatibility returns lowercase hexadecimal", () => {
  installPdfJsCompatibility();
  const bytes = new Uint8Array([0, 15, 16, 171, 255]) as Uint8Array & { toHex: () => string };
  assert.equal(bytes.toHex(), "000f10abff");
});

test("PDF.js Map upsert compatibility computes a missing value once", () => {
  installPdfJsCompatibility();
  const values = new Map<string, number>() as Map<string, number> & { getOrInsertComputed: (key: string, callback: (key: string) => number) => number };
  let calls = 0;
  assert.equal(values.getOrInsertComputed("page", () => { calls += 1; return 3; }), 3);
  assert.equal(values.getOrInsertComputed("page", () => { calls += 1; return 4; }), 3);
  assert.equal(calls, 1);
});
