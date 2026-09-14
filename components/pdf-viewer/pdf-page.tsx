"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

type Props = { pdf: PDFDocumentProxy; pageNumber: number; scrollRoot: HTMLDivElement | null; onText: (page: number, text: string) => void; onSelection: (text: string, page: number) => void };

export function PdfPage({ pdf, pageNumber, scrollRoot, onText, onSelection }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [rendering, setRendering] = useState(false);
  const [renderedWidth, setRenderedWidth] = useState(0);

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
    if (!nearViewport || width < 1 || renderedWidth === width) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: { cancel: () => void } | undefined;
    setRendering(true);
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const cssWidth = Math.min(width, base.width * 1.5);
        const viewport = page.getViewport({ scale: cssWidth / base.width });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current; const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;
        canvas.width = Math.floor(viewport.width * outputScale); canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
        await renderTask.promise;
        if (cancelled) return;
        const textContent = await page.getTextContent();
        if (cancelled) return;
        onText(pageNumber, textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        textContainer.replaceChildren(); textContainer.style.width = `${viewport.width}px`; textContainer.style.height = `${viewport.height}px`;
        const pdfjs = await import("pdfjs-dist");
        const layer = new pdfjs.TextLayer({ textContentSource: textContent, container: textContainer, viewport });
        textLayer = layer; await layer.render();
        if (!cancelled) setRenderedWidth(width);
      } catch (caught) {
        if (!cancelled && !(caught instanceof Error && caught.name === "RenderingCancelledException")) setRenderedWidth(0);
      } finally { if (!cancelled) setRendering(false); }
    })();
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [nearViewport, width, renderedWidth, pdf, pageNumber, onText]);

  useEffect(() => {
    if (nearViewport) return;
    const canvas = canvasRef.current; if (canvas) { canvas.width = 0; canvas.height = 0; }
    textLayerRef.current?.replaceChildren(); setRenderedWidth(0);
  }, [nearViewport]);

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || !textLayerRef.current?.contains(selection.anchorNode)) return;
    const text = selection.toString().trim(); if (text) onSelection(text, pageNumber);
  }

  return <article ref={wrapperRef} data-page={pageNumber} className="relative w-full max-w-[900px] bg-white shadow-2xl" style={{ aspectRatio: `1 / ${ratio}` }} onPointerUp={captureSelection}>
    {(rendering || !renderedWidth) && <div className="absolute inset-0 animate-pulse bg-[#ddd]" aria-label={`${pageNumber}페이지 불러오는 중`}/>}<canvas ref={canvasRef} className="absolute left-1/2 top-0 -translate-x-1/2 bg-white"/><div ref={textLayerRef} className="textLayer left-1/2 -translate-x-1/2"/><span className="absolute bottom-1 right-2 z-10 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{pageNumber}</span>
  </article>;
}
