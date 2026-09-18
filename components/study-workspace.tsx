"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { AccountSyncPanel } from "./account/account-sync-panel";
import { PaperList } from "./paper-list/paper-list";
import { PdfViewer } from "./pdf-viewer/pdf-viewer";
import { StudyChat } from "./study-chat/study-chat";
import { PdfSyncPanel } from "./pdf-sync/pdf-sync-panel";
import { StudyTray } from "./study-tray/study-tray";
import type { Paper } from "@/lib/papers/types";
import { emptyStudyTray, type AnnotationColor, type AnnotationKind, type StudyArea, type StudyHighlight, type StudyTrayData } from "@/lib/study-tray/types";
import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";
import { getAccountSyncConfig } from "@/lib/account-sync/config";
import { ACCOUNT_SESSION_EVENT, getStoredAccountSession, resolveAccountSession } from "@/lib/account-sync/auth-client";
import type { AccountSession, AccountSyncStatus } from "@/lib/account-sync/types";
import {
  hasAccountStudySnapshot,
  migrateLegacyStudyStateToAccount,
  persistLocalStudyContent,
  readLocalStudySnapshot,
  markLocalStudySynced,
  writeRemoteStudySnapshot,
  type LocalStudySnapshot,
} from "@/lib/account-sync/local-state";
import { fetchRemoteStudyState, saveRemoteStudyState, StudySyncConflictError } from "@/lib/account-sync/study-state-client";
import { chooseStudySyncAction } from "@/lib/account-sync/sync-resolution";

