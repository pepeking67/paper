"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PaperList } from "./paper-list/paper-list";
import { PdfViewer } from "./pdf-viewer/pdf-viewer";
import { StudyChat } from "./study-chat/study-chat";
import { PdfSyncPanel } from "./pdf-sync/pdf-sync-panel";
import { StudyTray } from "./study-tray/study-tray";
import type { Paper } from "@/lib/papers/types";
import { emptyStudyTray, type StudyTrayData } from "@/lib/study-tray/types";

export function StudyWorkspace({ initialPaper, papers }: { initialPaper: Paper; papers: Paper[] }) {
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState("");
  const [pageText, setPageText] = useState("");
  const [tray, setTray] = useState<StudyTrayData>(emptyStudyTray);
  const [chatWidth, setChatWidth] = useState(440);
  const chatWidthRef = useRef(440);
  const storageKey = `paper-study-tray:${initialPaper.id}`;
  useEffect(() => {
    try { setTray(JSON.parse(localStorage.getItem(storageKey) ?? "null") ?? emptyStudyTray()); }
    catch { setTray(emptyStudyTray()); }
  }, [storageKey]);
  useEffect(() => {
    const stored = Number(localStorage.getItem("paper-study-chat-width"));
    if (stored >= 360 && stored <= 720) { chatWidthRef.current = stored; setChatWidth(stored); }
  }, []);
  function updateTray(updater: (current: StudyTrayData) => StudyTrayData) {
    setTray((current) => { const next = updater(current); localStorage.setItem(storageKey, JSON.stringify(next)); return next; });
  }
  function resizeChat(clientX: number) {
    const maximum = Math.min(720, window.innerWidth - 220 - 360);
    const next = Math.max(360, Math.min(maximum, window.innerWidth - clientX));
    chatWidthRef.current = next;
    setChatWidth(next);
  }
  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeChat(event.clientX);
  }
  function finishResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    localStorage.setItem("paper-study-chat-width", String(chatWidthRef.current));
  }
  const context = useMemo(() => ({ paperId: initialPaper.id, page, selectedText: selection, pageText }), [initialPaper.id, page, selection, pageText]);
  return <main className="study-workspace relative grid min-h-dvh grid-cols-1 bg-black lg:h-dvh lg:overflow-hidden" style={{ "--chat-width": `${chatWidth}px` } as React.CSSProperties}>
    <PaperList papers={papers} activeId={initialPaper.id} />
    <PdfViewer paper={initialPaper} page={page} onPageChange={setPage} onSelectionChange={setSelection} onPageTextChange={setPageText} savedHighlights={tray.highlights} onSaveHighlight={(text, highlightPage, rects, memo) => updateTray((current) => ({ ...current, highlights: [...current.highlights, { id: crypto.randomUUID(), text, page: highlightPage, rects, memo, createdAt: new Date().toISOString() }] }))} />
    <div role="separator" aria-label="PDF와 채팅 영역 너비 조절" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={720} aria-valuenow={chatWidth} tabIndex={0} className="workspace-resizer group absolute bottom-0 top-0 z-20 hidden w-2 cursor-col-resize touch-none select-none lg:block" style={{ right: chatWidth - 4 }} onPointerDown={startResize} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeChat(event.clientX); }} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const next = Math.max(360, Math.min(720, chatWidth + (event.key === "ArrowLeft" ? 24 : -24))); chatWidthRef.current = next; setChatWidth(next); localStorage.setItem("paper-study-chat-width", String(next)); }}><span className="absolute bottom-0 left-1/2 top-0 w-px bg-[var(--line)] transition-colors group-hover:bg-white group-focus-visible:bg-white"/><span aria-hidden="true" className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#777] transition-colors group-hover:bg-white group-focus-visible:bg-white"/></div>
    <StudyChat paper={initialPaper} context={context} onSaveInsight={(question, answer) => updateTray((current) => ({ ...current, insights: [...current.insights, { id: crypto.randomUUID(), question, answer, page, sourceText: selection || undefined, createdAt: new Date().toISOString() }] }))} />
    <PdfSyncPanel papers={papers} />
    <StudyTray paper={initialPaper} tray={tray} onAddMemo={(text) => updateTray((current) => ({ ...current, memos: [...current.memos, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }] }))} onRemove={(kind, id) => updateTray((current) => ({ ...current, [kind]: current[kind].filter((item) => item.id !== id) }))} />
  </main>;
}
