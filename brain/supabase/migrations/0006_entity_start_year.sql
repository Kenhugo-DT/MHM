-- Apply before importing graph rows that carry timeline start years.
alter table public.entities
  add column if not exists era_start integer,
  add column if not exists era_start_evidence jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'entities_era_start_range_chk'
      and conrelid = 'public.entities'::regclass
  ) then
    alter table public.entities
      add constraint entities_era_start_range_chk
      check (era_start is null or era_start between 1400 and 2100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'entities_era_start_evidence_chk'
      and conrelid = 'public.entities'::regclass
  ) then
    alter table public.entities
      add constraint entities_era_start_evidence_chk
      check (era_start_evidence is null or
        (era_start is not null and jsonb_typeof(era_start_evidence) = 'object'));
  end if;
end $$;

comment on column public.entities.era_start is
  'First documented activity, group formation, model introduction or stated genre milestone.';
comment on column public.entities.era_start_evidence is
  'Reviewed basis, explanation and sources for era_start; null when no specific review is recorded.';
