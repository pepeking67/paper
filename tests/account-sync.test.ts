import assert from "node:assert/strict";
import test from "node:test";
import { emptyStudyTray } from "../lib/study-tray/types";
import { chooseStudySyncAction } from "../lib/account-sync/sync-resolution";
import type { LocalStudySnapshot } from "../lib/account-sync/local-state";
import type { RemoteStudyState } from "../lib/account-sync/study-state-client";

function local(overrides: Partial<LocalStudySnapshot> = {}): LocalStudySnapshot {
  return { tray: emptyStudyTray(), noteMarkdown: "", dirty: false, changedAt: null, remoteRevision: null, remoteUpdatedAt: null, ...overrides };
}

function remote(revision = 1): RemoteStudyState {
  return { paperId: "P1", tray: emptyStudyTray(), noteMarkdown: "server", revision, updatedAt: "2026-09-18T00:00:00.000Z" };
}

test("empty local state pulls an existing remote state", () => {
  assert.equal(chooseStudySyncAction(local(), remote()), "pull-remote");
});

test("first local-only content is pushed when no remote row exists", () => {
  assert.equal(chooseStudySyncAction(local({ noteMarkdown: "local", dirty: true }), null), "push-local");
});

test("dirty state updates the same remote revision", () => {
  assert.equal(chooseStudySyncAction(local({ noteMarkdown: "local", dirty: true, remoteRevision: 4 }), remote(4)), "push-local");
});

test("dirty state detects a newer remote revision instead of overwriting it", () => {
  assert.equal(chooseStudySyncAction(local({ noteMarkdown: "local", dirty: true, remoteRevision: 4 }), remote(5)), "conflict");
});

test("clean cache accepts the current server state", () => {
  assert.equal(chooseStudySyncAction(local({ noteMarkdown: "cached", dirty: false, remoteRevision: 4 }), remote(5)), "pull-remote");
});
