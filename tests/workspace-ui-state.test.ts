import assert from "node:assert/strict";
import test from "node:test";
import {
  chatHistoryStorageKey,
  migrateLegacyChatHistory,
  paperUiStorageKey,
  readPaperUiState,
  updatePaperUiState,
} from "../lib/workspace-state/local-ui-state";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("paper UI state persists independently for each account and paper", () => {
  const storage = new MemoryStorage();
  updatePaperUiState("account-a", "paper-1", {
    page: 12,
    scrollOffsetRatio: 0.42,
    zoom: 225,
    chatDraft: "unfinished question",
    studyTrayOpen: true,
    studyNoteOpen: true,
    studyTrayMemoDraft: "unfinished memo",
  }, storage);
  updatePaperUiState("account-a", "paper-1", { annotationTool: "underline", annotationColor: "blue" }, storage);

  const restored = readPaperUiState("account-a", "paper-1", storage);
  assert.equal(restored.page, 12);
  assert.equal(restored.scrollOffsetRatio, 0.42);
  assert.equal(restored.zoom, 225);
  assert.equal(restored.chatDraft, "unfinished question");
  assert.equal(restored.studyTrayOpen, true);
  assert.equal(restored.studyNoteOpen, true);
  assert.equal(restored.studyTrayMemoDraft, "unfinished memo");
  assert.equal(restored.annotationTool, "underline");
  assert.equal(restored.annotationColor, "blue");
  assert.equal(readPaperUiState("account-b", "paper-1", storage).zoom, 100);
  assert.notEqual(paperUiStorageKey("account-a", "paper-1"), paperUiStorageKey("account-b", "paper-1"));
});

test("paper UI state validates browser data and keeps question context compact", () => {
  const storage = new MemoryStorage();
  storage.setItem(paperUiStorageKey("account", "paper"), JSON.stringify({
    version: 1,
    page: -5,
    scrollOffsetRatio: 4,
    zoom: 999,
    annotationTool: "invalid",
    annotationColor: "invalid",
    chatDraft: "x".repeat(5_000),
    questionHighlightIds: ["one", "one", "two"],
    questionAreaIds: ["a", "b", "c", "d", "e"],
  }));

  const restored = readPaperUiState("account", "paper", storage);
  assert.equal(restored.page, 1);
  assert.equal(restored.scrollOffsetRatio, 1);
  assert.equal(restored.zoom, 250);
  assert.equal(restored.annotationTool, "highlight");
  assert.equal(restored.annotationColor, "yellow");
  assert.equal(restored.chatDraft.length, 4_000);
  assert.equal(restored.studyTrayOpen, false);
  assert.equal(restored.studyTrayMemoDraft, "");
  assert.deepEqual(restored.questionHighlightIds, ["one", "two"]);
  assert.deepEqual(restored.questionAreaIds, ["b", "c", "d", "e"]);
});

test("legacy paper chat migrates once into an account-scoped key", () => {
  const storage = new MemoryStorage();
  storage.setItem("paper-study-chat:paper-1", '[{"role":"user","content":"legacy"}]');

  const migrated = migrateLegacyChatHistory("account-a", "paper-1", storage);
  assert.equal(migrated, '[{"role":"user","content":"legacy"}]');
  assert.equal(storage.getItem(chatHistoryStorageKey("account-a", "paper-1")), migrated);
  assert.equal(migrateLegacyChatHistory("account-b", "paper-1", storage), null);
});
