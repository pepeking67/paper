"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePersonalLibrary } from "@/components/library/personal-library-provider";
import { LibraryManager } from "@/components/library/library-manager";
import { AccountControl } from "./account-control";
import { useAuth } from "./auth-provider";

export function AccountHome() {
  const { user, loading: authLoading } = useAuth();
  const library = usePersonalLibrary();
  const router = useRouter();
  const [managerOpen, setManagerOpen] = useState(false);
  const firstPaperId = library.papers[0]?.id;

  useEffect(() => {
    if (user && !authLoading && !library.loading && firstPaperId) router.replace(`/papers/${firstPaperId}`);
  }, [authLoading, firstPaperId, library.loading, router, user]);

  if (authLoading) return <LoadingScreen message="계정 세션을 확인하는 중…"/>;
  if (!user) return <LoginScreen/>;
  if (library.loading || firstPaperId) return <LoadingScreen message={library.loading ? "내 논문 라이브러리를 불러오는 중…" : "내 논문으로 이동하는 중…"}/>;
  if (library.error) return <LibraryLoadError message={library.error} onRetry={() => void library.refresh()}/>;

  return <main className="grid h-dvh place-items-center bg-[#111] p-6 text-white">
    <div id="paper-header-actions" className="fixed right-4 top-4 flex items-center gap-2"/>
    <section className="w-full max-w-lg rounded-3xl border border-[var(--line)] bg-black/35 p-7 text-center shadow-2xl">
      <p className="text-[11px] font-semibold tracking-[.14em] text-[var(--accent)]">PERSONAL LIBRARY</p>
      <h1 className="mt-2 text-2xl font-semibold">내 논문 라이브러리가 비어 있습니다</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]"><span className="break-all text-[#ddd]">{user.email ?? "내 계정"}</span> 계정에는 아직 등록된 논문이 없습니다.</p>
      <button type="button" onClick={() => setManagerOpen(true)} className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">첫 개인 논문과 PDF 추가</button>
    </section>
    <AccountControl/>
    <LibraryManager open={managerOpen} onClose={() => setManagerOpen(false)}/>
  </main>;
}

function LoginScreen() {
  return <main className="grid h-dvh place-items-center bg-[#0b0b0c] text-white">
    <div id="paper-header-actions" className="hidden"/>
    <AccountControl initiallyOpen required/>
  </main>;
}

function LoadingScreen({ message }: { message: string }) {
  return <main className="grid h-dvh place-items-center bg-[#111] text-white">
    <div id="paper-header-actions" className="fixed right-4 top-4 flex items-center gap-2"/>
    <div className="text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#555] border-t-white"/><p className="mt-4 text-sm text-[var(--muted)]">{message}</p></div>
    <AccountControl/>
  </main>;
}


function LibraryLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="grid h-dvh place-items-center bg-[#111] p-6 text-white">
    <div id="paper-header-actions" className="fixed right-4 top-4 flex items-center gap-2"/>
    <section className="w-full max-w-lg rounded-3xl border border-red-500/35 bg-black/35 p-7 text-center shadow-2xl">
      <h1 className="text-xl font-semibold">개인 라이브러리를 불러오지 못했습니다</h1>
      <p className="mt-3 break-words text-sm leading-relaxed text-red-200">{message}</p>
      <button type="button" onClick={onRetry} className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black">다시 불러오기</button>
    </section>
    <AccountControl/>
  </main>;
}
