"""Bounded, review-only lookups in independent public archives."""

from __future__ import annotations

import re
import time
import json
from typing import Any

import requests

SOURCE_LOOKUP_LIMIT = 12
ARCHIVE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{1,199}")
GND_ID = re.compile(r"[0-9X-]{5,20}")


def normalized_name(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold()))


def authority_name_matches(preferred: str, expected: str) -> bool:
    if normalized_name(preferred) == normalized_name(expected):
        return True
    if "," not in preferred:
        return False
    family, given = preferred.split(",", 1)
    return normalized_name(f"{given} {family}") == normalized_name(expected)


class PublicSourceClient:
    def __init__(self, session: requests.Session | None = None) -> None:
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = "MusicHistoryMap/0.1 (https://github.com/Kenhugo-DT)"
        self.last_request: dict[str, float] = {}
        self.request_count = 0
        self.cache: dict[str, dict[str, Any]] = {}

    def get(self, source: str, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        cache_key = json.dumps([source, url, params], sort_keys=True)
        if cache_key in self.cache:
            return self.cache[cache_key]
        interval = 3.5 if source == "loc" else 1.0
        for attempt in range(3):
            if self.request_count >= SOURCE_LOOKUP_LIMIT:
                raise RuntimeError("Public source request budget exhausted")
            elapsed = time.monotonic() - self.last_request.get(source, 0.0)
            if elapsed < interval:
                time.sleep(interval - elapsed)
            self.request_count += 1
            response = self.session.get(url, params=params, timeout=20)
            self.last_request[source] = time.monotonic()
            if response.status_code in {429, 503} and attempt < 2:
                retry_after = response.headers.get("Retry-After", "")
                time.sleep(min(int(retry_after), 30) if retry_after.isdigit() else 5 * (attempt + 1))
                continue
            response.raise_for_status()
            self.cache[cache_key] = response.json()
            return self.cache[cache_key]
        raise RuntimeError(f"{source} retry limit exceeded")

    def gnd_identity(self, gnd_id: str, name: str) -> dict[str, str] | None:
        if not GND_ID.fullmatch(gnd_id):
            return None
        data = self.get("gnd", f"https://lobid.org/gnd/{gnd_id}.json")
        if data.get("id") != f"https://d-nb.info/gnd/{gnd_id}":
            return None
        if not {"Person", "DifferentiatedPerson"}.intersection(data.get("type") or []):
            return None
        preferred = data.get("preferredName")
        if not isinstance(preferred, str) or not authority_name_matches(preferred, name):
            return None
        return {"provider": "gnd", "id": gnd_id, "name": preferred,
                "url": f"https://d-nb.info/gnd/{gnd_id}"}

    def archive_audio(self, name: str) -> list[dict[str, str]]:
        escaped = name.replace("\\", "\\\\").replace('"', '\\"')
        data = self.get("internet_archive", "https://archive.org/advancedsearch.php", {
            "q": f'creator:"{escaped}" AND mediatype:audio',
            "fl[]": ["identifier", "title", "creator", "collection"],
            "rows": 5,
            "output": "json",
        })
        leads = []
        for item in (data.get("response") or {}).get("docs", [])[:5]:
            creators = item.get("creator") or []
            if isinstance(creators, str):
                creators = [creators]
            if not isinstance(creators, list) or not any(
                isinstance(creator, str) and normalized_name(creator) == normalized_name(name)
                for creator in creators
            ):
                continue
            identifier = item.get("identifier")
            title = item.get("title")
            if isinstance(identifier, str) and ARCHIVE_ID.fullmatch(identifier) and isinstance(title, str):
                leads.append({"provider": "internet_archive", "title": title[:180],
                              "url": f"https://archive.org/details/{identifier}",
                              "match": "exact_creator_metadata_only"})
            if len(leads) == 2:
                break
        return leads

    def loc_items(self, name: str) -> list[dict[str, str]]:
        data = self.get("loc", "https://www.loc.gov/search/", {
            "q": name, "fo": "json", "c": 5, "at": "results",
        })
        leads = []
        for item in (data.get("results") or [])[:5]:
            contributors = item.get("contributor") or []
            if not isinstance(contributors, list) or not any(
                isinstance(person, str) and normalized_name(person) == normalized_name(name)
                for person in contributors
            ):
                continue
            url = item.get("id")
            title = item.get("title")
            if isinstance(url, str) and url.startswith(("http://www.loc.gov/item/", "https://www.loc.gov/item/")) and isinstance(title, str):
                leads.append({"provider": "loc", "title": title[:180],
                              "url": url.replace("http://", "https://", 1),
                              "match": "exact_contributor_metadata_only"})
            if len(leads) == 2:
                break
        return leads
