import { get, head, put } from "@vercel/blob";
import { Buffer } from "node:buffer";

export class BlobNotConfiguredError extends Error {
  constructor() { super("BLOB_NOT_CONFIGURED"); }
}

function token(): string {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new BlobNotConfiguredError();
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export async function getPrivatePdf(pathname: string) {
  return get(pathname, { access: "private", token: token() });
}

export async function privateBlobExists(pathname: string): Promise<boolean> {
  try {
    const metadata = await head(pathname, { token: token() });
    return metadata !== null;
  } catch (error) {
    if (isBlobNotFound(error)) return false;
    throw error;
  }
}

export async function putPrivatePdf(pathname: string, bytes: Uint8Array) {
  return put(pathname, Buffer.from(bytes), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/pdf",
    token: token(),
  });
}

function isBlobNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { status?: number; statusCode?: number };
  return candidate.name === "BlobNotFoundError" || candidate.status === 404 || candidate.statusCode === 404;
}
