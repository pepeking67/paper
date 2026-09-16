"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Paper } from "@/lib/papers/types";

export function PaperList({ papers, activeId }: { papers: Paper[]; activeId: string }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("All");
  const tags = ["All", ...Array.from(new Set(papers.map((p) => p.tag)))];
  const visible = useMemo(
    () => papers.filter((p) => (tag === "All" || p.tag === tag) && p.title.toLowerCase().includes(query.toLowerCase())),
    [papers, query, tag],
  );

  return <aside className="scrollbar border-b border-[var(--line)] p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r" aria-label="논문 탐색">
    <header className="mb-5 px-1 pt-1">
      <p className="text-[11px] font-semibold tracking-[.16em] text-[var(--accent)]">LIBRARY</p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-[-.02em] text-[var(--ink)]">Paper Study</h1>
      <p className="mt-1 text-xs text-[var(--muted)]">논문을 읽고, 표시하고, 질문하세요.</p>
    </header>

    <label className="sr-only" htmlFor="paper-search">제목 검색</label>
    <input
      id="paper-search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="논문 검색"
      className="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]"
    />

    <div className="scrollbar my-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="태그 필터">
      {tags.map((item) => <button
        key={item}
        onClick={() => setTag(item)}
        aria-pressed={tag === item}
        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tag === item ? "text-white" : "bg-white/[.04] text-[var(--muted)] hover:bg-white/[.08]"}`}
      >{item}</button>)}
    </div>

    <p className="mb-2 px-1 text-[11px] font-medium text-[var(--muted)]">{visible.length} papers</p>
    <nav className="grid max-h-72 gap-1 overflow-y-auto lg:max-h-none">
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
