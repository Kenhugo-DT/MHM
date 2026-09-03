"""Promote approved MHM research candidates into versioned graph additions."""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from process_inbox import CANDIDATES_DIR

BRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BRAIN_ROOT.parent
APPROVED_GRAPH_PATH = BRAIN_ROOT / "data" / "approved" / "graph.json"
BROWSER_GRAPH_PATH = REPO_ROOT / "site" / "public" / "data" / "graph.json"
PROMOTIONS_PATH = BRAIN_ROOT / "data" / "approved" / "promotions.json"
PATCH_DIR = BRAIN_ROOT / "data" / "approved" / "promotion-patches"
BLOCKED_ENTITIES_PATH = REPO_ROOT / "shared" / "graph-schema" / "blocked-entities.json"

ALLOWED_KINDS = {
    "band",
    "guitarist",
    "artist",
    "guitar",
    "guitar_brand",
    "genre",
}

NODE_LABELS = {
    "band": "Band",
    "guitarist": "Guitarist",
    "artist": "Artist",
    "guitar": "Guitar",
    "guitar_brand": "Guitar brand",
    "genre": "Genre",
}

ZONE_CENTERS = {
    "roots-blues": (-980, 20),
    "rock-circuit": (-240, -80),
    "psychedelia-prog": (40, -640),
    "hard-rock-metal": (760, 240),
    "folk-country-vise": (-640, 820),
    "guitar-workshop": (1180, 140),
    "guitar-genres": (-640, 120),
}

RELEASE_TERMS = {
    "album",
    "albums",
    "discography",
    "single",
    "singles",
    "song",
    "songs",
    "track",
    "tracks",
}

BORING_TERMS = {
    "articles",
    "births",
    "commons category",
    "deaths",
    "living people",
    "pages",
    "stub",
    "templates",
    "wikipedia",
}

CATEGORY_COLLECTION_TERMS = {
    "albums",
    "artists",
    "bands",
    "births",
    "deaths",
    "discographies",
    "genres",
    "guitarists",
    "members",
    "music groups",
    "musical groups",
    "musicians",
    "people",
    "record labels",
    "singers",
    "songwriters",
    "songs",
}

GENERIC_TOPIC_TERMS = {
    "all-female band",
    "artist",
    "bass guitar",
    "backup band",
    "band",
    "band (rock and pop)",
    "guitarist",
    "house band",
    "musician",
    "one-man band",
    "tribute band",
}

DISAMBIGUATION_PATTERN = re.compile(
    r"\s*\((?=[^)]*(?:artist|band|drummer|guitarist|music group|musician|singer))[^)]*\)\s*$",
    re.IGNORECASE,
)


def iso_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def now_stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n",
        encoding="utf-8",
    )


def normalize_text(text: str) -> str:
    return str(text).lower().replace("_", " ").strip()


def slugify(value: str) -> str:
    transliterated = (
        value.replace("Æ", "Ae")
        .replace("Ø", "O")
        .replace("Å", "A")
        .replace("æ", "ae")
        .replace("ø", "o")
        .replace("å", "a")
    )
    normalized = unicodedata.normalize("NFKD", transliterated)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug or "research-candidate"


def canonical_title(value: str) -> str:
    return DISAMBIGUATION_PATTERN.sub("", value).strip() or value.strip()


def display_title(value: str) -> str:
    canonical = canonical_title(value)
    return canonical if canonical != value.strip() else value.strip()


def title_keys(value: str) -> set[str]:
    return {
        normalize_text(value),
        normalize_text(canonical_title(value)),
    }


def add_node_to_indexes(
    node: dict[str, Any],
    node_by_id: dict[str, dict[str, Any]],
    label_index: dict[str, str],
) -> None:
    node_id = str(node.get("id", ""))
    if not node_id:
        return

    node_by_id[node_id] = node
    for value in [node.get("label"), *node.get("aliases", [])]:
        if not value:
            continue
        for key in title_keys(str(value)):
            label_index.setdefault(key, node_id)


