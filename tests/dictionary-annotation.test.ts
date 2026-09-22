import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("dictionary tool creates a synced black-underlined editable gloss", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const types = await readFile("lib/study-tray/types.ts", "utf8");
  const localUi = await readFile("lib/workspace-state/local-ui-state.ts", "utf8");

  assert.match(types, /"highlight" \| "underline" \| "dictionary"/);
  assert.match(types, /dictionaryMeaning\?: string/);
  assert.match(localUi, /"highlight", "underline", "dictionary", "area", "erase"/);
  assert.match(viewer, /ToolButton tool="dictionary"/);
  assert.match(viewer, /if \(tool === "dictionary"\)/);
  assert.match(workspace, /kind: "dictionary"/);
  assert.match(workspace, /fetch\("\/api\/dictionary"/);
  assert.match(page, /borderBottom: "1\.5px solid #111"/);
  assert.match(page, /fontSize = Math\.max\(5, Math\.min\(7/);
  assert.match(page, /뜻 수정/);
  assert.match(page, /onEditDictionaryMeaning\(selection\.annotationId!, value\)/);
});

test("dictionary annotations remain in study material and annotated PDF export", async () => {
  const packet = await readFile("lib/study-tray/build-packet.ts", "utf8");
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");
  const exporter = await readFile("lib/pdf/export-annotated-pdf.ts", "utf8");
  const provider = await readFile("lib/ai/provider.ts", "utf8");

  assert.match(packet, /item\.dictionaryMeaning/);
  assert.match(tray, /item\.kind === "dictionary" \? "Dictionary"/);
  assert.match(exporter, /annotation\.kind === "dictionary" \? \[0, 0, 0\]/);
  assert.match(exporter, /annotation\.kind === "dictionary"\)/);
  assert.match(provider, /async defineTerm/);
  assert.match(provider, /Use at most 24 Korean characters/);
  assert.match(provider, /maxOutputTokens/);
});
