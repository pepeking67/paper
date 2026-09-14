import assert from "node:assert/strict";
import test from "node:test";
import { installUint8ArrayToHex } from "../lib/pdf/uint8array-to-hex";

test("PDF.js Uint8Array toHex compatibility returns lowercase hexadecimal", () => {
  installUint8ArrayToHex();
  const bytes = new Uint8Array([0, 15, 16, 171, 255]) as Uint8Array & { toHex: () => string };
  assert.equal(bytes.toHex(), "000f10abff");
});
