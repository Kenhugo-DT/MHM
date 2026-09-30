"""Insert a reviewed, bounded graph expansion without overwriting live rows."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from import_graph import BRAIN_ROOT, entity_row, relation_row
from supabase_brain import require_client

GRAPH_PATH = BRAIN_ROOT / "data" / "approved" / "graph.json"
BATCH_PATH = BRAIN_ROOT / "data" / "curated-era-batch.json"


def batch_rows(batch_path=BATCH_PATH):
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    batch = json.loads(batch_path.read_text(encoding="utf-8"))
    all_nodes = {node["id"]: node for node in graph["nodes"]}
    node_ids = batch["nodeIds"]
    if len(node_ids) != len(set(node_ids)) or any(node_id not in all_nodes for node_id in node_ids):
        raise ValueError("Batch contains duplicate or missing node IDs.")

    nodes = [all_nodes[node_id] for node_id in node_ids]
    edges = [edge for edge in graph["edges"] if edge["id"].startswith(batch["edgePrefix"])]
    if len(edges) != batch["expectedEdges"] or len({edge["id"] for edge in edges}) != len(edges):
        raise ValueError("Curated edge count or IDs differ from the reviewed batch.")
    allowed_zones = set(batch.get("allowedZones", ["classical-history", "pop-soul-disco"]))
    for node in nodes:
        if node["zone"] not in allowed_zones or not node.get("sources"):
            raise ValueError(f"Node lacks a reviewed zone or source: {node['id']}")
    for edge in edges:
        if (edge["source"] not in all_nodes or edge["target"] not in all_nodes
                or not edge.get("context") or not edge.get("sources")):
            raise ValueError(f"Edge lacks endpoints or evidence: {edge['id']}")
    return nodes, edges


def equal_fields(remote, expected):
    return all(remote.get(key) == value for key, value in expected.items())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--batch", default=str(BATCH_PATH))
    args = parser.parse_args()
    nodes, edges = batch_rows(Path(args.batch))
    client = require_client()
    pending_nodes = []
    pending_edges = []
    conflicts = []
    current_nodes = current_edges = 0

    for node in nodes:
        row = entity_row(node)
        matches = client.table("entities").select("*").eq("id", node["id"]).execute().data or []
        same_label = client.table("entities").select("id").ilike("label", node["label"]).execute().data or []
        if len(matches) > 1 or any(item["id"] != node["id"] for item in same_label):
            conflicts.append(f"{node['id']}: duplicate ID or label")
        elif not matches:
            pending_nodes.append(row)
        elif equal_fields(matches[0], row):
            current_nodes += 1
        else:
            conflicts.append(f"{node['id']}: live node differs; no overwrite")

    for edge in edges:
        row = relation_row(edge)
        matches = (client.table("relations").select("*")
                   .eq("source_id", edge["source"])
                   .eq("target_id", edge["target"])
                   .eq("relation_type", edge["type"])
                   .eq("label", edge["label"]).execute().data or [])
        if not matches:
            pending_edges.append(row)
        elif len(matches) == 1 and equal_fields(matches[0], row):
            current_edges += 1
        else:
            conflicts.append(f"{edge['id']}: live relation differs; no overwrite")

    print(json.dumps({"nodes": len(nodes), "edges": len(edges),
                      "pendingNodes": len(pending_nodes), "pendingEdges": len(pending_edges),
                      "currentNodes": current_nodes, "currentEdges": current_edges,
                      "conflicts": conflicts, "mode": "apply" if args.apply else "dry-run"}, indent=2))
    if conflicts:
        raise SystemExit("No changes applied; review live conflicts first.")
    if not args.apply:
        return

    if pending_nodes:
        client.table("entities").insert(pending_nodes).execute()
    if pending_edges:
        client.table("relations").insert(pending_edges).execute()
    print(f"Inserted {len(pending_nodes)} nodes and {len(pending_edges)} sourced relations.")


if __name__ == "__main__":
    main()
