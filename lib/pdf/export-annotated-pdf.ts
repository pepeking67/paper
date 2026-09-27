import type { AnnotationColor, StudyHighlight } from "@/lib/study-tray/types";
import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";
import { isPendingDictionaryMeaning } from "@/lib/dictionary/terms";
import type { PDFDocument as PdfLibDocument, PDFImage } from "pdf-lib";

export type PdfRect = { x: number; y: number; width: number; height: number };
type RgbTuple = readonly [number, number, number];
type DictionaryLabel = { pageIndex: number; anchor: PdfRect; meaning: string };
type TextMemo = { pageIndex: number; rect: PdfRect; text: string; fontSize: number };
type RasterizedAnnotationImage = { image: PDFImage; width: number; height: number };

const PDF_ANNOTATION_COLORS: Record<AnnotationColor, RgbTuple> = {
  yellow: [0.98, 0.78, 0.08],
  green: [0.22, 0.78, 0.38],
  blue: [0.24, 0.56, 0.93],
  pink: [0.93, 0.33, 0.62],
  purple: [0.62, 0.36, 0.86],
};

export function projectNormalizedRectToPdf(
  rect: NormalizedHighlightRect,
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  const left = Math.max(0, Math.min(1, rect.x));
  const top = Math.max(0, Math.min(1, rect.y));
  const right = Math.max(left, Math.min(1, rect.x + rect.width));
  const bottom = Math.max(top, Math.min(1, rect.y + rect.height));
  return {
    x: stableCoordinate(left * pageWidth),
    y: stableCoordinate((1 - bottom) * pageHeight),
    width: stableCoordinate((right - left) * pageWidth),
    height: stableCoordinate((bottom - top) * pageHeight),
  };
}

function stableCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function downloadAnnotatedPdf(
  paperId: string,
  highlights: StudyHighlight[],
  fileName = `${paperId}-annotated.pdf`,
  sourceBytes?: Uint8Array,
): Promise<void> {
  let source: ArrayBuffer;
  if (sourceBytes) source = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer;
  else {
    const response = await fetch(`/api/pdf/${encodeURIComponent(paperId)}`);
    if (!response.ok) {
      let message = "원본 PDF를 불러오지 못했습니다.";
      try {
        const data = await response.json() as { error?: unknown };
        if (typeof data.error === "string") message = data.error;
      } catch { /* Keep the generic message for non-JSON responses. */ }
      throw new Error(message);
    }
    source = await response.arrayBuffer();
  }
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const pages = pdf.getPages();
  const dictionaryLabels: DictionaryLabel[] = [];
  const textMemos: TextMemo[] = [];

  for (const annotation of highlights) {
    const pageIndex = annotation.page - 1;
    const page = pages[pageIndex];
    if (!page) continue;
    const { width: pageWidth, height: pageHeight } = page.getSize();
    if (annotation.kind === "text") {
      const normalized = annotation.rects?.[0];
      const text = annotation.text.trim();
      if (!normalized || !text) continue;
      const rect = projectNormalizedRectToPdf(normalized, pageWidth, pageHeight);
      if (rect.width <= 0 || rect.height <= 0) continue;
      textMemos.push({
        pageIndex,
        rect,
        text,
        fontSize: Math.max(3, Math.min(72, annotation.textFontSizePt ?? 6)),
      });
      continue;
    }
    const tuple = annotation.kind === "dictionary" ? [0, 0, 0] as const : PDF_ANNOTATION_COLORS[annotation.color ?? "yellow"];
    const color = rgb(...tuple);
    let dictionaryAnchor: PdfRect | null = null;

    for (const normalized of annotation.rects ?? []) {
      const rect = projectNormalizedRectToPdf(normalized, pageWidth, pageHeight);
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (annotation.kind === "dictionary" && !dictionaryAnchor) dictionaryAnchor = rect;

      if ((annotation.kind ?? "highlight") === "underline" || annotation.kind === "dictionary") {
        const y = rect.y + Math.max(0.6, rect.height * 0.06);
        page.drawLine({
          start: { x: rect.x, y },
          end: { x: rect.x + rect.width, y },
          thickness: Math.max(0.9, Math.min(2.2, rect.height * 0.12)),
          color,
          opacity: 0.95,
        });
      } else {
        page.drawRectangle({
          x: rect.x,
          y: rect.y + rect.height * 0.08,
          width: rect.width,
          height: rect.height * 0.84,
          color,
          opacity: 0.3,
          borderWidth: 0,
        });
      }
    }

    const meaning = annotation.dictionaryMeaning?.trim().slice(0, 100);
    if (annotation.kind === "dictionary" && dictionaryAnchor && meaning && !isPendingDictionaryMeaning(meaning)) {
      dictionaryLabels.push({ pageIndex, anchor: dictionaryAnchor, meaning });
    }
  }

  const imageCache = new Map<string, Promise<RasterizedAnnotationImage>>();
  const occupiedByPage = new Map<number, PdfRect[]>();
  for (const label of dictionaryLabels) {
    const page = pages[label.pageIndex];
    if (!page) continue;
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const fontSize = Math.max(5.5, Math.min(7, label.anchor.height * 0.58));
    const cacheKey = `${fontSize.toFixed(2)}:${label.meaning}`;
    const imagePromise = imageCache.get(cacheKey) ?? createDictionaryLabelImage(pdf, label.meaning, fontSize);
    imageCache.set(cacheKey, imagePromise);
    const rendered = await imagePromise;
    const occupied = occupiedByPage.get(label.pageIndex) ?? [];
    const placement = placeDictionaryPdfLabel(label.anchor, { width: rendered.width, height: rendered.height }, pageWidth, pageHeight, occupied);
    page.drawImage(rendered.image, {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      opacity: 1,
    });
    occupied.push(placement);
    occupiedByPage.set(label.pageIndex, occupied);
  }

  for (const memo of textMemos) {
    const page = pages[memo.pageIndex];
    if (!page) continue;
    const rendered = await createTextMemoImage(pdf, memo.text, memo.fontSize, memo.rect.width, memo.rect.height);
    page.drawImage(rendered.image, {
      x: memo.rect.x,
      y: memo.rect.y,
      width: memo.rect.width,
      height: memo.rect.height,
      opacity: 1,
    });
  }

  const output = await pdf.save();
  const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizePdfFileName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function placeDictionaryPdfLabel(
  anchor: PdfRect,
  labelSize: { width: number; height: number },
  pageWidth: number,
  pageHeight: number,
  occupied: PdfRect[] = [],
): PdfRect {
  const margin = 2;
  const gap = 0.75;
  const width = Math.min(labelSize.width, Math.max(1, pageWidth - margin * 2));
  const height = Math.min(labelSize.height, Math.max(1, pageHeight - margin * 2));
  const x = Math.max(margin, Math.min(anchor.x, pageWidth - width - margin));
  const rowStep = height + gap;
  const candidates: number[] = [];

  for (let row = 0; row < 6; row += 1) candidates.push(anchor.y - height - gap - row * rowStep);
  for (let row = 0; row < 6; row += 1) candidates.push(anchor.y + anchor.height + gap + row * rowStep);

  for (const y of candidates) {
    if (y < margin || y + height > pageHeight - margin) continue;
    const candidate = { x, y, width, height };
    if (!occupied.some((rect) => pdfRectsOverlap(candidate, rect, 0.4))) return candidate;
  }

  return {
    x,
    y: Math.max(margin, Math.min(anchor.y - height - gap, pageHeight - height - margin)),
    width,
    height,
  };
}

async function createDictionaryLabelImage(pdf: PdfLibDocument, meaning: string, fontSize: number): Promise<RasterizedAnnotationImage> {
  if (typeof document === "undefined") throw new Error("사전 뜻 이미지는 브라우저에서만 생성할 수 있습니다.");
  const scale = 3;
  const maxWidth = 150;
  const paddingX = 1;
  const paddingY = 0.5;
  const lineHeight = fontSize * 1.18;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("사전 뜻 이미지를 만들지 못했습니다.");

  const font = `600 ${fontSize * scale}px system-ui, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  context.font = font;
  const lines = wrapCanvasText(context, meaning, (maxWidth - paddingX * 2) * scale);
  const measuredWidth = Math.max(...lines.map((line) => context.measureText(line).width), 1) / scale;
  const width = Math.min(maxWidth, Math.max(20, measuredWidth + paddingX * 2));
  const height = Math.max(fontSize + paddingY * 2, lines.length * lineHeight + paddingY * 2);

  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const drawContext = canvas.getContext("2d");
  if (!drawContext) throw new Error("사전 뜻 이미지를 만들지 못했습니다.");
  drawContext.font = font;
  drawContext.fillStyle = "#111111";
  drawContext.textBaseline = "top";
  lines.forEach((line, index) => drawContext.fillText(line, paddingX * scale, (paddingY + index * lineHeight) * scale));

  return {
    image: await pdf.embedPng(canvas.toDataURL("image/png")),
    width,
    height,
  };
}

async function createTextMemoImage(
  pdf: PdfLibDocument,
  text: string,
  fontSize: number,
  width: number,
  height: number,
): Promise<RasterizedAnnotationImage> {
  if (typeof document === "undefined") throw new Error("텍스트 메모 이미지는 브라우저에서만 생성할 수 있습니다.");
  const scale = 3;
  const pixelWidth = Math.max(1, Math.ceil(width * scale));
  const pixelHeight = Math.max(1, Math.ceil(height * scale));

  try {
    const markup = await renderTextMemoMarkup(text);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${pixelWidth} ${pixelHeight}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;overflow:hidden;padding:${1 * scale}px ${1.5 * scale}px;color:#111;background:transparent;font:${Math.max(1, fontSize * scale)}px/1.22 system-ui,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;white-space:pre-wrap;overflow-wrap:anywhere">${markup}</div></foreignObject></svg>`;
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("텍스트 메모 이미지를 만들지 못했습니다.");
    const image = await loadSvgImage(svg);
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    return { image: await pdf.embedPng(canvas.toDataURL("image/png")), width, height };
  } catch {
    return createPlainTextMemoImage(pdf, text, fontSize, width, height, scale);
  }
}

