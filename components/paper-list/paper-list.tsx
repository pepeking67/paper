"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Paper } from "@/lib/papers/types";

export function PaperList({ papers, activeId, onClose }: { papers: Paper[]; activeId: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("All");
  const tags = ["All", ...Array.from(new Set(papers.map((p) => p.tag)))];
  const visible = useMemo(
    () => papers.filter((p) => (tag === "All" || p.tag === tag) && p.title.toLowerCase().includes(query.toLowerCase())),
    [papers, query, tag],
  );

  return <aside className="scrollbar flex h-full max-h-dvh min-h-0 flex-col overflow-hidden border-r border-[var(--line)] p-4" aria-label="논문 탐색">
    <header className="mb-4 flex shrink-0 items-start gap-3 px-1 pt-1">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-[.16em] text-[var(--accent)]">LIBRARY</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-[-.02em] text-[var(--ink)]">Paper Study</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">논문을 읽고, 표시하고, 질문하세요.</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="논문 목록 닫기"
        title="논문 목록 닫기"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-white/[.06] hover:text-white"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/></svg>
      </button>
    </header>

    <label className="sr-only" htmlFor="paper-search">제목 검색</label>
    <input
      id="paper-search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="논문 검색"
      className="w-full shrink-0 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]"
    />

    <div className="my-3 shrink-0">
      <label htmlFor="paper-category" className="mb-1.5 block px-1 text-[11px] font-medium text-[var(--muted)]">카테고리</label>
      <div className="relative">
        <select
          id="paper-category"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          className="w-full appearance-none rounded-xl border border-[var(--line)] bg-white/[.05] px-3 py-2.5 pr-9 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
        >
          {tags.map((item) => <option key={item} value={item} className="bg-[#1c1c1e]">{item === "All" ? "전체 카테고리" : item}</option>)}
        </select>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-[var(--muted)]" strokeWidth="1.8"><path d="m6 8 4 4 4-4"/></svg>
      </div>
    </div>

    <p className="mb-2 shrink-0 px-1 text-[11px] font-medium text-[var(--muted)]">{visible.length} papers</p>
    <nav className="scrollbar grid h-0 min-h-0 flex-1 touch-pan-y content-start gap-1 overflow-y-auto overscroll-y-contain pr-1" aria-label="논문 목록">
      {visible.map((paper) => {
        const active = activeId === paper.id;
        return <Link
          key={paper.id}
          href={`/papers/${paper.id}`}
          className={`group rounded-xl border p-3 ${active ? "border-[#0a84ff]/40 bg-[#0a84ff]/15 shadow-[inset_0_0_0_1px_rgba(10,132,255,.06)]" : "border-transparent hover:bg-white/[.055]"}`}
        >
          <div className="flex gap-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${paper.done ? "bg-[#30d158]" : "border border-[#8e8e93]"}`} aria-label={paper.done ? "완료" : "진행 중"}/>
            <span className={`text-sm leading-snug tracking-[-.01em] ${active ? "font-medium text-white" : "text-[#e5e5ea]"}`}>{paper.title}</span>
          </div>
          <p className="mt-2 pl-[18px] text-[11px] text-[var(--muted)]">{paper.id} · {paper.year ?? "연도 미상"}</p>
        </Link>;
      })}
    </nav>
  </aside>;
}
