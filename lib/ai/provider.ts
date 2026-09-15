export type StudyAreaContext = {
  id?: string;
  page: number;
  imageDataUrl: string;
};

export type StudyContext = {
  paperId: string;
  page: number;
  selectedText?: string;
  selectedAreas?: StudyAreaContext[];
  pageText?: string;
  chunks?: Array<{ page: number; section: string | null; text: string }>;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export interface AiProvider {
  answer(message: string, context: StudyContext, history?: ChatTurn[]): Promise<string>;
}

export function getAiProvider(): AiProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return null;
  return new GeminiProvider(apiKey, model);
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

class GeminiProvider implements AiProvider {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async answer(message: string, context: StudyContext, history: ChatTurn[] = []): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const parts: GeminiPart[] = [{ text: buildStudyPrompt(message, context, history) }];
      for (const area of context.selectedAreas?.slice(0, 4) ?? []) {
        const image = parseImageDataUrl(area.imageDataUrl);
        if (!image) continue;
        parts.push({ text: `Selected PDF area from page ${area.page}. Analyze this image as part of the user's paper context.` });
        parts.push({ inlineData: image });
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        signal: controller.signal,
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You are a careful paper-study assistant. Use only the supplied paper context and attached PDF-area images for paper-specific claims. When an image contains an equation, figure, table, or diagram, inspect the image directly rather than guessing from nearby text. Clearly label uncertainty, do not invent quotations, and answer naturally in the user's language." }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
      const data: unknown = await response.json();
      const text = extractOutputText(data);
      if (!text) throw new Error("GEMINI_EMPTY_RESPONSE");
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
  const selectedAreas = context.selectedAreas?.slice(0, 4) ?? [];
  const areaDescription = selectedAreas.length
    ? `Selected PDF areas attached as images:\n${selectedAreas.map((area, index) => `Area ${index + 1}: page ${area.page}`).join("\n")}`
    : "";

  return [
    `Paper ID: ${context.paperId}`,
    `Current page: ${context.page}`,
    selectedText ? `Selected text:\n${selectedText}` : "",
    areaDescription,
    pageText ? `Current page text:\n${pageText}` : "",
    chunks?.length ? `Relevant chunks:\n${chunks.join("\n\n")}` : "",
    recentHistory ? `Recent conversation:\n${recentHistory}` : "",
    `Question:\n${message.trim().slice(0, 4_000)}`,
  ].filter(Boolean).join("\n\n");
}

function parseImageDataUrl(value: string): { mimeType: string; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/u.exec(value);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function extractOutputText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
  return (response.candidates ?? []).flatMap((candidate) => candidate.content?.parts ?? []).filter((part) => typeof part.text === "string").map((part) => part.text as string).join("\n").trim();
}
