import type { StudyHighlight } from "@/lib/study-tray/types";

export function buildDictionaryCsv(entries: StudyHighlight[]) {
  const rows = [
    ["term", "meaning_ko", "created_at", "updated_at"],
    ...entries
      .slice()
      .sort((left, right) => left.text.localeCompare(right.text, "en"))
      .map((entry) => [entry.text, entry.dictionaryMeaning ?? "", entry.createdAt, entry.dictionaryUpdatedAt ?? entry.createdAt]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function downloadDictionaryCsv(entries: StudyHighlight[]) {
  const blob = new Blob([buildDictionaryCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `paper-study-dictionary-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function csvCell(value: string) {
  const safe = /^[=+@]/u.test(value) || /^-(?!\d)/u.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
