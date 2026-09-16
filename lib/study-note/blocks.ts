export type StudyNoteBlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "number"
  | "quote"
  | "code"
  | "math"
  | "divider"
  | "image"
  | "markdown";

export type StudyNoteImageAlignment = "left" | "center" | "right";

export type StudyNoteBlock = {
  id: string;
  type: StudyNoteBlockType;
  text: string;
  language?: string;
  areaId?: string;
  imageWidth?: number;
  imageAlign?: StudyNoteImageAlignment;
};

const AREA_MARKER = /^\[\[PDF_AREA:([^|\]\r\n]+)(?:\|width=(\d{1,3}))?(?:\|align=(left|center|right))?\]\]$/u;
const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/u;

export function createStudyNoteBlock(type: StudyNoteBlockType = "paragraph", text = ""): StudyNoteBlock {
  return { id: createBlockId(), type, text };
}

export function parseStudyNoteMarkdown(markdown: string): StudyNoteBlock[] {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: StudyNoteBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) { index += 1; continue; }

    const area = AREA_MARKER.exec(trimmed);
    if (area) {
      blocks.push({
        id: createBlockId(),
        type: "image",
        text: "",
        areaId: area[1]?.trim(),
        imageWidth: clampImageWidth(Number(area[2] ?? 100)),
        imageAlign: (area[3] as StudyNoteImageAlignment | undefined) ?? "center",
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ id: createBlockId(), type: "code", text: body.join("\n"), language });
      continue;
    }

    if (trimmed === "$$") {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && (lines[index] ?? "").trim() !== "$$") {
        body.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ id: createBlockId(), type: "math", text: body.join("\n") });
      continue;
    }

    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      blocks.push({ id: createBlockId(), type: "math", text: trimmed.slice(2, -2).trim() });
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    if (heading) {
      blocks.push({ id: createBlockId(), type: `heading${heading[1].length}` as StudyNoteBlockType, text: heading[2] ?? "" });
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/u.test(line)) {
      blocks.push({ id: createBlockId(), type: "divider", text: "" });
      index += 1;
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.+)$/u.exec(line);
    if (bullet) {
      blocks.push({ id: createBlockId(), type: "bullet", text: bullet[1] ?? "" });
      index += 1;
      continue;
    }

    const numbered = /^\s*\d+\.\s+(.+)$/u.exec(line);
    if (numbered) {
      blocks.push({ id: createBlockId(), type: "number", text: numbered[1] ?? "" });
      index += 1;
      continue;
    }

    if (/^\s*>/u.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^\s*>/u.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(/^\s*>\s?/u, ""));
        index += 1;
      }
      blocks.push({ id: createBlockId(), type: "quote", text: body.join("\n") });
      continue;
    }

    if (line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? "")) {
      const body: string[] = [line, lines[index + 1] ?? ""];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").trim() && (lines[index] ?? "").includes("|")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ id: createBlockId(), type: "markdown", text: body.join("\n") });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (!next.trim() || isBlockStart(next, lines[index + 1] ?? "")) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ id: createBlockId(), type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks.length ? blocks : [createStudyNoteBlock()];
}

export function serializeStudyNoteBlocks(blocks: StudyNoteBlock[]): string {
  return blocks.map(serializeBlock).filter(Boolean).join("\n\n").trim();
}

export function clampImageWidth(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(25, Math.round(value)));
}

function serializeBlock(block: StudyNoteBlock): string {
  switch (block.type) {
    case "heading1": return `# ${block.text}`;
    case "heading2": return `## ${block.text}`;
    case "heading3": return `### ${block.text}`;
    case "bullet": return `- ${block.text.replace(/\n/gu, "\n  ")}`;
    case "number": return `1. ${block.text.replace(/\n/gu, "\n   ")}`;
    case "quote": return block.text.split("\n").map((line) => `> ${line}`).join("\n");
    case "code": return `\`\`\`${block.language ?? ""}\n${block.text}\n\`\`\``;
    case "math": return `$$\n${block.text}\n$$`;
    case "divider": return "---";
    case "image": {
      if (!block.areaId) return "";
      const width = clampImageWidth(block.imageWidth ?? 100);
      const align = block.imageAlign ?? "center";
      return `[[PDF_AREA:${block.areaId}|width=${width}|align=${align}]]`;
    }
    case "markdown":
    case "paragraph":
    default: return block.text;
  }
}

function isBlockStart(line: string, nextLine: string): boolean {
  const trimmed = line.trim();
  return Boolean(
    AREA_MARKER.test(trimmed)
    || trimmed.startsWith("```")
    || trimmed.startsWith("$$")
    || /^(#{1,3})\s+/u.test(line)
    || /^\s*(?:---+|\*\*\*+|___+)\s*$/u.test(line)
    || /^\s*[-*+]\s+/u.test(line)
    || /^\s*\d+\.\s+/u.test(line)
    || /^\s*>/u.test(line)
    || (line.includes("|") && TABLE_SEPARATOR.test(nextLine))
  );
}

function createBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
