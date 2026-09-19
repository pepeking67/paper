import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("study-note PDF area markers render from saved crop images", async () => {
  const markdown = await readFile("components/markdown/markdown-content.tsx", "utf8");
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");
  const packet = await readFile("lib/study-tray/build-packet.ts", "utf8");

  assert.match(packet, /\[\[PDF_AREA:\$\{item\.id\}\]\]/);
  assert.match(markdown, /PDF_AREA:/);
  assert.match(markdown, /areaById\.get\(segment\.id\)/);
  assert.match(markdown, /src=\{area\.imageDataUrl\}/);
  assert.match(tray, /useHydratedAreas\(tray\.areas \?\? \[\]\)/);
  assert.match(tray, /<NotionNoteEditor value=\{noteMarkdown\} areas=\{embeddedAreas\}/);
});
