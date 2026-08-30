"""Process queued research inbox requests into review candidates."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

BRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BRAIN_ROOT.parent
INBOX_PATH = BRAIN_ROOT / "data" / "inbox" / "research-requests.json"
CANDIDATES_DIR = BRAIN_ROOT / "data" / "candidates"
RUNS_DIR = BRAIN_ROOT / "data" / "runs"

ALLOWED_KINDS = {
    "band",
    "guitarist",
    "artist",
    "guitar",
    "guitar_brand",
    "genre",
}


def now_stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "research-run"


def display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return str(resolved)


def load_inbox(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "requests": []}

    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return {"version": 1, "requests": payload}
    if not isinstance(payload, dict):
        raise ValueError("Inbox must be a JSON object with a requests array.")
    if "requests" not in payload or not isinstance(payload["requests"], list):
        raise ValueError("Inbox must contain a requests array.")
    return payload


def validate_request(request: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    request_id = request.get("id", "")
    if not request_id or not isinstance(request_id, str):
        errors.append("Missing request id.")
    elif not re.match(r"^[a-z0-9][a-z0-9-]*$", request_id):
        errors.append(f"Invalid request id: {request_id}.")

    seeds = request.get("seeds", [])
    if not isinstance(seeds, list) or not seeds:
        errors.append(f"{request_id or 'Request'} has no seeds.")
        return errors

    for index, seed in enumerate(seeds):
        if not isinstance(seed, dict):
            errors.append(f"{request_id} seed {index + 1} must be an object.")
            continue
        name = seed.get("name")
        kind = seed.get("kind")
        if not name or not isinstance(name, str):
            errors.append(f"{request_id} seed {index + 1} is missing a name.")
        if kind not in ALLOWED_KINDS:
            errors.append(f"{request_id} seed {index + 1} has unsupported kind: {kind}.")

    return errors


def load_supabase_helpers() -> dict[str, Any]:
    try:
        from supabase_brain import (
            finish_run,
            load_queued_requests,
            mark_requests,
            require_client,
            start_run,
            upsert_candidates,
            upsert_inbox_requests,
        )
    except ModuleNotFoundError as error:
        raise SystemExit(
            f"Missing Python package '{error.name}'. Install with: "
            "python -m pip install -r brain/pipeline/requirements.txt"
        ) from error

    return {
        "finish_run": finish_run,
        "load_queued_requests": load_queued_requests,
        "mark_requests": mark_requests,
        "require_client": require_client,
        "start_run": start_run,
        "upsert_candidates": upsert_candidates,
        "upsert_inbox_requests": upsert_inbox_requests,
    }


def queued_requests(inbox: dict[str, Any], limit: int | None) -> tuple[list[dict[str, Any]], list[str]]:
    errors: list[str] = []
    requests = [
        request
        for request in inbox["requests"]
        if isinstance(request, dict) and request.get("status", "queued") == "queued"
    ]

    for request in requests:
        errors.extend(validate_request(request))

    requests.sort(
        key=lambda request: (
            int(request.get("priority", 0)),
            str(request.get("createdAt", "")),
            str(request.get("id", "")),
        ),
        reverse=True,
    )
    return (requests[:limit] if limit else requests, errors)


def seeds_from_requests(requests: list[dict[str, Any]]) -> list[dict[str, str]]:
    seeds: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for request in requests:
        limits = request.get("limits", {})
        if not isinstance(limits, dict):
            limits = {}
        max_seeds = int(limits.get("maxSeeds", 50))
        for seed in request.get("seeds", [])[:max_seeds]:
            key = (seed["name"].casefold(), seed["kind"])
            if key in seen:
                continue
            seen.add(key)
            seeds.append({"name": seed["name"], "kind": seed["kind"]})

    return seeds


def mark_processed(inbox: dict[str, Any], request_ids: set[str], output_path: Path) -> dict[str, Any]:
    processed_at = iso_now()
    for request in inbox["requests"]:
        if not isinstance(request, dict) or request.get("id") not in request_ids:
            continue
        request["status"] = "processed"
        request["processedAt"] = processed_at
        request["candidateOutput"] = display_path(output_path)
    return inbox


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inbox", type=Path, default=INBOX_PATH)
    parser.add_argument("--output-dir", type=Path, default=CANDIDATES_DIR)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--mark-processed", action="store_true")
    parser.add_argument(
        "--source",
        choices=["file", "supabase"],
        default=os.getenv("BRAIN_INBOX_SOURCE", "file"),
        help="Read queued requests from a local file or from Supabase.",
    )
    parser.add_argument(
        "--sync-local-inbox-to-supabase",
        action="store_true",
        help="Upload the local inbox to Supabase before processing.",
    )
    parser.add_argument(
        "--publish-candidates-to-supabase",
        action="store_true",
        help="Write run logs and candidate payloads to Supabase.",
    )
    args = parser.parse_args()

    db_client = None
    publish_to_supabase = args.publish_candidates_to_supabase or args.source == "supabase"

    if args.source == "supabase" or args.sync_local_inbox_to_supabase or publish_to_supabase:
        supabase_helpers = load_supabase_helpers()
        db_client = supabase_helpers["require_client"]()
    else:
        supabase_helpers = {}

    if args.sync_local_inbox_to_supabase:
        local_inbox = load_inbox(args.inbox)
        synced = supabase_helpers["upsert_inbox_requests"](db_client, local_inbox)
        print(f"Synced {synced} local inbox requests to Supabase.")

    if args.source == "supabase":
        inbox = {
            "version": 1,
            "requests": supabase_helpers["load_queued_requests"](db_client, args.limit or None),
        }
        inbox_label = "supabase:research_requests"
    else:
        inbox = load_inbox(args.inbox)
        inbox_label = display_path(args.inbox)

    requests, errors = queued_requests(inbox, args.limit or None)
    seeds = seeds_from_requests(requests)
    request_ids = [request["id"] for request in requests]
    run_id = f"inbox-{now_stamp()}-{slugify(request_ids[0]) if request_ids else 'noop'}"

    summary = {
        "version": 1,
        "runId": run_id,
        "createdAt": iso_now(),
        "inbox": inbox_label,
        "dryRun": args.dry_run,
        "queuedRequestCount": len(requests),
        "seedCount": len(seeds),
        "requestIds": request_ids,
        "errors": errors,
    }

    if errors:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        raise SystemExit(1)

    if args.dry_run or not requests:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return

    args.output_dir.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(
        "w",
        delete=False,
        suffix=".json",
        encoding="utf-8",
        dir=RUNS_DIR,
    ) as temp_file:
        json.dump(seeds, temp_file, ensure_ascii=False, indent=2)
        temp_seed_path = Path(temp_file.name)

    from sync import collect

    if db_client and publish_to_supabase:
        supabase_helpers["mark_requests"](db_client, request_ids, "processing")
        supabase_helpers["start_run"](db_client, summary)

    try:
        collected = collect(temp_seed_path)
    except Exception as error:
        if db_client and publish_to_supabase:
            failed_summary = {**summary, "error": str(error)}
            supabase_helpers["finish_run"](
                db_client,
                run_id,
                "failed",
                failed_summary,
                candidate_count=0,
                error=str(error),
            )
            supabase_helpers["mark_requests"](
                db_client,
                request_ids,
                "failed",
                error=str(error),
            )
        raise

    output_path = args.output_dir / f"{run_id}.json"
    candidate_payloads = [asdict(candidate) for candidate in collected]
    payload = {
        **summary,
        "dryRun": False,
        "candidateCount": len(collected),
        "requests": requests,
        "seeds": seeds,
        "candidates": candidate_payloads,
        "nextStep": "Review candidates, then manually promote approved nodes and edges to the approved graph.",
    }
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    run_summary_path = RUNS_DIR / f"{run_id}-summary.json"
    run_summary_path.write_text(
        json.dumps({**summary, "candidateOutput": str(output_path)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if args.mark_processed and args.source == "file":
        updated = mark_processed(inbox, set(request_ids), output_path)
        args.inbox.write_text(
            json.dumps(updated, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    if db_client and publish_to_supabase:
        supabase_candidate_count = supabase_helpers["upsert_candidates"](
            db_client,
            run_id,
            requests,
            candidate_payloads,
        )
        supabase_payload = {
            **payload,
            "supabaseCandidateCount": supabase_candidate_count,
        }
        supabase_helpers["finish_run"](
            db_client,
            run_id,
            "completed",
            supabase_payload,
            candidate_count=supabase_candidate_count,
        )
        supabase_helpers["mark_requests"](
            db_client,
            request_ids,
            "processed",
            processed_at=iso_now(),
            candidate_output=display_path(output_path),
            error=None,
        )

    print(f"Wrote {len(collected)} candidate groups to {output_path}.")


if __name__ == "__main__":
    main()
