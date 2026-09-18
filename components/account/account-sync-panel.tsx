"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { signInWithPassword, signOutAccount, signUpWithPassword } from "@/lib/account-sync/auth-client";
import type { AccountSession, AccountSyncStatus } from "@/lib/account-sync/types";

export function AccountSyncPanel({
  configured,
  session,
  syncStatus,
  onSessionChange,
  onSyncNow,
  onPullRemote,
  onForcePushLocal,
}: {
  configured: boolean;
  session: AccountSession | null;
  syncStatus: AccountSyncStatus;
  onSessionChange: (session: AccountSession | null) => void;
  onSyncNow: () => Promise<void> | void;
  onPullRemote: () => Promise<void> | void;
  onForcePushLocal: () => Promise<void> | void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setHost(document.getElementById("paper-header-actions")); }, []);

  async function authenticate(mode: "signin" | "signup") {
    if (!email.trim() || !password) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (mode === "signin") {
        const next = await signInWithPassword(email.trim(), password);
        onSessionChange(next);
        setMessage("로그인되었습니다. 이 기기의 학습 데이터를 계정과 동기화합니다.");
      } else {
        const result = await signUpWithPassword(email.trim(), password);
        if (result.session) {
          onSessionChange(result.session);
          setMessage("계정을 만들고 로그인했습니다.");
        } else {
          setMessage("계정 생성 요청이 완료되었습니다. 이메일 확인이 켜져 있다면 인증 후 로그인하세요.");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계정 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await signOutAccount(session);
      onSessionChange(null);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = syncStatusText(syncStatus);
  const triggerLabel = session?.user.email ? `Sync · ${shortEmail(session.user.email)}` : configured ? "계정 Sync" : "Local only";

  return <>
    {host && createPortal(
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={statusLabel}
        className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5"
      >
        {triggerLabel}
      </button>,
      host,
    )}

    {open && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="account-sync-title">
      <section className="w-full max-w-md rounded-2xl border border-[var(--line-strong)] bg-[#1c1c1e] p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[.12em] text-[var(--accent)]">ACCOUNT SYNC</p>
            <h2 id="account-sync-title" className="mt-1 text-lg font-semibold">여러 기기에서 공부 이어하기</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">형광펜·밑줄·영역·Save Insight·메모·학습 노트를 계정별로 동기화합니다.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="계정 동기화 닫기" className="text-xl text-[var(--muted)]">×</button>
        </header>

        {!configured ? <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-200">현재는 Local only 상태입니다.</p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">Supabase migration을 적용하고 Vercel에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정하면 계정 동기화가 활성화됩니다. 자세한 절차는 docs/ACCOUNT_SYNC_SETUP.md에 있습니다.</p>
        </div> : session ? <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-[var(--line)] bg-white/[.035] p-4">
            <p className="text-xs text-[var(--muted)]">로그인 계정</p>
            <p className="mt-1 break-all text-sm font-medium">{session.user.email ?? session.user.id}</p>
            <p className="mt-3 text-xs"><span className="text-[var(--muted)]">상태 · </span>{statusLabel}</p>
          </div>
          {syncStatus === "conflict" && <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3">
            <p className="text-xs leading-relaxed text-amber-100">다른 기기에서 더 새 버전이 저장되었습니다. 자동으로 덮어쓰지 않았습니다.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void onPullRemote()} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs">서버 버전 받기</button>
              <button type="button" onClick={() => void onForcePushLocal()} className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-100">이 기기 버전 사용</button>
            </div>
          </div>}
          <button type="button" disabled={busy || syncStatus === "syncing"} onClick={() => void onSyncNow()} className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">지금 동기화</button>
          <button type="button" disabled={busy} onClick={() => void signOut()} className="w-full rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm">로그아웃</button>
        </div> : <div className="mt-5 space-y-3">
          <label className="block text-xs text-[var(--muted)]">이메일<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] p-3 text-sm text-white" /></label>
          <label className="block text-xs text-[var(--muted)]">비밀번호<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] p-3 text-sm text-white" /></label>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => void authenticate("signin")} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">로그인</button>
            <button type="button" disabled={busy} onClick={() => void authenticate("signup")} className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm disabled:opacity-40">계정 만들기</button>
          </div>
        </div>}

        {message && <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-200">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/35 bg-red-500/5 p-2.5 text-xs text-red-200">{error}</p>}
      </section>
    </div>}
  </>;
}

function syncStatusText(status: AccountSyncStatus) {
  switch (status) {
    case "local-only": return "이 브라우저에만 저장";
    case "signed-out": return "로그인 필요";
    case "syncing": return "동기화 중…";
    case "synced": return "동기화 완료";
    case "pending": return "로컬 저장 완료 · 서버 동기화 대기";
    case "conflict": return "다른 기기 변경 감지";
    case "error": return "동기화 오류 · 로컬 데이터는 보존됨";
  }
}

function shortEmail(email: string) {
  return email.length > 22 ? `${email.slice(0, 19)}…` : email;
}
