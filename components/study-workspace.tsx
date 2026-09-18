"use client";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { PaperList } from "./paper-list/paper-list";
import { PdfViewer } from "./pdf-viewer/pdf-viewer";
import { StudyChat } from "./study-chat/study-chat";
import { PdfSyncPanel } from "./pdf-sync/pdf-sync-panel";
import { StudyTray } from "./study-tray/study-tray";
import type { Paper } from "@/lib/papers/types";
import { emptyStudyTray, type AnnotationColor, type AnnotationKind, type StudyArea, type StudyHighlight, type StudyTrayData } from "@/lib/study-tray/types";
import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";

export function StudyWorkspace({ initialPaper, papers }: { initialPaper: Paper; papers: Paper[] }) {
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState("");
  const [tray, setTray] = useState<StudyTrayData>(emptyStudyTray);
  const [questionHighlights, setQuestionHighlights] = useState<StudyHighlight[]>([]);
  const [questionAreas, setQuestionAreas] = useState<StudyArea[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(420);
  const storageKey = `paper-study-tray:${initialPaper.id}`;
  const chatWidthStorageKey = "paper-study-chat-width";

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<StudyTrayData> | null;
      setTray(stored ? { ...emptyStudyTray(), ...stored, areas: Array.isArray(stored.areas) ? stored.areas : [] } : emptyStudyTray());
    } catch { setTray(emptyStudyTray()); }
    setQuestionHighlights([]);
    setQuestionAreas([]);
  }, [storageKey]);

  useEffect(() => {
    const storedLibrary = localStorage.getItem("paper-study-library-open");
    const storedChat = localStorage.getItem("paper-study-chat-open");
    const storedChatWidth = Number(localStorage.getItem(chatWidthStorageKey));
    setLibraryOpen(storedLibrary === null ? window.innerWidth >= 1024 : storedLibrary === "true");
    setChatOpen(storedChat === "true");
    if (Number.isFinite(storedChatWidth) && storedChatWidth > 0) {
      setChatWidth(clampChatWidth(storedChatWidth, window.innerWidth, storedLibrary === "true"));
    }
  }, []);

  function setLibraryVisibility(open: boolean) {
    setLibraryOpen(open);
    try { localStorage.setItem("paper-study-library-open", String(open)); } catch { /* Keep UI state in memory. */ }
  }

  function setChatVisibility(open: boolean) {
    setChatOpen(open);
    try { localStorage.setItem("paper-study-chat-open", String(open)); } catch { /* Keep UI state in memory. */ }
  }

  function beginChatResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth < 768) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = chatWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = clampChatWidth(startWidth + startX - moveEvent.clientX, window.innerWidth, libraryOpen);
      setChatWidth(nextWidth);
    }

    function stopResize() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      setChatWidth((current) => {
        try { localStorage.setItem(chatWidthStorageKey, String(current)); } catch { /* Keep resized width in memory. */ }
        return current;
      });
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  }

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

  function removeQuestionHighlight(id: string) {
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

  function removeQuestionArea(id: string) {
    setQuestionAreas((current) => current.filter((item) => item.id !== id));
  }

  function clearQuestionAnnotations() {
    setQuestionHighlights([]);
    setQuestionAreas([]);
  }

  function clearPdfAnnotations() {
    updateTray((current) => ({ ...current, highlights: [], areas: [] }));
    setQuestionHighlights([]);
    setQuestionAreas([]);
  }

  function removeTrayItem(kind: keyof StudyTrayData, id: string) {
    // PDF annotations are intentionally erased only from the PDF eraser tool.
    if (kind === "areas" || kind === "highlights") return;
    if (kind === "insights") { updateTray((current) => ({ ...current, insights: current.insights.filter((item) => item.id !== id) })); return; }
    if (kind === "memos") updateTray((current) => ({ ...current, memos: current.memos.filter((item) => item.id !== id) }));
  }

  function useAreaForQuestion(area: StudyArea) {
    setQuestionAreas((current) => [...current.filter((item) => item.id !== area.id), area].slice(-4));
    setPage(area.page);
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

  return <main
    className="study-workspace relative grid h-dvh min-h-0 grid-cols-1 overflow-hidden"
    data-library-open={libraryOpen ? "true" : "false"}
    data-chat-open="false"
    data-chat-drawer-open={chatOpen ? "true" : "false"}
    style={{ "--chat-width": `${chatWidth}px` } as CSSProperties}
  >
    <style>{`
      /* Question-context chips now live inside Study Chat so the PDF keeps its full vertical space. */
      [aria-label="PDF 뷰어"] > header + div + div:not(.scrollbar) { display: none !important; }
      /* Only one library toggle is visible at a time: the sidebar's own control while open. */
      [aria-label="PDF 뷰어"] button[aria-label="논문 목록 닫기"] { display: none !important; }
    `}</style>

    {libraryOpen && !chatOpen && <button
      type="button"
      aria-label="논문 목록 바깥 영역"
      className="fixed inset-0 z-30 bg-black/55 lg:hidden"
      onPointerDown={() => setLibraryVisibility(false)}
    />}

    {libraryOpen && <div className="fixed inset-y-0 left-0 z-40 w-[min(88vw,300px)] min-w-0 lg:static lg:z-auto lg:w-auto">
      <PaperList papers={papers} activeId={initialPaper.id} onClose={() => setLibraryVisibility(false)} />
    </div>}

    <div className="min-h-0 min-w-0">
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
        onRemoveQuestionArea={removeQuestionArea}
        onSaveHighlight={createHighlight}
        onDeleteHighlight={removeHighlight}
        onRemoveQuestionHighlight={removeQuestionHighlight}
        onClearQuestionContext={clearQuestionAnnotations}
        onClearAnnotations={clearPdfAnnotations}
        libraryOpen={libraryOpen}
        chatOpen={chatOpen}
        onToggleLibrary={() => setLibraryVisibility(!libraryOpen)}
        onToggleChat={() => setChatVisibility(!chatOpen)}
      />
    </div>

    {chatOpen && <div className="relative fixed inset-y-0 right-0 z-50 w-[min(92vw,420px)] min-w-0 shadow-[-24px_0_70px_rgba(0,0,0,.38)] md:static md:z-auto md:w-auto md:max-w-none md:shadow-none">
      <div
        role="separator"
        aria-label="질의응답 패널 크기 조절"
        aria-orientation="vertical"
        title="드래그하여 질의응답 패널 너비 조절"
        onPointerDown={beginChatResize}
        className="absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none md:block"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--line)] transition group-hover:bg-[var(--accent)]" />
      </div>
      <StudyChat
        paper={initialPaper}
        context={context}
        savedInsights={tray.insights}
        questionHighlights={questionHighlights}
        questionAreas={questionAreas}
        onRemoveQuestionHighlight={removeQuestionHighlight}
        onRemoveQuestionArea={removeQuestionArea}
        onClearQuestionContext={clearQuestionAnnotations}
        onClose={() => setChatVisibility(false)}
        onQuestionContextConsumed={clearQuestionAnnotations}
        onSaveInsight={(question, answer) => updateTray((current) => {
          if (current.insights.some((insight) => insight.question === question && insight.answer === answer)) return current;
          return { ...current, insights: [...current.insights, { id: crypto.randomUUID(), question, answer, page, sourceText: selectedText || undefined, createdAt: new Date().toISOString() }] };
        })}
      />
    </div>}

    <PdfSyncPanel papers={papers} />
    <StudyTray
      paper={initialPaper}
      tray={tray}
      onAddMemo={(text) => updateTray((current) => ({ ...current, memos: [...current.memos, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }] }))}
      onRemove={removeTrayItem}
      onUseArea={useAreaForQuestion}
    />
  </main>;
}


function clampChatWidth(value: number, viewportWidth: number, libraryOpen: boolean) {
  const minimum = 300;
  const libraryWidth = libraryOpen && viewportWidth >= 1024 ? 280 : 0;
  const minimumPdfWidth = 320;
  const maximum = Math.max(minimum, Math.min(760, viewportWidth - libraryWidth - minimumPdfWidth));
  return Math.round(Math.max(minimum, Math.min(maximum, value)));
}
