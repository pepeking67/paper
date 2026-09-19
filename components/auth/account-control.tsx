"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./auth-provider";

type Mode = "signin" | "signup";

export function AccountControl({ initiallyOpen = false, required = false }: { initiallyOpen?: boolean; required?: boolean } = {}) {
  const auth = useAuth();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(initiallyOpen);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { setHost(document.getElementById("paper-header-actions")); }, []);
  useEffect(() => {
    if (cooldownUntil <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil, now]);

  const waitSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const result = mode === "signin" ? await auth.signIn(email.trim(), password) : await auth.signUp(email.trim(), password);
    setBusy(false);
    if (result.error) {
      const translated = explainAuthError(result.error, mode);
      setMessage(translated.message);
      if (translated.cooldownSeconds) {
        const until = Date.now() + translated.cooldownSeconds * 1_000;
        setNow(Date.now());
        setCooldownUntil(until);
      }
      return;
    }
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
      ? <button type="button" onClick={() => setOpen(true)} title={auth.user.email ?? "내 계정"} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white/[.035] px-2.5 text-[11px] text-[#d7d7dc] hover:bg-white/[.07]"><svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.7"><circle cx="10" cy="7" r="3"/><path d="M4.5 16c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5"/></svg><span>계정</span></button>
      : <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5">로그인</button>;

  return <>
    {host && createPortal(button, host)}
    {open && <div className="fixed inset-0 z-[80] grid place-items-center bg-[#0b0b0c] p-4" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" onPointerDown={(event) => { if (!required && event.target === event.currentTarget) setOpen(false); }}>
      <section className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[#111] p-5 text-white shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-semibold tracking-[.14em] text-[var(--accent)]">PAPER STUDY</p><h2 id="account-dialog-title" className="mt-1 text-xl font-semibold">{auth.user ? "계정" : mode === "signin" ? "로그인" : "회원가입"}</h2>{!auth.user && required && <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">로그인하면 내 논문과 학습 기록을 불러옵니다.</p>}</div>
          {!required && <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-2xl text-[var(--muted)]">×</button>}
        </header>

        {!auth.configured && <p role="alert" className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">Supabase Preview 환경 변수가 필요합니다.</p>}

        {auth.user ? <div className="mt-5">
          <p className="break-all text-sm text-[#ddd]">{auth.user.email}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">이 계정의 학습 기록과 개인 논문 라이브러리가 동기화됩니다.</p>
          <button type="button" disabled={busy} onClick={() => void signOut()} className="mt-5 w-full rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm hover:bg-white/5 disabled:opacity-40">로그아웃</button>
        </div> : <>
          <div className="mt-5 grid grid-cols-2 rounded-xl bg-white/5 p-1">
            {(["signin", "signup"] as const).map((item) => <button key={item} type="button" onClick={() => { setMode(item); setMessage(""); setCooldownUntil(0); }} className={`rounded-lg px-3 py-2 text-sm ${mode === item ? "bg-white text-black" : "text-[var(--muted)]"}`}>{item === "signin" ? "로그인" : "회원가입"}</button>)}
          </div>
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <label className="block text-xs text-[var(--muted)]">이메일<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-black px-3 py-2.5 text-sm text-white"/></label>
            <label className="block text-xs text-[var(--muted)]">비밀번호<input required minLength={6} type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-black px-3 py-2.5 text-sm text-white"/></label>
            {message && <p role="alert" className="rounded-xl border border-[var(--line)] bg-white/5 p-3 text-xs leading-relaxed">{message}</p>}
            <button disabled={busy || !auth.configured || waitSeconds > 0} className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{busy ? "처리 중…" : waitSeconds > 0 ? `${waitSeconds}초 후 다시 시도` : mode === "signin" ? "로그인" : "계정 만들기"}</button>
          </form>
        </>}
      </section>
    </div>}
  </>;
}

function explainAuthError(error: { code?: string; message: string; status?: number }, mode: Mode) {
  const code = error.code ?? "";
  const normalized = error.message.toLowerCase();
  const rateLimited = error.status === 429 || code.includes("rate_limit") || normalized.includes("rate limit") || normalized.includes("too many requests");
  if (rateLimited && mode === "signup") return {
    message: "회원가입 인증 메일 발송 한도를 초과했습니다. 계정이 생성된 것은 아닙니다. Supabase 기본 메일 한도가 초기화된 뒤(보통 최대 1시간) 회원가입을 한 번만 다시 시도하세요.",
    cooldownSeconds: 60,
  };
  if (rateLimited) return { message: "로그인 요청이 너무 많아 잠시 제한되었습니다. 잠시 기다린 뒤 한 번만 다시 시도하세요.", cooldownSeconds: 30 };
  if (code === "invalid_credentials" || normalized.includes("invalid login credentials")) return { message: "이메일 또는 비밀번호가 맞지 않거나 아직 생성된 계정이 없습니다." };
  if (code === "email_not_confirmed" || normalized.includes("email not confirmed")) return { message: "이메일 인증이 완료되지 않았습니다. 받은 인증 메일의 링크를 먼저 열어주세요." };
  if (code === "user_already_exists" || normalized.includes("already registered")) return { message: "이미 가입된 이메일입니다. 로그인 탭에서 접속하세요." };
  if (normalized.includes("not authorized")) return { message: "Supabase 기본 메일은 프로젝트 팀에 등록된 주소에만 보낼 수 있습니다. 팀 계정 이메일을 사용하거나 custom SMTP 설정이 필요합니다." };
  return { message: error.message };
}
