"use client";
import { useEffect, useMemo, useState } from "react";
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
  const storageKey = `paper-study-tray:${initialPaper.id}`;
  useEffect(() => {
    try { setTray(JSON.parse(localStorage.getItem(storageKey) ?? "null") ?? emptyStudyTray()); }
    catch { setTray(emptyStudyTray()); }
  }, [storageKey]);
  function updateTray(updater: (current: StudyTrayData) => StudyTrayData) {
    setTray((current) => { const next = updater(current); localStorage.setItem(storageKey, JSON.stringify(next)); return next; });
  }
  const context = useMemo(() => ({ paperId: initialPaper.id, page, selectedText: selection, pageText }), [initialPaper.id, page, selection, pageText]);
  return <main className="grid min-h-dvh grid-cols-1 bg-black lg:h-dvh lg:grid-cols-[280px_minmax(420px,1fr)_360px] lg:overflow-hidden">
    <PaperList papers={papers} activeId={initialPaper.id} />
    <PdfViewer paper={initialPaper} page={page} onPageChange={setPage} onSelectionChange={setSelection} onPageTextChange={setPageText} onSaveHighlight={(text, highlightPage, memo) => updateTray((current) => ({ ...current, highlights: [...current.highlights, { id: crypto.randomUUID(), text, page: highlightPage, memo, createdAt: new Date().toISOString() }] }))} />
    <StudyChat paper={initialPaper} context={context} onSaveInsight={(question, answer) => updateTray((current) => ({ ...current, insights: [...current.insights, { id: crypto.randomUUID(), question, answer, page, sourceText: selection || undefined, createdAt: new Date().toISOString() }] }))} />
    <PdfSyncPanel papers={papers} />
    <StudyTray paper={initialPaper} tray={tray} onAddMemo={(text) => updateTray((current) => ({ ...current, memos: [...current.memos, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }] }))} onRemove={(kind, id) => updateTray((current) => ({ ...current, [kind]: current[kind].filter((item) => item.id !== id) }))} />
  </main>;
}
