"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type BlockOption = {
  value: StudyNoteBlockType;
  label: string;
  shortcut: string;
  icon: string;
  description: string;
};

const blockOptions: BlockOption[] = [
  { value: "paragraph", label: "텍스트", shortcut: "text", icon: "T", description: "일반 텍스트 블록" },
  { value: "heading1", label: "제목 1", shortcut: "h1", icon: "H1", description: "큰 섹션 제목" },
  { value: "heading2", label: "제목 2", shortcut: "h2", icon: "H2", description: "중간 섹션 제목" },
  { value: "heading3", label: "제목 3", shortcut: "h3", icon: "H3", description: "작은 섹션 제목" },
  { value: "bullet", label: "글머리 기호", shortcut: "bullet", icon: "•", description: "글머리 목록" },
  { value: "number", label: "번호 목록", shortcut: "number", icon: "1.", description: "번호가 있는 목록" },
  { value: "quote", label: "인용", shortcut: "quote", icon: "❝", description: "강조하거나 인용할 내용" },
  { value: "code", label: "코드", shortcut: "code", icon: "</>", description: "코드 블록" },
  { value: "math", label: "수식", shortcut: "math", icon: "∑", description: "LaTeX 수식 블록" },
  { value: "divider", label: "구분선", shortcut: "divider", icon: "—", description: "섹션 구분선" },
];

export function NotionNoteEditor({ value, areas, onChange }: {
  value: string;
  areas: EmbeddedPdfArea[];
  onChange: (markdown: string) => void;
}) {
  const [blocks, setBlocks] = useState<StudyNoteBlock[]>(() => parseStudyNoteMarkdown(value));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const lastEmitted = useRef(value);
  const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setBlocks(parseStudyNoteMarkdown(value));
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
      block?.querySelector<HTMLElement>("[contenteditable='true'], textarea")?.focus();
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
  }

  function convertBlock(index: number, type: StudyNoteBlockType, clearSlash = false) {
    const block = blocks[index];
    if (!block) return;
    if (type === "divider") {
      patchBlock(index, { type, text: "" });
      setMenuId(null);
      setActiveId(block.id);
      return;
    }
    patchBlock(index, { type, text: clearSlash ? "" : block.text });
    setMenuId(null);
    focusBlock(block.id);
  }

  return <div className="scrollbar h-full overflow-y-auto bg-[#151516] px-3 py-5 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-[820px] pb-28">
      <div className="mb-6 flex items-center justify-between gap-3 px-2 text-[11px] text-[var(--muted)]">
        <span>보이는 그대로 편집됩니다 · Enter 새 블록 · Shift+Enter 줄바꿈 · / 명령</span>
        <span className="hidden sm:inline">자동 저장</span>
      </div>

      <div className="space-y-0.5">
        {blocks.map((block, index) => {
          const active = activeId === block.id;
          const slashQuery = block.type === "paragraph" && block.text.startsWith("/") ? block.text.slice(1).trim().toLowerCase() : null;
          return <div
            key={block.id}
            data-note-block-id={block.id}
            className={`group relative rounded-md px-2 py-1 transition-colors ${active ? "bg-white/[.025]" : "hover:bg-white/[.035]"}`}
            onMouseDown={() => { if (!active) setActiveId(block.id); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); if (dragIndex !== null) moveBlock(dragIndex, index); setDragIndex(null); }}
          >
            <div className="absolute -left-12 top-1 hidden h-8 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); insertBlock(index); }}
                aria-label="이 블록 위에 추가"
                title="블록 추가"
                className="grid h-7 w-7 place-items-center rounded-md text-lg font-light text-[var(--muted)] hover:bg-white/[.08] hover:text-white"
              >+</button>
              <button
                type="button"
                draggable
                onClick={(event) => { event.stopPropagation(); setMenuId((current) => current === block.id ? null : block.id); }}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                aria-label="블록 메뉴 및 이동"
                title="클릭: 메뉴 · 드래그: 이동"
                className="grid h-7 w-7 cursor-grab place-items-center rounded-md text-[15px] tracking-[-.16em] text-[var(--muted)] hover:bg-white/[.08] hover:text-white active:cursor-grabbing"
              >⠿</button>
            </div>

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
            /> : block.type === "divider" ? <button
              type="button"
              onClick={() => setActiveId(block.id)}
              className="block w-full py-3"
              aria-label="구분선 블록 선택"
            ><hr className="border-0 border-t border-[var(--line)]" /></button> : block.type === "math" ? <MathBlock
              block={block}
              active={active}
              onActivate={() => setActiveId(block.id)}
              onChange={(text) => patchBlock(index, { text })}
            /> : block.type === "code" || block.type === "markdown" ? <SourceBlock
              block={block}
              active={active}
              onActivate={() => setActiveId(block.id)}
              onChange={(text) => patchBlock(index, { text })}
            /> : <RichTextBlock
              block={block}
              active={active}
              onActivate={() => setActiveId(block.id)}
              onChange={(text) => patchBlock(index, { text })}
              onSplit={(before, after) => {
                const next = [...blocks];
                next[index] = { ...block, text: before };
                const continuationType = (["bullet", "number"].includes(block.type) ? block.type : "paragraph") as StudyNoteBlockType;
                const continuation = createStudyNoteBlock(continuationType, after);
                next.splice(index + 1, 0, continuation);
                commit(next);
                focusBlock(continuation.id);
              }}
              onEmptyBackspace={() => {
                if (block.type !== "paragraph") patchBlock(index, { type: "paragraph" });
                else removeBlock(index);
              }}
            />}

            {slashQuery !== null && active && <SlashMenu
              query={slashQuery}
              onSelect={(type) => convertBlock(index, type, true)}
            />}
          </div>;
        })}
      </div>

      <button
        type="button"
        onClick={() => insertBlock(blocks.length)}
        className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--muted)] opacity-0 transition hover:bg-white/[.03] hover:text-white focus:opacity-100 group-hover:opacity-100 sm:opacity-60"
      ><span className="text-lg">+</span><span>새 블록</span></button>
    </div>
  </div>;
}