def node_id_for_title(
    title: str,
    node_by_id: dict[str, dict[str, Any]],
    label_index: dict[str, str],
) -> str:
    for key in title_keys(title):
        indexed_id = label_index.get(key)
        if indexed_id and indexed_id in node_by_id:
            return indexed_id

    canonical_id = slugify(canonical_title(title))
    return canonical_id if canonical_id else slugify(title)


def load_blocked_terms() -> set[str]:
    payload = load_json(BLOCKED_ENTITIES_PATH, {"entities": []})
    terms: set[str] = set()
    for entity in payload.get("entities", []):
        entity_id = entity.get("id")
        if entity_id:
            terms.add(str(entity_id))
        terms.update(str(label) for label in entity.get("labels", []) if label)
    return {normalize_text(term) for term in terms if term}


def is_blocked(text: str, blocked_terms: set[str]) -> bool:
    normalized = normalize_text(text)
    return any(term in normalized for term in blocked_terms)


def graph_path() -> Path:
    return APPROVED_GRAPH_PATH if APPROVED_GRAPH_PATH.exists() else BROWSER_GRAPH_PATH


def source_provider(source: dict[str, Any]) -> str:
    url = str(source.get("url", ""))
    if source.get("provider"):
        return str(source["provider"])
    if "wikipedia.org" in url:
        return "wikipedia"
    if "wikidata.org" in url:
        return "wikidata"
    if "musicbrainz.org" in url:
        return "musicbrainz"
    return "other"


def normalize_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_sources: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for source in sources:
        url = str(source.get("url", "")).strip()
        if not url or url in seen_urls:
            continue
        normalized_sources.append(
            {
                "label": source.get("label") or source_provider(source).title(),
                "url": url,
                "provider": source_provider(source),
            }
        )
        seen_urls.add(url)
    return normalized_sources


def wikipedia_source(title: str, url: str | None = None, language: str = "en") -> dict[str, str]:
    return {
        "label": "Wikipedia",
        "url": url or f"https://{language}.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
        "provider": "wikipedia",
    }


def wikidata_source(match: dict[str, Any] | None) -> dict[str, str] | None:
    if not match or not match.get("id"):
        return None
    return {
        "label": "Wikidata",
        "url": f"https://www.wikidata.org/wiki/{match['id']}",
        "provider": "wikidata",
    }


def musicbrainz_source(match: dict[str, Any] | None) -> dict[str, str] | None:
    if not match or not match.get("id"):
        return None
    return {
        "label": "MusicBrainz",
        "url": f"https://musicbrainz.org/artist/{match['id']}",
        "provider": "musicbrainz",
    }


def compact_summary(text: str | None, fallback: str) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if not cleaned:
        return fallback
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    summary = " ".join(sentences[:2]).strip()
    return summary[:420].rsplit(" ", 1)[0].strip() + "..." if len(summary) > 420 else summary


def seed_sources(payload: dict[str, Any]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    wiki = payload.get("wikipedia") or {}
    if wiki.get("title") or wiki.get("url"):
        sources.append(wikipedia_source(wiki.get("title") or payload.get("name", ""), wiki.get("url")))
    wikidata = wikidata_source(payload.get("wikidata"))
    if wikidata:
        sources.append(wikidata)
    musicbrainz = musicbrainz_source(payload.get("musicbrainz"))
    if musicbrainz:
        sources.append(musicbrainz)
    return normalize_sources(sources)


def existing_graph() -> dict[str, Any]:
    return load_json(graph_path(), {"version": 1, "nodes": [], "edges": []})


def existing_maps(
    graph: dict[str, Any],
    promotions: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, str], set[str]]:
    node_by_id: dict[str, dict[str, Any]] = {}
    label_index: dict[str, str] = {}
    for node in graph.get("nodes", []):
        if node.get("id"):
            add_node_to_indexes(node, node_by_id, label_index)
    for node in promotions.get("nodes", []):
        if node.get("id"):
            add_node_to_indexes(node, node_by_id, label_index)
    edge_keys = {
        edge_key(edge)
        for edge in [*graph.get("edges", []), *promotions.get("edges", [])]
        if edge.get("source") and edge.get("target")
    }
    return node_by_id, label_index, edge_keys


