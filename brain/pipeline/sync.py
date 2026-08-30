"""Collect source candidates without publishing them to the live graph."""

from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

BRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BRAIN_ROOT.parent
SHARED_GRAPH_SCHEMA = REPO_ROOT / "shared" / "graph-schema"

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BRAIN_ROOT / ".env")
load_dotenv(Path(__file__).with_name(".env"))


@dataclass
class Candidate:
    name: str
    requested_kind: str
    musicbrainz: dict[str, Any] | None
    wikidata: dict[str, Any] | None
    wikipedia: dict[str, Any] | None
    music_candidates: list[dict[str, Any]]
    status: str = "review"


def normalize_text(text: str) -> str:
    return text.lower().replace("_", " ").strip()


def load_blocked_terms() -> set[str]:
    path = SHARED_GRAPH_SCHEMA / "blocked-entities.json"
    if not path.exists():
        return set()

    payload = json.loads(path.read_text(encoding="utf-8"))
    terms: set[str] = set()
    for entity in payload.get("entities", []):
        entity_id = entity.get("id")
        if entity_id:
            terms.add(entity_id)
        terms.update(entity.get("labels", []))

    return {normalize_text(term) for term in terms if term}


def is_blocked_name(name: str, blocked_terms: set[str]) -> bool:
    normalized = normalize_text(name)
    return any(term in normalized for term in blocked_terms)


class MusicBrainzClient:
    def __init__(self, contact: str) -> None:
        if not contact:
            raise ValueError("MUSICBRAINZ_CONTACT must contain an email address or project URL.")
        self.session = requests.Session()
        self.session.headers["User-Agent"] = f"MusicHistoryMap/0.1 ({contact})"
        self.last_request = 0.0

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        elapsed = time.monotonic() - self.last_request
        if elapsed < 1.1:
            time.sleep(1.1 - elapsed)
        response = self.session.get(
            f"https://musicbrainz.org/ws/2/{path}",
            params={**params, "fmt": "json"},
            timeout=25,
        )
        self.last_request = time.monotonic()
        response.raise_for_status()
        return response.json()

    def search(self, name: str, kind: str) -> dict[str, Any] | None:
        entity = "artist" if kind in {"artist", "band", "guitarist"} else None
        if not entity:
            return None
        payload = self._get(entity, {"query": f'artist:"{name}"', "limit": 3})
        matches = payload.get("artists", [])
        return matches[0] if matches else None


class WikidataClient:
    endpoint = "https://www.wikidata.org/w/api.php"

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "MusicHistoryMap/0.1"

    def search(self, name: str) -> dict[str, Any] | None:
        response = self.session.get(
            self.endpoint,
            params={
                "action": "wbsearchentities",
                "search": name,
                "language": "en",
                "uselang": "en",
                "format": "json",
                "limit": 5,
            },
            timeout=25,
        )
        response.raise_for_status()
        results = response.json().get("search", [])
        return results[0] if results else None


