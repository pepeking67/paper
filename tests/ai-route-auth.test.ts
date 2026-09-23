import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readBearerToken } from "../lib/auth/authorize-personal-paper";

test("personal AI routes authenticate the account and authorize the paper through RLS", async () => {
  const helper = await readFile("lib/auth/authorize-personal-paper.ts", "utf8");
  const chatRoute = await readFile("app/api/chat/route.ts", "utf8");
  const noteRoute = await readFile("app/api/study-note/route.ts", "utf8");
  const dictionaryRoute = await readFile("app/api/dictionary/route.ts", "utf8");
  const chat = await readFile("components/study-chat/study-chat.tsx", "utf8");
  const tray = await readFile("components/study-tray/study-tray.tsx", "utf8");

  assert.match(helper, /auth\.getUser\(token\)/);
  assert.match(helper, /\.from\("user_papers"\)/);
  assert.match(helper, /\.eq\("user_id", authData\.user\.id\)/);
  assert.doesNotMatch(helper, /service[_-]?role/i);
  assert.match(chatRoute, /authorizePersonalPaper\(request, body\.context\.paperId\)/);
  assert.match(chatRoute, /provider\.answerStream/);
  assert.match(chatRoute, /no-cache, no-transform/);
  assert.match(chatRoute, /maxDuration = 120/);
  assert.match(noteRoute, /authorizePersonalPaper\(request, candidate\.paperId\)/);
  assert.match(dictionaryRoute, /authorizePersonalPaper\(request, body\.paperId\)/);
  assert.match(dictionaryRoute, /provider\.defineTerm\(body\.term, body\.pageText\)/);
  assert.doesNotMatch(`${chatRoute}\n${noteRoute}\n${dictionaryRoute}`, /papers\/catalog|findPaper/);
  assert.match(chat, /authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(chat, /response\.body\.getReader\(\)/);
  assert.match(chat, /setMessages\(\[\.\.\.pending, \{ role: "assistant", content: streamedAnswer \}\]\)/);
  assert.match(tray, /authorization: `Bearer \$\{session\.access_token\}`/);
});

test("bearer token parsing rejects missing or malformed authorization headers", () => {
  assert.equal(readBearerToken(null), null);
  assert.equal(readBearerToken("Basic abc"), null);
  assert.equal(readBearerToken("Bearer"), null);
  assert.equal(readBearerToken("Bearer token extra"), null);
  assert.equal(readBearerToken("Bearer valid-token"), "valid-token");
  assert.equal(readBearerToken("bearer valid-token"), "valid-token");
});
