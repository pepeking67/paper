import test from "node:test";import assert from "node:assert/strict";import { pdfManifest,isSafeBlobPath } from "../lib/papers/manifest";import { findPaper,papers } from "../lib/papers/catalog";
test("catalog IDs are unique and resolvable",()=>{assert.equal(new Set(papers.map(p=>p.id)).size,papers.length);for(const p of papers)assert.equal(findPaper(p.id),p);});
test("manifest preserves completed-paper entries and covers the reading roadmap",()=>{
  assert.equal(new Set(pdfManifest.map(e=>e.id)).size,pdfManifest.length);
  const recommended=papers.filter(p=>p.keys.some(k=>/^P0-\d{2}$/.test(k)));
  assert.equal(recommended.length,20);
  assert.deepEqual(recommended.flatMap(p=>p.keys.filter(k=>/^P0-\d{2}$/.test(k))).sort(),Array.from({length:20},(_,i)=>`P0-${String(i+1).padStart(2,"0")}`));
  for(const paper of [...papers.filter(p=>p.done),...recommended]){
    const entry=pdfManifest.find(e=>e.id===paper.id);
    assert(entry,`missing manifest entry for ${paper.id}`);
    if(paper.sourceUrl){assert.equal(entry.sourceUrl,paper.sourceUrl);assert(entry.pdfSourceUrl);}
  }
  assert(pdfManifest.some(e=>e.id==="Attention_2"));
});
test("all configured Blob paths are allow-listed and traversal-safe",()=>{for(const entry of pdfManifest)if(entry.blobPathname)assert(isSafeBlobPath(entry.blobPathname));assert.equal(isSafeBlobPath("papers/RL/../secret.pdf"),false);assert.equal(isSafeBlobPath("other/file.pdf"),false);});
test("non-papers are explicitly excluded",()=>{assert.equal(pdfManifest.find(e=>e.id==="RL_1")?.uploadStatus,"excluded");assert.equal(pdfManifest.find(e=>e.id==="RL_3")?.uploadStatus,"excluded");});

test("diffusion taxonomy mirrors Notion",()=>{const diffusion=papers.filter(p=>p.tag==="Diffusion");assert.deepEqual(diffusion.map(p=>p.id),["Diffusion_1","Diffusion_2","Diffusion_3","Diffusion_4","Diffusion_5","Diffusion_6"]);for(const paper of diffusion)assert(pdfManifest.some(e=>e.id===paper.id),`missing Diffusion manifest entry for ${paper.id}`);});
