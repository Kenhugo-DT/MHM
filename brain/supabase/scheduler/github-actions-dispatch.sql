-- MHM external scout scheduler.
--
-- Run this in Supabase SQL Editor after replacing <GITHUB_FINE_GRAINED_PAT>.
-- The token should only have Actions: read/write access for Kenhugo-DT/MHM.
-- This uses Supabase Cron as the clock and GitHub workflow_dispatch as the worker trigger.

create extension if not exists pg_net;
create extension if not exists pg_cron;
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  existing_secret_id uuid;
begin
  select id
    into existing_secret_id
    from vault.secrets
   where name = 'mhm_github_actions_token'
   limit 1;

  if existing_secret_id is null then
    perform vault.create_secret(
      '<GITHUB_FINE_GRAINED_PAT>',
      'mhm_github_actions_token',
      'Fine-grained GitHub token used by Supabase Cron to trigger the MHM research scout workflow.'
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      '<GITHUB_FINE_GRAINED_PAT>',
      'mhm_github_actions_token',
      'Fine-grained GitHub token used by Supabase Cron to trigger the MHM research scout workflow.'
    );
  end if;
end $$;

create schema if not exists mhm_private;

create table if not exists mhm_private.agent_trigger_log (
  id bigint generated always as identity primary key,
  trigger_name text not null default 'mhm-research-agent',
  request_id bigint,
  requested_at timestamptz not null default now(),
  run_limit integer not null default 2,
  source text not null default 'supabase-cron',
  note text
);

create table if not exists mhm_private.agent_scheduler_state (
  schedule_name text primary key,
  last_due_date date,
  updated_at timestamptz not null default now()
);

create table if not exists mhm_private.agent_scheduler_log (
  id bigint generated always as identity primary key,
  schedule_name text not null default 'mhm-research-agent',
  checked_at timestamptz not null default now(),
  due_date date,
  action text not null,
  reason text,
  request_id bigint
);

create or replace function mhm_private.trigger_research_agent(
  run_limit integer default 2,
  trigger_note text default ''
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, mhm_private
as $$
declare
  github_token text;
  request_id bigint;
begin
  select decrypted_secret
    into github_token
    from vault.decrypted_secrets
   where name = 'mhm_github_actions_token'
   limit 1;

  if github_token is null or length(github_token) < 20 then
    raise exception 'Missing mhm_github_actions_token in Supabase Vault.';
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/Kenhugo-DT/MHM/actions/workflows/research-agent.yml/dispatches',
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || github_token,
      'X-GitHub-Api-Version', '2026-03-10',
      'User-Agent', 'mhm-supabase-cron'
    ),
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_build_object(
        'source', 'supabase-cron',
        'limit', run_limit::text,
        'note', trigger_note
      )
    ),
    timeout_milliseconds := 10000
  ) into request_id;

  insert into mhm_private.agent_trigger_log (request_id, run_limit, source, note)
  values (request_id, run_limit, 'supabase-cron', trigger_note);

  return request_id;
end;
$$;

create or replace function mhm_private.trigger_research_agent_if_due(
  check_time timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, mhm_private
as $$
declare
  v_schedule_name text := 'mhm-research-agent';
  utc_time timestamp := check_time at time zone 'UTC';
  due_date date := (check_time at time zone 'UTC')::date;
  already_ran date;
  request_id bigint;
begin
  if extract(isodow from utc_time) not in (1, 4) then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, due_date, 'skip', 'Not a Monday or Thursday in UTC.');
    return null;
  end if;

  if utc_time::time < time '09:05' then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, due_date, 'skip', 'Before 09:05 UTC.');
    return null;
  end if;

  if not pg_try_advisory_xact_lock(hashtext('mhm-research-agent-scheduler')) then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, due_date, 'skip', 'Another scheduler check is already running.');
    return null;
  end if;

  select last_due_date
    into already_ran
    from mhm_private.agent_scheduler_state
   where agent_scheduler_state.schedule_name = v_schedule_name;

  if already_ran = due_date then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, due_date, 'skip', 'Already triggered for this UTC date.');
    return null;
  end if;

  request_id := mhm_private.trigger_research_agent(
    2,
    'Regular Monday/Thursday research scout run with catch-up scheduler.'
  );

  insert into mhm_private.agent_scheduler_state (schedule_name, last_due_date, updated_at)
  values (v_schedule_name, due_date, now())
  on conflict (schedule_name)
  do update set
    last_due_date = excluded.last_due_date,
    updated_at = excluded.updated_at;

  insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason, request_id)
  values (v_schedule_name, due_date, 'trigger', 'Triggered GitHub workflow_dispatch.', request_id);

  return request_id;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mhm-research-agent') then
    perform cron.unschedule('mhm-research-agent');
  end if;
end $$;

select cron.schedule(
  'mhm-research-agent',
  '5,20,35,50 9-23 * * 1,4',
  $$ select mhm_private.trigger_research_agent_if_due(now()); $$
);

-- Manual smoke test:
-- Uncomment and run this line after setup if you want Supabase to trigger one run immediately.
-- select mhm_private.trigger_research_agent(1, 'Manual smoke test from Supabase SQL Editor.');
