import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("PDF viewer uses the same-origin prepared worker", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const preparationScript = await readFile("scripts/prepare-pdf-worker.mjs", "utf8");
  assert.match(viewer, /workerSrc="\/pdf\.worker\.min\.mjs"/);
  assert.match(viewer, /installUint8ArrayToHex\(\)/);
  assert.match(preparationScript, /Uint8Array\.prototype\.toHex/);
  assert.equal(packageJson.scripts.prebuild, "npm run prepare-pdf-worker");
  assert.equal(packageJson.scripts.predev, "npm run prepare-pdf-worker");
});

test("continuous viewer fetches one PDF document and lazy-renders individual pages", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  const route = await readFile("app/api/pdf/[paperId]/route.ts", "utf8");
  assert.equal((viewer.match(/fetch\(`/g) ?? []).length, 1);
  assert.doesNotMatch(viewer, /\/api\/papers\//);
  assert.match(viewer, /Array\.from\(\{ length: pdf\.numPages \}/);
  assert.match(page, /IntersectionObserver/);
  assert.match(page, /rootMargin: "120% 0px"/);
  assert.match(page, /renderTask\?\.cancel\(\)/);
  assert.match(page, /page\.render\(\{ canvas, canvasContext, viewport \}\)/);
  assert.match(page, /renderError/);
  assert.doesNotMatch(route, /privateBlobExists/);
  assert.match(route, /"Accept-Ranges":"none"/);
});
