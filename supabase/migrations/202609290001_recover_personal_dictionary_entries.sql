-- Recover valid legacy dictionary annotations that still live inside each user's
-- paper study-state JSON. Existing account-dictionary edits always win.
with recoverable as (
  select
    states.user_id,
    left(trim(annotation ->> 'text'), 200) as term,
    left(trim(regexp_replace(annotation ->> 'dictionaryMeaning', '[[:space:]]+', ' ', 'g')), 100) as meaning,
    states.updated_at
  from public.paper_study_states as states
  cross join lateral jsonb_array_elements(coalesce(states.tray -> 'highlights', '[]'::jsonb)) as annotation
  where annotation ->> 'kind' = 'dictionary'
    and nullif(trim(annotation ->> 'text'), '') is not null
    and nullif(trim(annotation ->> 'dictionaryMeaning'), '') is not null
    and trim(annotation ->> 'dictionaryMeaning') not in ('뜻 찾는 중…', '뜻을 입력하세요')
), normalized as (
  select
    user_id,
    term,
    meaning,
    left(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(term), '[–—-]', ' ', 'g'),
            '[^a-z0-9가-힣[:space:]]',
            ' ',
            'g'
          ),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ),
      200
    ) as normalized_term,
    updated_at
  from recoverable
), newest as (
  select distinct on (user_id, normalized_term)
    user_id,
    term,
    normalized_term,
    meaning,
    updated_at
  from normalized
  where nullif(normalized_term, '') is not null
  order by user_id, normalized_term, updated_at desc
)
insert into public.personal_dictionary_entries (
  user_id,
  term,
  normalized_term,
  meaning,
  created_at,
  updated_at
)
select
  user_id,
  term,
  normalized_term,
  meaning,
  updated_at,
  updated_at
from newest
on conflict (user_id, normalized_term) do nothing;
