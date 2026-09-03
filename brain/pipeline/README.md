# Data Pipeline

This directory contains the private editorial side of the graph.

`sync.py` collects candidates from MusicBrainz, Wikidata and Wikipedia. It respects
MusicBrainz rate limiting and writes review data locally. It never publishes data.

`scout_agent.py` is the orchestration layer. It reads the current approved graph,
checks the request queue, can create one frontier request when the queue is empty,
and then runs the normal inbox processor. It never promotes candidates into the
approved graph.

`import_graph.py` imports an approved graph into Supabase with a service-role key.
Use a current `sb_secret_...` key. It must only be used in a trusted local
environment or GitHub Actions.

## Local collection

```bash
python -m venv .venv
.venv/Scripts/pip install -r brain/pipeline/requirements.txt
set MUSICBRAINZ_CONTACT=you@example.com
.venv/Scripts/python brain/pipeline/sync.py
```

From the repository root, the shortcut command is:

```bash
npm run brain:install-python
```

Review the candidate output in `brain/data/candidates/` before turning it into
entities and relations. AI may help classify, summarize and flag duplicates, but
every published fact must retain at least one source reference.

The pipeline reads `shared/graph-schema/blocked-entities.json` before collecting
or suggesting related items.

## Inbox processing

`process_inbox.py` is the project-owner request bridge.

```bash
npm run brain:process-inbox -- --dry-run
npm run brain:process-inbox
npm run brain:process-db-inbox
npm run brain:agent:status
npm run brain:agent:dry-run
npm run brain:agent
```

Dry-run validates queued requests and prints the seed plan without network
collection. A normal run writes candidate output to `brain/data/candidates/` and
a compact run summary to `brain/data/runs/`.

Use `--mark-processed` only when you want the local inbox file updated from
`queued` to `processed`.

Use `brain:process-db-inbox` when Supabase should be the source of queued work
and the destination for run logs and review candidates.

Use `brain:agent` when you want the scout to behave like the private worker: read
the map, find or create queued work, collect source candidates and write the
result back for review.

## Environment variables

The browser build receives only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Trusted pipeline jobs may receive:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `MUSICBRAINZ_CONTACT`
- `OPENAI_API_KEY` when the editorial AI stage is enabled

Never prefix a secret with `VITE_`. Vite embeds every `VITE_` variable in the
public browser bundle.
