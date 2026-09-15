import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";

export type AnnotationKind = "highlight" | "underline";
export type AnnotationColor = "yellow" | "green" | "blue" | "pink" | "purple";

export type StudyHighlight = {
  id: string;
  text: string;
  page: number;
  rects: NormalizedHighlightRect[];
  memo: string;
  createdAt: string;
  /** Optional for backward compatibility with annotations already stored in localStorage. */
  kind?: AnnotationKind;
  /** Optional for backward compatibility with annotations already stored in localStorage. */
  color?: AnnotationColor;
};
export type StudyInsight = { id: string; question: string; answer: string; page: number; sourceText?: string; createdAt: string };
export type StudyMemo = { id: string; text: string; createdAt: string };

export type StudyTrayData = {
  highlights: StudyHighlight[];
  insights: StudyInsight[];
  memos: StudyMemo[];
};

export const emptyStudyTray = (): StudyTrayData => ({ highlights: [], insights: [], memos: [] });
