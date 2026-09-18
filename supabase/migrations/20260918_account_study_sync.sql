-- Account-scoped study state for cross-device sync.
-- Apply this in the Supabase SQL editor before enabling NEXT_PUBLIC_SUPABASE_* in Vercel.

create table if not exists public.paper_study_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id text not null,
  tray jsonb not null default '{"highlights":[],"areas":[],"insights":[],"memos":[]}'::jsonb,
  note_markdown text not null default '',
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

alter table public.paper_study_states enable row level security;

revoke all on table public.paper_study_states from anon;
grant select, insert, update, delete on table public.paper_study_states to authenticated;

drop policy if exists "study states select own" on public.paper_study_states;
create policy "study states select own" on public.paper_study_states for select to authenticated using (auth.uid() = user_id);

drop policy if exists "study states insert own" on public.paper_study_states;
create policy "study states insert own" on public.paper_study_states for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "study states update own" on public.paper_study_states;
create policy "study states update own" on public.paper_study_states for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "study states delete own" on public.paper_study_states;
create policy "study states delete own" on public.paper_study_states for delete to authenticated using (auth.uid() = user_id);

create or replace function public.touch_paper_study_state_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists paper_study_states_touch_updated_at on public.paper_study_states;
create trigger paper_study_states_touch_updated_at
before update on public.paper_study_states
for each row execute function public.touch_paper_study_state_updated_at();
