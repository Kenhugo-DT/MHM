# Curated facts

`curated.json` contains short, source-specific facts for the node detail panel.
It is separate from graph nodes and edges: a fact never creates a connection or
changes a layout by itself.

Only add a fact after checking that the linked page directly supports the exact
wording. Keep the text short, include its verification date and topic tags, and
use two independent sources for records or other superlative claims. This pilot
is manually curated; automatic fact discovery and a dedicated agent review
queue are not connected yet. Unverified suggestions must stay outside this file.
There is no requirement to fill every node: no fact is better than a weak one.

`npm run facts:validate` checks identifiers, source links, dates and the two-fact
limit before the site can be built. The source links appear beside the fact in
the detail panel. Tags are research context only, not automatic graph links.
