"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import {
  clampImageWidth,
  createStudyNoteBlock,
  parseStudyNoteMarkdown,
  serializeStudyNoteBlocks,
  type StudyNoteBlock,
  type StudyNoteBlockType,
  type StudyNoteImageAlignment,
} from "@/lib/study-note/blocks";

type EmbeddedPdfArea = { id: string; page: number; imageDataUrl: string };
type SlashContext = { query: string; start: number; end: number };
type InlineMathDraft = { base: string; insertAt: number; value: string };
type BlockCommand = {
  id: string;
  kind: "block";
  value: StudyNoteBlockType;
  label: string;
  shortcut: string;
  aliases: string[];
  icon: string;
  description: string;
  markdownHint?: string;
};
type InlineMathCommand = {
  id: "inline-math";
  kind: "inline-math";
  label: string;
  shortcut: string;
  aliases: string[];
  icon: string;
  description: string;
};
type SlashCommand = BlockCommand | InlineMathCommand;

const BLOCK_COMMANDS: BlockCommand[] = [
  { id: "paragraph", kind: "block", value: "paragraph", label: "텍스트", shortcut: "text", aliases: ["text", "paragraph", "텍스트", "본문"], icon: "T", description: "일반 텍스트 블록" },
  { id: "heading1", kind: "block", value: "heading1", label: "제목 1", shortcut: "h1", aliases: ["h1", "heading1", "heading 1", "제목1", "제목 1"], icon: "H1", description: "큰 섹션 제목", markdownHint: "# + Space" },
  { id: "heading2", kind: "block", value: "heading2", label: "제목 2", shortcut: "h2", aliases: ["h2", "heading2", "heading 2", "제목2", "제목 2"], icon: "H2", description: "중간 섹션 제목", markdownHint: "## + Space" },
  { id: "heading3", kind: "block", value: "heading3", label: "제목 3", shortcut: "h3", aliases: ["h3", "heading3", "heading 3", "제목3", "제목 3"], icon: "H3", description: "작은 섹션 제목", markdownHint: "### + Space" },
  { id: "bullet", kind: "block", value: "bullet", label: "글머리 기호", shortcut: "bullet", aliases: ["bullet", "bulleted", "list", "글머리", "목록"], icon: "•", description: "글머리 목록", markdownHint: "- + Space" },
  { id: "number", kind: "block", value: "number", label: "번호 목록", shortcut: "number", aliases: ["number", "numbered", "ordered", "번호", "번호목록"], icon: "1.", description: "번호가 있는 목록", markdownHint: "1. + Space" },
  { id: "todo", kind: "block", value: "todo", label: "할 일", shortcut: "todo", aliases: ["todo", "to-do", "check", "checkbox", "checklist", "할일", "체크"], icon: "☐", description: "체크 가능한 할 일", markdownHint: "[ ] + Space" },
  { id: "quote", kind: "block", value: "quote", label: "인용", shortcut: "quote", aliases: ["quote", "blockquote", "callout", "인용", "콜아웃"], icon: "❝", description: "인용/강조 블록", markdownHint: "> + Space" },
  { id: "code", kind: "block", value: "code", label: "코드", shortcut: "code", aliases: ["code", "code block", "python", "코드", "코드블록"], icon: "</>", description: "Python이 기본인 코드 블록", markdownHint: "``` + Space" },
  { id: "math", kind: "block", value: "math", label: "블록 수식", shortcut: "equation", aliases: ["equation", "block equation", "math", "latex", "블록수식", "수식", "공식"], icon: "∑", description: "한 줄 전체를 사용하는 LaTeX 수식", markdownHint: "$$ + Space" },
  { id: "divider", kind: "block", value: "divider", label: "구분선", shortcut: "divider", aliases: ["divider", "line", "separator", "구분선", "선"], icon: "—", description: "섹션 구분선", markdownHint: "--- + Space" },
];

const INLINE_MATH_COMMAND: InlineMathCommand = {
  id: "inline-math",
  kind: "inline-math",
  label: "인라인 수식",
  shortcut: "inline-equation",
  aliases: ["inline equation", "inline-equation", "inline math", "inline-math", "inline", "인라인수식", "인라인 수식"],
  icon: "x",
  description: "문장 안에 들어가는 LaTeX 수식",
};

const SLASH_COMMANDS: SlashCommand[] = [...BLOCK_COMMANDS, INLINE_MATH_COMMAND];

const SPACE_BLOCK_SHORTCUTS: Record<string, StudyNoteBlockType> = {
  "#": "heading1",
  "##": "heading2",
  "###": "heading3",
  "-": "bullet",
  "*": "bullet",
  "+": "bullet",
  "1.": "number",
  ">": "quote",
  "[]": "todo",
  "[ ]": "todo",
  "```": "code",
  "$$": "math",
  "---": "divider",
  "***": "divider",
  "___": "divider",
};

