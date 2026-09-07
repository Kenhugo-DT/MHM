# Research Inbox

Write project-owner research requests as either plain text or JSON.

The inbox is for things that should be investigated, not for approved graph data.
A request becomes candidate output only after the agent or inbox processor has
run.

## Quick Requests

Use `quick-request.txt` for owner-written one-off requests. It is ignored by git
so drafts do not clutter the repository.

Start from:

```text
brain/data/inbox/quick-request.example.txt
```

Then run:

```bash
npm run brain:queue-request:dry-run
npm run brain:queue-request
```

The script converts the plain text request into the structured Supabase
`research_requests` format.

## JSON Requests

Use `research-requests.example.json` as the structured template.

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
