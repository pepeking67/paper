"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type EmbeddedPdfArea = {
  id: string;
  page: number;
  imageDataUrl: string;
};

type MarkdownSegment =
  | { kind: "markdown"; value: string }
  | { kind: "area"; id: string; width: number; align: "left" | "center" | "right" };

export function MarkdownContent({
  content,
  compact = false,
  areas = [],
}: {
  content: string;
  compact?: boolean;
  areas?: EmbeddedPdfArea[];
}) {
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const segments = splitPdfAreaMarkers(content);

  return <div className={`markdown-content ${compact ? "markdown-content-compact" : ""}`}>
    {segments.map((segment, index) => {
      if (segment.kind === "area") {
        const area = areaById.get(segment.id);
        if (!area) {
          return <div key={`missing-area-${segment.id}-${index}`} className="my-4 rounded-xl border border-dashed border-[var(--line)] bg-white/5 p-3 text-xs text-[var(--muted)]" role="note">
            저장된 PDF 영역을 찾을 수 없습니다. PDF에서 해당 영역이 지워졌다면 노트를 다시 생성하세요.
          </div>;
        }
        const marginClass = segment.align === "left" ? "mr-auto" : segment.align === "right" ? "ml-auto" : "mx-auto";
        return <figure
          key={`area-${segment.id}-${index}`}
          className={`my-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-white/5 ${marginClass}`}
          style={{ width: `${segment.width}%` }}
        >
          <img src={area.imageDataUrl} alt={`PDF ${area.page}페이지에서 저장한 영역`} className="block max-h-[70vh] w-full bg-white object-contain" />
          <figcaption className="border-t border-[var(--line)] px-3 py-2 text-[11px] text-[var(--muted)]">PDF p.{area.page} · 저장한 영역</figcaption>
        </figure>;
      }

      if (!segment.value) return null;
      return <ReactMarkdown
        key={`markdown-${index}`}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
          table: ({ children, ...props }) => <div className="markdown-table-wrap"><table {...props}>{children}</table></div>,
          code: ({ className, children, ...props }) => {
            const block = Boolean(className?.startsWith("language-"));
            return block
              ? <code {...props} className={className}>{children}</code>
              : <code {...props} className="markdown-inline-code">{children}</code>;
          },
        }}
      >
        {segment.value}
      </ReactMarkdown>;
    })}
  </div>;
}

function splitPdfAreaMarkers(content: string): MarkdownSegment[] {
  // Gemini emits [[PDF_AREA:id]]. The block editor may extend the same marker
  // with presentation metadata while keeping the stable area id intact.
  const normalized = content
    .replace(/!\[[^\]]*\]\(\s*(\[\[PDF_AREA:[^\]\r\n]+\]\])\s*\)/gu, "$1")
    .replace(/<img[^>]+(?:src|alt)=["'][^"']*(\[\[PDF_AREA:[^\]\r\n]+\]\])[^"']*["'][^>]*>/gu, "$1");
  const pattern = /\[\[PDF_AREA:([^|\]\r\n]+)(?:\|width=(\d{1,3}))?(?:\|align=(left|center|right))?\]\]/gu;
  const segments: MarkdownSegment[] = [];
  let cursor = 0;

  for (const match of normalized.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: "markdown", value: normalized.slice(cursor, start) });
    const id = match[1]?.trim();
    if (id) {
      const parsedWidth = Number(match[2] ?? 100);
      const width = Number.isFinite(parsedWidth) ? Math.min(100, Math.max(25, Math.round(parsedWidth))) : 100;
      const align = (match[3] as "left" | "center" | "right" | undefined) ?? "center";
      segments.push({ kind: "area", id, width, align });
    }
    cursor = start + match[0].length;
  }

  if (cursor < normalized.length) segments.push({ kind: "markdown", value: normalized.slice(cursor) });
  if (!segments.length) segments.push({ kind: "markdown", value: normalized });
  return segments;
}
