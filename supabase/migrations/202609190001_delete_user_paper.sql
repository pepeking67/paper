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

  delete from public.paper_area_assets
  where paper_id = p_paper_id::text and user_id = auth.uid();

  delete from public.paper_study_states
  where paper_id = p_paper_id::text and user_id = auth.uid();

  delete from public.paper_assets
  where paper_id = p_paper_id and user_id = auth.uid();

  delete from public.user_papers
  where id = p_paper_id and user_id = auth.uid();
end;
$$;

revoke all on function public.delete_user_paper(uuid) from public;
grant execute on function public.delete_user_paper(uuid) to authenticated;
