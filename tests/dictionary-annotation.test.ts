import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildDictionaryRightLayout, textFontSizePtToPixels } from "../components/pdf-viewer/pdf-page";
import { buildDictionaryContext, buildGeminiModelCandidates, sanitizeDictionaryMeaning } from "../lib/ai/provider";
import { buildDictionaryCsv } from "../lib/dictionary/csv";
import { normalizeDictionaryTerm } from "../lib/dictionary/terms";
import { recoverCachedDictionaryEntries } from "../lib/dictionary/use-personal-dictionary";

test("dictionary terms are normalized for account-first lookup", () => {
  assert.equal(normalizeDictionaryTerm(" Vision–Language—Action! "), "vision language action");
  assert.equal(normalizeDictionaryTerm("행동 정책"), "행동 정책");
});

test("dictionary meanings sit to the right of their term and avoid each other", () => {
  const layout = buildDictionaryRightLayout([
    { id: "a", meaning: "정책", anchorLeft: 100, anchorRight: 120, anchorTop: 50, anchorHeight: 12 },
    { id: "b", meaning: "상태", anchorLeft: 110, anchorRight: 130, anchorTop: 51, anchorHeight: 12 },
    { id: "c", meaning: "행동", anchorLeft: 100, anchorRight: 120, anchorTop: 80, anchorHeight: 12 },
  ], 720);
  assert.deepEqual(layout.get("a"), { left: 122, top: 52, width: 20, height: 8 });
  assert.deepEqual(layout.get("b"), { left: 132, top: 44, width: 20, height: 8 });
  assert.deepEqual(layout.get("c"), { left: 122, top: 82, width: 20, height: 8 });
});

test("Gemini dictionary context stays close to the selected term and the answer stays concise", () => {
  const context = `prefix ${"x".repeat(500)} policy optimization ${"y".repeat(500)}`;
  const excerpt = buildDictionaryContext(context, "policy optimization");
  assert.ok(excerpt.includes("policy optimization"));
  assert.ok(excerpt.length <= 600);
  assert.equal(sanitizeDictionaryMeaning("**정책 최적화.**\n설명"), "정책 최적화");
});

test("dictionary lookup uses supported Gemini models without an incompatible thinking override", async () => {
  assert.deepEqual(buildGeminiModelCandidates("gemini-3.1-flash-lite", "gemini-3.5-flash"), [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
  ]);
  const provider = await readFile("lib/ai/provider.ts", "utf8");
  assert.match(provider, /DEFAULT_GEMINI_DICTIONARY_MODEL = "gemini-3\.1-flash-lite"/);
  assert.doesNotMatch(provider, /gemini-3\.5-flash-lite/);
  assert.doesNotMatch(provider, /thinkingConfig/);
  assert.match(provider, /retryInvalidModel && response\.status === 400/);
});

