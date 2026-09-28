"""Snapshot approved, sourced facts for the local learning model."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "brain" / "data" / "approved" / "fact-evidence.json"
PAGE_SIZE = 500
COLUMNS = "id,entity_id,text,tags,sources,source_fingerprint,status,verified_at"


def approved_rows(client) -> list[dict]:
    rows = []
    cursor = None
    while True:
        query = (client.table("entity_facts").select(COLUMNS)
                 .eq("status", "approved").order("id").limit(PAGE_SIZE))
        if cursor is not None:
            query = query.gt("id", cursor)
        page = list(query.execute().data or [])
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        if page[-1]["id"] == cursor:
            raise ValueError("Approved fact pagination did not advance.")
        cursor = page[-1]["id"]


def build_snapshot(rows: list[dict], synced_at: str) -> dict:
    facts = []
    seen = set()
    for row in rows:
        if row.get("status") != "approved":
            raise ValueError("Non-approved fact in an approved snapshot.")
        entity_id = row.get("entity_id")
        fingerprint = row.get("source_fingerprint")
        text = row.get("text")
        sources = row.get("sources")
        if not all(isinstance(value, str) and value.strip()
                   for value in (entity_id, fingerprint, text)):
            raise ValueError("Approved fact lacks entity, fingerprint or text.")
        if not isinstance(sources, list) or not sources:
            raise ValueError(f"Approved fact for {entity_id} has no sources.")
        if not all(isinstance(source, dict) and
                   isinstance(source.get("label"), str) and source["label"].strip() and
                   isinstance(source.get("url"), str) and
                   urlparse(source["url"]).scheme == "https" and
                   urlparse(source["url"]).hostname
                   for source in sources):
            raise ValueError(f"Approved fact for {entity_id} has an invalid source.")
        key = (entity_id, fingerprint)
        if key in seen:
            raise ValueError(f"Duplicate approved fingerprint for {entity_id}.")
        seen.add(key)
        facts.append({
            "entityId": entity_id,
            "text": text,
            "tags": row.get("tags") or [],
            "sources": [{"label": source["label"], "url": source["url"]} for source in sources],
            "sourceFingerprint": fingerprint,
            "verifiedAt": row.get("verified_at"),
        })
    facts.sort(key=lambda fact: (fact["entityId"], fact["sourceFingerprint"]))
    return {
        "version": 1,
        "source": "Supabase public.entity_facts; approved rows only",
        "syncedAt": synced_at,
        "facts": facts,
    }


def main() -> None:
    from supabase_brain import require_client

    rows = approved_rows(require_client())
    snapshot = build_snapshot(rows, datetime.now(UTC).isoformat().replace("+00:00", "Z"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(json.dumps({
        "approvedFacts": len(snapshot["facts"]),
        "coveredNodes": len({fact["entityId"] for fact in snapshot["facts"]}),
        "snapshot": str(OUTPUT.relative_to(ROOT)),
        "syncedAt": snapshot["syncedAt"],
    }, indent=2))


if __name__ == "__main__":
    main()
