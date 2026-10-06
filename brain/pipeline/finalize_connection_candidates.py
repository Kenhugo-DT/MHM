"""Verify reviewed connections before import and mark them imported only after DB readback."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from supabase_brain import require_client

ROOT = Path(__file__).resolve().parents[1]
PROMOTIONS = ROOT / "data" / "approved" / "promotions.json"
GRAPH = ROOT / "data" / "approved" / "graph.json"


def reviewed_rows(promotions: dict) -> list[dict]:
    rows = [row for row in promotions.get("candidateRows", [])
            if row.get("kind") == "typed_connection"]
    if len(rows) > 500 or len({row.get("id") for row in rows}) != len(rows):
        raise ValueError("Connection promotion ledger exceeds 500 or contains duplicate IDs.")
    return rows


def candidate_matches_manifest(row: dict, candidate: dict, graph: dict) -> bool:
    proposal = (candidate.get("payload") or {}).get("connection") or {}
    edges = {edge["id"]: edge for edge in graph["edges"]}
    edge = edges.get(row.get("edgeId"))
    return (candidate.get("status") in {"approved", "imported"} and
            (candidate.get("payload") or {}).get("kind") == "typed_connection" and
            proposal.get("id") == row.get("edgeId") and
            proposal.get("source") == row.get("source") and
            proposal.get("target") == row.get("target") and
            edge is not None and edge.get("source") == row.get("source") and
            edge.get("target") == row.get("target") and edge.get("type") == "member_of" and
            any(source.get("provider") == "musicbrainz" for source in edge.get("sources", [])))


def live_relation_matches(row: dict, relation: dict | None) -> bool:
    return bool(relation and relation.get("source_id") == row.get("source") and
                relation.get("target_id") == row.get("target") and
                relation.get("relation_type") == "member_of" and
                relation.get("label") == "Member of" and
                any(source.get("provider") == "musicbrainz" for source in relation.get("sources", [])))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--finalize", action="store_true")
    args = parser.parse_args()
    promotions = json.loads(PROMOTIONS.read_text(encoding="utf-8"))
    graph = json.loads(GRAPH.read_text(encoding="utf-8"))
    rows = reviewed_rows(promotions)
    if not rows:
        print(json.dumps({"pending": 0, "finalized": 0}))
        return

    client = require_client()
    candidates = {}
    for start in range(0, len(rows), 50):
        ids = [row["id"] for row in rows[start:start + 50]]
        response = (client.table("research_candidates")
                    .select("id,status,payload").in_("id", ids).execute())
        candidates.update({item["id"]: item for item in response.data or []})

    pending = []
    for row in rows:
        candidate = candidates.get(row["id"])
        if not candidate or not candidate_matches_manifest(row, candidate, graph):
            raise RuntimeError(f"Approval or graph mismatch for connection candidate {row['id']}.")
        if candidate["status"] == "approved":
            pending.append(row)

    if args.finalize:
        for row in pending:
            response = (client.table("relations")
                        .select("source_id,target_id,relation_type,label,sources")
                        .eq("source_id", row["source"])
                        .eq("target_id", row["target"])
                        .eq("relation_type", "member_of")
                        .eq("label", "Member of")
                        .limit(1).execute())
            if not live_relation_matches(row, (response.data or [None])[0]):
                raise RuntimeError(f"Published relation not found for candidate {row['id']}.")
        for row in pending:
            (client.table("research_candidates")
             .update({"status": "imported"}).eq("id", row["id"])
             .eq("status", "approved").execute())
    print(json.dumps({"pending": len(pending),
                      "finalized": len(pending) if args.finalize else 0}))


if __name__ == "__main__":
    main()
