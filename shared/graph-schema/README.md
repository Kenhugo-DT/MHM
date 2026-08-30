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
