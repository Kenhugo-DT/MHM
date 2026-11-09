import sys
import json
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from candidate_quality import review_candidate_payload
from sync import MusicBrainzClient, WikidataClient, WikipediaClient, collect, membership_candidates


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

    def test_membership_candidates_have_explicit_source_and_direction(self):
        relation = {"type": "member of band", "direction": "forward", "begin": "1978",
                    "artist": {"id": "band-id", "name": "Descendents", "type": "Group"}}
        result = membership_candidates("Bill Stevenson", "artist", "person-id", [relation], set())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["kind"], "band")
        self.assertEqual(result[0]["documented_relation"]["type"], "member_of")
        self.assertEqual(result[0]["documented_relation"]["source_url"],
                         "https://musicbrainz.org/artist/person-id")
        self.assertTrue(review_candidate_payload({"name": "Bill Stevenson", "requested_kind": "artist",
                     "musicbrainz": {"id": "person-id"}, "music_candidates": result}, set())
                        ["candidateStats"]["publishable"])
        self.assertEqual(membership_candidates("Bill Stevenson", "artist", "person-id",
                         [{**relation, "direction": "backward"}], set()), [])

    def test_membership_candidates_block_unrelated_and_duplicate_targets(self):
        relation = {"type": "member of band", "direction": "backward",
                    "artist": {"id": "person-id", "name": "Bill Stevenson", "type": "Person"}}
        results = membership_candidates("Descendents", "band", "band-id",
                                        [relation, relation], set())
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["kind"], "artist")
        self.assertTrue(results[0]["documented_relation"]["seed_is_band"])
        self.assertEqual(membership_candidates("Descendents", "band", "band-id",
                         [relation], {"bill stevenson"}), [])

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
                ], "P227": [
                    {"rank": "normal", "mainsnak": {"datavalue": {"value": "118741713"}}},
                ]},
                "sitelinks": {"enwiki": {"title": "Angel Dust (German band)"}},
            }
        }})

        self.assertEqual(client.identity("Q531613"), {
            "musicbrainz_artist_ids": ["correct-band"],
            "gnd_ids": ["118741713"],
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

    def test_quality_recognizes_musical_collective(self):
        payload = {"name": "Outsidaz", "requested_kind": "band",
                   "wikipedia": {"title": "Outsidaz",
                                 "extract": "The Outsidaz were an American hip hop collective from Newark."}}
        self.assertNotEqual(review_candidate_payload(payload, set())["level"], "reject")

    def test_optional_archive_failure_does_not_lower_core_review_score(self):
        payload = {"name": "Michael Praetorius", "requested_kind": "artist",
                   "wikipedia": {"title": "Michael Praetorius", "extract": "German composer"}}
        baseline = review_candidate_payload(payload, set())
        with_optional_error = review_candidate_payload({
            **payload, "source_lookup_errors": [{"source": "loc", "message": "HTTP 403"}],
        }, set())
        self.assertEqual(with_optional_error["score"], baseline["score"])

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

    def test_related_pages_and_musicbrainz_ids_are_checked_in_batches(self):
        wikipedia = WikipediaClient.__new__(WikipediaClient)
        wikipedia.session = object()
        candidates = [{"title": "Example Band", "kind": "band", "source": "link"}]
        wiki_response = {"query": {"pages": [{
            "title": "Example Band", "extract": "Example Band is a band.",
            "pageprops": {"wikibase_item": "Q123"},
        }]}}
        with patch("sync.get_json_with_backoff", return_value=wiki_response) as get_json:
            pages = wikipedia.candidate_pages(candidates)
        self.assertEqual(pages["Example Band"]["wikidata_id"], "Q123")
        self.assertEqual(get_json.call_args.args[2]["titles"], "Example Band")

        wikidata = WikidataClient.__new__(WikidataClient)
        wikidata.session = object()
        data_response = {"entities": {"Q123": {"claims": {"P434": [{
            "mainsnak": {"datavalue": {"value": "mb-123"}},
        }]}}}}
        with patch("sync.get_json_with_backoff", return_value=data_response):
            self.assertEqual(wikidata.musicbrainz_ids(["Q123"]), {"Q123": ["mb-123"]})

    def test_collection_keeps_public_archive_sources_in_review_payload_only(self):
        class FakeWikidata:
            def search(self, _name, _kind):
                return {"id": "Q108278"}

            def identity(self, _entity_id):
                return {"musicbrainz_artist_ids": [], "gnd_ids": ["118741713"],
                        "wikipedia_title": "Michael Praetorius"}

        class FakeWikipedia:
            def __init__(self, _blocked):
                pass

            def page_for_seed(self, _name, _kind, _title=None):
                return {"title": "Michael Praetorius", "wikidata_id": "Q108278",
                        "extract": "German composer"}

            def music_candidates(self, _page):
                return []

        class FakeSources:
            def gnd_identity(self, gnd_id, name):
                self.gnd_call = (gnd_id, name)
                return {"provider": "gnd", "id": gnd_id, "url": "https://d-nb.info/gnd/118741713"}

            def archive_audio(self, name):
                self.archive_call = name
                return [{"provider": "internet_archive", "url": "https://archive.org/details/score"}]

        source = FakeSources()
        settings = {"MUSICBRAINZ_CONTACT": "", "MHM_ENABLE_GND": "1",
                    "MHM_ENABLE_ARCHIVE_SOURCES": "1", "MHM_ENABLE_LOC": "0"}
        with patch.object(Path, "read_text", return_value=json.dumps([
            {"name": "Michael Praetorius", "kind": "artist"}
        ])), patch("sync.load_blocked_terms", return_value=set()), \
             patch("sync.WikidataClient", FakeWikidata), patch("sync.WikipediaClient", FakeWikipedia), \
             patch("sync.PublicSourceClient", return_value=source), \
             patch("sync.os.getenv", side_effect=lambda key, default="": settings.get(key, default)):
            candidate = collect(Path("unused-seeds.json"))[0]

        self.assertEqual(source.gnd_call, ("118741713", "Michael Praetorius"))
        self.assertEqual(source.archive_call, "Michael Praetorius")
        self.assertEqual(candidate.authority_checks[0]["provider"], "gnd")
        self.assertEqual(candidate.archive_leads[0]["provider"], "internet_archive")
        self.assertEqual(candidate.music_candidates, [])

    def test_collection_keeps_links_as_leads_and_memberships_as_candidates(self):
        class FakeMusicBrainz:
            def __init__(self, _contact):
                pass

            def search(self, _name, _kind):
                return {"id": "seed-mb", "name": "Seed", "type": "Person"}

            def lookup(self, artist_id, name, _kind):
                return {"id": artist_id, "name": name, "type": "Person"}

            def artist_relations(self, _artist_id):
                return [{"type": "member of band", "direction": "forward",
                         "artist": {"id": "mb-123", "name": "Example Band", "type": "Group"}}]

        class FakeWikidata:
            def search(self, _name, _kind):
                return None

            def musicbrainz_ids(self, _ids):
                return {"Q123": ["mb-123"]}

        class FakeWikipedia:
            def __init__(self, _blocked):
                pass

            def page_for_seed(self, _name, _kind, _preferred=None):
                return {"title": "Seed", "extract": "Seed is a musician.",
                        "wikidata_id": "Q999", "musicbrainz_artist_ids": ["seed-mb"]}

            def music_candidates(self, _page):
                return [{"title": "Example Band", "kind": "band", "source": "link"}]

        seed = [{"name": "Seed", "kind": "artist", "zone": "pop-soul-disco"}]
        with patch.object(Path, "read_text", return_value=json.dumps(seed)), \
             patch("sync.MusicBrainzClient", FakeMusicBrainz), patch("sync.WikidataClient", FakeWikidata), \
             patch("sync.WikipediaClient", FakeWikipedia), patch("sync.load_blocked_terms", return_value=set()), \
             patch("sync.os.getenv", return_value="https://example.org"):
            candidate = collect(Path("unused-seeds.json"))[0]

        self.assertEqual(candidate.suggested_zone, "pop-soul-disco")
        self.assertEqual(candidate.music_candidates[0]["musicbrainz"]["type"], "Group")
        self.assertEqual(candidate.link_leads[0]["source"], "link")
        self.assertEqual(review_candidate_payload(candidate.__dict__, set())["candidateStats"]["publishable"], 1)


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
