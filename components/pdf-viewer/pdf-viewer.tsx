"use client";

import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Paper } from "@/lib/papers/types";
import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";
import type { AnnotationColor, AnnotationKind, StudyArea, StudyHighlight } from "@/lib/study-tray/types";
import { installPdfJsCompatibility } from "@/lib/pdf/uint8array-to-hex";
import { downloadAnnotatedPdf } from "@/lib/pdf/export-annotated-pdf";
import {
  createPdfiumVisualRenderer,
  needsChromiumFontMatrixFallback,
  type PdfiumVisualRenderer,
} from "@/lib/pdf/pdfium-visual-renderer";
import { PdfPage } from "./pdf-page";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type PdfViewerProps = {
  paper: Paper;
  page: number;
  onPageChange: (page: number) => void;
  onPageTextChange: (text: string) => void;
  onSaveHighlight: (text: string, page: number, rects: NormalizedHighlightRect[], memo: string, kind: AnnotationKind, color: AnnotationColor) => void;
  onDeleteHighlight: (id: string) => void;
  onRemoveQuestionHighlight: (id: string) => void;
  onSaveArea: (page: number, rect: NormalizedHighlightRect, imageDataUrl: string) => void;
  onDeleteArea: (id: string) => void;
  onRemoveQuestionArea: (id: string) => void;
  onClearQuestionContext: () => void;
  onClearAnnotations: () => void;
  savedHighlights: StudyHighlight[];
  savedAreas: StudyArea[];
  questionHighlights: StudyHighlight[];
  questionAreas: StudyArea[];
  libraryOpen: boolean;
  chatOpen: boolean;
  onToggleLibrary: () => void;
  onToggleChat: () => void;
};

type LoadState = "loading" | "ready" | "missing" | "blob-error" | "parse-error";
type AnnotationTool = AnnotationKind | "area" | "erase";

const colorOptions: { value: AnnotationColor; label: string; swatch: string }[] = [
  { value: "yellow", label: "노랑", swatch: "#facc15" },
  { value: "green", label: "초록", swatch: "#4ade80" },
  { value: "blue", label: "파랑", swatch: "#60a5fa" },
  { value: "pink", label: "분홍", swatch: "#f472b6" },
  { value: "purple", label: "보라", swatch: "#c084fc" },
];

