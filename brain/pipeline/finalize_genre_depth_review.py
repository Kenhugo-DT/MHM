"""Close a reviewed research batch only after the sourced public nodes are live."""

from __future__ import annotations

import argparse
import json

from import_graph import BRAIN_ROOT
from supabase_brain import require_client


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    batch = json.loads((BRAIN_ROOT / "data/genre-depth-batch.json").read_text(encoding="utf-8"))
    review = json.loads((BRAIN_ROOT / "data/source-reviews/2026-09-30-genre-depth.json").read_text(encoding="utf-8"))
    inbox = json.loads((BRAIN_ROOT / "data/inbox/genre-depth-requests-2026-09-30.json").read_text(encoding="utf-8"))
    request_ids = [request["id"] for request in inbox["requests"]]
    client = require_client()

    candidates = (client.table("research_candidates").select("id,seed_name,status")
                  .in_("request_id", request_ids).limit(100).execute().data or [])
    entities = (client.table("entities").select("id,label,sources")
                .in_("id", batch["nodeIds"]).limit(100).execute().data or [])
    entity_names = {item["label"] for item in entities if item.get("sources")}
    candidate_names = {item["seed_name"] for item in candidates}
    expected_names = {item["label"] for item in entities}
    if (len(candidates) != review["candidateCount"] or len(entities) != len(batch["nodeIds"])
            or len(entity_names) != len(entities) or candidate_names != expected_names):
        raise SystemExit("Candidates and sourced live entities do not match the reviewed batch.")

    mismatches = review["ambiguousRawMatches"]
    if not set(mismatches).issubset(candidate_names):
        raise SystemExit("A documented ambiguous candidate is missing.")
    clear = [item for item in candidates if item["seed_name"] not in mismatches]
    ambiguous = [item for item in candidates if item["seed_name"] in mismatches]
    print(json.dumps({"liveNodesChecked": len(entities), "clearCandidates": len(clear),
                      "correctedRawMatches": len(ambiguous), "mode": "apply" if args.apply else "dry-run"}))
    if not args.apply:
        return

    if clear:
        client.table("research_candidates").update({
            "status": "imported",
            "reason": "Independently checked against the institutional source on the live node; curated genre link published.",
        }).in_("id", [item["id"] for item in clear]).execute()
    for item in ambiguous:
        client.table("research_candidates").update({
            "status": "imported",
            "reason": "Raw source mismatch bypassed. " + mismatches[item["seed_name"]],
        }).eq("id", item["id"]).execute()
    print(f"Finalized {len(candidates)} reviewed candidates without promoting raw source IDs.")


if __name__ == "__main__":
    main()
