import { StudyWorkspace } from "@/components/study-workspace";
import type { Paper } from "@/lib/papers/types";

export default async function PaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const paperId = (await params).paperId;
  const placeholder: Paper = {
    id: paperId,
    title: "내 논문 불러오는 중…",
    authors: "",
    year: null,
    tag: "Personal",
    done: false,
    keys: [],
    sourceUrl: null,
    notionUrl: null,
    library: "personal",
  };
  return <StudyWorkspace initialPaper={placeholder} />;
}
