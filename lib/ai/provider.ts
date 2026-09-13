export type StudyContext = {
  paperId: string;
  page: number;
  selectedText?: string;
  pageText?: string;
  chunks?: Array<{ page: number; section: string | null; text: string }>;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export interface AiProvider {
  answer(message: string, context: StudyContext, history?: ChatTurn[]): Promise<string>;
}

export function getAiProvider(): AiProvider | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAiResponsesProvider(apiKey, process.env.OPENAI_MODEL || "gpt-5.5");
}

class OpenAiResponsesProvider implements AiProvider {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async answer(message: string, context: StudyContext, history: ChatTurn[] = []): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          instructions: "You are a careful paper-study assistant. Use only the supplied paper context for paper-specific claims. Clearly label uncertainty, do not invent quotations, and answer naturally in the user's language.",
          input: buildStudyPrompt(message, context, history),
        }),
      });
      if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
      const data: unknown = await response.json();
      const text = extractOutputText(data);
      if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildStudyPrompt(message: string, context: StudyContext, history: ChatTurn[] = []): string {
  const pageText = context.pageText?.trim().slice(0, 12_000);
  const selectedText = context.selectedText?.trim().slice(0, 4_000);
  const chunks = context.chunks?.slice(0, 4).map((chunk) => `[p.${chunk.page}${chunk.section ? ` · ${chunk.section}` : ""}] ${chunk.text.slice(0, 4_000)}`);
  const recentHistory = history.slice(-8).map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content.slice(0, 3_000)}`).join("\n");
  return [
    `Paper ID: ${context.paperId}`,
    `Current page: ${context.page}`,
    selectedText ? `Selected text:\n${selectedText}` : "",
    pageText ? `Current page text:\n${pageText}` : "",
    chunks?.length ? `Relevant chunks:\n${chunks.join("\n\n")}` : "",
    recentHistory ? `Recent conversation:\n${recentHistory}` : "",
    `Question:\n${message.trim().slice(0, 4_000)}`,
  ].filter(Boolean).join("\n\n");
}

function extractOutputText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> };
  if (typeof response.output_text === "string") return response.output_text.trim();
  return (response.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text as string).join("\n").trim();
}