function RichTextBlock({ block, active, onActivate, onChange, onSplit, onEmptyBackspace }: {
  block: StudyNoteBlock;
  active: boolean;
  onActivate: () => void;
  onChange: (text: string) => void;
  onSplit: (before: string, after: string) => void;
  onEmptyBackspace: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || document.activeElement === node) return;
    const html = inlineMarkdownToHtml(block.text);
    if (node.innerHTML !== html) node.innerHTML = html;
  }, [block.text, block.type]);

  function syncFromDom() {
    const node = ref.current;
    if (!node) return;
    onChange(domChildrenToMarkdown(node));
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

  const typography = block.type === "heading1"
    ? "text-[32px] font-bold leading-[1.2] tracking-[-.03em]"
    : block.type === "heading2"
      ? "text-[25px] font-semibold leading-[1.25] tracking-[-.025em]"
      : block.type === "heading3"
        ? "text-[20px] font-semibold leading-[1.35]"
        : block.type === "quote"
          ? "border-l-[3px] border-[#8e8e93] pl-4 text-[16px] leading-7 text-[#d7d7dc]"
          : "text-[15.5px] leading-7";

  return <div className="relative py-0.5" onClick={onActivate}>
    {active && <FloatingInlineToolbar onBold={() => runCommand("bold")} onItalic={() => runCommand("italic")} onCode={() => runCommand("code")} />}
    {block.type === "bullet" && <span className="pointer-events-none absolute left-1 top-[8px] text-base text-[#d7d7dc]">•</span>}
    {block.type === "number" && <span className="pointer-events-none absolute left-0 top-[9px] min-w-6 text-right text-sm text-[#d7d7dc]">1.</span>}
    {!block.text && !active && <span className="pointer-events-none absolute left-2 top-2 text-[15px] text-white/20">클릭해서 입력하거나 / 로 블록을 추가하세요.</span>}
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="노트 블록 편집"
      spellCheck
      onFocus={onActivate}
      onInput={syncFromDom}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.currentTarget.blur(); return; }
        if (event.key === "Backspace" && !domChildrenToMarkdown(event.currentTarget)) {
          event.preventDefault();
          onEmptyBackspace();
          return;
        }
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        const split = splitEditableAtSelection(event.currentTarget);
        onSplit(split?.before ?? block.text, split?.after ?? "");
      }}
      className={`min-h-8 w-full cursor-text whitespace-pre-wrap break-words rounded-sm px-2 py-1 text-white outline-none ${block.type === "bullet" || block.type === "number" ? "pl-8" : ""} ${typography}`}
      dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtml(block.text) }}
    />
  </div>;
}

function FloatingInlineToolbar({ onBold, onItalic, onCode }: { onBold: () => void; onItalic: () => void; onCode: () => void }) {
  return <div className="absolute -top-8 left-2 z-20 flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#252527] p-1 opacity-0 shadow-xl transition-opacity focus-within:opacity-100 group-focus-within:opacity-100">
    <ToolbarButton label="굵게 (Ctrl/Cmd+B)" onMouseDown={onBold}><strong>B</strong></ToolbarButton>
    <ToolbarButton label="기울임 (Ctrl/Cmd+I)" onMouseDown={onItalic}><em>I</em></ToolbarButton>
    <ToolbarButton label="인라인 코드" onMouseDown={onCode}><span className="font-mono">&lt;/&gt;</span></ToolbarButton>
  </div>;
}

