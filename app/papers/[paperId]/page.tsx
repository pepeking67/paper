import { notFound } from "next/navigation";
import { StudyWorkspace } from "@/components/study-workspace";
import { findPaper, papers } from "@/lib/papers/catalog";

export function generateStaticParams() { return papers.map(({ id }) => ({ paperId: id })); }
export default async function PaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const paperId = (await params).paperId;
  const paper = findPaper(paperId) ?? (isUuid(paperId) ? { id: paperId, title: "개인 논문 불러오는 중…", authors: "", year: null, tag: "Personal", done: false, keys: [], sourceUrl: null, notionUrl: null, library: "personal" as const } : null);
  if (!paper) notFound();
  return <StudyWorkspace initialPaper={paper} papers={papers} />;
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value); }
