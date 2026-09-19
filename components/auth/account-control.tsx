"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./auth-provider";

type Mode = "signin" | "signup";

export function AccountControl() {
  const auth = useAuth();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { setHost(document.getElementById("paper-header-actions")); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const result = mode === "signin" ? await auth.signIn(email.trim(), password) : await auth.signUp(email.trim(), password);
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (result.needsEmailConfirmation) {
      setMessage("확인 메일을 보냈습니다. 이메일 인증 후 로그인하세요.");
      return;
    }
    setOpen(false);
    setPassword("");
  }

  async function signOut() {
    setBusy(true);
    const { error } = await auth.signOut();
    setBusy(false);
    if (error) setMessage(error.message);
  }

  const button = auth.loading
    ? <button disabled className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs opacity-60">계정 확인 중…</button>
    : auth.user
      ? <button type="button" onClick={() => setOpen(true)} className="max-w-44 truncate rounded-xl border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5">{auth.user.email ?? "내 계정"}</button>
      : <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5">로그인</button>;

  return <>
    {host && createPortal(button, host)}
    {open && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[#111] p-5 text-white shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-semibold tracking-[.14em] text-[var(--accent)]">ACCOUNT</p><h2 id="account-dialog-title" className="mt-1 text-xl font-semibold">{auth.user ? "계정" : mode === "signin" ? "로그인" : "회원가입"}</h2></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-2xl text-[var(--muted)]">×</button>
        </header>

        {!auth.configured && <p role="alert" className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">Supabase Preview 환경 변수가 필요합니다.</p>}

        {auth.user ? <div className="mt-5">
          <p className="break-all text-sm text-[#ddd]">{auth.user.email}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">이 계정의 학습 기록과 개인 논문 라이브러리가 동기화됩니다.</p>
          <button type="button" disabled={busy} onClick={() => void signOut()} className="mt-5 w-full rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm hover:bg-white/5 disabled:opacity-40">로그아웃</button>
        </div> : <>
          <div className="mt-5 grid grid-cols-2 rounded-xl bg-white/5 p-1">
            {(["signin", "signup"] as const).map((item) => <button key={item} type="button" onClick={() => { setMode(item); setMessage(""); }} className={`rounded-lg px-3 py-2 text-sm ${mode === item ? "bg-white text-black" : "text-[var(--muted)]"}`}>{item === "signin" ? "로그인" : "회원가입"}</button>)}
          </div>
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <label className="block text-xs text-[var(--muted)]">이메일<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-black px-3 py-2.5 text-sm text-white"/></label>
            <label className="block text-xs text-[var(--muted)]">비밀번호<input required minLength={6} type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-black px-3 py-2.5 text-sm text-white"/></label>
            {message && <p role="alert" className="rounded-xl border border-[var(--line)] bg-white/5 p-3 text-xs leading-relaxed">{message}</p>}
            <button disabled={busy || !auth.configured} className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{busy ? "처리 중…" : mode === "signin" ? "로그인" : "계정 만들기"}</button>
          </form>
        </>}
      </section>
    </div>}
  </>;
}
