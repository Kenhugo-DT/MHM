import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from source_enrichment import PublicSourceClient, SOURCE_LOOKUP_LIMIT, authority_name_matches


class Response:
    status_code = 200
    headers = {}

    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


class Session:
    def __init__(self, payload):
        self.headers = {}
        self.payload = payload
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return Response(self.payload)


class SourceEnrichmentTests(unittest.TestCase):
    def test_gnd_requires_exact_authority_id_and_person_name(self):
        payload = {"id": "https://d-nb.info/gnd/118741713", "preferredName": "Praetorius, Michael",
                   "type": ["DifferentiatedPerson", "AuthorityResource", "Person"]}
        session = Session(payload)
        client = PublicSourceClient(session)
        self.assertEqual(client.gnd_identity("118741713", "Michael Praetorius")["provider"], "gnd")
        self.assertEqual(len(session.calls), 1)
        self.assertEqual(client.gnd_identity("118741713", "Michael Praetorius")["provider"], "gnd")
        self.assertEqual(len(session.calls), 1)
        self.assertIsNone(client.gnd_identity("wrong/id", "Michael Praetorius"))
        self.assertEqual(len(session.calls), 1)
        self.assertIsNone(client.gnd_identity("118741713", "Another Praetorius"))
        self.assertTrue(authority_name_matches("Praetorius, Michael", "Michael Praetorius"))

    def test_archive_returns_only_exact_creator_audio_leads(self):
        session = Session({"response": {"docs": [
            {"identifier": "record-1", "title": "Song", "creator": ["Bessie Smith"]},
            {"identifier": "record-2", "title": "Other", "creator": ["Bessie Smith Jr."]},
            {"identifier": "../escape", "title": "Bad", "creator": ["Bessie Smith"]},
        ]}})
        leads = PublicSourceClient(session).archive_audio("Bessie Smith")
        self.assertEqual([lead["url"] for lead in leads], ["https://archive.org/details/record-1"])
        self.assertEqual(leads[0]["match"], "exact_creator_metadata_only")
        self.assertEqual(session.calls[0][1]["params"]["rows"], 5)

    def test_loc_requires_exact_contributor_and_canonical_item_url(self):
        session = Session({"results": [
            {"id": "http://www.loc.gov/item/123/", "title": "Score", "contributor": ["Michael Praetorius"]},
            {"id": "https://example.org/item/2", "title": "Wrong host", "contributor": ["Michael Praetorius"]},
            {"id": "https://www.loc.gov/item/3/", "title": "Namesake", "contributor": ["Another Praetorius"]},
        ]})
        leads = PublicSourceClient(session).loc_items("Michael Praetorius")
        self.assertEqual([lead["url"] for lead in leads], ["https://www.loc.gov/item/123/"])

    def test_network_budget_is_hard_capped(self):
        session = Session({})
        client = PublicSourceClient(session)
        client.request_count = SOURCE_LOOKUP_LIMIT
        with self.assertRaisesRegex(RuntimeError, "budget exhausted"):
            client.gnd_identity("118741713", "Michael Praetorius")
        self.assertEqual(session.calls, [])


if __name__ == "__main__":
    unittest.main()
