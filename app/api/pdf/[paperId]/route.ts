import { NextResponse } from "next/server";
import { getPrivatePdf } from "@/lib/blob/private-pdf";
import { findPaper } from "@/lib/papers/catalog";
import { isSafeBlobPath, manifestEntry } from "@/lib/papers/manifest";

type RouteContext = { params: Promise<{ paperId: string }> };

export async function GET(_: Request, { params }: RouteContext) {
  const { paperId } = await params;

  if (!findPaper(paperId)) {
    return NextResponse.json({ error: "Unknown paper ID" }, { status: 404 });
  }

  const entry = manifestEntry(paperId);
  if (!entry || entry.uploadStatus !== "ready" || !entry.blobPathname) {
    return NextResponse.json({ error: "PDF not available" }, { status: 404 });
  }

  if (!isSafeBlobPath(entry.blobPathname)) {
    return NextResponse.json({ error: "Invalid manifest path" }, { status: 500 });
  }

  try {
    const result = await getPrivatePdf(entry.blobPathname);
    if (!result) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(result.blob.size),
        "Accept-Ranges": "none",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${paperId}.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const isNotConfigured =
      error instanceof Error && error.message === "BLOB_NOT_CONFIGURED";

    return NextResponse.json(
      {
        error: isNotConfigured
          ? "Blob is not configured"
          : "Blob retrieval failed",
      },
      { status: isNotConfigured ? 503 : 502 },
    );
  }
}
