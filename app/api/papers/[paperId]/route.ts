import { NextResponse } from "next/server";
import { findPaper } from "@/lib/papers/catalog"; import { manifestEntry } from "@/lib/papers/manifest";
export async function GET(_:Request,{params}:{params:Promise<{paperId:string}>}){const paper=findPaper((await params).paperId);if(!paper)return NextResponse.json({error:"Paper not found"},{status:404});return NextResponse.json({...paper,pdfAvailable:manifestEntry(paper.id)?.uploadStatus==="ready"});}
