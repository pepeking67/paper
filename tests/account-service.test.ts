import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("browser auth restores and refreshes sessions without a service-role key", async () => {
  const client = await readFile("lib/supabase/browser.ts", "utf8");
  const provider = await readFile("components/auth/auth-provider.tsx", "utf8");
  const control = await readFile("components/auth/account-control.tsx", "utf8");
  assert.match(client, /persistSession: true/);
  assert.match(client, /autoRefreshToken: true/);
  assert.match(provider, /getSession\(\)/);
  assert.match(provider, /onAuthStateChange/);
  assert.match(provider, /emailRedirectTo: window\.location\.origin/);
  assert.match(control, /회원가입 인증 메일 발송 한도를 초과했습니다/);
  assert.match(control, /invalid_credentials/);
  assert.doesNotMatch(`${client}\n${provider}`, /service[_-]?role/i);
});

test("the workspace requires login and never mixes the shared catalog into a personal library", async () => {
  const workspace = await readFile("components/study-workspace.tsx", "utf8");
  const home = await readFile("app/page.tsx", "utf8");
  const accountHome = await readFile("components/auth/account-home.tsx", "utf8");
  assert.match(workspace, /papers=\{personalLibrary\.papers\} userMode/);
  assert.match(workspace, /<AccountControl initiallyOpen required\/>/);
  assert.match(workspace, /return <LoginScreen\/>/);
  assert.match(workspace, /!userMode && <PdfSyncPanel papers=\{papers\}/);
  assert.doesNotMatch(workspace, /combinedPapers/);
  assert.doesNotMatch(workspace, /activePaper=\{\{ \.\.\.initialPaper, library: "legacy" \}\}/);
  assert.match(home, /<AccountHome\/>/);
  assert.doesNotMatch(home, /papers\/catalog/);
  assert.match(accountHome, /<AccountControl initiallyOpen required\/>/);
});

test("personal PDF controls and paper lists do not expose filenames or internal IDs", async () => {
  const manager = await readFile("components/library/library-manager.tsx", "utf8");
  const paperList = await readFile("components/paper-list/paper-list.tsx", "utf8");
  assert.match(manager, /className="sr-only"/);
  assert.match(manager, /PDF 선택됨/);
  assert.doesNotMatch(manager, /\{pdf\?\.name\}/);
  assert.doesNotMatch(paperList, /\{paper\.id\} ·/);
});

test("account edits are local-first and revision conflicts require a choice", async () => {
  const hook = await readFile("lib/study-sync/use-study-state.ts", "utf8");
  const status = await readFile("components/study-sync/sync-status.tsx", "utf8");
  assert.match(hook, /writeAccountCache/);
  assert.match(hook, /\.eq\("revision", current\.baseRevision\)/);
  assert.match(hook, /window\.addEventListener\("online"/);
  assert.match(status, /서버 버전 사용/);
  assert.match(status, /이 기기 버전 사용/);
});

test("personal files use private Storage paths and transactional deletion", async () => {
  const library = await readFile("components/library/personal-library-provider.tsx", "utf8");
  const area = await readFile("lib/area-assets/area-storage.ts", "utf8");
  assert.match(library, /`\$\{user!\.id\}\/\$\{paperId\}\//);
  assert.match(library, /rpc\("delete_user_paper"/);
  assert.match(area, /paper-area-crops/);
  assert.match(area, /image\/webp/);
});
