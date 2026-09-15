"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PaperList } from "./paper-list/paper-list";
import { PdfViewer } from "./pdf-viewer/pdf-viewer";
import { StudyChat } from "./study-chat/study-chat";
import { PdfSyncPanel } from "./pdf-sync/pdf-sync-panel";
import { StudyTray } from "./study-tray/study-tray";
import type { ChatTurn } from "@/lib/ai/provider";
import type { Paper } from "@/lib/papers/types";
import { emptyStudyTray, type AnnotationColor, type AnnotationKind, type StudyArea, type StudyHighlight, type StudyTrayData } from "@/lib/study-tray/types";
import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";

export function StudyWorkspace({ initialPaper, papers }: { initialPaper: Paper; papers: Paper[] }) {
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState("");
  const [tray, setTray] = useState<StudyTrayData>(emptyStudyTray);
  const [questionHighlights, setQuestionHighlights] = useState<StudyHighlight[]>([]);
  const [questionAreas, setQuestionAreas] = useState<StudyArea[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatWidth, setChatWidth] = useState(440);
  const chatWidthRef = useRef(440);
  const storageKey = `paper-study-tray:${initialPaper.id}`;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<StudyTrayData> | null;
      setTray(stored ? { ...emptyStudyTray(), ...stored, areas: Array.isArray(stored.areas) ? stored.areas : [] } : emptyStudyTray());
    } catch { setTray(emptyStudyTray()); }
    setQuestionHighlights([]);
    setQuestionAreas([]);
  }, [storageKey]);

  useEffect(() => {
    const stored = Number(localStorage.getItem("paper-study-chat-width"));
    if (stored >= 360 && stored <= 720) { chatWidthRef.current = stored; setChatWidth(stored); }
  }, []);

  function updateTray(updater: (current: StudyTrayData) => StudyTrayData) {
    setTray((current) => {
      const next = updater(current);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { /* Keep the in-memory annotation even if browser storage quota is full. */ }
      return next;
    });
  }

  function createHighlight(text: string, highlightPage: number, rects: NormalizedHighlightRect[], memo: string, kind: AnnotationKind, color: AnnotationColor) {
    const highlight: StudyHighlight = {
      id: crypto.randomUUID(),
      text,
      page: highlightPage,
      rects,
      memo,
      kind,
      color,
      createdAt: new Date().toISOString(),
    };
    updateTray((current) => ({ ...current, highlights: [...current.highlights, highlight] }));
    setQuestionHighlights((current) => [...current.filter((item) => item.id !== highlight.id), highlight]);
    setPage(highlightPage);
  }

  function removeHighlight(id: string) {
    updateTray((current) => ({ ...current, highlights: current.highlights.filter((item) => item.id !== id) }));
    setQuestionHighlights((current) => current.filter((item) => item.id !== id));
  }

  function createArea(areaPage: number, rect: NormalizedHighlightRect, imageDataUrl: string) {
    const area: StudyArea = { id: crypto.randomUUID(), page: areaPage, rect, imageDataUrl, memo: "", createdAt: new Date().toISOString() };
    updateTray((current) => ({ ...current, areas: [...(current.areas ?? []), area] }));
    setQuestionAreas((current) => [...current.filter((item) => item.id !== area.id), area].slice(-4));
    setPage(areaPage);
  }

  function removeArea(id: string) {
    updateTray((current) => ({ ...current, areas: (current.areas ?? []).filter((item) => item.id !== id) }));
    setQuestionAreas((current) => current.filter((item) => item.id !== id));
  }

  function clearQuestionAnnotations() {
    const highlightIds = new Set(questionHighlights.map((item) => item.id));
    const areaIds = new Set(questionAreas.map((item) => item.id));
    updateTray((current) => ({
      ...current,
      highlights: current.highlights.filter((item) => !highlightIds.has(item.id)),
      areas: (current.areas ?? []).filter((item) => !areaIds.has(item.id)),
    }));
    setQuestionHighlights([]);
    setQuestionAreas([]);
  }

  function removeTrayItem(kind: keyof StudyTrayData, id: string) {
    if (kind === "areas") { removeArea(id); return; }
    if (kind === "highlights") { removeHighlight(id); return; }
    if (kind === "insights") { updateTray((current) => ({ ...current, insights: current.insights.filter((item) => item.id !== id) })); return; }
    if (kind === "memos") updateTray((current) => ({ ...current, memos: current.memos.filter((item) => item.id !== id) }));
  }

  function useAreaForQuestion(area: StudyArea) {
    setQuestionAreas((current) => [...current.filter((item) => item.id !== area.id), area].slice(-4));
    setPage(area.page);
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

  const selectedText = useMemo(
    () => questionHighlights.map((item) => `[p.${item.page}] ${item.text}`).join("\n\n"),
    [questionHighlights],
  );

  const context = useMemo(() => ({
    paperId: initialPaper.id,
    page,
    selectedText,
    selectedAreas: questionAreas.map((area) => ({ id: area.id, page: area.page, imageDataUrl: area.imageDataUrl })),
    pageText,
  }), [initialPaper.id, page, selectedText, questionAreas, pageText]);

  return <main className="study-workspace relative grid min-h-dvh grid-cols-1 bg-black lg:h-dvh lg:overflow-hidden" style={{ "--chat-width": `${chatWidth}px` } as React.CSSProperties}>
    <PaperList papers={papers} activeId={initialPaper.id} />
    <PdfViewer
      paper={initialPaper}
      page={page}
      onPageChange={setPage}
      onPageTextChange={setPageText}
      savedHighlights={tray.highlights}
      savedAreas={tray.areas ?? []}
      questionHighlights={questionHighlights}
      questionAreas={questionAreas}
      onSaveArea={createArea}
      onDeleteArea={removeArea}
      onSaveHighlight={createHighlight}
      onDeleteHighlight={removeHighlight}
      onClearQuestionContext={clearQuestionAnnotations}
    />
    <div role="separator" aria-label="PDF와 채팅 영역 너비 조절" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={720} aria-valuenow={chatWidth} tabIndex={0} className="workspace-resizer group absolute bottom-0 top-0 z-20 hidden w-2 cursor-col-resize touch-none select-none lg:block" style={{ right: chatWidth - 4 }} onPointerDown={startResize} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeChat(event.clientX); }} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const next = Math.max(360, Math.min(720, chatWidth + (event.key === "ArrowLeft" ? 24 : -24))); chatWidthRef.current = next; setChatWidth(next); localStorage.setItem("paper-study-chat-width", String(next)); }}><span className="absolute bottom-0 left-1/2 top-0 w-px bg-[var(--line)] transition-colors group-hover:bg-white group-focus-visible:bg-white"/><span aria-hidden="true" className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#777] transition-colors group-hover:bg-white group-focus-visible:bg-white"/></div>
    <StudyChat
      paper={initialPaper}
      context={context}
      onHistoryChange={setChatHistory}
      onSaveInsight={(question, answer) => updateTray((current) => ({ ...current, insights: [...current.insights, { id: crypto.randomUUID(), question, answer, page, sourceText: selectedText || undefined, createdAt: new Date().toISOString() }] }))}
    />
    <PdfSyncPanel papers={papers} />
    <StudyTray
      paper={initialPaper}
      tray={tray}
      chatHistory={chatHistory}
      onAddMemo={(text) => updateTray((current) => ({ ...current, memos: [...current.memos, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }] }))}
      onRemove={removeTrayItem}
      onUseArea={useAreaForQuestion}
    />
  </main>;
}