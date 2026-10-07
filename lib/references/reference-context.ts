import type { PDFDocumentProxy } from "pdfjs-dist";

const cache = new WeakMap<PDFDocumentProxy, Promise<string>>();
/** Extract the bibliography locally for deterministic citation lookup, not the entire paper. */
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

