import type { AnnotationColor, StudyHighlight } from "@/lib/study-tray/types";
import { containsMathNotation, type NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";
import { isPendingDictionaryMeaning } from "@/lib/dictionary/terms";
import type { PDFDocument as PdfLibDocument, PDFImage } from "pdf-lib";

export type PdfRect = { x: number; y: number; width: number; height: number };
type RgbTuple = readonly [number, number, number];
type DictionaryLabel = { pageIndex: number; anchor: PdfRect; meaning: string };
type TextMemo = { pageIndex: number; rect: PdfRect; text: string; fontSize: number };
type RasterizedAnnotationImage = { image: PDFImage; width: number; height: number };

let textMemoExportCssPromise: Promise<string> | undefined;

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
    const formulaBounds = containsMathNotation(annotation.text);
    let dictionaryAnchor: PdfRect | null = null;

    for (const normalized of annotation.rects ?? []) {
      const rect = projectNormalizedRectToPdf(normalized, pageWidth, pageHeight);
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (annotation.kind === "dictionary" && !dictionaryAnchor) dictionaryAnchor = rect;

      if ((annotation.kind ?? "highlight") === "underline" || annotation.kind === "dictionary") {
        const y = rect.y + Math.max(0.6, Math.min(3, rect.height * 0.08));
        page.drawLine({
          start: { x: rect.x, y },
          end: { x: rect.x + rect.width, y },
          thickness: Math.max(0.45, Math.min(1, rect.height * 0.06)),
          color,
          opacity: 0.58,
        });
      } else {
        page.drawRectangle({
          x: rect.x,
          y: formulaBounds ? rect.y : rect.y + rect.height * 0.08,
          width: rect.width,
          height: formulaBounds ? rect.height : rect.height * 0.84,
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
    const fontSize = Math.max(4, Math.min(5, label.anchor.height * 0.36));
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
  const horizontalGap = 1;
  const verticalGap = 0.5;
  const width = Math.min(labelSize.width, Math.max(1, pageWidth - margin * 2));
  const height = Math.min(labelSize.height, Math.max(1, pageHeight - margin * 2));
  const belowY = Math.max(margin, anchor.y - height - verticalGap);
  const rightX = Math.min(pageWidth - width - margin, anchor.x + anchor.width + horizontalGap);
  const candidates = [
    { x: rightX, y: belowY },
    { x: Math.min(pageWidth - width - margin, rightX + width + horizontalGap), y: belowY },
    { x: rightX, y: Math.max(margin, belowY - height - verticalGap) },
  ];

  for (const candidatePosition of candidates) {
    const candidate = { ...candidatePosition, width, height };
    if (candidate.x < margin || candidate.x + width > pageWidth - margin) continue;
    if (candidate.y < margin || candidate.y + height > pageHeight - margin) continue;
    if (!occupied.some((rect) => pdfRectsOverlap(candidate, rect, 0.4))) return candidate;
  }

  return {
    x: Math.max(margin, rightX),
    y: Math.max(margin, Math.min(belowY, pageHeight - height - margin)),
    width,
    height,
  };
}

async function createDictionaryLabelImage(pdf: PdfLibDocument, meaning: string, fontSize: number): Promise<RasterizedAnnotationImage> {
  if (typeof document === "undefined") throw new Error("사전 뜻 이미지는 브라우저에서만 생성할 수 있습니다.");
  const scale = 3;
  const maxWidth = 100;
  const paddingX = 1;
  const paddingY = 0.5;
  const lineHeight = fontSize * 1.08;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("사전 뜻 이미지를 만들지 못했습니다.");

  const font = `500 ${fontSize * scale}px system-ui, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
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

  try {
    const exportCss = await getTextMemoExportCss();
    if (!exportCss) throw new Error("KaTeX export CSS is unavailable");
    const markup = await renderTextMemoMarkup(text, "htmlAndMathml");
    return await createTextMemoSvgImage(pdf, markup, exportCss, fontSize, width, height, scale);
  } catch (richError) {
    console.warn("[pdf-export] Rich text memo rasterization failed; retrying with native MathML.", { reason: errorMessage(richError) });
    if (hasTextMemoMath(text)) {
      try {
        const mathMarkup = await renderTextMemoMarkup(text, "mathml");
        return await createTextMemoSvgImage(pdf, mathMarkup, "", fontSize, width, height, scale);
      } catch (mathError) {
        console.error("[pdf-export] Native MathML memo rasterization failed.", { reason: errorMessage(mathError) });
        throw new Error("수식 메모를 PDF에 렌더링하지 못했습니다. 깨진 LaTeX를 저장하지 않고 다운로드를 중단했습니다.");
      }
    }
    return createPlainTextMemoImage(pdf, text, fontSize, width, height, scale);
  }
}

async function createTextMemoSvgImage(
  pdf: PdfLibDocument,
  markup: string,
  cssText: string,
  fontSize: number,
  width: number,
  height: number,
  scale: number,
): Promise<RasterizedAnnotationImage> {
  const pixelWidth = Math.max(1, Math.ceil(width * scale));
  const pixelHeight = Math.max(1, Math.ceil(height * scale));
  const scaledFontSize = Math.max(1, fontSize * scale);
  const contentScale = measureTextMemoContentScale(markup, scaledFontSize, pixelWidth, pixelHeight, scale);
  const contentStyle = contentScale < 0.999
    ? `transform:scale(${contentScale});transform-origin:0 0;width:${100 / contentScale}%;height:${100 / contentScale}%;`
    : "";
  const safeCss = cssText.replace(/<\/style/giu, "<\\/style");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${pixelWidth} ${pixelHeight}"><style>${safeCss}</style><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;overflow:hidden;padding:${1 * scale}px ${1.5 * scale}px;color:#111;background:transparent;font:500 ${scaledFontSize}px/1.18 system-ui,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;overflow-wrap:anywhere"><div class="markdown-content markdown-content-pdf-memo" style="${contentStyle}"><p>${markup}</p></div></div></foreignObject></svg>`;
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("텍스트 메모 이미지를 만들지 못했습니다.");
  const image = await loadSvgImage(svg);
  context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
  return { image: await pdf.embedPng(canvas.toDataURL("image/png")), width, height };
}

function measureTextMemoContentScale(markup: string, fontSize: number, width: number, height: number, rasterScale: number) {
  if (!document.body) return 1;
  const probe = document.createElement("div");
  probe.style.cssText = `box-sizing:border-box;position:fixed;visibility:hidden;pointer-events:none;left:-100000px;top:0;width:${width}px;height:${height}px;overflow:hidden;padding:${1 * rasterScale}px ${1.5 * rasterScale}px;color:#111;background:transparent;font:500 ${fontSize}px/1.18 system-ui,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;overflow-wrap:anywhere;`;
  probe.innerHTML = `<div class="markdown-content markdown-content-pdf-memo"><p>${markup}</p></div>`;
  document.body.appendChild(probe);
  try {
    const widthScale = probe.scrollWidth > probe.clientWidth ? probe.clientWidth / probe.scrollWidth : 1;
    const heightScale = probe.scrollHeight > probe.clientHeight ? probe.clientHeight / probe.scrollHeight : 1;
    return Math.max(0.25, Math.min(1, widthScale, heightScale));
  } finally {
    probe.remove();
  }
}

export async function renderTextMemoMarkup(value: string, output: "htmlAndMathml" | "mathml" = "htmlAndMathml") {
  const { default: katex } = await import("katex");
  const mathPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\$)\$(?!\$)[\s\S]+?\$(?!\$))/gu;
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
    markup += katex.renderToString(expression, { displayMode, output, throwOnError: false, trust: false });
    cursor = start + token.length;
  }
  markup += renderBasicMemoMarkdown(value.slice(cursor));
  return markup;
}

async function getTextMemoExportCss() {
  if (textMemoExportCssPromise) return textMemoExportCssPromise;
  textMemoExportCssPromise = (async () => {
    const chunks: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssText = "";
      try {
        cssText = Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .filter((rule) => rule.includes(".katex") || rule.includes("markdown-content-pdf-memo") || (rule.startsWith("@font-face") && rule.includes("KaTeX_")))
          .map(preferWoff2FontSource)
          .join("\n");
      } catch {
        // Cross-origin or unreadable stylesheets are skipped. Native MathML is the safe fallback.
      }
      if (!cssText.includes(".katex") && !cssText.includes("markdown-content-pdf-memo")) continue;
      chunks.push(await inlineCssAssets(cssText, sheet.href ?? document.baseURI));
    }
    return chunks.join("\n");
  })();
  return textMemoExportCssPromise;
}

