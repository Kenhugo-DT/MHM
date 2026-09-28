"""Send a checked research batch to private fact review, never to publication."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

from postgrest.exceptions import APIError

from fact_scout import CURATED_PATH, all_rows, near_duplicate

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BATCH = ROOT / "brain" / "data" / "fact-batches" / "2026-09-26-sixty.json"
GRAPH_PATH = ROOT / "site" / "public" / "data" / "graph.json"
SUPPORTED_TYPES = {"band", "artist", "guitarist", "genre", "guitar", "guitar_brand"}
SUPERLATIVE = re.compile(r"\b(first|only|largest|most|oldest|youngest)\b", re.I)


def prepare_batch(batch: dict, nodes: list[dict], curated: list[dict],
                  existing: list[dict]) -> tuple[list[dict], list[str]]:
    errors = []
    if not isinstance(batch.get("facts"), list) or not isinstance(batch.get("sources"), dict):
        return [], ["Batch needs facts and a source catalog."]
    node_types = {node["id"]: node["type"] for node in nodes}
    occupied = Counter(row["entityId"] for row in curated)
    occupied.update(row["entity_id"] for row in existing if row["status"] in {"review", "approved"})
    known_fingerprints = {row["source_fingerprint"] for row in existing}
    prior_text = defaultdict(list)
    for row in curated:
        prior_text[row["entityId"]].append(row["text"])
    for row in existing:
        if row["status"] in {"review", "approved"}:
            prior_text[row["entity_id"]].append(row["text"])

    proposals = []
    batch_id = batch.get("batchId")
    if not isinstance(batch_id, str) or not re.fullmatch(r"[a-z0-9-]+", batch_id):
        errors.append("Batch needs a stable slug batchId.")
    for index, entry in enumerate(batch["facts"], 1):
        if not isinstance(entry, list) or len(entry) != 5 or not all(isinstance(x, str) for x in entry):
            errors.append(f"Fact {index}: expected [entity, text, category, source, evidence].")
            continue
        entity_id, text, category, source_key, evidence = entry
        source = batch["sources"].get(source_key)
        if node_types.get(entity_id) not in SUPPORTED_TYPES:
            errors.append(f"Fact {index}: unknown supported node {entity_id}.")
        if not 35 <= len(text) <= 200 or not text.endswith("."):
            errors.append(f"Fact {index}: text must be 35-200 characters and end with a period.")
        if not re.fullmatch(r"[a-z0-9-]+", category):
            errors.append(f"Fact {index}: invalid category.")
        if not isinstance(source, list) or len(source) != 2 or not all(isinstance(x, str) and x for x in source):
            errors.append(f"Fact {index}: missing source {source_key}.")
            continue
        parsed = urlparse(source[1])
        if parsed.scheme != "https" or not parsed.hostname or parsed.hostname.endswith("wikipedia.org"):
            errors.append(f"Fact {index}: source must be a direct, non-Wikipedia HTTPS page.")
        if SUPERLATIVE.search(text):
            errors.append(f"Fact {index}: superlative needs two independent sources.")
        if not evidence.strip():
            errors.append(f"Fact {index}: missing source location in evidence.")
        fingerprint = hashlib.sha256(f"{batch_id}\n{entity_id}\n{text}".encode()).hexdigest()
        if fingerprint in known_fingerprints:
            continue
        occupied[entity_id] += 1
        if occupied[entity_id] > 2:
            errors.append(f"Fact {index}: more than two active facts for {entity_id}.")
        if near_duplicate(text, prior_text[entity_id]):
            errors.append(f"Fact {index}: too similar to an existing fact for {entity_id}.")
        prior_text[entity_id].append(text)
        proposals.append({
            "entity_id": entity_id,
            "text": text,
            "tags": ["music-history", "manual-research", category],
            "sources": [{"label": source[0], "url": source[1]}],
            "evidence": f"Checked {batch.get('verifiedAt')}: {evidence}",
            "status": "review",
            "source_fingerprint": fingerprint,
        })
    return proposals, errors


def main() -> None:
    from supabase_brain import require_client

    parser = argparse.ArgumentParser(description="Import a sourced batch into private fact review.")
    parser.add_argument("--batch", type=Path, default=DEFAULT_BATCH)
    parser.add_argument("--publish", action="store_true", help="Insert review rows; never approve them.")
    args = parser.parse_args()
    batch = json.loads(args.batch.read_text(encoding="utf-8"))
    nodes = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))["nodes"]
    curated = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
    client = require_client()
    existing = all_rows(client, "entity_facts", "id,entity_id,text,status,source_fingerprint")
    live_nodes = [
        {"id": row["id"], "type": row["node_type"]}
        for row in all_rows(client, "entities", "id,node_type")
    ]
    proposals, errors = prepare_batch(batch, nodes, curated, existing)
    _, live_errors = prepare_batch(batch, live_nodes, curated, existing)
    errors.extend(f"Live database: {error}" for error in live_errors)
    if errors:
        for error in errors:
            print(error)
        raise SystemExit(f"Preflight failed with {len(errors)} issue(s); inserted nothing.")
    if args.publish:
        inserted = 0
        for start in range(0, len(proposals), 20):
            chunk = proposals[start:start + 20]
            try:
                client.table("entity_facts").insert(chunk).execute()
            except APIError as error:
                hint = (" Apply brain/supabase/migrations/0005_facts_all_node_types.sql "
                        "in Supabase SQL Editor before retrying." if
                        "Facts require an existing band, artist or guitarist" in str(error) else "")
                raise SystemExit(
                    f"Stopped after {inserted} new review rows. "
                    f"Earlier chunks remain in review; rerun safely after fixing: {error.message}.{hint}"
                ) from error
            inserted += len(chunk)
    print(json.dumps({
        "batch": batch["batchId"], "mode": "private-review" if args.publish else "dry-run",
        "batchFacts": len(batch["facts"]), "newReviewRows": len(proposals),
        "alreadyImported": len(batch["facts"]) - len(proposals),
        "byCategory": dict(Counter(row["tags"][-1] for row in proposals)),
    }, indent=2))


if __name__ == "__main__":
    main()
