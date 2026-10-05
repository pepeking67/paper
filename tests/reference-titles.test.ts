import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchReferenceTitles, titleFromEntry } from "../lib/references/match-reference";

test("numbered references match exact IDs, lists and ranges without AI", () => {
  const refs = "References\n[1] D. P. Kingma and M. Welling. Auto-Encoding Variational Bayes. ICLR, 2014.\n[2] A. Vaswani et al. Attention is all you need. NeurIPS, 2017.\n[12] J. Doe. Another specific paper title. 2024.";
  assert.deepEqual(matchReferenceTitles("[1]", refs), [{ label: "[1]", title: "Auto-Encoding Variational Bayes" }]);
  assert.equal(matchReferenceTitles("[1, 2]", refs).length, 2);
  assert.equal(matchReferenceTitles("[1–2]", refs).length, 2);
  assert.equal(matchReferenceTitles("[3]", refs).length, 0);
  assert.equal(matchReferenceTitles("[12]", refs)[0].title, "Another specific paper title");
});
test("author year matching requires unambiguous author and year", () => {
  const refs = "Kingma, D. P., and Welling, M. (2014). Auto-Encoding Variational Bayes. ICLR.\n\nVaswani, A. et al. (2017). Attention is all you need. NeurIPS.";
  assert.equal(matchReferenceTitles("Kingma and Welling (2014)", refs)[0]?.title, "Auto-Encoding Variational Bayes");
  assert.equal(matchReferenceTitles("Kingma (2024)", refs).length, 0);
  assert.equal(matchReferenceTitles("Kingma", refs).length, 0);
  assert.equal(matchReferenceTitles("Kingma (2014)", refs + "\n\nKingma, D. (2014). A second different paper. Journal.").length, 0);
});
test("multiline titles and quoted IEEE titles are preserved", () => {
  assert.equal(titleFromEntry('J. Doe, “Learning representations for robots,” Journal, 2020.'), "Learning representations for robots");
  assert.equal(titleFromEntry("J. Doe. Learning repre-\nsentations for\nrobots. Journal, 2020."), "Learning representations for robots");
  assert.equal(titleFromEntry("No separable bibliography title"), null);
});
test("reference selection is separate from annotation/chat callbacks and has no API", async () => {
  const viewer = await readFile("components/pdf-viewer/pdf-viewer.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");
  const card = await readFile("components/references/reference-card.tsx", "utf8");
  assert.match(viewer, /tool !== "reference" && contextCount > 0/);
  assert.match(viewer, /onReferenceSelection=/);
  assert.match(page, /if \(referenceMode\) \{[\s\S]*?onReferenceSelection\?\.[\s\S]*?return;\s*\}/);
  assert.doesNotMatch(card, /fetch\(|useAuth|<form|<input|summary/);
  assert.match(card, /matchReferenceTitles/);
});
