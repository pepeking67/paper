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

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  sourcePage?: number;
  sourceText?: string;
};

export interface AiProvider {
  answer(message: string, context: StudyContext, history?: ChatTurn[]): Promise<string>;
  composeStudyNote(material: string, areas?: StudyAreaContext[]): Promise<string>;
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
    const parts: GeminiPart[] = [{ text: buildStudyPrompt(message, context, history) }];
    appendAreaImages(parts, context.selectedAreas);
    return this.generate(
      parts,
      "You are a careful paper-study assistant. Use only the supplied paper context and attached PDF-area images for paper-specific claims. When an image contains an equation, figure, table, or diagram, inspect the image directly rather than guessing from nearby text. Clearly label uncertainty and do not invent quotations. Answer naturally in the user's language. Format answers as clean GitHub-flavored Markdown. Use headings only when useful, bullet or numbered lists for structure, Markdown tables when comparison helps, fenced code blocks for code, blockquotes for key quotations, and LaTeX math using $...$ for inline equations or $$...$$ for display equations. Never wrap the entire answer in a Markdown code fence.",
      0.2,
    );
  }

  async composeStudyNote(material: string, areas: StudyAreaContext[] = []): Promise<string> {
    const parts: GeminiPart[] = [{
      text: `Create a polished paper study note from the following deliberately saved study material. Use the paper's natural section order only as the document skeleton. The actual content must be selected primarily from the learner's underlines, highlights, selected PDF areas, and attached memos. Do not turn this into a generic full-paper summary just because a section exists in the paper. Reorganize the learner-marked evidence into the most appropriate paper sections and preserve the paper's conceptual/mechanism flow. Saved Insights are deliberate Q&A about places where the learner had questions; use them only as supplemental clarification inside the relevant section, not as a separate Q&A section and not as a new primary topic disconnected from marked evidence. Prefer paper annotations and inspected PDF-area images over Q&A answers when they conflict. Preserve useful page references, uncertainty, equations, and the learner's priorities. PDF area images have stable markers in the form [[PDF_AREA:<id>]]. When an area image is useful in the note, place its exact marker on its own line near the explanation. Never invent a URL and never use normal Markdown image syntax for an attached PDF area.\n\n${material.slice(0, 60_000)}`,
    }];
    appendAreaImages(parts, areas);
    return this.generate(
      parts,
      "You turn paper-reading records into a durable personal paper note that resembles a concise Notion research page. Return only the note itself in clean GitHub-flavored Markdown, with no preamble. The paper's natural section order is the skeleton; the learner's annotations are the content-selection signal. Build sections in paper order, but fill them primarily with underlines, highlights, selected PDF areas, and learner memos. Do not produce a generic full-paper summary or fill unmarked sections merely for completeness. Start with # Introduction when supported, then use the paper's own natural top-level heading such as # Model, # Architecture, or # Method, with ## / ### headings in actual processing or conceptual order. Follow with # Training / # Data only if relevant, then # Experiments with paper-order subsections such as setup, main results, generalization, robustness, analysis, or ablation. Add # Limitations and # Conclusion only when supplied evidence supports them. Treat Saved Insights as supplemental clarification for places where the learner had questions: integrate the useful answer into the relevant concept after the marked-paper explanation, never as a general Q&A section, and do not let Q&A introduce a new main topic that is disconnected from annotations. If a Saved Insight conflicts with marked source text or an inspected PDF area, prefer the paper evidence and mark uncertainty briefly. Keep prose concise and direct like research notes, emphasize key concepts with bold, keep useful page references, and place equations close to their explanations using $...$ and $...$. Use tables or lists only when they improve clarity. When an attached PDF area contains an equation, figure, or table, inspect it directly and, when it belongs in the final note, put the exact supplied [[PDF_AREA:<id>]] marker on a standalone line immediately beside the relevant explanation. Do not output ![...](...) for attached PDF areas and do not invent image URLs. If evidence is insufficient, omit the section or clearly mark uncertainty rather than guessing. Never wrap the entire document in a code fence.",
      0.15,
    );
  }

  private async generate(parts: GeminiPart[], systemInstruction: string, temperature: number): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        signal: controller.signal,
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature },
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

function appendAreaImages(parts: GeminiPart[], areas: StudyAreaContext[] | undefined) {
  for (const area of areas?.slice(0, 4) ?? []) {
    const image = parseImageDataUrl(area.imageDataUrl);
    if (!image) continue;
    const marker = area.id ? `[[PDF_AREA:${area.id}]]` : "(no marker)";
    parts.push({ text: `Selected PDF area from page ${area.page}. Stable note marker: ${marker}. Inspect this image directly as part of the study material.` });
    parts.push({ inlineData: image });
  }
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