export function NotionNoteEditor({ value, areas, onChange }: {
  value: string;
  areas: EmbeddedPdfArea[];
  onChange: (markdown: string) => void;
}) {
  const [blocks, setBlocks] = useState<StudyNoteBlock[]>(() => normalizeBlocks(parseStudyNoteMarkdown(value)));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const lastEmitted = useRef(value);
  const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setBlocks(normalizeBlocks(parseStudyNoteMarkdown(value)));
    setActiveId(null);
    setMenuId(null);
    lastEmitted.current = value;
  }, [value]);

  function commit(next: StudyNoteBlock[]) {
    setBlocks(next);
    const markdown = serializeStudyNoteBlocks(next);
    lastEmitted.current = markdown;
    onChange(markdown);
  }

  function patchBlock(index: number, patch: Partial<StudyNoteBlock>) {
    commit(blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block));
  }

  function focusBlock(id: string) {
    setActiveId(id);
    requestAnimationFrame(() => {
      const block = document.querySelector<HTMLElement>(`[data-note-block-id="${id}"]`);
      block?.querySelector<HTMLElement>("[contenteditable='true'], textarea, input[type='text']")?.focus();
    });
  }

  function insertBlock(index: number, block = createStudyNoteBlock()) {
    const next = [...blocks];
    next.splice(index, 0, block);
    commit(next);
    setMenuId(null);
    focusBlock(block.id);
  }

  function removeBlock(index: number) {
    if (blocks.length === 1) {
      const replacement = createStudyNoteBlock();
      commit([replacement]);
      focusBlock(replacement.id);
      return;
    }
    const next = blocks.filter((_, blockIndex) => blockIndex !== index);
    const fallback = next[Math.min(index, next.length - 1)];
    commit(next);
    if (fallback) focusBlock(fallback.id);
  }

  function duplicateBlock(index: number) {
    const source = blocks[index];
    if (!source) return;
    insertBlock(index + 1, { ...source, id: createStudyNoteBlock().id });
  }

  function moveBlock(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    commit(next);
    setActiveId(moved.id);
  }

  function convertBlock(index: number, type: StudyNoteBlockType, textOverride?: string) {
    const block = blocks[index];
    if (!block) return;
    const next: StudyNoteBlock = {
      ...block,
      type,
      text: type === "divider" ? "" : (textOverride ?? block.text),
      checked: type === "todo" ? Boolean(block.checked) : undefined,
      language: type === "code" ? (block.language?.trim() || "python") : undefined,
    };
    commit(blocks.map((item, blockIndex) => blockIndex === index ? next : item));
    setMenuId(null);
    if (type !== "divider") focusBlock(block.id);
  }

  return <div className="scrollbar h-full overflow-y-auto bg-[#151516] px-3 py-5 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-[820px] pb-28">
      <div className="mb-6 flex items-center justify-between gap-3 px-2 text-[11px] text-[var(--muted)]">
        <span>Notion식 입력 · #/##/### 뒤 Space · / 명령은 문장 중간에서도 사용 · 인라인/블록 수식 지원</span>
        <span className="hidden sm:inline">자동 저장</span>
      </div>

      <div className="space-y-0.5">
        {blocks.map((block, index) => {
          const active = activeId === block.id;
          const dragging = dragIndex === index;
          const dropTarget = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
          return <div
            key={block.id}
            data-note-block-id={block.id}
            draggable
            onDragStart={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("button, input, textarea, a, [contenteditable='true']")) {
                event.preventDefault();
                return;
              }
              setDragIndex(index);
              setDragOverIndex(index);
              setMenuId(null);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", block.id);
            }}
            onDragEnter={(event) => { event.preventDefault(); if (dragIndex !== null) setDragOverIndex(index); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) moveBlock(dragIndex, index);
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
            onContextMenu={(event) => {
              event.preventDefault();
              setActiveId(block.id);
              setMenuId((current) => current === block.id ? null : block.id);
            }}
            onMouseDown={() => { if (!active) setActiveId(block.id); }}
            className={`group relative rounded-md px-3 py-1.5 transition-all ${dragging ? "opacity-40" : ""} ${dropTarget ? "ring-1 ring-[var(--accent)]/70" : ""} ${active ? "bg-white/[.025]" : "hover:bg-white/[.045]"}`}
          >
            <button
              type="button"
              aria-label="블록 메뉴"
              title="블록 메뉴"
              onClick={(event) => { event.stopPropagation(); setMenuId((current) => current === block.id ? null : block.id); }}
              className="absolute right-1 top-1 z-20 grid h-7 w-7 place-items-center rounded-md text-lg leading-none text-[var(--muted)] opacity-0 transition-opacity hover:bg-white/[.08] hover:text-white group-hover:opacity-100 group-focus-within:opacity-100"
            >⋯</button>

            {menuId === block.id && <BlockMenu
              block={block}
              onType={(type) => convertBlock(index, type)}
              onDuplicate={() => { duplicateBlock(index); setMenuId(null); }}
              onDelete={() => { removeBlock(index); setMenuId(null); }}
              onClose={() => setMenuId(null)}
            />}

            {block.type === "image" ? <ImageBlock
              block={block}
              active={active}
              area={block.areaId ? areaById.get(block.areaId) : undefined}
              onActivate={() => setActiveId(block.id)}
              onChange={(patch) => patchBlock(index, patch)}
            /> : block.type === "divider" ? <div className="py-3"><hr className="border-0 border-t border-[var(--line)]" /></div> : block.type === "math" ? <MathBlock
              block={block}
              active={active}
              onActivate={() => setActiveId(block.id)}
              onChange={(text) => patchBlock(index, { text })}
            /> : block.type === "code" || block.type === "markdown" ? <SourceBlock
              block={block}
              active={active}
              onActivate={() => setActiveId(block.id)}
              onChange={(text) => patchBlock(index, { text })}
              onLanguageChange={(language) => patchBlock(index, { language })}
            /> : <RichTextBlock
              block={block}
              active={active}
              onActivate={() => setActiveId(block.id)}
              onChange={(text) => patchBlock(index, { text })}
              onToggleTodo={() => patchBlock(index, { checked: !block.checked })}
              onConvert={(type, text) => convertBlock(index, type, text)}
              onSplit={(before, after) => {
                const next = [...blocks];
                next[index] = { ...block, text: before };
                const continuationType = (["bullet", "number", "todo"].includes(block.type) ? block.type : "paragraph") as StudyNoteBlockType;
                const continuation = createStudyNoteBlock(continuationType, after);
                next.splice(index + 1, 0, continuation);
                commit(next);
                focusBlock(continuation.id);
              }}
              onEmptyBackspace={() => {
                if (block.type !== "paragraph") patchBlock(index, { type: "paragraph", checked: undefined, language: undefined });
                else removeBlock(index);
              }}
            />}
          </div>;
        })}
      </div>

      <button type="button" onClick={() => insertBlock(blocks.length)} className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--muted)] opacity-60 transition hover:bg-white/[.03] hover:text-white"><span className="text-lg">+</span><span>새 블록</span></button>
    </div>
  </div>;
}

