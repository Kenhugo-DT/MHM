-- Optional reviewer context stays private; the public fact view does not grant this column.
alter table public.entity_facts
  add column if not exists review_reason text;

comment on column public.entity_facts.review_reason is
  'Private reviewer note explaining approval or rejection of a fact lead.';
