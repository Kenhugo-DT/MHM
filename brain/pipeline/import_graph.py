"""Import an approved graph JSON file into Supabase."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

BRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BRAIN_ROOT.parent

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BRAIN_ROOT / ".env")
load_dotenv(Path(__file__).with_name(".env"))


def entity_row(node: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": node["id"],
        "label": node["label"],
        "node_type": node["type"],
        "roles": node.get("roles", []),
        "summary": node.get("summary", ""),
        "metadata": node.get("metadata", []),
        "aliases": node.get("aliases", []),
        "map_x": node.get("x", 0),
        "map_y": node.get("y", 0),
        "map_zone": node.get("zone", "unplaced"),
        "starter": node.get("starter", False),
        "image": node.get("image"),
        "sources": node.get("sources", []),
    }


def relation_row(edge: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_id": edge["source"],
        "target_id": edge["target"],
        "relation_type": edge["type"],
        "label": edge["label"],
        "strength": edge.get("strength", 0.5),
        "context": edge.get("context", []),
        "year": edge.get("year"),
        "sources": edge.get("sources", []),
    }


def batches(items: list[dict[str, Any]], size: int = 200):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def import_graph(client: Client, graph: dict[str, Any]) -> None:
    entities = [entity_row(node) for node in graph["nodes"]]
    relations = [relation_row(edge) for edge in graph["edges"]]

    for batch in batches(entities):
        client.table("entities").upsert(batch, on_conflict="id").execute()

    for batch in batches(relations):
        client.table("relations").upsert(
            batch,
            on_conflict="source_id,target_id,relation_type,label",
        ).execute()

    print(f"Imported {len(entities)} entities and {len(relations)} relations.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "graph",
        type=Path,
        nargs="?",
        default=BRAIN_ROOT / "data" / "approved" / "graph.json",
    )
    args = parser.parse_args()

    url = os.getenv("SUPABASE_URL", "")
    secret_key = os.getenv("SUPABASE_SECRET_KEY", "")
    if not url or not secret_key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SECRET_KEY are required.")

    graph = json.loads(args.graph.read_text(encoding="utf-8"))
    import_graph(create_client(url, secret_key), graph)


if __name__ == "__main__":
    main()
