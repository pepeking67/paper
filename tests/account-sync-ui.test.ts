import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("account sync stays optional and keeps an offline cache", async () => {
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const panel = await readFile("components/account/account-sync-panel.tsx", "utf8");
  const migration = await readFile("supabase/migrations/20260918_account_study_sync.sql", "utf8");
  const prompt = await readFile("docs/WORK_ACCOUNT_LIBRARY_PROMPT.md", "utf8");

  assert.match(workspace, /persistLocalStudyContent/);
  assert.match(workspace, /navigator\.onLine/);
  assert.match(workspace, /StudySyncConflictError/);
  assert.match(workspace, /reconcileAccountState\("force-push"\)/);
  assert.match(panel, /서버 버전 받기/);
  assert.match(panel, /이 기기 버전 사용/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\) = user_id/);
  assert.match(prompt, /Do not merge to/);
  assert.match(prompt, /paper_categories/);
  assert.match(prompt, /user_papers/);
});
