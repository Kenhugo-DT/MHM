# Fact research sources

Checked 2026-09-26. The goal is to discover specific, source-backed stories for
existing map nodes. A source pointer is a research lead, not a verified fact.
More published facts do not train a model by themselves; explicit review outcomes
and topic labels are the feedback the scout can use.

## Allowed research starting points

| Source | Access | Best use | Current state |
| --- | --- | --- | --- |
| [Wikipedia API](https://www.mediawiki.org/wiki/API:Main_page) | Public API; identify the client and respect throttling | Lead discovery, never the only approval source | Existing pattern scout |
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing) | Public API; structured data is CC0 | Entity identity, dates, relationships and claim references | Bounded, opt-in name-origin and birth-name pilot; not scheduled |
| [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) | Non-commercial API use is free without a key; at most one request per second with a meaningful User-Agent | Credits, membership, recordings and cross-source IDs | Existing graph collector; eligible nodes now counted in the coverage report |
| [Library of Congress](https://www.loc.gov/apis/json-and-yaml/working-within-limits/) | Public JSON API without a key; limit 20 requests per minute | Historical recordings and archival evidence | Candidate for a bounded pilot, not yet connected |
| [Smithsonian Open Access](https://www.si.edu/openaccess/faq) | CC0 collections; API needs an api.data.gov key | Instrument and music-history collection objects | Defer until the owner wants another key |
| [Europeana](https://pro.europeana.eu/page/get-api) | Free API key with an account | European music and instrument archives | Defer until the owner wants another key |

MusicBrainz distinguishes [CC0 core data from supplementary data with a
non-commercial share-alike license](https://musicbrainz.org/doc/About/Data_License).
Check the field's license before reuse. Wikipedia and catalogue metadata may
contain errors; prefer a primary institutional or artist source for final review.

## Guinness World Records

No public, documented record-data API was found. Its [site terms](https://www.guinnessworldrecords.com/using-this-website/terms-and-conditions)
restrict republishing and other reuse of site content. Do not scrape the site,
reverse-engineer an internal endpoint or schedule bulk collection. A record
page may be consulted manually for an individual lead, subject to its terms;
publish only original wording backed by appropriate rights and an independent
source. Store the achievement date and verification date. Never silently turn a
historical record into a claim that it still stands today.

## Publication boundary

1. Match the source to an existing node by a stable Wikidata QID or MusicBrainz
   MBID when available; a matching name alone is not enough.
2. Save the exact claim, source URL, source-specific evidence and category as a
   private review candidate. Ignore pages that do not directly support it.
3. Reject duplicates, wrong subjects, weak evidence and conflicts. Require a
   second independent source for records and superlatives.
4. A person rewrites and approves the fact. Only approved facts are public;
   rejected facts and `review_reason` remain private.
5. Feed category-level approval and rejection counts back to scout ranking.
   Measure yield on a small sample before enabling any new source on schedule.

No paid model calls, new credentials or automatic approval are part of this
source policy. New integrations must have explicit per-run lookup limits,
timeouts, rate-limit handling and a dry-run before scheduled use.
The Wikidata pilot checks the English Wikipedia sitelink against the map node's
existing Wikipedia URL. A QID alone is not sufficient: the map contains at
least one QID for a band's discography rather than the band. Claims without a
direct external HTTPS reference stay report-only. A reference URL is still a
lead, not proof that the linked page supports the claim; a human verifies it.
