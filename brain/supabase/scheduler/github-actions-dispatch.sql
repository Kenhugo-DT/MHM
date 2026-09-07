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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mhm-research-agent') then
    perform cron.unschedule('mhm-research-agent');
  end if;
end $$;

select cron.schedule(
  'mhm-research-agent',
  '5 9 * * 1,4',
  $$ select mhm_private.trigger_research_agent(2, 'Regular Monday/Thursday research scout run.'); $$
);

-- Manual smoke test:
-- Uncomment and run this line after setup if you want Supabase to trigger one run immediately.
-- select mhm_private.trigger_research_agent(1, 'Manual smoke test from Supabase SQL Editor.');
