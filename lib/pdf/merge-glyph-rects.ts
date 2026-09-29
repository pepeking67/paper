export type GlyphRect = { left: number; top: number; width: number; height: number };
export type NormalizedHighlightRect = { x: number; y: number; width: number; height: number };
export type ClientRectLike = { left: number; top: number; right: number; bottom: number; width: number; height: number; character?: string };
export type MergeLineRectOptions = { referenceLineHeight?: number; clampTallMath?: boolean };

const LARGE_MATH_OPERATOR = /[∏∐∑∫∬∭∮⋂⋃Π]/u;
const TALL_MATH_DELIMITER = /[()[\]{}|‖⌈⌉⌊⌋]/u;
const MATH_NOTATION = /[=≈≃≤≥∏∐∑∫∬∭∮⋂⋃Π∇_^\[\]{}]/u;

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
export function mergeClientRectsIntoLineRects(rects: readonly ClientRectLike[], options: MergeLineRectOptions = {}): ClientRectLike[] {
  if (!rects.length) return [];
  const heights = rects.map((rect) => rect.height).sort((a, b) => a - b);
  const selectedTypicalHeight = percentile(heights, 0.75);
  const typicalHeight = options.referenceLineHeight && options.referenceLineHeight > 0
    ? options.referenceLineHeight
    : selectedTypicalHeight;
  const isTallMathGlyph = (rect: ClientRectLike) => Boolean(rect.character && (
    LARGE_MATH_OPERATOR.test(rect.character)
    || (TALL_MATH_DELIMITER.test(rect.character) && rect.height > typicalHeight * 1.45)
  ));
  const isBodyAnchor = (rect: ClientRectLike) => !isTallMathGlyph(rect)
    && rect.height >= typicalHeight * 0.68
    && rect.height <= typicalHeight * 1.45;
  const anchors = rects.filter(isBodyAnchor);
  const satellites = rects.filter((rect) => !isBodyAnchor(rect));
  const normalizeMathBand = options.clampTallMath || rects.some(isTallMathGlyph);
  const lines: ClientRectLike[][] = [];

  // Establish rows only from body-height glyphs. Tall operators, fraction bars,
  // superscripts and subscripts must not seed their own visual rows.
  for (const rect of [...anchors].sort(compareByCenterThenLeft)) {
    const rectCenter = verticalCenter(rect);
    let bestLine: ClientRectLike[] | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const lineCenter = median(line.filter(isBodyAnchor).map(verticalCenter));
      const tolerance = Math.max(2, typicalHeight * 0.62);
      const distance = Math.abs(lineCenter - rectCenter);
      if (distance <= tolerance && distance < bestDistance) {
        bestLine = line;
        bestDistance = distance;
      }
    }
    if (bestLine) bestLine.push(rect);
    else lines.push([rect]);
  }

  // Math fragments follow the nearest body row without changing its center.
  // This handles a single equation whose PDF spans sit at many vertical offsets,
  // while still preventing those offsets from bridging adjacent selected rows.
  for (const rect of [...satellites].sort(compareByCenterThenLeft)) {
    const rectCenter = verticalCenter(rect);
    let bestLine: ClientRectLike[] | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const bodyMembers = line.filter(isBodyAnchor);
      const anchorCenter = median((bodyMembers.length ? bodyMembers : line).map(verticalCenter));
      const distance = Math.abs(anchorCenter - rectCenter);
      if (distance < bestDistance) {
        bestLine = line;
        bestDistance = distance;
      }
    }
    const attachmentDistance = normalizeMathBand
      ? Math.max(typicalHeight * 2.4, rect.height * 0.6)
      : Math.max(typicalHeight * 1.1, rect.height * 0.6);
    if (bestLine && bestDistance <= attachmentDistance) bestLine.push(rect);
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
      const { top, bottom } = representativeVerticalBand(run, typicalHeight, {
        ...options,
        clampTallMath: normalizeMathBand,
      });
      merged.push({ left, top, right, bottom, width: right - left, height: bottom - top });
      run = [];
    };

    for (const rect of line) {
      const previous = run.at(-1);
      if (!previous) {
        run.push(rect);
        continue;
      }
      const allowedGap = Math.max(6, typicalHeight * 2.25);
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

export function estimateTypicalLineHeight(rects: readonly Pick<ClientRectLike, "height">[]): number | undefined {
  const heights = rects.map((rect) => rect.height).filter((height) => Number.isFinite(height) && height >= 2 && height <= 96).sort((a, b) => a - b);
  return heights.length ? percentile(heights, 0.5) : undefined;
}

export function containsLargeMathOperator(text: string) {
  return LARGE_MATH_OPERATOR.test(text);
}

export function containsMathNotation(text: string) {
  return MATH_NOTATION.test(text);
}

function representativeVerticalBand(run: readonly ClientRectLike[], typicalHeight: number, options: MergeLineRectOptions) {
  const reference = options.referenceLineHeight && Number.isFinite(options.referenceLineHeight) && options.referenceLineHeight > 0
    ? options.referenceLineHeight
    : typicalHeight;
  const containsOperator = options.clampTallMath || run.some((rect) => rect.character && LARGE_MATH_OPERATOR.test(rect.character));
  const candidates = run.filter((rect) => {
    if (rect.character && (
      LARGE_MATH_OPERATOR.test(rect.character)
      || (TALL_MATH_DELIMITER.test(rect.character) && rect.height > reference * 1.45)
    )) return false;
    return rect.height >= reference * 0.68 && rect.height <= reference * 1.45;
  });

  if (candidates.length) {
    const height = median(candidates.map((rect) => rect.height));
    const center = median(candidates.map(verticalCenter));
    return { top: center - height / 2, bottom: center + height / 2 };
  }

  // Preserve genuinely large ordinary text such as headings. For a math run,
  // however, use the page's normal line height so a tall product/sum/integral
  // glyph cannot paint into the line above or below.
  if (!containsOperator) {
    const height = median(run.map((rect) => rect.height));
    const center = median(run.map(verticalCenter));
    return { top: center - height / 2, bottom: center + height / 2 };
  }

  const center = median(run.map(verticalCenter));
  return { top: center - reference / 2, bottom: center + reference / 2 };
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
