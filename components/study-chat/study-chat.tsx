"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { ChatTurn, StudyContext } from "@/lib/ai/provider";
import type { Paper } from "@/lib/papers/types";
import type { StudyArea, StudyHighlight, StudyInsight } from "@/lib/study-tray/types";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import { chatHistoryStorageKey, migrateLegacyChatHistory, readPaperUiState, updatePaperUiState } from "@/lib/workspace-state/local-ui-state";
import { useAuth } from "@/components/auth/auth-provider";

export function StudyChat({
  paper,
  storageScope,
  context,
  savedInsights,
  questionHighlights,
  questionAreas,
  onSaveInsight,
  onRemoveQuestionHighlight,
  onRemoveQuestionArea,
  onClearQuestionContext,
  onClose,
  onHistoryChange,
  onQuestionContextConsumed,
}: {
  paper: Paper;
  storageScope: string;
  context: StudyContext;
  savedInsights: StudyInsight[];
  questionHighlights: StudyHighlight[];
  questionAreas: StudyArea[];
  onSaveInsight: (question: string, answer: string) => void;
  onRemoveQuestionHighlight: (id: string) => void;
  onRemoveQuestionArea: (id: string) => void;
  onClearQuestionContext: () => void;
  onClose: () => void;
  onHistoryChange?: (messages: ChatTurn[]) => void;
  onQuestionContextConsumed?: () => void;
}) {
  const { session } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const storageKey = chatHistoryStorageKey(storageScope, paper.id);
  const hasAreas = Boolean(context.selectedAreas?.length);
  const hasAnnotationContext = Boolean(context.selectedText || hasAreas);
  const contextCount = questionHighlights.length + questionAreas.length;
  const quickPrompts = hasAnnotationContext
    ? [
        { label: "표시 설명", prompt: "표시한 내용을 설명해줘" },
        { label: "근거 분석", prompt: "표시한 주장의 근거를 분석해줘" },
        { label: "수식·영역 풀이", prompt: "표시한 수식이나 영역을 단계별로 설명해줘" },
      ]
    : [
        { label: "페이지 요약", prompt: "현재 페이지의 핵심을 요약해줘" },
        { label: "핵심 기여", prompt: "이 논문의 핵심 기여를 설명해줘" },
        { label: "가정·한계", prompt: "논문의 가정과 한계를 비판적으로 검토해줘" },
      ];

  useEffect(() => {
    try {
      const storedValue = localStorage.getItem(storageKey) ?? migrateLegacyChatHistory(storageScope, paper.id) ?? "[]";
      const stored = JSON.parse(storedValue) as ChatTurn[];
      setMessages(stored);
      setInput(readPaperUiState(storageScope, paper.id).chatDraft);
      onHistoryChange?.(stored);
    } catch {
      setMessages([]);
      setInput("");
      onHistoryChange?.([]);
    }
  }, [onHistoryChange, paper.id, storageKey, storageScope]);

  function save(next: ChatTurn[]) {
    const limited = next.slice(-40);
    setMessages(limited);
    try { localStorage.setItem(storageKey, JSON.stringify(limited)); }
    catch { /* Keep the current conversation in memory. */ }
    onHistoryChange?.(limited);
  }

  function updateInput(value: string) {
    setInput(value);
    updatePaperUiState(storageScope, paper.id, { chatDraft: value });
  }

  async function ask(value: string) {
    const question = value.trim();
    if (!question || loading) return;
    const previous = messages;
    const usedAnnotationContext = hasAnnotationContext;
    save([...previous, { role: "user", content: question }]);
    updateInput(""); setLoading(true); setError("");
    try {
      if (!session?.access_token) throw new Error("로그인 세션을 확인하지 못했습니다. 다시 로그인하세요.");
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ message: question, context, history: previous.slice(-8) }) });
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
      <div className="min-w-0">
        <div className="flex items-center gap-2"><p className="text-[11px] font-semibold tracking-[.12em] text-[var(--accent)]">STUDY CHAT</p>{contextCount > 0 && <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[#8ec5ff]">문맥 {contextCount}</span>}</div>
        <h2 className="mt-0.5 truncate font-medium">논문에 질문하기</h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {messages.length > 0 && <button onClick={() => save([])} className="text-xs text-[var(--muted)]">대화 지우기</button>}
        <button type="button" onClick={onClose} aria-label="질의응답 닫기" title="질의응답 닫기" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-white/[.06] hover:text-white">×</button>
      </div>
    </header>

    {contextCount > 0 && <section className="border-b border-[var(--line)] bg-black/80 px-3.5 py-3" aria-label="질문 문맥">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-medium text-[#e5e5ea]">질문 문맥</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">다음 질문에만 사용되고 답변 성공 후 자동으로 비워집니다.</p></div>
        <button type="button" onClick={onClearQuestionContext} className="shrink-0 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:bg-white/[.06] hover:text-white">전체 비우기</button>
      </div>
      <div className="scrollbar mt-2.5 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-1">
        {questionHighlights.map((highlight) => <span key={highlight.id} className="flex max-w-full items-center gap-1 rounded-full border border-[var(--line)] bg-white/[.045] py-1 pl-2.5 pr-1 text-[11px]">
          <span className="max-w-[290px] truncate">p.{highlight.page} · {(highlight.kind ?? "highlight") === "underline" ? "밑줄" : "형광펜"} · {highlight.text}</span>
          <button type="button" onClick={() => onRemoveQuestionHighlight(highlight.id)} aria-label={`Page ${highlight.page} 질문 문맥에서 제외`} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-white/[.08] hover:text-white">×</button>
        </span>)}
        {questionAreas.map((area) => <span key={area.id} className="flex items-center gap-1.5 rounded-lg border border-sky-500/35 bg-white/[.045] py-1 pl-1 pr-1 text-[11px]">
          <img src={area.imageDataUrl} alt="" className="h-7 w-10 rounded bg-white object-contain"/>
          <span>p.{area.page} · 영역</span>
          <button type="button" onClick={() => onRemoveQuestionArea(area.id)} aria-label={`Page ${area.page} 질문 문맥에서 제외`} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-white/[.08] hover:text-white">×</button>
        </span>)}
      </div>
    </section>}

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

    <form onSubmit={submit} className="border-t border-[var(--line)] p-3.5">
      <div className="mb-2 grid grid-cols-3 gap-1" aria-label="빠른 질문">{quickPrompts.map((item) => <button key={item.prompt} type="button" title={item.prompt} disabled={loading} onClick={() => void ask(item.prompt)} className="min-w-0 rounded-lg border border-[var(--line)] bg-white/[.025] px-1.5 py-1 text-[10px] leading-tight text-[#bbb] hover:bg-white/[.06] disabled:opacity-40">{item.label}</button>)}</div>
      <label htmlFor="chat" className="sr-only">질문</label>
      <textarea id="chat" maxLength={4000} rows={3} value={input} onChange={(event) => updateInput(event.target.value)} placeholder={`${paper.title}에 관해 질문하세요…`} className="w-full resize-none rounded-xl border border-[var(--line)] bg-[#111] p-3 text-sm"/>
      <div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-xs text-[var(--muted)]">p.{context.page}{contextCount > 0 ? ` · 질문 문맥 ${contextCount}개` : " · 현재 페이지 기준"}</span><button disabled={loading || !input.trim()} className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40">질문하기</button></div>
    </form>
  </aside>;
}