async function inlineCssAssets(cssText: string, baseUrl: string) {
  const resolved = new Map<string, string>();
  const urls = Array.from(cssText.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/giu))
    .map((match) => match[2].trim())
    .filter((value) => value && !value.startsWith("data:") && !value.startsWith("blob:") && !value.startsWith("#"));

  await Promise.all(Array.from(new Set(urls)).map(async (value) => {
    const absoluteUrl = new URL(value, baseUrl).href;
    const response = await fetch(absoluteUrl);
    if (!response.ok) throw new Error(`KaTeX font request failed (${response.status})`);
    resolved.set(value, await blobToDataUrl(await response.blob()));
  }));

  return cssText.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/giu, (match, quote: string, rawUrl: string) => {
    const dataUrl = resolved.get(rawUrl.trim());
    return dataUrl ? `url(${quote}${dataUrl}${quote})` : match;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("KaTeX font conversion failed"));
    reader.onerror = () => reject(reader.error ?? new Error("KaTeX font conversion failed"));
    reader.readAsDataURL(blob);
  });
}

export function preferWoff2FontSource(cssRule: string) {
  if (!cssRule.startsWith("@font-face")) return cssRule;
  const woff2 = cssRule.match(/url\(\s*(["']?)([^"')]+\.woff2)\1\s*\)\s*format\(\s*["']woff2["']\s*\)/iu)?.[0];
  return woff2 ? cssRule.replace(/src\s*:[^;}]+/iu, `src: ${woff2}`) : cssRule;
}

export function hasTextMemoMath(value: string) {
  return /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\$)\$(?!\$)[\s\S]+?\$(?!\$))/u.test(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function textMemoToPlainText(value: string) {
  return value
    .replace(/\$\$([\s\S]+?)\$\$/gu, "$1")
    .replace(/\\\[([\s\S]+?)\\\]/gu, "$1")
    .replace(/\\\(([^\n]+?)\\\)/gu, "$1")
    .replace(/(?<!\$)\$([\s\S]+?)\$(?!\$)/gu, "$1")
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
    image.src = textMemoSvgDataUrl(svg);
  });
}

export function textMemoSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