def kind_roles(kind: str) -> list[str]:
    return ["guitarist", "artist"] if kind == "guitarist" else [kind]


def seed_node(
    payload: dict[str, Any],
    node_by_id: dict[str, dict[str, Any]],
    label_index: dict[str, str],
    blocked_terms: set[str],
) -> dict[str, Any] | None:
    name = payload.get("name") or payload.get("seed_name")
    kind = payload.get("requested_kind")
    if not name or kind not in ALLOWED_KINDS or is_blocked(name, blocked_terms):
        return None

    node_id = node_id_for_title(str(name), node_by_id, label_index)
    if node_id in node_by_id:
        return None

    zone = zone_for(str(name), kind, None)
    x, y = ZONE_CENTERS.get(zone, (0, 0))
    return {
        "id": node_id,
        "label": display_title(str(name)),
        "type": kind,
        "roles": kind_roles(kind),
        "summary": compact_summary(
            (payload.get("wikipedia") or {}).get("extract"),
            f"A {NODE_LABELS[kind].lower()} added from approved MHM research.",
        ),
        "metadata": [NODE_LABELS[kind], "Research brain"],
        "x": x,
        "y": y,
        "zone": zone,
        "starter": False,
        "sources": seed_sources(payload),
    }


def zone_for(title: str, kind: str, seed: dict[str, Any] | None) -> str:
    text = normalize_text(title)
    if kind in {"guitar", "guitar_brand"}:
        return "guitar-workshop"
    if any(term in text for term in ["metal", "doom", "thrash", "sabbath", "maiden", "priest"]):
        return "hard-rock-metal"
    if any(term in text for term in ["folk", "country", "vise", "bluegrass", "sunde"]):
        return "folk-country-vise"
    if any(term in text for term in ["blues", "soul", "gospel"]):
        return "roots-blues"
    if any(term in text for term in ["prog", "psychedelic", "art rock"]):
        return "psychedelia-prog"
    if seed and seed.get("zone"):
        return str(seed["zone"])
    return "rock-circuit"


def stable_number(value: str) -> int:
    total = 0
    for index, character in enumerate(value):
        total += (index + 17) * ord(character)
    return total


def placed_point(
    node_id: str,
    seed: dict[str, Any] | None,
    zone: str,
    offset_index: int,
    occupied: set[tuple[int, int]],
) -> tuple[float, float]:
    center_x, center_y = ZONE_CENTERS.get(zone, (0, 0))
    seed_x = float(seed.get("x", center_x)) if seed else center_x
    seed_y = float(seed.get("y", center_y)) if seed else center_y
    angle = (stable_number(node_id) % 360) * math.pi / 180
    radius = 170 + (offset_index % 5) * 45 + (stable_number(node_id[::-1]) % 35)

    for attempt in range(12):
        x = seed_x + math.cos(angle + attempt * 0.45) * (radius + attempt * 18)
        y = seed_y + math.sin(angle + attempt * 0.45) * (radius + attempt * 18)
        grid_point = (round(x / 70), round(y / 70))
        if grid_point not in occupied:
            occupied.add(grid_point)
            return round(x, 1), round(y, 1)

    return round(seed_x + radius, 1), round(seed_y + radius, 1)


def candidate_is_publishable(candidate: dict[str, Any], blocked_terms: set[str]) -> bool:
    title = str(candidate.get("title", "")).strip()
    kind = str(candidate.get("kind", "unknown")).strip()
    source = str(candidate.get("source", "")).strip()
    normalized = normalize_text(title)

    if not title or kind not in ALLOWED_KINDS or is_blocked(title, blocked_terms):
        return False
    if normalized.startswith("list of ") or (len(normalized) >= 4 and normalized[:4].isdigit()):
        return False
    if any(term in normalized for term in RELEASE_TERMS | BORING_TERMS):
        return False
    if normalized in GENERIC_TOPIC_TERMS or normalized.endswith(" genres"):
        return False
    if source == "category":
        if kind != "genre":
            return False
        if any(term in normalized for term in CATEGORY_COLLECTION_TERMS):
            return False
        if " by " in normalized or " from " in normalized:
            return False
    return True