function ToolbarButton({ label, onMouseDown, children }: { label: string; onMouseDown: () => void; children: React.ReactNode }) {
  return <button
    type="button"
    title={label}
    aria-label={label}
    onMouseDown={(event) => { event.preventDefault(); onMouseDown(); }}
    className="grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs text-[#e5e5ea] hover:bg-white/10"
  >{children}</button>;
}

function SourceBlock({ block, active, onActivate, onChange }: {
  block: StudyNoteBlock;
  active: boolean;
  onActivate: () => void;
  onChange: (text: string) => void;
}) {
  const markdown = serializeStudyNoteBlocks([block]);
  if (!active) {
    return <div onClick={onActivate} className="cursor-text py-1">
      <MarkdownContent content={markdown} />
      {block.type === "markdown" && <p className="mt-1 text-[10px] text-[var(--muted)]">클릭하면 복합 Markdown 소스를 편집할 수 있습니다.</p>}
    </div>;
  }

  return <div className="py-1">
    {block.type === "markdown" && <div className="mb-2 rounded-lg border border-white/8 bg-white/[.02] p-3"><MarkdownContent content={block.text} compact /></div>}
    <textarea
      autoFocus
      value={block.text}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      aria-label={block.type === "code" ? "코드 블록 편집" : "복합 Markdown 블록 편집"}
      className="scrollbar min-h-28 w-full resize-y rounded-lg border border-white/8 bg-black/25 p-3 font-mono text-[13px] leading-6 text-[#e5e5ea] outline-none focus:border-white/15"
    />
    {block.type === "markdown" && <p className="mt-1.5 px-1 text-[10px] text-[var(--muted)]">표처럼 구조가 복잡한 블록만 소스 편집을 사용합니다. 위 미리보기는 즉시 갱신됩니다.</p>}
  </div>;
}