async function renderTextMemoMarkup(value: string) {
  const { default: katex } = await import("katex");
  const mathPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\$)\$(?!\$)[^\n$]+?\$(?!\$))/gu;
  let cursor = 0;
  let markup = "";
  for (const match of value.matchAll(mathPattern)) {
    const start = match.index ?? 0;
    markup += renderBasicMemoMarkdown(value.slice(cursor, start));
    const token = match[0];
    const displayMode = token.startsWith("$$") || token.startsWith("\\[");
    const expression = token.startsWith("$$")
      ? token.slice(2, -2)
      : token.startsWith("\\[") || token.startsWith("\\(")
        ? token.slice(2, -2)
        : token.slice(1, -1);
    markup += katex.renderToString(expression, { displayMode, output: "mathml", throwOnError: false, trust: false });
    cursor = start + token.length;
  }
  markup += renderBasicMemoMarkdown(value.slice(cursor));
  return markup;
}

export function textMemoToPlainText(value: string) {
  return value
    .replace(/\$\$([\s\S]+?)\$\$/gu, "$1")
    .replace(/\\\[([\s\S]+?)\\\]/gu, "$1")
    .replace(/\\\(([^\n]+?)\\\)/gu, "$1")
    .replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/gu, "$1")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1");
}

function renderBasicMemoMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/__([^_]+)__/gu, "<strong>$1</strong>")
    .replace(/`([^`]+)`/gu, "<code style=\"font-family:ui-monospace,SFMono-Regular,monospace\">$1</code>")
    .replace(/\n/gu, "<br/>");
}

function escapeHtml(value: string) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("텍스트 메모 SVG를 불러오지 못했습니다."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function createPlainTextMemoImage(
  pdf: PdfLibDocument,
  value: string,
  fontSize: number,
  width: number,
  height: number,
  scale: number,
): Promise<RasterizedAnnotationImage> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("텍스트 메모 이미지를 만들지 못했습니다.");
  const scaledFontSize = Math.max(1, fontSize * scale);
  const padding = 1.5 * scale;
  const lineHeight = scaledFontSize * 1.22;
  context.font = `${scaledFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  context.fillStyle = "#111111";
  context.textBaseline = "top";
  const maxWidth = Math.max(1, canvas.width - padding * 2);
  const paragraphs = textMemoToPlainText(value).split("\n");
  const lines = paragraphs.flatMap((paragraph) => paragraph ? wrapCanvasText(context, paragraph, maxWidth) : [""]);
  for (let index = 0; index < lines.length; index += 1) {
    const y = padding + index * lineHeight;
    if (y + lineHeight > canvas.height) break;
    context.fillText(lines[index], padding, y);
  }
  return { image: await pdf.embedPng(canvas.toDataURL("image/png")), width, height };
}

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const characters = Array.from(value.replace(/\s+/gu, " ").trim());
  const lines: string[] = [];
  let current = "";
  for (const character of characters) {
    const candidate = current + character;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current.trimEnd());
      current = character.trimStart();
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current.trimEnd());
  return lines.length ? lines : [""];
}

function pdfRectsOverlap(left: PdfRect, right: PdfRect, gap: number): boolean {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

function sanitizePdfFileName(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|]+/gu, "-").replace(/\s+/gu, " ").trim();
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "annotated-paper"}.pdf`;
}
