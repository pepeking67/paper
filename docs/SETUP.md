# Paper Study deployment and storage

## Deployment

1. Import `pepeking67/paper` into Vercel.
2. Use the Next.js framework preset and repository root directory.
3. Configure the Supabase and Gemini environment variables listed in `.env.example`.
4. Verify the Draft PR with a Vercel Preview before merging to `main`.

The service is account-only. It does not download or serve the old GitHub catalog PDFs through Vercel Blob.

## PDF storage

Authenticated users upload PDFs to the private Supabase Storage bucket `paper-pdfs` using this path:

```text
<auth-user-id>/<paper-uuid>/<checksum>.pdf
```

Selected-area images use the private `paper-area-crops` bucket. PDF bytes and image base64 are not stored in Postgres. Browser requests use the signed-in user's JWT, and no service-role key is exposed to the client.

## PDF rendering and AI

PDF.js runs its worker from the deployment at `/pdf.worker.min.mjs`. The `predev` and `prebuild` scripts copy the matching worker, CMaps, standard fonts, and PDFium fallback assets into `public/`.

Chat and dictionary requests use Gemini from server routes. Set `GEMINI_API_KEY` and `GEMINI_MODEL` in Vercel. Requests send bounded page text, selected annotations, selected areas, the question, and recent history rather than the entire PDF.
