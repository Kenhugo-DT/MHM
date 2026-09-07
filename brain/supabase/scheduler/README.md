# Supabase Scheduler

This folder contains the external clock for the MHM research scout.

GitHub Actions still runs the existing Python agent, but GitHub no longer has
to wake itself with `schedule`. Supabase Cron triggers the workflow through
GitHub's `workflow_dispatch` API.

## Why

The scout code already works locally and through manual GitHub workflow runs.
The weak point is GitHub's scheduled trigger. Moving the clock to Supabase gives
us one place to monitor the schedule next to the private brain tables.

## Setup

1. Create a fine-grained GitHub token:
   - GitHub -> profile picture -> Settings
   - Developer settings -> Personal access tokens -> Fine-grained tokens
   - Generate new token
   - Repository access: only `Kenhugo-DT/MHM`
   - Repository permissions: `Actions` = Read and write
   - `Metadata` stays Read-only
2. Copy `brain/supabase/scheduler/github-actions-dispatch.sql`.
3. Replace `<GITHUB_FINE_GRAINED_PAT>` with the token.
4. Paste the SQL into Supabase SQL Editor and press Run.
5. Optional smoke test: uncomment the final `select mhm_private.trigger_research_agent(...)`
   line and run it once.

## Schedule

The default schedule is:

```text
5 9 * * 1,4
```

That means Mondays and Thursdays at 09:05 UTC.

## What Happens

Supabase stores the GitHub token in Vault, creates a private helper function,
then schedules a Cron job named `mhm-research-agent`.

Each Cron run calls GitHub's workflow dispatch endpoint for:

```text
Kenhugo-DT/MHM/.github/workflows/research-agent.yml
```

The workflow then runs:

```bash
npm run brain:agent -- --limit 2
```

The agent writes review candidates to Supabase. It does not promote or publish
anything by itself.

## Inspect

See scheduled jobs:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'mhm-research-agent';
```

See Supabase trigger attempts:

```sql
select *
from mhm_private.agent_trigger_log
order by requested_at desc
limit 20;
```

See Cron history:

```sql
select *
from cron.job_run_details
where jobid in (
  select jobid from cron.job where jobname = 'mhm-research-agent'
)
order by start_time desc
limit 20;
```

## Disable

```sql
select cron.unschedule('mhm-research-agent');
```
