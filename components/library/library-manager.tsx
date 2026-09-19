"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePersonalLibrary, type PersonalPaperInput } from "./personal-library-provider";

const emptyInput = (): PersonalPaperInput => ({ title: "", authors: "", year: null, sourceUrl: null, notionUrl: null, categoryId: null, readingStatus: "unread" });

export function LibraryManager({ open, onClose, initialPaperId }: { open: boolean; onClose: () => void; initialPaperId?: string }) {
  const library = usePersonalLibrary();
  const [categoryName, setCategoryName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [input, setInput] = useState<PersonalPaperInput>(emptyInput);
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const paper = initialPaperId ? library.papers.find((item) => item.id === initialPaperId) : null;
    if (paper) beginEdit(paper.id);
  // Opening is the boundary; subsequent library refreshes must not reset an active form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPaperId]);

  if (!open) return null;

  function beginEdit(id: string) {
    const paper = library.papers.find((item) => item.id === id);
    if (!paper) return;
    setEditingId(id);
    setInput({ title: paper.title, authors: paper.authors, year: paper.year, sourceUrl: paper.sourceUrl, notionUrl: paper.notionUrl, categoryId: paper.categoryId ?? null, readingStatus: paper.readingStatus ?? "unread" });
    setPdf(null);
    setError("");
  }

  function beginCreate() {
    setEditingId(null);
    setInput({ ...emptyInput(), categoryId: library.categories[0]?.id ?? null });
    setPdf(null);
    setError("");
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await operation(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function savePaper(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (editingId) {
        await library.updatePaper(editingId, input);
        if (pdf) await library.uploadPdf(editingId, pdf);
      } else {
        const id = await library.createPaper(input, pdf);
        setEditingId(id);
      }
      setPdf(null);
    });
  }

  return <div className="fixed inset-0 z-[85] flex justify-end bg-black/70" role="dialog" aria-modal="true" aria-labelledby="library-manager-title" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="scrollbar h-full w-full max-w-3xl overflow-y-auto border-l border-[var(--line)] bg-[#0b0b0c] p-5 text-white">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-[11px] font-semibold tracking-[.14em] text-[var(--accent)]">PERSONAL LIBRARY</p><h2 id="library-manager-title" className="mt-1 text-xl font-semibold">계정별 논문 관리</h2><p className="mt-1 text-xs text-[var(--muted)]">PDF는 private Storage에 저장되고 현재 계정만 접근할 수 있습니다.</p></div>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-2xl text-[var(--muted)]">×</button>
      </header>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>}

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white/[.035] p-4">
        <h3 className="font-semibold">카테고리</h3>
        <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!categoryName.trim()) return; void run(async () => { await library.createCategory(categoryName); setCategoryName(""); }); }}>
          <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={80} placeholder="새 카테고리 이름" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-black px-3 py-2 text-sm"/>
          <button disabled={busy} className="rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-40">추가</button>
        </form>
        <div className="mt-3 space-y-2">
          {library.categories.map((category, index) => <CategoryRow key={category.id} name={category.name} disabled={busy} first={index === 0} last={index === library.categories.length - 1} onRename={(name) => void run(() => library.renameCategory(category.id, name))} onMove={(direction) => void run(() => library.moveCategory(category.id, direction))} onDelete={() => { if (window.confirm(`'${category.name}' 카테고리를 삭제할까요? 논문은 '개인 논문'으로 이동하며 삭제되지 않습니다.`)) void run(() => library.deleteCategory(category.id)); }}/>) }
          {!library.categories.length && <p className="text-sm text-[var(--muted)]">카테고리를 만들면 논문을 분류할 수 있습니다.</p>}
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.9fr)]">
        <div className="rounded-2xl border border-[var(--line)] bg-white/[.035] p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">내 논문</h3><button type="button" onClick={beginCreate} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-white/5">새 논문</button></div>
          <div className="mt-3 space-y-2">
            {library.papers.map((paper, index) => <article key={paper.id} className={`rounded-xl border p-3 ${editingId === paper.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-black/30"}`}>
              <button type="button" onClick={() => beginEdit(paper.id)} className="w-full text-left"><strong className="block text-sm">{paper.title}</strong><span className="mt-1 block text-[11px] text-[var(--muted)]">{paper.tag} · {paper.readingStatus} · {paper.asset ? "PDF 있음" : "PDF 없음"}</span></button>
              <div className="mt-2 flex gap-1.5"><button disabled={busy || index === 0} type="button" onClick={() => void run(() => library.movePaper(paper.id, -1))} className="rounded border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-30">위</button><button disabled={busy || index === library.papers.length - 1} type="button" onClick={() => void run(() => library.movePaper(paper.id, 1))} className="rounded border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-30">아래</button><button disabled={busy} type="button" onClick={() => { if (window.confirm(`'${paper.title}'과 연결된 PDF·영역 이미지·공부 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) void run(async () => { await library.deletePaper(paper.id); if (editingId === paper.id) beginCreate(); }); }} className="ml-auto rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-300">삭제</button></div>
            </article>)}
            {!library.papers.length && <p className="text-sm text-[var(--muted)]">아직 개인 논문이 없습니다.</p>}
          </div>
        </div>

        <form onSubmit={savePaper} className="rounded-2xl border border-[var(--line)] bg-white/[.035] p-4">
          <h3 className="font-semibold">{editingId ? "논문 수정" : "새 논문"}</h3>
          <div className="mt-3 space-y-3">
            <Field label="제목"><input required maxLength={500} value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} className="input"/></Field>
            <Field label="저자"><input value={input.authors} onChange={(event) => setInput({ ...input, authors: event.target.value })} className="input"/></Field>
            <Field label="연도"><input type="number" min={1800} max={2200} value={input.year ?? ""} onChange={(event) => setInput({ ...input, year: event.target.value ? Number(event.target.value) : null })} className="input"/></Field>
            <Field label="카테고리"><select value={input.categoryId ?? ""} onChange={(event) => setInput({ ...input, categoryId: event.target.value || null })} className="input"><option value="">개인 논문</option>{library.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
            <Field label="읽기 상태"><select value={input.readingStatus} onChange={(event) => setInput({ ...input, readingStatus: event.target.value as PersonalPaperInput["readingStatus"] })} className="input"><option value="unread">읽지 않음</option><option value="reading">읽는 중</option><option value="read">완료</option><option value="archived">보관</option></select></Field>
            <Field label="원문 URL"><input type="url" value={input.sourceUrl ?? ""} onChange={(event) => setInput({ ...input, sourceUrl: event.target.value || null })} className="input"/></Field>
            <Field label="Notion URL"><input type="url" value={input.notionUrl ?? ""} onChange={(event) => setInput({ ...input, notionUrl: event.target.value || null })} className="input"/></Field>
            <Field label="PDF (최대 50MB)">
              <input id="personal-paper-pdf" type="file" accept="application/pdf,.pdf" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => setPdf(event.target.files?.[0] ?? null)} className="sr-only"/>
              <div className="flex items-center gap-3"><label htmlFor="personal-paper-pdf" className="cursor-pointer rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black">PDF 선택</label><span className="text-xs text-[var(--muted)]">{pdf ? "PDF 선택됨" : editingId && library.papers.find((paper) => paper.id === editingId)?.asset ? "등록된 PDF 있음" : "선택된 PDF 없음"}</span></div>
            </Field>
          </div>
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{busy ? "저장 중…" : editingId ? "변경 저장" : "논문 추가"}</button>
        </form>
      </section>
    </section>
  </div>;
}

function CategoryRow({ name, disabled, first, last, onRename, onMove, onDelete }: { name: string; disabled: boolean; first: boolean; last: boolean; onRename: (name: string) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return <div className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-black/30 p-2"><input value={value} onChange={(event) => setValue(event.target.value)} maxLength={80} className="min-w-0 flex-1 bg-transparent px-1 text-sm"/><button disabled={disabled || value.trim() === name || !value.trim()} type="button" onClick={() => onRename(value)} className="rounded border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-30">저장</button><button disabled={disabled || first} type="button" onClick={() => onMove(-1)} className="rounded border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-30">↑</button><button disabled={disabled || last} type="button" onClick={() => onMove(1)} className="rounded border border-[var(--line)] px-2 py-1 text-[11px] disabled:opacity-30">↓</button><button disabled={disabled} type="button" onClick={onDelete} className="rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-300">삭제</button></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs text-[var(--muted)]">{label}<div className="mt-1.5 [&_.input]:w-full [&_.input]:rounded-xl [&_.input]:border [&_.input]:border-[var(--line)] [&_.input]:bg-black [&_.input]:px-3 [&_.input]:py-2.5 [&_.input]:text-sm [&_.input]:text-white">{children}</div></label>; }
