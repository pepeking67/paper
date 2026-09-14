export type GlyphRect = { left: number; top: number; width: number; height: number };
export type NormalizedHighlightRect = { x: number; y: number; width: number; height: number };

/** Resolve a selected substring inside a horizontal PDF.js text fragment. */
export function getTextFragmentRect(rect: GlyphRect, text: string, start: number, end: number, measure = (value: string) => value.length): GlyphRect | null {
  if (!text.length) return null;
  const safeStart = Math.max(0, Math.min(text.length, start));
  const safeEnd = Math.max(safeStart, Math.min(text.length, end));
  if (safeStart === safeEnd) return null;
  const fullWidth = measure(text);
  if (fullWidth <= 0) return null;
  const startRatio = measure(text.slice(0, safeStart)) / fullWidth;
  const endRatio = measure(text.slice(0, safeEnd)) / fullWidth;
  return { left: rect.left + rect.width * startRatio, top: rect.top, width: rect.width * (endRatio - startRatio), height: rect.height };
}

/** Join neighboring selection fragments without expanding a line's vertical bounds. */
export function mergeGlyphRects(rects: GlyphRect[]): GlyphRect[] {
  const sorted = [...rects].sort((a, b) => (a.top + a.height / 2) - (b.top + b.height / 2) || a.left - b.left);
  const groups: GlyphRect[][] = [];
  for (const rect of sorted) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    if (!group || !previous) { groups.push([{ ...rect }]); continue; }
    const representative = group[Math.floor(group.length / 2)];
    const previousMiddle = representative.top + representative.height / 2;
    const currentMiddle = rect.top + rect.height / 2;
    const sameLine = Math.abs(previousMiddle - currentMiddle) <= Math.min(representative.height, rect.height) * 0.35;
    const closeEnough = rect.left <= previous.left + previous.width + Math.max(4, representative.height * 0.6);
    if (!sameLine || !closeEnough) { groups.push([{ ...rect }]); continue; }
    group.push({ ...rect });
  }
  return groups.map((group) => {
    const left = Math.min(...group.map((rect) => rect.left));
    const right = Math.max(...group.map((rect) => rect.left + rect.width));
    const weight = group.reduce((sum, rect) => sum + rect.width, 0) || group.length;
    return {
      left,
      top: group.reduce((sum, rect) => sum + rect.top * (rect.width || 1), 0) / weight,
      width: right - left,
      height: group.reduce((sum, rect) => sum + rect.height * (rect.width || 1), 0) / weight,
    };
  });
}

export function normalizeHighlightRects(rects: GlyphRect[], pageWidth: number, pageHeight: number): NormalizedHighlightRect[] {
  if (pageWidth <= 0 || pageHeight <= 0) return [];
  return rects.map((rect) => ({ x: rect.left / pageWidth, y: rect.top / pageHeight, width: rect.width / pageWidth, height: rect.height / pageHeight }));
}

export function projectHighlightRect(rect: NormalizedHighlightRect, pageWidth: number, pageHeight: number): GlyphRect {
  return { left: rect.x * pageWidth, top: rect.y * pageHeight, width: rect.width * pageWidth, height: rect.height * pageHeight };
}
