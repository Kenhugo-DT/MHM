-- Let the existing human-review queue cover every supported map node type.
create or replace function public.prepare_entity_fact()
returns trigger
language plpgsql
as $$
declare
  source_item jsonb;
begin
  if not exists (
    select 1 from public.entities
    where id = new.entity_id
      and node_type in ('band', 'artist', 'guitarist', 'genre', 'guitar', 'guitar_brand')
  ) then
    raise exception 'Facts require an existing supported map node';
  end if;

  if cardinality(new.tags) < 1 or cardinality(new.tags) > 5 then
    raise exception 'Facts require 1-5 tags';
  end if;
  for source_item in select elem from jsonb_array_elements(new.sources) as source(elem) loop
    if jsonb_typeof(source_item) <> 'object'
      or nullif(btrim(source_item->>'label'), '') is null
      or coalesce(source_item->>'url', '') !~ '^https://[^ ]+$' then
      raise exception 'Each fact source needs a label and HTTPS URL';
    end if;
  end loop;
  if new.text ~* '\m(first|only|largest|most|oldest|youngest)\M'
    and jsonb_array_length(new.sources) < 2 then
    raise exception 'Superlative facts require two sources';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'approved'
      and (old.text, old.year, old.tags, old.sources, old.entity_id)
        is distinct from (new.text, new.year, new.tags, new.sources, new.entity_id) then
      new.status := 'review';
      new.verified_at := null;
    end if;
  end if;

  if new.status = 'approved' and not exists (
    select 1 from jsonb_array_elements(new.sources) as source(value)
    where source.value->>'url' !~* '^https://([a-z0-9-]+\.)*wikipedia\.org/'
  ) then
    raise exception 'Approval requires a source independent of Wikipedia';
  end if;

  if new.status = 'approved' and new.verified_at is null then
    new.verified_at := current_date;
    new.reviewed_at := now();
  end if;
  if new.status <> 'approved' then
    new.verified_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.prepare_entity_fact() from public, anon, authenticated;
