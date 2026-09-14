"use client";

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Paper } from "@/lib/papers/types";
import { installPdfJsCompatibility } from "@/lib/pdf/uint8array-to-hex";
import { PdfPage } from "./pdf-page";

type PdfViewerProps = {
  paper: Paper;
  page: number;
  onPageChange: (page: number) => void;
  onSelectionChange: (text: string) => void;
  onPageTextChange: (text: string) => void;
  onSaveHighlight: (text: string, page: number, memo: string) => void;
};

type LoadState = "loading" | "ready" | "missing" | "blob-error" | "parse-error";
type CapturedSelection = { text: string; page: number };

export function PdfViewer({ paper, page, onPageChange, onSelectionChange, onPageTextChange, onSaveHighlight }: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [selections, setSelections] = useState<CapturedSelection[]>([]);
  const [highlightMemo, setHighlightMemo] = useState("");
  const [zoom, setZoom] = useState(100);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const pageTexts = useRef(new Map<number, string>());
  const currentPage = useRef(page);
  currentPage.current = page;

  useEffect(() => {
    const controller = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    let document: PDFDocumentProxy | undefined;
    setPdf(null); setLoadState("loading"); setError(""); setSelections([]);
    pageTexts.current.clear(); onSelectionChange(""); onPageTextChange("");

    async function loadPdf() {
      try {
        const response = await fetch(`/api/pdf/${encodeURIComponent(paper.id)}`, { signal: controller.signal });
        if (!response.ok) {
          let message = "PDF를 불러오지 못했습니다.";
          try { message = (await response.json()).error ?? message; } catch { /* non-JSON response */ }
          if (response.status === 404) setLoadState("missing");
          else setLoadState("blob-error");
          setError(message);
          return;
        }
        const bytes = await response.arrayBuffer();
        installPdfJsCompatibility();
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
        task = pdfjs.getDocument({ data: bytes });
        document = await task.promise;
        if (controller.signal.aborted) return;
        setPdf(document); setLoadState("ready"); onPageChange(1);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setLoadState("parse-error");
        setError(caught instanceof Error ? caught.message : "PDF 파일을 해석할 수 없습니다.");
      }
    }

    void loadPdf();
    return () => { controller.abort(); void task?.destroy(); if (!task) void document?.destroy(); };
  }, [paper.id, onPageChange, onPageTextChange, onSelectionChange]);

  useEffect(() => { onPageTextChange(pageTexts.current.get(page) ?? ""); }, [page, onPageTextChange]);

  useEffect(() => {
    if (!pdf || !scrollRoot) return;
    const visibility = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visibility.set(Number((entry.target as HTMLElement).dataset.page), entry.intersectionRatio);
      let current = 1; let best = 0;
      for (const [number, ratio] of visibility) if (ratio > best) { current = number; best = ratio; }
      if (best > 0) onPageChange(current);
    }, { root: scrollRoot, rootMargin: "-25% 0px -25%", threshold: [0, 0.25, 0.5, 0.75, 1] });
    scrollRoot.querySelectorAll<HTMLElement>("[data-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pdf, scrollRoot, onPageChange]);

  const handlePageText = useCallback((pageNumber: number, text: string) => {
    pageTexts.current.set(pageNumber, text);
    if (pageNumber === currentPage.current) onPageTextChange(text);
  }, [onPageTextChange]);

  function captureSelection(text: string, selectedPage: number) {
    setSelections((current) => {
      const next = current.some((item) => item.page === selectedPage && item.text === text) ? current : [...current, { text, page: selectedPage }].slice(-8);
      onSelectionChange(next.map((item) => `[p.${item.page}] ${item.text}`).join("\n\n"));
      return next;
    });
    onPageChange(selectedPage);
  }

  function saveHighlight() {
    if (!selections.length) return;
    for (const selection of selections) onSaveHighlight(selection.text, selection.page, highlightMemo.trim());
    clearSelections(); setHighlightMemo("");
  }

  function removeSelection(index: number) {
    setSelections((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      onSelectionChange(next.map((item) => `[p.${item.page}] ${item.text}`).join("\n\n"));
      return next;
    });
  }

  function clearSelections() {
    setSelections([]); onSelectionChange(""); window.getSelection()?.removeAllRanges();
  }

  function scrollToPage(pageNumber: number) {
    scrollRoot?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <section className="flex min-h-[620px] flex-col bg-[#111] lg:min-h-0" aria-label="PDF 뷰어">
    <header className="border-b border-[var(--line)] px-5 py-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><p className="text-xs text-[var(--accent)]">{paper.tag} / {paper.id}</p><h2 className="mt-1 font-medium">{paper.title}</h2><p className="mt-1 text-xs text-[var(--muted)]">{paper.authors} · {paper.year ?? "연도 미상"}</p></div><div className="flex shrink-0 flex-wrap items-center justify-end gap-2"><div id="paper-header-actions" className="flex items-center gap-2"/><a href={paper.notionUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs hover:bg-[#222]">Notion ↗</a></div></div></header>
    <div className="border-b border-[var(--line)] bg-black px-4 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[var(--muted)]">{pdf ? `현재 ${page} / ${pdf.numPages} 페이지` : "텍스트를 드래그해 질문 문맥 또는 Highlight로 저장하세요"}</span>{pdf && <div className="flex items-center gap-2 text-xs"><label htmlFor="page-jump" className="sr-only">페이지 이동</label><input id="page-jump" type="number" min={1} max={pdf.numPages} value={page} onChange={(event) => { const target = Math.max(1, Math.min(pdf.numPages, Number(event.target.value))); onPageChange(target); scrollToPage(target); }} className="w-14 rounded border border-[var(--line)] bg-[#111] px-2 py-1 text-center"/><button onClick={() => setZoom((value) => Math.max(75, value - 25))} disabled={zoom <= 75} aria-label="축소" className="rounded border border-[var(--line)] px-2 py-1">−</button><span className="w-10 text-center tabular-nums">{zoom}%</span><button onClick={() => setZoom((value) => Math.min(150, value + 25))} disabled={zoom >= 150} aria-label="확대" className="rounded border border-[var(--line)] px-2 py-1">+</button></div>}</div>{pdf && <div className="mt-2 h-0.5 overflow-hidden bg-[#333]"><div className="h-full bg-white transition-[width]" style={{ width: `${page / pdf.numPages * 100}%` }}/></div>}</div>
    {selections.length > 0 && <div className="border-b border-[var(--line)] bg-black p-3"><div className="flex flex-wrap gap-2">{selections.map((selection, index) => <span key={`${selection.page}-${selection.text}`} className="flex max-w-full items-center gap-1 rounded-full border border-[var(--line)] bg-[#111] py-1 pl-2.5 pr-1 text-xs"><span className="max-w-64 truncate">p.{selection.page} · {selection.text}</span><button onClick={() => removeSelection(index)} aria-label={`선택 ${index + 1} 제거`} className="h-5 w-5 rounded-full">×</button></span>)}</div><div className="mt-2 flex flex-wrap items-center justify-end gap-2"><span className="mr-auto text-xs text-[var(--muted)]">선택 {selections.length}개를 질문 문맥으로 사용합니다</span><input aria-label="Highlight 메모" value={highlightMemo} onChange={(event) => setHighlightMemo(event.target.value)} placeholder="공통 메모 (선택)" className="rounded border border-[var(--line)] bg-[#111] px-2 py-1 text-xs"/><button onClick={clearSelections} className="rounded border border-[var(--line)] px-3 py-1 text-xs">모두 지우기</button><button onClick={saveHighlight} className="rounded bg-white px-3 py-1 text-xs font-semibold text-black">Highlight 저장</button></div></div>}
    <div ref={setScrollRoot} className="scrollbar flex-1 overflow-auto overscroll-contain p-3 touch-pan-y sm:p-5">
      {loadState === "loading" && <DocumentLoading />}
      {loadState === "missing" && <EmptyPdf />}
      {loadState === "blob-error" && <LoadError title="Blob에서 PDF를 가져오지 못했습니다" detail={error} />}
      {loadState === "parse-error" && <LoadError title="PDF 파일을 해석하지 못했습니다" detail={error} />}
      {pdf && <div className="mx-auto flex w-full max-w-[960px] flex-col items-center gap-6">{Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={index + 1} pdf={pdf} pageNumber={index + 1} zoom={zoom} capturedTexts={selections.filter((selection) => selection.page === index + 1).map((selection) => selection.text)} scrollRoot={scrollRoot} onText={handlePageText} onSelection={captureSelection}/>)}</div>}
    </div>
  </section>;
}

function DocumentLoading() { return <div className="m-auto flex min-h-80 flex-col items-center justify-center gap-4" role="status"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#555] border-t-white"/><p className="text-sm text-[var(--muted)]">PDF 불러오는 중…</p></div>; }
function EmptyPdf() { return <div className="m-auto max-w-sm rounded-xl border border-dashed border-[#555] p-8 text-center"><div className="text-3xl">▱</div><h3 className="mt-3 font-medium">PDF가 아직 등록되지 않았습니다</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">PDF 관리에서 private Blob 동기화를 먼저 실행하세요.</p></div>; }
function LoadError({ title, detail }: { title: string; detail: string }) { return <div role="alert" className="m-auto max-w-md rounded-xl border border-[#555] p-8 text-center"><h3 className="font-medium">{title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{detail}</p></div>; }
