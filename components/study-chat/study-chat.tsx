"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { ChatTurn, StudyContext } from "@/lib/ai/provider";
import type { Paper } from "@/lib/papers/types";

export function StudyChat({ paper, context, onClearSelection, onSaveInsight }: { paper: Paper; context: StudyContext; onClearSelection: () => void; onSaveInsight: (question: string, answer: string) => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const storageKey = `paper-study-chat:${paper.id}`;
  const quickPrompts = context.selectedText
    ? ["선택한 내용을 쉽게 설명해줘", "선택한 주장의 근거와 한계를 분석해줘", "선택한 수식을 단계별로 설명해줘"]
    : ["현재 페이지의 핵심을 요약해줘", "이 논문의 핵심 기여를 설명해줘", "논문의 가정과 한계를 비판적으로 검토해줘"];

  useEffect(() => {
    try { setMessages(JSON.parse(localStorage.getItem(storageKey) ?? "[]")); }
    catch { setMessages([]); }
  }, [storageKey]);

  function save(next: ChatTurn[]) {
    setMessages(next);
    localStorage.setItem(storageKey, JSON.stringify(next.slice(-40)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || loading) return;
    const previous = messages;
    save([...previous, { role: "user", content: question }]);
    setInput(""); setLoading(true); setError("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: question, context, history: previous.slice(-8) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.code ? `[${data.code}] ` : ""}${data.error ?? "AI 응답 실패"}`);
      save([...previous, { role: "user", content: question }, { role: "assistant", content: data.message }]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "AI 응답 실패"); }
    finally { setLoading(false); }
  }

  return <aside className="flex min-h-[520px] flex-col border-t border-[var(--line)] bg-black lg:min-h-0 lg:border-l lg:border-t-0" aria-label="학습 대화">
    <header className="flex items-center justify-between border-b border-[var(--line)] p-4"><div><p className="text-xs text-[var(--accent)]">STUDY CHAT</p><h2 className="mt-1 font-medium">논문에 질문하기</h2></div>{messages.length > 0 && <button onClick={() => save([])} className="text-xs text-[var(--muted)]">대화 지우기</button>}</header>
    <div className="scrollbar flex-1 space-y-3 overflow-y-auto p-4">{messages.length === 0 && <div className="rounded-xl border border-[var(--line)] bg-[#111] p-4 text-sm leading-relaxed text-[#bbb]">Gemini API가 현재 페이지, 선택 문장과 최근 대화만 사용해 답합니다. 중요한 답변은 Study Tray에 저장할 수 있습니다.</div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`rounded-xl p-3 text-sm leading-relaxed ${message.role === "user" ? "ml-7 bg-white text-black" : "mr-7 border border-[var(--line)] bg-[#111]"}`}><p className={`mb-1 text-[10px] uppercase tracking-wider ${message.role === "user" ? "text-[#555]" : "text-[var(--muted)]"}`}>{message.role === "user" ? "You" : "Gemini"}</p><p className="whitespace-pre-wrap">{message.content}</p>{message.role === "assistant" && messages[index - 1]?.role === "user" && <button onClick={() => onSaveInsight(messages[index - 1].content, message.content)} className="mt-3 rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-white hover:text-black">Save Insight</button>}</div>)}{loading && <p role="status" className="text-sm text-[var(--muted)]">답변을 생성하는 중…</p>}{error && <p role="alert" className="rounded-lg border border-white p-3 text-sm">{error}</p>}</div>
    <form onSubmit={submit} className="border-t border-[var(--line)] p-4">{context.selectedText && <div className="mb-2 rounded-lg border border-[var(--line)] bg-[#111] p-2 text-xs"><div className="flex justify-between"><span>선택 텍스트 · p.{context.page}</span><button type="button" onClick={onClearSelection}>제거</button></div><p className="mt-1 line-clamp-3 text-[#bbb]">{context.selectedText}</p></div>}<div className="mb-2 flex gap-1 overflow-x-auto pb-1" aria-label="빠른 질문">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setInput(prompt)} className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[#bbb] hover:bg-[#222]">{prompt}</button>)}</div><label htmlFor="chat" className="sr-only">질문</label><textarea id="chat" maxLength={4000} rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder={`${paper.title}에 관해 질문하세요…`} className="w-full resize-none rounded-xl border border-[var(--line)] bg-[#111] p-3 text-sm"/><div className="mt-2 flex items-center justify-between"><span className="text-xs text-[var(--muted)]">문맥: p.{context.page}</span><button disabled={loading || !input.trim()} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40">질문하기</button></div></form>
  </aside>;
}