function MathBlock({ block, active, onActivate, onChange }: {
  block: StudyNoteBlock;
  active: boolean;
  onActivate: () => void;
  onChange: (text: string) => void;
}) {
  return <div onClick={onActivate} className="py-1">
    <div className="min-h-14 cursor-text rounded-lg px-2 py-2 transition hover:bg-black/10">
      <MarkdownContent content={serializeStudyNoteBlocks([block])} />
    </div>
    {active && <textarea
      autoFocus
      value={block.text}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      aria-label="LaTeX 수식 편집"
      placeholder="LaTeX 수식을 입력하세요"
      className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/8 bg-black/25 p-3 font-mono text-[13px] leading-6 text-[#e5e5ea] outline-none focus:border-white/15"
    />}
  </div>;
}

function BlockMenu({ block, onType, onDuplicate, onDelete, onClose }: {
  block: StudyNoteBlock;
  onType: (type: StudyNoteBlockType) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const options = block.type === "image" ? [] : blockOptions;
  return <div className="absolute left-0 top-9 z-40 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#252527] p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
    {options.length > 0 && <>
      <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted)]">블록 전환</p>
      <div className="max-h-60 overflow-y-auto">
        {options.map((option) => <button key={option.value} type="button" onClick={() => onType(option.value)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/[.07]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/8 bg-white/[.03] text-xs">{option.icon}</span>
          <span className="min-w-0"><span className="block text-xs text-white">{option.label}</span><span className="block truncate text-[10px] text-[var(--muted)]">{option.description}</span></span>
        </button>)}
      </div>
      <div className="my-1 border-t border-white/8" />
    </>}
    <button type="button" onClick={onDuplicate} className="w-full rounded-lg px-2 py-2 text-left text-xs text-[#e5e5ea] hover:bg-white/[.07]">복제</button>
    <button type="button" onClick={onDelete} className="w-full rounded-lg px-2 py-2 text-left text-xs text-[#ff6961] hover:bg-white/[.07]">삭제</button>
    <button type="button" onClick={onClose} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[10px] text-[var(--muted)] hover:bg-white/[.05]">메뉴 닫기</button>
  </div>;
}

function SlashMenu({ query, onSelect }: { query: string; onSelect: (type: StudyNoteBlockType) => void }) {
  const filtered = blockOptions.filter((option) => !query || `${option.label} ${option.shortcut} ${option.description}`.toLowerCase().includes(query));
  if (!filtered.length) return null;
  return <div className="absolute left-4 top-[calc(100%-2px)] z-30 w-72 rounded-xl border border-white/10 bg-[#252527] p-1.5 shadow-2xl">
    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted)]">기본 블록</p>
    <div className="max-h-72 overflow-y-auto">
      {filtered.map((option) => <button key={option.value} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(option.value)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/[.08]">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/8 bg-white/[.03] text-xs text-white">{option.icon}</span>
        <span><span className="block text-xs text-white">{option.label}</span><span className="block text-[10px] text-[var(--muted)]">/{option.shortcut} · {option.description}</span></span>
      </button>)}
    </div>
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

    function onMove(moveEvent: PointerEvent) {
      const delta = ((moveEvent.clientX - startX) / containerWidth) * 100 * direction;
      onChange({ imageWidth: clampImageWidth(startWidth + delta) });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return <div ref={containerRef} className="py-2" onClick={onActivate}>
    <div className={`relative ${marginClass}`} style={{ width: `${width}%` }}>
      {area ? <img
        src={area.imageDataUrl}
        alt={`PDF ${area.page}페이지에서 저장한 영역`}
        className={`block max-h-[62vh] w-full rounded-lg bg-white object-contain transition-shadow ${active ? "ring-2 ring-[var(--accent)]/70" : "group-hover:ring-1 group-hover:ring-white/15"}`}
      /> : <div className="grid min-h-36 place-items-center rounded-lg border border-dashed border-[var(--line)] text-xs text-[var(--muted)]">저장된 PDF 이미지를 찾을 수 없습니다.</div>}

      {area && <>
        <button type="button" aria-label="이미지 왼쪽 크기 조절" onPointerDown={(event) => beginResize(event, "left")} className={`absolute -left-2 top-1/2 h-14 w-3 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-[var(--accent)] shadow transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-70"}`} />
        <button type="button" aria-label="이미지 오른쪽 크기 조절" onPointerDown={(event) => beginResize(event, "right")} className={`absolute -right-2 top-1/2 h-14 w-3 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-[var(--accent)] shadow transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-70"}`} />
      </>}
    </div>

    <div className={`mt-2 flex flex-wrap items-center justify-center gap-2 transition-opacity ${active ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"}`}>
      <span className="text-[10px] text-[var(--muted)]">{area ? `PDF p.${area.page}` : "PDF 영역"} · {width}%</span>
      <div className="flex items-center rounded-lg border border-white/8 bg-black/20 p-0.5" aria-label="이미지 정렬">
        {(["left", "center", "right"] as StudyNoteImageAlignment[]).map((value) => <button key={value} type="button" aria-pressed={align === value} onClick={(event) => { event.stopPropagation(); onChange({ imageAlign: value }); }} className={`rounded-md px-2 py-1 text-[10px] ${align === value ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"}`}>{value === "left" ? "왼쪽" : value === "right" ? "오른쪽" : "가운데"}</button>)}
      </div>
      {[40, 70, 100].map((preset) => <button key={preset} type="button" onClick={(event) => { event.stopPropagation(); onChange({ imageWidth: preset }); }} className="rounded-md px-2 py-1 text-[10px] text-[var(--muted)] hover:bg-white/[.06] hover:text-white">{preset === 40 ? "작게" : preset === 70 ? "중간" : "전체"}</button>)}
    </div>
  </div>;
}

function inlineMarkdownToHtml(value: string): string {
  const code: string[] = [];
  let html = escapeHtml(value).replace(/`([^`\n]+)`/gu, (_match, inner: string) => {
    const token = `@@CODE_${code.length}@@`;
    code.push(`<code class="rounded bg-white/10 px-1 py-0.5 font-mono text-[.9em]">${inner}</code>`);
    return token;
  });
  html = html.replace(/\*\*([^*\n]+)\*\*/gu, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/gu, "$1<em>$2</em>");
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/gu, '<a href="$2" target="_blank" rel="noreferrer" class="text-[var(--accent)] underline underline-offset-2">$1</a>');
  html = html.replace(/\n/gu, "<br>");
  code.forEach((replacement, index) => { html = html.replace(`@@CODE_${index}@@`, replacement); });
  return html;
}

function domChildrenToMarkdown(node: HTMLElement): string {
  return Array.from(node.childNodes).map(domNodeToMarkdown).join("").replace(/\n{3,}/gu, "\n\n");
}

function domNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const children = Array.from(node.childNodes).map(domNodeToMarkdown).join("");
  switch (node.tagName) {
    case "BR": return "\n";
    case "STRONG":
    case "B": return `**${children}**`;
    case "EM":
    case "I": return `*${children}*`;
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
