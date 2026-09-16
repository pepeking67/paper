import { get, list, put } from "@vercel/blob";
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
  const result = await list({
    limit: 2,
    prefix: pathname,
    token: token(),
  });
  return result.blobs.some((blob) => blob.pathname === pathname);
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
