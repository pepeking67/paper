import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseStudyNoteMarkdown, serializeStudyNoteBlocks } from "../lib/study-note/blocks";

test("study note markdown round-trips through editable blocks", () => {
  const source = [
    "# Overview",
    "",
    "A paragraph with **bold** text.",
    "",
    "- first point",
    "",
    "$$",
    "x = y + 1",
    "$$",
    "",
    "[[PDF_AREA:area-1]]",
  ].join("\n");

  const blocks = parseStudyNoteMarkdown(source);
  assert.deepEqual(blocks.map((block) => block.type), ["heading1", "paragraph", "bullet", "math", "image"]);
  assert.equal(blocks.at(-1)?.areaId, "area-1");
  const serialized = serializeStudyNoteBlocks(blocks);
  assert.match(serialized, /# Overview/);
  assert.match(serialized, /\[\[PDF_AREA:area-1\|width=100\|align=center\]\]/);
});

test("image block presentation metadata survives parsing", () => {
  const blocks = parseStudyNoteMarkdown("[[PDF_AREA:crop-7|width=65|align=right]]");
  assert.equal(blocks[0]?.type, "image");
  assert.equal(blocks[0]?.imageWidth, 65);
  assert.equal(blocks[0]?.imageAlign, "right");
});

test("study note is one live Notion-style editing surface", async () => {
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");
  const editor = await readFile("components/study-note/notion-note-editor.tsx", "utf8");
  const markdown = await readFile("components/markdown/markdown-content.tsx", "utf8");

  assert.match(tray, /NotionNoteEditor/);
  assert.doesNotMatch(tray, /noteMode/);
  assert.doesNotMatch(tray, /미리보기.*블록 편집/s);
  assert.match(tray, /보이는 그대로 편집/);

  assert.match(editor, /contentEditable/);
  assert.match(editor, /SlashMenu/);
  assert.match(editor, /\/ 명령/);
  assert.match(editor, /hover:bg-white\/\[\.035\]/);
  assert.match(editor, /draggable/);
  assert.match(editor, /블록 메뉴 및 이동/);
  assert.match(editor, /beginResize/);
  assert.match(editor, /pointermove/);
  assert.match(editor, /이미지 오른쪽 크기 조절/);
  assert.match(editor, /imageAlign/);
  assert.match(editor, /document\.execCommand\("bold"\)/);
  assert.match(editor, /MarkdownContent content=\{serializeStudyNoteBlocks\(\[block\]\)\}/);

  assert.match(markdown, /width=\(\\d\{1,3\}\)/);
  assert.match(markdown, /style=\{\{ width:/);
});
