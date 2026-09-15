"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { normalizeClientRects, projectHighlightRect, type NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";
import type { AnnotationColor, AnnotationKind } from "@/lib/study-tray/types";

type CapturedSelection = {
  text: string;
  rects: NormalizedHighlightRect[];
  kind?: AnnotationKind | "context";
  color?: AnnotationColor;
};
type Props = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  capturedSelections: CapturedSelection[];
  scrollRoot: HTMLDivElement | null;
  onText: (page: number, text: string) => void;
  onSelection: (text: string, page: number, rects: NormalizedHighlightRect[]) => void;
};

const annotationColors: Record<AnnotationColor, { fill: string; stroke: string }> = {
  yellow: { fill: "rgba(250, 204, 21, 0.42)", stroke: "#ca8a04" },
  green: { fill: "rgba(74, 222, 128, 0.36)", stroke: "#16a34a" },
  blue: { fill: "rgba(96, 165, 250, 0.34)", stroke: "#2563eb" },
  pink: { fill: "rgba(244, 114, 182, 0.34)", stroke: "#db2777" },
  purple: { fill: "rgba(192, 132, 252, 0.34)", stroke: "#9333ea" },
};

export function PdfPage({ pdf, pageNumber, zoom, capturedSelections, scrollRoot, onText, onSelection }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [rendering, setRendering] = useState(false);
  const [renderedWidth, setRenderedWidth] = useState(0);
  const [renderedZoom, setRenderedZoom] = useState(0);
  const [renderError, setRenderError] = useState("");
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node || !scrollRoot) return;
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), { root: scrollRoot, rootMargin: "120% 0px", threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || width < 1 || (renderedWidth === width && renderedZoom === zoom)) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: { cancel: () => void } | undefined;
    setRendering(true);
    setRenderError("");

    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const cssWidth = Math.min(width, base.width * 1.5) * zoom / 100;
        const viewport = page.getViewport({ scale: cssWidth / base.width });
        setSurfaceSize({ width: viewport.width, height: viewport.height });

        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const canvasContext = canvas.getContext("2d", { alpha: false });
        if (!canvasContext) throw new Error("Canvas context is unavailable");

        renderTask = page.render({
          canvas,
          canvasContext,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
        if (cancelled) return;

        const textContent = await page.getTextContent();
        if (cancelled) return;
        onText(pageNumber, textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        textContainer.replaceChildren();
        textContainer.style.width = `${viewport.width}px`;
        textContainer.style.height = `${viewport.height}px`;
        textContainer.style.setProperty("--scale-factor", String(viewport.scale));
        const pdfjs = await import("pdfjs-dist");
        const layer = new pdfjs.TextLayer({ textContentSource: textContent, container: textContainer, viewport });
        textLayer = layer;
        await layer.render();
        if (!cancelled) {
          setRenderedWidth(width);
          setRenderedZoom(zoom);
        }
      } catch (caught) {
        if (!cancelled && !(caught instanceof Error && caught.name === "RenderingCancelledException")) {
          setRenderedWidth(0);
          setRenderError(caught instanceof Error ? caught.message : "페이지 렌더링 실패");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [nearViewport, width, renderedWidth, renderedZoom, pdf, pageNumber, zoom, onText]);

  useEffect(() => {
    if (nearViewport) return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    textLayerRef.current?.replaceChildren();
    setRenderedWidth(0);
    setRenderedZoom(0);
  }, [nearViewport]);

  function captureSelection() {
    const selection = window.getSelection();
    const layer = textLayerRef.current;
    const surface = surfaceRef.current;
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !layer || !surface) return;

    const range = selection.getRangeAt(0);
    if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return;

    const text = selection.toString().trim();
    const rects = normalizeClientRects(getSelectedTextRects(range, layer), surface.getBoundingClientRect());
    if (!text || !rects.length) return;

    onSelection(text, pageNumber, rects);
    selection.removeAllRanges();
  }

  return <article
    ref={wrapperRef}
    data-page={pageNumber}
    className="relative w-full max-w-[720px] bg-white shadow-2xl"
    style={{ aspectRatio: `1 / ${ratio * zoom / 100}` }}
    onPointerUp={captureSelection}
  >
    {(rendering || !renderedWidth) && !renderError && <div className="absolute inset-0 z-10 animate-pulse bg-[#ddd]" aria-label={`${pageNumber}페이지 불러오는 중`}/>}
    <div ref={surfaceRef} className={`absolute left-1/2 top-0 -translate-x-1/2 ${renderedWidth ? "opacity-100" : "opacity-0"}`} style={{ width: surfaceSize.width || "100%", height: surfaceSize.height || "100%" }}>
      <canvas ref={canvasRef} className="absolute inset-0 block bg-white"/>
      <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
        {capturedSelections.flatMap((selection, selectionIndex) => selection.rects.map((normalized, rectIndex) => {
          const rect = projectHighlightRect(normalized, surfaceSize.width, surfaceSize.height);
          const kind = selection.kind ?? "highlight";
          const color = selection.color ?? "yellow";
          const palette = annotationColors[color];
          const key = `${selectionIndex}-${rectIndex}`;

          if (kind === "context") {
            return <span key={key} className="absolute rounded-[2px]" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, background: "rgba(59, 130, 246, 0.18)", outline: "1px solid rgba(59, 130, 246, 0.32)" }}/>;
          }
          if (kind === "underline") {
            return <span key={key} className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderBottom: `2px solid ${palette.stroke}` }}/>;
          }
          return <span key={key} className="absolute rounded-[2px]" style={{ left: rect.left, top: rect.top + rect.height * 0.08, width: rect.width, height: rect.height * 0.84, background: palette.fill, mixBlendMode: "multiply" }}/>;
        }))}
      </div>
      <div ref={textLayerRef} className="textLayer z-[2]"/>
    </div>
    {renderError && <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center bg-[#eee] p-6 text-center text-sm text-black">Page {pageNumber}: {renderError}</div>}
    <span className="absolute bottom-1 right-2 z-30 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{pageNumber}</span>
  </article>;
}

/**
 * Range#getClientRects() can include boxes contributed by PDF.js wrappers,
 * line breaks and trailing whitespace. Those boxes are the reason a highlight
 * can run through the empty space on the right side of a PDF line.
 *
 * Build a small range for each actually selected text node instead. Trimming
 * only the outer whitespace of each selected fragment keeps spaces inside a
 * sentence while removing PDF layout padding at line boundaries.
 */
function getSelectedTextRects(range: Range, layer: HTMLElement): DOMRect[] {
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data || !range.intersectsNode(node)) continue;

    let start = node === range.startContainer ? range.startOffset : 0;
    let end = node === range.endContainer ? range.endOffset : node.length;
    start = Math.max(0, Math.min(node.length, start));
    end = Math.max(start, Math.min(node.length, end));

    const fragment = node.data.slice(start, end);
    const leadingWhitespace = fragment.match(/^\s+/u)?.[0].length ?? 0;
    const trailingWhitespace = fragment.match(/\s+$/u)?.[0].length ?? 0;
    start += leadingWhitespace;
    end -= trailingWhitespace;
    if (start >= end) continue;

    const textRange = document.createRange();
    textRange.setStart(node, start);
    textRange.setEnd(node, end);
    rects.push(...Array.from(textRange.getClientRects()));
    textRange.detach();
  }

  return rects;
}
