import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

for (const [name, path] of [
  ["PDF sync", "components/pdf-sync/pdf-sync-panel.tsx"],
  ["Study Tray", "components/study-tray/study-tray.tsx"],
] as const) {
  test(`${name} dialog dismisses from backdrop and Escape`, async () => {
    const source = await readFile(path, "utf8");
    assert.match(source, /event\.target === event\.currentTarget/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /document\.addEventListener\("keydown", handleKeyDown\)/);
    assert.match(source, /document\.removeEventListener\("keydown", handleKeyDown\)/);
  });
}
