"use client";

import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import type { Paper } from "@/lib/papers/types";

type PdfViewerProps = {
  paper: Paper;
  page: number;
  onPageChange: (page: number) => void;
  onSelectionChange: (text: string) => void;
  onPageTextChange: (text: string) => void;
  onSaveHighlight: (text: string, page: number, memo: string) => void;
};

export function PdfViewer({ paper, page, onPageChange, onSelectionChange, onPageTextChange, onSaveHighlight }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [highlightMemo, setHighlightMemo] = useState("");

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    let textLayer: { cancel: () => void } | undefined;

    async function renderPdf() {
      try {
        setError("");
        onSelectionChange("");
        setSelectedText("");
        const probe = await fetch(`/api/papers/${paper.id}`);
        const data = await probe.json();
        if (!probe.ok || !data.pdfAvailable) {
          setAvailable(false);
          setPageCount(0);
          onPageTextChange("");
          return;
        }

        setAvailable(true);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
        task = pdfjs.getDocument(`/api/pdf/${paper.id}`);
        const pdf = await task.promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);
        const safePage = Math.min(page, pdf.numPages);
        if (safePage !== page) onPageChange(safePage);
        const pdfPage = await pdf.getPage(safePage);
        const viewport = pdfPage.getViewport({ scale: 1.35 });
        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;

        setSize({ width: viewport.width, height: viewport.height });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;

        const textContent = await pdfPage.getTextContent();
        onPageTextChange(textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        textContainer.replaceChildren();
        const renderedTextLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textContainer, viewport });
        textLayer = renderedTextLayer;
        await renderedTextLayer.render();
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "PDF를 열 수 없습니다.");
      }
    }

    void renderPdf();
    return () => { cancelled = true; textLayer?.cancel(); void task?.destroy(); };
  }, [paper.id, page, onPageChange, onPageTextChange, onSelectionChange]);

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || !textLayerRef.current?.contains(selection.anchorNode)) return;
    onSelectionChange(selection.toString().trim());
    setSelectedText(selection.toString().trim());
  }

  function saveHighlight() {
    if (!selectedText) return;
    onSaveHighlight(selectedText, page, highlightMemo.trim());
    setSelectedText(""); setHighlightMemo(""); onSelectionChange(""); window.getSelection()?.removeAllRanges();
  }

  return <section className="flex min-h-[620px] flex-col bg-[#111] lg:min-h-0" aria-label="PDF 뷰어">
    <header className="border-b border-[var(--line)] px-5 py-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-[var(--accent)]">{paper.tag} / {paper.id}</p><h2 className="mt-1 font-medium">{paper.title}</h2><p className="mt-1 text-xs text-[var(--muted)]">{paper.authors} · {paper.year ?? "연도 미상"}</p></div><a href={paper.notionUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-xs hover:bg-[#1a211e]">Notion ↗</a></div></header>
    <div className="flex items-center justify-center border-b border-[var(--line)] px-4 py-2"><span className="text-xs text-[var(--muted)]">텍스트를 드래그해 질문 문맥 또는 Highlight로 저장하세요 · {page} / {pageCount || "—"}</span></div>
    {selectedText && <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-black p-3"><p className="min-w-48 flex-1 truncate text-xs">“{selectedText}”</p><input aria-label="Highlight 메모" value={highlightMemo} onChange={(event) => setHighlightMemo(event.target.value)} placeholder="메모 (선택)" className="rounded border border-[var(--line)] bg-[#111] px-2 py-1 text-xs"/><button onClick={saveHighlight} className="rounded bg-white px-3 py-1 text-xs font-semibold text-black">Highlight 저장</button></div>}
    <div className="relative scrollbar flex flex-1 items-start justify-center overflow-auto p-5" onMouseUp={captureSelection}>
      <button aria-label="이전 페이지" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="sticky left-2 top-1/2 z-10 mr-auto h-16 w-12 shrink-0 -translate-y-1/2 rounded-full border border-white bg-black/80 text-2xl text-white disabled:opacity-20">‹</button>
      {available === false ? <EmptyPdf /> : error ? <p role="alert" className="m-auto text-sm text-red-300">{error}</p> : <div className="relative shrink-0 shadow-2xl" style={size}><canvas ref={canvasRef} className="block bg-white" /><div ref={textLayerRef} className="textLayer" /></div>}
      <button aria-label="다음 페이지" disabled={!pageCount || page >= pageCount} onClick={() => onPageChange(page + 1)} className="sticky right-2 top-1/2 z-10 ml-auto h-16 w-12 shrink-0 -translate-y-1/2 rounded-full border border-white bg-black/80 text-2xl text-white disabled:opacity-20">›</button>
    </div>
  </section>;
}

function EmptyPdf() { return <div className="m-auto max-w-sm rounded-xl border border-dashed border-[#3d4943] p-8 text-center"><div className="text-3xl">▱</div><h3 className="mt-3 font-medium">PDF가 아직 연결되지 않았습니다</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Private Vercel Blob 연결과 업로드가 완료되면 이 영역에 논문이 표시됩니다.</p></div>; }
