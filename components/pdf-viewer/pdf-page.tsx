"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Fragment, useEffect, useRef, useState } from "react";
import { normalizeClientRects, projectHighlightRect, type ClientRectLike, type NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";
import type { AnnotationColor, AnnotationKind, StudyArea } from "@/lib/study-tray/types";

type CapturedSelection = {
  annotationId?: string;
  text: string;
  rects: NormalizedHighlightRect[];
  kind?: AnnotationKind | "context";
  color?: AnnotationColor;
  dictionaryMeaning?: string;
  textFontSizeRatio?: number;
  textFontSizePt?: number;
};

type Props = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  areaMode: boolean;
  textMode: boolean;
  textColor: AnnotationColor;
  deleteMode: boolean;
  capturedSelections: CapturedSelection[];
  savedAreas: StudyArea[];
  scrollRoot: HTMLDivElement | null;
  onText: (page: number, text: string) => void;
  onSelection: (text: string, page: number, rects: NormalizedHighlightRect[]) => void;
  onAreaSelection: (page: number, rect: NormalizedHighlightRect, imageDataUrl: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onEditDictionaryMeaning: (id: string, meaning: string) => void;
  onTextAnnotation: (text: string, page: number, rect: NormalizedHighlightRect, fontSizePt: number) => void;
  onEditTextAnnotation: (id: string, text: string, fontSizePt: number) => void;
  onMoveResizeTextAnnotation: (id: string, rect: NormalizedHighlightRect) => void;
  onDeleteArea: (id: string) => void;
};

type TextEndpoint = { divIndex: number; offset: number };
type AreaDraft = { left: number; top: number; width: number; height: number };
type TextDraft = { rect: NormalizedHighlightRect; fontSizePt: number; value: string };
type TextTransform = { id: string; mode: "move" | "resize"; pointerStart: { x: number; y: number }; original: NormalizedHighlightRect; preview: NormalizedHighlightRect };

type RenderedTextLayer = {
  cancel: () => void;
  textDivs: HTMLElement[];
  textContentItemsStr: string[];
};

const annotationColors: Record<AnnotationColor, { fill: string; stroke: string }> = {
  yellow: { fill: "rgba(250, 204, 21, 0.42)", stroke: "#ca8a04" },
  green: { fill: "rgba(74, 222, 128, 0.36)", stroke: "#16a34a" },
  blue: { fill: "rgba(96, 165, 250, 0.34)", stroke: "#2563eb" },
  pink: { fill: "rgba(244, 114, 182, 0.34)", stroke: "#db2777" },
  purple: { fill: "rgba(192, 132, 252, 0.34)", stroke: "#9333ea" },
};

export function PdfPage({
  pdf,
  pageNumber,
  zoom,
  areaMode,
  textMode,
  textColor,
  deleteMode,
  capturedSelections,
  savedAreas,
  scrollRoot,
  onText,
  onSelection,
  onAreaSelection,
  onDeleteAnnotation,
  onEditDictionaryMeaning,
  onTextAnnotation,
  onEditTextAnnotation,
  onMoveResizeTextAnnotation,
  onDeleteArea,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textDivsRef = useRef<HTMLElement[]>([]);
  const textItemsRef = useRef<string[]>([]);
  const areaStartRef = useRef<{ x: number; y: number } | null>(null);
  const textStartRef = useRef<{ x: number; y: number } | null>(null);
  const textTransformRef = useRef<TextTransform | null>(null);
  const [areaDraft, setAreaDraft] = useState<AreaDraft | null>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [rendering, setRendering] = useState(false);
  const [renderedWidth, setRenderedWidth] = useState(0);
  const [renderedZoom, setRenderedZoom] = useState(0);
  const [renderError, setRenderError] = useState("");
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const [basePageSize, setBasePageSize] = useState({ width: 612, height: 792 });
  const [dictionaryEditor, setDictionaryEditor] = useState<{ id: string; value: string } | null>(null);
  const [textBoxDraft, setTextBoxDraft] = useState<AreaDraft | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [textEditor, setTextEditor] = useState<{ id: string; value: string; fontSizePt: number } | null>(null);
  const [textTransform, setTextTransform] = useState<TextTransform | null>(null);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node || !scrollRoot) return;
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), {
      root: scrollRoot,
      rootMargin: "120% 0px",
      threshold: 0,
    });
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
    if (!areaMode) {
      areaStartRef.current = null;
      setAreaDraft(null);
    }
  }, [areaMode]);

  useEffect(() => {
    if (!textMode) {
      textStartRef.current = null;
      setTextBoxDraft(null);
      setTextDraft(null);
      textTransformRef.current = null;
      setTextTransform(null);
    }
  }, [textMode]);

  useEffect(() => {
    if (!nearViewport || width < 1 || (renderedWidth === width && renderedZoom === zoom)) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: RenderedTextLayer | undefined;
    setRendering(true);
    setRenderError("");

    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setBasePageSize({ width: base.width, height: base.height });
        setRatio(base.height / base.width);
        const cssWidth = (Math.min(width, base.width * 1.5) * zoom) / 100;
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
        textLayer = layer as unknown as RenderedTextLayer;
        await layer.render();
        if (cancelled) return;

        textDivsRef.current = [...textLayer.textDivs];
        textItemsRef.current = [...textLayer.textContentItemsStr];
        setRenderedWidth(width);
        setRenderedZoom(zoom);
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
    textDivsRef.current = [];
    textItemsRef.current = [];
    setRenderedWidth(0);
    setRenderedZoom(0);
  }, [nearViewport]);

  function captureSelection() {
    if (deleteMode || areaMode || textMode) return;
    const selection = window.getSelection();
    const layer = textLayerRef.current;
    const surface = surfaceRef.current;
    const textDivs = textDivsRef.current;
    const textItems = textItemsRef.current;
    if (!selection || selection.isCollapsed || !layer || !surface || !textDivs.length) return;

    const anchor = mapSelectionEndpoint(selection.anchorNode, selection.anchorOffset, layer, textDivs);
    const focus = mapSelectionEndpoint(selection.focusNode, selection.focusOffset, layer, textDivs);
    if (!anchor || !focus) return;

    const [start, end] = orderEndpoints(anchor, focus);
    const { text, rects: characterRects } = collectSelectionFromTextItems(start, end, textDivs, textItems);
    const mergedRects = mergeCharacterRects(characterRects);
    const rects = normalizeClientRects(mergedRects, surface.getBoundingClientRect());
    if (!text || !rects.length) return;

    onSelection(text, pageNumber, rects);
    selection.removeAllRanges();
  }

  function pointInSurface(event: React.PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(event.clientX - bounds.left, 0, surfaceSize.width),
      y: clamp(event.clientY - bounds.top, 0, surfaceSize.height),
    };
  }

  function beginArea(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointInSurface(event);
    areaStartRef.current = point;
    setAreaDraft({ left: point.x, top: point.y, width: 0, height: 0 });
  }

  function moveArea(event: React.PointerEvent<HTMLDivElement>) {
    const start = areaStartRef.current;
    if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointInSurface(event);
    setAreaDraft(rectFromPoints(start, point));
  }

  function finishArea(event: React.PointerEvent<HTMLDivElement>) {
    const start = areaStartRef.current;
    if (!start) return;
    const point = pointInSurface(event);
    const rect = rectFromPoints(start, point);
    areaStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setAreaDraft(null);
    if (rect.width < 8 || rect.height < 8 || surfaceSize.width <= 0 || surfaceSize.height <= 0) return;

    const normalized: NormalizedHighlightRect = {
      x: rect.left / surfaceSize.width,
      y: rect.top / surfaceSize.height,
      width: rect.width / surfaceSize.width,
      height: rect.height / surfaceSize.height,
    };
    const imageDataUrl = cropCanvasArea(rect);
    if (imageDataUrl) onAreaSelection(pageNumber, normalized, imageDataUrl);
  }

  function cancelArea(event: React.PointerEvent<HTMLDivElement>) {
    areaStartRef.current = null;
    setAreaDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function beginTextBox(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || surfaceSize.width <= 0 || surfaceSize.height <= 0 || textDraft) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointInSurface(event);
    textStartRef.current = point;
    setTextBoxDraft({ left: point.x, top: point.y, width: 0, height: 0 });
  }

  function moveTextBox(event: React.PointerEvent<HTMLDivElement>) {
    const start = textStartRef.current;
    if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setTextBoxDraft(rectFromPoints(start, pointInSurface(event)));
  }

  function finishTextBox(event: React.PointerEvent<HTMLDivElement>) {
    const start = textStartRef.current;
    if (!start || surfaceSize.width <= 0 || surfaceSize.height <= 0) return;
    let box = rectFromPoints(start, pointInSurface(event));
    textStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (box.width < 12 || box.height < 12) {
      const left = clamp(start.x, 0, Math.max(0, surfaceSize.width - 84));
      const top = clamp(start.y, 0, Math.max(0, surfaceSize.height - 44));
      box = {
        left,
        top,
        width: Math.min(220, Math.max(80, surfaceSize.width - left - 4)),
        height: Math.min(90, Math.max(40, surfaceSize.height - top - 4)),
      };
    } else {
      box = {
        ...box,
        width: Math.max(80, box.width),
        height: Math.max(40, box.height),
      };
      box.width = Math.min(box.width, surfaceSize.width - box.left);
      box.height = Math.min(box.height, surfaceSize.height - box.top);
    }
    setTextBoxDraft(null);
    setTextDraft({
      rect: {
        x: box.left / surfaceSize.width,
        y: box.top / surfaceSize.height,
        width: box.width / surfaceSize.width,
        height: box.height / surfaceSize.height,
      },
      fontSizePt: 10,
      value: "",
    });
  }

  function cancelTextBox(event: React.PointerEvent<HTMLDivElement>) {
    textStartRef.current = null;
    setTextBoxDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function beginTextTransform(event: React.PointerEvent<HTMLButtonElement>, id: string, rect: NormalizedHighlightRect, mode: "move" | "resize") {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const transform = { id, mode, pointerStart: { x: event.clientX, y: event.clientY }, original: rect, preview: rect } satisfies TextTransform;
    textTransformRef.current = transform;
    setTextTransform(transform);
  }

  function moveTextTransform(event: React.PointerEvent<HTMLButtonElement>) {
    const current = textTransformRef.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId) || surfaceSize.width <= 0 || surfaceSize.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - current.pointerStart.x) / surfaceSize.width;
    const dy = (event.clientY - current.pointerStart.y) / surfaceSize.height;
    const original = current.original;
    const preview = current.mode === "move"
      ? { ...original, x: clamp(original.x + dx, 0, 1 - original.width), y: clamp(original.y + dy, 0, 1 - original.height) }
      : { ...original, width: clamp(original.width + dx, 80 / surfaceSize.width, 1 - original.x), height: clamp(original.height + dy, 40 / surfaceSize.height, 1 - original.y) };
    const next = { ...current, preview };
    textTransformRef.current = next;
    setTextTransform(next);
  }

  function finishTextTransform(event: React.PointerEvent<HTMLButtonElement>) {
    const current = textTransformRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onMoveResizeTextAnnotation(current.id, current.preview);
    textTransformRef.current = null;
    setTextTransform(null);
  }

  function cancelTextTransform(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    textTransformRef.current = null;
    setTextTransform(null);
  }

  function cropCanvasArea(rect: AreaDraft) {
    const canvas = canvasRef.current;
    if (!canvas || surfaceSize.width <= 0 || surfaceSize.height <= 0) return "";
    const scaleX = canvas.width / surfaceSize.width;
    const scaleY = canvas.height / surfaceSize.height;
    const sx = Math.max(0, Math.round(rect.left * scaleX));
    const sy = Math.max(0, Math.round(rect.top * scaleY));
    const sw = Math.max(1, Math.min(canvas.width - sx, Math.round(rect.width * scaleX)));
    const sh = Math.max(1, Math.min(canvas.height - sy, Math.round(rect.height * scaleY)));
    const outputScale = Math.min(1, 1000 / Math.max(sw, sh));
    const crop = document.createElement("canvas");
    crop.width = Math.max(1, Math.round(sw * outputScale));
    crop.height = Math.max(1, Math.round(sh * outputScale));
    const context = crop.getContext("2d", { alpha: false });
    if (!context) return "";
    context.fillStyle = "white";
    context.fillRect(0, 0, crop.width, crop.height);
    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    return crop.toDataURL("image/jpeg", 0.88);
  }

  const dictionaryLabelLayout = buildDictionaryBelowLayout(
    capturedSelections.flatMap((selection) => {
      if (selection.kind !== "dictionary" || !selection.annotationId || !selection.rects[0]) return [];
      const rect = projectHighlightRect(selection.rects[0], surfaceSize.width, surfaceSize.height);
      return [{
        id: selection.annotationId,
        meaning: selection.dictionaryMeaning?.trim() || "뜻 찾는 중…",
        desiredLeft: rect.left,
        desiredTop: rect.top + rect.height + 1,
        anchorWidth: rect.width,
      }];
    }),
    surfaceSize.width,
  );

  return (
    <article
      ref={wrapperRef}
      data-page={pageNumber}
      className="relative w-full max-w-[720px] bg-white shadow-2xl"
      style={{ aspectRatio: `1 / ${(ratio * zoom) / 100}` }}
      onPointerUp={captureSelection}
    >
      {(rendering || !renderedWidth) && !renderError && (
        <div className="absolute inset-0 z-10 animate-pulse bg-[#ddd]" aria-label={`${pageNumber}페이지 불러오는 중`} />
      )}
      <div
        ref={surfaceRef}
        className={`absolute left-1/2 top-0 -translate-x-1/2 ${renderedWidth ? "opacity-100" : "opacity-0"}`}
        style={{ width: surfaceSize.width || "100%", height: surfaceSize.height || "100%" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 block bg-white" />

        <div className={`absolute inset-0 z-[5] ${deleteMode ? "pointer-events-auto" : "pointer-events-none"}`}>
          {capturedSelections.flatMap((selection, selectionIndex) =>
            selection.rects.map((normalized, rectIndex) => {
              const kind = selection.kind ?? "highlight";
              const displayedNormalized = kind === "text" && selection.annotationId && textTransform?.id === selection.annotationId ? textTransform.preview : normalized;
              const rect = projectHighlightRect(displayedNormalized, surfaceSize.width, surfaceSize.height);
              const color = selection.color ?? "yellow";
              const palette = annotationColors[color];
              const key = `${selection.annotationId ?? "context"}-${selectionIndex}-${rectIndex}`;
              const canDelete = deleteMode && Boolean(selection.annotationId) && kind !== "context";

              if (kind === "context") {
                return <span key={key} className="pointer-events-none absolute rounded-[2px]" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, background: "rgba(59, 130, 246, 0.18)", outline: "1px solid rgba(59, 130, 246, 0.32)" }} />;
              }

              const commonProps = canDelete ? {
                type: "button" as const,
                title: "이 주석 삭제",
                "aria-label": `${kind === "dictionary" ? "사전" : kind === "text" ? "텍스트 메모" : kind === "underline" ? "밑줄" : "형광펜"} 주석 삭제: ${selection.text.slice(0, 80)}`,
                tabIndex: rectIndex === 0 ? 0 : -1,
                onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => event.stopPropagation(),
                onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => event.stopPropagation(),
                onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  if (selection.annotationId) onDeleteAnnotation(selection.annotationId);
                },
              } : null;

              if (kind === "text") {
                if (rectIndex > 0 || !selection.annotationId) return null;
                const fontSizePt = selection.textFontSizePt ?? legacyTextFontSizePt(selection.textFontSizeRatio, basePageSize.height);
                const memoFontSize = textFontSizePtToPixels(fontSizePt, surfaceSize.height, basePageSize.height);
                const textStyle = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, fontSize: memoFontSize, lineHeight: 1.18, color: palette.stroke, borderColor: palette.stroke, background: palette.fill };
                if (commonProps) return <button key={key} {...commonProps} className="pointer-events-auto absolute z-[5] overflow-hidden whitespace-pre-wrap rounded border border-dashed px-1 py-0.5 text-left font-medium hover:outline hover:outline-1 hover:outline-red-500" style={textStyle}>{selection.text}</button>;
                if (textEditor?.id === selection.annotationId) return <form
                  key={key}
                  className="pointer-events-auto absolute z-[7] flex min-w-48 flex-col gap-1 rounded border border-black/30 bg-white p-1 shadow-xl"
                  style={{ left: rect.left, top: rect.top, width: Math.max(rect.width, 220) }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onSubmit={(event) => { event.preventDefault(); const value = textEditor.value.trim(); if (value) onEditTextAnnotation(selection.annotationId!, value, textEditor.fontSizePt); setTextEditor(null); }}
                >
                  <textarea autoFocus rows={3} maxLength={1_000} value={textEditor.value} onChange={(event) => setTextEditor((current) => current ? { ...current, value: event.target.value } : current)} onKeyDown={(event) => { if (event.key === "Escape") setTextEditor(null); if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} className="resize-y rounded border border-black/20 px-1.5 py-1 text-black" style={{ fontSize: `${textEditor.fontSizePt}pt` }}/>
                  <TextFontSizeControl value={textEditor.fontSizePt} onChange={(value) => setTextEditor((current) => current ? { ...current, fontSizePt: value } : current)}/>
                  <button type="submit" className="self-end rounded bg-black px-2 py-1 text-[10px] text-white">저장</button>
                </form>;
                return <div key={key} className="pointer-events-auto absolute z-[5] overflow-hidden rounded border border-dashed" style={textStyle}>
                  <button
                    type="button"
                    title="텍스트 메모 수정"
                    className="absolute inset-0 h-full w-full overflow-hidden whitespace-pre-wrap px-1 py-0.5 text-left font-medium"
                    style={{ fontSize: memoFontSize, lineHeight: 1.18, color: palette.stroke }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); setTextEditor({ id: selection.annotationId!, value: selection.text, fontSizePt }); }}
                  >{selection.text}</button>
                  {textMode && <>
                    <button type="button" title="텍스트 메모 이동" aria-label="텍스트 메모 이동" className="absolute left-0 top-0 z-10 grid h-4 w-4 cursor-move place-items-center rounded-br bg-black/70 text-[9px] text-white touch-none" onPointerDown={(event) => beginTextTransform(event, selection.annotationId!, displayedNormalized, "move")} onPointerMove={moveTextTransform} onPointerUp={finishTextTransform} onPointerCancel={cancelTextTransform}>↕</button>
                    <button type="button" title="텍스트 메모 크기 조절" aria-label="텍스트 메모 크기 조절" className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize rounded-tl bg-black/70 text-white touch-none" onPointerDown={(event) => beginTextTransform(event, selection.annotationId!, displayedNormalized, "resize")} onPointerMove={moveTextTransform} onPointerUp={finishTextTransform} onPointerCancel={cancelTextTransform}><span className="block rotate-45 text-[10px]">↔</span></button>
                  </>}
                </div>;
              }

              if (kind === "dictionary") {
                const underlineStyle = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, border: "none", borderBottom: "1.5px solid #111", background: "transparent", padding: 0 };
                const fontSize = Math.max(8, Math.min(9, rect.height * 0.58));
                const meaning = selection.dictionaryMeaning?.trim() || "뜻 찾는 중…";
                const labelPosition = selection.annotationId ? dictionaryLabelLayout.get(selection.annotationId) : undefined;
                return <Fragment key={key}>
                  {commonProps
                    ? <button {...commonProps} className="absolute cursor-pointer hover:outline hover:outline-1 hover:outline-red-500 focus-visible:outline-red-500" style={underlineStyle} />
                    : <span className="absolute" style={underlineStyle} />}
                  {rectIndex === 0 && selection.annotationId && (dictionaryEditor?.id === selection.annotationId
                    ? <form
                        className="pointer-events-auto absolute z-[6] flex w-44 items-center gap-1 rounded border border-black/30 bg-white p-1 shadow-lg"
                        style={{ left: labelPosition?.left ?? rect.left, top: (labelPosition?.top ?? rect.top + rect.height) + 12 }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const value = dictionaryEditor.value.trim();
                          if (value) onEditDictionaryMeaning(selection.annotationId!, value);
                          setDictionaryEditor(null);
                        }}
                      >
                        <label className="sr-only" htmlFor={`dictionary-${selection.annotationId}`}>사전 뜻 수정</label>
                        <input id={`dictionary-${selection.annotationId}`} autoFocus maxLength={100} value={dictionaryEditor.value} onChange={(event) => setDictionaryEditor({ id: selection.annotationId!, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") setDictionaryEditor(null); }} className="min-w-0 flex-1 rounded border border-black/20 bg-white px-1.5 py-1 text-[11px] text-black"/>
                        <button type="submit" className="rounded bg-black px-2 py-1 text-[10px] text-white">저장</button>
                      </form>
                    : <button
                        type="button"
                        title="뜻 수정"
                        aria-label={`${selection.text} 뜻 수정: ${meaning}`}
                        className="pointer-events-auto absolute z-[5] truncate rounded-sm bg-white/95 px-0.5 text-left font-semibold text-black shadow-[0_0_2px_white]"
                        style={{ left: labelPosition?.left ?? rect.left, top: labelPosition?.top ?? rect.top + rect.height + 1, width: labelPosition?.width ?? Math.max(32, rect.width), height: labelPosition?.height ?? 11, fontSize, lineHeight: 1 }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); if (!deleteMode) setDictionaryEditor({ id: selection.annotationId!, value: meaning === "뜻을 입력하세요" ? "" : meaning }); }}
                      >{meaning}</button>)}
                </Fragment>;
              }

              if (kind === "underline") {
                const style = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, border: "none", borderBottom: `2px solid ${palette.stroke}`, background: "transparent", padding: 0 };
                return commonProps
                  ? <button key={key} {...commonProps} className="absolute cursor-pointer hover:outline hover:outline-1 hover:outline-red-500 focus-visible:outline-red-500" style={style} />
                  : <span key={key} className="absolute" style={style} />;
              }

              const style = { left: rect.left, top: rect.top + rect.height * 0.08, width: rect.width, height: rect.height * 0.84, border: "none", padding: 0, background: palette.fill, mixBlendMode: "multiply" as const };
              return commonProps
                ? <button key={key} {...commonProps} className="absolute cursor-pointer rounded-[2px] hover:outline hover:outline-1 hover:outline-red-500 focus-visible:outline-red-500" style={style} />
                : <span key={key} className="absolute rounded-[2px]" style={style} />;
            }),
          )}
        </div>

        <div className={`absolute inset-0 z-[3] ${deleteMode ? "pointer-events-auto" : "pointer-events-none"}`} aria-label="저장된 PDF 영역">
          {savedAreas.map((area) => {
            const rect = projectHighlightRect(area.rect, surfaceSize.width, surfaceSize.height);
            const style = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            if (deleteMode) {
              return <button
                key={area.id}
                type="button"
                title="이 영역 삭제"
                aria-label={`Page ${area.page} 영역 삭제`}
                className="absolute cursor-pointer border-2 border-dashed border-sky-500/85 bg-sky-400/[.06] hover:outline hover:outline-2 hover:outline-red-500"
                style={style}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); onDeleteArea(area.id); }}
              />;
            }
            return <span
              key={area.id}
              className="absolute border-2 border-dashed border-sky-500/75 bg-sky-400/[.045]"
              style={style}
            />;
          })}
        </div>

        <div ref={textLayerRef} className={`textLayer z-[2] ${areaMode || textMode ? "pointer-events-none" : ""}`} />

        {areaMode && <div
          className="absolute inset-0 z-[4] cursor-crosshair touch-none"
          aria-label={`Page ${pageNumber} 영역 선택`}
          onPointerDown={beginArea}
          onPointerMove={moveArea}
          onPointerUp={finishArea}
          onPointerCancel={cancelArea}
        >
          {areaDraft && <span className="pointer-events-none absolute border-2 border-sky-500 bg-sky-400/10" style={{ left: areaDraft.left, top: areaDraft.top, width: areaDraft.width, height: areaDraft.height }}/>} 
        </div>}
        {textMode && <div
          className="absolute inset-0 z-[4] cursor-crosshair touch-none"
          aria-label={`Page ${pageNumber} 텍스트 메모 위치와 크기 선택`}
          onPointerDown={beginTextBox}
          onPointerMove={moveTextBox}
          onPointerUp={finishTextBox}
          onPointerCancel={cancelTextBox}
        >
          {textBoxDraft && <span className="pointer-events-none absolute rounded border-2 border-dashed" style={{ left: textBoxDraft.left, top: textBoxDraft.top, width: textBoxDraft.width, height: textBoxDraft.height, borderColor: annotationColors[textColor].stroke, background: annotationColors[textColor].fill }}/>}
        </div>}
        {textDraft && <form
          className="pointer-events-auto absolute z-[8] flex min-w-56 flex-col gap-1 rounded border bg-white p-1 shadow-xl"
          style={{ left: textDraft.rect.x * surfaceSize.width, top: textDraft.rect.y * surfaceSize.height, width: Math.max(224, textDraft.rect.width * surfaceSize.width), borderColor: annotationColors[textColor].stroke }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onSubmit={(event) => { event.preventDefault(); const value = textDraft.value.trim(); if (value) onTextAnnotation(value, pageNumber, textDraft.rect, textDraft.fontSizePt); setTextDraft(null); }}
        >
          <textarea autoFocus rows={3} maxLength={1_000} value={textDraft.value} placeholder="메모 입력" onChange={(event) => setTextDraft((current) => current ? { ...current, value: event.target.value } : current)} onKeyDown={(event) => { if (event.key === "Escape") setTextDraft(null); if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} className="resize-y rounded border border-black/20 px-1.5 py-1 text-black" style={{ fontSize: `${textDraft.fontSizePt}pt` }}/>
          <TextFontSizeControl value={textDraft.fontSizePt} onChange={(value) => setTextDraft((current) => current ? { ...current, fontSizePt: value } : current)}/>
          <div className="flex justify-end gap-1"><button type="button" onClick={() => setTextDraft(null)} className="rounded px-2 py-1 text-[10px] text-black/60">취소</button><button type="submit" className="rounded bg-black px-2 py-1 text-[10px] text-white">저장</button></div>
        </form>}
      </div>
      {renderError && (
        <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center bg-[#eee] p-6 text-center text-sm text-black">
          Page {pageNumber}: {renderError}
        </div>
      )}
      <span className="absolute bottom-1 right-2 z-30 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{pageNumber}</span>
    </article>
  );
}

export function buildDictionaryBelowLayout(
  labels: Array<{ id: string; meaning: string; desiredLeft: number; desiredTop: number; anchorWidth: number }>,
  pageWidth: number,
) {
  const result = new Map<string, { left: number; top: number; width: number; height: number }>();
  const groups = new Map<string, typeof labels>();
  for (const label of labels) {
    const key = String(Math.round(label.desiredTop / 4));
    groups.set(key, [...(groups.get(key) ?? []), label]);
  }

  const height = 11;
  const gap = 2;
  for (const group of groups.values()) {
    const sorted = group.slice().sort((left, right) => left.desiredLeft - right.desiredLeft);
    let cursor = 2;
    let row = 0;
    for (const label of sorted) {
      const estimated = [...label.meaning].length * 8.2 + 6;
      const labelWidth = Math.min(120, Math.max(28, label.anchorWidth, estimated));
      let left = Math.max(2, label.desiredLeft, cursor);
      if (left + labelWidth > pageWidth - 2 && cursor > 2) {
        row += 1;
        cursor = 2;
        left = Math.max(2, Math.min(label.desiredLeft, pageWidth - labelWidth - 2));
      } else {
        left = Math.min(left, Math.max(2, pageWidth - labelWidth - 2));
      }
      const top = Math.max(0, label.desiredTop + row * (height + 1));
      result.set(label.id, { left, top, width: labelWidth, height });
      cursor = left + labelWidth + gap;
    }
  }
  return result;
}

export function textFontSizePtToPixels(fontSizePt: number, surfaceHeight: number, basePageHeight: number) {
  return clampTextFontSize(fontSizePt) * surfaceHeight / Math.max(1, basePageHeight);
}

function legacyTextFontSizePt(ratio: number | undefined, basePageHeight: number) {
  return clampTextFontSize(ratio ? ratio * basePageHeight : 10);
}

function clampTextFontSize(value: number) {
  return Math.max(6, Math.min(32, Number.isFinite(value) ? value : 10));
}

function TextFontSizeControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <label className="flex items-center gap-2 text-[10px] text-black/70">
    글자 크기
    <input type="number" min={6} max={32} step={1} value={value} onChange={(event) => onChange(clampTextFontSize(Number(event.target.value)))} className="h-7 w-16 rounded border border-black/20 px-2 text-xs text-black"/>
    <span>pt</span>
  </label>;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rectFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): AreaDraft {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function mapSelectionEndpoint(node: Node | null, offset: number, layer: HTMLElement, textDivs: HTMLElement[]): TextEndpoint | null {
  if (!node) return null;

  let element: HTMLElement | null = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  let textDiv: HTMLElement | null = null;
  let divIndex = -1;
  while (element && element !== layer) {
    divIndex = textDivs.indexOf(element);
    if (divIndex >= 0) {
      textDiv = element;
      break;
    }
    element = element.parentElement;
  }
  if (!textDiv || divIndex < 0) return null;

  const textLength = textDiv.textContent?.length ?? 0;
  if (node.nodeType === Node.TEXT_NODE && node.parentElement === textDiv) {
    return { divIndex, offset: Math.max(0, Math.min(offset, textLength)) };
  }

  try {
    const prefix = document.createRange();
    prefix.setStart(textDiv, 0);
    prefix.setEnd(node, offset);
    const textOffset = prefix.toString().length;
    prefix.detach();
    return { divIndex, offset: Math.max(0, Math.min(textOffset, textLength)) };
  } catch {
    return { divIndex, offset: offset <= 0 ? 0 : textLength };
  }
}

function orderEndpoints(a: TextEndpoint, b: TextEndpoint): [TextEndpoint, TextEndpoint] {
  if (a.divIndex < b.divIndex || (a.divIndex === b.divIndex && a.offset <= b.offset)) return [a, b];
  return [b, a];
}

function collectSelectionFromTextItems(
  start: TextEndpoint,
  end: TextEndpoint,
  textDivs: HTMLElement[],
  textItems: string[],
): { text: string; rects: ClientRectLike[] } {
  const rects: ClientRectLike[] = [];
  const fragments: string[] = [];

  for (let divIndex = start.divIndex; divIndex <= end.divIndex; divIndex++) {
    const div = textDivs[divIndex];
    const source = textItems[divIndex] ?? div.textContent ?? "";
    const textNode = getDirectTextNode(div);
    if (!textNode || !source) continue;

    const from = divIndex === start.divIndex ? Math.max(0, Math.min(start.offset, source.length)) : 0;
    const to = divIndex === end.divIndex ? Math.max(from, Math.min(end.offset, source.length)) : source.length;
    if (from >= to) continue;

    const selectedFragment = source.slice(from, to);
    if (selectedFragment.trim()) fragments.push(selectedFragment);

    for (let i = from; i < to && i < textNode.length; i++) {
      const character = textNode.data.slice(i, i + 1);
      if (!character || /\s/u.test(character)) continue;

      const characterRange = document.createRange();
      characterRange.setStart(textNode, i);
      characterRange.setEnd(textNode, i + 1);
      for (const rect of Array.from(characterRange.getClientRects())) {
        if (rect.width < 0.25 || rect.height < 0.5) continue;
        if (rect.width > Math.max(24, rect.height * 3.5)) continue;
        rects.push(rect);
      }
      characterRange.detach();
    }
  }

  return {
    text: fragments.join(" ").replace(/\s+/gu, " ").trim(),
    rects,
  };
}

function getDirectTextNode(div: HTMLElement): Text | null {
  for (const child of Array.from(div.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) return child as Text;
  }
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function mergeCharacterRects(rects: ClientRectLike[]): ClientRectLike[] {
  if (!rects.length) return [];
  const sorted = [...rects].sort((a, b) => a.top + a.height / 2 - (b.top + b.height / 2) || a.left - b.left);
  const lines: ClientRectLike[][] = [];

  for (const rect of sorted) {
    let target: ClientRectLike[] | undefined;
    for (const line of lines) {
      const sample = line[0];
      const sampleCenter = sample.top + sample.height / 2;
      const rectCenter = rect.top + rect.height / 2;
      if (Math.abs(sampleCenter - rectCenter) <= Math.max(1.5, Math.min(sample.height, rect.height) * 0.45)) {
        target = line;
        break;
      }
    }
    if (!target) {
      lines.push([rect]);
      continue;
    }
    target.push(rect);
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
      const allowedGap = Math.max(3, Math.min(previous.height, rect.height) * 1.15);
      if (rect.left - previous.right <= allowedGap) {
        run.push(rect);
      } else {
        flush();
        run.push(rect);
      }
    }
    flush();
  }

  return merged.sort((a, b) => a.top - b.top || a.left - b.left);
}
