export type StudyHighlight = { id: string; text: string; page: number; memo: string; createdAt: string };
export type StudyInsight = { id: string; question: string; answer: string; page: number; sourceText?: string; createdAt: string };
export type StudyMemo = { id: string; text: string; createdAt: string };

export type StudyTrayData = {
  highlights: StudyHighlight[];
  insights: StudyInsight[];
  memos: StudyMemo[];
};

export const emptyStudyTray = (): StudyTrayData => ({ highlights: [], insights: [], memos: [] });
