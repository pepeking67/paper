export type GlyphRect = { left: number; top: number; width: number; height: number };

/** Join neighboring glyph boxes into short, line-local marker strokes. */
export function mergeGlyphRects(rects: GlyphRect[]): GlyphRect[] {
  const sorted = [...rects].sort((a, b) => Math.abs(a.top - b.top) > 2 ? a.top - b.top : a.left - b.left);
  const lines: GlyphRect[] = [];
  for (const rect of sorted) {
    const previous = lines.at(-1);
    if (!previous) { lines.push({ ...rect }); continue; }
    const previousMiddle = previous.top + previous.height / 2;
    const currentMiddle = rect.top + rect.height / 2;
    const sameLine = Math.abs(previousMiddle - currentMiddle) <= Math.min(previous.height, rect.height) * 0.45;
    const closeEnough = rect.left <= previous.left + previous.width + Math.max(4, previous.height * 0.8);
    if (!sameLine || !closeEnough) { lines.push({ ...rect }); continue; }
    const right = Math.max(previous.left + previous.width, rect.left + rect.width);
    const bottom = Math.max(previous.top + previous.height, rect.top + rect.height);
    previous.left = Math.min(previous.left, rect.left);
    previous.top = Math.min(previous.top, rect.top);
    previous.width = right - previous.left;
    previous.height = bottom - previous.top;
  }
  return lines;
}
