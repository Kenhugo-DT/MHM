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

After applying the migration in Supabase SQL Editor, set the GitHub Actions
repository variable `FACT_SCOUT_ENABLED` to `true`. The scheduled agent then
scouts up to three fact leads per run after its normal graph research. Locally,
`npm run brain:fact-scout:dry-run` previews leads; `npm run brain:fact-scout`
writes them to review. Both use the existing Supabase server credentials.
For useful extraction, also set the GitHub Actions secret `OPENAI_API_KEY`;
the default `gpt-6-luna` model reads source excerpts and proposes a paraphrase
plus an exact evidence excerpt. Without that secret, a strict, low-yield text
filter is used. This is an API call with usage cost, capped by the per-run
lookup limit. No model-generated text is auto-approved.

Review in Supabase Table Editor, table `entity_facts`: inspect `text`, `evidence`
and `sources`; verify the claim; rewrite any copied source wording; add a direct
independent HTTPS source; then set `status` to `approved` or `rejected`. A single
Wikipedia link cannot pass the approval trigger. Editing approved public
content returns that row to review. Only approved rows can be queried by the
public site, and it shows at most two facts per selected entity including the
curated pilot.
