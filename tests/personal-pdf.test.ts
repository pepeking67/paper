import assert from "node:assert/strict";
import test from "node:test";
import { isOwnedStoragePath, sanitizePdfFilename, validatePdfFile } from "../lib/library/pdf-file";

test("personal PDF filenames and owned paths are traversal safe", () => {
  assert.equal(sanitizePdfFilename("../My 논문 (final).PDF"), "My-final.pdf");
  assert.equal(isOwnedStoragePath("user-1/paper-1/hash-paper.pdf", "user-1", "paper-1"), true);
  assert.equal(isOwnedStoragePath("user-2/paper-1/paper.pdf", "user-1", "paper-1"), false);
  assert.equal(isOwnedStoragePath("user-1/paper-1/../secret.pdf", "user-1", "paper-1"), false);
});

test("PDF validation checks MIME and PDF magic bytes", async () => {
  const valid = new File([new TextEncoder().encode("%PDF-1.7\n")], "paper.pdf", { type: "application/pdf" });
  const result = await validatePdfFile(valid);
  assert.equal(result.filename, "paper.pdf");
  assert.equal(result.contentType, "application/pdf");

  const fake = new File([new TextEncoder().encode("hello")], "fake.pdf", { type: "application/pdf" });
  await assert.rejects(() => validatePdfFile(fake), /유효한 PDF/);
  const wrongMime = new File([new TextEncoder().encode("%PDF-1.7")], "paper.pdf", { type: "text/plain" });
  await assert.rejects(() => validatePdfFile(wrongMime), /application\/pdf/);
});
