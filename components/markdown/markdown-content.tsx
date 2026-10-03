"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeRenderedMarkdown } from "@/lib/markdown/normalize";

export function MarkdownContent({
  content,
  compact = false,
  variant = "default",
}: {
  content: string;
  compact?: boolean;
  variant?: "default" | "pdfMemo";
}) {
  return <div className={`markdown-content ${compact ? "markdown-content-compact" : ""} ${variant === "pdfMemo" ? "markdown-content-pdf-memo" : ""}`}>
    <ReactMarkdown
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
      {normalizeRenderedMarkdown(content)}
    </ReactMarkdown>
  </div>;
}
