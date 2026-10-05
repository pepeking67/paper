import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Paper } from "../lib/papers/types";
import { entryPaperId } from "../lib/papers/entry-paper";
import { referenceContext } from "../lib/references/reference-context";
import { defaultPaperUiState } from "../lib/workspace-state/local-ui-state";

const paper = (id: string, readingStatus: Paper["readingStatus"]): Paper => ({ id, readingStatus, title: id, authors: "", year: null, tag: "", done: false, keys: [], sourceUrl: null, notionUrl: null });
test("entry paper prefers reading in library order and handles empty libraries", () => {
  assert.equal(entryPaperId([paper("done", "read"), paper("a", "reading"), paper("b", "reading")]), "a");
  assert.equal(entryPaperId([paper("a", "unread"), paper("b", "read")]), "a");
  assert.equal(entryPaperId([]), undefined);
});

test("default copy mode preserves native selection instead of saving annotations", async () => {
  assert.equal(defaultPaperUiState().annotationTool, "select");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  assert.match(page, /function captureSelection\(\) \{\s*if \(selectionOnly \|\|/);
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  assert.match(viewer, /selectionOnly=\{tool === "select"\}/);
  assert.match(viewer, /if \(tool === "select" \|\| tool === "reference"\) return/);
});

test("reference extraction excludes body and appendix and reuses document cache", async () => {
  let reads = 0;
  const pages = ["Introduction\nPrivate main text", "References\n[1] A title. 2024.", "[2] Another title.\nAppendix\nprivate appendix"];
  const pdf = { numPages: 3, getPage: async (n: number) => {
    reads++;
    return { getTextContent: async () => ({ items: pages[n - 1].split("\n").map(str => ({ str, hasEOL: true })) }) };
  } } as unknown as PDFDocumentProxy;
  const result = await referenceContext(pdf);
  assert.match(result, /A title/); assert.match(result, /Another title/);
  assert.doesNotMatch(result, /Private main|private appendix/);
  assert.equal(await referenceContext(pdf), result);
  assert.equal(reads, 3);
});
