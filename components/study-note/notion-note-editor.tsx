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

const blockTypes: { value: StudyNoteBlockType; label: string }[] = [
  { value: "paragraph", label: "텍스트" },
  { value: "heading1", label: "제목 1" },
  { value: "heading2", label: "제목 2" },
  { value: "heading3", label: "제목 3" },
  { value: "bullet", label: "글머리 기호" },
  { value: "number", label: "번호 목록" },
  { value: "quote", label: "인용" },
  { value: "code", label: "코드" },
  { value: "math", label: "수식" },
  { value: "divider", label: "구분선" },
];

export function NotionNoteEditor({ value, areas, onChange }: {
  value: string;
  areas: EmbeddedPdfArea[];
  onChange: (markdown: string) => void;
}) {
  const [blocks, setBlocks] = useState<StudyNoteBlock[]>(() => parseStudyNoteMarkdown(value));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const lastEmitted = useRef(value);
  const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setBlocks(parseStudyNoteMarkdown(value));
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

  function insertBlock(index: number, block = createStudyNoteBlock()) {
    const next = [...blocks];
    next.splice(index, 0, block);
    commit(next);
  }

  function removeBlock(index: number) {
    if (blocks.length === 1) { commit([createStudyNoteBlock()]); return; }
    commit(blocks.filter((_, blockIndex) => blockIndex !== index));
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

  return <div className="scrollbar h-full overflow-y-auto bg-[#151516] px-3 py-5 sm:px-6 lg:px-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/[.035] px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-white">블록 편집</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">문단 단위로 수정하고, 왼쪽 핸들로 순서를 옮길 수 있습니다. Enter는 새 블록, Shift+Enter는 줄바꿈입니다.</p>
        </div>
        <button type="button" onClick={() => insertBlock(blocks.length)} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-white/5">+ 블록 추가</button>
      </div>

      <div className="space-y-1">
        {blocks.map((block, index) => <div
          key={block.id}
          className="group relative rounded-xl border border-transparent px-1 py-1 transition hover:border-[var(--line)] hover:bg-white/[.025]"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); if (dragIndex !== null) moveBlock(dragIndex, index); setDragIndex(null); }}
        >
          <div className="absolute -left-9 top-2 hidden items-center gap-0.5 opacity-0 transition group-hover:opacity-100 sm:flex">
            <button type="button" onClick={() => insertBlock(index)} aria-label="이 블록 위에 추가" title="블록 추가" className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-white/[.07] hover:text-white">+</button>
            <button
              type="button"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              aria-label="블록 이동"
              title="드래그해서 이동"
              className="grid h-7 w-7 cursor-grab place-items-center rounded-md text-sm tracking-[-.18em] text-[var(--muted)] hover:bg-white/[.07] hover:text-white active:cursor-grabbing"
            >⠿</button>
          </div>

          <div className="mb-1 flex min-h-7 items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            {block.type !== "image" && <select
              aria-label="블록 종류"
              value={block.type === "markdown" ? "paragraph" : block.type}
              onChange={(event) => patchBlock(index, { type: event.target.value as StudyNoteBlockType })}
              className="rounded-md border border-[var(--line)] bg-[#1f1f21] px-2 py-1 text-[10px] text-[var(--muted)]"
            >
              {blockTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>}
            <button type="button" onClick={() => duplicateBlock(index)} className="rounded-md px-2 py-1 text-[10px] text-[var(--muted)] hover:bg-white/[.06] hover:text-white">복제</button>
            <button type="button" onClick={() => removeBlock(index)} className="rounded-md px-2 py-1 text-[10px] text-[var(--muted)] hover:bg-white/[.06] hover:text-white">삭제</button>
          </div>

          {block.type === "image" ? <ImageBlock
            block={block}
            area={block.areaId ? areaById.get(block.areaId) : undefined}
            onChange={(patch) => patchBlock(index, patch)}
          /> : block.type === "divider" ? <div className="py-3"><hr className="border-0 border-t border-[var(--line)]" /></div> : <EditableBlock
            block={block}
            onChange={(text) => patchBlock(index, { text })}
            onSplit={(before, after) => {
              const next = [...blocks];
              next[index] = { ...block, text: before };
              const continuationType = (["bullet", "number"].includes(block.type) ? block.type : "paragraph") as StudyNoteBlockType;
              next.splice(index + 1, 0, createStudyNoteBlock(continuationType, after));
              commit(next);
            }}
            onEmptyBackspace={() => {
              if (block.type !== "paragraph") patchBlock(index, { type: "paragraph" });
              else removeBlock(index);
            }}
          />}
        </div>)}
      </div>

      <button type="button" onClick={() => insertBlock(blocks.length)} className="mt-3 w-full rounded-xl border border-dashed border-[var(--line)] py-3 text-xs text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-white/[.025] hover:text-white">+ 새 블록</button>
    </div>
  </div>;
}