function RichTextBlock({ block, active, onActivate, onChange, onToggleTodo, onConvert, onSplit, onEmptyBackspace }: {
  block: StudyNoteBlock;
  active: boolean;
  onActivate: () => void;
  onChange: (text: string) => void;
  onToggleTodo: () => void;
  onConvert: (type: StudyNoteBlockType, text?: string) => void;
  onSplit: (before: string, after: string) => void;
  onEmptyBackspace: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [slashContext, setSlashContext] = useState<SlashContext | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [inlineMathDraft, setInlineMathDraft] = useState<InlineMathDraft | null>(null);
  const slashOptions = slashContext ? getSlashOptions(slashContext.query) : [];

  useEffect(() => { setSlashIndex(0); }, [slashContext?.query]);

  useEffect(() => {
    const node = ref.current;
    if (!node || document.activeElement === node) return;
    const html = inlineMarkdownToHtml(block.text);
    if (node.innerHTML !== html) node.innerHTML = html;
  }, [block.text, block.type]);

  function refreshSlashContext(markdown?: string) {
    const node = ref.current;
    if (!node) return;
    const value = markdown ?? domChildrenToMarkdown(node).replace(/\n$/u, "");
    setSlashContext(detectSlashContext(node, value));
  }

  function syncFromDom() {
    const node = ref.current;
    if (!node) return;
    const markdown = domChildrenToMarkdown(node).replace(/\n$/u, "");
    onChange(markdown);
    setSlashContext(detectSlashContext(node, markdown));
  }

  function rerenderFormatting() {
    const node = ref.current;
    if (!node || inlineMathDraft) return;
    const markdown = domChildrenToMarkdown(node).replace(/\n$/u, "");
    node.innerHTML = inlineMarkdownToHtml(markdown);
    setSlashContext(null);
  }

  function runCommand(command: "bold" | "italic" | "code") {
    const node = ref.current;
    if (!node) return;
    node.focus();
    if (command === "bold") document.execCommand("bold");
    if (command === "italic") document.execCommand("italic");
    if (command === "code") wrapSelectionWithCode();
    syncFromDom();
  }

  function applySlashCommand(option: SlashCommand) {
    const node = ref.current;
    if (!node) return;
    const markdown = domChildrenToMarkdown(node).replace(/\n$/u, "");
    const context = detectSlashContext(node, markdown) ?? slashContext;
    if (!context) return;
    const nextText = removeSlashCommand(markdown, context);
    setSlashContext(null);

    if (option.kind === "inline-math") {
      onChange(nextText);
      node.innerHTML = inlineMarkdownToHtml(nextText);
      setInlineMathDraft({ base: nextText, insertAt: Math.min(context.start, nextText.length), value: "" });
      return;
    }

    node.innerHTML = option.value === "divider" ? "" : inlineMarkdownToHtml(nextText);
    onConvert(option.value, nextText);
  }

  function commitInlineMath() {
    const node = ref.current;
    const draft = inlineMathDraft;
    if (!node || !draft) return;
    const latex = draft.value.trim();
    if (!latex) {
      setInlineMathDraft(null);
      node.focus();
      return;
    }
    const inline = `$${latex}$`;
    const next = `${draft.base.slice(0, draft.insertAt)}${inline}${draft.base.slice(draft.insertAt)}`;
    onChange(next);
    node.innerHTML = inlineMarkdownToHtml(next);
    setInlineMathDraft(null);
    requestAnimationFrame(() => {
      node.focus();
      placeCaretAfterInlineMath(node, latex);
    });
  }

  const typography = block.type === "heading1"
    ? "text-[32px] font-bold leading-[1.2] tracking-[-.03em]"
    : block.type === "heading2"
      ? "text-[25px] font-semibold leading-[1.25] tracking-[-.025em]"
      : block.type === "heading3"
        ? "text-[20px] font-semibold leading-[1.35]"
        : block.type === "quote"
          ? "border-l-[3px] border-[#8e8e93] pl-4 text-[16px] leading-7 text-[#d7d7dc]"
          : "text-[15.5px] leading-7";

  const listPadding = block.type === "bullet" || block.type === "number" || block.type === "todo" ? "pl-8" : "";

  return <div className="relative py-0.5" onClick={onActivate}>
    {active && <FloatingInlineToolbar onBold={() => runCommand("bold")} onItalic={() => runCommand("italic")} onCode={() => runCommand("code")} />}
    {block.type === "bullet" && <span className="pointer-events-none absolute left-1 top-[8px] text-base text-[#d7d7dc]">•</span>}
    {block.type === "number" && <span className="pointer-events-none absolute left-0 top-[9px] min-w-6 text-right text-sm text-[#d7d7dc]">1.</span>}
    {block.type === "todo" && <input
      type="checkbox"
      checked={Boolean(block.checked)}
      onChange={onToggleTodo}
      onClick={(event) => event.stopPropagation()}
      aria-label="할 일 완료"
      className="absolute left-1 top-[9px] h-4 w-4 accent-[var(--accent)]"
    />}
    {!block.text && !active && <span className="pointer-events-none absolute left-2 top-2 text-[15px] text-white/20">클릭해서 입력하거나 / 로 블록을 추가하세요.</span>}
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="노트 블록 편집"
      spellCheck
      onFocus={() => { onActivate(); requestAnimationFrame(() => refreshSlashContext()); }}
      onInput={syncFromDom}
      onClick={() => requestAnimationFrame(() => refreshSlashContext())}
      onKeyUp={(event) => {
        if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key) && slashContext) return;
        refreshSlashContext();
      }}
      onBlur={rerenderFormatting}
      onDragStart={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const node = event.currentTarget;
        const markdown = domChildrenToMarkdown(node).replace(/\n$/u, "");
        const liveSlashContext = detectSlashContext(node, markdown) ?? slashContext;
        const liveOptions = liveSlashContext ? getSlashOptions(liveSlashContext.query) : [];

        if (event.key === "Escape") {
          if (inlineMathDraft) { setInlineMathDraft(null); return; }
          setSlashContext(null);
          event.currentTarget.blur();
          return;
        }

        if (liveSlashContext && liveOptions.length > 0) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSlashIndex((current) => (current + 1) % liveOptions.length);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSlashIndex((current) => (current - 1 + liveOptions.length) % liveOptions.length);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const exact = findExactSlashOption(liveSlashContext.query);
            applySlashCommand(exact ?? liveOptions[slashIndex] ?? liveOptions[0]!);
            return;
          }
        }

        if (event.key === " " && isCaretAtEnd(node)) {
          const shortcutType = SPACE_BLOCK_SHORTCUTS[markdown.trim()];
          if (block.type === "paragraph" && shortcutType) {
            event.preventDefault();
            node.innerHTML = "";
            setSlashContext(null);
            onConvert(shortcutType, "");
            return;
          }
          if (hasCompletedInlineMarkdown(markdown)) {
            event.preventDefault();
            const next = `${markdown} `;
            onChange(next);
            node.innerHTML = inlineMarkdownToHtml(next);
            placeCaretAtEnd(node);
            return;
          }
        }

        if (event.key === "Enter" && !event.shiftKey && block.type === "paragraph" && isThematicMarkdown(markdown)) {
          event.preventDefault();
          node.innerHTML = "";
          onConvert("divider", "");
          return;
        }

        if (event.key === "Backspace" && !markdown) {
          event.preventDefault();
          onEmptyBackspace();
          return;
        }
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        const split = splitEditableAtSelection(event.currentTarget);
        onSplit(split?.before ?? block.text, split?.after ?? "");
      }}
      className={`min-h-8 w-full cursor-text whitespace-pre-wrap break-words rounded-sm px-2 py-1 text-white outline-none ${listPadding} ${block.type === "todo" && block.checked ? "text-white/50 line-through" : ""} ${typography}`}
    />

    {slashContext && slashOptions.length > 0 && !inlineMathDraft && <SlashMenu
      options={slashOptions}
      selectedIndex={Math.min(slashIndex, Math.max(0, slashOptions.length - 1))}
      onSelect={applySlashCommand}
    />}

    {inlineMathDraft && <InlineMathComposer
      value={inlineMathDraft.value}
      onChange={(value) => setInlineMathDraft((current) => current ? { ...current, value } : current)}
      onSubmit={commitInlineMath}
      onCancel={() => { setInlineMathDraft(null); ref.current?.focus(); }}
    />}
  </div>;
}

