import { NextResponse } from "next/server";
import { findPaper } from "@/lib/papers/catalog"; import { isSafeBlobPath, manifestEntry } from "@/lib/papers/manifest"; import { getPrivatePdf } from "@/lib/blob/private-pdf";
export async function GET(_:Request,{params}:{params:Promise<{paperId:string}>}){
 const id=(await params).paperId;if(!findPaper(id))return NextResponse.json({error:"Unknown paper ID"},{status:404}); const entry=manifestEntry(id);
 if(!entry||entry.uploadStatus!=="ready"||!entry.blobPathname)return NextResponse.json({error:"PDF not available"},{status:404});
 if(!isSafeBlobPath(entry.blobPathname))return NextResponse.json({error:"Invalid manifest path"},{status:500});
 try{const result=await getPrivatePdf(entry.blobPathname);if(!result)return NextResponse.json({error:"Blob not found"},{status:404});return new NextResponse(result.stream,{headers:{"Content-Type":"application/pdf","Content-Length":String(result.blob.size),"Accept-Ranges":"none","Cache-Control":"private, max-age=3600","Content-Disposition":`inline; filename="${id}.pdf"`,`X-Content-Type-Options`:"nosniff"}});}catch(e){const missing=e instanceof Error&&e.message==="BLOB_NOT_CONFIGURED";return NextResponse.json({error:missing?"Blob is not configured":"Blob retrieval failed"},{status:missing?503:502});}
}
