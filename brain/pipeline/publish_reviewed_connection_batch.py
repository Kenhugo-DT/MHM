"""Publish only newly reviewed band memberships, never the whole graph."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from finalize_connection_candidates import candidate_matches_manifest, reviewed_rows
from import_graph import relation_row
from supabase_brain import require_client

ROOT = Path(__file__).resolve().parents[1]
PROMOTIONS = ROOT / "data" / "approved" / "promotions.json"
GRAPH = ROOT / "data" / "approved" / "graph.json"
MEMBER_OF_BAND_TYPE_ID = "5be4c609-9afa-4ea0-910b-12ffb71e3821"


def new_batch_rows(previous: dict, current: dict) -> list[dict]:
    old_rows = {str(row["id"]): row for row in reviewed_rows(previous)}
    current_rows = reviewed_rows(current)
    for row in current_rows:
        old = old_rows.get(str(row["id"]))
        if old is not None and old != row:
            raise ValueError(f"Existing connection review changed: {row['id']}")
    additions = [row for row in current_rows if str(row["id"]) not in old_rows]
    if not 1 <= len(additions) <= 12:
        raise ValueError(f"Expected 1..12 newly reviewed connections, got {len(additions)}")
    return additions


def approved_relation_rows(rows: list[dict], candidates: dict, graph: dict) -> list[dict]:
    edges = {edge["id"]: edge for edge in graph["edges"]}
    result = []
    for row in rows:
        candidate = candidates.get(row["id"])
        if not candidate or not candidate_matches_manifest(row, candidate, graph):
            raise ValueError(f"Candidate or graph mismatch: {row['id']}")
        if candidate["status"] == "imported":
            continue
        proposal = candidate["payload"]["connection"]
        edge = edges[row["edgeId"]]
        proposal_urls = {source.get("url") for source in proposal.get("sources", [])}
        edge_urls = {source.get("url") for source in edge.get("sources", [])}
        if (proposal.get("type") != "member_of" or edge.get("label") != "Member of" or
                proposal.get("evidence", {}).get("relationTypeId") != MEMBER_OF_BAND_TYPE_ID or
                not proposal_urls or None in proposal_urls or edge_urls != proposal_urls or
                not all(url.startswith("https://musicbrainz.org/artist/") for url in edge_urls)):
            raise ValueError(f"Membership evidence changed: {row['id']}")
        result.append(relation_row(edge))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    previous = json.loads(args.baseline.read_text(encoding="utf-8"))
    current = json.loads(PROMOTIONS.read_text(encoding="utf-8"))
    graph = json.loads(GRAPH.read_text(encoding="utf-8"))
    rows = new_batch_rows(previous, current)
    client = require_client()
    candidates = {}
    for start in range(0, len(rows), 50):
        ids = [row["id"] for row in rows[start:start + 50]]
        response = client.table("research_candidates").select("id,status,payload").in_("id", ids).execute()
        candidates.update({item["id"]: item for item in response.data or []})
    relations = approved_relation_rows(rows, candidates, graph)
    if args.apply and relations:
        client.table("relations").upsert(
            relations, on_conflict="source_id,target_id,relation_type,label"
        ).execute()
    print(json.dumps({"reviewed": len(rows), "pending": len(relations),
                      "published": len(relations) if args.apply else 0}))


if __name__ == "__main__":
    main()