function FloatingInlineToolbar({ onBold, onItalic, onCode }: { onBold: () => void; onItalic: () => void; onCode: () => void }) {
  return <div className="absolute -top-8 left-2 z-30 flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#252527] p-1 shadow-xl">
    <ToolbarButton label="굵게" onMouseDown={onBold}><strong>B</strong></ToolbarButton>
    <ToolbarButton label="기울임" onMouseDown={onItalic}><em>I</em></ToolbarButton>
    <ToolbarButton label="인라인 코드" onMouseDown={onCode}><span className="font-mono">&lt;/&gt;</span></ToolbarButton>
  </div>;
}

function ToolbarButton({ label, onMouseDown, children }: { label: string; onMouseDown: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onMouseDown={(event) => { event.preventDefault(); onMouseDown(); }} className="grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs text-[#e5e5ea] hover:bg-white/10">{children}</button>;
}

function SourceBlock({ block, active, onActivate, onChange, onLanguageChange }: {
  block: StudyNoteBlock;
  active: boolean;
  onActivate: () => void;
  onChange: (text: string) => void;
  onLanguageChange: (language: string) => void;
}) {
  const markdown = serializeStudyNoteBlocks([block]);
  if (!active) return <div onClick={onActivate} className="cursor-text py-1"><MarkdownContent content={markdown} /></div>;
  return <div className="py-1">
    {block.type === "markdown" && <div className="mb-2 rounded-lg border border-white/8 bg-white/[.02] p-3"><MarkdownContent content={block.text} compact /></div>}
    {block.type === "code" && <div className="mb-1.5 flex items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted)]">Language</span>
      <input
        type="text"
        value={block.language?.trim() || "python"}
        onChange={(event) => onLanguageChange(event.target.value || "python")}
        placeholder="python"
        aria-label="코드 언어"
        className="w-44 rounded-md border border-white/8 bg-black/20 px-2 py-1 text-[11px] text-[var(--muted)] outline-none focus:border-white/15"
      />
    </div>}
    <textarea autoFocus value={block.text} onChange={(event) => onChange(event.target.value)} spellCheck={false} aria-label={block.type === "code" ? "코드 블록 편집" : "복합 Markdown 블록 편집"} className="scrollbar min-h-28 w-full resize-y rounded-lg border border-white/8 bg-black/25 p-3 font-mono text-[13px] leading-6 text-[#e5e5ea] outline-none focus:border-white/15" />
  </div>;
}

function MathBlock({ block, active, onActivate, onChange }: {
  block: StudyNoteBlock;
  active: boolean;
  onActivate: () => void;
  onChange: (text: string) => void;
}) {
  return <div onClick={onActivate} className="py-1">
    <div className="mb-1 text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted)]">Block equation</div>
    <div className="min-h-14 cursor-text rounded-lg px-2 py-2"><MarkdownContent content={serializeStudyNoteBlocks([block])} /></div>
    {active && <textarea autoFocus value={block.text} onChange={(event) => onChange(event.target.value)} spellCheck={false} aria-label="블록 LaTeX 수식 편집" placeholder="LaTeX 수식을 입력하세요" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/8 bg-black/25 p-3 font-mono text-[13px] leading-6 text-[#e5e5ea] outline-none focus:border-white/15" />}
  </div>;
}

function InlineMathComposer({ value, onChange, onSubmit, onCancel }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const preview = value.trim() ? katex.renderToString(value, { throwOnError: false, displayMode: false, output: "html" }) : "";
  return <div className="absolute left-4 top-full z-50 mt-1 w-[min(28rem,calc(100vw-4rem))] rounded-xl border border-white/10 bg-[#252527] p-3 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
    <div className="mb-2 flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">Inline equation</span><span className="text-[10px] text-white/35">Enter 적용 · Esc 취소</span></div>
    {preview && <div className="mb-2 min-h-9 rounded-lg bg-black/20 px-3 py-2 text-white" dangerouslySetInnerHTML={{ __html: preview }} />}
    <input
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); onSubmit(); }
        if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      }}
      placeholder="예: q_i = x_i W^Q"
      aria-label="인라인 LaTeX 수식"
      className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 font-mono text-[13px] text-white outline-none focus:border-[var(--accent)]/60"
    />
  </div>;
}