def promoted_candidate_node(
    candidate: dict[str, Any],
    seed_payload: dict[str, Any],
    seed: dict[str, Any] | None,
    node_by_id: dict[str, dict[str, Any]],
    label_index: dict[str, str],
    occupied: set[tuple[int, int]],
    offset_index: int,
) -> dict[str, Any] | None:
    title = str(candidate["title"]).strip()
    node_id = node_id_for_title(title, node_by_id, label_index)
    if node_id in node_by_id:
        return None

    kind = str(candidate["kind"])
    zone = zone_for(title, kind, seed)
    x, y = placed_point(node_id, seed, zone, offset_index, occupied)
    seed_name = seed_payload.get("name") or seed_payload.get("seed_name") or "an approved seed"

    return {
        "id": node_id,
        "label": display_title(title),
        "type": kind,
        "roles": kind_roles(kind),
        "summary": f"A {NODE_LABELS[kind].lower()} surfaced by the MHM research brain from Wikipedia signals around {seed_name}.",
        "metadata": [NODE_LABELS[kind], "Research brain"],
        "x": x,
        "y": y,
        "zone": zone,
        "starter": False,
        "sources": [wikipedia_source(title)],
    }


def relation_type(source_node: dict[str, Any] | None, target_node: dict[str, Any] | None) -> str:
    source_type = source_node.get("type") if source_node else None
    target_type = target_node.get("type") if target_node else None
    if source_type == "genre" or target_type == "genre":
        return "associated_genre"
    if source_type == "guitar_brand" or target_type == "guitar_brand":
        return "made_by" if source_type == "guitar_brand" or target_type == "guitar" else "related"
    if source_type == "guitar" or target_type == "guitar":
        return "plays"
    return "related"


def edge_key(edge: dict[str, Any]) -> str:
    return "|".join(
        [
            str(edge.get("source", "")),
            str(edge.get("target", "")),
            str(edge.get("type", "")),
            str(edge.get("label", "")),
        ]
    )


def promoted_edge(
    seed_id: str,
    target_id: str,
    source_node: dict[str, Any] | None,
    target_node: dict[str, Any] | None,
    candidate: dict[str, Any],
    seed_payload: dict[str, Any],
) -> dict[str, Any] | None:
    if seed_id == target_id:
        return None
    edge_type = relation_type(source_node, target_node)
    signal = "category" if candidate.get("source") == "category" else "link"
    seed_wiki = seed_payload.get("wikipedia") or {}
    edge_id = f"brain-{seed_id}-{target_id}-{edge_type}"
    return {
        "id": edge_id,
        "source": seed_id,
        "target": target_id,
        "type": edge_type,
        "label": f"Wikipedia {signal} signal",
        "strength": 0.46 if signal == "link" else 0.38,
        "context": [str(candidate.get("reason") or f"Approved from {seed_payload.get('name')} research.")],
        "sources": [
            wikipedia_source(
                seed_wiki.get("title") or str(seed_payload.get("name") or ""),
                seed_wiki.get("url"),
            )
        ],
    }


