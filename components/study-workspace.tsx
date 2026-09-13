"use client";
import { useMemo, useState } from "react";
import { PaperList } from "./paper-list/paper-list";
import { PdfViewer } from "./pdf-viewer/pdf-viewer";
import { StudyChat } from "./study-chat/study-chat";
import { PdfSyncPanel } from "./pdf-sync/pdf-sync-panel";
import type { Paper } from "@/lib/papers/types";

export function StudyWorkspace({ initialPaper, papers }: { initialPaper: Paper; papers: Paper[] }) {
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState("");
  const [pageText, setPageText] = useState("");
  const context = useMemo(() => ({ paperId: initialPaper.id, page, selectedText: selection, pageText }), [initialPaper.id, page, selection, pageText]);
  return <main className="grid min-h-dvh grid-cols-1 bg-[#090c0b] lg:h-dvh lg:grid-cols-[280px_minmax(420px,1fr)_360px] lg:overflow-hidden">
    <PaperList papers={papers} activeId={initialPaper.id} />
    <PdfViewer paper={initialPaper} page={page} onPageChange={setPage} onSelectionChange={setSelection} onPageTextChange={setPageText} />
    <StudyChat paper={initialPaper} context={context} onClearSelection={() => setSelection("")} />
    <PdfSyncPanel papers={papers} />
  </main>;
}
