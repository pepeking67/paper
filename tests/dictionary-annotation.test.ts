import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildDictionaryBelowLayout, textFontSizePtToPixels } from "../components/pdf-viewer/pdf-page";
import { buildDictionaryContext, sanitizeDictionaryMeaning } from "../lib/ai/provider";
import { buildDictionaryCsv } from "../lib/dictionary/csv";
import { normalizeDictionaryTerm } from "../lib/dictionary/terms";

test("dictionary terms are normalized for account-first lookup", () => {
  assert.equal(normalizeDictionaryTerm(" Vision–Language—Action! "), "vision language action");
  assert.equal(normalizeDictionaryTerm("행동 정책"), "행동 정책");
});

test("dictionary meanings sit below the selected sentence without colliding", () => {
  const layout = buildDictionaryBelowLayout([
    { id: "a", meaning: "정책", desiredLeft: 100, desiredTop: 50, anchorWidth: 20 },
    { id: "b", meaning: "상태", desiredLeft: 110, desiredTop: 51, anchorWidth: 20 },
    { id: "c", meaning: "행동", desiredLeft: 100, desiredTop: 80, anchorWidth: 20 },
  ], 720);
  assert.deepEqual(layout.get("a"), { left: 100, top: 50, width: 28, height: 11 });
  assert.deepEqual(layout.get("b"), { left: 130, top: 51, width: 28, height: 11 });
  assert.deepEqual(layout.get("c"), { left: 100, top: 80, width: 28, height: 11 });
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
  const provider = await readFile("lib/ai/provider.ts", "utf8");
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
  assert.match(page, /desiredTop: rect\.top \+ rect\.height \+ 1/);
  assert.match(page, /buildDictionaryBelowLayout/);
  assert.match(page, /className="pointer-events-auto absolute z-\[5\] truncate bg-transparent/);
  assert.match(page, /color: "#111", fontSize/);
  assert.match(page, /뜻 수정/);
  assert.match(page, /onEditDictionaryMeaning\(selection\.annotationId!, value\)/);
  assert.match(provider, /maxOutputTokens[\s\S]*thinkingConfig: \{ thinkingBudget: 0 \}/);
  assert.match(workspace, /Retry old annotations sequentially/);
});

test("PDF text memo tool supports drag placement, resizing, and adjustable 10pt text", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const globalStyles = await readFile("app/globals.css", "utf8");

  assert.equal(textFontSizePtToPixels(10, 792, 792), 10);
  assert.match(viewer, /ToolButton tool="text"/);
  assert.match(viewer, /textColor=\{annotationColor\}/);
  assert.match(page, /fontSizePt: 10/);
  assert.match(page, /onPointerMove=\{moveTextBox\}/);
  assert.match(page, /텍스트 메모 크기 조절/);
  assert.match(page, /TextFontSizeControl/);
  assert.match(page, /color: "#111"/);
  assert.match(page, /background: "transparent"/);
  assert.doesNotMatch(page, /className="pointer-events-auto absolute z-\[5\] overflow-hidden rounded border border-dashed"/);
  assert.match(page, /pdf-annotation-input/);
  assert.match(globalStyles, /\.pdf-annotation-input[\s\S]*background: #fff !important;[\s\S]*color: #111 !important;/);
  assert.match(page, /텍스트 메모 수정/);
  assert.match(workspace, /kind: "text"/);
  assert.match(workspace, /textFontSizePt: fontSizePt/);
  assert.match(workspace, /moveResizeTextAnnotation/);
});

test("personal dictionary and Study Tray header buttons keep their own spacing", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  assert.match(viewer, /id="study-tray-actions" className="flex items-center gap-2"/);
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