function BlockMenu({ block, onType, onDuplicate, onDelete, onClose }: {
  block: StudyNoteBlock;
  onType: (type: StudyNoteBlockType) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const options = block.type === "image" ? [] : BLOCK_COMMANDS;
  return <div className="absolute right-1 top-9 z-40 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#252527] p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
    {options.length > 0 && <>
      <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted)]">블록 전환</p>
      <div className="max-h-64 overflow-y-auto">{options.map((option) => <button key={option.id} type="button" onClick={() => onType(option.value)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/[.07]"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/8 bg-white/[.03] text-xs">{option.icon}</span><span className="min-w-0 flex-1"><span className="block text-xs text-white">{option.label}</span><span className="block truncate text-[10px] text-[var(--muted)]">{option.description}</span></span>{option.markdownHint && <span className="shrink-0 text-[9px] text-white/30">{option.markdownHint}</span>}</button>)}</div>
      <div className="my-1 border-t border-white/8" />
    </>}
    <button type="button" onClick={onDuplicate} className="w-full rounded-lg px-2 py-2 text-left text-xs text-[#e5e5ea] hover:bg-white/[.07]">복제</button>
    <button type="button" onClick={onDelete} className="w-full rounded-lg px-2 py-2 text-left text-xs text-[#ff6961] hover:bg-white/[.07]">삭제</button>
    <button type="button" onClick={onClose} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[10px] text-[var(--muted)] hover:bg-white/[.05]">메뉴 닫기</button>
  </div>;
}

