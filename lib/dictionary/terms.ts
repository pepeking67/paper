export function normalizeDictionaryTerm(term: string) {
  return term
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isPendingDictionaryMeaning(meaning: string | undefined) {
  return !meaning || meaning === "뜻 찾는 중…" || meaning === "뜻을 입력하세요";
}
