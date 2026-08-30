"""Manage the Supabase-backed MHM brain queue."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from process_inbox import INBOX_PATH, iso_now, load_inbox, validate_request

ALLOWED_SCOPES = {
    "artist_network",
    "guitar_history",
    "genre_cluster",
    "route",
    "open_research",
}
ALLOWED_KINDS = {
    "band",
    "guitarist",
    "artist",
    "guitar",
    "guitar_brand",
    "genre",
}


def load_supabase_helpers():
    try:
        from supabase_brain import (
            fetch_candidates,
            fetch_requests,
            request_to_row,
            require_client,
            row_to_request,
            upsert_inbox_requests,
        )
    except ModuleNotFoundError as error:
        raise SystemExit(
            f"Missing Python package '{error.name}'. Install with: "
            "python -m pip install -r brain/pipeline/requirements.txt"
        ) from error

    return {
        "fetch_candidates": fetch_candidates,
        "fetch_requests": fetch_requests,
        "request_to_row": request_to_row,
        "require_client": require_client,
        "row_to_request": row_to_request,
        "upsert_inbox_requests": upsert_inbox_requests,
    }


def parse_seed(value: str) -> dict[str, str]:
    if ":" not in value:
        raise argparse.ArgumentTypeError("Seed must use the format 'Name:kind'.")
    name, kind = value.rsplit(":", 1)
    name = name.strip()
    kind = kind.strip()
    if not name:
        raise argparse.ArgumentTypeError("Seed name cannot be empty.")
    if kind not in ALLOWED_KINDS:
        raise argparse.ArgumentTypeError(
            f"Seed kind must be one of: {', '.join(sorted(ALLOWED_KINDS))}."
        )
    return {"name": name, "kind": kind}


def print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def command_sync_inbox(args: argparse.Namespace) -> None:
    helpers = load_supabase_helpers()
    client = helpers["require_client"]()
    inbox = load_inbox(args.inbox)
    count = helpers["upsert_inbox_requests"](client, inbox)
    print_json(
        {
            "syncedRequests": count,
            "source": str(args.inbox),
            "destination": "supabase:research_requests",
        }
    )


def command_list_requests(args: argparse.Namespace) -> None:
    helpers = load_supabase_helpers()
    client = helpers["require_client"]()
    rows = helpers["fetch_requests"](client, status=args.status, limit=args.limit)
    print_json(
        {
            "count": len(rows),
            "status": args.status,
            "requests": [helpers["row_to_request"](row) for row in rows],
        }
    )


def candidate_summary(row: dict[str, Any]) -> dict[str, Any]:
    payload = row.get("payload") or {}
    return {
        "id": row.get("id"),
        "runId": row.get("run_id"),
        "requestId": row.get("request_id"),
        "seedName": row.get("seed_name"),
        "requestedKind": row.get("requested_kind"),
        "status": row.get("status"),
        "musicCandidateCount": len(payload.get("music_candidates") or []),
        "wikipediaTitle": (payload.get("wikipedia") or {}).get("title"),
        "wikidataId": (payload.get("wikidata") or {}).get("id"),
        "createdAt": row.get("created_at"),
    }


def command_list_candidates(args: argparse.Namespace) -> None:
    helpers = load_supabase_helpers()
    client = helpers["require_client"]()
    rows = helpers["fetch_candidates"](client, status=args.status, limit=args.limit)
    print_json(
        {
            "count": len(rows),
            "status": args.status,
            "candidates": [candidate_summary(row) for row in rows],
        }
    )


def command_add_request(args: argparse.Namespace) -> None:
    if args.scope not in ALLOWED_SCOPES:
        raise SystemExit(f"Unsupported scope: {args.scope}")

    request = {
        "id": args.id,
        "title": args.title,
        "status": "queued",
        "priority": args.priority,
        "scope": args.scope,
        "createdAt": iso_now(),
        "instructions": args.instructions,
        "seeds": args.seed,
        "limits": {
            "maxSeeds": args.max_seeds,
            "maxCandidates": args.max_candidates,
        },
    }
    if args.notes:
        request["notes"] = args.notes

    errors = validate_request(request)
    if errors:
        raise SystemExit("\n".join(errors))

    helpers = load_supabase_helpers()
    client = helpers["require_client"]()
    client.table("research_requests").upsert(
        helpers["request_to_row"](request, source="terminal"),
        on_conflict="id",
    ).execute()
    print_json({"queued": request})


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage the MHM Supabase brain.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync_inbox = subparsers.add_parser(
        "sync-inbox",
        help="Upload local research-requests.json into Supabase.",
    )
    sync_inbox.add_argument("--inbox", type=Path, default=INBOX_PATH)
    sync_inbox.set_defaults(func=command_sync_inbox)

    list_requests = subparsers.add_parser(
        "list-requests",
        help="List requests stored in Supabase.",
    )
    list_requests.add_argument("--status", default="queued")
    list_requests.add_argument("--limit", type=int, default=20)
    list_requests.set_defaults(func=command_list_requests)

    list_candidates = subparsers.add_parser(
        "list-candidates",
        help="List review candidates stored in Supabase.",
    )
    list_candidates.add_argument("--status", default="review")
    list_candidates.add_argument("--limit", type=int, default=20)
    list_candidates.set_defaults(func=command_list_candidates)

    add_request = subparsers.add_parser(
        "add-request",
        help="Create or update one queued request in Supabase.",
    )
    add_request.add_argument("--id", required=True)
    add_request.add_argument("--title", required=True)
    add_request.add_argument("--scope", default="open_research")
    add_request.add_argument("--priority", type=int, default=50)
    add_request.add_argument("--instructions", required=True)
    add_request.add_argument("--seed", type=parse_seed, action="append", required=True)
    add_request.add_argument("--max-seeds", type=int, default=8)
    add_request.add_argument("--max-candidates", type=int, default=40)
    add_request.add_argument("--notes")
    add_request.set_defaults(func=command_add_request)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
