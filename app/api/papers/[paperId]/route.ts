import { NextResponse } from "next/server";
import { BlobNotConfiguredError, privateBlobExists } from "@/lib/blob/private-pdf";
import { findPaper } from "@/lib/papers/catalog";
import { isSafeBlobPath, manifestEntry } from "@/lib/papers/manifest";

export async function GET(_: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const paper = findPaper((await params).paperId);
  if (!paper) return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  const entry = manifestEntry(paper.id);
  if (!entry?.blobPathname || entry.uploadStatus === "excluded" || !isSafeBlobPath(entry.blobPathname)) return NextResponse.json({ ...paper, pdfAvailable: false });
  try { return NextResponse.json({ ...paper, pdfAvailable: await privateBlobExists(entry.blobPathname) }); }
  catch (error) {
    if (error instanceof BlobNotConfiguredError) return NextResponse.json({ error: "Blob is not configured" }, { status: 503 });
    return NextResponse.json({ error: "Blob status check failed" }, { status: 502 });
  }
}
