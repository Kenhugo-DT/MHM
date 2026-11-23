# MHM runbook

Run commands from the repository root. Research proposals never publish directly;
review and approval come before regeneration or database import.

## Which files to edit

| Role | Examples | Rule |
| --- | --- | --- |
| Curated inputs | `brain/data/legacy-graph.json`, `brain/data/legacy-structured-positions.json`, `brain/data/curated-*.json`, `brain/data/approved/promotions.json`, `brain/data/approved/curator-feedback.json` | Edit only with a source or a documented human decision. |
| Human notes | `brain/obsidian/`, `brain/data/approved/layout-feedback.json` | Keep them; these teach the learning and layout pipeline. |
| Imported review snapshots | `brain/data/approved/obsidian-overrides.json`, `brain/data/approved/fact-evidence.json` | Update through their import/sync commands, not by editing generated fields. |
| Generated approved snapshots | `brain/data/approved/graph.json`, `learning-model.json`, `organization-model.json`, `layouts.json`, `layout-experience.json` | Regenerate after input changes; commit the related files together. |
| Browser copies | `site/public/data/graph.json`, `site/public/data/layouts.json` | Generated alongside approved snapshots; never edit separately. |
| Local output | `brain/data/runs/`, `brain/data/candidates/`, `dist/`, `test-results/` | Ignored by Git; do not use as published truth. |

The graph contains 94 legacy seed nodes from JSON plus curated expansions and
reviewed promotions. The approved graph is a reviewed **snapshot**, not the
only upstream source. The source and model checks catch stale or divergent
snapshots. Timestamps in generated files can change on a no-op rebuild, so
regenerate when inputs change and inspect the diff before committing.

## Change reviewed data

1. Edit the relevant curated input or apply a reviewed promotion. Keep source
   URLs and relation-specific explanations with new connections.
2. Run `npm run migrate:data`.
3. Run `npm run brain:verify-snapshots`, `npm run brain:verify-models`,
   `npm run brain:verify-edge-evidence` and `npm run brain:audit`.
4. Run `npm test`, `npm run check`, `npm run test:e2e` and `npm run build`.
5. Inspect the diff. Commit all related approved and browser snapshots together.

`brain:verify-edge-evidence` permits only the exact known legacy list in
`brain/data/approved/unsourced-legacy-edges.json`. Remove an ID from that list
when its relationship is sourced. Never add a new unsourced relationship to it.

## Research and feedback

- `npm run brain:agent:dry-run` previews a scout pass. `npm run brain:agent`
  processes the queue; candidates still require human review.
- `npm run brain:promote:dry-run` previews approved candidates.
  `npm run brain:promote:apply` writes reviewed promotions; then rebuild.
- `npm run brain:obsidian:import` imports safe note fields before a rebuild.
- `/playground.html` is a local experiment. Import an exported, reviewed report
  with `npm run brain:layout-feedback:import -- <report.json>`, then rebuild.

## Publish

Push to `main` only after local checks. GitHub Actions validates the push first;
Pages builds the exact validated commit. Deployment does not regenerate data.
If validation fails, Pages does not publish that commit.
