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

test("todo blocks preserve checked state through Markdown", () => {
  const blocks = parseStudyNoteMarkdown("- [ ] read paper\n\n- [x] save insight");
  assert.deepEqual(blocks.map((block) => block.type), ["todo", "todo"]);
  assert.equal(blocks[0]?.checked, false);
  assert.equal(blocks[1]?.checked, true);
  assert.match(serializeStudyNoteBlocks(blocks), /- \[ \] read paper/);
  assert.match(serializeStudyNoteBlocks(blocks), /- \[x\] save insight/);
});

test("image block presentation metadata survives parsing", () => {
  const blocks = parseStudyNoteMarkdown("[[PDF_AREA:crop-7|width=65|align=right]]");
  assert.equal(blocks[0]?.type, "image");
  assert.equal(blocks[0]?.imageWidth, 65);
  assert.equal(blocks[0]?.imageAlign, "right");
});

test("study note supports Notion-style live editing shortcuts", async () => {
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");
  const editor = await readFile("components/study-note/notion-note-editor.tsx", "utf8");
  const markdown = await readFile("components/markdown/markdown-content.tsx", "utf8");

  assert.match(tray, /NotionNoteEditor/);
  assert.doesNotMatch(tray, /noteMode/);
  assert.match(tray, /보이는 그대로 편집/);

  assert.match(editor, /SPACE_BLOCK_SHORTCUTS/);
  assert.match(editor, /"#": "heading1"/);
  assert.match(editor, /"##": "heading2"/);
  assert.match(editor, /"###": "heading3"/);
  assert.match(editor, /"-": "bullet"/);
  assert.match(editor, /"1\.": "number"/);
  assert.match(editor, /"\[ \]": "todo"/);
  assert.match(editor, /"```": "code"/);
  assert.match(editor, /"\$\$": "math"/);
  assert.match(editor, /"---": "divider"/);

  assert.match(editor, /SlashMenu/);
  assert.match(editor, /ArrowDown/);
  assert.match(editor, /ArrowUp/);
  assert.match(editor, /findExactSlashOption/);
  assert.match(editor, /shortcut: "code"/);
  assert.match(editor, /shortcut: "equation"/);
  assert.match(editor, /shortcut: "todo"/);
  assert.match(editor, /aliases: \["quote", "blockquote", "callout"/);

  assert.match(editor, /contentEditable/);
  assert.match(editor, /hasCompletedInlineMarkdown/);
  assert.match(editor, /katex\.renderToString/);
  assert.match(editor, /data-inline-math/);
  assert.match(editor, /<strong>\$1<\/strong>/);
  assert.match(editor, /<del>\$1<\/del>/);
  assert.match(editor, /document\.execCommand\("bold"\)/);

  assert.match(editor, /draggable/);
  assert.match(editor, /onDragStart/);
  assert.match(editor, /onDrop/);
  assert.match(editor, /onContextMenu/);
  assert.doesNotMatch(editor, />⠿<\/button>/);

  assert.match(editor, /beginResize/);
  assert.match(editor, /pointermove/);
  assert.match(editor, /이미지 오른쪽 크기 조절/);
  assert.match(editor, /imageAlign/);

  assert.match(markdown, /width=\(\\d\{1,3\}\)/);
  assert.match(markdown, /style=\{\{ width:/);
});
