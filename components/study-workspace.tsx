"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { PaperList } from "./paper-list/paper-list";
import { PdfViewer } from "./pdf-viewer/pdf-viewer";
import { StudyChat } from "./study-chat/study-chat";
import { StudyTray } from "./study-tray/study-tray";
import type { Paper } from "@/lib/papers/types";
import { type AnnotationColor, type AnnotationKind, type StudyArea, type StudyHighlight, type StudyTrayData } from "@/lib/study-tray/types";
import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";
import { AccountControl } from "./auth/account-control";
import { useStudyState } from "@/lib/study-sync/use-study-state";
import { StudySyncStatusView } from "./study-sync/sync-status";
import { usePersonalLibrary } from "./library/personal-library-provider";
import { useAuth } from "./auth/auth-provider";
import { flushAreaDeletionQueue, loadAreaDataUrl, queueAreaDeletion, uploadAreaCrop } from "@/lib/area-assets/area-storage";
import { LibraryManager } from "./library/library-manager";

export function StudyWorkspace({ initialPaper }: { initialPaper: Paper }) {
  const personalLibrary = usePersonalLibrary();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [managerOpen, setManagerOpen] = useState(false);
  const personalPaper = user ? personalLibrary.papers.find((paper) => paper.id === initialPaper.id) : null;
  const firstPersonalId = personalLibrary.papers[0]?.id;

  useEffect(() => {
    if (authLoading || personalLibrary.loading) return;
    if (user && !personalPaper && firstPersonalId) router.replace(`/papers/${firstPersonalId}`);
  }, [authLoading, firstPersonalId, personalLibrary.loading, personalPaper, router, user]);

  if (authLoading) return <WorkspaceGate message="계정 세션을 확인하는 중…"/>;
  if (user && personalLibrary.loading) return <WorkspaceGate message="내 논문 라이브러리를 불러오는 중…"/>;

  if (user) {
    if (personalPaper) return <WorkspaceShell activePaper={personalPaper} papers={personalLibrary.papers}/>;
    if (firstPersonalId) return <WorkspaceGate message="내 논문 라이브러리로 이동하는 중…"/>;
    return <PersonalLibraryEmpty email={user.email ?? "내 계정"} managerOpen={managerOpen} onManagerOpen={() => setManagerOpen(true)} onManagerClose={() => setManagerOpen(false)}/>;
  }

  return <LoginScreen/>;
}

