import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/admin";
import { BlobNotConfiguredError, privateBlobExists } from "@/lib/blob/private-pdf";
import { runBounded } from "@/lib/pdf-sync/run-bounded";
import { isSafeBlobPath, pdfManifest } from "@/lib/papers/manifest";

export async function GET(request: Request) {
  const auth = verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Blob is not configured" }, { status: 503 });
  const requestedId = new URL(request.url).searchParams.get("paperId");
  const entries = requestedId ? pdfManifest.filter((entry) => entry.id === requestedId) : pdfManifest;
  if (requestedId && entries.length === 0) return NextResponse.json({ error: "Unknown paper ID" }, { status: 404 });

  try {
    const results = await runBounded(entries, async (entry) => {
      if (entry.uploadStatus === "excluded") return { paperId: entry.id, status: "excluded", reason: entry.reason };
      if (!entry.blobPathname || !isSafeBlobPath(entry.blobPathname)) return { paperId: entry.id, status: "failed", reason: "Invalid Blob pathname" };
      return { paperId: entry.id, status: await privateBlobExists(entry.blobPathname) ? "ready" : "pending" };
    }, 2);
    return NextResponse.json({ papers: results.map((result, index) => result.status === "fulfilled" ? result.value : { paperId: entries[index].id, status: "failed", reason: "Status check failed" }) });
  } catch (error) {
    if (error instanceof BlobNotConfiguredError) return NextResponse.json({ error: "Blob is not configured" }, { status: 503 });
    return NextResponse.json({ error: "Blob status check failed" }, { status: 502 });
  }
}