function SlashMenu({ options, selectedIndex, onSelect }: {
  options: SlashCommand[];
  selectedIndex: number;
  onSelect: (option: SlashCommand) => void;
}) {
  return <div className="absolute left-4 top-full z-40 w-80 rounded-xl border border-white/10 bg-[#252527] p-1.5 shadow-2xl">
    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted)]">명령 · 문장 중간에서도 사용 · ↑↓ 선택 · Enter 적용</p>
    <div className="max-h-80 overflow-y-auto">{options.map((option, index) => <button
      key={option.id}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(option)}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${index === selectedIndex ? "bg-white/[.10]" : "hover:bg-white/[.08]"}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/8 bg-white/[.03] text-xs text-white">{option.icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-xs text-white">{option.label}</span><span className="block truncate text-[10px] text-[var(--muted)]">/{option.shortcut} · {option.description}</span></span>
      {option.kind === "block" && option.markdownHint && <span className="shrink-0 text-[9px] text-white/30">{option.markdownHint}</span>}
    </button>)}</div>
  </div>;
}

function ImageBlock({ block, active, area, onActivate, onChange }: {
  block: StudyNoteBlock;
  active: boolean;
  area?: EmbeddedPdfArea;
  onActivate: () => void;
  onChange: (patch: Partial<StudyNoteBlock>) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = clampImageWidth(block.imageWidth ?? 100);
  const align = block.imageAlign ?? "center";
  const marginClass = align === "left" ? "mr-auto" : align === "right" ? "ml-auto" : "mx-auto";

  function beginResize(event: React.PointerEvent<HTMLButtonElement>, edge: "left" | "right") {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
    const container = containerRef.current;
    if (!container) return;
    const startX = event.clientX;
    const startWidth = width;
    const containerWidth = Math.max(container.getBoundingClientRect().width, 1);
    const direction = edge === "right" ? 1 : -1;
    const onMove = (moveEvent: PointerEvent) => onChange({ imageWidth: clampImageWidth(startWidth + ((moveEvent.clientX - startX) / containerWidth) * 100 * direction) });
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return <div ref={containerRef} className="py-2" onClick={onActivate}>
    <div className={`relative ${marginClass}`} style={{ width: `${width}%` }}>
      {area ? <img draggable={false} src={area.imageDataUrl} alt={`PDF ${area.page}페이지에서 저장한 영역`} className={`block max-h-[62vh] w-full rounded-lg bg-white object-contain transition-shadow ${active ? "ring-2 ring-[var(--accent)]/70" : "group-hover:ring-1 group-hover:ring-white/15"}`} /> : <div className="grid min-h-36 place-items-center rounded-lg border border-dashed border-[var(--line)] text-xs text-[var(--muted)]">저장된 PDF 이미지를 찾을 수 없습니다.</div>}
      {area && <><button type="button" aria-label="이미지 왼쪽 크기 조절" onPointerDown={(event) => beginResize(event, "left")} className={`absolute -left-2 top-1/2 h-14 w-3 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-[var(--accent)] shadow transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-70"}`} /><button type="button" aria-label="이미지 오른쪽 크기 조절" onPointerDown={(event) => beginResize(event, "right")} className={`absolute -right-2 top-1/2 h-14 w-3 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-[var(--accent)] shadow transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-70"}`} /></>}
    </div>
    <div className={`mt-2 flex flex-wrap items-center justify-center gap-2 transition-opacity ${active ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"}`}>
      <span className="text-[10px] text-[var(--muted)]">{area ? `PDF p.${area.page}` : "PDF 영역"} · {width}%</span>
      <div className="flex items-center rounded-lg border border-white/8 bg-black/20 p-0.5" aria-label="이미지 정렬">{(["left", "center", "right"] as StudyNoteImageAlignment[]).map((value) => <button key={value} type="button" aria-pressed={align === value} onClick={(event) => { event.stopPropagation(); onChange({ imageAlign: value }); }} className={`rounded-md px-2 py-1 text-[10px] ${align === value ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"}`}>{value === "left" ? "왼쪽" : value === "right" ? "오른쪽" : "가운데"}</button>)}</div>
      {[40, 70, 100].map((preset) => <button key={preset} type="button" onClick={(event) => { event.stopPropagation(); onChange({ imageWidth: preset }); }} className="rounded-md px-2 py-1 text-[10px] text-[var(--muted)] hover:bg-white/[.06] hover:text-white">{preset === 40 ? "작게" : preset === 70 ? "중간" : "전체"}</button>)}
    </div>
  </div>;
}

function getSlashOptions(query: string): SlashCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((option) => [option.label, option.shortcut, option.description, ...option.aliases].join(" ").toLowerCase().includes(normalized));
}

function findExactSlashOption(query: string): SlashCommand | undefined {
  const normalized = query.trim().toLowerCase();
  return SLASH_COMMANDS.find((option) => option.shortcut.toLowerCase() === normalized || option.aliases.some((alias) => alias.toLowerCase() === normalized));
}

function detectSlashContext(root: HTMLElement, markdown: string): SlashContext | null {
  const caret = getCaretMarkdownOffset(root);
  if (caret === null) return null;
  const before = markdown.slice(0, caret);
  const match = /(?:^|[\t ])\/([^/\n]*)$/u.exec(before);
  if (!match) return null;
  const rawQuery = match[1] ?? "";
  return { query: rawQuery.trim().toLowerCase(), start: caret - rawQuery.length - 1, end: caret };
}

function removeSlashCommand(markdown: string, context: SlashContext): string {
  const before = markdown.slice(0, context.start);
  const after = markdown.slice(context.end);
  if (before.endsWith(" ") && after.startsWith(" ")) return `${before}${after.slice(1)}`;
  return `${before}${after}`;
}

function getCaretMarkdownOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.endContainer, range.endOffset);
  const holder = document.createElement("div");
  holder.append(before.cloneContents());
  return domChildrenToMarkdown(holder).replace(/\n$/u, "").length;
}

