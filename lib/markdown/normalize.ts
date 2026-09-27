/**
 * Models occasionally wrap an otherwise valid Markdown answer in one outer
 * ```markdown fence. That makes a Markdown renderer show the answer as source
 * code. Remove only that full-response wrapper and leave real code blocks
 * inside the answer untouched.
 */
export function normalizeRenderedMarkdown(value: string) {
  const normalized = value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").trim();
  const fenced = normalized.match(/^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```[ \t]*$/iu);
  return fenced ? fenced[1].trim() : normalized;
}
