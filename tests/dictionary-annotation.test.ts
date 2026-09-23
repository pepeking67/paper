import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { lookupLocalMeaning } from "../lib/dictionary/local-glossary";
import { getDictionaryRail } from "../components/pdf-viewer/pdf-page";

test("local paper glossary resolves common terms without a network request", () => {
  assert.equal(lookupLocalMeaning("Vision-Language-Action"), "시각·언어·행동");
  assert.equal(lookupLocalMeaning("policies"), "정책");
  assert.equal(lookupLocalMeaning("states"), "상태");
  assert.equal(lookupLocalMeaning("unlisted term"), null);
});

test("dictionary meanings use the nearest PDF margin instead of covering text lines", () => {
  assert.deepEqual(getDictionaryRail({ left: 100, width: 40 }, 720, { left: 54, right: 666 }), { left: 4, width: 46 });
  assert.deepEqual(getDictionaryRail({ left: 540, width: 40 }, 720, { left: 54, right: 666 }), { left: 670, width: 46 });
  assert.deepEqual(getDictionaryRail({ left: 320, width: 40 }, 720, { left: 10, right: 710 }), { left: 726, width: 96 });
});

test("dictionary tool creates a synced black-underlined editable gloss", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const glossary = await readFile("lib/dictionary/local-glossary.ts", "utf8");
  const types = await readFile("lib/study-tray/types.ts", "utf8");
  const localUi = await readFile("lib/workspace-state/local-ui-state.ts", "utf8");

  assert.match(types, /"highlight" \| "underline" \| "dictionary"/);
  assert.match(types, /dictionaryMeaning\?: string/);
  assert.match(localUi, /"highlight", "underline", "dictionary", "area", "erase"/);
  assert.match(viewer, /ToolButton tool="dictionary"/);
  assert.match(viewer, /if \(tool === "dictionary"\)/);
  assert.match(workspace, /kind: "dictionary"/);
  assert.match(workspace, /lookupLocalMeaning\(cleanText\)/);
  assert.doesNotMatch(workspace, /fetch\("\/api\/dictionary"/);
  assert.match(glossary, /vision language action/);
  assert.match(page, /borderBottom: "1\.5px solid #111"/);
  assert.match(page, /fontSize = Math\.max\(8, Math\.min\(9/);
  assert.match(page, /getDictionaryRail\(rect, surfaceSize\.width, textBounds\)/);
  assert.match(page, /뜻 수정/);
  assert.match(page, /onEditDictionaryMeaning\(selection\.annotationId!, value\)/);
});

test("dictionary annotations stay out of Study Tray and study-note material", async () => {
  const packet = await readFile("lib/study-tray/build-packet.ts", "utf8");
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");
  const exporter = await readFile("lib/pdf/export-annotated-pdf.ts", "utf8");

  assert.match(packet, /tray\.highlights\.filter\(\(item\) => item\.kind !== "dictionary"\)/);
  assert.match(tray, /tray\.highlights\.filter\(\(item\) => item\.kind !== "dictionary"\)/);
  assert.doesNotMatch(packet, /item\.dictionaryMeaning/);
  assert.match(exporter, /annotation\.kind === "dictionary" \? \[0, 0, 0\]/);
  assert.match(exporter, /annotation\.kind === "dictionary"\)/);
});
