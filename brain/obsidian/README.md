# MHM Obsidian Brain

Open this `brain/obsidian/` folder as an Obsidian vault.

This vault is the readable map brain for Music History Map. It is meant for
curation, layout thinking and long-term organization. The public site does not
read these Markdown files directly; scripts turn approved graph data into notes
and turn selected note metadata back into graph layout hints.

## Workflow

From the repository root:

```bash
npm run brain:obsidian:export
```

Exports the current approved graph into Obsidian notes.

```bash
npm run brain:obsidian:import
npm run brain:learn
npm run migrate:data
npm run brain:audit
```

Imports editable Obsidian metadata back into
`brain/data/approved/obsidian-overrides.json`, regenerates the map JSON and
checks the graph.

`brain:learn` turns the approved graph and Obsidian frontmatter into
`brain/data/approved/learning-model.json`. This is the first persistent learning
layer for the map.

## Editable Fields

These frontmatter fields are safe to edit:

- `zone`
- `eraStart`
- `eraPeak`
- `primaryGenres`
- `secondaryZones`
- `layoutPinned`
- `layoutX`
- `layoutY`
- `aliases`

Use `layoutPinned: true` only when a node should keep its exact position.

The learning model also reacts to repeated curator choices in `zone`,
`eraStart`, `eraPeak`, `primaryGenres` and `secondaryZones`.

## Do Not Edit Blindly

Avoid changing these fields unless the actual entity is wrong:

- `id`
- `type`
- `roles`

The graph still allows only these node types:

- `band`
- `guitarist`
- `artist`
- `guitar`
- `guitar_brand`
- `genre`

Albums, songs and releases can be mentioned as relationship context, but they
must not become notes/nodes.

## Views To Build Toward

- Genre view: cluster by musical style.
- Timeline view: older history left, newer history right.
- Focus constellation view: selected node becomes the temporary center.
- Ultimate Chaos view: dense and exploratory, but still readable.