export function PdfViewer({
  paper,
  page,
  onPageChange,
  onPageTextChange,
  onSaveHighlight,
  onDeleteHighlight,
  onRemoveQuestionHighlight,
  onSaveArea,
  onDeleteArea,
  onRemoveQuestionArea,
  onClearQuestionContext,
  onClearAnnotations,
  savedHighlights,
  savedAreas,
  questionHighlights,
  questionAreas,
  libraryOpen,
  chatOpen,
  onToggleLibrary,
  onToggleChat,
}: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [tool, setTool] = useState<AnnotationTool>("highlight");
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>("yellow");
  const [zoom, setZoom] = useState(100);
  const [downloadState, setDownloadState] = useState<"idle" | "loading">("idle");
  const [downloadError, setDownloadError] = useState("");
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const pageTexts = useRef(new Map<number, string>());
  const sourceBytesRef = useRef<Uint8Array | null>(null);
  const currentPage = useRef(page);
  currentPage.current = page;

  useEffect(() => {
    const controller = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    let document: PDFDocumentProxy | undefined;
    let visualRenderer: PdfiumVisualRenderer | undefined;
    setPdf(null);
    setLoadState("loading");
    setError("");
    pageTexts.current.clear();
    onPageTextChange("");

    async function loadPdf() {
      try {
        const sourceBytes = await loadPaperPdfBytes(paper, controller.signal);
        if (!sourceBytes) { setLoadState("missing"); setError("PDF가 아직 등록되지 않았습니다."); return; }
        sourceBytesRef.current = sourceBytes.slice();
        // Chromium 138/139 has an upstream CFF FontMatrix regression for the
        // embedded Type1 math fonts produced by PDF.js. Only those browser
        // versions use PDFium for visible pixels; PDF.js remains responsible
        // for text extraction, selection, and annotation geometry.
        const usePdfiumVisualFallback = needsChromiumFontMatrixFallback();
        const pdfiumPromise = usePdfiumVisualFallback
          ? createPdfiumVisualRenderer(sourceBytes).catch(() => null)
          : null;

        installPdfJsCompatibility();
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        task = pdfjs.getDocument({
          // PDF.js transfers typed-array ownership to its worker. Keep the
          // original bytes alive only when the Chromium/PDFium visual fallback
          // needs a second copy of the same document.
          data: usePdfiumVisualFallback ? sourceBytes.slice() : sourceBytes,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        });
        document = await task.promise;
        if (controller.signal.aborted) return;

        if (pdfiumPromise) {
          visualRenderer = (await pdfiumPromise) ?? undefined;
          if (visualRenderer) installPdfiumPageRendering(document, visualRenderer);
        }
        if (controller.signal.aborted) {
          visualRenderer?.close();
          return;
        }

        setPdf(document);
        setLoadState("ready");
        onPageChange(1);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setLoadState("parse-error");
        setError(caught instanceof Error ? caught.message : "PDF 파일을 해석할 수 없습니다.");
      }
    }

    void loadPdf();
    return () => {
      controller.abort();
      sourceBytesRef.current = null;
      visualRenderer?.close();
      void task?.destroy();
      if (!task) void document?.destroy();
    };
  }, [paper, onPageChange, onPageTextChange]);

  useEffect(() => { onPageTextChange(pageTexts.current.get(page) ?? ""); }, [page, onPageTextChange]);

  useEffect(() => {
    if (!pdf || !scrollRoot) return;
    const visibility = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visibility.set(Number((entry.target as HTMLElement).dataset.page), entry.intersectionRatio);
      let current = 1;
      let best = 0;
      for (const [number, ratio] of visibility) {
        if (ratio > best) {
          current = number;
          best = ratio;
        }
      }
      if (best > 0) onPageChange(current);
    }, { root: scrollRoot, rootMargin: "-25% 0px -25%", threshold: [0, 0.25, 0.5, 0.75, 1] });
    scrollRoot.querySelectorAll<HTMLElement>("[data-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pdf, scrollRoot, onPageChange]);

  const handlePageText = useCallback((pageNumber: number, text: string) => {
    pageTexts.current.set(pageNumber, text);
    if (pageNumber === currentPage.current) onPageTextChange(text);
  }, [onPageTextChange]);

  function captureSelection(text: string, selectedPage: number, rects: NormalizedHighlightRect[]) {
    if (tool === "erase" || tool === "area") return;
    onPageChange(selectedPage);
    onSaveHighlight(text, selectedPage, rects, "", tool, annotationColor);
  }

  function scrollToPage(pageNumber: number) {
    scrollRoot?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleDownloadAnnotatedPdf() {
    if (!savedHighlights.length || downloadState === "loading") return;
    setDownloadState("loading");
    setDownloadError("");
    try {
      await downloadAnnotatedPdf(paper.id, savedHighlights, `${paper.id}-annotated.pdf`, sourceBytesRef.current ?? undefined);
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : "주석 PDF 다운로드에 실패했습니다.");
    } finally {
      setDownloadState("idle");
    }
  }

  function handleClearAnnotations() {
    const count = savedHighlights.length + savedAreas.length;
    if (!count) return;
    const confirmed = window.confirm(
      `이 논문의 형광펜·밑줄·선택 영역 ${count}개를 모두 지울까요?\n저장한 Q&A, 메모, 학습 노트는 유지됩니다.`,
    );
    if (confirmed) onClearAnnotations();
  }

  const contextCount = questionHighlights.length + questionAreas.length;

  return <section className="flex h-full min-h-0 flex-col bg-[#111]" aria-label="PDF 뷰어">
    <style>{`[aria-label="저장된 PDF 영역"]{pointer-events:none!important}[aria-label="저장된 PDF 영역"]>button{pointer-events:auto!important}`}</style>
    <header className="border-b border-[var(--line)] px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleLibrary}
          aria-label={libraryOpen ? "논문 목록 닫기" : "논문 목록 열기"}
          aria-pressed={libraryOpen}
          title={libraryOpen ? "논문 목록 닫기" : "논문 목록 열기"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-white/[.06] hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/></svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="shrink-0 text-[10px] font-semibold tracking-[.08em] text-[var(--accent)]">{paper.tag}</p>
          </div>
          <h2 className="mt-0.5 truncate text-sm font-medium sm:text-base">{paper.title}</h2>
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{paper.authors} · {paper.year ?? "연도 미상"}</p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <div id="study-tray-actions" className="flex items-center"/>
          <button
            type="button"
            onClick={onToggleChat}
            aria-label={chatOpen ? "질의응답 닫기" : "질의응답 열기"}
            aria-pressed={chatOpen}
            title={chatOpen ? "질의응답 닫기" : "질의응답 열기"}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-xs text-[#d7d7dc] hover:bg-white/[.06]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2h7A3.5 3.5 0 0 1 19 5.5v7a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 4v-4A3.5 3.5 0 0 1 3 12.5v-7Z"/><path d="M8 8h8M8 11.5h5"/></svg>
            <span className="hidden sm:inline">질의응답</span>
          </button>
          {paper.notionUrl && <a href={paper.notionUrl} target="_blank" rel="noreferrer" className="hidden h-8 items-center rounded-lg border border-[var(--line)] px-2.5 text-xs hover:bg-[#222] sm:flex">Notion ↗</a>}
        </div>
      </div>
    </header>

    <div className="border-b border-[var(--line)] bg-black px-3 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--muted)]">{pdf ? `${page} / ${pdf.numPages} 페이지` : "PDF를 불러오는 중입니다"}</span>
        {pdf && <div className="flex items-center gap-1.5 text-xs">
          <label htmlFor="page-jump" className="sr-only">페이지 이동</label>
          <input id="page-jump" type="number" min={1} max={pdf.numPages} value={page} onChange={(event) => { const target = Math.max(1, Math.min(pdf.numPages, Number(event.target.value))); onPageChange(target); scrollToPage(target); }} className="w-14 rounded border border-[var(--line)] bg-[#111] px-2 py-1 text-center"/>
          <button onClick={() => setZoom((value) => Math.max(75, value - 25))} disabled={zoom <= 75} aria-label="축소" className="rounded border border-[var(--line)] px-2 py-1">−</button>
          <span className="w-10 text-center tabular-nums">{zoom}%</span>
          <button onClick={() => setZoom((value) => Math.min(150, value + 25))} disabled={zoom >= 150} aria-label="확대" className="rounded border border-[var(--line)] px-2 py-1">+</button>
        </div>}
      </div>

      {pdf && <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-[#222] pt-1.5">
        <div className="flex items-center rounded-lg border border-[var(--line)] bg-[#111] p-0.5" role="group" aria-label="PDF 주석 도구">
          <ToolButton active={tool === "highlight"} onClick={() => setTool("highlight")} label="형광펜" title="드래그하면 형광펜으로 저장되고 다음 질문 문맥에도 추가"/>
          <ToolButton active={tool === "underline"} onClick={() => setTool("underline")} label="밑줄" title="드래그하면 밑줄로 저장되고 다음 질문 문맥에도 추가"/>
          <ToolButton active={tool === "area"} onClick={() => setTool("area")} label="영역" title="수식·그림·표를 사각형으로 선택해 저장하고 질문 문맥에 추가"/>
          <ToolButton active={tool === "erase"} onClick={() => setTool("erase")} label="지우개" title="저장된 형광펜·밑줄·영역을 클릭해서 삭제"/>
        </div>
        {tool !== "erase" && tool !== "area" && <div className="flex items-center gap-1" role="group" aria-label="주석 색상">
          {colorOptions.map((option) => <button
            key={option.value}
            type="button"
            onClick={() => setAnnotationColor(option.value)}
            aria-label={`${option.label} 주석 색상`}
            aria-pressed={annotationColor === option.value}
            className={`h-6 w-6 rounded-full border-2 ${annotationColor === option.value ? "border-white" : "border-transparent"}`}
            style={{ background: option.swatch }}
          />)}
        </div>}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={!savedHighlights.length || downloadState === "loading"}
            onClick={() => void handleDownloadAnnotatedPdf()}
            title="저장된 형광펜·밑줄을 원본 PDF에 합성해서 다운로드합니다. 선택 영역은 PDF에 표시하지 않습니다."
            className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-white/[.06] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {downloadState === "loading" ? "PDF 만드는 중…" : "표시된 PDF 다운로드"}
          </button>
          <button
            type="button"
            disabled={savedHighlights.length + savedAreas.length === 0}
            onClick={handleClearAnnotations}
            title="현재 논문의 형광펜·밑줄·선택 영역을 모두 삭제합니다."
            className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            표시 모두 지우기
          </button>
        </div>
        <span className="hidden text-[10px] text-[var(--muted)] xl:inline">{tool === "area" ? "영역 모드: 선택한 영역은 공부 중 PDF 위에 계속 표시되며 다운로드 PDF에는 포함되지 않습니다." : tool === "erase" ? "지우개 모드: 형광펜·밑줄·영역 위치를 클릭해서 삭제합니다." : `${tool === "highlight" ? "형광펜" : "밑줄"} 모드: 드래그 즉시 저장되고 다음 질문 문맥에도 추가됩니다.`}</span>
      </div>}
      {downloadError && <p role="alert" className="mt-1.5 text-xs text-red-300">{downloadError}</p>}

      {pdf && <div className="mt-1.5 h-0.5 overflow-hidden bg-[#333]"><div className="h-full bg-white transition-[width]" style={{ width: `${page / pdf.numPages * 100}%` }}/></div>}
    </div>

    {contextCount > 0 && <div className="border-b border-[var(--line)] bg-black p-2.5">
      <div className="flex flex-wrap gap-2">
        {questionHighlights.map((highlight) => <span key={highlight.id} className="flex max-w-full items-center gap-1 rounded-full border border-[var(--line)] bg-[#111] py-1 pl-2.5 pr-1 text-xs">
          <span className="max-w-72 truncate">p.{highlight.page} · {(highlight.kind ?? "highlight") === "underline" ? "밑줄" : "형광펜"} · {highlight.text}</span>
          <button onClick={() => onRemoveQuestionHighlight(highlight.id)} aria-label={`Page ${highlight.page} 질문 문맥에서 제외`} className="h-5 w-5 rounded-full">×</button>
        </span>)}
        {questionAreas.map((area) => <span key={area.id} className="flex items-center gap-2 rounded-lg border border-sky-500/50 bg-[#111] py-1 pl-1 pr-1 text-xs">
          <img src={area.imageDataUrl} alt="" className="h-8 w-12 rounded bg-white object-contain"/>
          <span>p.{area.page} · 영역</span>
          <button onClick={() => onRemoveQuestionArea(area.id)} aria-label={`Page ${area.page} 질문 문맥에서 제외`} className="h-5 w-5 rounded-full">×</button>
        </span>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-[var(--muted)]">주석 {questionHighlights.length}개 · 영역 {questionAreas.length}개를 다음 질문 문맥으로 사용합니다</span>
        <button onClick={onClearQuestionContext} className="rounded border border-[var(--line)] px-3 py-1 text-xs">질문 문맥 비우기</button>
      </div>
    </div>}

    <div ref={setScrollRoot} className="scrollbar min-h-0 flex-1 overflow-auto overscroll-contain p-2 touch-pan-y sm:p-3">
      {loadState === "loading" && <DocumentLoading />}
      {loadState === "missing" && <EmptyPdf />}
      {loadState === "blob-error" && <LoadError title="Blob에서 PDF를 가져오지 못했습니다" detail={error} />}
      {loadState === "parse-error" && <LoadError title="PDF 파일을 해석하지 못했습니다" detail={error} />}
      {pdf && <div className="mx-auto flex w-full max-w-[780px] flex-col items-center gap-5">
        {Array.from({ length: pdf.numPages }, (_, index) => <PdfPage
          key={index + 1}
          pdf={pdf}
          pageNumber={index + 1}
          zoom={zoom}
          areaMode={tool === "area"}
          deleteMode={tool === "erase"}
          capturedSelections={savedHighlights
            .filter((selection) => selection.page === index + 1)
            .map((selection) => ({ annotationId: selection.id, text: selection.text, rects: selection.rects ?? [], kind: selection.kind ?? "highlight", color: selection.color ?? "yellow" }))}
          savedAreas={savedAreas.filter((area) => area.page === index + 1)}
          scrollRoot={scrollRoot}
          onText={handlePageText}
          onSelection={captureSelection}
          onAreaSelection={onSaveArea}
          onDeleteAnnotation={onDeleteHighlight}
          onDeleteArea={onDeleteArea}
        />)}
      </div>}
    </div>
  </section>;
}

function installPdfiumPageRendering(pdf: PDFDocumentProxy, renderer: PdfiumVisualRenderer) {
  const originalGetPage = pdf.getPage.bind(pdf);
  const patchedPages = new WeakSet<object>();
  const documentWithPatchedGetPage = pdf as unknown as {
    getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  };

  documentWithPatchedGetPage.getPage = async (pageNumber: number) => {
    const page = await originalGetPage(pageNumber);
    if (patchedPages.has(page)) return page;
    patchedPages.add(page);

    type RenderMethod = PDFPageProxy["render"];
    const originalRender = page.render.bind(page) as RenderMethod;
    const pageWithPatchedRender = page as unknown as { render: RenderMethod };
    pageWithPatchedRender.render = ((parameters: Parameters<RenderMethod>[0]) => {
      const canvas = parameters.canvas;
      if (!canvas) return originalRender(parameters);

      let cancelled = false;
      let fallbackTask: ReturnType<RenderMethod> | undefined;
      const promise = renderer.renderPage(pageNumber - 1, canvas, () => cancelled)
        .catch(() => {
          if (cancelled) throw createRenderingCancelledError();
          // PDFium is a compatibility renderer, not a single point of failure.
          // If WASM rendering fails unexpectedly, retain the normal PDF.js path.
          fallbackTask = originalRender(parameters);
          if (cancelled) fallbackTask.cancel();
          return fallbackTask.promise;
        })
        .then(() => {
          if (cancelled) throw createRenderingCancelledError();
        });

      return {
        promise,
        cancel: () => {
          cancelled = true;
          fallbackTask?.cancel();
        },
      } as unknown as ReturnType<RenderMethod>;
    }) as RenderMethod;

    return page;
  };
}

function createRenderingCancelledError() {
  const error = new Error("Rendering cancelled");
  error.name = "RenderingCancelledException";
  return error;
}

function ToolButton({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title: string }) {
  return <button type="button" onClick={onClick} title={title} aria-pressed={active} className={`rounded-md px-2.5 py-1 text-xs ${active ? "bg-white font-semibold text-black" : "text-[#bbb] hover:bg-[#222]"}`}>{label}</button>;
}

function DocumentLoading() { return <div className="m-auto flex min-h-80 flex-col items-center justify-center gap-4" role="status"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#555] border-t-white"/><p className="text-sm text-[var(--muted)]">PDF 불러오는 중…</p></div>; }
function EmptyPdf() { return <div className="m-auto max-w-sm rounded-xl border border-dashed border-[#555] p-8 text-center"><div className="text-3xl">▱</div><h3 className="mt-3 font-medium">PDF가 아직 등록되지 않았습니다</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">PDF 관리에서 private Blob 동기화를 먼저 실행하세요.</p></div>; }
function LoadError({ title, detail }: { title: string; detail: string }) { return <div role="alert" className="m-auto max-w-md rounded-xl border border-[#555] p-8 text-center"><h3 className="font-medium">{title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{detail}</p></div>; }

async function loadPaperPdfBytes(paper: Paper, signal: AbortSignal): Promise<Uint8Array | null> {
  if (paper.library === "personal") {
    if (!paper.asset) return null;
    const client = getBrowserSupabase();
    if (!client) throw new Error("Supabase 연결이 설정되지 않았습니다.");
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { data, error } = await client.storage.from(paper.asset.bucketId).download(paper.asset.objectPath);
    if (error) throw error;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return new Uint8Array(await data.arrayBuffer());
  }
  const response = await fetch(`/api/pdf/${encodeURIComponent(paper.id)}`, { signal });
  if (!response.ok) {
    if (response.status === 404) return null;
    let message = "PDF를 불러오지 못했습니다.";
    try { message = (await response.json()).error ?? message; } catch { /* non-JSON response */ }
    throw new Error(message);
  }
  return new Uint8Array(await response.arrayBuffer());
}
