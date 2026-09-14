"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Paper } from "@/lib/papers/types";

type UiStatus = "pending" | "checking" | "uploading" | "ready" | "skipped" | "failed" | "excluded";
type StatusRow = { paperId: string; status: UiStatus; reason?: string; code?: string; sizeBytes?: number; sha256?: string };

export function PdfSyncPanel({ papers }: { papers: Paper[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, StatusRow>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadStatuses = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/pdf-status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "상태 확인 실패");
      setRows(Object.fromEntries((data.papers as StatusRow[]).map((row) => [row.paperId, row])));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "상태 확인 실패"); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (open && Object.keys(rows).length === 0) void loadStatuses(); }, [open, rows, loadStatuses]);

  const syncOne = useCallback(async (paperId: string) => {
    setRows((current) => ({ ...current, [paperId]: { paperId, status: "checking" } }));
    try {
      const check = await fetch(`/api/admin/pdf-status?paperId=${encodeURIComponent(paperId)}`, { cache: "no-store" });
      const checkData = await check.json();
      if (!check.ok) throw new Error(checkData.error ?? "상태 확인 실패");
      if (checkData.papers[0]?.status === "ready") {
        setRows((current) => ({ ...current, [paperId]: { paperId, status: "skipped", reason: "Already uploaded" } }));
        return;
      }
      setRows((current) => ({ ...current, [paperId]: { paperId, status: "uploading" } }));
      const response = await fetch("/api/admin/sync-pdfs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paperId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(`${result.code ? `[${result.code}] ` : ""}${result.reason ?? "동기화 실패"}`);
      setRows((current) => ({ ...current, [paperId]: { ...result, status: result.status } }));
    } catch (caught) {
      setRows((current) => ({ ...current, [paperId]: { paperId, status: "failed", reason: caught instanceof Error ? caught.message : "동기화 실패" } }));
    }
  }, []);

  async function syncIds(ids: string[]) {
    if (busy || ids.length === 0) return;
    setBusy(true); setError("");
    let cursor = 0;
    async function worker() { while (cursor < ids.length) { const id = ids[cursor++]; await syncOne(id); } }
    await Promise.all(Array.from({ length: Math.min(2, ids.length) }, worker));
    setBusy(false);
  }

  const visible = useMemo(() => Object.values(rows), [rows]);
  const completed = visible.filter((row) => ["ready", "skipped", "failed", "excluded"].includes(row.status)).length;
  const counts = (status: UiStatus) => visible.filter((row) => row.status === status).length;
  const candidates = visible.filter((row) => row.status === "pending" || row.status === "failed").map((row) => row.paperId);
  const failures = visible.filter((row) => row.status === "failed").map((row) => row.paperId);

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-[calc(env(safe-area-inset-bottom)+4rem)] right-4 z-20 rounded-full border border-[var(--line)] bg-black px-4 py-2 text-sm text-white shadow-xl">PDF 관리</button>
    {open && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="pdf-sync-title">
      <section className="scrollbar max-h-[88dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[#101512] p-5 shadow-2xl">
        <header className="flex items-start justify-between"><div><p className="text-xs text-[var(--accent)]">ADMIN</p><h2 id="pdf-sync-title" className="text-xl font-semibold">PDF 동기화</h2></div><button onClick={() => setOpen(false)} aria-label="닫기" className="text-2xl">×</button></header>
        <p className="mt-2 text-sm text-[var(--muted)]">Manifest의 허용된 원본만 private Blob으로 동기화합니다. 최대 2개씩 처리합니다.</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#252d29]"><div className="h-full bg-[#83be94] transition-all" style={{ width: `${visible.length ? completed / visible.length * 100 : 0}%` }} /></div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--muted)]"><span>{completed}/{visible.length}</span><span>성공 {counts("ready")}</span><span>생략 {counts("skipped")}</span><span>실패 {counts("failed")}</span><span>제외 {counts("excluded")}</span></div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || candidates.length === 0} onClick={() => void syncIds(candidates)} className="rounded-lg bg-[#b2d9be] px-4 py-2 text-sm font-medium text-[#0c120e] disabled:opacity-40">누락된 PDF 동기화</button><button disabled={busy || failures.length === 0} onClick={() => void syncIds(failures)} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-40">실패만 다시 시도</button><button disabled={busy} onClick={() => void loadStatuses()} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-40">상태 새로고침</button></div>
        <div className="mt-4 divide-y divide-[var(--line)]">{visible.map((row) => { const paper = papers.find((item) => item.id === row.paperId); return <div key={row.paperId} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm">{paper?.title ?? row.paperId}</p><p className="mt-1 text-xs text-[var(--muted)]">{row.paperId} · {row.status}{row.reason ? ` · ${row.reason}` : ""}</p></div>{row.status !== "excluded" && <button disabled={busy || row.status === "checking" || row.status === "uploading"} onClick={() => void syncIds([row.paperId])} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-40">동기화</button>}</div>; })}</div>
      </section>
    </div>}
  </>;
}