class WikipediaClient:
    endpoint = "https://en.wikipedia.org/w/api.php"
    music_terms = {
        "acoustic",
        "artist",
        "banjo",
        "band",
        "bass",
        "blues",
        "country",
        "electric",
        "fender",
        "folk",
        "funk",
        "gibson",
        "guitar",
        "guitarist",
        "hard rock",
        "heavy metal",
        "ibanez",
        "jazz",
        "metal",
        "music",
        "musician",
        "punk",
        "rickenbacker",
        "rock",
        "songwriter",
    }
    release_terms = {
        "album",
        "albums",
        "discography",
        "single",
        "singles",
        "song",
        "songs",
        "track",
    }
    boring_terms = {
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

    def __init__(self, blocked_terms: set[str]) -> None:
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "MusicHistoryMap/0.1"
        self.session.headers["Api-User-Agent"] = "MusicHistoryMap/0.1"
        self.blocked_terms = blocked_terms

    @staticmethod
    def _normalize(text: str) -> str:
        return normalize_text(text)

    def _includes_any(self, text: str, terms: set[str]) -> bool:
        normalized = self._normalize(text)
        return any(term in normalized for term in terms)

    def _is_blocked(self, title: str) -> bool:
        normalized = self._normalize(title)
        return (
            self._includes_any(normalized, self.boring_terms)
            or self._includes_any(normalized, self.release_terms)
            or self._includes_any(normalized, self.blocked_terms)
            or normalized.startswith("list of ")
            or (len(normalized) >= 4 and normalized[:4].isdigit())
        )

    def _classify(self, title: str, source: str) -> str:
        normalized = self._normalize(title)
        if "guitarist" in normalized:
            return "guitarist"
        if "band" in normalized or "music group" in normalized:
            return "band"
        if "genre" in normalized or "rock music" in normalized:
            return "genre"
        if "guitar manufacturer" in normalized or "guitar brands" in normalized:
            return "guitar_brand"
        if (
            "stratocaster" in normalized
            or "telecaster" in normalized
            or "les paul" in normalized
            or "guitar" in normalized
        ):
            return "guitar"
        if "musician" in normalized or "songwriter" in normalized:
            return "artist"
        return "unknown"

    def _candidate(self, title: str, source: str) -> dict[str, Any] | None:
        clean_title = title.replace("Category:", "").strip()
        if (
            not clean_title
            or self._is_blocked(clean_title)
            or not self._includes_any(clean_title, self.music_terms)
        ):
            return None

        kind = self._classify(clean_title, source)
        return {
            "title": clean_title,
            "source": source,
            "kind": kind,
            "reason": f"Wikipedia {source}: {clean_title}",
        }

    def music_candidates(self, page: dict[str, Any] | None) -> list[dict[str, Any]]:
        if not page:
            return []

        candidates: dict[str, dict[str, Any]] = {}
        for category in page.get("categories", []):
            candidate = self._candidate(category, "category")
            if candidate:
                candidates[candidate["title"].lower()] = candidate
        for link in page.get("links", []):
            candidate = self._candidate(link, "link")
            if candidate:
                candidates.setdefault(candidate["title"].lower(), candidate)
        return list(candidates.values())[:20]

    def page(self, title: str) -> dict[str, Any] | None:
        response = self.session.get(
            self.endpoint,
            params={
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "redirects": 1,
                "prop": "extracts|pageimages|info|categories|links",
                "inprop": "url",
                "exintro": 1,
                "explaintext": 1,
                "piprop": "name|thumbnail",
                "pithumbsize": 1200,
                "pilicense": "free",
                "cllimit": 80,
                "clshow": "!hidden",
                "pllimit": 120,
                "plnamespace": 0,
                "titles": title,
            },
            timeout=25,
        )
        response.raise_for_status()
        pages = response.json().get("query", {}).get("pages", [])
        page = pages[0] if pages else None
        if not page or page.get("missing"):
            return None
        return {
            "title": page.get("title"),
            "url": page.get("fullurl"),
            "extract": page.get("extract"),
            "pageimage": page.get("pageimage"),
            "thumbnail": page.get("thumbnail"),
            "categories": [
                category.get("title", "")
                for category in page.get("categories", [])
                if category.get("title")
            ],
            "links": [
                link.get("title", "")
                for link in page.get("links", [])
                if link.get("title")
            ],
        }


def collect(seed_file: Path) -> list[Candidate]:
    seeds = json.loads(seed_file.read_text(encoding="utf-8"))
    blocked_terms = load_blocked_terms()
    musicbrainz_contact = os.getenv("MUSICBRAINZ_CONTACT", "").strip()
    musicbrainz = MusicBrainzClient(musicbrainz_contact) if musicbrainz_contact else None
    if not musicbrainz:
        print("MUSICBRAINZ_CONTACT is not set. Skipping MusicBrainz lookup.")
    wikidata = WikidataClient()
    wikipedia = WikipediaClient(blocked_terms)
    candidates: list[Candidate] = []

    for seed in seeds:
        name = seed["name"]
        kind = seed["kind"]
        if is_blocked_name(name, blocked_terms):
            print(f"Skipping blocked entity seed: {name}")
            continue
        print(f"Collecting source candidates for {name}...")
        wikipedia_page = wikipedia.page(name)
        candidates.append(
            Candidate(
                name=name,
                requested_kind=kind,
                musicbrainz=musicbrainz.search(name, kind) if musicbrainz else None,
                wikidata=wikidata.search(name),
                wikipedia=wikipedia_page,
                music_candidates=wikipedia.music_candidates(wikipedia_page),
            )
        )

    return candidates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed-file", type=Path, default=BRAIN_ROOT / "pipeline" / "seeds.json")
    parser.add_argument(
        "--output",
        type=Path,
        default=BRAIN_ROOT / "data" / "candidates" / "research-candidates.json",
    )
    args = parser.parse_args()

    candidates = collect(args.seed_file)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps([asdict(item) for item in candidates], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(candidates)} review candidates to {args.output}.")


if __name__ == "__main__":
    main()
