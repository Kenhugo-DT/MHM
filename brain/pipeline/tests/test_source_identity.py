import sys
import json
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from candidate_quality import review_candidate_payload
from sync import MusicBrainzClient, WikidataClient, WikipediaClient, collect


class SourceIdentityTests(unittest.TestCase):
    def test_musicbrainz_skips_similar_composer_name(self):
        client = MusicBrainzClient("https://example.org")
        client._get = lambda *_: {"artists": [
            {"name": "Johann Sebastian Bach", "type": "Person"},
            {"name": "Sebastian Bach", "type": "Person", "id": "singer"},
        ]}

        self.assertEqual(client.search("Sebastian Bach", "artist")["id"], "singer")

    def test_musicbrainz_requires_matching_entity_type(self):
        client = MusicBrainzClient("https://example.org")
        client._get = lambda *_: {"artists": [
            {"name": "Danzig", "type": "Person"},
            {"name": "Danzig", "type": "Group", "id": "band"},
        ]}

        self.assertEqual(client.search("Danzig", "band")["id"], "band")

    def test_musicbrainz_lookup_rejects_wrong_name_or_type(self):
        client = MusicBrainzClient("https://example.org")
        client._get = lambda *_: {"name": "Danzig", "type": "Group", "id": "band"}

        self.assertEqual(client.lookup("band", "Danzig", "band")["id"], "band")
        self.assertIsNone(client.lookup("band", "Danzig", "artist"))
        self.assertIsNone(client.lookup("band", "Misfits", "band"))

    def test_musicbrainz_retries_temporary_service_failure(self):
        client = MusicBrainzClient("https://example.org")

        class TemporaryResponse(ResponseStub):
            status_code = 503

            def raise_for_status(self):
                raise RuntimeError("temporary failure")

        with patch.object(client.session, "get", side_effect=[
            TemporaryResponse({}), ResponseStub({"id": "recovered"})
        ]) as get, patch("sync.time.sleep") as sleep:
            self.assertEqual(client._get("artist/recovered", {})["id"], "recovered")

        self.assertEqual(get.call_count, 2)
        self.assertTrue(any(call.args[0] >= 6 for call in sleep.call_args_list))

    def test_wikidata_skips_nonmusic_name_collision(self):
        client = WikidataClient()
        client.session.get = lambda *_args, **_kwargs: ResponseStub({"search": [
            {"label": "UFO", "description": "unidentified flying object", "id": "phenomenon"},
            {"label": "UFO", "description": "British hard rock band", "id": "band"},
        ]})

        self.assertEqual(client.search("UFO", "band")["id"], "band")

    def test_wikidata_identity_returns_non_deprecated_musicbrainz_id_and_wikipedia_title(self):
        client = WikidataClient()
        client.session.get = lambda *_args, **_kwargs: ResponseStub({"entities": {
            "Q531613": {
                "claims": {"P434": [
                    {"rank": "normal", "mainsnak": {"datavalue": {"value": "correct-band"}}},
                    {"rank": "deprecated", "mainsnak": {"datavalue": {"value": "old-id"}}},
                ]},
                "sitelinks": {"enwiki": {"title": "Angel Dust (German band)"}},
            }
        }})

        self.assertEqual(client.identity("Q531613"), {
            "musicbrainz_artist_ids": ["correct-band"],
            "wikipedia_title": "Angel Dust (German band)",
        })

    def test_wikipedia_disambiguation_uses_band_page(self):
        client = WikipediaClient(set())
        pages = {
            "Misfits": {"title": "Misfits", "extract": "Misfits may refer to:", "categories": []},
            "Misfits (band)": {"title": "Misfits (band)", "extract": "American punk band"},
        }
        client.page = pages.get

        self.assertEqual(client.page_for_seed("Misfits", "band")["title"], "Misfits (band)")

    def test_wikipedia_nonmusic_redirect_uses_band_page(self):
        client = WikipediaClient(set())
        pages = {
            "American Football": {"title": "American football", "extract": "A team sport", "categories": []},
            "American Football (band)": {"title": "American Football (band)",
                                         "extract": "American Midwest emo band", "categories": []},
        }
        client.page = pages.get

        self.assertEqual(client.page_for_seed("American Football", "band")["title"],
                         "American Football (band)")

    def test_wikidata_title_resolves_specific_band_page(self):
        client = WikipediaClient(set())
        pages = {
            "Angel Dust (German band)": {"title": "Angel Dust (German band)",
                                         "extract": "German power metal band", "categories": []},
        }
        client.page = pages.get

        self.assertEqual(client.page_for_seed("Angel Dust", "band", "Angel Dust (German band)")["title"],
                         "Angel Dust (German band)")

    def test_wikipedia_keeps_genre_redirect(self):
        client = WikipediaClient(set())
        client.page = lambda *_: {"title": "Bluegrass music", "extract": "A music genre"}

        self.assertEqual(client.page_for_seed("Bluegrass", "genre")["title"], "Bluegrass music")

    def test_quality_rejects_wikipedia_sport_and_musicbrainz_identity_conflict(self):
        sport = {"name": "American Football", "requested_kind": "band",
                 "wikipedia": {"title": "American football", "extract": "A team sport", "categories": []}}
        mismatch = {"name": "Craig Jones", "requested_kind": "artist",
                    "musicbrainz": {"id": "new-zealand-musician"},
                    "wikipedia": {"title": "Craig Jones (musician)",
                                  "extract": "American musician and Slipknot keyboardist",
                                  "wikidata_id": "Q1634784",
                                  "musicbrainz_artist_ids": ["slipknot-member"]}}

        self.assertIn("wikipedia_subject_mismatch", {
            flag["code"] for flag in review_candidate_payload(sport, set())["flags"]
        })
        self.assertIn("source_identity_conflict", {
            flag["code"] for flag in review_candidate_payload(mismatch, set())["flags"]
        })
        self.assertEqual(review_candidate_payload(mismatch, set())["level"], "reject")

    def test_quality_accepts_matching_ids_and_rejects_mismatched_wikidata_page(self):
        correct = {"name": "Keith Richards", "requested_kind": "guitarist",
                   "musicbrainz": {"id": "f0ed72a3-ae8f-4cf7-b51d-2696a2330230"},
                   "wikidata": {"id": "Q189599"},
                   "wikipedia": {"title": "Keith Richards", "extract": "English guitarist",
                                 "wikidata_id": "Q189599",
                                 "musicbrainz_artist_ids": ["f0ed72a3-ae8f-4cf7-b51d-2696a2330230"]}}

        self.assertEqual(review_candidate_payload(correct, set())["level"], "warning")
        self.assertEqual(review_candidate_payload({
            **correct, "wikipedia": {**correct["wikipedia"], "wikidata_id": "Q999"}
        }, set())["level"], "reject")

    def test_collection_replaces_ambiguous_name_match_with_linked_id(self):
        class FakeMusicBrainz:
            def __init__(self, _contact):
                pass

            def search(self, _name, _kind):
                return {"id": "wrong-person", "name": "Craig Jones", "type": "Person"}

            def lookup(self, artist_id, _name, _kind):
                return {"id": artist_id, "name": "Craig Jones", "type": "Person"}

        class FakeWikidata:
            def search(self, _name, _kind):
                return None

            def identity(self, _entity_id):
                return {"musicbrainz_artist_ids": ["slipknot-member"],
                        "wikipedia_title": "Craig Jones (musician)"}

        class FakeWikipedia:
            def __init__(self, _blocked):
                pass

            def page_for_seed(self, _name, _kind, _preferred=None):
                return {"title": "Craig Jones (musician)",
                        "extract": "American musician and Slipknot keyboardist",
                        "wikidata_id": "Q1634784"}

            def music_candidates(self, _page):
                return []

        with patch.object(Path, "read_text", return_value=json.dumps([{"name": "Craig Jones", "kind": "artist"}])), \
             patch("sync.MusicBrainzClient", FakeMusicBrainz), patch("sync.WikidataClient", FakeWikidata), \
             patch("sync.WikipediaClient", FakeWikipedia), patch("sync.load_blocked_terms", return_value=set()), \
             patch("sync.os.getenv", return_value="https://example.org"):
            candidate = collect(Path("unused-seeds.json"))[0]

        self.assertEqual(candidate.musicbrainz["id"], "slipknot-member")
        self.assertNotEqual(review_candidate_payload(candidate.__dict__, set())["level"], "reject")

    def test_collection_blocks_name_match_when_linked_identity_cannot_be_resolved(self):
        class FakeMusicBrainz:
            def __init__(self, _contact):
                pass

            def lookup(self, _artist_id, _name, _kind):
                return None

            def search(self, _name, _kind):
                return {"id": "wrong-person", "name": "David Rosenthal", "type": "Person"}

        class FakeWikidata:
            def search(self, _name, _kind):
                return None

            def identity(self, _entity_id):
                return {"musicbrainz_artist_ids": ["correct-keyboardist"],
                        "wikipedia_title": "David Rosenthal (musician)"}

        class FakeWikipedia:
            def __init__(self, _blocked):
                pass

            def page_for_seed(self, _name, _kind, _preferred=None):
                return {"title": "David Rosenthal (musician)", "extract": "American keyboardist and musician",
                        "wikidata_id": "Q2714150"}

            def music_candidates(self, _page):
                return []

        with patch.object(Path, "read_text", return_value=json.dumps([
            {"name": "David Rosenthal", "kind": "artist"}
        ])), patch("sync.MusicBrainzClient", FakeMusicBrainz), \
             patch("sync.WikidataClient", FakeWikidata), patch("sync.WikipediaClient", FakeWikipedia), \
             patch("sync.load_blocked_terms", return_value=set()), \
             patch("sync.os.getenv", return_value="https://example.org"):
            candidate = collect(Path("unused-seeds.json"))[0]

        review = review_candidate_payload(candidate.__dict__, set())
        self.assertEqual(review["level"], "reject")
        self.assertIn("source_identity_conflict", {item["code"] for item in review["flags"]})


class ResponseStub:
    status_code = 200
    headers = {}

    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


if __name__ == "__main__":
    unittest.main()
