# Supabase Brain Setup

Supabase stores the private MHM brain state:

- approved graph tables for the public map
- private research request queue
- private run logs
- private candidate proposals for review

The public GitHub Pages site may only use the publishable key. The research
pipeline uses the secret key from local `.env` files or GitHub Actions secrets.

## 1. Create The Supabase Project

1. Go to <https://supabase.com/dashboard/projects>.
2. Create a new project.
3. Wait until the database is ready.

## 2. Apply The Database Schema

Open `SQL Editor` in Supabase and run these files in order:

1. `brain/supabase/migrations/0001_graph_schema.sql`
2. `brain/supabase/migrations/0002_research_brain_schema.sql`

`0001` creates the public graph tables read by the site. `0002` creates the
private brain tables used by the research pipeline.

## 3. Get API Values

Open `Project Settings -> API Keys`.

Copy these values:

- Project URL: `https://your-project-ref.supabase.co`
- Publishable key: starts with `sb_publishable_`
- Secret key: starts with `sb_secret_`

The publishable key is safe for the browser when RLS is enabled. The secret key
must never be placed in `VITE_` variables, browser code, screenshots or commits.

## 4. Local Environment Files

Create `.env` from `.env.example`:

```bash
MUSICBRAINZ_CONTACT=you@example.com
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_server_side_key
OPENAI_API_KEY=
```

Create `.env.local` from `.env.local.example`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_browser_safe_key
```

Install the Python packages once:

```bash
npm run brain:install-python
```

## 5. GitHub Actions Settings

In GitHub, open:

`Settings -> Secrets and variables -> Actions`

Add repository variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Add repository secrets:

- `SUPABASE_SECRET_KEY`
- `MUSICBRAINZ_CONTACT`
- `OPENAI_API_KEY` later, only when the editorial AI stage is enabled

## 6. Load The Approved Graph

Run this locally after the schema exists:

```bash
npm run brain:import
```

That imports `brain/data/approved/graph.json` into `public.entities` and
`public.relations`.

## 7. Give The Brain Work

Fastest local way:

```bash
npm run brain:add-request -- --id expand-ostein-sunde --title "Expand Øystein Sunde" --scope artist_network --priority 80 --instructions "Find music-related graph connections around Øystein Sunde, Gitarkameratene, Norwegian vise, folk and country guitar traditions." --seed "Øystein Sunde:guitarist" --seed "Gitarkameratene:band"
```

List queued database requests:

```bash
npm run brain:list-requests
```

Process queued database requests:

```bash
npm run brain:process-db-inbox
```

Alternative file-first flow:

```bash
npm run brain:sync-inbox
npm run brain:process-db-inbox
```

`brain:sync-inbox` uploads `brain/data/inbox/research-requests.json` into
Supabase, then `brain:process-db-inbox` lets the pipeline read queued requests
from Supabase.

## 8. Review Results

Candidate proposals appear in:

- Supabase table `research_candidates`
- local `brain/data/candidates/` when the job runs locally
- GitHub Action artifacts when the job runs in GitHub Actions

Approved facts still need a human review before they are promoted into
`brain/data/approved/graph.json` and published to the public map.
