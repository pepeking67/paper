"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAuth } from "@/components/auth/auth-provider";
import { referenceContext, type ReferenceInfo } from "@/lib/references/reference-context";

export function ReferenceCard({ paperId, pdf, selection, pageText, onClose }: {
  paperId: string; pdf: PDFDocumentProxy; selection: { text: string; page: number };
  pageText: string; onClose: () => void;
}) {
  const { session } = useAuth();
  const [query, setQuery] = useState(selection.text);
  const [result, setResult] = useState<ReferenceInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, ReferenceInfo>());
  const lookupRef = useRef<(query: string) => void>(() => {});

  async function lookup(citation: string) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setError(""); setResult(null); setLoading(true);
    const key = `${selection.page}:${citation}`;
    try {
      const previous = cache.current.get(key);
      if (previous) { setResult(previous); return; }
      if (!session?.access_token) throw new Error("로그인 세션을 확인하세요.");
      if (!citation.trim()) throw new Error("인용 번호, 저자명 또는 참고문헌 항목을 선택하거나 입력하세요.");
      const bibliography = await referenceContext(pdf);
      if (request.signal.aborted) return;
      // A pasted full reference is an explicit fallback for unusual layouts/scans.
      const references = bibliography || (citation.trim().length > 80 ? citation : "");
      if (!references) throw new Error("References를 자동 추출하지 못했습니다. 참고문헌 항목 전체를 아래 입력란에 붙여 넣으세요.");
      const response = await fetch("/api/references", {
        method: "POST", signal: request.signal,
        headers: { "Content-Type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ paperId, citation, references, context: pageText.slice(0, 4000) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "참고문헌 조회 실패");
      if (request.signal.aborted) return;
      cache.current.set(key, data); setResult(data);
    } catch (caught) {
      if (!request.signal.aborted) setError(caught instanceof Error ? caught.message : "참고문헌 조회 실패");
    } finally { if (!request.signal.aborted) setLoading(false); }
  }
  lookupRef.current = (value) => { void lookup(value); };
  useEffect(() => {
    setQuery(selection.text); setResult(null); setError("");
    if (selection.text.trim()) lookupRef.current(selection.text);
    return () => controller.current?.abort();
  }, [selection]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return <aside aria-label="참고문헌 카드" className="max-h-[35vh] shrink-0 overflow-y-auto border-b border-[var(--line)] bg-[#191919] p-3 text-sm text-white">
    <div className="flex items-center justify-between gap-3"><strong>참고문헌 · p.{selection.page}</strong><button type="button" onClick={onClose} aria-label="참고문헌 닫기" className="px-2">×</button></div>
    <p className="mt-1 text-xs text-[#bbb]">[1] 도구에서 인용 번호·저자명을 드래그하거나 참고문헌 항목을 입력하세요. 한 편씩 조회합니다.</p>
    <form onSubmit={(event) => { event.preventDefault(); void lookup(query); }} className="mt-2 flex gap-2">
      <input aria-label="조회할 인용 또는 참고문헌" maxLength={2000} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: [12], Kingma and Welling (2014)" className="min-w-0 flex-1 rounded bg-white px-2 py-1 text-black"/>
      <button type="submit" disabled={loading || !query.trim()} className="shrink-0 rounded border border-[var(--line)] px-3 disabled:opacity-50">{loading ? "조회 중…" : "조회"}</button>
    </form>
    {loading && <p role="status" className="mt-2 text-xs">참고문헌을 확인하는 중…</p>}
    {error && <p role="alert" className="mt-2 text-red-200">{error}</p>}
    {result && <div className="mt-3 space-y-2">
      <h3 className="font-semibold">{result.title}</h3><p>{result.summary}</p>
      <p className="text-[11px] text-[#aaa]">제목·인용 문맥 기반 AI 설명 · 인용 논문 전문을 읽은 요약은 아닙니다.</p>
      <details><summary className="cursor-pointer text-xs text-[#bbb]">원문 참고문헌 확인</summary><p className="mt-1 select-text text-xs">{result.evidence}</p></details>
      <a href={`https://scholar.google.com/scholar?q=${encodeURIComponent(result.title)}`} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-sky-300 underline">논문 검색 ↗</a>
    </div>}
  </aside>;
}
