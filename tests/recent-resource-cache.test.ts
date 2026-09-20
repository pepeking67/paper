import assert from "node:assert/strict";
import test from "node:test";
import { createRecentResourceCache } from "../lib/pdf/recent-resource-cache";

test("recent resource cache reuses a released document without loading again", async () => {
  let loads = 0;
  const cache = createRecentResourceCache<{ id: string }>({ maxEntries: 2, dispose: () => undefined });
  const first = await cache.acquire("account:paper-a", async () => ({ id: `loaded-${++loads}` }));
  first.release();
  const second = await cache.acquire("account:paper-a", async () => ({ id: `loaded-${++loads}` }));

  assert.equal(second.cacheHit, true);
  assert.equal(second.value, first.value);
  assert.equal(cache.peek("account:paper-a"), first.value);
  assert.equal(loads, 1);
  second.release();
});

test("recent resource cache keeps the active document and one previous document", async () => {
  const disposed: string[] = [];
  const cache = createRecentResourceCache<{ id: string }>({ maxEntries: 2, dispose: (value) => { disposed.push(value.id); } });
  const paperA = await cache.acquire("account:paper-a", async () => ({ id: "paper-a" }));
  paperA.release();
  const paperB = await cache.acquire("account:paper-b", async () => ({ id: "paper-b" }));
  const paperC = await cache.acquire("account:paper-c", async () => ({ id: "paper-c" }));

  assert.deepEqual(cache.keys().sort(), ["account:paper-b", "account:paper-c"]);
  assert.deepEqual(disposed, ["paper-a"]);
  paperB.release();
  paperC.release();
});

test("recent resource cache separates identical paper IDs by account-scoped key", async () => {
  let loads = 0;
  const cache = createRecentResourceCache<{ owner: string }>({ maxEntries: 2, dispose: () => undefined });
  const accountA = await cache.acquire("account-a:paper", async () => ({ owner: `owner-${++loads}` }));
  accountA.release();
  const accountB = await cache.acquire("account-b:paper", async () => ({ owner: `owner-${++loads}` }));

  assert.notEqual(accountA.value, accountB.value);
  assert.equal(loads, 2);
  accountB.release();
});
