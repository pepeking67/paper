import { notFound } from "next/navigation";
import { StudyWorkspace } from "@/components/study-workspace";
import { findPaper, papers } from "@/lib/papers/catalog";

export function generateStaticParams() { return papers.map(({ id }) => ({ paperId: id })); }
export default async function PaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const paper = findPaper((await params).paperId);
  if (!paper) notFound();
  return <StudyWorkspace initialPaper={paper} papers={papers} />;
}
