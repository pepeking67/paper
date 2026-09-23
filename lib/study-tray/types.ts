import type { NormalizedHighlightRect } from "@/lib/pdf/merge-glyph-rects";

export type AnnotationKind = "highlight" | "underline" | "dictionary" | "text";
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
  /** A concise editable gloss shown above dictionary annotations. */
  dictionaryMeaning?: string;
  /** Updated timestamp for account dictionary entries. */
  dictionaryUpdatedAt?: string;
  /** Font size divided by rendered page height, so PDF text memos scale with zoom. */
  textFontSizeRatio?: number;
  /** User-selected PDF font size in points. New text memos default to 10pt. */
  textFontSizePt?: number;
};

export type StudyArea = {
  id: string;
  page: number;
  rect: NormalizedHighlightRect;
  /** Legacy/pending local crop. New synced records use storagePath instead. */
  imageDataUrl?: string;
  storagePath?: string;
  memo: string;
  createdAt: string;
};

export type StudyInsight = { id: string; question: string; answer: string; page: number; sourceText?: string; createdAt: string };
export type StudyMemo = { id: string; text: string; createdAt: string };

export type StudyTrayData = {
  highlights: StudyHighlight[];
  /** Optional so existing localStorage packets created before area annotations remain valid. */
  areas?: StudyArea[];
  insights: StudyInsight[];
  memos: StudyMemo[];
};

export const emptyStudyTray = (): StudyTrayData => ({ highlights: [], areas: [], insights: [], memos: [] });
