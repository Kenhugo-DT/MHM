create extension if not exists pgcrypto;

-- Keep the public graph readable, but make browser writes explicitly unavailable.
revoke insert, update, delete on table public.entities from anon, authenticated;
revoke insert, update, delete on table public.relations from anon, authenticated;
revoke all on table public.expansion_requests from anon, authenticated;

grant select on table public.entities to anon, authenticated;
grant select on table public.relations to anon, authenticated;

create table if not exists public.research_requests (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  title text not null,
  status text not null default 'queued' check (
    status in ('queued', 'paused', 'processing', 'processed', 'failed', 'rejected')
  ),
  priority integer not null default 50 check (priority between 0 and 100),
  scope text not null check (
    scope in ('artist_network', 'guitar_history', 'genre_cluster', 'route', 'open_research')
  ),
  instructions text not null,
  seeds jsonb not null default '[]'::jsonb check (jsonb_typeof(seeds) = 'array'),
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  notes text,
  source text not null default 'manual',
  candidate_output text,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_runs (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  status text not null default 'running' check (
    status in ('running', 'completed', 'failed')
  ),
  request_ids text[] not null default '{}',
  dry_run boolean not null default false,
  seed_count integer not null default 0 check (seed_count >= 0),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  log jsonb not null default '{}'::jsonb check (jsonb_typeof(log) = 'object'),
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.research_runs(id) on delete cascade,
  request_id text references public.research_requests(id) on delete set null,
  seed_name text not null,
  requested_kind text not null check (
    requested_kind in ('band', 'guitarist', 'artist', 'guitar', 'guitar_brand', 'genre')
  ),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'review' check (
    status in ('review', 'approved', 'imported', 'rejected')
  ),
  confidence double precision check (confidence is null or confidence between 0 and 1),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, seed_name, requested_kind)
);

create index if not exists research_requests_status_idx
  on public.research_requests(status, priority desc, created_at);
create index if not exists research_runs_status_idx
  on public.research_runs(status, started_at desc);
create index if not exists research_candidates_status_idx
  on public.research_candidates(status, created_at desc);
create index if not exists research_candidates_request_idx
  on public.research_candidates(request_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_research_requests_updated_at on public.research_requests;
create trigger touch_research_requests_updated_at
before update on public.research_requests
for each row execute function public.touch_updated_at();

drop trigger if exists touch_research_runs_updated_at on public.research_runs;
create trigger touch_research_runs_updated_at
before update on public.research_runs
for each row execute function public.touch_updated_at();

drop trigger if exists touch_research_candidates_updated_at on public.research_candidates;
create trigger touch_research_candidates_updated_at
before update on public.research_candidates
for each row execute function public.touch_updated_at();

alter table public.research_requests enable row level security;
alter table public.research_runs enable row level security;
alter table public.research_candidates enable row level security;

revoke all on table public.research_requests from anon, authenticated;
revoke all on table public.research_runs from anon, authenticated;
revoke all on table public.research_candidates from anon, authenticated;

grant select, insert, update, delete on table public.research_requests to service_role;
grant select, insert, update, delete on table public.research_runs to service_role;
grant select, insert, update, delete on table public.research_candidates to service_role;

comment on table public.research_requests is
  'Private queue for MHM brain work. Write access is server-side only.';
comment on table public.research_runs is
  'Private log of MHM brain collection runs.';
comment on table public.research_candidates is
  'Private review proposals created by MHM brain runs before human approval.';
