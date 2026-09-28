export type GlyphRect = { left: number; top: number; width: number; height: number };
export type NormalizedHighlightRect = { x: number; y: number; width: number; height: number };
export type ClientRectLike = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/**
 * Collapse per-character browser ranges into one visual band per selected line.
 *
 * PDF formula glyphs often live in separate transformed spans. Superscripts,
 * subscripts, operators and surrounding spaces therefore produce disconnected
 * rectangles even though the user selected one equation line. We join nearby
 * horizontal fragments and allow vertically shifted math glyphs to belong to
 * the same line, while retaining a conservative gap limit so separate columns
 * are never bridged.
 */
export function mergeClientRectsIntoLineRects(rects: readonly ClientRectLike[]): ClientRectLike[] {
  if (!rects.length) return [];
  const heights = rects.map((rect) => rect.height).sort((a, b) => a - b);
  const typicalHeight = percentile(heights, 0.75);
  const anchorThreshold = Math.max(0.5, typicalHeight * 0.72);
  const anchors = rects.filter((rect) => rect.height >= anchorThreshold);
  const satellites = rects.filter((rect) => rect.height < anchorThreshold);
  const lines: ClientRectLike[][] = [];

  // Establish rows from full-height glyphs first. Comparing with a stable row
  // center prevents a subscript on one row and a superscript on the next row
  // from forming a transitive bridge that collapses both rows into one band.
  for (const rect of [...anchors].sort(compareByCenterThenLeft)) {
    const rectCenter = verticalCenter(rect);
    let bestLine: ClientRectLike[] | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const lineCenter = median(line.map(verticalCenter));
      const lineHeight = median(line.map((member) => member.height));
      const bothAreLineBands = line.some((member) => member.width > member.height * 2.5)
        && rect.width > rect.height * 2.5;
      const tolerance = bothAreLineBands
        ? Math.max(1.5, Math.min(lineHeight, rect.height) * 0.45)
        : Math.max(2, Math.min(lineHeight, rect.height) * 0.55);
      const distance = Math.abs(lineCenter - rectCenter);
      if (distance <= tolerance && distance < bestDistance) {
        bestLine = line;
        bestDistance = distance;
      }
    }
    if (bestLine) bestLine.push(rect);
    else lines.push([rect]);
  }

  // Small superscript/subscript glyphs follow the nearest established row.
  // They may expand that row's visual band, but never redefine its center and
  // therefore cannot merge two neighboring selected rows.
  for (const rect of [...satellites].sort(compareByCenterThenLeft)) {
    const rectCenter = verticalCenter(rect);
    let bestLine: ClientRectLike[] | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const anchorCenter = median(line.filter((member) => member.height >= anchorThreshold).map(verticalCenter));
      const distance = Math.abs(anchorCenter - rectCenter);
      if (distance < bestDistance) {
        bestLine = line;
        bestDistance = distance;
      }
    }
    if (bestLine && bestDistance <= Math.max(typicalHeight * 1.1, rect.height * 1.5)) bestLine.push(rect);
    else lines.push([rect]);
  }

  const merged: ClientRectLike[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.left - b.left);
    let run: ClientRectLike[] = [];

    const flush = () => {
      if (!run.length) return;
      const left = Math.min(...run.map((rect) => rect.left));
      const right = Math.max(...run.map((rect) => rect.right));
      const top = Math.min(...run.map((rect) => rect.top));
      const bottom = Math.max(...run.map((rect) => rect.bottom));
      merged.push({ left, top, right, bottom, width: right - left, height: bottom - top });
      run = [];
    };

    for (const rect of line) {
      const previous = run.at(-1);
      if (!previous) {
        run.push(rect);
        continue;
      }
      const lineHeight = Math.max(...run.map((item) => item.height), rect.height);
      const allowedGap = Math.max(6, lineHeight * 2.25);
      if (rect.left - previous.right <= allowedGap) run.push(rect);
      else {
        flush();
        run.push(rect);
      }
    }
    flush();
  }

  return merged.sort((a, b) => a.top - b.top || a.left - b.left);
}

function verticalCenter(rect: ClientRectLike) {
  return rect.top + rect.height / 2;
}

function compareByCenterThenLeft(a: ClientRectLike, b: ClientRectLike) {
  return verticalCenter(a) - verticalCenter(b) || a.left - b.left;
}

function percentile(sorted: readonly number[], ratio: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
}

function median(values: readonly number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Convert the browser's actual DOM Range rectangles into page-relative coordinates.
 *
 * PDF.js already positions/scales every text-layer glyph in the browser. Using
 * Range#getClientRects therefore preserves the real visual geometry (including
 * transforms, kerning, equations and mixed font fragments) instead of estimating
 * character widths from an entire PDF.js span.
 */
export function normalizeClientRects(rects: readonly ClientRectLike[], surface: ClientRectLike): NormalizedHighlightRect[] {
  if (surface.width <= 0 || surface.height <= 0) return [];

  const normalized: NormalizedHighlightRect[] = [];
  for (const rect of rects) {
    const left = Math.max(rect.left, surface.left);
    const top = Math.max(rect.top, surface.top);
    const right = Math.min(rect.right, surface.right);
    const bottom = Math.min(rect.bottom, surface.bottom);
    const width = right - left;
    const height = bottom - top;
    if (width < 0.5 || height < 0.5) continue;

    normalized.push({
      x: (left - surface.left) / surface.width,
      y: (top - surface.top) / surface.height,
      width: width / surface.width,
      height: height / surface.height,
    });
  }
  return normalized;
}

/** Legacy helper retained for existing tests and stored geometry migration. */
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

/** Legacy helper retained for compatibility; new selections do not use heuristic merging. */
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
