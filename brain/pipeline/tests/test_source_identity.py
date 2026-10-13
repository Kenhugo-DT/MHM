import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sync import MusicBrainzClient, WikidataClient, WikipediaClient


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

    def test_wikidata_skips_nonmusic_name_collision(self):
        client = WikidataClient()
        client.session.get = lambda *_args, **_kwargs: ResponseStub({"search": [
            {"label": "UFO", "description": "unidentified flying object", "id": "phenomenon"},
            {"label": "UFO", "description": "British hard rock band", "id": "band"},
        ]})

        self.assertEqual(client.search("UFO", "band")["id"], "band")

    def test_wikipedia_disambiguation_uses_band_page(self):
        client = WikipediaClient(set())
        pages = {
            "Misfits": {"title": "Misfits", "extract": "Misfits may refer to:", "categories": []},
            "Misfits (band)": {"title": "Misfits (band)", "extract": "American punk band"},
        }
        client.page = pages.get

        self.assertEqual(client.page_for_seed("Misfits", "band")["title"], "Misfits (band)")

    def test_wikipedia_keeps_genre_redirect(self):
        client = WikipediaClient(set())
        client.page = lambda *_: {"title": "Bluegrass music", "extract": "A music genre"}

        self.assertEqual(client.page_for_seed("Bluegrass", "genre")["title"], "Bluegrass music")


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
