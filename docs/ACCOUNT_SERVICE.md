# Account service operations

## Architecture

The checked-in catalog and Vercel Blob PDF path remain the read-only **Legacy / Shared library**. Signing in adds a separate, RLS-protected personal library backed by `paper_categories`, `user_papers`, `paper_assets`, `paper_study_states`, and `paper_area_assets`.

Study edits are local-first: every action writes the account-scoped browser cache before a debounced Supabase update. A dirty cache survives an offline session and retries on `online`. The update matches the last known `revision`; a mismatch opens a choice between the server copy and the device copy instead of overwriting either silently. Legacy `paper-study-tray:<paperId>` and `paper-study-note:<paperId>` data is imported only when the account has no server row, and a per-account marker prevents repeated imports. The legacy keys remain untouched as a backup.

## Required Preview environment

Set these as Vercel **Preview** environment variables. The publishable key is intentionally safe for browser use; never add a service-role or secret key to a `NEXT_PUBLIC_*` variable.

```text
NEXT_PUBLIC_SUPABASE_URL=https://cuanlnknxbwsuchgbjhr.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<active Supabase publishable key>
```

Existing server-only variables such as `GEMINI_API_KEY` and `BLOB_READ_WRITE_TOKEN` stay server-only. No paid Supabase feature, database branch, image transformation, extra compute, or PITR is required.

## Storage and quota rules

- PDF: `paper-pdfs/<user_id>/<paper_uuid>/<checksum-prefix>-<sanitized-name>.pdf`, 50 MB maximum.
- Crop: `paper-area-crops/<user_id>/<paper-id>/<area-id>.webp`, compressed in the browser, 5 MB maximum.
- The database stores metadata, normalized coordinates, Markdown, and Storage paths only. It does not store PDF bytes or newly-created image data URLs.
- Existing base64 crops remain readable and migrate lazily when the owner signs in.
- PDF deletion requires an explicit UI confirmation. `delete_user_paper(uuid)` removes related database rows in one transaction; Storage paths are then removed through a persistent local cleanup queue and retried after a later refresh if necessary.

Apply the checked-in migration before testing a deployment:

```text
supabase/migrations/202609190001_delete_user_paper.sql
```

## Security verification

`npm run test:rls` requires two already-confirmed disposable accounts and uses only their normal authenticated JWTs:

```text
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
RLS_TEST_EMAIL_A=...
RLS_TEST_PASSWORD_A=...
RLS_TEST_EMAIL_B=...
RLS_TEST_PASSWORD_B=...
npm run test:rls
```

It creates temporary rows and objects for both owners, tests cross-account SELECT/INSERT/UPDATE/DELETE and private Storage download/upload/delete, and removes its fixtures in `finally`. It never uses a service-role key.

## Rollback

1. Roll back the Preview deployment or close the Draft PR. The Legacy / Shared catalog and guest localStorage flow remain available.
2. If the RPC must be removed, run `drop function if exists public.delete_user_paper(uuid);`. Do not drop account tables or buckets: they may contain user data.
3. Existing account rows, PDFs, crops, and legacy localStorage backups are preserved by a code rollback.