test("personal dictionary CSV is UTF-8 spreadsheet-safe", () => {
  const csv = buildDictionaryCsv([{ id: "1", text: "=term", page: 0, rects: [], memo: "", kind: "dictionary", dictionaryMeaning: "뜻, 설명", createdAt: "2026-01-01", dictionaryUpdatedAt: "2026-01-02" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=term","뜻, 설명"/);
});

test("a one-time recovery queues valid browser-only dictionary entries for account sync", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  const cached = {
    id: "cached-entry",
    text: "policy",
    page: 0,
    rects: [],
    memo: "",
    kind: "dictionary" as const,
    dictionaryMeaning: "정책",
    createdAt: "2026-09-28T00:00:00.000Z",
  };
  const recovered = recoverCachedDictionaryEntries("account-a", [], {
    version: 1,
    entries: [cached],
    pending: {},
  });
  assert.equal(recovered.didRecover, true);
  assert.equal(recovered.pending.policy?.kind, "upsert");

  values.set("paper-study-personal-dictionary-recovered:account-a:v2", "done");
  const alreadyRecovered = recoverCachedDictionaryEntries("account-a", [], {
    version: 1,
    entries: [cached],
    pending: {},
  });
  assert.equal(alreadyRecovered.didRecover, false);
  assert.deepEqual(alreadyRecovered.pending, {});
  Reflect.deleteProperty(globalThis, "localStorage");
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
  const globalStyles = await readFile("app/globals.css", "utf8");

  assert.match(types, /"highlight" \| "underline" \| "dictionary" \| "text"/);
  assert.match(types, /dictionaryMeaning\?: string/);
  assert.match(localUi, /"highlight", "underline", "dictionary", "text", "area", "erase"/);
  assert.match(viewer, /ToolButton tool="dictionary"/);
  assert.match(viewer, /if \(tool === "dictionary"\)/);
  assert.match(workspace, /kind: "dictionary"/);
  assert.match(workspace, /dictionaryState\.findMeaning\(cleanText\)/);
  assert.match(workspace, /fetch\("\/api\/dictionary"/);
  assert.match(workspace, /dictionaryState\.upsert\(term, meaning\)/);
  assert.match(dictionary, /personal_dictionary_entries/);
  assert.match(dictionary, /paper-study-personal-dictionary:/);
  assert.match(dictionary, /readAccountCache\(userId, PERSONAL_DICTIONARY_PAPER_ID\)/);
  assert.match(dictionary, /mergeRemoteWithPending/);
  assert.match(drawer, /CSV 다운로드/);
  assert.match(drawer, /계정 전체에서 모든 논문에 공유됩니다/);
  assert.match(route, /provider\.defineTerm/);
  assert.match(page, /borderBottom: "1px solid rgba\(17, 17, 17, 0\.58\)"/);
  assert.match(page, /fontSize = Math\.max\(6, Math\.min\(7/);
  assert.match(page, /anchorRight: rect\.left \+ rect\.width/);
  assert.match(page, /buildDictionaryRightLayout/);
  assert.match(page, /className="pointer-events-auto absolute z-\[5\] truncate bg-transparent/);
  assert.match(page, /color: "#111", fontSize/);
  assert.match(page, /뜻 수정/);
  assert.match(page, /onEditDictionaryMeaning\(selection\.annotationId!, value\)/);
  assert.match(page, /className="dictionary-edit-input/);
  assert.match(drawer, /className="dictionary-edit-input/);
  assert.match(globalStyles, /\.dictionary-edit-input[\s\S]*background: #fff !important;[\s\S]*color: #000 !important;[\s\S]*-webkit-text-fill-color: #000;/);
  assert.match(provider, /GEMINI_DICTIONARY_MODEL\?\.trim\(\) \|\| DEFAULT_GEMINI_DICTIONARY_MODEL/);
  assert.match(workspace, /Retry old annotations sequentially/);
});

test("PDF text memo tool defaults to 6pt while keeping its editor readable at 11pt", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const globalStyles = await readFile("app/globals.css", "utf8");

  assert.equal(textFontSizePtToPixels(10, 792, 792), 10);
  assert.match(viewer, /ToolButton tool="text"/);
  assert.doesNotMatch(viewer, /textColor=\{annotationColor\}/);
  assert.match(viewer, /드래그해 검은 글자 메모 작성/);
  assert.match(page, /DEFAULT_TEXT_MEMO_FONT_SIZE_PT = 6/);
  assert.match(page, /TEXT_MEMO_EDITOR_FONT_SIZE_PT = 11/);
  assert.match(page, /fontSizePt: DEFAULT_TEXT_MEMO_FONT_SIZE_PT/);
  assert.equal(page.match(/fontSize: `\$\{TEXT_MEMO_EDITOR_FONT_SIZE_PT\}pt`/g)?.length, 2);
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
  assert.match(exporter, /createDictionaryLabelImage\(pdf, label\.meaning, fontSize\)/);
  assert.match(exporter, /page\.drawImage\(rendered\.image/);
  assert.match(exporter, /canvas\.toDataURL\("image\/png"\)/);
});

test("PDF export rasterizes positioned text memos instead of skipping them", async () => {
  const exporter = await readFile("lib/pdf/export-annotated-pdf.ts", "utf8");
  assert.doesNotMatch(exporter, /if \(annotation\.kind === "text"\) continue/);
  assert.match(exporter, /textMemos\.push/);
  assert.match(exporter, /createTextMemoImage/);
  assert.match(exporter, /page\.drawImage\(rendered\.image/);
  assert.match(exporter, /katex\.renderToString/);
});
