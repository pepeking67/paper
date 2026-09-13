import { NextResponse } from "next/server";
import { papers } from "@/lib/papers/catalog";
import { manifestEntry } from "@/lib/papers/manifest";
export function GET(){return NextResponse.json(papers.map(p=>({...p,pdfAvailable:manifestEntry(p.id)?.uploadStatus==="ready"})));}
