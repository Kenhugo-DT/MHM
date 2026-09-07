# Brain

This directory is the private research and curation side of Music History Map.
It can collect candidates, audit the graph and later import approved data
to a database. The public React app lives in `site/`.

The brain should propose changes. It should not silently publish them.

## Folders

- `pipeline/` contains Python source collectors and import tools.
- `scripts/` contains local graph migration and audit utilities.
- `data/inbox/` stores research requests from the project owner.
- `data/approved/` stores the reviewed graph used as the source of truth.
- `data/candidates/` stores proposed additions for review.
- `data/rejected/` stores rejected or out-of-scope suggestions.
- `data/runs/` is local run output and is ignored by git.
- `supabase/` contains database migrations and setup notes for the hosted brain.

## Commands

Run these from the repository root:

```bash
npm run migrate:data
npm run brain:install-python
npm run brain:audit
npm run brain:process-inbox
npm run brain:process-db-inbox
npm run brain:sync-inbox
npm run brain:list-requests
npm run brain:list-candidates
npm run brain:queue-request:dry-run
npm run brain:queue-request
npm run brain:collect
npm run brain:agent:status
npm run brain:agent:dry-run
npm run brain:agent
npm run brain:promote:dry-run
npm run brain:promote
npm run brain:promote:apply
npm run brain:import
```

`migrate:data` writes both `brain/data/approved/graph.json` and
`site/public/data/graph.json`.

`brain:install-python` installs the Python packages used by the source
collectors and Supabase brain scripts.

`brain:collect` needs `MUSICBRAINZ_CONTACT` so MusicBrainz can identify the
client. It writes review candidates to `brain/data/candidates/`.

`brain:process-inbox` reads `brain/data/inbox/research-requests.json`, processes
queued requests and writes candidate run files to `brain/data/candidates/`.

`brain:process-db-inbox` reads queued requests from Supabase and writes run logs
and candidate proposals back to Supabase.

`brain:sync-inbox` uploads the local inbox file into Supabase.

`brain:list-candidates` shows review candidates written by Supabase brain runs.

`brain:queue-request:dry-run` reads `brain/data/inbox/quick-request.txt` and
previews the request that would be queued. `brain:queue-request` writes the same
human-written request to Supabase. Copy
`brain/data/inbox/quick-request.example.txt` first; the working
`quick-request.txt` file is ignored by git.

`brain:agent:status` lets the scout inspect the current brain queue and graph
without creating or processing anything.

`brain:agent:dry-run` shows what the scout would do. If the queue is empty, it
prints the frontier request it would create from the current approved graph.

`brain:agent` is the practical research agent. It reads queued work, creates one
frontier request when the queue is empty, then processes up to two queued
requests through the normal candidate pipeline. With Supabase configured, it
uses the private database queue and writes candidates back to Supabase.

`brain:promote:dry-run` previews approved candidate packages as concrete graph
nodes and edges. `brain:promote` writes a review patch file. `brain:promote:apply`
writes approved promotions to `brain/data/approved/promotions.json` and marks
the Supabase candidate rows as `imported`.

`brain:import` needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Never expose the
secret key to the browser.

The npm scripts look for `python3`, `python` or `py -3`. You can also set
`PYTHON` to an exact Python executable path.

## Inbox Flow

1. Add requests to `brain/data/inbox/research-requests.json`.
2. Run `npm run brain:process-inbox`, or let GitHub Actions run it weekly.
3. Review generated files in `brain/data/candidates/`.
4. Promote approved facts with `npm run brain:promote:dry-run`, then
   `npm run brain:promote:apply`.
5. Run `npm run migrate:data`, `npm run brain:audit` and `npm run build`.

## Supabase Brain Flow

1. Apply `brain/supabase/migrations/0001_graph_schema.sql`.
2. Apply `brain/supabase/migrations/0002_research_brain_schema.sql`.
3. Add local `.env` and `.env.local` values from the examples.
4. Run `npm run brain:import` to load the approved graph.
5. Add work with `npm run brain:add-request -- --id my-request --title "My request" --instructions "..." --seed "Name:guitarist"`.
6. Run `npm run brain:agent`.
7. Approve good rows in Supabase `research_candidates`.
8. Run `npm run brain:promote:apply`, `npm run migrate:data`, then
   `npm run brain:import`.

Full setup notes live in `brain/supabase/README.md`.

## Scout Agent

The scout agent is not the public site. It is the private worker that reads the
current map, processes research requests and writes review candidates.

You communicate with it by adding rows to Supabase `research_requests`, by using
`npm run brain:add-request`, or by adding local inbox items. The agent writes its
findings to Supabase `research_candidates` and local run output. It never edits
the approved graph or publishes to the site by itself.

GitHub Actions can run the scout from `.github/workflows/research-agent.yml`.
That workflow can be started manually. For recurring runs, use the Supabase
Scheduler in `brain/supabase/scheduler/`; it triggers the same workflow through
GitHub's manual dispatch API instead of relying on GitHub's scheduled trigger.

## Environment

Public browser variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Trusted local or GitHub Action variables:

- `MUSICBRAINZ_CONTACT`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY` for a future editorial AI pass

## Future Brain Modes

Hold advanced map organization until the graph is closer to 300 nodes. When the
graph is large enough, explore alternate layout modes:

- Genre view: cluster and route the map by musical style.
- Timeline view: place older history toward the left and newer history toward
  the right.
- Ultimate Chaos view: preserve the dense discovery-board feeling while keeping
  enough local structure that users can still navigate.
