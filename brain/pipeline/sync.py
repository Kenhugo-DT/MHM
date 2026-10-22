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

from candidate_quality import wikipedia_matches_kind

BRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BRAIN_ROOT.parent
SHARED_GRAPH_SCHEMA = REPO_ROOT / "shared" / "graph-schema"

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BRAIN_ROOT / ".env")
load_dotenv(Path(__file__).with_name(".env"))

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


@dataclass
class Candidate:
    name: str
    requested_kind: str
    musicbrainz: dict[str, Any] | None
    wikidata: dict[str, Any] | None
    wikipedia: dict[str, Any] | None
    music_candidates: list[dict[str, Any]]
    source_errors: list[dict[str, str]]
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


def is_out_of_scope_title(title: str) -> bool:
    normalized = normalize_text(title.replace("Category:", ""))
    return (
        normalized in OUT_OF_SCOPE_EXACT_TERMS
        or any(term in normalized for term in OUT_OF_SCOPE_TITLE_TERMS)
    )


def get_json_with_backoff(session: requests.Session, url: str, params: dict[str, Any]) -> dict[str, Any]:
    for attempt in range(3):
        response = session.get(url, params=params, timeout=25)
        if response.status_code in {429, 503} and attempt < 2:
            retry_after = response.headers.get("Retry-After", "")
            delay = int(retry_after) if retry_after.isdigit() else 6 * (attempt + 1)
            time.sleep(min(delay, 30))
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError("Source retries exhausted")


class MusicBrainzClient:
    def __init__(self, contact: str) -> None:
        if not contact:
            raise ValueError("MUSICBRAINZ_CONTACT must contain an email address or project URL.")
        self.session = requests.Session()
        self.session.headers["User-Agent"] = f"MusicHistoryMap/0.1 ({contact})"
        self.last_request = 0.0

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        for attempt in range(3):
            elapsed = time.monotonic() - self.last_request
            if elapsed < 1.1:
                time.sleep(1.1 - elapsed)
            response = self.session.get(
                f"https://musicbrainz.org/ws/2/{path}",
                params={**params, "fmt": "json"},
                timeout=25,
            )
            self.last_request = time.monotonic()
            if response.status_code in {429, 503} and attempt < 2:
                retry_after = response.headers.get("Retry-After", "")
                delay = int(retry_after) if retry_after.isdigit() else 6 * (attempt + 1)
                time.sleep(min(delay, 30))
                continue
            response.raise_for_status()
            return response.json()
        raise RuntimeError("MusicBrainz retries exhausted")

    def search(self, name: str, kind: str) -> dict[str, Any] | None:
        entity = "artist" if kind in {"artist", "band", "guitarist"} else None
        if not entity:
            return None
        payload = self._get(entity, {"query": f'artist:"{name}"', "limit": 10})
        matches = payload.get("artists", [])
        expected_type = "Group" if kind == "band" else "Person"
        return next(
            (
                match for match in matches
                if normalize_text(match.get("name", "")) == normalize_text(name)
                and match.get("type") == expected_type
            ),
            None,
        )

    def lookup(self, artist_id: str, name: str, kind: str) -> dict[str, Any] | None:
        if kind not in {"artist", "band", "guitarist"}:
            return None
        match = self._get(f"artist/{artist_id}", {})
        expected_type = "Group" if kind == "band" else "Person"
        if match.get("type") != expected_type or normalize_text(match.get("name", "")) != normalize_text(name):
            return None
        return match


