"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import type { Paper } from "@/lib/papers/types";
import { buildStudyPacket } from "@/lib/study-tray/build-packet";
import type { StudyArea, StudyTrayData } from "@/lib/study-tray/types";
import { useHydratedAreas } from "@/lib/area-assets/use-hydrated-areas";
import { paperUiStorageKey, readPaperUiState, updatePaperUiState } from "@/lib/workspace-state/local-ui-state";

export function StudyTray({
  paper,
  storageScope,
  tray,
  onAddMemo,
  onRemove,
  onUseArea,
}: {
  paper: Paper;
  storageScope: string;
  tray: StudyTrayData;
  onAddMemo: (text: string) => void;
  onRemove: (kind: keyof StudyTrayData, id: string) => void;
  onUseArea: (area: StudyArea) => void;
}) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [packet, setPacket] = useState("");
  const [copied, setCopied] = useState(false);
  const [triggerHost, setTriggerHost] = useState<HTMLElement | null>(null);
  const paperUiKey = paperUiStorageKey(storageScope, paper.id);
  const areas = useHydratedAreas(tray.areas ?? []);
  const hydratedTray = { ...tray, areas };
  const studyAnnotations = tray.highlights.filter((item) => item.kind !== "dictionary");
  const total = studyAnnotations.length + areas.length + tray.insights.length + tray.memos.length;

  const setTrayVisibility = useCallback((next: boolean) => {
    setOpen(next);
    updatePaperUiState(storageScope, paper.id, { studyTrayOpen: next });
  }, [paper.id, storageScope]);

  const updateMemoDraft = useCallback((value: string) => {
    setMemo(value);
    updatePaperUiState(storageScope, paper.id, { studyTrayMemoDraft: value });
  }, [paper.id, storageScope]);

  useEffect(() => { setTriggerHost(document.getElementById("study-tray-actions")); }, []);

  useEffect(() => {
    const stored = readPaperUiState(storageScope, paper.id);
    setOpen(stored.studyTrayOpen);
    setMemo(stored.studyTrayMemoDraft);
  }, [paper.id, paperUiKey, storageScope]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTrayVisibility(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setTrayVisibility]);

  async function copyPacket() {
    const value = buildStudyPacket(paper, hydratedTray);
    setPacket(value);
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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

        <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!memo.trim()) return; onAddMemo(memo.trim()); updateMemoDraft(""); }}><label htmlFor="tray-memo" className="sr-only">자유 메모</label><textarea id="tray-memo" value={memo} onChange={(event) => updateMemoDraft(event.target.value)} placeholder="자유 메모 추가…" rows={2} className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--line)] bg-[#111] p-3 text-sm"/><button className="rounded-xl bg-white px-4 text-sm font-medium text-black">추가</button></form>

        <TraySection title={`Annotations (${studyAnnotations.length})`}>
          {studyAnnotations.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("highlights", item.id)}>
            <p className="text-xs text-[var(--muted)]">Page {item.page} · {item.kind === "text" ? "Text memo" : (item.kind ?? "highlight") === "underline" ? "Underline" : "Highlight"} · {item.color ?? "yellow"}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{item.text}</p>
            {item.memo && <p className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-sm text-[#bbb]">내 메모: {item.memo}</p>}
          </TrayItem>)}
        </TraySection>

        <TraySection title={`Areas (${areas.length})`}>
          {areas.length === 0 && <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">수식·그림·표를 `영역` 도구로 사각형 선택하면 여기에 저장됩니다.</p>}
          {areas.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("areas", item.id)}>
            <p className="text-xs text-[var(--muted)]">Page {item.page} · Area annotation</p>
            {item.imageDataUrl ? <img src={item.imageDataUrl} alt={`Page ${item.page}에서 선택한 PDF 영역`} className="mt-2 max-h-56 w-full rounded-xl border border-[var(--line)] bg-white object-contain"/> : <div className="mt-2 rounded-xl border border-dashed border-[var(--line)] p-4 text-xs text-[var(--muted)]">영역 이미지를 Storage에서 불러오는 중…</div>}
            {item.memo && <p className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-sm text-[#bbb]">내 메모: {item.memo}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => onUseArea(item)} className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs hover:bg-white/5">질문에 사용</button>
            </div>
          </TrayItem>)}
        </TraySection>

        <TraySection title={`Saved Insights (${tray.insights.length})`}>
          {tray.insights.length === 0 && <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">채팅 답변은 자동으로 들어오지 않습니다. 남기고 싶은 Q&A에서 Save Insight를 눌러야 여기에 저장됩니다.</p>}
          {tray.insights.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("insights", item.id)}><p className="text-xs text-[var(--muted)]">Page {item.page} · 중요 Q&A</p><p className="mt-2 text-sm font-semibold">Q. {item.question}</p><div className="mt-3"><MarkdownContent content={item.answer} compact /></div></TrayItem>)}
        </TraySection>
        <TraySection title={`Memos (${tray.memos.length})`}>{tray.memos.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("memos", item.id)}><p className="whitespace-pre-wrap text-sm">{item.text}</p></TrayItem>)}</TraySection>

        <div className="sticky bottom-0 mt-6 border-t border-[var(--line)] bg-[rgba(28,28,30,.94)] py-4 backdrop-blur-xl">
          <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">외부 ChatGPT용 프롬프트에는 Annotation, 메모, 영역 정보와 직접 Save Insight 한 Q&A만 포함됩니다.</p>
          <button disabled={!total} onClick={() => void copyPacket()} className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-40">{copied ? "복사됨" : "ChatGPT용 학습 정리 프롬프트 복사"}</button>
          {packet && <details className="mt-3"><summary className="cursor-pointer text-xs text-[var(--muted)]">생성된 프롬프트 미리보기</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[#111] p-3 text-xs">{packet}</pre></details>}
        </div>
      </section>
    </div>}
  </>;
}

function TraySection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-6"><h3 className="border-b border-[var(--line)] pb-2 font-semibold">{title}</h3><div className="mt-3 space-y-2">{children}</div></section>; }
function TrayItem({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) { return <article className={`relative rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,.035)] p-3 ${onRemove ? "pr-10" : ""}`}>{children}{onRemove && <button onClick={onRemove} aria-label="저장 항목 삭제" className="absolute right-3 top-2 text-lg text-[var(--muted)]">×</button>}</article>; }
