create table if not exists public.personal_dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null check (char_length(trim(term)) between 1 and 200),
  normalized_term text not null check (char_length(normalized_term) between 1 and 200),
  meaning text not null check (char_length(trim(meaning)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_dictionary_entries_user_term_key unique (user_id, normalized_term)
);

alter table public.personal_dictionary_entries enable row level security;

revoke all on table public.personal_dictionary_entries from anon;
grant select, insert, update, delete on table public.personal_dictionary_entries to authenticated;

drop policy if exists "Users can select own dictionary entries" on public.personal_dictionary_entries;
create policy "Users can select own dictionary entries"
on public.personal_dictionary_entries for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own dictionary entries" on public.personal_dictionary_entries;
create policy "Users can insert own dictionary entries"
on public.personal_dictionary_entries for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own dictionary entries" on public.personal_dictionary_entries;
create policy "Users can update own dictionary entries"
on public.personal_dictionary_entries for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own dictionary entries" on public.personal_dictionary_entries;
create policy "Users can delete own dictionary entries"
on public.personal_dictionary_entries for delete
to authenticated
using ((select auth.uid()) = user_id);
