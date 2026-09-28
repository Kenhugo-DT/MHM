# Curated facts

`curated.json` contains short, source-specific facts for the node detail panel.
It is separate from graph nodes and edges: a fact never creates a connection or
changes a layout by itself.

Only add a fact after checking that the linked page directly supports the exact
wording. Keep the text short, include its verification date and topic tags, and
use two independent sources for records or other superlative claims. This pilot
is manually curated. Agent suggestions have a separate Supabase review queue
(`entity_facts`, migration `0003_entity_fact_review.sql`). Unverified suggestions
must stay outside this file and are never shown on the site.
The coverage goal is every node type and, eventually, every node. No fact is
better than a weak or unsupported one.

The manually researched batch in `brain/data/fact-batches/2026-09-26-sixty.json`
contains 60 source-linked facts originally submitted for review. `npm run brain:fact-batch:dry-run`
compares them with local and live nodes plus existing facts. After the database
has applied `brain/supabase/migrations/0005_facts_all_node_types.sql`,
`npm run brain:fact-batch` inserts any still-missing rows into private review.
The command is idempotent and never approves or publishes a fact. If an insert
fails midway, rerun the dry-run and then the import after resolving the cause.

`npm run facts:validate` checks identifiers, source links, dates and the two-fact
limit before the site can be built. The source links appear beside the fact in
the detail panel. Tags are research context only, not automatic graph links.
`npm run facts:coverage` reads the live Supabase map and approved facts plus
curated facts, then reports gaps by type and zone for the next research batch.
It also counts existing Wikipedia, Wikidata and MusicBrainz pointers on
uncovered nodes. Those pointers are research starting points, not evidence that
any particular fact is true. See `brain/pipeline/FACT_SOURCE_POLICY.md` before
adding a new automatic source.

After reviewing facts in Supabase, run `npm run brain:facts:sync-approved`, then
`npm run brain:learn` and `npm run brain:organize`. The first command reads only
approved, sourced rows into `brain/data/approved/fact-evidence.json`; it does
not change Supabase. The learning model records the snapshot time, per-node
coverage across Supabase and the repository's curated pilot, and whether each
batch fact interpretation matched an approved Supabase row.
This snapshot can become stale after later review decisions, so refresh it
before relying on its approval counts. Fact categories and snippets are never
promoted into graph edges automatically.
The scheduled GitHub research agent refreshes this read-only evidence snapshot
at the start of each run, so newly approved facts can guide that run without
committing a new snapshot after every review decision.

Keep the GitHub Actions repository variable `FACT_SCOUT_ENABLED` at `false`
until the source-pattern scout has been previewed. If enabled, the existing
scheduled research agent scouts up to three fact leads after normal graph
research, checking at most 12 Wikipedia articles. Locally,
`npm run brain:fact-scout:dry-run` previews leads; `npm run brain:fact-scout`
writes them to review. Both use the existing Supabase server credentials. This
scout makes no paid model calls. It checks specific patterns for names,
instruments, performances, recordings and other stories, and spreads lookups
across map zones. Some runs may yield nothing. The lead text is a source excerpt
for private review, not publication-ready wording.
For a small controlled run, add repeated `--entity` IDs and a low `--limit` to
the dry-run or publish command; the normal scheduled run still scans eligible
entities across zones.

The separate Wikidata pilot is opt-in and is not part of the scheduled run.
`npm run brain:fact-scout:wikidata:dry-run` checks at most 12 existing nodes
(hard cap 20; use `--offset 20` for another batch). It requires the Wikidata
item's English Wikipedia sitelink to match the node's Wikipedia source, so a
discography or similarly named subject
cannot be mistaken for the node. It reports uncited structured claims as
`researchLeads`; these are not written anywhere. Only claims with a direct
external HTTPS reference qualify as `reviewProposals`. After inspecting the
preview, `npm run brain:fact-scout:wikidata` writes up to three such proposals
to private review, never to the public site. The reviewer still must open the
linked reference and verify the exact claim before approval. Both commands
accept `-- --entity NODE_ID --max-lookup 1 --limit 1` for a targeted run.
Routine middle-name additions are excluded from birth-name leads.

Apply `brain/supabase/migrations/0005_facts_all_node_types.sql` to allow review
facts for genres, guitars and guitar brands as well as people and bands. The
current automatic scout still targets people and bands; other types need a
manually checked source until dedicated extraction rules are in place.

Review in Supabase Table Editor, table `entity_facts`: inspect `text`, `evidence`
and `sources`; verify the claim; rewrite any copied source wording; add a direct
independent HTTPS source; then set `status` to `approved` or `rejected`. A single
Wikipedia link cannot pass the approval trigger. Editing approved public
content returns that row to review. Only approved rows can be queried by the
public site, and it shows at most two facts per selected entity including the
curated pilot.

After applying `0004_fact_review_feedback.sql`, reviewers may fill the optional
`review_reason` column with a short explanation such as "wrong subject" or
"unsupported by source". It stays private. The scout uses approval/rejection
counts from its `scout-*` category tags to adjust future ranking once a category
has three decisions; it does not interpret the free-text note or retrain a
model. Rejected leads are not proposed again from the same source excerpt.
