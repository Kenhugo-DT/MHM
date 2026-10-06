# Start-year review, 2026-10-02

## Scope and result

All 460 nodes with no usable start year in the graph or learning model were
screened against Wikidata. The 192 bands with a unique MusicBrainz ID were
cross-checked there; 89 performers with such an ID had their catalogues
checked for possible early releases. The remaining uncertain dates still
need individual research.
The audit records are in `2026-10-02-start-years.json`. The MusicBrainz
cross-checks are in `2026-10-02-musicbrainz-years.json`, and exploratory
release checks are in `2026-10-02-person-releases.json`.

152 dates were added to `../curated-start-years.json`: 133 band/group formation
years where Wikidata inception and MusicBrainz group begin agree exactly, plus
19 manually checked brand, model, and performer dates in
`../manual-start-years.json`. Each curated entry states its date basis and
source URL. The timeline reads these as `eraStart`; existing node coordinates
are preserved when the graph is regenerated.

308 nodes remain undated: 100 bands, 62 guitarists, 44 artists, 56 genres,
43 guitars, and 3 guitar brands. They stay in the timeline's unknown-date area
instead of being placed in a decade from an unsupported guess.

## Date rules

- Band: formation/inception. Disagreement between Wikidata and MusicBrainz
  requires independent review; for example, The Smiths were not auto-dated.
- Person: first documented activity or release, not birth. A first catalogued
  MusicBrainz release is not necessarily the first release, so this check is
  only a lead unless independently supported.
- Guitar brand: founding or brand origin, explicitly identified. Brand origin
  may precede guitar production, as with Yamaha.
- Guitar model: year of introduction, not the manufacturer's founding year.
- Genre: a documented emergence or milestone, with the date basis explained.
  A genre rarely has a single unambiguous founding year, so no automatic
  Wikidata inception dates were accepted for genres.

## Remaining review

The audit JSON marks missing claims, mismatches, and conflicting claims per
node. MusicBrainz cross-checks distinguish exact matches from discrepancies.
Neither a Wikipedia page nor a date-shaped claim alone is enough to publish a
year. Research the remaining nodes in smaller, type-specific batches and add
only supported records to `../manual-start-years.json`; then run
`node brain/scripts/curate-start-years.mjs`,
`node brain/scripts/migrate-graph-data.mjs --preserve-existing-layout`, and
`npm run brain:layouts`.