function normalizeBlocks(blocks: StudyNoteBlock[]): StudyNoteBlock[] {
  return blocks.map((block) => {
    if (["bullet", "number"].includes(block.type) && isThematicMarkdown(block.text)) return { ...block, type: "divider", text: "" };
    if (block.type === "code" && !block.language?.trim()) return { ...block, language: "python" };
    return block;
  });
}

function isThematicMarkdown(value: string): boolean {
  return /^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/u.test(value);
}

function hasCompletedInlineMarkdown(value: string): boolean {
  return /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\$[^$\n]+\$|\\\([^\n]+?\\\)|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))$/u.test(value);
}

function inlineMarkdownToHtml(value: string): string {
  if (isThematicMarkdown(value)) return '<span data-divider="true" contenteditable="false" class="my-2 block h-px w-full bg-white/15"></span>';
  const placeholders: string[] = [];
  const token = (html: string) => {
    const key = `\uE000${placeholders.length}\uE001`;
    placeholders.push(html);
    return key;
  };

  let source = value;
  source = source.replace(/`([^`\n]+)`/gu, (_match, inner: string) => token(`<code class="rounded bg-white/10 px-1 py-0.5 font-mono text-[.9em]">${escapeHtml(inner)}</code>`));
  source = source.replace(/\$([^$\n]+)\$/gu, (_match, inner: string) => token(renderInlineMath(inner)));
  source = source.replace(/\\\(([^\n]+?)\\\)/gu, (_match, inner: string) => token(renderInlineMath(inner)));

  let html = escapeHtml(source);
  html = html.replace(/\*\*([^*\n]+)\*\*/gu, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/gu, "<strong>$1</strong>");
  html = html.replace(/~~([^~\n]+)~~/gu, "<del>$1</del>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/gu, "$1<em>$2</em>");
  html = html.replace(/(^|[^_])_([^_\n]+)_(?!_)/gu, "$1<em>$2</em>");
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/gu, '<a href="$2" target="_blank" rel="noreferrer" class="text-[var(--accent)] underline underline-offset-2">$1</a>');
  html = html.replace(/\n/gu, "<br>");
  placeholders.forEach((replacement, index) => { html = html.replace(`\uE000${index}\uE001`, replacement); });
  return html;
}

function renderInlineMath(latex: string): string {
  const rendered = katex.renderToString(latex, { throwOnError: false, displayMode: false, output: "html" });
  return `<span data-inline-math="${escapeAttribute(latex)}" contenteditable="false" class="mx-0.5 inline-block align-baseline">${rendered}</span>`;
}

function domChildrenToMarkdown(node: HTMLElement): string {
  return Array.from(node.childNodes).map(domNodeToMarkdown).join("").replace(/\n{3,}/gu, "\n\n");
}

function domNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.dataset.inlineMath !== undefined) return `$${node.dataset.inlineMath ?? ""}$`;
  if (node.dataset.divider === "true") return "---";
  const children = Array.from(node.childNodes).map(domNodeToMarkdown).join("");
  switch (node.tagName) {
    case "BR": return "\n";
    case "STRONG":
    case "B": return `**${children}**`;
    case "EM":
    case "I": return `*${children}*`;
    case "DEL":
    case "S": return `~~${children}~~`;
    case "CODE": return `\`${children}\``;
    case "A": return `[${children}](${node.getAttribute("href") ?? ""})`;
    case "DIV":
    case "P": return `${children}\n`;
    default: return children;
  }
}

