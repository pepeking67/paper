import assert from "node:assert/strict";
import test from "node:test";
import { hasRevisionConflict, sanitizeTrayForServer } from "../lib/study-sync/storage";

test("revision mismatch blocks blind multi-device overwrite", () => {
  assert.equal(hasRevisionConflict(5, 6), true);
  assert.equal(hasRevisionConflict(6, 6), false);
});

test("server study state never stores area image base64", () => {
  const tray = sanitizeTrayForServer({
    highlights: [],
    insights: [],
    memos: [],
    areas: [{
      id: "area-1",
      page: 2,
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      imageDataUrl: "data:image/webp;base64,AAAA",
      storagePath: "user/paper/area-1.webp",
      memo: "equation",
      createdAt: "2026-09-19T00:00:00.000Z",
    }],
  });
  assert.equal(tray.areas?.[0]?.imageDataUrl, undefined);
  assert.equal(tray.areas?.[0]?.storagePath, "user/paper/area-1.webp");
});
