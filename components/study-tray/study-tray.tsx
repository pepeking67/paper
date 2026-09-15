"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatTurn } from "@/lib/ai/provider";
import type { Paper } from "@/lib/papers/types";
import { buildStudyPacket } from "@/lib/study-tray/build-packet";
import type { StudyArea, StudyTrayData } from "@/lib/study-tray/types";

export function StudyTray({
  paper,
  tray,
  chatHistory,
  onAddMemo,
  onRemove,
  onUseArea,
}: {
  paper: Paper;
  tray: StudyTrayData;
  chatHistory: ChatTurn[];
  onAddMemo: (text: string) => void;
  onRemove: (kind: keyof StudyTrayData, id: string) => void;
  onUseArea: (area: StudyArea) => void;
}) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [packet, setPacket] = useState("");
  const [copied, setCopied] = useState(false);
  const [triggerHost, setTriggerHost] = useState<HTMLElement | null>(null);
  const conversationCount = useMemo(() => chatHistory.filter((turn) => turn.role === "user").length, [chatHistory]);
  const areas = tray.areas ?? [];
  const trayCount = tray.highlights.length + areas.length + tray.insights.length + tray.memos.length;
  const total = trayCount + conversationCount;

  useEffect(() => { setTriggerHost(document.getElementById("paper-header-actions")); }, []);

  async function copyPacket() {
    const value = buildStudyPacket(paper, tray, chatHistory);
    setPacket(value);
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <>
    {triggerHost && createPortal(<button onClick={() => setOpen(true)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs hover:bg-[#222]">Study Tray · {total}</button>, triggerHost)}
    {open && <div className="fixed inset-0 z-40 flex justify-end bg-black/70" role="dialog" aria-modal="true" aria-labelledby="study-tray-title">
      <section className="scrollbar h-full w-full max-w-xl overflow-y-auto border-l border-[var(--line)] bg-black p-5 text-white">
        <header className="flex items-start justify-between"><div><p className="text-xs tracking-widest text-[var(--muted)]">CURRENT PAPER</p><h2 id="study-tray-title" className="mt-1 text-xl font-semibold">Study Tray</h2><p className="mt-1 text-xs text-[var(--muted)]">{paper.title}</p></div><button onClick={() => setOpen(false)} aria-label="닫기" className="text-2xl">×</button></header>
        <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!memo.trim()) return; onAddMemo(memo.trim()); setMemo(""); }}><label htmlFor="tray-memo" className="sr-only">자유 메모</label><textarea id="tray-memo" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="자유 메모 추가…" rows={2} className="min-w-0 flex-1 resize-none rounded-lg border border-[var(--line)] bg-[#111] p-3 text-sm"/><button className="rounded-lg bg-white px-4 text-sm font-medium text-black">추가</button></form>

        <TraySection title={`Annotations (${tray.highlights.length})`}>{tray.highlights.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("highlights", item.id)}><p className="text-xs text-[var(--muted)]">Page {item.page} · {(item.kind ?? "highlight") === "underline" ? "Underline" : "Highlight"} · {item.color ?? "yellow"}</p><p className="mt-2 whitespace-pre-wrap text-sm">{item.text}</p>{item.memo && <p className="mt-2 border-l border-white pl-3 text-sm text-[#bbb]">내 메모: {item.memo}</p>}</TrayItem>)}</TraySection>

        <TraySection title={`Areas (${areas.length})`}>
          {areas.length === 0 && <p className="rounded-lg border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">수식·그림·표를 `영역` 도구로 사각형 선택하면 여기에 저장됩니다.</p>}
          {areas.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("areas", item.id)}>
            <p className="text-xs text-[var(--muted)]">Page {item.page} · Area annotation</p>
            <img src={item.imageDataUrl} alt={`Page ${item.page}에서 선택한 PDF 영역`} className="mt-2 max-h-56 w-full rounded border border-[#333] bg-white object-contain"/>
            {item.memo && <p className="mt-2 border-l border-white pl-3 text-sm text-[#bbb]">내 메모: {item.memo}</p>}
            <button type="button" onClick={() => onUseArea(item)} className="mt-3 rounded border border-[var(--line)] px-2.5 py-1.5 text-xs hover:bg-white hover:text-black">질문에 사용</button>
          </TrayItem>)}
        </TraySection>

        <TraySection title={`Study Q&A (${conversationCount})`}>
          {conversationCount === 0 && <p className="rounded-lg border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">아직 이 논문에서 나눈 질문과 답변이 없습니다.</p>}
          {chatHistory.map((turn, index) => turn.role === "user" ? <article key={`chat-${index}`} className="rounded-lg border border-[var(--line)] bg-[#0b0b0b] p-3"><p className="text-sm font-semibold">Q. {turn.content}</p>{chatHistory[index + 1]?.role === "assistant" ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#ccc]">{chatHistory[index + 1].content}</p> : <p className="mt-2 text-xs text-[var(--muted)]">답변 없음</p>}</article> : null)}
        </TraySection>

        <TraySection title={`Saved Insights (${tray.insights.length})`}>{tray.insights.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("insights", item.id)}><p className="text-xs text-[var(--muted)]">Page {item.page} · 중요 Q&A</p><p className="mt-2 text-sm font-semibold">Q. {item.question}</p><p className="mt-2 whitespace-pre-wrap text-sm text-[#ccc]">{item.answer}</p></TrayItem>)}</TraySection>
        <TraySection title={`Memos (${tray.memos.length})`}>{tray.memos.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("memos", item.id)}><p className="whitespace-pre-wrap text-sm">{item.text}</p></TrayItem>)}</TraySection>

        <div className="sticky bottom-0 mt-6 border-t border-[var(--line)] bg-black py-4">
          <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">전체 Q&A와 Annotation을 함께 넣습니다. Area 이미지는 앱 안의 Gemini 질문에는 실제 이미지로 전달되며, 복사되는 텍스트 프롬프트에는 페이지/영역 정보만 포함됩니다.</p>
          <button disabled={!total} onClick={() => void copyPacket()} className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black disabled:opacity-40">{copied ? "복사됨" : "ChatGPT용 학습 정리 프롬프트 생성·복사"}</button>
          {packet && <details className="mt-3"><summary className="cursor-pointer text-xs text-[var(--muted)]">생성된 Markdown 미리보기</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[#111] p-3 text-xs">{packet}</pre></details>}
        </div>
      </section>
    </div>}
  </>;
}

function TraySection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-6"><h3 className="border-b border-[var(--line)] pb-2 font-semibold">{title}</h3><div className="mt-3 space-y-2">{children}</div></section>; }
function TrayItem({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) { return <article className="relative rounded-lg border border-[var(--line)] bg-[#0b0b0b] p-3 pr-10">{children}<button onClick={onRemove} aria-label="저장 항목 삭제" className="absolute right-3 top-2 text-lg text-[var(--muted)]">×</button></article>; }
