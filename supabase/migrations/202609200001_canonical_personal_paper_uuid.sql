-- Make user_papers.id the single canonical identity for all account study data.
-- Legacy/orphaned study rows are intentionally discarded.

delete from public.paper_area_assets a
where not exists (
  select 1 from public.user_papers p
  where p.id::text = a.paper_id and p.user_id = a.user_id
);

delete from public.paper_study_states s
where not exists (
  select 1 from public.user_papers p
  where p.id::text = s.paper_id and p.user_id = s.user_id
);

alter table public.user_papers
  drop constraint if exists user_papers_user_id_id_key;

alter table public.user_papers
  add constraint user_papers_user_id_id_key unique (user_id, id);

alter table public.paper_study_states
  alter column paper_id type uuid using paper_id::uuid;

alter table public.paper_area_assets
  alter column paper_id type uuid using paper_id::uuid;

alter table public.paper_study_states
  drop constraint if exists paper_study_states_owned_paper_fkey;

alter table public.paper_study_states
  add constraint paper_study_states_owned_paper_fkey
  foreign key (user_id, paper_id)
  references public.user_papers (user_id, id)
  on delete cascade;

alter table public.paper_area_assets
  drop constraint if exists paper_area_assets_owned_paper_fkey;

alter table public.paper_area_assets
  add constraint paper_area_assets_owned_paper_fkey
  foreign key (user_id, paper_id)
  references public.user_papers (user_id, id)
  on delete cascade;

create or replace function public.delete_user_paper(p_paper_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_papers
    where id = p_paper_id and user_id = auth.uid()
  ) then
    raise exception 'paper not found or not owned by current user';
  end if;

  delete from public.user_papers
  where id = p_paper_id and user_id = auth.uid();
end;
$$;

revoke all on function public.delete_user_paper(uuid) from public;
grant execute on function public.delete_user_paper(uuid) to authenticated;
