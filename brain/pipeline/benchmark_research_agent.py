"""Run a bounded, repeatable live research quality check."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import UTC, datetime

from scout_agent import BRAIN_ROOT, REPO_ROOT, slugify
from supabase_brain import fetch_requests, request_to_row, require_client


SEEDS = [
    ("Bill Stevenson", "artist"),
    ("Paul Kantner", "artist"),
    ("Mark Knopfler", "guitarist"),
    ("Tony Iommi", "guitarist"),
    ("Robert Fripp", "guitarist"),
    ("Waylon Jennings", "artist"),
    ("The Supremes", "band"),
    ("Public Enemy", "band"),
    ("N.W.A", "band"),
    ("Dire Straits", "band"),
]


def evaluate(payload: dict) -> dict:
    candidates = payload.get("music_candidates") or []
    review = payload.get("review") or {}
    return {
        "seed": payload.get("name"),
        "reviewLevel": review.get("level"),
        "documentedRelations": sum(bool(item.get("documented_relation")) for item in candidates),
        "relatedCandidates": len(candidates),
        "linkLeads": len(payload.get("link_leads") or []),
        "authorityChecks": len(payload.get("authority_checks") or []),
        "archiveLeads": len(payload.get("archive_leads") or []),
        "sourceErrors": len(payload.get("source_errors") or []),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="Queue and run the ten live requests.")
    args = parser.parse_args()
    if not args.execute:
        print(json.dumps({"dryRun": True, "seeds": SEEDS}, indent=2))
        return

    client = require_client()
    if fetch_requests(client, status="queued", limit=1):
        raise SystemExit("Another request is queued; refusing to disturb the existing agent queue.")
    report = {"startedAt": datetime.now(UTC).isoformat(), "runs": []}
    for index, (name, kind) in enumerate(SEEDS, 1):
        request_id = f"manual-evidence-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}-{slugify(name)}"
        request = {
            "id": request_id,
            "title": f"Evidence benchmark: {name}",
            "status": "queued",
            "priority": 90,
            "scope": "artist_network",
            "instructions": (
                "Find documented band membership for this seed. Keep Wikipedia links, "
                "GND identity checks and archive audio records as leads only. "
                "Do not publish nodes or edges; human review is required."
            ),
            "seeds": [{"name": name, "kind": kind}],
            "limits": {"maxSeeds": 1, "maxCandidates": 12},
            "notes": "Controlled 10-run source-evidence quality benchmark.",
        }
        client.table("research_requests").upsert(request_to_row(request, source="quality-benchmark"),
                                                  on_conflict="id").execute()
        print(f"Run {index}/{len(SEEDS)}: {name}", flush=True)
        result = subprocess.run([
            sys.executable, str(BRAIN_ROOT / "pipeline" / "scout_agent.py"),
            "--source", "supabase", "--process", "--limit", "1", "--learning-mode", "auto",
        ], cwd=REPO_ROOT, capture_output=True, text=True, check=False)
        if result.returncode:
            print(result.stdout[-4000:], file=sys.stderr)
            print(result.stderr[-4000:], file=sys.stderr)
            raise SystemExit(f"Agent failed at run {index}; request {request_id} remains for recovery.")
        rows = client.table("research_candidates").select("payload,status").eq(
            "request_id", request_id).execute().data or []
        if len(rows) != 1:
            raise SystemExit(f"Expected one candidate group for {request_id}, got {len(rows)}.")
        entry = {"requestId": request_id, "status": rows[0]["status"], **evaluate(rows[0]["payload"])}
        report["runs"].append(entry)
        print(json.dumps(entry, ensure_ascii=False), flush=True)

    report["finishedAt"] = datetime.now(UTC).isoformat()
    report["totals"] = {
        "runs": len(report["runs"]),
        "documentedRelations": sum(row["documentedRelations"] for row in report["runs"]),
        "relatedCandidates": sum(row["relatedCandidates"] for row in report["runs"]),
        "sourceErrors": sum(row["sourceErrors"] for row in report["runs"]),
    }
    path = BRAIN_ROOT / "data" / "runs" / f"research-quality-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"totals": report["totals"], "report": str(path.relative_to(REPO_ROOT))}, indent=2))


if __name__ == "__main__":
    main()
