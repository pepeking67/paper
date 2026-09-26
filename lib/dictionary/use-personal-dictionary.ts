"use client";

import { useCallback, useMemo } from "react";
import { useStudyState } from "@/lib/study-sync/use-study-state";
import type { StudyHighlight } from "@/lib/study-tray/types";
import { isPendingDictionaryMeaning, normalizeDictionaryTerm } from "./terms";

export const PERSONAL_DICTIONARY_PAPER_ID = "__personal_dictionary__";

export function usePersonalDictionary() {
  const state = useStudyState(PERSONAL_DICTIONARY_PAPER_ID);
  const entries = useMemo(
    () => state.tray.highlights
      .filter((item) => item.kind === "dictionary" && normalizeDictionaryTerm(item.text) && !isPendingDictionaryMeaning(item.dictionaryMeaning))
      .sort((left, right) => left.text.localeCompare(right.text, "en")),
    [state.tray.highlights],
  );

  const findMeaning = useCallback((term: string) => {
    const normalized = normalizeDictionaryTerm(term);
    return entries.find((entry) => normalizeDictionaryTerm(entry.text) === normalized)?.dictionaryMeaning ?? null;
  }, [entries]);

  const upsert = useCallback((term: string, meaning: string) => {
    const cleanTerm = term.trim().slice(0, 200);
    const cleanMeaning = meaning.trim().slice(0, 100);
    const normalized = normalizeDictionaryTerm(cleanTerm);
    if (!normalized || !cleanMeaning || isPendingDictionaryMeaning(cleanMeaning)) return;
    const now = new Date().toISOString();

    state.updateTray((current) => {
      const existing = current.highlights.find((item) => item.kind === "dictionary" && normalizeDictionaryTerm(item.text) === normalized);
      if (existing?.dictionaryMeaning === cleanMeaning) return current;
      if (existing) return {
        ...current,
        highlights: current.highlights.map((item) => item.id === existing.id ? { ...item, text: cleanTerm, dictionaryMeaning: cleanMeaning, dictionaryUpdatedAt: now } : item),
      };
      const entry: StudyHighlight = {
        id: crypto.randomUUID(),
        text: cleanTerm,
        page: 0,
        rects: [],
        memo: "",
        kind: "dictionary",
        dictionaryMeaning: cleanMeaning,
        dictionaryUpdatedAt: now,
        createdAt: now,
      };
      return { ...current, highlights: [...current.highlights, entry] };
    });
  }, [state]);

  const remove = useCallback((id: string) => {
    state.updateTray((current) => ({ ...current, highlights: current.highlights.filter((item) => item.id !== id) }));
  }, [state]);

  return { ...state, entries, findMeaning, upsert, remove };
}
