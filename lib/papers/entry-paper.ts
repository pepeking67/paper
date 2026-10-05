import type { Paper } from "./types";

/** The library order breaks ties; explicit paper links remain untouched. */
export function entryPaperId(papers: Paper[]): string | undefined {
  return (papers.find((paper) => paper.readingStatus === "reading") ?? papers[0])?.id;
}
