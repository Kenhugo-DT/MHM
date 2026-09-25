# Curated facts

`curated.json` contains short, source-specific facts for the node detail panel.
It is separate from graph nodes and edges: a fact never creates a connection or
changes a layout by itself.

Only add a fact after checking that the linked page directly supports the exact
wording. Keep the text short, include its verification date and topic tags, and
use two independent sources for records or other superlative claims. This pilot
is manually curated. Agent suggestions now have a separate Supabase review queue
(`entity_facts`, migration `0003_entity_fact_review.sql`). Unverified suggestions
must stay outside this file and are never shown on the site.
There is no requirement to fill every node: no fact is better than a weak one.

`npm run facts:validate` checks identifiers, source links, dates and the two-fact
limit before the site can be built. The source links appear beside the fact in
the detail panel. Tags are research context only, not automatic graph links.

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
