import type { StudyTrayData } from "@/lib/study-tray/types";

export type StudyStateSnapshot = {
  tray: StudyTrayData;
  noteMarkdown: string;
  revision: number;
  updatedAt: string;
};

export type StudyStateConflict = {
  device: StudyStateSnapshot;
  server: StudyStateSnapshot;
};

export type StudySyncStatus = "guest" | "loading" | "saved-local" | "syncing" | "synced" | "offline" | "conflict" | "error";

export type AccountStudyCache = {
  tray: StudyTrayData;
  noteMarkdown: string;
  baseRevision: number;
  dirty: boolean;
  updatedAt: string;
};
