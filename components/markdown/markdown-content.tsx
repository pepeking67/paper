"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export function MarkdownContent({ content, compact = false }: { content: string; compact?: boolean }) {
  return <div className={`markdown-content ${compact ? "markdown-content-compact" : ""}`}>
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
      {content}
    </ReactMarkdown>
  </div>;
}
