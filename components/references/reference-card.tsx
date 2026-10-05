"use client";
import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { referenceContext } from "@/lib/references/reference-context";
import { matchReferenceTitles, type ReferenceTitle } from "@/lib/references/match-reference";

/** Reference lookup never calls chat/AI, creates annotations, or changes chat context. */
export function ReferenceCard({ pdf, selection, onClose }: {
  pdf: PDFDocumentProxy; selection: { text: string; page: number }; onClose: () => void;
}) {
  const [titles, setTitles] = useState<ReferenceTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setTitles([]); setError(""); setLoading(Boolean(selection.text.trim()));
    if (selection.text.trim()) {
      void referenceContext(pdf).then(references => {
        if (cancelled) return;
        const matches = matchReferenceTitles(selection.text, references);
        setTitles(matches);
        if (!matches.length) setError("References에서 제목을 확인하지 못했다. 인용 번호 또는 저자·연도를 함께 선택해 주세요.");
      }).catch(() => {
        if (!cancelled) setError("PDF의 References를 읽지 못했다.");
      }).finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [pdf, selection]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <aside aria-label="참고문헌 제목" className="max-h-[20vh] shrink-0 overflow-y-auto border-b border-[var(--line)] bg-[#191919] px-3 py-2 text-sm text-white">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1" aria-live="polite">
        {!selection.text && <p className="text-xs text-[#bbb]">본문의 인용 번호 또는 저자·연도를 드래그하면 References의 제목을 표시한다.</p>}
        {loading && <p role="status" className="text-xs text-[#bbb]">References 확인 중…</p>}
        {error && <p role="status" className="text-xs text-[#bbb]">{error}</p>}
        {titles.map(item => <p key={item.label} className="select-text break-words"><span className="mr-2 text-[#aaa]">{item.label}</span>{item.title}</p>)}
      </div>
      <button type="button" onClick={onClose} aria-label="참고문헌 닫기" className="shrink-0 px-2">×</button>
    </div>
  </aside>;
}
