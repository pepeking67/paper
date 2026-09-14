"use client";

import { useState } from "react";
import type { Paper } from "@/lib/papers/types";
import { buildStudyPacket } from "@/lib/study-tray/build-packet";
import type { StudyTrayData } from "@/lib/study-tray/types";

export function StudyTray({ paper, tray, onAddMemo, onRemove }: { paper: Paper; tray: StudyTrayData; onAddMemo: (text: string) => void; onRemove: (kind: keyof StudyTrayData, id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [packet, setPacket] = useState("");
  const [copied, setCopied] = useState(false);
  const total = tray.highlights.length + tray.insights.length + tray.memos.length;

  async function copyPacket() {
    const value = buildStudyPacket(paper, tray);
    setPacket(value);
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-20 rounded-full border border-white bg-black px-4 py-2 text-sm text-white shadow-xl">Study Tray · {total}</button>
    {open && <div className="fixed inset-0 z-40 flex justify-end bg-black/70" role="dialog" aria-modal="true" aria-labelledby="study-tray-title">
      <section className="scrollbar h-full w-full max-w-xl overflow-y-auto border-l border-[var(--line)] bg-black p-5 text-white">
        <header className="flex items-start justify-between"><div><p className="text-xs tracking-widest text-[var(--muted)]">CURRENT PAPER</p><h2 id="study-tray-title" className="mt-1 text-xl font-semibold">Study Tray</h2><p className="mt-1 text-xs text-[var(--muted)]">{paper.title}</p></div><button onClick={() => setOpen(false)} aria-label="닫기" className="text-2xl">×</button></header>
        <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!memo.trim()) return; onAddMemo(memo.trim()); setMemo(""); }}><label htmlFor="tray-memo" className="sr-only">자유 메모</label><textarea id="tray-memo" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="자유 메모 추가…" rows={2} className="min-w-0 flex-1 resize-none rounded-lg border border-[var(--line)] bg-[#111] p-3 text-sm"/><button className="rounded-lg bg-white px-4 text-sm font-medium text-black">추가</button></form>
        <TraySection title={`Highlights (${tray.highlights.length})`}>{tray.highlights.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("highlights", item.id)}><p className="text-xs text-[var(--muted)]">Page {item.page}</p><p className="mt-2 whitespace-pre-wrap text-sm">{item.text}</p>{item.memo && <p className="mt-2 border-l border-white pl-3 text-sm text-[#bbb]">내 메모: {item.memo}</p>}</TrayItem>)}</TraySection>
        <TraySection title={`AI Insights (${tray.insights.length})`}>{tray.insights.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("insights", item.id)}><p className="text-xs text-[var(--muted)]">Page {item.page}</p><p className="mt-2 text-sm font-semibold">Q. {item.question}</p><p className="mt-2 whitespace-pre-wrap text-sm text-[#ccc]">{item.answer}</p></TrayItem>)}</TraySection>
        <TraySection title={`Memos (${tray.memos.length})`}>{tray.memos.map((item) => <TrayItem key={item.id} onRemove={() => onRemove("memos", item.id)}><p className="whitespace-pre-wrap text-sm">{item.text}</p></TrayItem>)}</TraySection>
        <div className="sticky bottom-0 mt-6 border-t border-[var(--line)] bg-black py-4"><button disabled={!total} onClick={() => void copyPacket()} className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black disabled:opacity-40">{copied ? "복사됨" : "ChatGPT용 정리 생성·복사"}</button>{packet && <details className="mt-3"><summary className="cursor-pointer text-xs text-[var(--muted)]">생성된 Markdown 미리보기</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[#111] p-3 text-xs">{packet}</pre></details>}</div>
      </section>
    </div>}
  </>;
}

function TraySection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-6"><h3 className="border-b border-[var(--line)] pb-2 font-semibold">{title}</h3><div className="mt-3 space-y-2">{children}</div></section>; }
function TrayItem({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) { return <article className="relative rounded-lg border border-[var(--line)] bg-[#0b0b0b] p-3 pr-10">{children}<button onClick={onRemove} aria-label="저장 항목 삭제" className="absolute right-3 top-2 text-lg text-[var(--muted)]">×</button></article>; }
