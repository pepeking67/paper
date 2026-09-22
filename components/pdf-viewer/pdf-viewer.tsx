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
import { paperUiStorageKey, readPaperUiState, updatePaperUiState, type AnnotationTool } from "@/lib/workspace-state/local-ui-state";
import { createRecentResourceCache, type CachedResourceHandle } from "@/lib/pdf/recent-resource-cache";

type PdfViewerProps = {
  paper: Paper;
  storageScope: string;
  positionReady: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onPageTextChange: (text: string) => void;
  onSaveHighlight: (text: string, page: number, rects: NormalizedHighlightRect[], memo: string, kind: AnnotationKind, color: AnnotationColor) => void;
  onSaveDictionary: (text: string, page: number, rects: NormalizedHighlightRect[]) => void;
  onEditDictionaryMeaning: (id: string, meaning: string) => void;
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
const colorOptions: { value: AnnotationColor; label: string; swatch: string }[] = [
  { value: "yellow", label: "노랑", swatch: "#facc15" },
  { value: "green", label: "초록", swatch: "#4ade80" },
  { value: "blue", label: "파랑", swatch: "#60a5fa" },
  { value: "pink", label: "분홍", swatch: "#f472b6" },
  { value: "purple", label: "보라", swatch: "#c084fc" },
];

type CachedPdfResource = {
  document: PDFDocumentProxy;
  sourceBytes: Uint8Array;
  loadingTask: PDFDocumentLoadingTask;
  visualRenderer?: PdfiumVisualRenderer;
};

const recentPdfCache = createRecentResourceCache<CachedPdfResource | null>({
  maxEntries: 2,
  dispose: async (resource) => {
    if (!resource) return;
    resource.visualRenderer?.close();
    await resource.loadingTask.destroy();
  },
});

export function PdfViewer({
  paper,
  storageScope,
  positionReady,
  page,
  onPageChange,
  onPageTextChange,
  onSaveHighlight,
  onSaveDictionary,
  onEditDictionaryMeaning,
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
  const pdfCacheKey = getPdfCacheKey(storageScope, paper);
  const initialCachedResource = recentPdfCache.peek(pdfCacheKey);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(() => initialCachedResource?.document ?? null);
  const [loadState, setLoadState] = useState<LoadState>(() => initialCachedResource === null ? "missing" : initialCachedResource ? "ready" : "loading");
  const [error, setError] = useState("");
  const [tool, setTool] = useState<AnnotationTool>("highlight");
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>("yellow");
  const [colorMenuTool, setColorMenuTool] = useState<AnnotationKind | null>(null);
  const [zoom, setZoom] = useState(100);
  const [downloadState, setDownloadState] = useState<"idle" | "loading">("idle");
  const [downloadError, setDownloadError] = useState("");
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const pageTexts = useRef(new Map<number, string>());
  const sourceBytesRef = useRef<Uint8Array | null>(initialCachedResource?.sourceBytes ?? null);
  const paperRef = useRef(paper);
  paperRef.current = paper;
  const restoringPageForPaper = useRef<string | null>(paper.id);
  const restoringScrollOffsetRatio = useRef(0);
  const currentPage = useRef(page);
  currentPage.current = page;
  const paperUiKey = paperUiStorageKey(storageScope, paper.id);
  const [restoredViewerUiKey, setRestoredViewerUiKey] = useState("");

  useEffect(() => {
    const stored = readPaperUiState(storageScope, paper.id);
    setZoom(stored.zoom);
    setTool(stored.annotationTool);
    setAnnotationColor(stored.annotationColor);
    setColorMenuTool(null);
    setRestoredViewerUiKey(paperUiKey);
    restoringPageForPaper.current = paper.id;
    restoringScrollOffsetRatio.current = stored.scrollOffsetRatio;
  }, [paper.id, paperUiKey, storageScope]);

  useEffect(() => {
    if (restoredViewerUiKey !== paperUiKey) return;
    updatePaperUiState(storageScope, paper.id, { zoom, annotationTool: tool, annotationColor });
  }, [annotationColor, paper.id, paperUiKey, restoredViewerUiKey, storageScope, tool, zoom]);

  useEffect(() => {
    let cancelled = false;
    let cacheHandle: CachedResourceHandle<CachedPdfResource | null> | undefined;
    const cachedResource = recentPdfCache.peek(pdfCacheKey);
    setPdf(cachedResource?.document ?? null);
    setLoadState(cachedResource === null ? "missing" : cachedResource ? "ready" : "loading");
    sourceBytesRef.current = cachedResource?.sourceBytes ?? null;
    setError("");
    pageTexts.current.clear();
    onPageTextChange("");

    async function loadPdf() {
      try {
        cacheHandle = await recentPdfCache.acquire(pdfCacheKey, () => createCachedPdfResource(paperRef.current));
        if (cancelled) { cacheHandle.release(); return; }
        const resource = cacheHandle.value;
        if (!resource) { setLoadState("missing"); setError("PDF가 아직 등록되지 않았습니다."); return; }
        sourceBytesRef.current = resource.sourceBytes;
        setPdf(resource.document);
        setLoadState("ready");
      } catch (caught) {
        if (cancelled) return;
        setLoadState("parse-error");
        setError(caught instanceof Error ? caught.message : "PDF 파일을 해석할 수 없습니다.");
      }
    }

    void loadPdf();
    return () => {
      cancelled = true;
      sourceBytesRef.current = null;
      cacheHandle?.release();
    };
  }, [pdfCacheKey, onPageTextChange]);

  useEffect(() => { onPageTextChange(pageTexts.current.get(page) ?? ""); }, [page, onPageTextChange]);

  useEffect(() => {
    if (!pdf || !scrollRoot || !positionReady || restoringPageForPaper.current !== paper.id) return;
    const targetPage = Math.max(1, Math.min(currentPage.current, pdf.numPages));
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      const target = scrollRoot.querySelector<HTMLElement>(`[data-page="${targetPage}"]`);
      if (target) {
        const top = target.offsetTop + target.offsetHeight * restoringScrollOffsetRatio.current;
        scrollRoot.scrollTo({ top, behavior: "auto" });
      }
      secondFrame = window.requestAnimationFrame(() => {
        if (restoringPageForPaper.current === paper.id) restoringPageForPaper.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [page, paper.id, pdf, positionReady, scrollRoot]);

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
      if (best > 0 && restoringPageForPaper.current !== paper.id) onPageChange(current);
    }, { root: scrollRoot, rootMargin: "-25% 0px -25%", threshold: [0, 0.25, 0.5, 0.75, 1] });
    scrollRoot.querySelectorAll<HTMLElement>("[data-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [paper.id, pdf, scrollRoot, onPageChange]);

  useEffect(() => {
    if (!pdf || !scrollRoot || !positionReady) return;
    const root = scrollRoot;
    let timer = 0;

    function persistScrollAnchor() {
      if (restoringPageForPaper.current === paper.id) return;
      const pages = [...root.querySelectorAll<HTMLElement>("[data-page]")];
      if (!pages.length) return;
      const anchorY = root.scrollTop + 1;
      let target = pages[0];
      for (const candidate of pages) {
        if (candidate.offsetTop > anchorY) break;
        target = candidate;
      }
      const pageNumber = Number(target.dataset.page);
      if (!Number.isInteger(pageNumber)) return;
      const offsetRatio = Math.max(0, Math.min(1, (root.scrollTop - target.offsetTop) / Math.max(1, target.offsetHeight)));
      updatePaperUiState(storageScope, paper.id, { page: pageNumber, scrollOffsetRatio: offsetRatio });
    }

    function schedulePersist() {
      window.clearTimeout(timer);
      timer = window.setTimeout(persistScrollAnchor, 160);
    }

    function persistWhenHidden() {
      if (document.visibilityState === "hidden") persistScrollAnchor();
    }

    root.addEventListener("scroll", schedulePersist, { passive: true });
    document.addEventListener("visibilitychange", persistWhenHidden);
    window.addEventListener("pagehide", persistScrollAnchor);
    return () => {
      window.clearTimeout(timer);
      persistScrollAnchor();
      root.removeEventListener("scroll", schedulePersist);
      document.removeEventListener("visibilitychange", persistWhenHidden);
      window.removeEventListener("pagehide", persistScrollAnchor);
    };
  }, [paper.id, pdf, positionReady, scrollRoot, storageScope]);

  const handlePageText = useCallback((pageNumber: number, text: string) => {
    pageTexts.current.set(pageNumber, text);
    if (pageNumber === currentPage.current) onPageTextChange(text);
  }, [onPageTextChange]);

  function captureSelection(text: string, selectedPage: number, rects: NormalizedHighlightRect[]) {
    if (tool === "erase" || tool === "area") return;
    onPageChange(selectedPage);
    if (tool === "dictionary") {
      onSaveDictionary(text, selectedPage, rects);
      return;
    }
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
      `이 논문의 형광펜·밑줄·사전 뜻·선택 영역 ${count}개를 모두 지울까요?\n저장한 Q&A, 메모, 학습 노트는 유지됩니다.`,
    );
    if (confirmed) onClearAnnotations();
  }

  function handleToolClick(nextTool: AnnotationTool) {
    if ((nextTool === "highlight" || nextTool === "underline") && tool === nextTool) {
      setColorMenuTool((current) => current === nextTool ? null : nextTool);
      return;
    }
    setTool(nextTool);
    setColorMenuTool(null);
  }

  function handleColorSelect(color: AnnotationColor) {
    setAnnotationColor(color);
    setColorMenuTool(null);
  }

  const contextCount = questionHighlights.length + questionAreas.length;

  return <section className="flex h-full min-h-0 flex-col bg-[#111]" aria-label="PDF 뷰어">
    <style>{`[aria-label="저장된 PDF 영역"]{pointer-events:none!important}[aria-label="저장된 PDF 영역"]>button{pointer-events:auto!important}`}</style>
    <header className="border-b border-[var(--line)] px-2 py-1 sm:px-3">
      <div className="flex min-h-8 items-center gap-2">
        <button
          type="button"
          onClick={onToggleLibrary}
          aria-label={libraryOpen ? "논문 목록 닫기" : "논문 목록 열기"}
          aria-pressed={libraryOpen}
          title={libraryOpen ? "논문 목록 닫기" : "논문 목록 열기"}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-white/[.06] hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/></svg>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="shrink-0 text-[9px] font-semibold tracking-[.06em] text-[var(--accent)]">{paper.tag}</p>
          <h2 className="truncate text-xs font-medium sm:text-sm">{paper.title}</h2>
          <p className="hidden shrink-0 truncate text-[10px] text-[var(--muted)] xl:block">{paper.authors} · {paper.year ?? "연도 미상"}</p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <div id="study-tray-actions" className="flex items-center"/>
          <button
            type="button"
            onClick={onToggleChat}
            aria-label={chatOpen ? "질의응답 닫기" : "질의응답 열기"}
            aria-pressed={chatOpen}
            title={chatOpen ? "질의응답 닫기" : "질의응답 열기"}
            className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--line)] px-2 text-xs text-[#d7d7dc] hover:bg-white/[.06]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2h7A3.5 3.5 0 0 1 19 5.5v7a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 4v-4A3.5 3.5 0 0 1 3 12.5v-7Z"/><path d="M8 8h8M8 11.5h5"/></svg>
            <span className="hidden sm:inline">질의응답</span>
          </button>
          {paper.notionUrl && <a href={paper.notionUrl} target="_blank" rel="noreferrer" className="hidden h-7 items-center rounded-md border border-[var(--line)] px-2 text-[11px] hover:bg-[#222] lg:flex">Notion ↗</a>}
        </div>
      </div>
    </header>

    <div className="relative z-20 border-b border-[var(--line)] bg-black px-2 py-1 sm:px-3">
      {pdf ? <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex shrink-0 items-center rounded-md border border-[var(--line)] bg-[#111] p-0.5" role="group" aria-label="PDF 주석 도구">
          <div className="relative">
            <ToolButton tool="highlight" active={tool === "highlight"} color={annotationColor} onClick={() => handleToolClick("highlight")} label="형광펜" title={tool === "highlight" ? "다시 눌러 색상 변경" : "형광펜 선택"}/>
            {colorMenuTool === "highlight" && <ColorPalette value={annotationColor} onSelect={handleColorSelect}/>}
          </div>
          <div className="relative">
            <ToolButton tool="underline" active={tool === "underline"} color={annotationColor} onClick={() => handleToolClick("underline")} label="밑줄" title={tool === "underline" ? "다시 눌러 색상 변경" : "밑줄 선택"}/>
            {colorMenuTool === "underline" && <ColorPalette value={annotationColor} onSelect={handleColorSelect}/>}
          </div>
          <ToolButton tool="dictionary" active={tool === "dictionary"} onClick={() => handleToolClick("dictionary")} label="사전" title="단어를 선택해 뜻을 검은 밑줄 위에 표시"/>
          <ToolButton tool="area" active={tool === "area"} onClick={() => handleToolClick("area")} label="영역 선택" title="수식·그림·표 영역 선택"/>
          <ToolButton tool="erase" active={tool === "erase"} onClick={() => handleToolClick("erase")} label="지우개" title="저장된 표시를 눌러 삭제"/>
        </div>

        <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">{page}/{pdf.numPages}</span>
        <label htmlFor="page-jump" className="sr-only">페이지 이동</label>
        <input id="page-jump" type="number" min={1} max={pdf.numPages} value={page} onChange={(event) => { const target = Math.max(1, Math.min(pdf.numPages, Number(event.target.value))); onPageChange(target); scrollToPage(target); }} className="hidden h-7 w-12 rounded border border-[var(--line)] bg-[#111] px-1 text-center text-xs sm:block"/>
        <button onClick={() => setZoom((value) => Math.max(75, value - 25))} disabled={zoom <= 75} aria-label="축소" title="축소" className="grid h-7 w-7 shrink-0 place-items-center rounded border border-[var(--line)] text-sm disabled:opacity-40">−</button>
        <span className="hidden w-9 shrink-0 text-center text-[10px] tabular-nums text-[var(--muted)] sm:inline">{zoom}%</span>
        <button onClick={() => setZoom((value) => Math.min(250, value + 25))} disabled={zoom >= 250} aria-label="확대" title="확대" className="grid h-7 w-7 shrink-0 place-items-center rounded border border-[var(--line)] text-sm disabled:opacity-40">+</button>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!savedHighlights.length || downloadState === "loading"}
            onClick={() => void handleDownloadAnnotatedPdf()}
            aria-label={downloadState === "loading" ? "PDF 만드는 중" : "표시된 PDF 다운로드"}
            title="저장된 형광펜·밑줄을 원본 PDF에 합성해서 다운로드합니다. 선택 영역은 다운로드 PDF에는 포함되지 않습니다."
            className="grid h-7 w-7 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-white/[.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg>
          </button>
          <button
            type="button"
            disabled={savedHighlights.length + savedAreas.length === 0}
            onClick={handleClearAnnotations}
            aria-label="표시 모두 지우기"
            title="현재 논문의 형광펜·밑줄·선택 영역을 모두 삭제합니다."
            className="grid h-7 w-7 place-items-center rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><path d="m4 7 1.5 14h13L20 7M9 11v6m6-6v6M3 7h18M9 7V4h6v3"/></svg>
          </button>
        </div>
      </div> : <span className="text-[11px] text-[var(--muted)]">PDF를 불러오는 중입니다</span>}
      {downloadError && <p role="alert" className="mt-1.5 text-xs text-red-300">{downloadError}</p>}

      {pdf && <div className="mt-1 h-px overflow-hidden bg-[#333]"><div className="h-full bg-white transition-[width]" style={{ width: `${page / pdf.numPages * 100}%` }}/></div>}
    </div>

    {contextCount > 0 && <div className="border-b border-[var(--line)] bg-black p-2.5">
      <div className="flex flex-wrap gap-2">
        {questionHighlights.map((highlight) => <span key={highlight.id} className="flex max-w-full items-center gap-1 rounded-full border border-[var(--line)] bg-[#111] py-1 pl-2.5 pr-1 text-xs">
          <span className="max-w-72 truncate">p.{highlight.page} · {highlight.kind === "dictionary" ? "사전" : (highlight.kind ?? "highlight") === "underline" ? "밑줄" : "형광펜"} · {highlight.text}</span>
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
            .map((selection) => ({ annotationId: selection.id, text: selection.text, rects: selection.rects ?? [], kind: selection.kind ?? "highlight", color: selection.color ?? "yellow", dictionaryMeaning: selection.dictionaryMeaning }))}
          savedAreas={savedAreas.filter((area) => area.page === index + 1)}
          scrollRoot={scrollRoot}
          onText={handlePageText}
          onSelection={captureSelection}
          onAreaSelection={onSaveArea}
          onDeleteAnnotation={onDeleteHighlight}
          onEditDictionaryMeaning={onEditDictionaryMeaning}
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

function ToolButton({ tool, active, color, onClick, label, title }: { tool: AnnotationTool; active: boolean; color?: AnnotationColor; onClick: () => void; label: string; title: string }) {
  const swatch = colorOptions.find((option) => option.value === color)?.swatch;
  return <button type="button" onClick={onClick} title={title} aria-label={label} aria-pressed={active} className={`relative grid h-7 w-7 place-items-center rounded ${active ? "bg-white text-black" : "text-[#bbb] hover:bg-[#222]"}`}>
    <ToolIcon tool={tool}/>
    {swatch && (
      <span aria-hidden="true" className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full" style={{ backgroundColor: swatch }}/>
    )}
  </button>;
}

function ToolIcon({ tool }: { tool: AnnotationTool }) {
  const iconClass = "h-4 w-4 fill-none stroke-current";
  if (tool === "highlight") return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8"><path d="m14.5 4.5 5 5L10 19H5v-5Z"/><path d="m12 7 5 5M4 21h16"/></svg>;
  if (tool === "underline") return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8"><path d="M7 4v7a5 5 0 0 0 10 0V4M5 21h14"/></svg>;
  if (tool === "dictionary") return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H14v18a3 3 0 0 1 3-3h.5a2.5 2.5 0 0 1 2.5 2.5Z"/></svg>;
  if (tool === "area") return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8"><path d="m4 15 9-9 7 7-7 7H8Z"/><path d="m10 9 7 7M13 20h8"/></svg>;
}

function ColorPalette({ value, onSelect }: { value: AnnotationColor; onSelect: (color: AnnotationColor) => void }) {
  return <div className="absolute left-0 top-full z-40 mt-2 flex gap-1 rounded-lg border border-[var(--line)] bg-[#181818] p-1.5 shadow-xl" role="group" aria-label="주석 색상 선택">
    {colorOptions.map((option) => <button
      key={option.value}
      type="button"
      onClick={() => onSelect(option.value)}
      aria-label={`${option.label} 주석 색상`}
      aria-pressed={value === option.value}
      className={`h-6 w-6 rounded-full border-2 ${value === option.value ? "border-white" : "border-transparent"}`}
      style={{ backgroundColor: option.swatch }}
    />)}
  </div>;
}

function DocumentLoading() { return <div className="m-auto flex min-h-80 flex-col items-center justify-center gap-4" role="status"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#555] border-t-white"/><p className="text-sm text-[var(--muted)]">PDF 불러오는 중…</p></div>; }
function EmptyPdf() { return <div className="m-auto max-w-sm rounded-xl border border-dashed border-[#555] p-8 text-center"><div className="text-3xl">▱</div><h3 className="mt-3 font-medium">PDF가 아직 등록되지 않았습니다</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">PDF 관리에서 private Blob 동기화를 먼저 실행하세요.</p></div>; }
function LoadError({ title, detail }: { title: string; detail: string }) { return <div role="alert" className="m-auto max-w-md rounded-xl border border-[#555] p-8 text-center"><h3 className="font-medium">{title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{detail}</p></div>; }

function getPdfCacheKey(storageScope: string, paper: Paper) {
  const sourceIdentity = paper.library === "personal"
    ? `${paper.asset?.bucketId ?? "missing"}:${paper.asset?.objectPath ?? "missing"}:${paper.asset?.checksum ?? "no-checksum"}`
    : paper.id;
  return `${storageScope}:${paper.library ?? "legacy"}:${paper.id}:${sourceIdentity}`;
}

async function createCachedPdfResource(paper: Paper): Promise<CachedPdfResource | null> {
  const sourceBytes = await loadPaperPdfBytes(paper);
  if (!sourceBytes) return null;
  const downloadBytes = sourceBytes.slice();
  const usePdfiumVisualFallback = needsChromiumFontMatrixFallback();
  let visualRenderer: PdfiumVisualRenderer | undefined;
  let loadingTask: PDFDocumentLoadingTask | undefined;

  try {
    const pdfiumPromise = usePdfiumVisualFallback
      ? createPdfiumVisualRenderer(sourceBytes).catch(() => null)
      : null;
    installPdfJsCompatibility();
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    loadingTask = pdfjs.getDocument({
      // Keep downloadBytes untouched for annotated-PDF export while PDF.js may
      // transfer ownership of its rendering copy to the worker.
      data: usePdfiumVisualFallback ? sourceBytes.slice() : sourceBytes,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
    });
    const document = await loadingTask.promise;
    if (pdfiumPromise) {
      visualRenderer = (await pdfiumPromise) ?? undefined;
      if (visualRenderer) installPdfiumPageRendering(document, visualRenderer);
    }
    return { document, sourceBytes: downloadBytes, loadingTask, visualRenderer };
  } catch (error) {
    visualRenderer?.close();
    await loadingTask?.destroy();
    throw error;
  }
}

async function loadPaperPdfBytes(paper: Paper): Promise<Uint8Array | null> {
  if (paper.library === "personal") {
    if (!paper.asset) return null;
    const client = getBrowserSupabase();
    if (!client) throw new Error("Supabase 연결이 설정되지 않았습니다.");
    const { data, error } = await client.storage.from(paper.asset.bucketId).download(paper.asset.objectPath);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }
  const response = await fetch(`/api/pdf/${encodeURIComponent(paper.id)}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    let message = "PDF를 불러오지 못했습니다.";
    try { message = (await response.json()).error ?? message; } catch { /* non-JSON response */ }
    throw new Error(message);
  }
  return new Uint8Array(await response.arrayBuffer());
}
