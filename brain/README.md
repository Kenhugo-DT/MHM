# Brain

This directory is the private research and curation side of the Guitar History
Map. It can collect candidates, audit the graph and later import approved data
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
- `supabase/` contains optional database migrations.

## Commands

Run these from the repository root:

```bash
npm run migrate:data
npm run brain:audit
npm run brain:process-inbox
npm run brain:collect
npm run brain:import
```

`migrate:data` writes both `brain/data/approved/graph.json` and
`site/public/data/graph.json`.

`brain:collect` needs `MUSICBRAINZ_CONTACT` so MusicBrainz can identify the
client. It writes review candidates to `brain/data/candidates/`.

`brain:process-inbox` reads `brain/data/inbox/research-requests.json`, processes
queued requests and writes candidate run files to `brain/data/candidates/`.

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

## Environment

Public browser variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Trusted local or GitHub Action variables:

- `MUSICBRAINZ_CONTACT`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY` for a future editorial AI pass
