"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

type GlyphRect = { left: number; top: number; width: number; height: number };
type Props = { pdf: PDFDocumentProxy; pageNumber: number; zoom: number; capturedTexts: string[]; scrollRoot: HTMLDivElement | null; onText: (page: number, text: string) => void; onSelection: (text: string, page: number) => void };

export function PdfPage({ pdf, pageNumber, zoom, capturedTexts, scrollRoot, onText, onSelection }: Props) {
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
  const [selectionRects, setSelectionRects] = useState<GlyphRect[]>([]);
  const [overlayText, setOverlayText] = useState("");
  const selectionFrame = useRef<number | null>(null);

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
    setRendering(true); setRenderError("");
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const cssWidth = Math.min(width, base.width * 1.5) * zoom / 100;
        const viewport = page.getViewport({ scale: cssWidth / base.width });
        setSurfaceSize({ width: viewport.width, height: viewport.height });
        const canvas = canvasRef.current; const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale); canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        const canvasContext = canvas.getContext("2d", { alpha: false });
        if (!canvasContext) throw new Error("Canvas context is unavailable");
        renderTask = page.render({ canvas, canvasContext, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
        await renderTask.promise;
        if (cancelled) return;
        const textContent = await page.getTextContent();
        if (cancelled) return;
        onText(pageNumber, textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        textContainer.replaceChildren(); textContainer.style.width = `${viewport.width}px`; textContainer.style.height = `${viewport.height}px`;
        const pdfjs = await import("pdfjs-dist");
        const layer = new pdfjs.TextLayer({ textContentSource: textContent, container: textContainer, viewport });
        textLayer = layer; await layer.render();
        if (!cancelled) { setRenderedWidth(width); setRenderedZoom(zoom); }
      } catch (caught) {
        if (!cancelled && !(caught instanceof Error && caught.name === "RenderingCancelledException")) {
          setRenderedWidth(0);
          setRenderError(caught instanceof Error ? caught.message : "페이지 렌더링 실패");
        }
      } finally { if (!cancelled) setRendering(false); }
    })();
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [nearViewport, width, renderedWidth, renderedZoom, pdf, pageNumber, zoom, onText]);

  useEffect(() => {
    if (nearViewport) return;
    const canvas = canvasRef.current; if (canvas) { canvas.width = 0; canvas.height = 0; }
    textLayerRef.current?.replaceChildren(); setRenderedWidth(0); setRenderedZoom(0);
  }, [nearViewport]);

  useEffect(() => {
    if (overlayText && !capturedTexts.includes(overlayText)) { setSelectionRects([]); setOverlayText(""); }
  }, [capturedTexts, overlayText]);

  useEffect(() => () => { if (selectionFrame.current !== null) cancelAnimationFrame(selectionFrame.current); }, []);

  function updateSelectionPreview() {
    const selection = window.getSelection();
    const layer = textLayerRef.current; const surface = surfaceRef.current;
    if (!selection || !layer || !surface || !layer.contains(selection.anchorNode) || selection.rangeCount === 0) return null;
    setSelectionRects(getSelectedGlyphRects(selection.getRangeAt(0), layer, surface));
    return selection.toString().trim();
  }

  function previewSelection(event: React.PointerEvent) {
    if (event.buttons !== 1 || selectionFrame.current !== null) return;
    selectionFrame.current = requestAnimationFrame(() => { selectionFrame.current = null; updateSelectionPreview(); });
  }

  function captureSelection() {
    const text = updateSelectionPreview();
    if (!text) return;
    setOverlayText(text); onSelection(text, pageNumber);
    window.getSelection()?.removeAllRanges();
  }

  return <article ref={wrapperRef} data-page={pageNumber} className="relative w-full max-w-[900px] bg-white shadow-2xl" style={{ aspectRatio: `1 / ${ratio * zoom / 100}` }} onPointerMove={previewSelection} onPointerUp={captureSelection}>
    {(rendering || !renderedWidth) && !renderError && <div className="absolute inset-0 z-10 animate-pulse bg-[#ddd]" aria-label={`${pageNumber}페이지 불러오는 중`}/>}<div ref={surfaceRef} className={`absolute left-1/2 top-0 -translate-x-1/2 ${renderedWidth ? "opacity-100" : "opacity-0"}`} style={{ width: surfaceSize.width || "100%", height: surfaceSize.height || "100%" }}><canvas ref={canvasRef} className="absolute inset-0 block bg-white"/><div className="pointer-events-none absolute inset-0 z-[1]">{selectionRects.map((rect, index) => <span key={index} className="absolute bg-[#777]/45" style={rect}/>)}</div><div ref={textLayerRef} className="textLayer z-[2]"/></div>{renderError && <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center bg-[#eee] p-6 text-center text-sm text-black">Page {pageNumber}: {renderError}</div>}<span className="absolute bottom-1 right-2 z-30 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{pageNumber}</span>
  </article>;
}

function getSelectedGlyphRects(range: Range, layer: HTMLElement, surface: HTMLElement): GlyphRect[] {
  const surfaceRect = surface.getBoundingClientRect();
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const rects: GlyphRect[] = [];
  let node = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) {
      const value = node.textContent ?? "";
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : value.length;
      for (let index = start; index < end; index += 1) {
        if (/\s/.test(value[index] ?? "")) continue;
        const glyphRange = document.createRange();
        glyphRange.setStart(node, index); glyphRange.setEnd(node, index + 1);
        for (const rect of glyphRange.getClientRects()) if (rect.width > 0 && rect.height > 0) rects.push({ left: rect.left - surfaceRect.left, top: rect.top - surfaceRect.top, width: rect.width, height: rect.height });
        if (rects.length >= 4000) return rects;
      }
    }
    node = walker.nextNode();
  }
  return rects;
}
