-- Human review history and durable snapshots for the research ranking pilot.
-- Safe to rerun. Existing candidate statuses remain unchanged.

alter table public.research_candidates
  add column if not exists review_reason_code text;
alter table public.research_candidates
  add column if not exists review_note text;

alter table public.research_candidates
  drop constraint if exists research_candidates_review_reason_code_check;
alter table public.research_candidates
  add constraint research_candidates_review_reason_code_check check (
    review_reason_code is null or review_reason_code in (
      'duplicate', 'wrong_entity', 'weak_source', 'weak_connection',
      'incorrect_fact', 'out_of_scope', 'not_relevant', 'other'
    )
  );

create table if not exists public.research_review_events (
  id bigint generated always as identity primary key,
  candidate_id uuid not null,
  previous_status text,
  status text not null check (status in ('review', 'approved', 'imported', 'rejected')),
  reason_code text,
  note text,
  origin text not null check (origin in ('backfill', 'review_change')),
  happened_at timestamptz not null default now()
);

create index if not exists research_review_events_candidate_idx
  on public.research_review_events(candidate_id, happened_at desc);

insert into public.research_review_events
  (candidate_id, previous_status, status, reason_code, note, origin, happened_at)
select c.id, null, c.status, c.review_reason_code, c.review_note,
       'backfill', coalesce(c.updated_at, c.created_at)
from public.research_candidates c
where c.status in ('approved', 'imported', 'rejected')
  and not exists (
    select 1 from public.research_review_events e where e.candidate_id = c.id
  );

create or replace function public.record_research_review_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('approved', 'imported', 'rejected') then
      insert into public.research_review_events
        (candidate_id, previous_status, status, reason_code, note, origin)
      values (new.id, null, new.status, new.review_reason_code,
              new.review_note, 'review_change');
    end if;
  elsif new.status is distinct from old.status
     or new.review_reason_code is distinct from old.review_reason_code
     or new.review_note is distinct from old.review_note then
    insert into public.research_review_events
      (candidate_id, previous_status, status, reason_code, note, origin)
    values (new.id, old.status, new.status, new.review_reason_code,
            new.review_note, 'review_change');
  end if;
  return new;
end;
$$;

drop trigger if exists record_research_review_event on public.research_candidates;
create trigger record_research_review_event
after insert or update of status, review_reason_code, review_note
on public.research_candidates
for each row execute function public.record_research_review_event();

revoke all on function public.record_research_review_event() from public;

create table if not exists public.research_learning_snapshots (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('shadow', 'active')),
  decision_count integer not null check (decision_count >= 0),
  model jsonb not null check (jsonb_typeof(model) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists research_learning_snapshots_created_idx
  on public.research_learning_snapshots(created_at desc);

alter table public.research_review_events enable row level security;
alter table public.research_learning_snapshots enable row level security;

revoke all on table public.research_review_events from anon, authenticated;
revoke all on table public.research_learning_snapshots from anon, authenticated;
grant select, insert on table public.research_review_events to service_role;
grant select, insert on table public.research_learning_snapshots to service_role;
grant usage, select on sequence public.research_review_events_id_seq to service_role;
grant usage, select on sequence public.research_learning_snapshots_id_seq to service_role;

-- Read-only diagnostics after the next scheduled scout:
-- select created_at, mode, decision_count,
--        model->'validation' as validation,
--        model->>'activationEligible' as activation_eligible
-- from public.research_learning_snapshots order by created_at desc limit 5;
