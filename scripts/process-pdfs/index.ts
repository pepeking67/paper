import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

type Chunk = {
  paperId: string;
  page: number;
  section: string | null;
  text: string;
  tokenEstimate: number;
  qualityFlags: string[];
};

type PageWarning = {
  page: number;
  flags: string[];
};

const [paperId, pdfFile] = process.argv.slice(2);

if (!paperId || !pdfFile) {
  throw new Error(
    "Usage: npm run process-pdfs -- <paper-id> <local.pdf>",
  );
}

const bytes = new Uint8Array(await readFile(pdfFile));
if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
  throw new Error("Input is not a PDF");
}

const pdf = await getDocument({ data: bytes }).promise;
const root = path.resolve("data/processed", paperId);
await mkdir(path.join(root, "pages"), { recursive: true });

const chunks: Chunk[] = [];
const warnings: PageWarning[] = [];

for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const flags: string[] = [];
  if (text.length < 80) flags.push("possible-ocr-required");
  if (/[∑∫√]|\s{4,}/.test(text)) flags.push("complex-layout-or-math");
  if (flags.length > 0) warnings.push({ page: pageNumber, flags });

  await writeFile(
    path.join(root, "pages", `${String(pageNumber).padStart(3, "0")}.txt`),
    `${text}\n`,
  );

  const paragraphs = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  let buffer = "";
  for (const paragraph of paragraphs) {
    if (buffer.length + paragraph.length > 2_400 && buffer) {
      chunks.push(makeChunk(paperId, pageNumber, buffer, flags));
      buffer = "";
    }
    buffer += `${buffer ? " " : ""}${paragraph}`;
  }
  if (buffer) chunks.push(makeChunk(paperId, pageNumber, buffer, flags));
}

await writeFile(
  path.join(root, "chunks.jsonl"),
  `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`,
);
await writeFile(
  path.join(root, "document.json"),
  `${JSON.stringify(
    {
      paperId,
      pages: pdf.numPages,
      chunks: chunks.length,
      generatedAt: new Date().toISOString(),
      warnings,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `processed ${paperId}: ${pdf.numPages} pages, ${chunks.length} chunks`,
);

function makeChunk(
  id: string,
  page: number,
  text: string,
  qualityFlags: string[],
): Chunk {
  return {
    paperId: id,
    page,
    section: null,
    text,
    tokenEstimate: Math.ceil(text.length / 4),
    qualityFlags,
  };
}
