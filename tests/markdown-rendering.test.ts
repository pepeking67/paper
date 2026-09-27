import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeRenderedMarkdown } from "../lib/markdown/normalize";

test("a model's full-response markdown fence is removed before rendering", () => {
  assert.equal(
    normalizeRenderedMarkdown("```markdown\n## 핵심\n\n**중요한 답변**\n```"),
    "## 핵심\n\n**중요한 답변**",
  );
});

test("real code fences inside an answer are preserved", () => {
  const answer = "설명\n\n```python\nprint('ok')\n```";
  assert.equal(normalizeRenderedMarkdown(answer), answer);
});

test("chat and PDF text memos use the shared Markdown and LaTeX renderer", async () => {
  const markdown = await readFile("components/markdown/markdown-content.tsx", "utf8");
  const chat = await readFile("components/study-chat/study-chat.tsx", "utf8");
  const page = await readFile("components/pdf-viewer/pdf-page.tsx", "utf8");

  assert.match(markdown, /normalizeRenderedMarkdown\(content\)/);
  assert.match(chat, /<MarkdownContent content=\{message\.content\} compact/);
  assert.match(page, /<MarkdownContent content=\{selection\.text\} variant="pdfMemo"/);
  assert.match(page, /\$\.\.\.\$ 또는 \$\$\.\.\.\$\$/);
  assert.match(page, /aria-label="텍스트 메모 미리보기"/);
  assert.match(page, /aria-label="새 텍스트 메모 미리보기"/);
});
