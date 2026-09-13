"use client";

import { type FormEvent, useState } from "react";
import { buildChatGptPrompt } from "@/lib/ai/chatgpt-handoff";
import type { Paper } from "@/lib/papers/types";
import type { StudyContext } from "@/lib/ai/provider";

export function StudyChat({ paper, context, onClearSelection }: { paper: Paper; context: StudyContext; onClearSelection: () => void }) {
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: input, context }) });
    const data = await response.json();
    setNotice(data.message ?? data.error ?? "응답을 불러오지 못했습니다.");
  }

  async function openChatGpt() {
    if (!input.trim()) return;
    const prompt = buildChatGptPrompt(paper, input, context);
    const chatWindow = window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice("질문 문맥을 복사했습니다. 열린 ChatGPT 대화창에 붙여넣으세요.");
    } catch {
      setNotice("클립보드 복사가 차단됐습니다. 질문을 직접 복사해 ChatGPT에 붙여넣으세요.");
    }
    if (!chatWindow) setNotice("팝업이 차단됐습니다. chatgpt.com을 연 뒤 질문을 붙여넣으세요.");
  }

  return <aside className="flex min-h-[520px] flex-col border-t border-[var(--line)] bg-[#0d1210] lg:min-h-0 lg:border-l lg:border-t-0" aria-label="학습 대화">
    <header className="border-b border-[var(--line)] p-4"><p className="text-xs text-[var(--accent)]">STUDY CHAT</p><h2 className="mt-1 font-medium">논문에 질문하기</h2></header>
    <div className="flex-1 p-4"><div className="rounded-xl border border-[#26312c] bg-[#131916] p-4 text-sm leading-relaxed text-[#aab4af]">ChatGPT Plus는 OpenAI API 사용량을 포함하지 않습니다. 아래 버튼은 현재 페이지와 선택 문장을 복사해 사용자의 ChatGPT Plus 대화로 안전하게 넘깁니다. 사이트 안의 자동 응답은 추후 별도 API 공급자를 연결하면 활성화됩니다.</div>{notice && <p role="status" className="mt-4 text-sm text-[var(--muted)]">{notice}</p>}</div>
    <form onSubmit={submit} className="border-t border-[var(--line)] p-4">{context.selectedText && <div className="mb-2 rounded-lg bg-[#19251f] p-2 text-xs"><div className="flex justify-between"><span className="text-[var(--accent)]">선택 텍스트 · p.{context.page}</span><button type="button" onClick={onClearSelection}>제거</button></div><p className="mt-1 line-clamp-3 text-[#b7c0bc]">{context.selectedText}</p></div>}<label htmlFor="chat" className="sr-only">질문</label><textarea id="chat" rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder={`${paper.title}에 관해 질문하세요…`} className="w-full resize-none rounded-xl border border-[var(--line)] bg-[#151b18] p-3 text-sm"/><div className="mt-2 flex items-center justify-between"><span className="text-xs text-[var(--muted)]">문맥: p.{context.page}</span><div className="flex gap-2"><button type="button" onClick={() => void openChatGpt()} className="rounded-lg border border-[#557a63] px-3 py-2 text-sm text-[var(--accent)]">ChatGPT Plus로 질문</button><button className="rounded-lg bg-[#b2d9be] px-3 py-2 text-sm font-medium text-[#0c120e]">사이트 AI</button></div></div></form>
  </aside>;
}
