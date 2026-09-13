import { get } from "@vercel/blob";
export async function getPrivatePdf(pathname:string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_NOT_CONFIGURED");
  return get(pathname,{access:"private",token:process.env.BLOB_READ_WRITE_TOKEN});
}
