import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { put } from "@vercel/blob";
import type { PdfManifestEntry } from "../../lib/papers/types";

const manifestPath = new URL("../../data/papers.manifest.json", import.meta.url);
function assertConfigured(){const required=["BLOB_READ_WRITE_TOKEN","VERCEL_PROJECT_ID"];const missing=required.filter(k=>!process.env[k]);if(missing.length)throw new Error(`Refusing upload: missing ${missing.join(", ")}. Link the Vercel project and private Blob first.`);}
async function main(){assertConfigured();const manifest=JSON.parse(await readFile(manifestPath,"utf8")) as PdfManifestEntry[];
 for(const entry of manifest){if(entry.uploadStatus!=="pending"||!entry.pdfSourceUrl||!entry.blobPathname)continue;
  try{const response=await fetch(entry.pdfSourceUrl);if(!response.ok)throw new Error(`download HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.subarray(0,5).toString()!=="%PDF-")throw new Error("source is not a PDF");
   const sourceId=entry.sourceUrl?.match(/abs\/(\d{4}\.\d{4,5})/)?.[1];if(sourceId&&!response.url.includes(sourceId))throw new Error("arXiv ID changed during download");const sha256=createHash("sha256").update(bytes).digest("hex");
   const result=await put(entry.blobPathname,bytes,{access:"private",addRandomSuffix:false,allowOverwrite:false,contentType:"application/pdf",token:process.env.BLOB_READ_WRITE_TOKEN});
   entry.sha256=sha256;entry.sizeBytes=bytes.length;entry.uploadStatus="ready";entry.reason="Uploaded and validated as a PDF.";console.log(`uploaded ${entry.id}: ${entry.blobPathname} (${bytes.length} bytes)`);void result;
  }catch(error){entry.uploadStatus="failed";entry.reason=error instanceof Error?error.message:"unknown upload failure";console.error(`failed ${entry.id}: ${entry.reason}`);}finally{await writeFile(manifestPath,JSON.stringify(manifest,null,2)+"\n");}
 }}
main().catch((error)=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
