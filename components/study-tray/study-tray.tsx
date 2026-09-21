"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import { NotionNoteEditor } from "@/components/study-note/notion-note-editor";
import type { Paper } from "@/lib/papers/types";
import { buildStudyPacket } from "@/lib/study-tray/build-packet";
import type { StudyArea, StudyTrayData } from "@/lib/study-tray/types";
import { useHydratedAreas } from "@/lib/area-assets/use-hydrated-areas";
import { useAuth } from "@/components/auth/auth-provider";
import { paperUiStorageKey, readPaperUiState, updatePaperUiState } from "@/lib/workspace-state/local-ui-state";

export function StudyTray({
  paper,
  storageScope,
  tray,
  onAddMemo,
  onRemove,
  onUseArea,
  noteMarkdown,
  onNoteChange,
}: {
  paper: Paper;
  storageScope: string;
  tray: StudyTrayData;
  onAddMemo: (text: string) => void;
  onRemove: (kind: keyof StudyTrayData, id: string) => void;
  onUseArea: (area: StudyArea) => void;
  noteMarkdown: string;
  onNoteChange: (value: string) => void;
}) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [packet, setPacket] = useState("");
  const [copied, setCopied] = useState(false);
  const [triggerHost, setTriggerHost] = useState<HTMLElement | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [noteCopied, setNoteCopied] = useState(false);
  const paperUiKey = paperUiStorageKey(storageScope, paper.id);
  const areas = useHydratedAreas(tray.areas ?? []);
  const hydratedTray = { ...tray, areas };
  const embeddedAreas = areas.filter((area): area is StudyArea & { imageDataUrl: string } => typeof area.imageDataUrl === "string");
  const total = tray.highlights.length + areas.length + tray.insights.length + tray.memos.length;

  const setTrayVisibility = useCallback((next: boolean) => {
    setOpen(next);
    updatePaperUiState(storageScope, paper.id, { studyTrayOpen: next });
  }, [paper.id, storageScope]);

  const setNoteVisibility = useCallback((next: boolean) => {
    setNoteOpen(next);
    updatePaperUiState(storageScope, paper.id, { studyNoteOpen: next });
  }, [paper.id, storageScope]);

  const updateMemoDraft = useCallback((value: string) => {
    setMemo(value);
    updatePaperUiState(storageScope, paper.id, { studyTrayMemoDraft: value });
  }, [paper.id, storageScope]);

  useEffect(() => { setTriggerHost(document.getElementById("study-tray-actions")); }, []);

  useEffect(() => {
    const stored = readPaperUiState(storageScope, paper.id);
    setOpen(stored.studyTrayOpen);
    setNoteOpen(stored.studyNoteOpen);
    setMemo(stored.studyTrayMemoDraft);
    setNoteError("");
  }, [paper.id, paperUiKey, storageScope]);

  useEffect(() => {
    if (!open && !noteOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (noteOpen) setNoteVisibility(false);
        else setTrayVisibility(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [noteOpen, open, setNoteVisibility, setTrayVisibility]);

  async function copyPacket() {
    const value = buildStudyPacket(paper, hydratedTray);
    setPacket(value);
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function persistNote(value: string) {
    onNoteChange(value);
  }

  async function generateStudyNote() {
    if (!total || noteLoading) return;
    setNoteLoading(true);
    setNoteError("");
    try {
      if (!session?.access_token) throw new Error("로그인 세션을 확인하지 못했습니다. 다시 로그인하세요.");
      const response = await fetch("/api/study-note", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ paperId: paper.id, tray: hydratedTray }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.code ? `[${data.code}] ` : ""}${data.error ?? "학습 노트 생성 실패"}`);
      if (typeof data.markdown !== "string" || !data.markdown.trim()) throw new Error("빈 학습 노트가 반환되었습니다.");
      persistNote(data.markdown.trim());
      setNoteVisibility(true);
    } catch (caught) {
      setNoteError(caught instanceof Error ? caught.message : "학습 노트 생성 실패");
    } finally {
      setNoteLoading(false);
    }
  }

  async function copyNote() {
    if (!noteMarkdown) return;
    await navigator.clipboard.writeText(noteMarkdown);
    setNoteCopied(true);
    window.setTimeout(() => setNoteCopied(false), 1800);
  }

  return <>
    {triggerHost && createPortal(<button onClick={() => setTrayVisibility(true)} className="h-7 rounded-md border border-[var(--line)] px-2 text-[11px] hover:bg-white/5">Study Tray · {total}</button>, triggerHost)}
    {open && <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-tray-title"
      onPointerDown={(event) => { if (event.target === event.currentTarget) setTrayVisibility(false); }}
    >
      <section className="scrollbar h-full w-full max-w-xl overflow-y-auto border-l border-[var(--line)] bg-black p-5 text-white">
        <header className="flex items-start justify-between"><div><p className="text-xs tracking-widest text-[var(--muted)]">CURRENT PAPER</p><h2 id="study-tray-title" className="mt-1 text-xl font-semibold">Study Tray</h2><p className="mt-1 text-xs text-[var(--muted)]">{paper.title}</p></div><button onClick={() => setTrayVisibility(false)} aria-label="닫기" className="text-2xl">×</button></header>

        <section className="mt-5 rounded-2xl border border-[var(--line)] bg-[rgba(255,255,255,.045)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold text-[var(--accent)]">STUDY NOTE</p><h3 className="mt-1 font-semibold">논문 순서대로 학습 노트 정리</h3><p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">형광펜·밑줄, 메모, 영역 이미지와 직접 Save Insight 한 Q&A만 사용해 Introduction → Model/Architecture → Experiments → Limitations 등 논문 흐름대로 재구성합니다.</p></div>
            {noteMarkdown && <button type="button" onClick={() => setNoteVisibility(true)} className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5">노트 열기</button>}
          </div>
          <button disabled={!total || noteLoading} type="button" onClick={() => void generateStudyNote()} className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{noteLoading ? "학습 노트 생성 중…" : noteMarkdown ? "학습 노트 다시 생성" : "학습 노트 생성"}</button>
          {noteError && <p role="alert" className="mt-3 rounded-lg border border-[var(--danger)]/60 bg-[rgba(255,69,58,.08)] p-2.5 text-xs">{noteError}</p>}
        </section>

        <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!memo.trim()) return; onAddMemo(memo.trim()); updateMemoDraft(""); }}><label htmlFor="tray-memo" className="sr-only">자유 메모</label><textarea id="tray-memo" value={memo} onChange={(event) => updateMemoDraft(event.target.value)} placeholder="자유 메모 추가…" rows={2} className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--line)] bg-[#111] p-3 text-sm"/><button className="rounded-xl bg-white px-4 text-sm font-medium text-black">추가</button></form>

        <TraySection title={`Annotations (${tray.highlights.length})`}>
          {tray.highlights.map((item) => <TrayItem key={item.id}>
            <p className="text-xs text-[var(--muted)]">Page {item.page} · {(item.kind ?? "highlight") === "underline" ? "Underline" : "Highlight"} · {item.color ?? "yellow"}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{item.text}</p>
            {item.memo && <p className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-sm text-[#bbb]">내 메모: {item.memo}</p>}
            <p className="mt-2 text-[10px] text-[var(--muted)]">삭제는 PDF의 지우개 도구에서만 할 수 있습니다.</p>
          </TrayItem>)}
        </TraySection>

        <TraySection title={`Areas (${areas.length})`}>
          {areas.length === 0 && <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">수식·그림·표를 `영역` 도구로 사각형 선택하면 여기에 저장됩니다.</p>}
          {areas.map((item) => <TrayItem key={item.id}>
            <p className="text-xs text-[var(--muted)]">Page {item.page} · Area annotation</p>
            {item.imageDataUrl ? <img src={item.imageDataUrl} alt={`Page ${item.page}에서 선택한 PDF 영역`} className="mt-2 max-h-56 w-full rounded-xl border border-[var(--line)] bg-white object-contain"/> : <div className="mt-2 rounded-xl border border-dashed border-[var(--line)] p-4 text-xs text-[var(--muted)]">영역 이미지를 Storage에서 불러오는 중…</div>}
            {item.memo && <p className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-sm text-[#bbb]">내 메모: {item.memo}</p>}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => onUseArea(item)} className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs hover:bg-white/5">질문에 사용</button>
              <span className="text-[10px] text-[var(--muted)]">삭제는 PDF 지우개에서</span>
            </div>
          </TrayItem>)}
        </TraySection>

        <TraySection title={`Saved Insights (${tray.insights.length})`}>
          {tray.insights.length === 0 && <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">채팅 답변은 자동으로 들어오지 않습니다. 남기고 싶은 Q&A에서 Save Insight를 눌러야 여기에 저장되고 학습 노트에도 반영됩니다.</p>}
          {tray.insights.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("insights", item.id)}><p className="text-xs text-[var(--muted)]">Page {item.page} · 중요 Q&A</p><p className="mt-2 text-sm font-semibold">Q. {item.question}</p><div className="mt-3"><MarkdownContent content={item.answer} compact /></div></TrayItem>)}
        </TraySection>
        <TraySection title={`Memos (${tray.memos.length})`}>{tray.memos.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("memos", item.id)}><p className="whitespace-pre-wrap text-sm">{item.text}</p></TrayItem>)}</TraySection>

        <div className="sticky bottom-0 mt-6 border-t border-[var(--line)] bg-[rgba(28,28,30,.94)] py-4 backdrop-blur-xl">
          <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">외부 ChatGPT용 프롬프트에도 전체 채팅이 아니라 Annotation, 메모, 영역 정보와 직접 Save Insight 한 Q&A만 포함됩니다.</p>
          <button disabled={!total} onClick={() => void copyPacket()} className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-40">{copied ? "복사됨" : "ChatGPT용 학습 정리 프롬프트 복사"}</button>
          {packet && <details className="mt-3"><summary className="cursor-pointer text-xs text-[var(--muted)]">생성된 프롬프트 미리보기</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[#111] p-3 text-xs">{packet}</pre></details>}
        </div>
      </section>
    </div>}

    {noteOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="study-note-title" onPointerDown={(event) => { if (event.target === event.currentTarget) setNoteVisibility(false); }}>
      <section className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-[var(--line-strong)] bg-[rgba(28,28,30,.98)] shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold tracking-[.12em] text-[var(--accent)]">STUDY NOTE</p><h2 id="study-note-title" className="truncate text-base font-semibold">{paper.title}</h2></div>
          <span className="hidden items-center gap-1.5 rounded-lg bg-white/[.04] px-2.5 py-1.5 text-[10px] text-[var(--muted)] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#30d158]"/>보이는 그대로 편집 · 자동 저장</span>
          <button type="button" onClick={() => void copyNote()} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-white/5">{noteCopied ? "복사됨" : "Markdown 복사"}</button>
          <button type="button" onClick={() => setNoteVisibility(false)} aria-label="학습 노트 닫기" className="h-8 w-8 rounded-full text-xl text-[var(--muted)] hover:bg-white/5">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <NotionNoteEditor value={noteMarkdown} areas={embeddedAreas} onChange={persistNote} />
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-2.5 text-[11px] text-[var(--muted)]"><span>블록을 클릭하면 그 자리에서 바로 수정됩니다. 이미지도 화면에서 직접 크기를 조절할 수 있습니다.</span><button disabled={noteLoading} type="button" onClick={() => void generateStudyNote()} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)]">{noteLoading ? "재생성 중…" : "자료에서 다시 생성"}</button></footer>
      </section>
    </div>}
  </>;
}

function TraySection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-6"><h3 className="border-b border-[var(--line)] pb-2 font-semibold">{title}</h3><div className="mt-3 space-y-2">{children}</div></section>; }
function TrayItem({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) { return <article className={`relative rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,.035)] p-3 ${onRemove ? "pr-10" : ""}`}>{children}{onRemove && <button onClick={onRemove} aria-label="저장 항목 삭제" className="absolute right-3 top-2 text-lg text-[var(--muted)]">×</button>}</article>; }
