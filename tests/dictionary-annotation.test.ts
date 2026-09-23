import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildDictionaryLabelLayout, getDictionaryRail, getTextMemoFontSize } from "../components/pdf-viewer/pdf-page";
import { buildDictionaryContext, sanitizeDictionaryMeaning } from "../lib/ai/provider";
import { buildDictionaryCsv } from "../lib/dictionary/csv";
import { normalizeDictionaryTerm } from "../lib/dictionary/terms";

test("dictionary terms are normalized for account-first lookup", () => {
  assert.equal(normalizeDictionaryTerm(" Vision–Language—Action! "), "vision language action");
  assert.equal(normalizeDictionaryTerm("행동 정책"), "행동 정책");
});

test("dictionary meanings use the nearest PDF margin instead of covering text lines", () => {
  assert.deepEqual(getDictionaryRail({ left: 100, width: 40 }, 720, { left: 54, right: 666 }), { left: 4, width: 46 });
  assert.deepEqual(getDictionaryRail({ left: 540, width: 40 }, 720, { left: 54, right: 666 }), { left: 670, width: 46 });
  assert.deepEqual(getDictionaryRail({ left: 320, width: 40 }, 720, { left: 10, right: 710 }), { left: 726, width: 96 });
});

test("nearby dictionary labels are stacked densely without overlap", () => {
  const layout = buildDictionaryLabelLayout([
    { id: "a", desiredTop: 100, rail: { left: 4, width: 46 } },
    { id: "b", desiredTop: 104, rail: { left: 4, width: 46 } },
    { id: "c", desiredTop: 101, rail: { left: 670, width: 46 } },
  ], 720);
  assert.deepEqual(layout.get("a"), { top: 100, height: 18 });
  assert.deepEqual(layout.get("b"), { top: 119, height: 18 });
  assert.deepEqual(layout.get("c"), { top: 101, height: 18 });
});

test("Gemini dictionary context stays close to the selected term and the answer stays concise", () => {
  const context = `prefix ${"x".repeat(500)} policy optimization ${"y".repeat(500)}`;
  const excerpt = buildDictionaryContext(context, "policy optimization");
  assert.ok(excerpt.includes("policy optimization"));
  assert.ok(excerpt.length <= 600);
  assert.equal(sanitizeDictionaryMeaning("**정책 최적화.**\n설명"), "정책 최적화");
});

test("personal dictionary CSV is UTF-8 spreadsheet-safe", () => {
  const csv = buildDictionaryCsv([{ id: "1", text: "=term", page: 0, rects: [], memo: "", kind: "dictionary", dictionaryMeaning: "뜻, 설명", createdAt: "2026-01-01", dictionaryUpdatedAt: "2026-01-02" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=term","뜻, 설명"/);
});

test("dictionary tool creates a synced black-underlined editable gloss", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const dictionary = await readFile("lib/dictionary/use-personal-dictionary.ts", "utf8");
  const drawer = await readFile("components/dictionary/personal-dictionary.tsx", "utf8");
  const route = await readFile("app/api/dictionary/route.ts", "utf8");
  const types = await readFile("lib/study-tray/types.ts", "utf8");
  const localUi = await readFile("lib/workspace-state/local-ui-state.ts", "utf8");

  assert.match(types, /"highlight" \| "underline" \| "dictionary" \| "text"/);
  assert.match(types, /dictionaryMeaning\?: string/);
  assert.match(localUi, /"highlight", "underline", "dictionary", "text", "area", "erase"/);
  assert.match(viewer, /ToolButton tool="dictionary"/);
  assert.match(viewer, /if \(tool === "dictionary"\)/);
  assert.match(workspace, /kind: "dictionary"/);
  assert.match(workspace, /dictionaryState\.findMeaning\(cleanText\)/);
  assert.match(workspace, /fetch\("\/api\/dictionary"/);
  assert.match(workspace, /dictionaryState\.upsert\(term, meaning\)/);
  assert.match(dictionary, /PERSONAL_DICTIONARY_PAPER_ID = "__personal_dictionary__"/);
  assert.match(drawer, /CSV 다운로드/);
  assert.match(route, /provider\.defineTerm/);
  assert.match(page, /borderBottom: "1\.5px solid #111"/);
  assert.match(page, /fontSize = Math\.max\(8, Math\.min\(9/);
  assert.match(page, /getDictionaryRail\(rect, surfaceSize\.width, textBounds\)/);
  assert.match(page, /buildDictionaryLabelLayout/);
  assert.match(page, /뜻 수정/);
  assert.match(page, /onEditDictionaryMeaning\(selection\.annotationId!, value\)/);
});

test("PDF text memo tool uses a pen color and one-point-smaller local font", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");

  assert.equal(getTextMemoFontSize(12), 12 - 4 / 3);
  assert.match(viewer, /ToolButton tool="text"/);
  assert.match(viewer, /textColor=\{annotationColor\}/);
  assert.match(page, /findNearestTextFontSize/);
  assert.match(page, /paperFontSizePx - 4 \/ 3/);
  assert.match(page, /텍스트 메모 수정/);
  assert.match(workspace, /kind: "text"/);
  assert.match(workspace, /textFontSizeRatio: fontSizeRatio/);
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
