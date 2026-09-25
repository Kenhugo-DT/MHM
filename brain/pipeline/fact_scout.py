"""Propose source-backed fact leads for human review, never auto-publish them."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict, deque
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests

ROOT = Path(__file__).resolve().parents[2]
CURATED_PATH = ROOT / "shared" / "facts" / "curated.json"
BLOCKED_PATH = ROOT / "shared" / "graph-schema" / "blocked-entities.json"
API_URL = "https://en.wikipedia.org/w/api.php"
NAME_ORIGIN = re.compile(
    r"\b(originally known as|previously known as|originally called|"
    r"named after|named for|name from|name came from|name derives from|"
    r"name is derived from|name was taken from|took (?:their|its|his|her) name from|"
    r"began as|started as)\b",
    re.IGNORECASE,
)
NAME_CONTEXT = re.compile(r"\b(?:band|group)(?:'s)? name\b.*\b(?:after|from|derived|inspired|suggested|chose|coined|adopted)\b", re.I)
RULES = (
    ("name-origin", 5, None),
    ("instrument-story", 4, re.compile(
        r"\b(?:built|constructed|made|designed|modified)\b.{0,85}\b(?:guitar|instrument)\b|"
        r"\b(?:guitar|instrument)\b.{0,85}\b(?:built|constructed|made|designed|modified)\b", re.I)),
    ("playing-technique", 5, re.compile(
        r"\b(?:lost|burned|injured|damaged)\b.{0,90}\b(?:finger|hand|fingertip)s?\b|"
        r"\b(?:finger|hand|fingertip)s?\b.{0,90}\b(?:lost|burned|injured|damaged)\b|"
        r"\b(?:retaught himself|relearned)\b.{0,80}\b(?:guitar|play)\b", re.I)),
    ("stage-identity", 4, re.compile(
        r"\b(?:wore|wearing|adopted|used|designed|created|tried)\b.{0,85}"
        r"\b(?:costume|mask|uniform|stage persona|makeup|make-up|face paint)s?\b", re.I)),
    ("recording-story", 4, re.compile(
        r"\b(?:recorded|mixed|tracked)\b.{0,100}"
        r"(?:\b(?:\d+|one|two|three|four|five|six|seven)\s+(?:hours|days|weeks)\b|"
        r"\b(?:in|at|inside)\s+(?:(?:a|the|his|their)\s+)?(?:basement|garage|bedroom|makeshift)\b)", re.I)),
    ("performance-story", 4, re.compile(
        r"\b(?:performed|played|concert|show|tour)\b.{0,110}"
        r"\b(?:headphones|antarctica|aircraft|boeing|prison|rooftop|satellite|hospital|ship)\b", re.I)),
    ("cover-story", 4, re.compile(
        r"\b(?:cover art|album cover|artwork)\b.{0,100}"
        r"\b(?:created|designed|photograph|featured|inflatable|painted)\b", re.I)),
)
SUPERLATIVE = re.compile(r"\b(first|only|largest|most|oldest|youngest)\b", re.I)
SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")
WORD = re.compile(r"[a-z0-9]+", re.I)
PAGE_SIZE = 1000


def all_rows(client, table: str, columns: str, order_column: str = "id") -> list[dict]:
    rows: list[dict] = []
    cursor = None
    while True:
        query = client.table(table).select(columns).order(order_column).limit(PAGE_SIZE)
        if cursor is not None:
            query = query.gt(order_column, cursor)
        page = list(query.execute().data or [])
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        cursor = page[-1][order_column]


def wikipedia_title(sources: list[dict]) -> str | None:
    for source in sources or []:
        url = urlparse(source.get("url", ""))
        if url.scheme == "https" and url.hostname == "en.wikipedia.org" and url.path.startswith("/wiki/"):
            return unquote(url.path.removeprefix("/wiki/")).replace("_", " ")
    return None


def feedback_bias(facts: list[dict]) -> dict[str, int]:
    decisions: dict[str, Counter] = defaultdict(Counter)
    for fact in facts:
        if fact["status"] not in {"approved", "rejected"}:
            continue
        for tag in fact.get("tags") or []:
            if tag.startswith("scout-"):
                decisions[tag.removeprefix("scout-")][fact["status"]] += 1
    return {
        category: round(2 * (counts["approved"] - counts["rejected"]) / sum(counts.values()))
        for category, counts in decisions.items() if sum(counts.values()) >= 3
    }


def near_duplicate(text: str, existing: list[str]) -> bool:
    words = set(WORD.findall(text.casefold()))
    for previous in existing:
        other = set(WORD.findall(previous.casefold()))
        if words and other and len(words & other) / len(words | other) >= 0.64:
            return True
    return False


def candidate_leads(label: str, node_type: str, extract: str,
                    bias: dict[str, int] | None = None, used_categories: set[str] | None = None) -> list[dict]:
    named_subject = re.compile(rf"(?<!\w){re.escape(label)}(?:'s)?(?!\w)", re.I)
    surname = label.split()[-1] if node_type in {"artist", "guitarist"} else ""
    surname_subject = re.compile(
        rf"(?<!\w){re.escape(surname)}(?!\w)(?=\s+(?:was|were|is|are|had|has|lost|built|recorded|"
        r"tried|retaught|named|created|designed|modified|performed|played|wore|used|adopted|"
        r"made|started|began|took|relearned)\b)"
    ) if len(surname) >= 4 else None
    band_subject = re.compile(r"^(?:the band|the group)(?:'s)?\b", re.I)
    band_name = re.compile(r"\b(?:the band|the group)(?:'s)? name\b", re.I)
    used_categories = used_categories or set()
    leads = []
    for index, sentence in enumerate(SENTENCE_BOUNDARY.split(re.sub(r"\s+", " ", extract[:32000]).strip())):
        sentence = sentence.strip()
        if not 35 <= len(sentence) <= 200 or len(sentence.split()) > 36 or SUPERLATIVE.search(sentence):
            continue
        full_name = named_subject.search(sentence)
        name_match = full_name or (surname_subject.search(sentence) if surname_subject else None)
        named = bool(name_match and name_match.start() < 40)
        band_context = node_type == "band" and index < 30
        if not named and not (band_context and (band_subject.search(sentence) or band_name.search(sentence))):
            continue
        for category, base_score, pattern in RULES:
            matches = (NAME_ORIGIN.search(sentence) or NAME_CONTEXT.search(sentence)) if category == "name-origin" else pattern.search(sentence)
            if not matches or (node_type != "band" and re.search(r"\bthe band(?:'s)? name\b", sentence, re.I)):
                continue
            if category == "name-origin" and re.search(r"\bborn\b", sentence[:80], re.I):
                continue
            if not named and not band_subject.search(sentence) and category != "name-origin":
                continue
            if category == "recording-story" and name_match and re.match(
                r"\s+was\s+(?:recorded|mixed|tracked)\b", sentence[name_match.end():], re.I
            ):
                continue
            if named and matches.start() < name_match.start() and not (
                band_context and category == "name-origin" and band_name.search(sentence)
            ):
                continue
            score = base_score + (2 if full_name else 1 if named else 0) + (1 if len(sentence) >= 70 else 0)
            score += (bias or {}).get(category, 0) - (2 if category in used_categories else 0)
            if score >= 5:
                leads.append({"category": category, "evidence": sentence, "score": score, "order": index})
    return sorted(leads, key=lambda lead: (-lead["score"], lead["order"]))


def fetch_article(session: requests.Session, title: str) -> tuple[str, str]:
    response = session.get(
        API_URL,
        params={
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "redirects": 1,
            "prop": "extracts|info",
            "inprop": "url",
            "explaintext": 1,
            "titles": title,
        },
        timeout=25,
    )
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", [])
    page = pages[0] if pages else {}
    if page.get("missing") or not page.get("fullurl"):
        return "", ""
    return page.get("extract", ""), page["fullurl"]


def eligible_entities(entities: list[dict], facts: list[dict], attempts: list[dict], curated: list[dict], now: datetime) -> list[dict]:
    blocked = {row["id"] for row in json.loads(BLOCKED_PATH.read_text(encoding="utf-8"))["entities"]}
    occupied = Counter(fact["entity_id"] for fact in facts if fact["status"] in {"review", "approved"})
    occupied.update(fact["entityId"] for fact in curated)
    attempted = {row["entity_id"]: row for row in attempts}
    eligible = []
    for entity in entities:
        if entity["id"] in blocked:
            continue
        if entity["node_type"] not in {"band", "artist", "guitarist"}:
            continue
        if occupied[entity["id"]] >= 2 or not wikipedia_title(entity.get("sources", [])):
            continue
        previous = attempted.get(entity["id"])
        retry_days = 1 if previous and previous["outcome"] == "source_error" else 30
        if previous and datetime.fromisoformat(previous["attempted_at"].replace("Z", "+00:00")) > now - timedelta(days=retry_days):
            continue
        eligible.append(entity)
    zone_population = Counter((row.get("map_zone") or "unplaced") for row in entities)
    zone_facts = Counter()
    for row in entities:
        zone_facts[row.get("map_zone") or "unplaced"] += occupied[row["id"]]
    grouped: dict[str, list[dict]] = defaultdict(list)
    for entity in eligible:
        grouped[entity.get("map_zone") or "unplaced"].append(entity)
    by_zone = {
        zone: deque(sorted(group, key=lambda row: (occupied[row["id"]], not row.get("starter", False), row["id"])))
        for zone, group in grouped.items()
    }
    zones = sorted(by_zone, key=lambda zone: (zone_facts[zone] / zone_population[zone], zone))
    ordered = []
    while any(by_zone.values()):
        for zone in zones:
            if by_zone[zone]:
                ordered.append(by_zone[zone].popleft())
    return ordered


def scout(client, *, publish: bool, limit: int, max_lookup: int,
          target_ids: set[str] | None = None) -> dict:
    entities = all_rows(client, "entities", "id,label,node_type,sources,starter,map_zone")
    facts = all_rows(client, "entity_facts", "id,entity_id,status,source_fingerprint,text,tags")
    attempts = all_rows(client, "fact_scout_attempts", "entity_id,attempted_at,outcome", "entity_id")
    curated = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
    known = defaultdict(set)
    existing_text = defaultdict(list)
    used_categories = defaultdict(set)
    for fact in facts:
        known[fact["entity_id"]].add(fact["source_fingerprint"])
        if fact["status"] in {"review", "approved"}:
            existing_text[fact["entity_id"]].append(fact["text"])
            used_categories[fact["entity_id"]].update(
                tag.removeprefix("scout-") for tag in fact.get("tags") or [] if tag.startswith("scout-")
            )
    for fact in curated:
        existing_text[fact["entityId"]].append(fact["text"])
    bias = feedback_bias(facts)
    targets = eligible_entities(entities, facts, attempts, curated, datetime.now(UTC))
    if target_ids:
        targets = [entity for entity in targets if entity["id"] in target_ids]
    session = requests.Session()
    session.headers["User-Agent"] = "MusicHistoryMap/0.1 (fact review; https://kenhugo-dt.github.io/MHM/)"
    proposals = []
    checked = []
    looked_up = 0
    errors = []

    for entity in targets:
        if looked_up >= max_lookup or len(proposals) >= limit:
            break
        looked_up += 1
        outcome = "no_match"
        try:
            extract, url = fetch_article(session, wikipedia_title(entity["sources"]))
            checked.append({"entity_id": entity["id"], "article_characters": len(extract)})
            if url:
                for lead in candidate_leads(entity["label"], entity["node_type"], extract, bias, used_categories[entity["id"]]):
                    evidence = lead["evidence"]
                    fingerprint = hashlib.sha256(f"{url}\n{evidence.casefold()}".encode()).hexdigest()
                    if fingerprint in known[entity["id"]] or near_duplicate(evidence, existing_text[entity["id"]]):
                        continue
                    proposal = {
                        "entity_id": entity["id"],
                        "text": evidence,
                        "tags": ["music-history", f"scout-{lead['category']}"],
                        "sources": [{"label": "Wikipedia", "url": url}],
                        "evidence": evidence,
                        "status": "review",
                        "source_fingerprint": fingerprint,
                    }
                    if publish:
                        client.table("entity_facts").insert(proposal).execute()
                    proposals.append({"entity_id": entity["id"], "category": lead["category"],
                                      "score": lead["score"], "text": evidence, "source": url})
                    outcome = "proposed"
                    break
        except (requests.RequestException, ValueError, KeyError) as error:
            outcome = "source_error"
            errors.append({"entity_id": entity["id"], "error": str(error)})

        if publish:
            client.table("fact_scout_attempts").upsert(
                {"entity_id": entity["id"], "attempted_at": datetime.now(UTC).isoformat(), "outcome": outcome},
                on_conflict="entity_id",
            ).execute()

    return {
        "mode": "publish" if publish else "dry-run",
        "extractor": "source-patterns",
        "feedbackBias": bias,
        "lookups": looked_up,
        "checked": checked,
        "proposals": proposals,
        "sourceErrors": errors,
    }


def main() -> None:
    from supabase_brain import require_client

    parser = argparse.ArgumentParser(description="Scout fact leads for the private review queue.")
    parser.add_argument("--publish", action="store_true", help="Write review proposals to Supabase.")
    parser.add_argument("--limit", type=int, default=3, help="Maximum proposals per run.")
    parser.add_argument("--max-lookup", type=int, default=12, help="Maximum article lookups per run.")
    parser.add_argument("--entity", action="append", help="Restrict this run to an eligible entity ID; repeat for more.")
    args = parser.parse_args()
    if args.limit < 1 or args.max_lookup < 1:
        parser.error("Limits must be positive.")
    result = scout(require_client(), publish=args.publish, limit=args.limit, max_lookup=args.max_lookup,
                   target_ids=set(args.entity) if args.entity else None)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
