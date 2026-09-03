"""Run the MHM research scout agent.

The scout agent is the orchestration layer around the private brain. It reads
the current approved graph, looks for useful frontier seeds, queues research
requests when needed and can process queued work through the existing inbox
pipeline.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from process_inbox import INBOX_PATH, iso_now, load_inbox, queued_requests, slugify

BRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BRAIN_ROOT.parent
APPROVED_GRAPH_PATH = BRAIN_ROOT / "data" / "approved" / "graph.json"
BROWSER_GRAPH_PATH = REPO_ROOT / "site" / "public" / "data" / "graph.json"
BLOCKED_ENTITIES_PATH = REPO_ROOT / "shared" / "graph-schema" / "blocked-entities.json"
RUNS_DIR = BRAIN_ROOT / "data" / "runs"

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BRAIN_ROOT / ".env")
load_dotenv(Path(__file__).with_name(".env"))

ALLOWED_KINDS = {
    "band",
    "guitarist",
    "artist",
    "guitar",
    "guitar_brand",
    "genre",
}

TYPE_PRIORITY = {
    "guitarist": 10,
    "artist": 9,
    "band": 8,
    "genre": 7,
    "guitar": 6,
    "guitar_brand": 5,
}

ZONE_HINTS = {
    "roots-blues": "roots, blues and early amplified guitar history",
    "rock-circuit": "rock, blues-rock and classic band connections",
    "psychedelia-prog": "psychedelia, art rock and progressive guitar history",
    "hard-rock-metal": "hard rock, metal, riff culture and heavier guitar history",
    "folk-country-vise": "folk, country, singer-songwriter and Norwegian vise traditions",
    "guitar-workshop": "guitar models, makers and instrument history",
    "guitar-genres": "genres connected to guitar models and brands",
}


def print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def graph_path() -> Path:
    if APPROVED_GRAPH_PATH.exists():
        return APPROVED_GRAPH_PATH
    return BROWSER_GRAPH_PATH


def normalize_text(text: Any) -> str:
    return str(text).casefold().replace("_", " ").strip()


def load_blocked_terms() -> set[str]:
    if not BLOCKED_ENTITIES_PATH.exists():
        return set()
    payload = load_json(BLOCKED_ENTITIES_PATH)
    terms: set[str] = set()
    for entity in payload.get("entities", []):
        entity_id = entity.get("id")
        if entity_id:
            terms.add(entity_id)
        terms.update(entity.get("labels", []))
    return {normalize_text(term) for term in terms if term}


def has_blocked_term(value: Any, blocked_terms: set[str]) -> bool:
    normalized = normalize_text(value)
    if not normalized:
        return False
    return any(term in normalized for term in blocked_terms)


def node_has_blocked_signal(node: dict[str, Any], blocked_terms: set[str]) -> bool:
    fields: list[Any] = [
        node.get("id", ""),
        node.get("label", ""),
        node.get("summary", ""),
        *(node.get("aliases") or []),
        *(node.get("metadata") or []),
        *(node.get("roles") or []),
    ]
    return any(has_blocked_term(field, blocked_terms) for field in fields)


def request_kind_for_node(node: dict[str, Any]) -> str:
    roles = {normalize_text(role) for role in node.get("roles", [])}
    metadata = {normalize_text(item) for item in node.get("metadata", [])}
    if node.get("type") == "artist" and ("guitarist" in roles or "guitarist" in metadata):
        return "guitarist"
    return str(node.get("type", "artist"))


def seed_key(seed: dict[str, Any]) -> tuple[str, str]:
    return (normalize_text(seed.get("name", "")), str(seed.get("kind", "")))


def existing_seed_keys(requests: list[dict[str, Any]]) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    for request in requests:
        for seed in request.get("seeds", []) or []:
            if isinstance(seed, dict):
                keys.add(seed_key(seed))
    return keys


def degree_by_node(graph: dict[str, Any]) -> Counter[str]:
    degrees: Counter[str] = Counter()
    for edge in graph.get("edges", []):
        source = edge.get("source")
        target = edge.get("target")
        if source:
            degrees[source] += 1
        if target:
            degrees[target] += 1
    return degrees


def has_wiki_source(node: dict[str, Any]) -> bool:
    for source in node.get("sources", []) or []:
        provider = normalize_text(source.get("provider", ""))
        url = normalize_text(source.get("url", ""))
        if provider in {"wikipedia", "wikidata", "wikimedia"} or "wikipedia.org" in url:
            return True
    return False


def frontier_score(node: dict[str, Any], degree: int) -> float:
    kind = request_kind_for_node(node)
    score = TYPE_PRIORITY.get(kind, 1)
    score += max(0, 6 - min(degree, 6)) * 5
    if node.get("starter"):
        score += 5
    if has_wiki_source(node):
        score += 4
    if not node.get("summary"):
        score += 2
    return score


def select_frontier_seeds(
    graph: dict[str, Any],
    blocked_terms: set[str],
    existing_keys: set[tuple[str, str]],
    max_seeds: int,
) -> list[dict[str, str]]:
    degrees = degree_by_node(graph)
    scored: list[tuple[float, int, str, str, dict[str, Any]]] = []

    for node in graph.get("nodes", []):
        kind = request_kind_for_node(node)
        label = str(node.get("label", "")).strip()
        if kind not in ALLOWED_KINDS or not label:
            continue
        if seed_key({"name": label, "kind": kind}) in existing_keys:
            continue
        if node_has_blocked_signal(node, blocked_terms):
            continue

        degree = degrees[str(node.get("id", ""))]
        if degree > 5 and not node.get("starter"):
            continue

        zone = str(node.get("zone", "unknown"))
        scored.append((frontier_score(node, degree), degree, label, zone, node))

    scored.sort(key=lambda item: (-item[0], item[1], item[2]))

    by_zone: dict[str, list[tuple[float, int, str, str, dict[str, Any]]]] = defaultdict(list)
    for item in scored:
        by_zone[item[3]].append(item)

    zone_order = sorted(
        by_zone,
        key=lambda zone: (
            -sum(item[0] for item in by_zone[zone][:max_seeds]),
            -len(by_zone[zone]),
            zone,
        ),
    )

    def pick_from(
        items: list[tuple[float, int, str, str, dict[str, Any]]],
        balanced: bool,
    ) -> list[dict[str, str]]:
        selected: list[dict[str, str]] = []
        type_counts: Counter[str] = Counter()

        for _, _, _, _, node in items:
            kind = request_kind_for_node(node)
            if balanced and type_counts[kind] >= 2:
                continue
            selected.append({"name": str(node["label"]), "kind": kind})
            type_counts[kind] += 1
            if len(selected) >= max_seeds:
                break

        return selected

    for zone in zone_order:
        selected = pick_from(by_zone[zone], balanced=True)
        if len(selected) >= min(3, max_seeds):
            return selected

    for zone in zone_order:
        selected = pick_from(by_zone[zone], balanced=False)
        if selected:
            return selected

    selected: list[dict[str, str]] = []
    for _, _, _, _, node in scored:
        kind = request_kind_for_node(node)
        selected.append({"name": str(node["label"]), "kind": kind})
        if len(selected) >= max_seeds:
            break

    return selected


def scope_for_seeds(seeds: list[dict[str, str]]) -> str:
    kinds = {seed["kind"] for seed in seeds}
    if kinds & {"guitar", "guitar_brand"}:
        return "guitar_history"
    if kinds == {"genre"}:
        return "genre_cluster"
    return "artist_network"


def request_id_for_seeds(seeds: list[dict[str, str]]) -> str:
    year, week, _ = datetime.now(UTC).isocalendar()
    first = slugify(seeds[0]["name"]) if seeds else "map"
    return f"frontier-{year}-w{week:02d}-{first}"


def zone_context_for_seeds(graph: dict[str, Any], seeds: list[dict[str, str]]) -> str:
    by_label = {normalize_text(node.get("label", "")): node for node in graph.get("nodes", [])}
    hints: list[str] = []
    for seed in seeds:
        node = by_label.get(normalize_text(seed["name"]))
        hint = ZONE_HINTS.get(str(node.get("zone"))) if node else None
        if hint and hint not in hints:
            hints.append(hint)
    return "; ".join(hints)


def build_frontier_request(graph: dict[str, Any], seeds: list[dict[str, str]]) -> dict[str, Any]:
    zone_context = zone_context_for_seeds(graph, seeds)
    seed_names = ", ".join(seed["name"] for seed in seeds)
    instructions = (
        f"Read the current approved graph context, then expand the thin map frontier around {seed_names}. "
        "Find documented music-related connections from Wikipedia, Wikidata, Wikimedia Commons and MusicBrainz. "
        "Only propose bands, guitarists, artists, guitars, guitar brands and music genres as nodes. "
        "Use albums, songs and releases only as edge context, never as nodes. "
        "Prefer relationships that improve map structure: shared bands, documented influence, associated genres, "
        "iconic instruments, makers and collaborations. Respect the blocked-entities file without exception."
    )
    if zone_context:
        instructions += f" Placement context: {zone_context}."

    return {
        "id": request_id_for_seeds(seeds),
        "title": f"Scout map frontier: {seed_names}",
        "status": "queued",
        "priority": 55,
        "scope": scope_for_seeds(seeds),
        "createdAt": iso_now(),
        "instructions": instructions,
        "seeds": seeds,
        "limits": {
            "maxSeeds": len(seeds),
            "maxCandidates": 60,
        },
        "notes": "Created by brain/pipeline/scout_agent.py when no queued work was available.",
    }


def load_supabase_helpers() -> dict[str, Any]:
    try:
        from supabase_brain import (
            fetch_requests,
            request_to_row,
            require_client,
            row_to_request,
            supabase_env_ready,
        )
    except ModuleNotFoundError as error:
        raise SystemExit(
            f"Missing Python package '{error.name}'. Install with: "
            "python -m pip install -r brain/pipeline/requirements.txt"
        ) from error

    return {
        "fetch_requests": fetch_requests,
        "request_to_row": request_to_row,
        "require_client": require_client,
        "row_to_request": row_to_request,
        "supabase_env_ready": supabase_env_ready,
    }


def choose_source(source: str) -> str:
    if source != "auto":
        return source
    helpers = load_supabase_helpers()
    return "supabase" if helpers["supabase_env_ready"]() else "file"


def load_requests(source: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], Any]:
    if source == "supabase":
        helpers = load_supabase_helpers()
        client = helpers["require_client"]()
        rows = helpers["fetch_requests"](client, status="all", limit=500)
        requests = [helpers["row_to_request"](row) for row in rows]
        queued = [request for request in requests if request.get("status") == "queued"]
        return requests, queued, client

    inbox = load_inbox(INBOX_PATH)
    requests = [item for item in inbox.get("requests", []) if isinstance(item, dict)]
    queued, errors = queued_requests(inbox, None)
    if errors:
        raise SystemExit("\n".join(errors))
    return requests, queued, inbox


def write_local_request(inbox: dict[str, Any], request: dict[str, Any]) -> None:
    inbox.setdefault("version", 1)
    inbox.setdefault("requests", [])
    inbox["requests"].append(request)
    INBOX_PATH.write_text(
        json.dumps(inbox, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def queue_request(source: str, request: dict[str, Any], state: Any) -> None:
    if source == "supabase":
        helpers = load_supabase_helpers()
        state.table("research_requests").upsert(
            helpers["request_to_row"](request, source="scout-agent"),
            on_conflict="id",
        ).execute()
        return

    write_local_request(state, request)


def process_queued(source: str, limit: int, dry_run: bool) -> int:
    command = [
        sys.executable,
        str(BRAIN_ROOT / "pipeline" / "process_inbox.py"),
        "--source",
        source,
        "--limit",
        str(limit),
    ]
    if source == "supabase":
        command.append("--publish-candidates-to-supabase")
    if dry_run:
        command.append("--dry-run")

    result = subprocess.run(command, cwd=REPO_ROOT, check=False)
    return int(result.returncode or 0)


def write_run_summary(summary: dict[str, Any]) -> Path:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    path = RUNS_DIR / f"scout-agent-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.json"
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the MHM research scout agent.")
    parser.add_argument(
        "--source",
        choices=["auto", "file", "supabase"],
        default=os.getenv("BRAIN_AGENT_SOURCE", "auto"),
        help="Use Supabase when configured, or fall back to the local inbox.",
    )
    parser.add_argument("--limit", type=int, default=2, help="Maximum queued requests to process.")
    parser.add_argument(
        "--frontier-seeds",
        type=int,
        default=6,
        help="Number of current graph nodes to use when auto-queueing frontier work.",
    )
    parser.add_argument(
        "--auto-queue-frontier",
        action="store_true",
        help="Create one frontier request when the queue is empty.",
    )
    parser.add_argument(
        "--process",
        action="store_true",
        help="Process queued requests after the scout has inspected or queued work.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report what would happen.")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    source = choose_source(args.source)
    graph = load_json(graph_path())
    blocked_terms = load_blocked_terms()
    all_requests, queued, state = load_requests(source)
    existing_ids = {request.get("id") for request in all_requests}

    summary: dict[str, Any] = {
        "version": 1,
        "createdAt": iso_now(),
        "source": source,
        "graphPath": str(graph_path().relative_to(REPO_ROOT)).replace("\\", "/"),
        "nodeCount": len(graph.get("nodes", [])),
        "edgeCount": len(graph.get("edges", [])),
        "queuedRequestCount": len(queued),
        "autoQueueFrontier": bool(args.auto_queue_frontier),
        "dryRun": bool(args.dry_run),
        "processed": False,
    }

    planned_request: dict[str, Any] | None = None
    created_request: dict[str, Any] | None = None

    if not queued and args.auto_queue_frontier:
        seeds = select_frontier_seeds(
            graph,
            blocked_terms,
            existing_seed_keys(all_requests),
            max(1, args.frontier_seeds),
        )
        if seeds:
            planned_request = build_frontier_request(graph, seeds)
            if planned_request["id"] in existing_ids:
                summary["frontierStatus"] = "already-exists"
                summary["frontierRequestId"] = planned_request["id"]
            elif args.dry_run:
                summary["frontierStatus"] = "would-create"
                summary["plannedRequest"] = planned_request
            else:
                queue_request(source, planned_request, state)
                created_request = planned_request
                queued = [planned_request]
                summary["frontierStatus"] = "created"
                summary["frontierRequestId"] = planned_request["id"]
        else:
            summary["frontierStatus"] = "no-eligible-seeds"

    if queued:
        summary["queuedRequests"] = [
            {"id": request.get("id"), "title": request.get("title")}
            for request in queued[: args.limit]
        ]

    if args.process and (queued or args.dry_run):
        summary["processed"] = not args.dry_run
        return_code = process_queued(source, args.limit, args.dry_run)
        summary["processReturnCode"] = return_code
        if return_code != 0:
            summary["status"] = "failed"
            summary_path = write_run_summary(summary)
            summary["summaryPath"] = str(summary_path.relative_to(REPO_ROOT)).replace("\\", "/")
            print_json(summary)
            raise SystemExit(return_code)
    else:
        summary["status"] = "idle" if not queued and not created_request else "queued"

    if "status" not in summary:
        summary["status"] = "completed" if args.process else "queued"

    summary_path = write_run_summary(summary)
    summary["summaryPath"] = str(summary_path.relative_to(REPO_ROOT)).replace("\\", "/")
    print_json(summary)


if __name__ == "__main__":
    main()
