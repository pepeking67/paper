import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("PDF viewer uses the same-origin prepared worker", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.match(viewer, /workerSrc="\/pdf\.worker\.min\.mjs"/);
  assert.equal(packageJson.scripts.prebuild, "npm run prepare-pdf-worker");
  assert.equal(packageJson.scripts.predev, "npm run prepare-pdf-worker");
});
