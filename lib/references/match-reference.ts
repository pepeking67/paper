export type ReferenceTitle = { label: string; title: string };
type Entry = { label: string; text: string };
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

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
  const numeric = /^\[?\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*\]?$/.test(query);
  if (numeric) {
    const numbers = new Set<string>();
    for (const part of query.replace(/[\[\]]/g, "").split(/[,;]/)) {
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
  const matches = entries.flatMap(entry => {
    const title = titleFromEntry(entry.text);
    if (!title) return [];
    const normalizedEntry = normalize(entry.text);
    const authorPart = normalizedEntry.split(normalize(title))[0];
    const authorMatches = author && authorPart.split(/[^\p{L}'’-]+/u).includes(normalize(author));
    const yearMatches = year && new RegExp(`\\b${year}\\b`, "i").test(entry.text);
    const fullTitleMatches = normalize(query).replace(/\s+/g, " ").includes(normalize(title));
    return (authorMatches && yearMatches) || fullTitleMatches ? [{ label: entry.label ? `[${entry.label}]` : query, title }] : [];
  });
  return matches.length === 1 ? matches : [];
}
