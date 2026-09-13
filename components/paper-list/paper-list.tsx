"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Paper } from "@/lib/papers/types";

export function PaperList({ papers, activeId }: { papers: Paper[]; activeId: string }) {
  const [query, setQuery] = useState(""); const [tag, setTag] = useState("All");
  const tags = ["All", ...Array.from(new Set(papers.map((p) => p.tag)))];
  const visible = useMemo(() => papers.filter((p) => (tag === "All" || p.tag === tag) && p.title.toLowerCase().includes(query.toLowerCase())), [papers, query, tag]);
  return <aside className="scrollbar border-b border-[var(--line)] bg-black p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r" aria-label="논문 탐색">
    <header className="mb-5"><p className="text-xs font-semibold tracking-[.18em] text-[var(--accent)]">PERSONAL LIBRARY</p><h1 className="mt-1 text-xl font-semibold">Paper Study</h1></header>
    <label className="sr-only" htmlFor="paper-search">제목 검색</label><input id="paper-search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="제목 검색…" className="w-full rounded-lg border border-[var(--line)] bg-[#111] px-3 py-2 text-sm placeholder:text-[#777]" />
    <div className="scrollbar my-3 flex gap-1 overflow-x-auto pb-1" aria-label="태그 필터">{tags.map((item)=><button key={item} onClick={()=>setTag(item)} aria-pressed={tag===item} className={`rounded-full border px-2.5 py-1 text-xs ${tag===item?"border-white bg-white text-black":"border-[var(--line)] bg-black text-[#aaa]"}`}>{item}</button>)}</div>
    <p className="mb-2 text-xs text-[var(--muted)]">{visible.length} papers</p>
    <nav className="grid max-h-72 gap-1 overflow-y-auto lg:max-h-none">{visible.map((paper)=><Link key={paper.id} href={`/papers/${paper.id}`} className={`rounded-lg border p-3 transition ${activeId===paper.id?"border-white bg-[#171717]":"border-transparent hover:bg-[#111]"}`}><div className="flex gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${paper.done?"bg-white":"border border-[#777]"}`} aria-label={paper.done?"완료":"진행 중"}/><span className="text-sm leading-snug">{paper.title}</span></div><p className="mt-2 text-[11px] text-[var(--muted)]">{paper.id} · {paper.year ?? "연도 미상"}</p></Link>)}</nav>
  </aside>;
}