class WikidataClient:
    endpoint = "https://www.wikidata.org/w/api.php"

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "MusicHistoryMap/0.1"

    def search(self, name: str, kind: str = "") -> dict[str, Any] | None:
        payload = get_json_with_backoff(
            self.session,
            self.endpoint,
            {
                "action": "wbsearchentities",
                "search": name,
                "language": "en",
                "uselang": "en",
                "format": "json",
                "limit": 5,
            },
        )
        results = payload.get("search", [])
        if kind in {"band", "artist", "guitarist"}:
            descriptors = {
                "band": ("band", "musical group", "music group"),
                "artist": ("singer", "musician", "composer", "rapper", "songwriter", "record producer"),
                "guitarist": ("guitarist", "musician"),
            }[kind]
            return next(
                (
                    result for result in results
                    if normalize_text(result.get("label", "")) == normalize_text(name)
                    and any(term in result.get("description", "").lower() for term in descriptors)
                ),
                None,
            )
        return results[0] if results else None

    def identity(self, entity_id: str) -> dict[str, Any]:
        payload = get_json_with_backoff(
            self.session,
            self.endpoint,
            {
                "action": "wbgetentities",
                "ids": entity_id,
                "props": "claims|sitelinks",
                "sitefilter": "enwiki",
                "format": "json",
            },
        )
        entity = payload.get("entities", {}).get(entity_id, {})
        artist_ids = [
            statement.get("mainsnak", {}).get("datavalue", {}).get("value")
            for statement in entity.get("claims", {}).get("P434", [])
            if statement.get("rank") != "deprecated"
        ]
        return {
            "musicbrainz_artist_ids": [value for value in artist_ids if isinstance(value, str)],
            "wikipedia_title": entity.get("sitelinks", {}).get("enwiki", {}).get("title"),
        }


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
            or is_out_of_scope_title(title)
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
        payload = get_json_with_backoff(
            self.session,
            self.endpoint,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "redirects": 1,
                "prop": "extracts|pageimages|info|categories|links|pageprops",
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
        )
        pages = payload.get("query", {}).get("pages", [])
        page = pages[0] if pages else None
        if not page or page.get("missing"):
            return None
        return {
            "title": page.get("title"),
            "url": page.get("fullurl"),
            "extract": page.get("extract"),
            "pageimage": page.get("pageimage"),
            "thumbnail": page.get("thumbnail"),
            "wikidata_id": page.get("pageprops", {}).get("wikibase_item"),
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

    def page_for_seed(self, name: str, kind: str, preferred_title: str | None = None) -> dict[str, Any] | None:
        page = self.page(preferred_title) if preferred_title else None
        if page and (kind not in {"band", "artist", "guitarist"} or wikipedia_matches_kind(page, kind)):
            return page
        page = self.page(name)
        if kind not in {"band", "artist", "guitarist"}:
            return page
        if page and wikipedia_matches_kind(page, kind):
            return page

        suffixes = {
            "band": ["band"],
            "artist": ["musician", "singer"],
            "guitarist": ["guitarist", "musician"],
        }.get(kind, [])
        for suffix in suffixes:
            match = self.page(f"{name} ({suffix})")
            if match and wikipedia_matches_kind(match, kind):
                return match
        return None


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
        if candidates:
            time.sleep(6)
        name = seed["name"]
        kind = seed["kind"]
        if is_blocked_name(name, blocked_terms):
            print(f"Skipping blocked entity seed: {name}")
            continue
        print(f"Collecting source candidates for {name}...")
        source_errors: list[dict[str, str]] = []
        musicbrainz_match = None
        wikidata_match = None
        wikipedia_page = None

        try:
            wikidata_match = wikidata.search(name, kind)
        except Exception as error:
            source_errors.append({"source": "wikidata", "message": str(error)})
            print(f"Wikidata lookup failed for {name}: {error}")

        if wikidata_match and kind in {"band", "artist", "guitarist"}:
            try:
                wikidata_match.update(wikidata.identity(wikidata_match["id"]))
            except Exception as error:
                source_errors.append({"source": "wikidata_identity", "message": str(error)})
                print(f"Wikidata identity lookup failed for {name}: {error}")

        try:
            wikipedia_page = wikipedia.page_for_seed(
                name, kind, (wikidata_match or {}).get("wikipedia_title")
            )
        except Exception as error:
            source_errors.append({"source": "wikipedia", "message": str(error)})
            print(f"Wikipedia lookup failed for {name}: {error}")

        wikipedia_id = (wikipedia_page or {}).get("wikidata_id")
        if wikipedia_id and wikipedia_id != (wikidata_match or {}).get("id"):
            try:
                wikipedia_page.update(wikidata.identity(wikipedia_id))
            except Exception as error:
                source_errors.append({"source": "wikipedia_identity", "message": str(error)})
                print(f"Wikipedia identity lookup failed for {name}: {error}")
        elif wikipedia_page and wikidata_match:
            wikipedia_page["musicbrainz_artist_ids"] = wikidata_match.get("musicbrainz_artist_ids", [])

        if musicbrainz:
            try:
                linked_ids = (wikipedia_page or {}).get("musicbrainz_artist_ids") or (
                    wikidata_match or {}).get("musicbrainz_artist_ids") or []
                if linked_ids:
                    musicbrainz_match = musicbrainz.lookup(linked_ids[0], name, kind)
                if not musicbrainz_match:
                    musicbrainz_match = musicbrainz.search(name, kind)
            except Exception as error:
                source_errors.append({"source": "musicbrainz", "message": str(error)})
                print(f"MusicBrainz lookup failed for {name}: {error}")

        candidates.append(
            Candidate(
                name=name,
                requested_kind=kind,
                musicbrainz=musicbrainz_match,
                wikidata=wikidata_match,
                wikipedia=wikipedia_page,
                music_candidates=wikipedia.music_candidates(wikipedia_page),
                source_errors=source_errors,
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
