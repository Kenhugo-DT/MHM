create extension if not exists pgcrypto;

-- Fact proposals are separate from graph candidates. Only approved rows are public.
create table if not exists public.entity_facts (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null references public.entities(id) on delete cascade,
  text text not null check (char_length(text) between 35 and 200),
  year integer check (year is null or year between 1800 and 2100),
  tags text[] not null default '{music-history}',
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  evidence text not null default '',
  status text not null default 'review' check (status in ('review', 'approved', 'rejected')),
  source_fingerprint text not null,
  verified_at date,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, source_fingerprint)
);

create index if not exists entity_facts_review_idx
  on public.entity_facts(status, created_at desc);
create index if not exists entity_facts_entity_idx
  on public.entity_facts(entity_id, status);

create or replace function public.prepare_entity_fact()
returns trigger
language plpgsql
as $$
declare
  source_item jsonb;
begin
  if not exists (
    select 1 from public.entities
    where id = new.entity_id and node_type in ('band', 'artist', 'guitarist')
  ) then
    raise exception 'Facts require an existing band, artist or guitarist';
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

drop trigger if exists prepare_entity_fact_trigger on public.entity_facts;
create trigger prepare_entity_fact_trigger
before insert or update on public.entity_facts
for each row execute function public.prepare_entity_fact();

alter table public.entity_facts enable row level security;
revoke all on table public.entity_facts from anon, authenticated;
grant select (id, entity_id, text, year, tags, sources, verified_at, status, reviewed_at)
  on table public.entity_facts to anon, authenticated;
grant select, insert, update, delete on table public.entity_facts to service_role;

drop policy if exists "Only approved facts are visible" on public.entity_facts;
create policy "Only approved facts are visible"
on public.entity_facts for select to anon, authenticated
using (status = 'approved');

create table if not exists public.fact_scout_attempts (
  entity_id text primary key references public.entities(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null check (outcome in ('proposed', 'no_match', 'source_error'))
);
alter table public.fact_scout_attempts enable row level security;
revoke all on table public.fact_scout_attempts from anon, authenticated;
grant select, insert, update, delete on table public.fact_scout_attempts to service_role;

comment on table public.entity_facts is
  'Human-reviewed fact proposals. Public clients can read only approved rows.';
comment on table public.fact_scout_attempts is
  'Private backoff history for automatic fact scouting.';
