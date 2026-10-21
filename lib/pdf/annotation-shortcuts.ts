import type { AnnotationTool } from "@/lib/workspace-state/local-ui-state";

export const toolShortcutKeys: Partial<Record<AnnotationTool, string>> = {
  highlight: "A", underline: "S", select: "D", text: "F",
};

export function annotationShortcut(event: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey" | "isComposing">): AnnotationTool | null {
  if (event.isComposing || event.metaKey || event.shiftKey || event.ctrlKey === event.altKey) return null;
  const code = event.code || `Key${event.key.toUpperCase()}`;
  return ({ KeyA: "highlight", KeyS: "underline", KeyD: "select", KeyF: "text" } as const)[code as "KeyA"] ?? null;
}

export function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, form, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'));
}

/** Reverse paint order: one right click deletes one complete saved annotation. */
export function annotationAtPoint(root: Element, x: number, y: number): { id: string; area: boolean } | null {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-annotation-id], [data-pdf-area-id]"));
  for (const block of blocks.reverse()) {
    const rect = block.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const area = Boolean(block.dataset.pdfAreaId);
      const id = block.dataset.pdfAreaId || block.dataset.pdfAnnotationId;
      if (id) return { id, area };
    }
  }
  return null;
}
