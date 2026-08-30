"""Supabase helpers for the private MHM research brain."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

BRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BRAIN_ROOT.parent

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BRAIN_ROOT / ".env")
load_dotenv(Path(__file__).with_name(".env"))


def iso_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def supabase_env_ready() -> bool:
    return bool(os.getenv("SUPABASE_URL", "").strip() and secret_key())


def secret_key() -> str:
    return (
        os.getenv("SUPABASE_SECRET_KEY", "").strip()
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )


def require_client() -> Client:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = secret_key()
    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SECRET_KEY are required for Supabase brain access."
        )
    return create_client(url, key)


def request_to_row(request: dict[str, Any], source: str = "local-inbox") -> dict[str, Any]:
    row = {
        "id": request["id"],
        "title": request.get("title") or request["id"],
        "status": request.get("status", "queued"),
        "priority": int(request.get("priority", 50)),
        "scope": request.get("scope", "open_research"),
        "instructions": request["instructions"],
        "seeds": request.get("seeds", []),
        "limits": request.get("limits", {}),
        "notes": request.get("notes"),
        "source": request.get("source", source),
        "candidate_output": request.get("candidateOutput"),
        "error": request.get("error"),
    }

    if request.get("createdAt"):
        row["created_at"] = request["createdAt"]
    if request.get("processedAt"):
        row["processed_at"] = request["processedAt"]

    return row


def row_to_request(row: dict[str, Any]) -> dict[str, Any]:
    request = {
        "id": row["id"],
        "title": row.get("title") or row["id"],
        "status": row.get("status", "queued"),
        "priority": int(row.get("priority", 50)),
        "scope": row.get("scope", "open_research"),
        "createdAt": row.get("created_at") or iso_now(),
        "instructions": row.get("instructions", ""),
        "seeds": row.get("seeds") or [],
        "limits": row.get("limits") or {},
    }

    optional_fields = {
        "notes": row.get("notes"),
        "candidateOutput": row.get("candidate_output"),
        "processedAt": row.get("processed_at"),
        "error": row.get("error"),
    }
    request.update({key: value for key, value in optional_fields.items() if value})
    return request


def upsert_inbox_requests(client: Client, inbox: dict[str, Any]) -> int:
    requests = [item for item in inbox.get("requests", []) if isinstance(item, dict)]
    if not requests:
        return 0

    rows = [request_to_row(request) for request in requests]
    client.table("research_requests").upsert(rows, on_conflict="id").execute()
    return len(rows)


def fetch_requests(
    client: Client,
    status: str = "queued",
    limit: int = 100,
) -> list[dict[str, Any]]:
    query = client.table("research_requests").select("*")
    if status != "all":
        query = query.eq("status", status)
    response = (
        query.order("priority", desc=True)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return list(response.data or [])


def load_queued_requests(client: Client, limit: int | None = None) -> list[dict[str, Any]]:
    rows = fetch_requests(client, status="queued", limit=limit or 100)
    return [row_to_request(row) for row in rows]


def mark_requests(
    client: Client,
    request_ids: list[str],
    status: str,
    **extra: Any,
) -> None:
    if not request_ids:
        return
    payload = {"status": status, **extra}
    client.table("research_requests").update(payload).in_("id", request_ids).execute()


def start_run(client: Client, summary: dict[str, Any]) -> None:
    client.table("research_runs").upsert(
        {
            "id": summary["runId"],
            "status": "running",
            "request_ids": summary.get("requestIds", []),
            "dry_run": bool(summary.get("dryRun", False)),
            "seed_count": int(summary.get("seedCount", 0)),
            "candidate_count": 0,
            "log": summary,
            "started_at": summary.get("createdAt") or iso_now(),
        },
        on_conflict="id",
    ).execute()


def finish_run(
    client: Client,
    run_id: str,
    status: str,
    log: dict[str, Any],
    candidate_count: int = 0,
    error: str | None = None,
) -> None:
    client.table("research_runs").update(
        {
            "status": status,
            "candidate_count": candidate_count,
            "log": log,
            "error": error,
            "completed_at": iso_now(),
        }
    ).eq("id", run_id).execute()


def request_id_for_seed(
    seed_name: str,
    requested_kind: str,
    requests: list[dict[str, Any]],
) -> str | None:
    needle = (seed_name.casefold(), requested_kind)
    for request in requests:
        for seed in request.get("seeds", []):
            if not isinstance(seed, dict):
                continue
            if (str(seed.get("name", "")).casefold(), seed.get("kind")) == needle:
                return request.get("id")
    return requests[0]["id"] if len(requests) == 1 else None


def upsert_candidates(
    client: Client,
    run_id: str,
    requests: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> int:
    if not candidates:
        return 0

    rows = []
    for candidate in candidates:
        seed_name = candidate.get("name", "unknown")
        requested_kind = candidate.get("requested_kind", "artist")
        rows.append(
            {
                "run_id": run_id,
                "request_id": request_id_for_seed(seed_name, requested_kind, requests),
                "seed_name": seed_name,
                "requested_kind": requested_kind,
                "payload": candidate,
                "status": candidate.get("status", "review"),
                "confidence": candidate.get("confidence"),
                "reason": candidate.get("reason"),
            }
        )

    client.table("research_candidates").upsert(
        rows,
        on_conflict="run_id,seed_name,requested_kind",
    ).execute()
    return len(rows)