function splitEditableAtSelection(root: HTMLElement): { before: string; after: string } | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const beforeHolder = document.createElement("div");
  beforeHolder.append(beforeRange.cloneContents());

  const afterRange = document.createRange();
  afterRange.selectNodeContents(root);
  afterRange.setStart(range.endContainer, range.endOffset);
  const afterHolder = document.createElement("div");
  afterHolder.append(afterRange.cloneContents());

  return { before: domChildrenToMarkdown(beforeHolder), after: domChildrenToMarkdown(afterHolder) };
}

function isCaretAtEnd(root: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.endContainer)) return false;
  const after = document.createRange();
  after.selectNodeContents(root);
  after.setStart(range.endContainer, range.endOffset);
  return after.toString().length === 0;
}

function placeCaretAtEnd(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAfterInlineMath(root: HTMLElement, latex: string) {
  const selection = window.getSelection();
  if (!selection) return;
  const matches = Array.from(root.querySelectorAll<HTMLElement>("[data-inline-math]"));
  const target = [...matches].reverse().find((item) => item.dataset.inlineMath === latex) ?? matches.at(-1);
  if (!target) { placeCaretAtEnd(root); return; }
  const range = document.createRange();
  range.setStartAfter(target);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function wrapSelectionWithCode() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const code = document.createElement("code");
  code.className = "rounded bg-white/10 px-1 py-0.5 font-mono text-[.9em]";
  try {
    range.surroundContents(code);
    selection.removeAllRanges();
    const next = document.createRange();
    next.selectNodeContents(code);
    selection.addRange(next);
  } catch { /* Ignore selections that cross incompatible inline nodes. */ }
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/gu, "&#39;");
}
