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
npm run brain:collect
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

`brain:import` needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Never expose the
secret key to the browser.

The npm scripts look for `python3`, `python` or `py -3`. You can also set
`PYTHON` to an exact Python executable path.

## Inbox Flow

1. Add requests to `brain/data/inbox/research-requests.json`.
2. Run `npm run brain:process-inbox`, or let GitHub Actions run it weekly.
3. Review generated files in `brain/data/candidates/`.
4. Manually promote approved facts into the approved graph.
5. Run `npm run migrate:data`, `npm run brain:audit` and `npm run build`.

## Supabase Brain Flow

1. Apply `brain/supabase/migrations/0001_graph_schema.sql`.
2. Apply `brain/supabase/migrations/0002_research_brain_schema.sql`.
3. Add local `.env` and `.env.local` values from the examples.
4. Run `npm run brain:import` to load the approved graph.
5. Add work with `npm run brain:add-request -- --id my-request --title "My request" --instructions "..." --seed "Name:guitarist"`.
6. Run `npm run brain:process-db-inbox`.

Full setup notes live in `brain/supabase/README.md`.

## Environment

Public browser variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Trusted local or GitHub Action variables:

- `MUSICBRAINZ_CONTACT`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY` for a future editorial AI pass
