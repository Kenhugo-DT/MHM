"""Queue a human-written MHM research request."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from brain_db import ALLOWED_SCOPES, parse_seed, print_json
from process_inbox import BRAIN_ROOT, iso_now, slugify, validate_request

DEFAULT_REQUEST_PATH = BRAIN_ROOT / "data" / "inbox" / "quick-request.txt"
EXAMPLE_REQUEST_PATH = BRAIN_ROOT / "data" / "inbox" / "quick-request.example.txt"


def read_block(lines: list[str], start_index: int) -> tuple[str, int]:
    values: list[str] = []
    index = start_index
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if stripped.lower() == "seeds:":
            break
        if stripped and not stripped.startswith("#"):
            values.append(stripped)
        index += 1
    return " ".join(values).strip(), index


def parse_request_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Request file not found: {path}\n"
            f"Copy {EXAMPLE_REQUEST_PATH} to {DEFAULT_REQUEST_PATH} first."
        )

    lines = path.read_text(encoding="utf-8").splitlines()
    fields: dict[str, str] = {}
    seeds: list[dict[str, str]] = []
    index = 0

    while index < len(lines):
        raw_line = lines[index]
        line = raw_line.strip()
        index += 1

        if not line or line.startswith("#"):
            continue

        lower = line.lower()
        if lower == "instructions:":
            instructions, index = read_block(lines, index)
            fields["instructions"] = instructions
            continue

        if lower == "seeds:":
            while index < len(lines):
                seed_line = lines[index].strip()
                index += 1
                if not seed_line or seed_line.startswith("#"):
                    continue
                if seed_line.lower() == "end":
                    break
                seeds.append(parse_seed(seed_line))
            continue

        if ":" not in line:
            raise SystemExit(f"Cannot parse line: {raw_line}")

        key, value = line.split(":", 1)
        fields[key.strip().lower()] = value.strip()

    title = fields.get("title", "").strip()
    if not title:
        raise SystemExit("Request needs a Title.")

    scope = fields.get("scope", "open_research").strip() or "open_research"
    if scope not in ALLOWED_SCOPES:
        raise SystemExit(f"Unsupported scope: {scope}")

    priority = int(fields.get("priority", "50").strip() or "50")
    max_seeds = int(fields.get("max seeds", fields.get("maxseeds", "8")).strip() or "8")
    max_candidates = int(
        fields.get("max candidates", fields.get("maxcandidates", "40")).strip() or "40"
    )
    request_id = fields.get("id", "").strip()
    if not request_id:
        request_id = f"{slugify(title)}-{iso_now()[:10].replace('-', '')}"

    request: dict[str, Any] = {
        "id": request_id,
        "title": title,
        "status": "queued",
        "priority": priority,
        "scope": scope,
        "createdAt": iso_now(),
        "instructions": fields.get("instructions", "").strip(),
        "seeds": seeds,
        "limits": {
            "maxSeeds": max_seeds,
            "maxCandidates": max_candidates,
        },
        "source": "quick-request",
    }

    if fields.get("notes"):
        request["notes"] = fields["notes"]

    errors = validate_request(request)
    if not request["instructions"]:
        errors.append("Request needs Instructions.")
    if errors:
        raise SystemExit("\n".join(errors))

    return request


def load_supabase_helpers():
    try:
        from supabase_brain import request_to_row, require_client
    except ModuleNotFoundError as error:
        raise SystemExit(
            f"Missing Python package '{error.name}'. Install with: "
            "python -m pip install -r brain/pipeline/requirements.txt"
        ) from error

    return {
        "request_to_row": request_to_row,
        "require_client": require_client,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Queue a human-written MHM research request.")
    parser.add_argument("--file", type=Path, default=DEFAULT_REQUEST_PATH)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Write the request to Supabase research_requests.",
    )
    args = parser.parse_args()

    request = parse_request_file(args.file)

    if args.dry_run or not args.publish:
        print_json({"queuedPreview": request, "publish": False})
        return

    helpers = load_supabase_helpers()
    client = helpers["require_client"]()
    client.table("research_requests").upsert(
        helpers["request_to_row"](request, source="quick-request"),
        on_conflict="id",
    ).execute()
    print_json({"queued": request, "destination": "supabase:research_requests"})


if __name__ == "__main__":
    main()
