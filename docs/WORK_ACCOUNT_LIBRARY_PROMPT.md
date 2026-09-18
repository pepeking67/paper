# ChatGPT Work prompt — account-specific paper library and categories

Use the following as the task prompt in ChatGPT Work with GitHub repo `pepeking67/paper` and Vercel project `paper_archiving` connected.

---

Continue the paper-study app from the latest account-sync Draft PR. **Do not merge to `main` and do not deploy to Production unless I explicitly approve it.** Continue in the current Draft PR when practical; if the scope needs isolation, create a new branch and Draft PR based on it. Keep a Vercel Preview deployment available so I can test milestones continuously.

## Goal

Convert the current globally shared/static paper catalog into an account-scoped paper library. Different accounts must be able to own different papers, PDF files, categories/tags, reading status, metadata, annotations, Study Tray data, Saved Insights, Study Notes, and ordering.

One user's private papers, categories, PDFs, crop images, notes, or study state must never be readable or enumerable by another account.

Do not break or delete the existing curated catalog during migration. Preserve a safe path for the current papers to remain as a read-only shared starter library or to be copied/imported into a user's private library.

## Build on the current account-sync foundation

Use the Supabase Authentication + Postgres/RLS design introduced in the Draft PR. Keep the existing offline-first local cache and optimistic conflict protection for study-state editing.

Use Postgres as the source of truth for account-owned metadata. Use Supabase Storage, or another equally secure authenticated object store only if there is a concrete architectural reason, for user-owned PDFs and selected-area crop images. Existing Vercel Blob assets may remain as legacy/shared sources during migration.

Never expose a Supabase service-role key or any equivalent privileged token in client code. Ownership must be enforced by Row Level Security and storage policies, not merely by filtering the UI.

## Data model

Create versioned migrations for a normalized model covering at least:

- `paper_categories`: UUID id, user_id, name, display_order, created_at, updated_at.
- `user_papers`: UUID id, user_id, title, authors, year, category_id, source_url, optional notion_url, reading status, user-defined keys/aliases, display_order, created_at, updated_at.
- `paper_assets`: user_id, paper_id, storage path, original filename, content type, byte size, checksum/version, processing status, created_at, updated_at.
- Study-state records linked safely to the account-owned paper rather than assuming globally unique string IDs such as `Diffusion_1`.
- Selected-area crop images moved out of JSON/base64 into authenticated object storage. Keep only storage references, page number, normalized geometry, and metadata in the database.

Use foreign keys and intentional cascade behavior. Add RLS policies for SELECT, INSERT, UPDATE, DELETE on every account-owned table. Add equivalent storage ownership policies.

## User experience

After login, the left library should primarily load the current account's papers/categories instead of relying on the hard-coded catalog. The user must be able to:

1. Create, rename, reorder, and delete categories.
2. Upload a PDF and create a paper record.
3. Edit title, authors, year, source URL, category, keys/aliases, reading status, and ordering.
4. Move a paper between categories without losing its PDF, highlights, underlines, selected areas, Saved Insights, memos, or Study Note.
5. Delete a paper through a clear confirmation flow with predictable asset cleanup.
6. Open the same account on another device and see the same library and study state.
7. Use all current study features without regression: PDF scroll reader, highlights, underlines, visible selected areas, Study Chat, Study Tray, generated Study Note, annotated-PDF download, and resizable chat.
8. Preserve the current rule that selected areas remain visible while studying but are not drawn into the downloaded annotated PDF; highlights and underlines are included.
9. Keep offline-first behavior for study-state edits. Metadata and PDF operations may require connectivity, but failure must never silently discard study work.

## Migration and compatibility

Treat `lib/papers/catalog.ts`, the manifest, and the current private PDF source as legacy/shared data. Do not delete them early.

Introduce a repository/adapter layer so the UI can resolve both account-owned papers and legacy/shared papers during transition. Propose and implement a deterministic import path for the current catalog.

Do not change current identifiers in a way that loses existing browser-local or account-synced annotations. If IDs need to change, create an explicit mapping/migration and test it.

## Multi-device safety

Continue using optimistic concurrency/versioning. A stale device must not silently overwrite a newer remote study state. Preserve the explicit conflict resolution UI or improve it.

Test offline edit → reconnect → sync, and deliberately create a conflict between two browser sessions. Confirm that neither side is silently lost.

## Security

Verify with two real test accounts that account A cannot list account B's categories or papers, fetch account B's PDF paths or signed URLs, read account B's Study Tray/Study Note, read account B's area crop images, or mutate/delete account B's data.

Use short-lived signed URLs if private assets require them. Validate PDF content type and size, sanitize filenames, and avoid trusting client-supplied ownership IDs.

## Validation before asking me to merge

Keep the PR as Draft until all of these are complete:

- Run the repository's real test suite and report the exact command/results.
- Run build/type checking.
- Confirm the Vercel Preview deployment is READY.
- Test account creation, login, logout, and session refresh.
- Test two different accounts for isolation.
- Test one account in two browser sessions for synchronization.
- Test category create/rename/reorder/delete.
- Test PDF upload/open/move/delete.
- Test annotations, selected areas, Study Tray, Study Note editing/generation, and annotated-PDF download after reload.
- Test offline edit and reconnect.
- Test a deliberate two-device revision conflict.

Update the Draft PR description with schema changes, migrations, environment variables, storage policy, known limitations, rollback steps, and any manual setup still required.

**Do not merge to main without my explicit approval.**

---

The intended end state is a personal multi-device research workspace where each account owns its own paper library/categories and all study data follows that account securely across devices.
