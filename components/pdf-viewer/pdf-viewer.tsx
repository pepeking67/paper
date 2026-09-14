"use client";

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Paper } from "@/lib/papers/types";
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

export function PdfViewer({ paper, page, onPageChange, onSelectionChange, onPageTextChange, onSaveHighlight }: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState({ text: "", page: 1 });
  const [highlightMemo, setHighlightMemo] = useState("");
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const pageTexts = useRef(new Map<number, string>());
  const currentPage = useRef(page);
  currentPage.current = page;

  useEffect(() => {
    const controller = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    let document: PDFDocumentProxy | undefined;
    setPdf(null); setLoadState("loading"); setError(""); setSelected({ text: "", page: 1 });
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
    setSelected({ text, page: selectedPage });
    onPageChange(selectedPage);
    onSelectionChange(text);
  }

  function saveHighlight() {
    if (!selected.text) return;
    onSaveHighlight(selected.text, selected.page, highlightMemo.trim());
    setSelected({ text: "", page: selected.page }); setHighlightMemo(""); onSelectionChange(""); window.getSelection()?.removeAllRanges();
  }

  return <section className="flex min-h-[620px] flex-col bg-[#111] lg:min-h-0" aria-label="PDF 뷰어">
    <header className="border-b border-[var(--line)] px-5 py-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-[var(--accent)]">{paper.tag} / {paper.id}</p><h2 className="mt-1 font-medium">{paper.title}</h2><p className="mt-1 text-xs text-[var(--muted)]">{paper.authors} · {paper.year ?? "연도 미상"}</p></div><a href={paper.notionUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-xs hover:bg-[#222]">Notion ↗</a></div></header>
    <div className="flex items-center justify-center border-b border-[var(--line)] px-4 py-2"><span className="text-xs text-[var(--muted)]">{pdf ? `현재 ${page} / ${pdf.numPages} 페이지` : "텍스트를 드래그해 질문 문맥 또는 Highlight로 저장하세요"}</span></div>
    {selected.text && <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-black p-3"><p className="min-w-48 flex-1 truncate text-xs">p.{selected.page} · “{selected.text}”</p><input aria-label="Highlight 메모" value={highlightMemo} onChange={(event) => setHighlightMemo(event.target.value)} placeholder="메모 (선택)" className="rounded border border-[var(--line)] bg-[#111] px-2 py-1 text-xs"/><button onClick={saveHighlight} className="rounded bg-white px-3 py-1 text-xs font-semibold text-black">Highlight 저장</button></div>}
    <div ref={setScrollRoot} className="scrollbar flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-3 touch-pan-y sm:p-5">
      {loadState === "loading" && <DocumentLoading />}
      {loadState === "missing" && <EmptyPdf />}
      {loadState === "blob-error" && <LoadError title="Blob에서 PDF를 가져오지 못했습니다" detail={error} />}
      {loadState === "parse-error" && <LoadError title="PDF 파일을 해석하지 못했습니다" detail={error} />}
      {pdf && <div className="mx-auto flex w-full max-w-[960px] flex-col items-center gap-6">{Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={index + 1} pdf={pdf} pageNumber={index + 1} scrollRoot={scrollRoot} onText={handlePageText} onSelection={captureSelection}/>)}</div>}
    </div>
  </section>;
}

function DocumentLoading() { return <div className="m-auto flex min-h-80 flex-col items-center justify-center gap-4" role="status"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#555] border-t-white"/><p className="text-sm text-[var(--muted)]">PDF 불러오는 중…</p></div>; }
function EmptyPdf() { return <div className="m-auto max-w-sm rounded-xl border border-dashed border-[#555] p-8 text-center"><div className="text-3xl">▱</div><h3 className="mt-3 font-medium">PDF가 아직 등록되지 않았습니다</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">PDF 관리에서 private Blob 동기화를 먼저 실행하세요.</p></div>; }
function LoadError({ title, detail }: { title: string; detail: string }) { return <div role="alert" className="m-auto max-w-md rounded-xl border border-[#555] p-8 text-center"><h3 className="font-medium">{title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{detail}</p></div>; }