export function StudyWorkspace({ initialPaper, papers }: { initialPaper: Paper; papers: Paper[] }) {
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState("");
  const [tray, setTray] = useState<StudyTrayData>(emptyStudyTray);
  const [noteMarkdown, setNoteMarkdown] = useState("");
  const [questionHighlights, setQuestionHighlights] = useState<StudyHighlight[]>([]);
  const [questionAreas, setQuestionAreas] = useState<StudyArea[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(420);
  const [accountSession, setAccountSession] = useState<AccountSession | null>(null);
  const syncConfigured = Boolean(getAccountSyncConfig());
  const [syncStatus, setSyncStatus] = useState<AccountSyncStatus>(syncConfigured ? "signed-out" : "local-only");
  const chatWidthStorageKey = "paper-study-chat-width";
  const paperId = initialPaper.id;
  const trayRef = useRef(tray);
  const noteRef = useRef(noteMarkdown);
  const sessionRef = useRef<AccountSession | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { trayRef.current = tray; }, [tray]);
  useEffect(() => { noteRef.current = noteMarkdown; }, [noteMarkdown]);
  useEffect(() => { sessionRef.current = accountSession; }, [accountSession]);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      const next = await resolveAccountSession(getStoredAccountSession());
      if (cancelled) return;
      sessionRef.current = next;
      setAccountSession(next);
      setSyncStatus(syncConfigured ? next ? "pending" : "signed-out" : "local-only");
    }
    void restoreSession();
    const handleSessionChange = () => {
      const next = getStoredAccountSession();
      sessionRef.current = next;
      setAccountSession(next);
    };
    window.addEventListener(ACCOUNT_SESSION_EVENT, handleSessionChange);
    window.addEventListener("storage", handleSessionChange);
    return () => {
      cancelled = true;
      window.removeEventListener(ACCOUNT_SESSION_EVENT, handleSessionChange);
      window.removeEventListener("storage", handleSessionChange);
    };
  }, [syncConfigured]);

  useEffect(() => {
    const snapshot = readLocalStudySnapshot(paperId, accountSession?.user.id);
    applySnapshot(snapshot);
    setQuestionHighlights([]);
    setQuestionAreas([]);
    if (!syncConfigured) setSyncStatus("local-only");
    else if (!accountSession) setSyncStatus("signed-out");
  }, [paperId, accountSession?.user.id, syncConfigured]);

  useEffect(() => {
    if (!syncConfigured || !accountSession) return;
    void reconcileAccountState("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, accountSession?.user.id, syncConfigured]);

  useEffect(() => {
    function retryWhenOnline() {
      if (sessionRef.current) void reconcileAccountState("auto");
    }
    function refreshWhenVisible() {
      if (document.visibilityState === "visible" && sessionRef.current && navigator.onLine) void reconcileAccountState("auto");
    }
    window.addEventListener("online", retryWhenOnline);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

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

  function applySnapshot(snapshot: LocalStudySnapshot) {
    trayRef.current = snapshot.tray;
    noteRef.current = snapshot.noteMarkdown;
    setTray(snapshot.tray);
    setNoteMarkdown(snapshot.noteMarkdown);
  }

  function handleSessionChange(next: AccountSession | null) {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    sessionRef.current = next;
    setAccountSession(next);
    setSyncStatus(syncConfigured ? next ? "pending" : "signed-out" : "local-only");
  }

  async function getValidSession() {
    const current = sessionRef.current;
    const valid = await resolveAccountSession(current);
    if (!valid) {
      handleSessionChange(null);
      return null;
    }
    if (valid.accessToken !== current?.accessToken) {
      sessionRef.current = valid;
      setAccountSession(valid);
    }
    return valid;
  }

  async function reconcileAccountState(mode: "auto" | "pull" | "force-push") {
    if (!syncConfigured) { setSyncStatus("local-only"); return; }
    const session = await getValidSession();
    if (!session) { setSyncStatus("signed-out"); return; }

    const accountId = session.user.id;
    if (!navigator.onLine) {
      if (!hasAccountStudySnapshot(paperId, accountId)) {
        const migrated = migrateLegacyStudyStateToAccount(paperId, accountId);
        if (migrated) applySnapshot(migrated);
      }
      setSyncStatus("pending");
      return;
    }

    setSyncStatus("syncing");
    try {
      const remote = await fetchRemoteStudyState(paperId, session);
      let local = readLocalStudySnapshot(paperId, accountId);

      if (!hasAccountStudySnapshot(paperId, accountId) && !remote) {
        const migrated = migrateLegacyStudyStateToAccount(paperId, accountId);
        if (migrated) {
          local = migrated;
          applySnapshot(migrated);
        }
      }

      if (mode === "pull") {
        if (remote) applyRemote(remote, accountId);
        setSyncStatus("synced");
        return;
      }

      if (mode === "force-push") {
        const saved = await saveRemoteStudyState(paperId, local.tray, local.noteMarkdown, session, remote?.revision ?? null);
        const synced = markLocalStudySynced(paperId, accountId, saved.revision, saved.updatedAt);
        applySnapshot(synced);
        setSyncStatus("synced");
        return;
      }

      const action = chooseStudySyncAction(local, remote);
      if (action === "pull-remote" && remote) {
        applyRemote(remote, accountId);
        setSyncStatus("synced");
        return;
      }
      if (action === "push-local") {
        const saved = await saveRemoteStudyState(paperId, local.tray, local.noteMarkdown, session, local.remoteRevision);
        const synced = markLocalStudySynced(paperId, accountId, saved.revision, saved.updatedAt);
        applySnapshot(synced);
        setSyncStatus("synced");
        return;
      }
      if (action === "conflict") {
        setSyncStatus("conflict");
        return;
      }
      setSyncStatus("synced");
    } catch (caught) {
      if (caught instanceof StudySyncConflictError) setSyncStatus("conflict");
      else {
        console.error("[account-sync] reconcile failed", caught);
        setSyncStatus("error");
      }
    }
  }

  function applyRemote(remote: Awaited<ReturnType<typeof fetchRemoteStudyState>>, accountId: string) {
    if (!remote) return;
    const snapshot = writeRemoteStudySnapshot(paperId, accountId, remote.tray, remote.noteMarkdown, remote.revision, remote.updatedAt);
    applySnapshot(snapshot);
  }

  function queueRemoteSync() {
    if (!syncConfigured || !sessionRef.current) return;
    setSyncStatus("pending");
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => { void syncDirtyLocalState(); }, 900);
  }

  async function syncDirtyLocalState() {
    const session = await getValidSession();
    if (!session) return;
    if (!navigator.onLine) { setSyncStatus("pending"); return; }
    const local = readLocalStudySnapshot(paperId, session.user.id);
    if (!local.dirty) { setSyncStatus("synced"); return; }
    setSyncStatus("syncing");
    try {
      const saved = await saveRemoteStudyState(paperId, local.tray, local.noteMarkdown, session, local.remoteRevision);
      markLocalStudySynced(paperId, session.user.id, saved.revision, saved.updatedAt);
      setSyncStatus("synced");
    } catch (caught) {
      if (caught instanceof StudySyncConflictError) setSyncStatus("conflict");
      else {
        console.error("[account-sync] push failed", caught);
        setSyncStatus("error");
      }
    }
  }

  function persistStudyContent(nextTray: StudyTrayData, nextNote: string) {
    trayRef.current = nextTray;
    noteRef.current = nextNote;
    setTray(nextTray);
    setNoteMarkdown(nextNote);
    persistLocalStudyContent(paperId, sessionRef.current?.user.id, nextTray, nextNote);
    if (sessionRef.current) queueRemoteSync();
    else setSyncStatus(syncConfigured ? "signed-out" : "local-only");
  }

  function updateTray(updater: (current: StudyTrayData) => StudyTrayData) {
    persistStudyContent(updater(trayRef.current), noteRef.current);
  }

  function persistNote(value: string) {
    persistStudyContent(trayRef.current, value);
  }

  function setLibraryVisibility(open: boolean) {
    setLibraryOpen(open);
    try { localStorage.setItem("paper-study-library-open", String(open)); } catch {}
  }

  function setChatVisibility(open: boolean) {
    setChatOpen(open);
    try { localStorage.setItem("paper-study-chat-open", String(open)); } catch {}
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
      setChatWidth(clampChatWidth(startWidth + startX - moveEvent.clientX, window.innerWidth, libraryOpen));
    }
    function stopResize() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      setChatWidth((current) => {
        try { localStorage.setItem(chatWidthStorageKey, String(current)); } catch {}
        return current;
      });
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  }

  function createHighlight(text: string, highlightPage: number, rects: NormalizedHighlightRect[], memo: string, kind: AnnotationKind, color: AnnotationColor) {
    const highlight: StudyHighlight = { id: crypto.randomUUID(), text, page: highlightPage, rects, memo, kind, color, createdAt: new Date().toISOString() };
    updateTray((current) => ({ ...current, highlights: [...current.highlights, highlight] }));
    setQuestionHighlights((current) => [...current.filter((item) => item.id !== highlight.id), highlight]);
    setPage(highlightPage);
  }

  function removeHighlight(id: string) {
    updateTray((current) => ({ ...current, highlights: current.highlights.filter((item) => item.id !== id) }));
    setQuestionHighlights((current) => current.filter((item) => item.id !== id));
  }
  function removeQuestionHighlight(id: string) { setQuestionHighlights((current) => current.filter((item) => item.id !== id)); }

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
  function removeQuestionArea(id: string) { setQuestionAreas((current) => current.filter((item) => item.id !== id)); }
  function clearQuestionAnnotations() { setQuestionHighlights([]); setQuestionAreas([]); }

  function clearPdfAnnotations() {
    updateTray((current) => ({ ...current, highlights: [], areas: [] }));
    setQuestionHighlights([]);
    setQuestionAreas([]);
  }

  function removeTrayItem(kind: keyof StudyTrayData, id: string) {
    if (kind === "areas" || kind === "highlights") return;
    if (kind === "insights") { updateTray((current) => ({ ...current, insights: current.insights.filter((item) => item.id !== id) })); return; }
    if (kind === "memos") updateTray((current) => ({ ...current, memos: current.memos.filter((item) => item.id !== id) }));
  }

  function useAreaForQuestion(area: StudyArea) {
    setQuestionAreas((current) => [...current.filter((item) => item.id !== area.id), area].slice(-4));
    setPage(area.page);
  }

  const selectedText = useMemo(() => questionHighlights.map((item) => `[p.${item.page}] ${item.text}`).join("\n\n"), [questionHighlights]);
  const context = useMemo(() => ({
    paperId,
    page,
    selectedText,
    selectedAreas: questionAreas.map((area) => ({ id: area.id, page: area.page, imageDataUrl: area.imageDataUrl })),
    pageText,
  }), [paperId, page, selectedText, questionAreas, pageText]);

  return <main
    className="study-workspace relative grid h-dvh min-h-0 grid-cols-1 overflow-hidden"
    data-library-open={libraryOpen ? "true" : "false"}
    data-chat-open="false"
    data-chat-drawer-open={chatOpen ? "true" : "false"}
    style={{ "--chat-width": `${chatWidth}px` } as CSSProperties}
  >
    <style>{`
      [aria-label="PDF 뷰어"] > header + div + div:not(.scrollbar) { display: none !important; }
      [aria-label="PDF 뷰어"] button[aria-label="논문 목록 닫기"] { display: none !important; }
    `}</style>

    {libraryOpen && !chatOpen && <button type="button" aria-label="논문 목록 바깥 영역" className="fixed inset-0 z-30 bg-black/55 lg:hidden" onPointerDown={() => setLibraryVisibility(false)} />}
    {libraryOpen && <div className="fixed inset-y-0 left-0 z-40 w-[min(88vw,300px)] min-w-0 lg:static lg:z-auto lg:w-auto">
      <PaperList papers={papers} activeId={paperId} onClose={() => setLibraryVisibility(false)} />
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

    {chatOpen && <div className="fixed inset-y-0 right-0 z-50 w-[min(92vw,420px)] min-w-0 shadow-[-24px_0_70px_rgba(0,0,0,.38)] md:relative md:inset-auto md:z-auto md:w-auto md:max-w-none md:shadow-none">
      <div role="separator" aria-label="질의응답 패널 크기 조절" aria-orientation="vertical" title="드래그하여 질의응답 패널 너비 조절" onPointerDown={beginChatResize} className="absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none md:block">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--line)]" />
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
    <AccountSyncPanel
      configured={syncConfigured}
      session={accountSession}
      syncStatus={syncStatus}
      onSessionChange={handleSessionChange}
      onSyncNow={() => reconcileAccountState("auto")}
      onPullRemote={() => reconcileAccountState("pull")}
      onForcePushLocal={() => reconcileAccountState("force-push")}
    />
    <StudyTray
      paper={initialPaper}
      tray={tray}
      noteMarkdown={noteMarkdown}
      onNoteChange={persistNote}
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
