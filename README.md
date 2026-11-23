# MHM: Music History Map

An English-language interactive music history map with a guitar-forward focus.
Names keep their original Unicode characters, including `æ`, `ø` and `å`.

## Graph scope

The main map currently uses these node types:

- bands
- guitarists
- artists
- guitars and guitar models
- guitar brands
- music genres

Albums, songs and releases currently remain context on relationships. The
separate globe view can evolve independently of the main map.

## Architecture

- `site/` contains the Vite, React and TypeScript interface
- PixiJS for the map renderer
- Three.js for the separate geographic globe view
- `brain/` contains the private research, audit and import tools
- `shared/` contains graph schema and project-wide exclusions
- local curated JSON as the development and offline fallback
- Wikipedia details fetched on demand when a node is selected
- browser-side caching for fetched Wikipedia detail snapshots
- Supabase PostgreSQL for live entities, relations and source metadata
- Supabase Storage for approved, licensed images
- Python for MusicBrainz, Wikidata and Wikipedia collection
- GitHub Actions for review candidates and GitHub Pages deployment
- Supabase brain tables for private research requests, run logs and candidate review
- Obsidian vault for readable graph curation, era metadata and layout hints

The browser never calls MusicBrainz directly. It reads a prepared graph from
Supabase or the local fallback. The graph itself stays lightweight: nodes store
labels, types, positions, relationships and source links, while longer detail
copy can remain with Wikipedia until it is requested.

The checked-in graph currently has over 1,200 nodes and 1,500 connections.
`brain/data/approved/` is the reviewed snapshot; `site/public/data/` contains
the byte-identical browser copies. Measure load and interaction performance
before assuming this approach will scale unchanged to much larger graphs.

## Development

For the common research, review, rebuild and publish steps, see
[`docs/RUNBOOK.md`](docs/RUNBOOK.md).

```bash
npm install
npm run migrate:data
npm run brain:verify-snapshots
npm run brain:verify-models
npm run brain:verify-edge-evidence
npm run brain:audit
npm run dev
```

The application automatically uses local data unless `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are provided.

`npm run migrate:data` writes the approved graph to
`brain/data/approved/graph.json` and the browser copy to
`site/public/data/graph.json`, and regenerates the learning and layout models.
Commit the reviewed snapshots together. `brain:verify-snapshots` catches missing
or divergent browser copies. `brain:verify-edge-evidence` rejects any new map
connection without sources; the exact set of older unsourced connections is
tracked in `brain/data/approved/unsourced-legacy-edges.json`. These older links
are labelled unverified in the interface until individually sourced.

The searchable, keyboard-accessible node directory is at `/directory.html`.
`/globe.html` is the independent geographic view and `/playground.html` is for
layout experiments. Fun facts are reviewed separately from map connections.

`brain/obsidian/` can be opened directly as an Obsidian vault. Generate or
refresh the notes with:

```bash
npm run brain:obsidian:export
```

After editing safe frontmatter fields such as `zone`, `eraStart`, `eraPeak`,
`secondaryZones` or pinned layout coordinates, import those hints back into the
graph build:

```bash
npm run brain:obsidian:import
npm run brain:learn
npm run migrate:data
```

`brain:learn` creates `brain/data/approved/learning-model.json` from the graph
and Obsidian frontmatter. The layout engine reads that model during
`migrate:data`, so repeated human curation becomes durable map behavior.

`.github/agents/music-history-map-research.agent.md` is the GitHub/Copilot
agent profile. `brain/AGENT.md` is the full instruction file it reads before
research runs, keeping the agent focused on graph candidates instead of direct
publishing.

## Research Inbox

Use `brain/data/inbox/research-requests.json` to talk to the research brain.
Each queued request contains instructions and one or more seed entities.

```bash
npm run brain:process-inbox
```

That command reads queued inbox requests, collects source data and writes review
files to `brain/data/candidates/`. The public site is not changed by this step.

When Supabase is configured, use the hosted brain queue instead:

```bash
npm run brain:sync-inbox
npm run brain:process-db-inbox
```

Setup details live in `brain/supabase/README.md`.

The GitHub Action `process-inbox.yml` can run the same job manually or every
Sunday at 03:17 UTC once the project is pushed to GitHub.

## GitHub Actions

`validate.yml` runs the safety checks on every push and pull request, including
all Python tests, graph/snapshot checks, unit tests and browser smoke tests:

```bash
npm run brain:example-inbox
npm run brain:python-check
npm run brain:verify-snapshots
npm run brain:verify-edge-evidence
npm run brain:audit
npm test
npm run check
npm run build
npm run test:e2e
```

`deploy-pages.yml` starts only after a successful validation of a push to
`main`. It builds the exact validated commit and does not regenerate graph data
during deployment. In GitHub, enable
Pages with `Settings -> Pages -> Build and deployment -> Source -> GitHub Actions`.

## Database

Apply `brain/supabase/migrations/0001_graph_schema.sql`, then
`brain/supabase/migrations/0002_research_brain_schema.sql`. Import the approved
local graph with `brain/pipeline/import_graph.py`. Keep the Supabase secret key
out of the browser and out of version control.

For new Supabase projects, use a publishable `sb_publishable_...` key in the
browser and a separate `sb_secret_...` key for trusted imports. Never place a
secret key or an AI provider key in a variable whose name begins with `VITE_`.
