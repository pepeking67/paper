# Account sync setup (Draft PR)

This Draft PR adds optional account-based synchronization for each paper's Study Tray and Study Note. The existing localStorage behavior remains the fallback, so the production site is unchanged until the Supabase variables are configured.

## Synced data

For each authenticated user and paper ID, the app stores one versioned state containing highlights and underlines, selected PDF areas, Saved Insights, free memos, and Study Note Markdown.

The browser also keeps an account-namespaced local cache. Two accounts using the same browser therefore do not share fallback study data.

The client uses optimistic revisions. If another device updates the same paper after the current device last synchronized, the app does not silently overwrite it. The Account Sync panel reports a conflict and asks whether to receive the server version or deliberately keep the current-device version.

## Enable in Preview first

1. Create a Supabase project.
2. Open the Supabase SQL editor and apply `supabase/migrations/20260918_account_study_sync.sql`.
3. In Supabase Authentication, enable Email + Password. Email confirmation may be enabled or disabled; the UI handles both flows.
4. In Vercel, add these environment variables to Preview only:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Redeploy the Draft PR Preview.
6. Use the `계정 Sync` button to create/sign in to an account.
7. Test the same account in two browsers/devices before adding the variables to Production.

Only the public Supabase URL and anon key are exposed to the browser. The database table is protected by Row Level Security. The anon key alone must not be able to read another user's study rows.

## Offline behavior

Every edit is written to local storage before remote sync is attempted. If the network is unavailable, the UI reports a pending state and the local work remains available. Sync is retried when the browser comes online again or when the tab becomes visible.

Existing local-only Study Tray and Study Note content is migrated into the first account only when that account has no remote row for the paper. The legacy local copy is deliberately retained as a safety backup.

## Current limitation to review

Selected-area crop images are still embedded as data URLs inside the synced JSON row. This is acceptable for validating account sync, but it is not the intended long-term storage layout. The next phase should put user-owned PDFs and area crop images in authenticated object storage and keep only durable storage references plus geometry in Postgres.

The next-phase requirements are saved in `docs/WORK_ACCOUNT_LIBRARY_PROMPT.md`.

Do not merge this Draft PR into `main` until cross-device account testing, conflict testing, and the storage design are explicitly approved.
