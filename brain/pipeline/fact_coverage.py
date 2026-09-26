"""Report source-backed fact coverage across the live map."""

from __future__ import annotations

import json
from collections import Counter
from urllib.parse import urlparse

from fact_scout import BLOCKED_PATH, CURATED_PATH, all_rows

FACT_TYPES = {"band", "artist", "guitarist", "genre", "guitar", "guitar_brand"}
SOURCE_HOSTS = {
    "en.wikipedia.org": "wikipedia",
    "www.wikidata.org": "wikidata",
    "wikidata.org": "wikidata",
    "musicbrainz.org": "musicbrainz",
    "www.musicbrainz.org": "musicbrainz",
}


def research_sources(sources: list[dict] | None) -> list[str]:
    providers = set()
    for source in sources or []:
        if not isinstance(source, dict):
            continue
        raw_url = source.get("url")
        if not isinstance(raw_url, str):
            continue
        try:
            url = urlparse(raw_url)
        except ValueError:
            continue
        if url.scheme == "https":
            provider = SOURCE_HOSTS.get(url.hostname)
            if provider:
                providers.add(provider)
    return sorted(providers)


def coverage(entities: list[dict], facts: list[dict], curated: list[dict], blocked: set[str]) -> dict:
    covered = {row["entity_id"] for row in facts if row["status"] == "approved"}
    covered.update(row["entityId"] for row in curated)
    by_type: dict[str, Counter] = {}
    by_zone: dict[str, Counter] = {}
    by_source: dict[str, Counter] = {provider: Counter() for provider in set(SOURCE_HOSTS.values())}
    missing = []

    for entity in entities:
        entity_id = entity["id"]
        node_type = entity["node_type"]
        if entity_id in blocked or node_type not in FACT_TYPES:
            continue
        zone = entity.get("map_zone") or "unplaced"
        has_fact = entity_id in covered
        available_sources = research_sources(entity.get("sources"))
        for group, key in ((by_type, node_type), (by_zone, zone)):
            group.setdefault(key, Counter())["total"] += 1
            group[key]["covered"] += has_fact
        for provider in available_sources:
            by_source[provider]["total"] += 1
            by_source[provider]["uncovered"] += not has_fact
        if not has_fact:
            missing.append({
                "id": entity_id, "label": entity["label"], "type": node_type,
                "zone": zone, "researchSources": available_sources,
            })

    missing.sort(key=lambda row: (
        by_zone[row["zone"]]["covered"] / by_zone[row["zone"]]["total"],
        row["zone"], row["type"], row["label"].casefold(),
    ))
    total = sum(counts["total"] for counts in by_type.values())
    return {
        "total": total,
        "covered": total - len(missing),
        "missing": len(missing),
        "byType": {key: dict(value) for key, value in sorted(by_type.items())},
        "byZone": {key: dict(value) for key, value in sorted(by_zone.items())},
        "byResearchSource": {key: dict(value) for key, value in sorted(by_source.items())},
        "nextUncovered": missing[:30],
    }


def main() -> None:
    from supabase_brain import require_client

    client = require_client()
    entities = all_rows(client, "entities", "id,label,node_type,map_zone,sources")
    facts = all_rows(client, "entity_facts", "id,entity_id,status")
    curated = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
    blocked = {row["id"] for row in json.loads(BLOCKED_PATH.read_text(encoding="utf-8"))["entities"]}
    print(json.dumps(coverage(entities, facts, curated, blocked), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
