"""Send typed MusicBrainz relationship leads to the existing private review queue."""

from __future__ import annotations

import argparse
import json
import re
from datetime import UTC, datetime
from pathlib import Path

from supabase_brain import finish_run, require_client, start_run, upsert_candidates

KIND = "typed_connection"
RELATION_TYPE_ID = "5be4c609-9afa-4ea0-910b-12ffb71e3821"
GRAPH_PATH = Path(__file__).resolve().parents[1] / "data" / "approved" / "graph.json"


def new_run_id() -> str:
    run_id = f"connection-evidence-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S-%f')}"
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", run_id):
        raise ValueError("Connection run ID does not match the database constraint.")
    return run_id


def pending_proposals(client) -> set[str]:
    seen: set[str] = set()
    offset = 0
    page_size = 200
    while offset < 5000:
        rows = (client.table("research_candidates")
                .select("id,payload")
                .order("id")
                .range(offset, offset + page_size - 1)
                .execute().data or [])
        for row in rows:
            payload = row.get("payload") or {}
            if payload.get("kind") == KIND:
                proposal_id = (payload.get("connection") or {}).get("id")
                if proposal_id:
                    seen.add(proposal_id)
        if len(rows) < page_size:
            return seen
        offset += page_size
    raise RuntimeError("Review queue exceeds 5000 rows; inspect it before publishing more leads.")


def candidate_payloads(scout_output: dict, existing: set[str], nodes: dict[str, dict]) -> list[dict]:
    if scout_output.get("version") != 1 or not isinstance(scout_output.get("proposals"), list):
        raise ValueError("Expected a version 1 connection scout file.")
    candidates = []
    ids = set()
    for proposal in scout_output["proposals"]:
        proposal_id = proposal.get("id")
        if not proposal_id or proposal_id in ids or proposal.get("type") != "member_of" or (
            proposal.get("evidence") or {}
        ).get("relationTypeId") != RELATION_TYPE_ID or proposal.get("status") != "review":
            raise ValueError(f"Invalid or duplicate scout proposal: {proposal_id}")
        ids.add(proposal_id)
        if proposal_id in existing:
            continue
        person = nodes.get(proposal.get("source"))
        band = nodes.get(proposal.get("target"))
        if not person or person.get("type") not in {"artist", "guitarist"} or not band or band.get("type") != "band":
            raise ValueError(f"Connection nodes are absent or have wrong types: {proposal_id}")
        candidates.append({
            "name": f"{person['label']} -> {band['label']}",
            "requested_kind": person["type"],
            "kind": KIND,
            "connection": proposal,
            "status": "review",
            "reason": "Exact MusicBrainz band-membership relationship; requires human review.",
        })
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    scout_output = json.loads(args.input.read_text(encoding="utf-8"))
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    nodes = {node["id"]: node for node in graph["nodes"]}
    if len(scout_output.get("proposals", [])) > 25:
        raise SystemExit("Connection scout batches are limited to 25 proposals.")
    client = require_client() if args.publish else None
    existing = pending_proposals(client) if client else set()
    candidates = candidate_payloads(scout_output, existing, nodes)
    summary = {"checked": len(scout_output.get("checked", [])),
               "proposals": len(scout_output["proposals"]),
               "newReviewRows": len(candidates), "published": False}
    if not args.publish or not candidates:
        print(json.dumps(summary, indent=2))
        return

    run_id = new_run_id()
    log = {"runId": run_id, "createdAt": datetime.now(UTC).isoformat(),
           "requestIds": [], "seedCount": len(candidates), "dryRun": False,
           "source": "MusicBrainz typed relationships"}
    start_run(client, log)
    try:
        count = upsert_candidates(client, run_id, [], candidates)
        finish_run(client, run_id, "completed", log, candidate_count=count)
    except Exception as exc:
        finish_run(client, run_id, "failed", log, error=str(exc))
        raise
    print(json.dumps({**summary, "published": True, "runId": run_id}, indent=2))


if __name__ == "__main__":
    main()
