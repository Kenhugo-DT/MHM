create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.entities (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  label text not null,
  node_type text not null check (
    node_type in ('band', 'guitarist', 'artist', 'guitar', 'guitar_brand', 'genre')
  ),
  roles text[] not null default '{}',
  summary text not null default '',
  metadata text[] not null default '{}',
  aliases text[] not null default '{}',
  map_x double precision not null default 0,
  map_y double precision not null default 0,
  map_zone text not null default 'unplaced',
  starter boolean not null default false,
  image jsonb,
  sources jsonb not null default '[]'::jsonb,
  source_fingerprint text,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.entities(id) on delete cascade,
  target_id text not null references public.entities(id) on delete cascade,
  relation_type text not null check (
    relation_type in (
      'member_of',
      'collaboration',
      'influenced_by',
      'associated_genre',
      'plays',
      'made_by',
      'signature_instrument',
      'related'
    )
  ),
  label text not null,
  strength double precision not null default 0.5 check (strength between 0 and 1),
  context text[] not null default '{}',
  year integer,
  sources jsonb not null default '[]'::jsonb,
  source_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_id <> target_id),
  unique (source_id, target_id, relation_type, label)
);

create table if not exists public.expansion_requests (
  id uuid primary key default gen_random_uuid(),
  entity_id text references public.entities(id) on delete cascade,
  search_term text,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'review', 'published', 'rejected')
  ),
  request_count integer not null default 1,
  first_requested_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  result jsonb,
  check (entity_id is not null or nullif(trim(search_term), '') is not null)
);

create index if not exists entities_node_type_idx on public.entities(node_type);
create index if not exists entities_zone_idx on public.entities(map_zone);
create index if not exists entities_search_idx on public.entities using gin(search_text gin_trgm_ops);
create index if not exists relations_source_idx on public.relations(source_id);
create index if not exists relations_target_idx on public.relations(target_id);
create index if not exists expansion_status_idx on public.expansion_requests(status, last_requested_at);

create or replace function public.prepare_entity()
returns trigger
language plpgsql
as $$
begin
  new.search_text := lower(
    concat_ws(' ', new.label, array_to_string(new.aliases, ' '), array_to_string(new.roles, ' '))
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prepare_entity_trigger on public.entities;
create trigger prepare_entity_trigger
before insert or update on public.entities
for each row execute function public.prepare_entity();

create or replace function public.graph_neighborhood(
  center_id text,
  neighbor_limit integer default 80
)
returns jsonb
language sql
stable
security invoker
as $$
  with neighbor_ids as (
    select center_id as id
    union
    select case when source_id = center_id then target_id else source_id end
    from public.relations
    where source_id = center_id or target_id = center_id
    order by id
    limit greatest(1, least(neighbor_limit, 200))
  ),
  neighborhood_nodes as (
    select e.*
    from public.entities e
    join neighbor_ids n on n.id = e.id
  ),
  neighborhood_edges as (
    select r.*
    from public.relations r
    where r.source_id in (select id from neighbor_ids)
      and r.target_id in (select id from neighbor_ids)
  )
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(n) from neighborhood_nodes n), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(e) from neighborhood_edges e), '[]'::jsonb)
  );
$$;

create or replace function public.graph_map(
  node_types text[],
  entity_limit integer default 800
)
returns jsonb
language sql
stable
security invoker
as $$
  with map_nodes as (
    select e.*
    from public.entities e
    where e.node_type = any(node_types)
    order by e.starter desc, e.label
    limit greatest(1, least(entity_limit, 1200))
  ),
  map_edges as (
    select r.*
    from public.relations r
    where r.source_id in (select id from map_nodes)
      and r.target_id in (select id from map_nodes)
    limit 5000
  )
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(n) from map_nodes n), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(e) from map_edges e), '[]'::jsonb)
  );
$$;

alter table public.entities enable row level security;
alter table public.relations enable row level security;
alter table public.expansion_requests enable row level security;

create policy "Public graph entities are readable"
on public.entities for select
to anon, authenticated
using (true);

create policy "Public graph relations are readable"
on public.relations for select
to anon, authenticated
using (true);

grant select on public.entities to anon, authenticated;
grant select on public.relations to anon, authenticated;
grant execute on function public.graph_neighborhood(text, integer) to anon, authenticated;
grant execute on function public.graph_map(text[], integer) to anon, authenticated;

comment on table public.expansion_requests is
  'Written only by a trusted server or Edge Function. Browser clients do not receive insert access.';
