# Shared Graph Rules

This directory is the contract between the public site and the private research
brain.

The map may only use these node types:

- `band`
- `guitarist`
- `artist`
- `guitar`
- `guitar_brand`
- `genre`

Albums, songs, releases, tours, awards and events may be mentioned as edge
context, but they must not become nodes.

`blocked-entities.json` contains project-owner exclusions that both the browser
and the research pipeline must honor before showing, importing or suggesting
entities.

`research-request.schema.json` defines the inbox format used by
`brain/data/inbox/research-requests.json`.

## Relation evidence

`edge-evidence.mjs` separates three cases without deleting approved graph data:

- `research_lead`: a Wikipedia page link or category signal. It is a clue to investigate, not evidence that the two music entities have the proposed relationship. These edges stay in the approved snapshot but do not drive the public connection list, the brain's connection counts, or layout placement.
- `curated_unsourced`: an existing semantic connection without a relation-specific source. It stays on the map so legacy curation is not silently discarded, but the audit reports its evidence gap.
- `source_linked`: a semantic connection carrying at least one source URL. This means a source is attached, not that the source has independently been checked to prove the exact claim.

Run `npm run brain:audit` for counts and a shortlist of cross-zone connections that need source review. A research lead should only become a map connection after someone checks a source that explicitly supports the relation and records that relation with a meaningful label and context.
