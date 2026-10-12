-- Upgrade the existing MHM scheduler without changing its Vault token or cron job.
-- Fixes the ambiguous due_date reference that makes the Cron job fail.
-- Run once in Supabase SQL Editor. The next scheduled check uses these functions.

alter table mhm_private.agent_trigger_log
  add column if not exists due_date date;

create index if not exists agent_trigger_log_due_date_idx
  on mhm_private.agent_trigger_log (trigger_name, due_date, requested_at desc);

alter table mhm_private.agent_scheduler_state
  add column if not exists last_confirmed_due_date date;

-- Preserve the outcome of attempts made by the older scheduler, which did not
-- record the UTC date. Failed attempts will be retried at the next cron check.
update mhm_private.agent_trigger_log
   set due_date = (requested_at at time zone 'UTC')::date
 where due_date is null
   and source = 'supabase-cron'
   and requested_at >= now() - interval '14 days';

drop function if exists mhm_private.trigger_research_agent(integer, text);

create or replace function mhm_private.trigger_research_agent(
  run_limit integer default 2,
  trigger_note text default '',
  trigger_due_date date default null
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
      'X-GitHub-Api-Version', '2022-11-28',
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

  insert into mhm_private.agent_trigger_log (request_id, due_date, run_limit, source, note)
  values (request_id, trigger_due_date, run_limit, 'supabase-cron', trigger_note);

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
  v_due_date date := (check_time at time zone 'UTC')::date;
  last_confirmed_due_date date;
  last_request_id bigint;
  last_requested_at timestamptz;
  last_status_code integer;
  last_timed_out boolean;
  last_error_msg text;
  retry_reason text;
  request_id bigint;
begin
  if extract(isodow from utc_time) not in (1, 4) then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, v_due_date, 'skip', 'Not a Monday or Thursday in UTC.');
    return null;
  end if;

  if utc_time::time < time '09:05' then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, v_due_date, 'skip', 'Before 09:05 UTC.');
    return null;
  end if;

  if not pg_try_advisory_xact_lock(hashtext('mhm-research-agent-scheduler')) then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, v_due_date, 'skip', 'Another scheduler check is already running.');
    return null;
  end if;

  select scheduler_state.last_confirmed_due_date
    into last_confirmed_due_date
    from mhm_private.agent_scheduler_state scheduler_state
   where scheduler_state.schedule_name = v_schedule_name;

  if last_confirmed_due_date = v_due_date then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, v_due_date, 'skip', 'Already confirmed for this UTC date.');
    return null;
  end if;

  select
    trigger_log.request_id,
    trigger_log.requested_at,
    response.status_code,
    response.timed_out,
    response.error_msg
    into last_request_id,
      last_requested_at,
      last_status_code,
      last_timed_out,
      last_error_msg
    from mhm_private.agent_trigger_log trigger_log
    left join net._http_response response
      on response.id = trigger_log.request_id
   where trigger_log.trigger_name = v_schedule_name
     and trigger_log.due_date = v_due_date
   order by trigger_log.requested_at desc
   limit 1;

  if last_request_id is not null
     and last_status_code between 200 and 299 then
    insert into mhm_private.agent_scheduler_state
      (schedule_name, last_due_date, last_confirmed_due_date, updated_at)
    values (v_schedule_name, v_due_date, v_due_date, now())
    on conflict (schedule_name)
    do update set
      last_due_date = excluded.last_due_date,
      last_confirmed_due_date = excluded.last_confirmed_due_date,
      updated_at = excluded.updated_at;

    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason)
    values (v_schedule_name, v_due_date, 'skip', 'Already dispatched successfully for this UTC date.');
    return null;
  end if;

  if last_request_id is not null
     and last_status_code is null
     and last_requested_at > now() - interval '5 minutes' then
    insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason, request_id)
    values (v_schedule_name, v_due_date, 'skip', 'Waiting for GitHub dispatch response.', last_request_id);
    return null;
  end if;

  if last_request_id is not null then
    retry_reason := concat(
      'Retrying after previous dispatch did not succeed. request_id=',
      last_request_id,
      ', status_code=',
      coalesce(last_status_code::text, 'pending'),
      ', timed_out=',
      coalesce(last_timed_out::text, 'unknown'),
      ', error=',
      coalesce(last_error_msg, 'none')
    );
  else
    retry_reason := 'First dispatch attempt for this UTC date.';
  end if;

  request_id := mhm_private.trigger_research_agent(
    2,
    'Regular Monday/Thursday research scout run with response-aware catch-up scheduler.',
    v_due_date
  );

  insert into mhm_private.agent_scheduler_log (schedule_name, due_date, action, reason, request_id)
  values (v_schedule_name, v_due_date, 'trigger', retry_reason, request_id);

  return request_id;
end;
$$;
