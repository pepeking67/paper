import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadPersonalPdf, PdfDownloadError } from "../lib/pdf/download-personal-pdf";

const original = new TextEncoder().encode("%PDF-1.7\noriginal content\n%%EOF");
const asset = { id: "asset", bucketId: "paper-pdfs", objectPath: "owner/paper/hash.pdf", checksum: null, byteSize: original.length };
function client(download: () => Promise<unknown>, sign?: () => Promise<unknown>) {
  return { storage: { from: (bucket: string) => {
    assert.equal(bucket, "paper-pdfs");
    return { download: async (path: string) => { assert.equal(path, asset.objectPath); return download(); }, createSignedUrl: async (path: string, expiry: number) => {
      assert.equal(path, asset.objectPath); assert.equal(expiry, 120);
      return sign ? sign() : { data: { signedUrl: "https://storage.example/object/sign/owner/paper/hash.pdf?token=private" }, error: null };
    } };
  } } } as unknown as SupabaseClient;
}
const noFetch: typeof fetch = async () => { throw new Error("unexpected retry"); };

test("complete authenticated PDF stays on the normal path without signing or extra egress", async () => {
  const c = client(async () => ({ data: new Blob([original]), error: null }), async () => { throw new Error("unexpected signing"); });
  assert.deepEqual(await downloadPersonalPdf(c, asset, noFetch), original);
});

test("network failure retries once using an ephemeral URL with browser and CDN cache bypass", async () => {
  let calls = 0;
  const c = client(async () => { throw new TypeError("Failed to fetch"); });
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("token"), "private");
    assert.ok(url.searchParams.get("cacheNonce"));
    assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "omit");
    assert.equal(init?.headers, undefined); // No JWT forwarded to the bearer URL.
    assert.ok(init?.signal);
    return new Response(original);
  };
  assert.deepEqual(await downloadPersonalPdf(c, asset, fetcher), original);
  assert.equal(calls, 1);
});

test("truncated normal response recovers instead of reaching the PDF parser", async () => {
  const c = client(async () => ({ data: new Blob([original.slice(0, 10)]), error: null }));
  assert.deepEqual(await downloadPersonalPdf(c, asset, async () => new Response(original)), original);
});

test("same-size corrupt content is detected by SHA-256 and recovered", async () => {
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", original)), b => b.toString(16).padStart(2, "0")).join("");
  const corrupt = original.slice(); corrupt[12] ^= 1;
  const c = client(async () => ({ data: new Blob([corrupt]), error: null }));
  assert.deepEqual(await downloadPersonalPdf(c, { ...asset, checksum }, async () => new Response(original)), original);
});

test("a second incomplete response is rejected with a download-specific error and no loop", async () => {
  let calls = 0;
  const c = client(async () => { throw new TypeError("network"); });
  await assert.rejects(() => downloadPersonalPdf(c, asset, async () => { calls++; return new Response(original.slice(0, 10)); }), error => error instanceof PdfDownloadError && /완전히/.test(error.message));
  assert.equal(calls, 1);
});

test("partial HTTP 206 never reaches the parser even if its size matches metadata", async () => {
  const c = client(async () => { throw new TypeError("network"); });
  await assert.rejects(() => downloadPersonalPdf(c, asset, async () => new Response(original, { status: 206 })), /일부만/);
});

test("authorization and missing-file errors do not create a signed retry", async () => {
  for (const status of [401, 403, 404]) {
    const c = client(async () => ({ data: null, error: { statusCode: String(status) } }), async () => { throw new Error("unexpected signing"); });
    await assert.rejects(() => downloadPersonalPdf(c, asset, noFetch), error => error instanceof PdfDownloadError && error.status === status);
  }
});

test("failed fallback does not expose its signed URL or token in the error message", async () => {
  const c = client(async () => { throw new TypeError("network"); });
  await assert.rejects(() => downloadPersonalPdf(c, asset, async () => { throw new Error("https://storage.example/?token=private"); }), error => error instanceof PdfDownloadError && !/token|private|https:/.test(error.message));
});

test("HTML error responses and checksum mismatches remain download errors", async () => {
  const c = client(async () => { throw new TypeError("network"); });
  await assert.rejects(() => downloadPersonalPdf(c, { ...asset, byteSize: null }, async () => new Response("<html>error</html>")), /PDF 형식이 아닌/);
  await assert.rejects(() => downloadPersonalPdf(c, { ...asset, checksum: "0".repeat(64) }, async () => new Response(original)), /원본과 일치하지/);
});
