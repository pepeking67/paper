import type { PDFDocumentProxy } from "pdfjs-dist";

const cache = new WeakMap<PDFDocumentProxy, Promise<string>>();
/** Extract only the bibliography for remote lookup, not the entire paper. */
export function referenceContext(pdf: PDFDocumentProxy): Promise<string> {
  const cached = cache.get(pdf);
  if (cached) return cached;
  const pending = (async () => {
    let result = "";
    let started = false;
    let pages = 0;
    for (let number = 1; number <= Math.min(pdf.numPages, 150); number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      let text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
      if (!started) {
        const heading = /(?:^|\n)\s*(?:\d+[.\s]+)?(?:references|bibliography)\s*(?:\n|$)/im.exec(text);
        if (!heading) continue;
        started = true;
        text = text.slice(heading.index);
      }
      const appendix = /(?:^|\n)\s*(?:Appendix|Supplementary material)\b/i.exec(text);
      if (appendix) text = text.slice(0, appendix.index);
      result += `\nPDF page ${number}\n${text}`;
      if (appendix || ++pages >= 12 || result.length >= 50000) break;
    }
    return result.slice(0, 50000);
  })();
  cache.set(pdf, pending);
  pending.catch(() => cache.delete(pdf));
  return pending;
}

export type ReferenceInfo = { title: string; summary: string; evidence: string };
export function parseReferenceResult(raw: string, references: string): ReferenceInfo | null {
  const value = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as Partial<ReferenceInfo> & { found?: boolean };
  if (value.found === false) return null;
  if (typeof value.title !== "string" || typeof value.summary !== "string" || typeof value.evidence !== "string") return null;
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const title = normalize(value.title);
  const evidence = normalize(value.evidence);
  if (title.length < 8 || value.title.length > 600 || value.summary.length > 350 || !value.summary.trim()
    || evidence.length < title.length || value.evidence.length > 3000
    || !normalize(references).includes(evidence) || !evidence.includes(title)) return null;
  return { title: value.title.trim(), summary: value.summary.trim(), evidence: value.evidence.trim() };
}
