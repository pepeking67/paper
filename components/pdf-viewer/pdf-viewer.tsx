"use client";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import type { Paper } from "@/lib/papers/types";

export function PdfViewer({ paper, page, onPageChange, onSelectionChange }: { paper: Paper; page: number; onPageChange: (n:number)=>void; onSelectionChange:(s:string)=>void }) {
  const canvas = useRef<HTMLCanvasElement>(null); const [pages,setPages]=useState(0); const [available,setAvailable]=useState<boolean|null>(null); const [error,setError]=useState("");
  useEffect(()=>{ let cancelled=false; let task: PDFDocumentLoadingTask|undefined;
    (async()=>{ try { const probe=await fetch(`/api/papers/${paper.id}`); const data=await probe.json(); if(!data.pdfAvailable){setAvailable(false);setPages(0);return;} setAvailable(true);
      const pdfjs=await import("pdfjs-dist"); pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
      task=pdfjs.getDocument(`/api/pdf/${paper.id}`); const pdf=await task.promise; if(cancelled)return; setPages(pdf.numPages); const safe=Math.min(page,pdf.numPages); if(safe!==page)onPageChange(safe); const pdfPage=await pdf.getPage(safe); const viewport=pdfPage.getViewport({scale:1.35}); const el=canvas.current;if(!el)return; el.width=viewport.width;el.height=viewport.height; await pdfPage.render({canvas:el,canvasContext:el.getContext("2d")!,viewport}).promise;
    } catch(e){if(!cancelled)setError(e instanceof Error?e.message:"PDF를 열 수 없습니다.");} })(); return()=>{cancelled=true;void task?.destroy();};
  },[paper.id,page,onPageChange]);
  return <section className="flex min-h-[620px] flex-col bg-[#121614] lg:min-h-0" aria-label="PDF 뷰어">
    <header className="border-b border-[var(--line)] px-5 py-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-[var(--accent)]">{paper.tag} / {paper.id}</p><h2 className="mt-1 font-medium">{paper.title}</h2><p className="mt-1 text-xs text-[var(--muted)]">{paper.authors} · {paper.year ?? "연도 미상"}</p></div><a href={paper.notionUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-xs hover:bg-[#1a211e]">Notion ↗</a></div></header>
    <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2"><span className="text-xs text-[var(--muted)]">텍스트를 선택하면 질문 문맥에 첨부됩니다</span><div className="flex items-center gap-2"><button aria-label="이전 페이지" disabled={page<=1} onClick={()=>onPageChange(page-1)}>←</button><span className="text-xs tabular-nums">{page} / {pages||"—"}</span><button aria-label="다음 페이지" disabled={!pages||page>=pages} onClick={()=>onPageChange(page+1)}>→</button></div></div>
    <div className="scrollbar flex flex-1 items-start justify-center overflow-auto p-5" onMouseUp={()=>onSelectionChange(window.getSelection()?.toString().trim() ?? "")}>
      {available===false?<EmptyPdf/>:error?<p role="alert" className="m-auto text-sm text-red-300">{error}</p>:<canvas ref={canvas} className="max-w-full bg-white shadow-2xl"/>}
    </div>
  </section>;
}
function EmptyPdf(){return <div className="m-auto max-w-sm rounded-xl border border-dashed border-[#3d4943] p-8 text-center"><div className="text-3xl">▱</div><h3 className="mt-3 font-medium">PDF가 아직 연결되지 않았습니다</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Private Vercel Blob 연결과 업로드가 완료되면 이 영역에 논문이 표시됩니다.</p></div>}
