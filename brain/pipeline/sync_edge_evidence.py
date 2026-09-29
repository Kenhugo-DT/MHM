"""Sync one reviewed batch of relation sources without importing the whole graph."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from import_graph import BRAIN_ROOT
from supabase import create_client

GRAPH_PATH = BRAIN_ROOT / "data" / "approved" / "graph.json"
DEFAULT_REVIEW = BRAIN_ROOT / "data" / "source-reviews" / "2026-09-29-bridges.json"


def reviewed_edges(graph: dict[str, Any], review: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {edge["id"]: edge for edge in graph["edges"]}
    ids = review.get("edgeIds", [])
    if not ids or len(ids) != len(set(ids)):
        raise ValueError("Review must contain unique edge IDs.")
    result = []
    for edge_id in ids:
        edge = by_id.get(edge_id)
        if edge is None:
            raise ValueError(f"Reviewed edge is missing from graph: {edge_id}")
        if edge.get("label", "").lower() in {"wikipedia link signal", "wikipedia category signal"}:
            raise ValueError(f"Research lead cannot be synced as a reviewed connection: {edge_id}")
        if not edge.get("context") or not edge.get("sources"):
            raise ValueError(f"Reviewed edge needs context and a source: {edge_id}")
        if any(not source.get("url") for source in edge["sources"]):
            raise ValueError(f"Reviewed edge contains a source without a URL: {edge_id}")
        result.append(edge)
    return result


def change_state(edge: dict[str, Any], remote: dict[str, Any]) -> str:
    if remote.get("sources") == edge["sources"] and remote.get("context") == edge["context"]:
        return "current"
    if remote.get("sources") or remote.get("context"):
        return "conflict"
    return "update"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    review = json.loads(args.review.read_text(encoding="utf-8"))
    edges = reviewed_edges(graph, review)

    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SECRET_KEY are required.")

    client = create_client(url, key)
    pending = []
    conflicts = []
    current = 0
    for edge in edges:
        query = (client.table("relations")
                 .select("id,context,sources")
                 .eq("source_id", edge["source"])
                 .eq("target_id", edge["target"])
                 .eq("relation_type", edge["type"])
                 .eq("label", edge["label"]))
        rows = query.execute().data or []
        if len(rows) != 1:
            conflicts.append(f"{edge['id']}: expected one live relation, found {len(rows)}")
            continue
        state = change_state(edge, rows[0])
        if state == "current":
            current += 1
        elif state == "conflict":
            conflicts.append(f"{edge['id']}: live context or sources differ")
        else:
            pending.append((edge, rows[0]["id"]))

    print(json.dumps({"reviewed": len(edges), "current": current,
                      "pending": len(pending), "conflicts": conflicts,
                      "mode": "apply" if args.apply else "dry-run"}, indent=2))
    if conflicts:
        raise SystemExit("No changes applied because live relations need manual review.")
    if not args.apply:
        return

    for edge, remote_id in pending:
        client.table("relations").update({"context": edge["context"],
                                          "sources": edge["sources"]}).eq("id", remote_id).execute()
    print(f"Updated {len(pending)} reviewed live relations.")


if __name__ == "__main__":
    main()
