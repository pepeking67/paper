import type { AnnotationColor, StudyHighlight } from "@/lib/study-tray/types";
import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";

type PdfRect = { x: number; y: number; width: number; height: number };
type RgbTuple = readonly [number, number, number];

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
  const width = Math.max(0, rect.width * pageWidth);
  const height = Math.max(0, rect.height * pageHeight);
  const x = Math.max(0, Math.min(pageWidth, rect.x * pageWidth));
  const yFromTop = Math.max(0, Math.min(pageHeight, rect.y * pageHeight));
  return {
    x,
    y: Math.max(0, pageHeight - yFromTop - height),
    width: Math.min(width, Math.max(0, pageWidth - x)),
    height: Math.min(height, Math.max(0, pageHeight - (pageHeight - yFromTop - height))),
  };
}

export async function downloadAnnotatedPdf(
  paperId: string,
  highlights: StudyHighlight[],
  fileName = `${paperId}-annotated.pdf`,
): Promise<void> {
  const response = await fetch(`/api/pdf/${encodeURIComponent(paperId)}`);
  if (!response.ok) {
    let message = "원본 PDF를 불러오지 못했습니다.";
    try {
      const data = await response.json() as { error?: unknown };
      if (typeof data.error === "string") message = data.error;
    } catch { /* Keep the generic message for non-JSON responses. */ }
    throw new Error(message);
  }

  const source = await response.arrayBuffer();
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const pages = pdf.getPages();

  for (const annotation of highlights) {
    const page = pages[annotation.page - 1];
    if (!page) continue;
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const tuple = PDF_ANNOTATION_COLORS[annotation.color ?? "yellow"];
    const color = rgb(...tuple);

    for (const normalized of annotation.rects ?? []) {
      const rect = projectNormalizedRectToPdf(normalized, pageWidth, pageHeight);
      if (rect.width <= 0 || rect.height <= 0) continue;

      if ((annotation.kind ?? "highlight") === "underline") {
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

function sanitizePdfFileName(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|]+/gu, "-").replace(/\s+/gu, " ").trim();
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "annotated-paper"}.pdf`;
}
