"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { ChatTurn, StudyContext } from "@/lib/ai/provider";
import type { Paper } from "@/lib/papers/types";
import type { StudyInsight } from "@/lib/study-tray/types";
import { MarkdownContent } from "@/components/markdown/markdown-content";

export function StudyChat({
  paper,
  context,
  savedInsights,
  onSaveInsight,
  onClose,
  onHistoryChange,
  onQuestionContextConsumed,
}: {
  paper: Paper;
  context: StudyContext;
  savedInsights: StudyInsight[];
  onSaveInsight: (question: string, answer: string) => void;
  onClose: () => void;
  onHistoryChange?: (messages: ChatTurn[]) => void;
  onQuestionContextConsumed?: () => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const storageKey = `paper-study-chat:${paper.id}`;
  const hasAreas = Boolean(context.selectedAreas?.length);
  const hasAnnotationContext = Boolean(context.selectedText || hasAreas);
  const quickPrompts = hasAnnotationContext
    ? ["표시한 내용을 설명해줘", "표시한 주장의 근거를 분석해줘", "표시한 수식이나 영역을 단계별로 설명해줘"]
    : ["현재 페이지의 핵심을 요약해줘", "이 논문의 핵심 기여를 설명해줘", "논문의 가정과 한계를 비판적으로 검토해줘"];

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as ChatTurn[];
      setMessages(stored);
      onHistoryChange?.(stored);
    } catch {
      setMessages([]);
      onHistoryChange?.([]);
    }
  }, [storageKey, onHistoryChange]);

  function save(next: ChatTurn[]) {
    const limited = next.slice(-40);
    setMessages(limited);
    localStorage.setItem(storageKey, JSON.stringify(limited));
    onHistoryChange?.(limited);
  }

  async function ask(value: string) {
    const question = value.trim();
    if (!question || loading) return;
    const previous = messages;
    const usedAnnotationContext = hasAnnotationContext;
    save([...previous, { role: "user", content: question }]);
    setInput(""); setLoading(true); setError("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: question, context, history: previous.slice(-8) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.code ? `[${data.code}] ` : ""}${data.error ?? "AI 응답 실패"}`);
      save([...previous, { role: "user", content: question }, { role: "assistant", content: data.message }]);
      if (usedAnnotationContext) onQuestionContextConsumed?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "AI 응답 실패"); }
    finally { setLoading(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  return <aside className="flex h-full min-h-0 flex-col border-l border-[var(--line)] bg-black" aria-label="학습 대화">
    <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-3.5">
      <div className="min-w-0"><p className="text-[11px] font-semibold tracking-[.12em] text-[var(--accent)]">STUDY CHAT</p><h2 className="mt-0.5 truncate font-medium">논문에 질문하기</h2></div>
      <div className="flex shrink-0 items-center gap-2">
        {messages.length > 0 && <button onClick={() => save([])} className="text-xs text-[var(--muted)]">대화 지우기</button>}
        <button type="button" onClick={onClose} aria-label="질의응답 닫기" title="질의응답 닫기" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-white/[.06] hover:text-white">×</button>
      </div>
    </header>
    <div className="scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 && <div className="rounded-xl border border-[var(--line)] bg-[#111] p-4 text-sm leading-relaxed text-[#bbb]">Gemini API가 현재 페이지와 형광펜·밑줄·영역으로 표시한 질문 문맥, 최근 대화를 사용해 답합니다. 답변은 Markdown과 수식 문법을 렌더링합니다. 일반 대화는 Study Tray에 자동 저장되지 않으며, 남기고 싶은 답변만 <strong>Save Insight</strong>로 저장합니다.</div>}
      {messages.map((message, index) => {
        const previousQuestion = message.role === "assistant" && messages[index - 1]?.role === "user" ? messages[index - 1].content : null;
        const insightSaved = Boolean(previousQuestion && savedInsights.some((insight) => insight.question === previousQuestion && insight.answer === message.content));
        return <div key={`${message.role}-${index}`} className={`rounded-2xl p-3.5 text-sm leading-relaxed ${message.role === "user" ? "ml-7 bg-[var(--accent)] text-white" : "mr-7 border border-[var(--line)] bg-[rgba(255,255,255,.045)]"}`}>
          <p className={`mb-2 text-[10px] uppercase tracking-wider ${message.role === "user" ? "text-white/65" : "text-[var(--muted)]"}`}>{message.role === "user" ? "You" : "Gemini"}</p>
          {message.role === "assistant" ? <MarkdownContent content={message.content} compact /> : <p className="whitespace-pre-wrap">{message.content}</p>}
          {previousQuestion && <button
            type="button"
            title={insightSaved ? "이미 Study Tray에 저장된 Q&A입니다" : "이 Q&A를 Study Tray와 학습 노트 재료로 저장"}
            disabled={insightSaved}
            data-saved={insightSaved ? "true" : "false"}
            onClick={() => onSaveInsight(previousQuestion, message.content)}
            className={`mt-3 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${insightSaved ? "cursor-default border-[#2f6844] bg-[#173522] text-[#a6e3b9] opacity-100" : "border-[var(--line)] text-[#d7d7d7] hover:bg-[rgba(255,255,255,.08)]"}`}
          >{insightSaved ? "✓ Saved to Tray" : "Save Insight → Tray"}</button>}
        </div>;
      })}
      {loading && <p role="status" className="text-sm text-[var(--muted)]">답변을 생성하는 중…</p>}
      {error && <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-sm">{error}</p>}
    </div>
    <form onSubmit={submit} className="border-t border-[var(--line)] p-3.5"><div className="mb-2 flex gap-1 overflow-x-auto pb-1" aria-label="빠른 질문">{quickPrompts.map((prompt) => <button key={prompt} type="button" disabled={loading} onClick={() => void ask(prompt)} className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[#bbb] hover:bg-white/5 disabled:opacity-40">{prompt}</button>)}</div><label htmlFor="chat" className="sr-only">질문</label><textarea id="chat" maxLength={4000} rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder={`${paper.title}에 관해 질문하세요…`} className="w-full resize-none rounded-xl border border-[var(--line)] bg-[#111] p-3 text-sm"/><div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-xs text-[var(--muted)]">문맥: p.{context.page}{context.selectedText ? " · 주석 문장 포함" : ""}{hasAreas ? ` · 영역 ${context.selectedAreas?.length}개 포함` : ""}</span><button disabled={loading || !input.trim()} className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40">질문하기</button></div></form>
  </aside>;
}
