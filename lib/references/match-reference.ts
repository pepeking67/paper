export type ReferenceTitle = { label: string; title: string };
type Entry = { label: string; text: string };
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Only boundary differences are tolerated; digits and internal spelling stay exact. */
function edgeVariants(value: string, minimum: number): Set<string> {
  const variants = new Set<string>();
  for (let left = 0; left <= 2; left++) for (let right = 0; right <= 2; right++) {
    const core = value.slice(left, right ? -right : undefined).trim();
    if (core.length >= minimum) variants.add(core);
  }
  return variants;
}
function boundaryMatch(left: string, right: string, minimum: number) {
  const variants = edgeVariants(left, minimum);
  return [...edgeVariants(right, minimum)].some(value => variants.has(value));
}
const compact = (value: string) => normalize(value).replace(/[^\p{L}\p{N}]/gu, "");

/** Bibliographic punctuation is preserved: no generated or recalled metadata. */
export function titleFromEntry(entry: string): string | null {
  const text = entry.replace(/-\s*\n\s*/g, "").replace(/\s+/g, " ").trim();
  const quoted = /[“"]([^”"]{8,600})[”"]/.exec(text);
  if (quoted) return quoted[1].replace(/[,.;:]$/, "").trim();
  const protectedText = text.replace(/\b([A-Z])\./g, "$1\u0001")
    .replace(/\b(et al|Jr|Sr)\./g, "$1\u0001");
  const parts = protectedText.split(/\.\s+/).map(part => part.replace(/\u0001/g, ".").trim());
  // Common author-title-venue and APA author-(year)-title-venue layouts.
  if (parts.length < 2) return null;
  let candidate = parts[1];
  if (/^\(?\d{4}[a-z]?\)?$/.test(candidate) && parts.length > 2) candidate = parts[2];
  candidate = candidate.replace(/\.$/, "").trim();
  if (candidate.length < 8 || candidate.length > 600 || !/\p{L}/u.test(candidate)
    || /^(?:In |Proceedings of |https?:|doi:|arXiv:|\d)/i.test(candidate)) return null;
  return candidate;
}

function entriesFromText(references: string): Entry[] {
  const text = references.replace(/^PDF page \d+\s*$/gm, "").replace(/^\s*(?:references|bibliography)\s*$/gim, "");
  const numbered = [...text.matchAll(/(?:^|\n)\s*(?:\[(\d+)\]|(\d+)\.)\s+/g)];
  if (numbered.length) return numbered.map((match, index) => ({
    label: match[1] ?? match[2],
    text: text.slice(match.index! + match[0].length, numbered[index + 1]?.index ?? text.length).trim(),
  }));
  // Author-year lists: blank paragraphs or a fresh surname-first bibliographic line.
  // Ambiguous layouts fail closed instead of constructing a title from prose.
  return text.split(/\n\s*\n|\n(?=[\p{Lu}][\p{L}'’-]+,\s)/u)
    .map(value => value.trim()).filter(Boolean).map(value => ({ label: "", text: value }));
}

export function matchReferenceTitles(selection: string, references: string): ReferenceTitle[] {
  const entries = entriesFromText(references);
  const query = selection.trim();
  const numericQuery = query.replace(/^[^\p{N}]{0,2}(?=\d)/u, "").replace(/[^\p{N}]{0,2}$/u, "");
  const numeric = /^\[?\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*\]?$/.test(numericQuery);
  if (numeric) {
    const numbers = new Set<string>();
    for (const part of numericQuery.replace(/[\[\]]/g, "").split(/[,;]/)) {
      const [start, end = start] = part.trim().split(/[–—-]/).map(Number);
      if (end < start || end - start > 30) return [];
      for (let n = start; n <= end; n++) numbers.add(String(n));
    }
    return [...numbers].flatMap(label => {
      const matches = entries.filter(entry => entry.label === label);
      if (matches.length !== 1) return [];
      const title = titleFromEntry(matches[0].text);
      return title ? [{ label: `[${label}]`, title }] : [];
    });
  }
  const year = /\b(?:19|20)\d{2}[a-z]?\b/i.exec(query)?.[0];
  const author = /[\p{L}][\p{L}'’-]+/u.exec(query)?.[0];
  const exact: ReferenceTitle[] = [];
  const fuzzy: ReferenceTitle[] = [];
  for (const entry of entries) {
    const title = titleFromEntry(entry.text);
    if (!title) continue;
    const normalizedEntry = normalize(entry.text);
    const authorPart = normalizedEntry.split(normalize(title))[0];
    const authorMatches = author && authorPart.split(/[^\p{L}'’-]+/u).includes(normalize(author));
    const yearMatches = year && new RegExp(`\\b${year}\\b`, "i").test(entry.text);
    const fullTitleMatches = normalize(query).replace(/\s+/g, " ").includes(normalize(title));
    const result = { label: entry.label ? `[${entry.label}]` : query, title };
    if ((authorMatches && yearMatches) || fullTitleMatches) { exact.push(result); continue; }
    const authorWords = authorPart.split(/[^\p{L}'’-]+/u).filter(word => word.length >= 4);
    const queryAuthors = [...edgeVariants(normalize(query), 4)].map(value => /[\p{L}][\p{L}'’-]+/u.exec(value)?.[0]).filter((word): word is string => Boolean(word));
    const looseAuthor = yearMatches && queryAuthors.some(word => authorWords.some(name => boundaryMatch(word, name, 4)));
    const looseTitle = boundaryMatch(compact(query), compact(title), 8);
    if (looseAuthor || looseTitle) fuzzy.push(result);
  }
  const matches = exact.length ? exact : fuzzy;
  return matches.length === 1 ? matches : [];
}
