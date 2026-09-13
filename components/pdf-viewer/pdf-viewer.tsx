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
};

export function PdfViewer({ paper, page, onPageChange, onSelectionChange, onPageTextChange }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    let textLayer: { cancel: () => void } | undefined;

    async function renderPdf() {
      try {
        setError("");
        onSelectionChange("");
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
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
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
  }

  return <section className="flex min-h-[620px] flex-col bg-[#121614] lg:min-h-0" aria-label="PDF 뷰어">
    <header className="border-b border-[var(--line)] px-5 py-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-[var(--accent)]">{paper.tag} / {paper.id}</p><h2 className="mt-1 font-medium">{paper.title}</h2><p className="mt-1 text-xs text-[var(--muted)]">{paper.authors} · {paper.year ?? "연도 미상"}</p></div><a href={paper.notionUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-xs hover:bg-[#1a211e]">Notion ↗</a></div></header>
    <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2"><span className="text-xs text-[var(--muted)]">텍스트를 드래그하면 질문 문맥에 첨부됩니다</span><div className="flex items-center gap-2"><button aria-label="이전 페이지" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>←</button><span className="text-xs tabular-nums">{page} / {pageCount || "—"}</span><button aria-label="다음 페이지" disabled={!pageCount || page >= pageCount} onClick={() => onPageChange(page + 1)}>→</button></div></div>
    <div className="scrollbar flex flex-1 items-start justify-center overflow-auto p-5" onMouseUp={captureSelection}>
      {available === false ? <EmptyPdf /> : error ? <p role="alert" className="m-auto text-sm text-red-300">{error}</p> : <div className="relative shrink-0 shadow-2xl" style={size}><canvas ref={canvasRef} className="block bg-white" /><div ref={textLayerRef} className="textLayer" /></div>}
    </div>
  </section>;
}

function EmptyPdf() { return <div className="m-auto max-w-sm rounded-xl border border-dashed border-[#3d4943] p-8 text-center"><div className="text-3xl">▱</div><h3 className="mt-3 font-medium">PDF가 아직 연결되지 않았습니다</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Private Vercel Blob 연결과 업로드가 완료되면 이 영역에 논문이 표시됩니다.</p></div>; }
