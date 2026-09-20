"use client";

import type { StudyStateConflict, StudySyncStatus } from "@/lib/study-sync/types";

const labels: Record<StudySyncStatus, string> = {
  guest: "로컬 저장",
  loading: "불러오는 중…",
  "saved-local": "기기에 저장됨",
  syncing: "동기화 중…",
  synced: "동기화됨",
  offline: "오프라인 · 기기에 저장됨",
  conflict: "버전 충돌",
  error: "동기화 오류",
};

export function StudySyncStatusView({ status, conflict, onUseServer, onUseDevice }: { status: StudySyncStatus; conflict: StudyStateConflict | null; onUseServer: () => void; onUseDevice: () => void }) {
  return <>
    {status !== "synced" && <span className={`fixed bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border px-3 py-1.5 text-[11px] shadow-xl backdrop-blur ${status === "conflict" || status === "error" ? "border-amber-400/50 bg-amber-950/90 text-amber-100" : "border-[var(--line)] bg-black/75 text-[var(--muted)]"}`}>{labels[status]}</span>}
    {conflict && <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="sync-conflict-title">
      <section className="w-full max-w-lg rounded-2xl border border-amber-400/40 bg-[#111] p-5 text-white shadow-2xl">
        <p className="text-[11px] font-semibold tracking-[.14em] text-amber-300">SYNC CONFLICT</p>
        <h2 id="sync-conflict-title" className="mt-1 text-xl font-semibold">다른 기기에서 더 최신 기록이 저장됨</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#bbb]">서버 revision {conflict.server.revision}과 이 기기의 기준 revision {conflict.device.revision}이 다르다. 자동 덮어쓰기를 중단했다. 유지할 버전을 선택해라.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onUseServer} className="rounded-xl border border-[var(--line)] p-4 text-left hover:bg-white/5"><strong className="block text-sm">서버 버전 사용</strong><span className="mt-1 block text-xs text-[var(--muted)]">현재 서버 기록을 이 기기에 적용</span></button>
          <button type="button" onClick={onUseDevice} className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-4 text-left hover:bg-[#0a84ff]/20"><strong className="block text-sm">이 기기 버전 사용</strong><span className="mt-1 block text-xs text-[#b6d8ff]">최신 server revision을 기준으로 다시 저장</span></button>
        </div>
      </section>
    </div>}
  </>;
}
