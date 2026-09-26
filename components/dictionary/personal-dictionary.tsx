"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { StudyHighlight } from "@/lib/study-tray/types";
import type { StudyStateConflict, StudySyncStatus } from "@/lib/study-sync/types";
import { downloadDictionaryCsv } from "@/lib/dictionary/csv";

export function PersonalDictionary({
  entries,
  status,
  conflict,
  onEdit,
  onRemove,
  onUseServer,
  onUseDevice,
}: {
  entries: StudyHighlight[];
  status: StudySyncStatus;
  conflict: StudyStateConflict | null;
  onEdit: (term: string, meaning: string) => void;
  onRemove: (id: string) => void;
  onUseServer: () => void;
  onUseDevice: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [triggerHost, setTriggerHost] = useState<HTMLElement | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) => `${entry.text} ${entry.dictionaryMeaning ?? ""}`.toLowerCase().includes(normalized));
  }, [entries, query]);

  useEffect(() => { setTriggerHost(document.getElementById("study-tray-actions")); }, []);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <>
    {triggerHost && createPortal(<button type="button" onClick={() => setOpen(true)} className="h-7 rounded-md border border-[var(--line)] px-2 text-[11px] hover:bg-white/5">나만의 사전 · {entries.length}</button>, triggerHost)}
    {open && <div className="fixed inset-0 z-[70] flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-labelledby="personal-dictionary-title" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="flex h-full w-full max-w-lg flex-col border-l border-[var(--line)] bg-black text-white">
        <header className="flex items-start gap-3 border-b border-[var(--line)] p-4">
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold tracking-[.12em] text-[var(--accent)]">PERSONAL DICTIONARY</p><h2 id="personal-dictionary-title" className="mt-0.5 text-lg font-semibold">나만의 사전</h2><p className="mt-1 text-xs text-[var(--muted)]">저장된 뜻을 먼저 사용하고, 없는 단어만 Gemini에서 찾습니다.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="나만의 사전 닫기" className="grid h-8 w-8 place-items-center rounded-full text-xl text-[var(--muted)] hover:bg-white/5">×</button>
        </header>

        <div className="border-b border-[var(--line)] p-4">
          <div className="flex gap-2">
            <label htmlFor="dictionary-search" className="sr-only">사전 검색</label>
            <input id="dictionary-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="단어 또는 뜻 검색" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[#111] px-3 py-2 text-sm"/>
            <button type="button" disabled={!entries.length} onClick={() => downloadDictionaryCsv(entries)} className="shrink-0 rounded-xl border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40">CSV 다운로드</button>
          </div>
          <p className="mt-2 text-[10px] text-[var(--muted)]">{syncStatusLabel(status)}</p>
          {conflict && <div className="mt-3 rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-xs"><p>다른 기기에서 사전이 변경되었습니다.</p><div className="mt-2 flex gap-2"><button type="button" onClick={onUseServer} className="rounded-lg border border-[var(--line)] px-2.5 py-1.5">서버 버전 사용</button><button type="button" onClick={onUseDevice} className="rounded-lg bg-white px-2.5 py-1.5 text-black">이 기기 버전 사용</button></div></div>}
        </div>

        <div className="scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {!filtered.length && <p className="rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">{entries.length ? "검색 결과가 없습니다." : "사전 버튼으로 단어를 표시하면 여기에 자동 저장됩니다."}</p>}
          <div className="space-y-2">{filtered.map((entry) => <DictionaryRow key={entry.id} entry={entry} onEdit={onEdit} onRemove={() => onRemove(entry.id)}/>)}</div>
        </div>
      </section>
    </div>}
  </>;
}

function DictionaryRow({ entry, onEdit, onRemove }: { entry: StudyHighlight; onEdit: (term: string, meaning: string) => void; onRemove: () => void }) {
  const [meaning, setMeaning] = useState(entry.dictionaryMeaning ?? "");
  useEffect(() => { setMeaning(entry.dictionaryMeaning ?? ""); }, [entry.dictionaryMeaning]);

  return <form className="rounded-xl border border-[var(--line)] bg-white/[.035] p-3" onSubmit={(event) => { event.preventDefault(); if (meaning.trim()) onEdit(entry.text, meaning.trim()); }}>
    <div className="flex items-start gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.text}</p><button type="button" onClick={onRemove} aria-label={`${entry.text} 사전에서 삭제`} className="text-lg leading-none text-[var(--muted)] hover:text-white">×</button></div>
    <label className="sr-only" htmlFor={`dictionary-meaning-${entry.id}`}>{entry.text} 뜻</label>
    <div className="mt-2 flex gap-2"><input id={`dictionary-meaning-${entry.id}`} value={meaning} maxLength={100} onChange={(event) => setMeaning(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[#111] px-2.5 py-2 text-sm"/><button type="submit" disabled={!meaning.trim() || meaning.trim() === entry.dictionaryMeaning} className="rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">저장</button></div>
  </form>;
}

function syncStatusLabel(status: StudySyncStatus) {
  if (status === "syncing") return "사전을 동기화하는 중…";
  if (status === "saved-local") return "이 기기에 저장됨 · 계정 동기화 대기";
  if (status === "offline") return "오프라인 · 이 기기에 먼저 저장됨";
  if (status === "error") return "사전 동기화에 실패함 · 로컬 사본은 유지됨";
  if (status === "conflict") return "사전 버전 충돌 확인 필요";
  if (status === "loading") return "사전을 불러오는 중…";
  return "계정 사전에 저장됨";
}
