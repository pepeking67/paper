"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

type Props = { pdf: PDFDocumentProxy; pageNumber: number; zoom: number; scrollRoot: HTMLDivElement | null; onText: (page: number, text: string) => void; onSelection: (text: string, page: number) => void };

export function PdfPage({ pdf, pageNumber, zoom, scrollRoot, onText, onSelection }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
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
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        const canvasContext = canvas.getContext("2d", { alpha: false });
        if (!canvasContext) throw new Error("Canvas context is unavailable");
        renderTask = page.render({ canvas, canvasContext, viewport });
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

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || !textLayerRef.current?.contains(selection.anchorNode)) return;
    const text = selection.toString().trim(); if (text) onSelection(text, pageNumber);
  }

  return <article ref={wrapperRef} data-page={pageNumber} className="relative w-full max-w-[900px] bg-white shadow-2xl" style={{ aspectRatio: `1 / ${ratio * zoom / 100}` }} onPointerUp={captureSelection}>
    {(rendering || !renderedWidth) && !renderError && <div className="absolute inset-0 z-10 animate-pulse bg-[#ddd]" aria-label={`${pageNumber}페이지 불러오는 중`}/>}<div className={`absolute left-1/2 top-0 -translate-x-1/2 ${renderedWidth ? "opacity-100" : "opacity-0"}`} style={{ width: surfaceSize.width || "100%", height: surfaceSize.height || "100%" }}><canvas ref={canvasRef} className="absolute inset-0 block bg-white"/><div ref={textLayerRef} className="textLayer"/></div>{renderError && <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center bg-[#eee] p-6 text-center text-sm text-black">Page {pageNumber}: {renderError}</div>}<span className="absolute bottom-1 right-2 z-30 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{pageNumber}</span>
  </article>;
}
