"""Inspect bounded Wikidata claims and submit cited leads for human review."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from collections import Counter, defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

import requests

from fact_coverage import FACT_TYPES
from fact_scout import BLOCKED_PATH, CURATED_PATH, all_rows, near_duplicate, wikipedia_title

API_URL = "https://www.wikidata.org/w/api.php"
QID = re.compile(r"Q[1-9][0-9]*")
MAX_LOOKUP = 20
MAX_PROPOSALS = 5
RETRY_STATUSES = {429, 503}


def wikidata_qid(sources: list[dict]) -> str | None:
    for source in sources or []:
        raw = source.get("url") if isinstance(source, dict) else None
        if not isinstance(raw, str):
            continue
        url = urlparse(raw)
        if url.scheme == "https" and url.hostname in {"www.wikidata.org", "wikidata.org"}:
            match = QID.fullmatch(url.path.removeprefix("/wiki/")) if url.path.startswith("/wiki/") else None
            if match:
                return match.group()
    return None


def eligible_entities(entities: list[dict], facts: list[dict], curated: list[dict]) -> list[dict]:
    blocked = {row["id"] for row in json.loads(BLOCKED_PATH.read_text(encoding="utf-8"))["entities"]}
    occupied = Counter(row["entity_id"] for row in facts if row["status"] in {"review", "approved"})
    occupied.update(row["entityId"] for row in curated)
    grouped = defaultdict(list)
    for entity in entities:
        if (entity["id"] not in blocked and entity["node_type"] in FACT_TYPES and occupied[entity["id"]] < 2
                and wikidata_qid(entity.get("sources")) and wikipedia_title(entity.get("sources"))):
            grouped[entity.get("map_zone") or "unplaced"].append(entity)
    by_zone = {zone: deque(sorted(group, key=lambda row: (occupied[row["id"]], row["id"])))
               for zone, group in grouped.items()}
    ordered = []
    while any(by_zone.values()):
        for zone in sorted(by_zone):
            if by_zone[zone]:
                ordered.append(by_zone[zone].popleft())
    return ordered


def fetch_entities(session: requests.Session, qids: list[str]) -> dict:
    if not qids:
        return {}
    params = {
        "action": "wbgetentities", "format": "json", "ids": "|".join(sorted(set(qids))),
        "props": "labels|claims|sitelinks", "languages": "en", "sitefilter": "enwiki", "maxlag": 5,
    }
    for attempt in range(3):
        response = session.get(API_URL, params=params, timeout=25)
        if response.status_code in RETRY_STATUSES and attempt < 2:
            retry_after = response.headers.get("Retry-After", "1")
            time.sleep(min(int(retry_after), 5) if retry_after.isdigit() else 1)
            continue
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            raise ValueError(payload["error"].get("code", "Wikidata API error"))
        return payload.get("entities", {})
    raise RuntimeError("Wikidata retry limit exceeded")


def identity_matches(entity: dict, item: dict) -> bool:
    expected = wikipedia_title(entity.get("sources", []))
    actual = item.get("sitelinks", {}).get("enwiki", {}).get("title")
    return bool(expected and actual and expected.replace("_", " ").casefold() == actual.replace("_", " ").casefold())


def external_references(statement: dict) -> list[str]:
    urls = []
    for reference in statement.get("references", []):
        for snak in reference.get("snaks", {}).get("P854", []):
            raw = snak.get("datavalue", {}).get("value")
            if not isinstance(raw, str):
                continue
            url = urlparse(raw)
            host = (url.hostname or "").lower()
            if (url.scheme == "https" and host and host not in {"wikidata.org", "www.wikidata.org"}
                    and not host.endswith(".wikipedia.org") and not host.endswith(".wikimedia.org")
                    and raw not in urls):
                urls.append(raw)
    return urls[:2]


def claim_leads(entity: dict, item: dict, targets: dict) -> list[dict]:
    label = entity["label"]
    leads = []
    for statement in item.get("claims", {}).get("P138", []):
        value = statement.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        target_id = value.get("id") if isinstance(value, dict) else None
        target = targets.get(target_id, {})
        target_label = target.get("labels", {}).get("en", {}).get("value")
        if target_label and target_label.casefold() != label.casefold():
            leads.append({
                "category": "name-origin", "statementId": statement.get("id"),
                "text": f"The name {label} was taken from {target_label}.",
                "references": external_references(statement),
            })
    if entity["node_type"] in {"artist", "guitarist"}:
        for statement in item.get("claims", {}).get("P1477", []):
            value = statement.get("mainsnak", {}).get("datavalue", {}).get("value", {})
            birth_name = value.get("text") if isinstance(value, dict) else None
            if birth_name and not set(label.casefold().split()) <= set(birth_name.casefold().split()):
                leads.append({
                    "category": "birth-name", "statementId": statement.get("id"),
                    "text": f"{label} was born under the name {birth_name}.",
                    "references": external_references(statement),
                })
    return [lead for lead in leads if lead["statementId"] and 35 <= len(lead["text"]) <= 200]


def scout(client, *, publish: bool, limit: int, max_lookup: int,
          target_ids: set[str] | None = None, offset: int = 0,
          session: requests.Session | None = None) -> dict:
    if not 1 <= limit <= MAX_PROPOSALS or not 1 <= max_lookup <= MAX_LOOKUP or offset < 0:
        raise ValueError(f"Limit must be 1-{MAX_PROPOSALS}, max_lookup 1-{MAX_LOOKUP}, offset nonnegative.")
    entities = all_rows(client, "entities", "id,label,node_type,sources,map_zone")
    facts = all_rows(client, "entity_facts", "id,entity_id,status,source_fingerprint,text")
    curated = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
    selected = eligible_entities(entities, facts, curated)
    if target_ids:
        selected = [entity for entity in selected if entity["id"] in target_ids]
    selected = selected[offset:offset + max_lookup]
    known = defaultdict(set)
    existing_text = defaultdict(list)
    for fact in facts:
        known[fact["entity_id"]].add(fact["source_fingerprint"])
        if fact["status"] in {"review", "approved"}:
            existing_text[fact["entity_id"]].append(fact["text"])
    for fact in curated:
        existing_text[fact["entityId"]].append(fact["text"])

    session = session or requests.Session()
    session.headers["User-Agent"] = "MusicHistoryMap/0.1 (fact review; https://kenhugo-dt.github.io/MHM/)"
    result = {"mode": "publish" if publish else "dry-run", "lookups": len(selected), "offset": offset,
              "identityMismatches": [], "researchLeads": [], "reviewProposals": [], "sourceErrors": []}
    if not selected:
        return result
    try:
        items = fetch_entities(session, [wikidata_qid(entity["sources"]) for entity in selected])
        valid = []
        for entity in selected:
            qid = wikidata_qid(entity["sources"])
            item = items.get(qid, {})
            if not identity_matches(entity, item):
                result["identityMismatches"].append({
                    "entity_id": entity["id"], "qid": qid,
                    "expected": wikipedia_title(entity["sources"]),
                    "actual": item.get("sitelinks", {}).get("enwiki", {}).get("title"),
                })
            else:
                valid.append((entity, item, qid))
        target_ids_to_fetch = []
        for _, item, _ in valid:
            for statement in item.get("claims", {}).get("P138", []):
                value = statement.get("mainsnak", {}).get("datavalue", {}).get("value", {})
                target_id = value.get("id") if isinstance(value, dict) else None
                if target_id and QID.fullmatch(target_id):
                    target_ids_to_fetch.append(target_id)
        target_ids_to_fetch = list(dict.fromkeys(target_ids_to_fetch))[:50]
        targets = fetch_entities(session, target_ids_to_fetch) if target_ids_to_fetch else {}
        for entity, item, qid in valid:
            for lead in claim_leads(entity, item, targets):
                fingerprint = hashlib.sha256(f"{qid}\n{lead['statementId']}".encode()).hexdigest()
                if fingerprint in known[entity["id"]] or near_duplicate(lead["text"], existing_text[entity["id"]]):
                    continue
                report = {"entity_id": entity["id"], "category": lead["category"],
                          "text": lead["text"], "wikidata": f"https://www.wikidata.org/wiki/{qid}",
                          "externalReferences": lead["references"]}
                if not lead["references"]:
                    result["researchLeads"].append(report)
                    continue
                if len(result["reviewProposals"]) >= limit:
                    continue
                proposal = {
                    "entity_id": entity["id"], "text": lead["text"],
                    "tags": ["music-history", f"scout-{lead['category']}"],
                    "sources": [{"label": "Wikidata", "url": report["wikidata"]}]
                    + [{"label": "Claim reference", "url": url} for url in lead["references"]],
                    "evidence": f"Wikidata statement {lead['statementId']}; verify the linked reference supports this exact wording.",
                    "status": "review", "source_fingerprint": fingerprint,
                }
                if publish:
                    client.table("entity_facts").insert(proposal).execute()
                result["reviewProposals"].append(report)
                known[entity["id"]].add(fingerprint)
                existing_text[entity["id"]].append(lead["text"])
    except (requests.RequestException, ValueError, KeyError) as error:
        result["sourceErrors"].append(str(error))
    return result


def main() -> None:
    from supabase_brain import require_client

    parser = argparse.ArgumentParser(description="Bounded Wikidata fact lead pilot; never auto-approves.")
    parser.add_argument("--publish", action="store_true", help="Write cited leads to private review only.")
    parser.add_argument("--limit", type=int, default=3, help="Maximum review proposals per run.")
    parser.add_argument("--max-lookup", type=int, default=12, help="Maximum nodes per run (hard cap: 20).")
    parser.add_argument("--offset", type=int, default=0, help="Skip this many eligible nodes for another pilot batch.")
    parser.add_argument("--entity", action="append", help="Restrict to an eligible node ID; repeatable.")
    args = parser.parse_args()
    if not 1 <= args.limit <= MAX_PROPOSALS or not 1 <= args.max_lookup <= MAX_LOOKUP or args.offset < 0:
        parser.error("--limit must be 1-5, --max-lookup 1-20 and --offset nonnegative.")
    result = scout(require_client(), publish=args.publish, limit=args.limit,
                   max_lookup=args.max_lookup, target_ids=set(args.entity) if args.entity else None,
                   offset=args.offset)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