function EditableBlock({ block, onChange, onSplit, onEmptyBackspace }: {
  block: StudyNoteBlock;
  onChange: (text: string) => void;
  onSplit: (before: string, after: string) => void;
  onEmptyBackspace: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.max(node.scrollHeight, 36)}px`;
  }, [block.text, block.type]);

  function applyInline(prefix: string, suffix = prefix) {
    const node = ref.current;
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selected = block.text.slice(start, end) || "텍스트";
    const next = `${block.text.slice(0, start)}${prefix}${selected}${suffix}${block.text.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  const textareaClass = block.type === "heading1"
    ? "text-[30px] font-bold leading-tight tracking-[-.025em]"
    : block.type === "heading2"
      ? "text-[24px] font-semibold leading-tight tracking-[-.02em]"
      : block.type === "heading3"
        ? "text-[19px] font-semibold leading-snug"
        : block.type === "quote"
          ? "border-l-3 border-[var(--accent)] pl-4 text-[15px] italic text-[#d2d2d7]"
          : block.type === "code" || block.type === "math" || block.type === "markdown"
            ? "rounded-xl bg-black/25 p-3 font-mono text-[13px] leading-6"
            : "text-[15px] leading-7";

  return <div className="relative">
    {block.type === "bullet" && <span className="absolute left-1 top-[9px] text-sm text-[var(--muted)]">•</span>}
    {block.type === "number" && <span className="absolute left-0 top-[9px] min-w-5 text-right text-xs text-[var(--muted)]">1.</span>}
    <textarea
      ref={ref}
      value={block.text}
      rows={1}
      spellCheck={block.type !== "code" && block.type !== "math"}
      aria-label="노트 블록 편집"
      placeholder={block.type.startsWith("heading") ? "제목" : block.type === "math" ? "LaTeX 수식" : block.type === "code" ? "코드" : "내용을 입력하세요. '/'로 시작해도 됩니다."}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Backspace" && !block.text) { event.preventDefault(); onEmptyBackspace(); return; }
        if (event.key !== "Enter" || event.shiftKey || block.type === "code" || block.type === "math" || block.type === "markdown") return;
        event.preventDefault();
        const node = event.currentTarget;
        onSplit(block.text.slice(0, node.selectionStart), block.text.slice(node.selectionEnd));
      }}
      className={`block w-full resize-none overflow-hidden border-0 bg-transparent px-2 py-1.5 text-white outline-none ${block.type === "bullet" || block.type === "number" ? "pl-7" : ""} ${textareaClass}`}
    />
    {!["code", "math", "markdown"].includes(block.type) && <div className="pointer-events-none absolute -top-7 left-2 flex gap-0.5 opacity-0 transition group-focus-within:pointer-events-auto group-focus-within:opacity-100">
      <InlineButton label="굵게" onMouseDown={() => applyInline("**")}><strong>B</strong></InlineButton>
      <InlineButton label="기울임" onMouseDown={() => applyInline("*")}><em>I</em></InlineButton>
      <InlineButton label="인라인 코드" onMouseDown={() => applyInline("`")}><span className="font-mono">&lt;/&gt;</span></InlineButton>
    </div>}
    {block.type === "markdown" && <p className="px-2 pt-1 text-[10px] text-amber-300/70">표처럼 복합 구조인 블록은 내용 보존을 위해 이 블록 안에서만 Markdown으로 표시됩니다.</p>}
  </div>;
}

function InlineButton({ label, onMouseDown, children }: { label: string; onMouseDown: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onMouseDown={(event) => { event.preventDefault(); onMouseDown(); }} className="grid h-6 min-w-6 place-items-center rounded bg-[#2a2a2d] px-1.5 text-[10px] text-[#d7d7dc] shadow hover:bg-[#38383c]">{children}</button>;
}

function ImageBlock({ block, area, onChange }: {
  block: StudyNoteBlock;
  area?: EmbeddedPdfArea;
  onChange: (patch: Partial<StudyNoteBlock>) => void;
}) {
  const width = clampImageWidth(block.imageWidth ?? 100);
  const align = block.imageAlign ?? "center";
  const marginClass = align === "left" ? "mr-auto" : align === "right" ? "ml-auto" : "mx-auto";

  return <div className="rounded-2xl border border-[var(--line)] bg-black/20 p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-[10px] font-semibold tracking-[.1em] text-[var(--accent)]">PDF IMAGE</p><p className="text-[11px] text-[var(--muted)]">{area ? `p.${area.page}에서 저장한 영역` : "저장된 PDF 영역을 찾을 수 없음"}</p></div>
      <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-white/[.025] p-0.5" aria-label="이미지 정렬">
        {(["left", "center", "right"] as StudyNoteImageAlignment[]).map((value) => <button key={value} type="button" aria-pressed={align === value} onClick={() => onChange({ imageAlign: value })} className={`rounded-md px-2 py-1 text-[10px] ${align === value ? "bg-white/10 text-white" : "text-[var(--muted)]"}`}>{value === "left" ? "왼쪽" : value === "right" ? "오른쪽" : "가운데"}</button>)}
      </div>
    </div>

    <div className={`transition-[width] ${marginClass}`} style={{ width: `${width}%` }}>
      {area ? <img src={area.imageDataUrl} alt={`PDF ${area.page}페이지에서 저장한 영역`} className="block max-h-[60vh] w-full rounded-xl bg-white object-contain" /> : <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--muted)]">이미지를 찾을 수 없습니다.</div>}
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-3">
      <label className="flex min-w-48 flex-1 items-center gap-3 text-[11px] text-[var(--muted)]"><span className="shrink-0">크기 {width}%</span><input type="range" min={25} max={100} step={5} value={width} onChange={(event) => onChange({ imageWidth: Number(event.target.value) })} className="min-w-0 flex-1" /></label>
      <div className="flex gap-1">{[40, 70, 100].map((preset) => <button key={preset} type="button" onClick={() => onChange({ imageWidth: preset })} className="rounded-md border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)] hover:text-white">{preset === 40 ? "작게" : preset === 70 ? "중간" : "전체"}</button>)}</div>
    </div>
  </div>;
}
