import test from "node:test";
import assert from "node:assert/strict";
import { isSameOriginRequest } from "../lib/auth/same-origin";
import { runBounded } from "../lib/pdf-sync/run-bounded";
import { syncPaper } from "../lib/pdf-sync/sync-paper";
import { PdfSyncError, type SyncDependencies } from "../lib/pdf-sync/types";
import { MAX_PDF_BYTES, readPdfResponse, sha256 } from "../lib/pdf-sync/validate-pdf";
import type { PdfManifestEntry } from "../lib/papers/types";

const entry: PdfManifestEntry = {
  id: "VLA_4", title: "OpenVLA", sourceUrl: "https://arxiv.org/abs/2406.09246",
  pdfSourceUrl: "https://arxiv.org/pdf/2406.09246", blobPathname: "papers/VLA/VLA_4/arxiv-v1/VLA_04_OpenVLA.pdf",
  sha256: null, sizeBytes: null, version: "arxiv-v1", uploadStatus: "pending", processingStatus: "pending", reason: "",
};

function dependencies(overrides: Partial<SyncDependencies> = {}): SyncDependencies {
  const response = new Response(new TextEncoder().encode("%PDF-test"), { status: 200, headers: { "content-type": "application/pdf" } });
  Object.defineProperty(response, "url", { value: "https://arxiv.org/pdf/2406.09246" });
  return { getEntry: () => entry, blobExists: async () => false, upload: async () => undefined, fetchPdf: async () => response, ...overrides };
}

test("admin sync mutations require the same origin", () => {
  assert.equal(isSameOriginRequest(new Request("https://paper.test/api/admin/sync-pdfs", { method: "POST" })), false);
  assert.equal(isSameOriginRequest(new Request("https://paper.test/api/admin/sync-pdfs", { method: "POST", headers: { origin: "https://attacker.test" } })), false);
  assert.equal(isSameOriginRequest(new Request("https://paper.test/api/admin/sync-pdfs", { method: "POST", headers: { origin: "https://paper.test" } })), true);
});

test("unknown and excluded papers are rejected", async () => {
  await assert.rejects(syncPaper("VLA_404", dependencies({ getEntry: () => undefined })), (error: PdfSyncError) => error.code === "UNKNOWN_PAPER");
  await assert.rejects(syncPaper("RL_1", dependencies({ getEntry: () => ({ ...entry, id: "RL_1", uploadStatus: "excluded", reason: "Not a paper" }) })), (error: PdfSyncError) => error.code === "EXCLUDED_PAPER");
});

test("missing PDF URL is rejected", async () => {
  await assert.rejects(syncPaper("VLA_4", dependencies({ getEntry: () => ({ ...entry, pdfSourceUrl: null }) })), (error: PdfSyncError) => error.code === "MISSING_PDF_URL");
});

test("existing Blob is skipped without downloading or uploading", async () => {
  let called = false;
  const result = await syncPaper("VLA_4", dependencies({ blobExists: async () => true, fetchPdf: async () => { called = true; throw new Error(); }, upload: async () => { called = true; } }));
  assert.equal(result.status, "skipped"); assert.equal(called, false);
});

test("non-PDF content and oversized responses are rejected", async () => {
  await assert.rejects(readPdfResponse(new Response("html", { headers: { "content-type": "text/html" } })), (error: PdfSyncError) => error.code === "NOT_A_PDF");
  await assert.rejects(readPdfResponse(new Response("%PDF-x", { headers: { "content-type": "application/pdf", "content-length": String(MAX_PDF_BYTES + 1) } })), (error: PdfSyncError) => error.code === "PDF_TOO_LARGE");
});

test("uploaded PDF returns size and SHA-256", async () => {
  const result = await syncPaper("VLA_4", dependencies());
  assert.equal(result.status, "uploaded"); assert.equal(result.sizeBytes, 9); assert.equal(result.sha256, "3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63");
  assert.equal(sha256(new TextEncoder().encode("%PDF-test")), result.sha256);
});

test("arXiv downloads send PDF headers and fall back to the official export host", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const good = new Response(new TextEncoder().encode("%PDF-test"), { headers: { "content-type": "application/pdf" } });
  Object.defineProperty(good, "url", { value: "https://export.arxiv.org/pdf/2406.09246.pdf" });
  const fetchPdf = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (calls.length < 3) return new Response("blocked", { status: 403 });
    return good;
  }) as typeof fetch;
  const result = await syncPaper("VLA_4", dependencies({ fetchPdf }));
  assert.equal(result.status, "uploaded");
  assert.equal(calls[2].url, "https://export.arxiv.org/pdf/2406.09246.pdf");
  assert.equal(new Headers(calls[0].init?.headers).get("accept"), "application/pdf");
  assert.match(new Headers(calls[0].init?.headers).get("user-agent") ?? "", /PaperArchiving/);
});

test("bounded runner continues after a paper fails", async () => {
  const results = await runBounded(["bad", "good"], async (id) => { if (id === "bad") throw new Error("failure"); return id; }, 2);
  assert.equal(results[0].status, "rejected"); assert.deepEqual(results[1], { status: "fulfilled", value: "good" });
});
