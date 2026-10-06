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
- `obsidian/` is an Obsidian vault generated from the graph for curation,
  era notes, zone hints and future layout-brain work.
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
npm run brain:review-candidates
npm run brain:queue-request:dry-run
npm run brain:queue-request
npm run brain:collect
npm run brain:agent:status
npm run brain:agent:dry-run
npm run brain:agent
npm run brain:promote:dry-run
npm run brain:promote
npm run brain:promote:apply
npm run brain:obsidian:export
npm run brain:obsidian:import
npm run brain:learn
npm run brain:organize
npm run brain:connection-scout:dry-run
npm run brain:connection-scout
npm run brain:connections:queue -- --input brain/data/candidates/connection-evidence-latest.json --publish
npm run brain:connections:stage
npm run brain:import:preflight
npm run brain:sync-curated-genres
npm run brain:import
```

`migrate:data` is the full local/public refresh loop. It learns from Obsidian
and curator feedback, migrates the approved graph, analyzes organization
pressure, then regenerates public layout JSON. It writes both
`brain/data/approved/graph.json` and `site/public/data/graph.json`.

`brain:install-python` installs the Python packages used by the source
collectors and Supabase brain scripts.

`brain:sync-curated-genres` checks the reviewed genre-bridge batch against live
Supabase data without changing it. Add `-- --apply` to insert only missing
nodes and sourced relations; conflicting existing rows are never overwritten.

`brain:collect` needs `MUSICBRAINZ_CONTACT` so MusicBrainz can identify the
client. It writes review candidates to `brain/data/candidates/`.

`brain:process-inbox` reads `brain/data/inbox/research-requests.json`, processes
queued requests and writes candidate run files to `brain/data/candidates/`.

`brain:process-db-inbox` reads queued requests from Supabase and writes run logs
and candidate proposals back to Supabase.

`brain:sync-inbox` uploads the local inbox file into Supabase.

`brain:list-candidates` shows review candidates written by Supabase brain runs.
`brain:review-candidates` lists a larger review batch and includes the sanity
level, score, summary and flags that help catch bad rows before approval.

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

`brain:obsidian:export` writes one Markdown note per graph node into
`brain/obsidian/`. Open that folder as an Obsidian vault when you want to inspect
or curate the brain visually. `brain:obsidian:import` reads safe frontmatter
fields back into `brain/data/approved/obsidian-overrides.json`; `migrate:data`
then applies those fields before regenerating the public graph JSON.

`brain:learn` reads the approved graph plus Obsidian frontmatter and writes
`brain/data/approved/learning-model.json`. It also reads
`brain/data/approved/curator-feedback.json`, where you can write direct human
feedback about node placement, zone overlap, weak suggestions and project taste.
The layout engine uses that model for learned zone terms, era sorting, bridge
signals and pinned human curation.

`brain:organize` reads the approved graph and learning model, then writes
`brain/data/approved/organization-model.json`. It also writes a local report and
frontier-request draft to `brain/data/runs/`. This is the organization brain
layer: it scores weak zones, under-connected hubs, bridge nodes, overlap risk
and source quality. It also writes layout-intelligence directives for pressure,
spacing, bridge pull and anti-overlap rules. The scout agent uses this model
first when it needs to create its own frontier request, and the layout generator
uses it to keep organized chaos readable.

`brain:connection-scout:dry-run` lists isolated MusicBrainz-matched artist and
band nodes it would check. `brain:connection-scout` queries at most 12 by
default (maximum 25) and writes only `member_of` proposals to an ignored
`brain/data/candidates/connection-evidence-*.json` review file. Use
`-- --node <id>` to target a specific isolated node. It does not approve,
import or publish relationships. MusicBrainz identities, relation type and
date ranges are retained for human review; unsupported relation types are
discarded.

## Reviewed Connection Automation

This is a bounded pilot for exact MusicBrainz band-membership relationships,
not a general license to turn research leads into map edges. The old generic
promoter explicitly ignores `typed_connection` candidates. It also does not
automatically publish other approved packages; those still need careful review.

1. Apply `brain/supabase/migrations/0006_entity_start_year.sql` in Supabase,
   then run `npm run brain:import:preflight`. Do not enable publication if it
   fails.
2. Set GitHub repository variable `BRAIN_IMPORT_ENABLED=true` only after the
   preflight succeeds. This allows the guarded publish workflow to import the
   graph after a human merges a reviewed connection PR.
3. Set `CONNECTION_SCOUT_ENABLED=true` to opt the existing scheduled scout
   workflow into at most 12 MusicBrainz lookups per run. It places fresh
   `typed_connection` rows in private `research_candidates` with status
   `review`; it never approves them.
4. Review the exact person, band, source and period in Supabase and set only
   sound candidates to `approved`. Run the `Propose reviewed connections`
   GitHub workflow. It rechecks membership against MusicBrainz, stages at most
   12 edges, rejects unrelated graph changes and opens a draft PR. GitHub CI
   runs against the proposed branch. No direct push to `main` occurs.
5. A person reviews the diff and merges it. The `Publish reviewed connections`
   workflow verifies that approval still exists, writes only the 1-12 new
   membership relations (not the whole graph), reads them back from Supabase
   and only then marks those candidates `imported`. It remains disabled while
   `BRAIN_IMPORT_ENABLED` is not true. The published batch gate allows sourced
   start-year backfill from the earlier timeline work but no other node edits.

`npm run brain:connections:stage -- --file <scout-output>` is an offline preview
of local proposal statuses. It cannot apply local files, because production
staging requires an explicit approval in the private Supabase review table.
This pilot uses existing MusicBrainz and GitHub/Supabase infrastructure; it
does not call a paid AI API. Keep the GitHub opt-in flags off until the first
database preflight has passed; keep `CONNECTION_SCOUT_ENABLED` off until the
first manually reviewed connection batch has completed end to end.

Start years and their reviewed basis now travel with approved graph nodes.
Apply `brain/supabase/migrations/0006_entity_start_year.sql` before the next
`brain:import`. The site can read the previous database schema while that
migration is pending, using the bundled graph's years for matching nodes.

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
7. Run `npm run brain:review-candidates`, then approve good rows in Supabase
   `research_candidates`.
8. Run `npm run brain:promote:apply`, `npm run migrate:data`, then
   `npm run brain:import`.

Full setup notes live in `brain/supabase/README.md`.

## Obsidian Brain Flow

1. Run `npm run brain:obsidian:export`.
2. Open `brain/obsidian/` as an Obsidian vault.
3. Edit safe frontmatter fields such as `zone`, `eraStart`, `eraPeak`,
   `primaryGenres`, `secondaryZones`, `layoutPinned`, `layoutX` and `layoutY`.
4. Run `npm run brain:obsidian:import`.
5. Run `npm run brain:learn`.
6. Run `npm run migrate:data`, `npm run brain:audit` and `npm run build`.

Use Obsidian for organization and curation, not for raw scraping. The research
agent still proposes facts, Supabase still handles the review queue, and the
site still reads generated JSON.

## Learning Layer

The current learning layer is deterministic and review-friendly. It learns from
the approved graph, human Obsidian edits and explicit curator feedback, then
stores the result in a small JSON model. It does not invent facts and it does
not publish by itself.

The model currently learns:

- stronger terms for each map zone
- node-level era hints
- genre links
- secondary/bridge zones
- hub and bridge scores
- pinned layout coordinates
- layout pressure and bridge-pull directives from organization analysis

This gives the map memory. If a curator repeatedly moves or classifies entities
in Obsidian, the generated layout starts treating those choices as project
knowledge.

Use `brain/data/approved/curator-feedback.json` for quick corrections after
looking at the live map. Good feedback examples:

- `Misfits should anchor horror punk / punk-alt, close to Ramones and Sex Pistols.`
- `Hard rock and metal should overlap more with rock-circuit around Black Sabbath, Led Zeppelin, Deep Purple and AC/DC.`
- `Hip-hop should have its own readable territory, but allow documented bridges into punk, rock and metal.`

The feedback file supports node-level hints (`zone`, `secondaryZones`,
`primaryGenres`, `curatorTags`, `bridgeBoost`, `hubBoost`) and zone-level terms.
Run `npm run brain:learn`, then `npm run migrate:data`, then
`npm run brain:organize` after editing it.

After learning, run `npm run brain:organize` to turn that memory into actionable
organization signals. `npm run migrate:data` now runs this full loop and lets the
public layout read those signals. The organization model still does not invent
facts, but it can influence spacing, zone pressure and bridge drift.

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

## Future Brain Modes

Hold advanced map organization until the graph is closer to 300 nodes. When the
graph is large enough, explore alternate layout modes:

- Genre view: cluster and route the map by musical style.
- Timeline view: place older history toward the left and newer history toward
  the right.
- Focus constellation view: when a user selects or searches for one entity,
  animate connected nodes into a temporary mind-map around that entity while the
  rest of the map fades back.
- Ultimate Chaos view: preserve the dense discovery-board feeling while keeping
  enough local structure that users can still navigate.
