import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/admin";
import { BlobNotConfiguredError } from "@/lib/blob/private-pdf";
import { syncPaper } from "@/lib/pdf-sync/sync-paper";
import { PdfSyncError } from "@/lib/pdf-sync/types";

export async function POST(request: Request) {
  const auth = verifyAdminRequest(request);
  if (!auth.ok) return errorResponse(auth.reason, auth.status);

  const body: unknown = await request.json().catch(() => null);
  const paperId = isPaperRequest(body) ? body.paperId : "";
  if (!paperId) return errorResponse("Invalid paper ID", 400);

  try {
    return NextResponse.json(await syncPaper(paperId));
  } catch (error) {
    if (error instanceof BlobNotConfiguredError) return errorResponse("Blob is not configured", 503, paperId);
    if (error instanceof PdfSyncError) return errorResponse(error.message, error.httpStatus, paperId);
    return errorResponse("PDF synchronization failed", 500, paperId);
  }
}

function isPaperRequest(value: unknown): value is { paperId: string } {
  return typeof value === "object" && value !== null && typeof (value as { paperId?: unknown }).paperId === "string";
}

function errorResponse(reason: string, status: number, paperId?: string) {
  return NextResponse.json({ ...(paperId ? { paperId } : {}), status: "failed", reason }, { status, headers: status === 401 ? { "WWW-Authenticate": 'Basic realm="Paper Study"' } : undefined });
}
