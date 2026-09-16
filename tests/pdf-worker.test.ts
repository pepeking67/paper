import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("PDF viewer keeps normal PDF.js fonts and uses a Chromium 138-139 PDFium visual fallback", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const fallback = await readFile("lib/pdf/pdfium-visual-renderer.ts", "utf8");
  const layout = await readFile("app/layout.tsx", "utf8");
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const preparationScript = await readFile("scripts/prepare-pdf-worker.mjs", "utf8");

  assert.match(viewer, /workerSrc = "\/pdf\.worker\.min\.mjs"/);
  assert.match(layout, /pdfjs-dist\/web\/pdf_viewer\.css/);
  assert.match(viewer, /installPdfJsCompatibility\(\)/);
  assert.match(viewer, /cMapUrl: "\/pdfjs\/cmaps\/"/);
  assert.match(viewer, /cMapPacked: true/);
  assert.match(viewer, /standardFontDataUrl: "\/pdfjs\/standard_fonts\/"/);
  assert.doesNotMatch(viewer, /disableFontFace:\s*true/);
  assert.doesNotMatch(viewer, /useSystemFonts:\s*false/);

  assert.match(viewer, /needsChromiumFontMatrixFallback\(\)/);
  assert.match(viewer, /createPdfiumVisualRenderer/);
  assert.match(viewer, /installPdfiumPageRendering/);
  assert.match(fallback, /major >= 138 && major < 140/);
  assert.match(fallback, /FPDF_RenderPageBitmap/);
  assert.match(fallback, /fetch\("\/pdfium\.wasm"\)/);
  assert.equal(packageJson.dependencies["@embedpdf/pdfium"], "2.15.0");

  assert.match(preparationScript, /Uint8Array\.prototype\.toHex/);
  assert.match(preparationScript, /Map\.prototype\.getOrInsertComputed/);
  assert.match(preparationScript, /path\.join\(packageRoot, "cmaps"\)/);
  assert.match(preparationScript, /path\.join\(packageRoot, "standard_fonts"\)/);
  assert.match(preparationScript, /pdfium\.wasm/);
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
  assert.match(page, /page\.render\(\{/);
  assert.match(page, /renderError/);
  assert.match(page, /surfaceSize/);
  assert.match(page, /ref=\{surfaceRef\}/);
  assert.match(page, /<canvas ref=\{canvasRef\}/);
  assert.match(page, /<div ref=\{textLayerRef\}/);
  assert.match(page, /collectSelectionFromTextItems/);
  assert.match(page, /mergeCharacterRects/);
  assert.match(page, /document\.createRange\(\)/);
  assert.match(page, /setProperty\("--scale-factor", String\(viewport\.scale\)\)/);
  assert.match(page, /capturedSelections/);
  assert.match(viewer, /setZoom/);
  assert.match(viewer, /현재.*pdf\.numPages.*페이지/);
  assert.match(viewer, /paper-header-actions/);
  assert.match(viewer, /다음 질문 문맥으로 사용합니다/);
  assert.doesNotMatch(route, /privateBlobExists/);
  assert.match(route, /"Accept-Ranges":"none"/);
});

test("workspace exposes persistent keyboard-accessible PDF side resizers", async () => {
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const styles = await readFile("app/globals.css", "utf8");
  assert.match(workspace, /role="separator"/);
  assert.match(workspace, /setPointerCapture/);
  assert.match(workspace, /paper-study-library-width/);
  assert.match(workspace, /paper-study-chat-width/);
  assert.match(workspace, /--library-width/);
  assert.match(workspace, /--chat-width/);
  assert.match(styles, /var\(--library-width, 220px\)/);
  assert.match(styles, /var\(--chat-width, 440px\)/);
});