def local_candidate_rows(limit: int, status: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(CANDIDATES_DIR.glob("*.json"), reverse=True):
        payload = load_json(path, {})
        for candidate in payload.get("candidates", []):
            if candidate.get("status", "review") != status:
                continue
            rows.append(
                {
                    "id": f"{path.stem}:{candidate.get('name', len(rows))}",
                    "run_id": payload.get("runId") or path.stem,
                    "request_id": None,
                    "seed_name": candidate.get("name"),
                    "requested_kind": candidate.get("requested_kind"),
                    "payload": candidate,
                    "status": candidate.get("status", "review"),
                }
            )
            if len(rows) >= limit:
                return rows
    return rows


def supabase_candidate_rows(limit: int, status: str) -> list[dict[str, Any]]:
    try:
        from supabase_brain import fetch_candidates, require_client
    except ModuleNotFoundError as error:
        raise SystemExit(
            f"Missing Python package '{error.name}'. Install with: "
            "python -m pip install -r brain/pipeline/requirements.txt"
        ) from error

    return fetch_candidates(require_client(), status=status, limit=limit)


def update_supabase_status(candidate_ids: list[str], status: str) -> None:
    if not candidate_ids:
        return
    from supabase_brain import require_client

    client = require_client()
    client.table("research_candidates").update({"status": status}).in_("id", candidate_ids).execute()


def load_candidate_rows(source: str, limit: int, status: str) -> tuple[str, list[dict[str, Any]]]:
    if source in {"supabase", "auto"}:
        try:
            rows = supabase_candidate_rows(limit, status)
            return "supabase", rows
        except SystemExit:
            if source == "supabase":
                raise
        except Exception as error:
            if source == "supabase":
                raise SystemExit(f"Could not fetch Supabase candidates: {error}") from error

    return "file", local_candidate_rows(limit, status)


def build_patch(
    rows: list[dict[str, Any]],
    max_new_nodes: int,
    max_per_seed: int,
) -> dict[str, Any]:
    graph = existing_graph()
    promotions = load_json(
        PROMOTIONS_PATH,
        {"version": 1, "generatedAt": None, "candidateRows": [], "nodes": [], "edges": []},
    )
    node_by_id, label_index, existing_edge_keys = existing_maps(graph, promotions)
    blocked_terms = load_blocked_terms()
    occupied = {
        (round(float(node.get("x", 0)) / 70), round(float(node.get("y", 0)) / 70))
        for node in node_by_id.values()
    }
    imported_rows = {str(item.get("id")) for item in promotions.get("candidateRows", [])}

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    consumed_rows: list[dict[str, Any]] = []

    for row in rows:
        row_id = str(row.get("id"))
        if row_id in imported_rows:
            skipped.append({"id": row_id, "reason": "already promoted"})
            continue

        payload = row.get("payload") or {}
        seed_label = str(payload.get("name") or row.get("seed_name") or "").strip()
        seed_id = node_id_for_title(seed_label, node_by_id, label_index)
        created_seed = seed_node(payload, node_by_id, label_index, blocked_terms)
        if created_seed:
            nodes.append(created_seed)
            add_node_to_indexes(created_seed, node_by_id, label_index)
            seed_id = created_seed["id"]

        seed = node_by_id.get(seed_id)
        if not seed:
            skipped.append({"id": row_id, "reason": f"seed node not found: {seed_label}"})
            continue

        per_seed_count = 0
        for candidate in payload.get("music_candidates", []):
            if len(nodes) >= max_new_nodes:
                break
            if per_seed_count >= max_per_seed:
                break
            if not candidate_is_publishable(candidate, blocked_terms):
                continue

            target_id = node_id_for_title(str(candidate["title"]), node_by_id, label_index)
            target_node = node_by_id.get(target_id)
            new_node = promoted_candidate_node(
                candidate,
                payload,
                seed,
                node_by_id,
                label_index,
                occupied,
                len(nodes),
            )
            if new_node:
                nodes.append(new_node)
                add_node_to_indexes(new_node, node_by_id, label_index)
                target_node = new_node
                per_seed_count += 1

            if not target_node:
                continue

            edge = promoted_edge(seed_id, target_id, seed, target_node, candidate, payload)
            if not edge:
                continue
            key = edge_key(edge)
            if key in existing_edge_keys:
                continue
            edges.append(edge)
            existing_edge_keys.add(key)

        consumed_rows.append(
            {
                "id": row_id,
                "runId": row.get("run_id"),
                "requestId": row.get("request_id"),
                "seedName": row.get("seed_name"),
                "requestedKind": row.get("requested_kind"),
            }
        )

    return {
        "version": 1,
        "generatedAt": iso_now(),
        "candidateRows": consumed_rows,
        "nodes": nodes,
        "edges": edges,
        "skipped": skipped,
    }


def merge_promotions(patch: dict[str, Any]) -> dict[str, Any]:
    promotions = load_json(
        PROMOTIONS_PATH,
        {
            "version": 1,
            "generatedAt": None,
            "source": "MHM research brain promotions",
            "candidateRows": [],
            "nodes": [],
            "edges": [],
        },
    )
    existing_node_ids = {node.get("id") for node in promotions.get("nodes", [])}
    existing_edge_keys = {edge_key(edge) for edge in promotions.get("edges", [])}
    existing_row_ids = {str(row.get("id")) for row in promotions.get("candidateRows", [])}

    promotions["generatedAt"] = iso_now()
    promotions.setdefault("source", "MHM research brain promotions")
    promotions.setdefault("candidateRows", [])
    promotions.setdefault("nodes", [])
    promotions.setdefault("edges", [])

    for row in patch.get("candidateRows", []):
        if str(row.get("id")) not in existing_row_ids:
            promotions["candidateRows"].append(row)
            existing_row_ids.add(str(row.get("id")))
    for node in patch.get("nodes", []):
        if node.get("id") not in existing_node_ids:
            promotions["nodes"].append(node)
            existing_node_ids.add(node.get("id"))
    for edge in patch.get("edges", []):
        key = edge_key(edge)
        if key not in existing_edge_keys:
            promotions["edges"].append(edge)
            existing_edge_keys.add(key)

    return promotions


def patch_summary(patch: dict[str, Any], source: str, status: str) -> dict[str, Any]:
    return {
        "source": source,
        "status": status,
        "candidateRows": len(patch.get("candidateRows", [])),
        "newNodes": len(patch.get("nodes", [])),
        "newEdges": len(patch.get("edges", [])),
        "skippedRows": patch.get("skipped", []),
        "nodePreview": [
            {
                "id": node["id"],
                "label": node["label"],
                "type": node["type"],
                "zone": node["zone"],
            }
            for node in patch.get("nodes", [])[:12]
        ],
        "edgePreview": [
            {
                "source": edge["source"],
                "target": edge["target"],
                "type": edge["type"],
                "label": edge["label"],
            }
            for edge in patch.get("edges", [])[:12]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["auto", "supabase", "file"], default="auto")
    parser.add_argument("--status", default="approved")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--max-new-nodes", type=int, default=40)
    parser.add_argument("--max-per-seed", type=int, default=6)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    source, rows = load_candidate_rows(args.source, args.limit, args.status)
    patch = build_patch(rows, args.max_new_nodes, args.max_per_seed)

    if args.dry_run:
        print(json.dumps(patch_summary(patch, source, args.status), ensure_ascii=False, indent=2))
        return

    if args.apply:
        promotions = merge_promotions(patch)
        write_json(PROMOTIONS_PATH, promotions)
        if source == "supabase":
            update_supabase_status(
                [row["id"] for row in patch.get("candidateRows", [])],
                "imported",
            )
        print(
            json.dumps(
                {
                    **patch_summary(patch, source, args.status),
                    "updated": str(PROMOTIONS_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
                    "supabaseStatus": "imported" if source == "supabase" else "unchanged",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    PATCH_DIR.mkdir(parents=True, exist_ok=True)
    patch_path = PATCH_DIR / f"promotion-patch-{now_stamp()}.json"
    write_json(patch_path, patch)
    print(
        json.dumps(
            {
                **patch_summary(patch, source, args.status),
                "patch": str(patch_path.relative_to(REPO_ROOT)).replace("\\", "/"),
                "nextStep": "Review the patch, then run npm run brain:promote:apply.",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
