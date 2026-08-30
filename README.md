# Guitars: Interactive History Map

An English-language interactive map of guitar history. Names keep their original
Unicode characters, including `æ`, `ø` and `å`.

## Graph scope

Only these entities become map nodes:

- bands
- guitarists
- artists
- guitars and guitar models
- guitar brands
- music genres

Albums, songs and releases are stored as context on a relationship. They never
become map nodes.

## Architecture

- `site/` contains the Vite, React and TypeScript interface
- PixiJS for the map renderer
- `brain/` contains the private research, audit and import tools
- `shared/` contains graph schema and project-wide exclusions
- local curated JSON as the development and offline fallback
- Wikipedia details fetched on demand when a node is selected
- browser-side caching for fetched Wikipedia detail snapshots
- Supabase PostgreSQL for live entities, relations and source metadata
- Supabase Storage for approved, licensed images
- Python for MusicBrainz, Wikidata and Wikipedia collection
- GitHub Actions for review candidates and GitHub Pages deployment

The browser never calls MusicBrainz directly. It reads a prepared graph from
Supabase or the local fallback. The graph itself stays lightweight: nodes store
labels, types, positions, relationships and source links, while longer detail
copy can remain with Wikipedia until it is requested.

For the first public version, a curated graph of a few hundred nodes can stay as
static JSON. Around 200 artists/bands, 150 genres and 100 guitars is small for a
modern browser as long as summaries stay short and albums/songs are not stored as
nodes. A shared cache server becomes useful later for heavy discovery jobs, not
because this graph size is too large.

## Development

```bash
npm install
npm run migrate:data
npm run brain:audit
npm run dev
```

The application automatically uses local data unless `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are provided.

`npm run migrate:data` writes the approved graph to
`brain/data/approved/graph.json` and the browser copy to
`site/public/data/graph.json`.

`brain/AGENT.md` is the instruction file for the research agent. It keeps the
agent focused on graph candidates instead of direct publishing.

## Research Inbox

Use `brain/data/inbox/research-requests.json` to talk to the research brain.
Each queued request contains instructions and one or more seed entities.

```bash
npm run brain:process-inbox
```

That command reads queued inbox requests, collects source data and writes review
files to `brain/data/candidates/`. The public site is not changed by this step.

The GitHub Action `process-inbox.yml` can run the same job manually or every
Sunday at 03:17 UTC once the project is pushed to GitHub.

## Database

Apply `brain/supabase/migrations/0001_graph_schema.sql`, then import the approved
local graph with `brain/pipeline/import_graph.py`. Keep the Supabase service-role
key out of the browser and out of version control.

For new Supabase projects, use a publishable `sb_publishable_...` key in the
browser and a separate `sb_secret_...` key for trusted imports. Never place a
secret key or an AI provider key in a variable whose name begins with `VITE_`.
