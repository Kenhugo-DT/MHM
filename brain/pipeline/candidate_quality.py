"""Review-sanity helpers for MHM research candidates."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BRAIN_ROOT.parent
BLOCKED_ENTITIES_PATH = REPO_ROOT / "shared" / "graph-schema" / "blocked-entities.json"

ALLOWED_KINDS = {
    "band",
    "guitarist",
    "artist",
    "guitar",
    "guitar_brand",
    "genre",
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

OUT_OF_SCOPE_TITLE_TERMS = {
    "allmusic",
    "award",
    "awards",
    "bandcamp",
    "billboard",
    "biographical dictionary",
    "charts",
    "concert",
    "database",
    "discogs",
    "encyclopedia",
    "festival",
    "grammy",
    "guitar player",
    "guitar world",
    "hall of fame",
    "kerrang",
    "magazine",
    "media",
    "musicbrainz",
    "newspaper",
    "pitchfork",
    "platform",
    "publication",
    "publisher",
    "radio station",
    "rate your music",
    "record company",
    "record label",
    "record store",
    "spotify",
    "streaming",
    "television",
    "venue",
    "website",
    "youtube",
}

OUT_OF_SCOPE_EXACT_TERMS = {
    "bandcamp daily",
    "baker's biographical dictionary of musicians",
    "bundesverband musikindustrie",
    "guitar player",
    "guitar world",
    "lead guitar",
    "musicians institute",
    "revolver",
    "rolling stone",
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


def normalize_text(text: str) -> str:
    return str(text).lower().replace("_", " ").strip()


def load_blocked_terms(path: Path = BLOCKED_ENTITIES_PATH) -> set[str]:
    if not path.exists():
        return set()

    payload = json.loads(path.read_text(encoding="utf-8"))
    terms: set[str] = set()
    for entity in payload.get("entities", []):
        entity_id = entity.get("id")
        if entity_id:
            terms.add(str(entity_id))
        terms.update(str(label) for label in entity.get("labels", []) if label)
    return {normalize_text(term) for term in terms if term}


def flag(severity: str, code: str, message: str, target: str | None = None) -> dict[str, str]:
    payload = {"severity": severity, "code": code, "message": message}
    if target:
        payload["target"] = target
    return payload


def has_blocked_term(text: str, blocked_terms: set[str]) -> bool:
    normalized = normalize_text(text)
    return any(term in normalized for term in blocked_terms)


def out_of_scope_reason(title: str, kind: str, source: str = "") -> str | None:
    normalized = normalize_text(title.replace("Category:", ""))
    if not normalized:
        return "empty title"
    if normalized in OUT_OF_SCOPE_EXACT_TERMS:
        return "out-of-scope reference/platform topic"
    if any(term in normalized for term in OUT_OF_SCOPE_TITLE_TERMS):
        return "out-of-scope platform/media/list/reference topic"
    if normalized.startswith("list of "):
        return "list page"
    if len(normalized) >= 4 and normalized[:4].isdigit():
        return "year/date page"
    if any(term in normalized for term in RELEASE_TERMS):
        return "release page, not a map entity"
    if normalized in GENERIC_TOPIC_TERMS or normalized.endswith(" genres"):
        return "generic topic, not a concrete map entity"
    if source == "category":
        if kind != "genre":
            return "category candidates may only become genre nodes"
        if any(term in normalized for term in CATEGORY_COLLECTION_TERMS):
            return "category collection page"
        if " by " in normalized or " from " in normalized:
            return "category grouping page"
    return None


def review_music_candidate(
    candidate: dict[str, Any],
    seed_name: str,
    blocked_terms: set[str],
) -> list[dict[str, str]]:
    title = str(candidate.get("title", "")).strip()
    kind = str(candidate.get("kind", "unknown")).strip()
    source = str(candidate.get("source", "")).strip()
    issues: list[dict[str, str]] = []

    if not title:
        return [flag("reject", "empty_candidate_title", "Candidate has no title.")]
    if kind not in ALLOWED_KINDS:
        issues.append(flag("reject", "unsupported_candidate_kind", f"Unsupported kind: {kind}.", title))
    if has_blocked_term(title, blocked_terms):
        issues.append(flag("reject", "blocked_entity", "Candidate matches the project blocklist.", title))

    scope_reason = out_of_scope_reason(title, kind, source)
    if scope_reason:
        issues.append(flag("reject", "out_of_scope_candidate", scope_reason, title))

    if normalize_text(title) == normalize_text(seed_name):
        issues.append(flag("warning", "same_as_seed", "Candidate repeats the seed entity.", title))

    return issues


def review_candidate_payload(
    payload: dict[str, Any],
    blocked_terms: set[str] | None = None,
) -> dict[str, Any]:
    blocked_terms = blocked_terms if blocked_terms is not None else load_blocked_terms()
    seed_name = str(payload.get("name") or payload.get("seed_name") or "").strip()
    requested_kind = str(payload.get("requested_kind") or "").strip()
    flags: list[dict[str, str]] = []

    if not seed_name:
        flags.append(flag("reject", "missing_seed_name", "Candidate package has no seed name."))
    elif has_blocked_term(seed_name, blocked_terms):
        flags.append(flag("reject", "blocked_seed", "Seed matches the project blocklist.", seed_name))

    if requested_kind not in ALLOWED_KINDS:
        flags.append(
            flag("reject", "unsupported_seed_kind", f"Unsupported seed kind: {requested_kind}.", seed_name)
        )

    if not payload.get("wikipedia"):
        flags.append(flag("warning", "missing_wikipedia", "No Wikipedia page was found for this seed.", seed_name))

    source_errors = payload.get("source_errors") or []
    if source_errors:
        flags.append(
            flag(
                "warning",
                "source_errors",
                f"{len(source_errors)} source lookup error(s) occurred.",
                seed_name,
            )
        )

    candidates = payload.get("music_candidates") or []
    rejected_preview: list[dict[str, Any]] = []
    warning_preview: list[dict[str, Any]] = []
    publishable_count = 0
    warning_count = 0
    reject_count = 0

    for candidate in candidates:
        issues = review_music_candidate(candidate, seed_name, blocked_terms)
        severities = {issue["severity"] for issue in issues}
        if "reject" in severities:
            reject_count += 1
            if len(rejected_preview) < 8:
                rejected_preview.append(
                    {
                        "title": candidate.get("title"),
                        "kind": candidate.get("kind"),
                        "reason": issues[0]["message"],
                    }
                )
            continue
        if "warning" in severities:
            warning_count += 1
            if len(warning_preview) < 8:
                warning_preview.append(
                    {
                        "title": candidate.get("title"),
                        "kind": candidate.get("kind"),
                        "reason": issues[0]["message"],
                    }
                )
        publishable_count += 1

    if not candidates:
        flags.append(flag("warning", "no_music_candidates", "No related music candidates were collected.", seed_name))
    elif publishable_count == 0:
        flags.append(
            flag(
                "warning",
                "no_publishable_candidates",
                "All collected related candidates were filtered out.",
                seed_name,
            )
        )
    elif reject_count > publishable_count and reject_count >= 5:
        flags.append(
            flag(
                "warning",
                "noisy_candidate_set",
                "More rejected than publishable related candidates; review carefully.",
                seed_name,
            )
        )

    row_rejects = sum(1 for item in flags if item["severity"] == "reject")
    row_warnings = sum(1 for item in flags if item["severity"] == "warning")
    score = max(0, 100 - row_rejects * 35 - row_warnings * 12 - reject_count * 2 - warning_count)
    level = "reject" if row_rejects else "warning" if row_warnings or score < 85 else "ok"
    summary = (
        f"{level.upper()} · {publishable_count}/{len(candidates)} related candidates look promotable"
        f" ({reject_count} rejected, {warning_count} warnings)."
    )

    return {
        "version": 1,
        "level": level,
        "score": score,
        "summary": summary,
        "flags": flags,
        "candidateStats": {
            "total": len(candidates),
            "publishable": publishable_count,
            "rejected": reject_count,
            "warnings": warning_count,
        },
        "rejectedPreview": rejected_preview,
        "warningPreview": warning_preview,
    }