function WorkspaceShell({ activePaper, papers }: { activePaper: Paper; papers: Paper[] }) {
  const { user } = useAuth();
  const uploadingAreas = useRef(new Set<string>());
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState("");
  const studyState = useStudyState(activePaper.id);
  const { tray } = studyState;
  const [questionHighlights, setQuestionHighlights] = useState<StudyHighlight[]>([]);
  const [questionAreas, setQuestionAreas] = useState<StudyArea[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(420);
  const chatWidthStorageKey = "paper-study-chat-width";

  useEffect(() => { setQuestionHighlights([]); setQuestionAreas([]); }, [activePaper.id]);

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

  useEffect(() => {
    function clampToViewport() {
      setChatWidth((current) => clampChatWidth(current, window.innerWidth, libraryOpen));
    }
    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [libraryOpen]);

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
    studyState.updateTray(updater);
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
    if (user) void persistArea(area);
  }

  function removeArea(id: string) {
    const area = (tray.areas ?? []).find((item) => item.id === id);
    if (user && area) {
      try { queueAreaDeletion(user.id, activePaper.id, area); } catch { /* Local removal remains authoritative. */ }
      void flushAreaDeletionQueue(user.id);
    }
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

  async function useAreaForQuestion(area: StudyArea) {
    let hydrated = area;
    if (!hydrated.imageDataUrl && hydrated.storagePath) {
      try { hydrated = { ...hydrated, imageDataUrl: await loadAreaDataUrl(hydrated.storagePath) }; }
      catch { return; }
    }
    setQuestionAreas((current) => [...current.filter((item) => item.id !== hydrated.id), hydrated].slice(-4));
    setPage(hydrated.page);
  }

  async function persistArea(area: StudyArea) {
    if (!user || !area.imageDataUrl || area.storagePath || uploadingAreas.current.has(area.id)) return;
    uploadingAreas.current.add(area.id);
    try {
      const storagePath = await uploadAreaCrop(user.id, activePaper.id, area);
      updateTray((current) => ({ ...current, areas: (current.areas ?? []).map((item) => item.id === area.id ? { ...item, storagePath, imageDataUrl: undefined } : item) }));
    } catch { /* Pending base64 stays only in local cache and is retried after reconnect. */ }
    finally { uploadingAreas.current.delete(area.id); }
  }

  useEffect(() => {
    if (!user || studyState.status === "offline") return;
    for (const area of tray.areas ?? []) if (area.imageDataUrl && !area.storagePath) void persistArea(area);
    void flushAreaDeletionQueue(user.id);
  // Area uploads are keyed by their stable IDs and retried when sync/network status changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activePaper.id, studyState.status, (tray.areas ?? []).map((area) => `${area.id}:${area.storagePath ?? "pending"}`).join("|")]);

  const selectedText = useMemo(
    () => questionHighlights.map((item) => `[p.${item.page}] ${item.text}`).join("\n\n"),
    [questionHighlights],
  );

  const context = useMemo(() => ({
    paperId: activePaper.id,
    page,
    selectedText,
    selectedAreas: questionAreas.flatMap((area) => area.imageDataUrl ? [{ id: area.id, page: area.page, imageDataUrl: area.imageDataUrl }] : []),
    pageText,
  }), [activePaper.id, page, selectedText, questionAreas, pageText]);

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
      <PaperList papers={papers} activeId={activePaper.id} onClose={() => setLibraryVisibility(false)} />
    </div>}

    <div className="min-h-0 min-w-0">
      <PdfViewer
        paper={activePaper}
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

    {chatOpen && <div className="fixed inset-y-0 right-0 z-50 w-[min(92vw,420px)] min-w-0 shadow-[-24px_0_70px_rgba(0,0,0,.38)] md:relative md:inset-auto md:z-auto md:w-auto md:max-w-none md:shadow-none">
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
        paper={activePaper}
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

    <AccountControl />
    <StudySyncStatusView status={studyState.status} conflict={studyState.conflict} onUseServer={() => void studyState.chooseServerVersion()} onUseDevice={() => void studyState.chooseDeviceVersion()} />
    <StudyTray
      paper={activePaper}
      tray={tray}
      onAddMemo={(text) => updateTray((current) => ({ ...current, memos: [...current.memos, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }] }))}
      onRemove={removeTrayItem}
      onUseArea={useAreaForQuestion}
      noteMarkdown={studyState.noteMarkdown}
      onNoteChange={studyState.updateNote}
    />
  </main>;
}

function WorkspaceGate({ message }: { message: string }) {
  return <main className="grid h-dvh place-items-center bg-[#111] text-white">
    <div id="paper-header-actions" className="fixed left-4 top-4 flex items-center gap-2"/>
    <div className="text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#555] border-t-white"/><p className="mt-4 text-sm text-[var(--muted)]">{message}</p></div>
    <AccountControl/>
  </main>;
}

function LoginScreen() {
  return <main className="grid h-dvh place-items-center bg-[#0b0b0c] text-white">
    <div id="paper-header-actions" className="hidden"/>
    <AccountControl initiallyOpen required/>
  </main>;
}

function PersonalLibraryEmpty({ email, managerOpen, onManagerOpen, onManagerClose }: { email: string; managerOpen: boolean; onManagerOpen: () => void; onManagerClose: () => void }) {
  return <main className="grid h-dvh place-items-center bg-[#111] p-6 text-white">
    <div id="paper-header-actions" className="fixed left-4 top-4 flex items-center gap-2"/>
    <section className="w-full max-w-lg rounded-3xl border border-[var(--line)] bg-black/35 p-7 text-center shadow-2xl">
      <p className="text-[11px] font-semibold tracking-[.14em] text-[var(--accent)]">PERSONAL LIBRARY</p>
      <h1 className="mt-2 text-2xl font-semibold">내 논문 라이브러리가 비어 있습니다</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]"><span className="break-all text-[#ddd]">{email}</span> 계정에는 아직 등록된 논문이 없습니다.</p>
      <button type="button" onClick={onManagerOpen} className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">첫 개인 논문과 PDF 추가</button>
    </section>
    <AccountControl/>
    <LibraryManager open={managerOpen} onClose={onManagerClose}/>
  </main>;
}


function clampChatWidth(value: number, viewportWidth: number, libraryOpen: boolean) {
  const minimum = 300;
  const libraryWidth = libraryOpen && viewportWidth >= 1024 ? 280 : 0;
  const minimumPdfWidth = 320;
  const maximum = Math.max(minimum, Math.min(760, viewportWidth - libraryWidth - minimumPdfWidth));
  return Math.round(Math.max(minimum, Math.min(maximum, value)));
}
