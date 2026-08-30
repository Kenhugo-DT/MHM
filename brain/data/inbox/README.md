# Research Inbox

Write project-owner research requests in `research-requests.json`.

The inbox is for things that should be investigated, not for approved graph
data. A request becomes candidate output only after `npm run brain:process-inbox`
has run.

Use `research-requests.example.json` as a template.

The example file also keeps the common terminal checks in `terminalCommands`, so
you do not have to hunt for them later.

Valid request statuses:

- `queued`
- `paused`
- `processing`
- `processed`
- `failed`
- `rejected`

Only `queued` requests are processed.

When Supabase is configured, the same request shape can live in the private
`research_requests` table. Use these commands from the repository root:

```bash
npm run brain:sync-inbox
npm run brain:list-requests
npm run brain:process-db-inbox
```

Allowed seed kinds:

- `band`
- `guitarist`
- `artist`
- `guitar`
- `guitar_brand`
- `genre`

Example request:

```json
{
  "id": "expand-fender-stratocaster",
  "title": "Expand Fender Stratocaster connections",
  "status": "queued",
  "priority": 70,
  "scope": "guitar_history",
  "createdAt": "2026-08-30T00:00:00.000Z",
  "instructions": "Find guitarists, bands, genres and guitar models connected to the Stratocaster.",
  "seeds": [
    { "name": "Fender Stratocaster", "kind": "guitar" },
    { "name": "Fender", "kind": "guitar_brand" }
  ]
}
```
