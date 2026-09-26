import type { AnnotationColor, StudyHighlight } from "@/lib/study-tray/types";
import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";
import { isPendingDictionaryMeaning } from "@/lib/dictionary/terms";
import type { PDFDocument as PdfLibDocument, PDFImage } from "pdf-lib";

export type PdfRect = { x: number; y: number; width: number; height: number };
type RgbTuple = readonly [number, number, number];
type DictionaryLabel = { pageIndex: number; anchor: PdfRect; meaning: string };
type DictionaryLabelImage = { image: PDFImage; width: number; height: number };

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

  for (const annotation of highlights) {
    // Text memos are positioned HTML annotations and may contain glyphs that
    // the source PDF does not embed. Dictionary meanings are rasterized below
    // with the browser's Korean font support instead of a bundled PDF font.
    if (annotation.kind === "text") continue;
    const pageIndex = annotation.page - 1;
    const page = pages[pageIndex];
    if (!page) continue;
    const { width: pageWidth, height: pageHeight } = page.getSize();
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

  const imageCache = new Map<string, Promise<DictionaryLabelImage>>();
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

async function createDictionaryLabelImage(pdf: PdfLibDocument, meaning: string, fontSize: number): Promise<DictionaryLabelImage> {
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
