import entries from "@/data/papers.manifest.json";
import type { PdfManifestEntry } from "./types";
export const pdfManifest = entries as PdfManifestEntry[];
export function manifestEntry(id:string){ return pdfManifest.find((entry)=>entry.id===id); }
export function isSafeBlobPath(path:string){ return /^papers\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.pdf$/.test(path) && !path.includes(".."); }
