import hashlib
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wikidata_fact_scout import (
    claim_leads, eligible_entities, external_references, fetch_entities, identity_matches, scout, wikidata_qid,
)


def entity(entity_id="example-band", node_type="band", qid="Q123"):
    return {
        "id": entity_id, "label": "Example Band", "node_type": node_type, "map_zone": "rock",
        "sources": [
            {"url": "https://en.wikipedia.org/wiki/Example_Band"},
            {"url": f"https://www.wikidata.org/wiki/{qid}"},
        ],
    }


def statement(reference_url=None):
    references = [] if reference_url is None else [{"snaks": {"P854": [
        {"datavalue": {"value": reference_url}},
    ]}}]
    return {
        "id": "Q123$statement-1", "mainsnak": {"datavalue": {"value": {"id": "Q456"}}},
        "references": references,
    }


def item(claim):
    return {"sitelinks": {"enwiki": {"title": "Example Band"}}, "claims": {"P138": [claim]}}


class WikidataFactScoutTests(unittest.TestCase):
    def test_source_id_requires_exact_https_wikidata_url(self):
        self.assertEqual(wikidata_qid(entity()["sources"]), "Q123")
        self.assertIsNone(wikidata_qid([{"url": "https://evil.example/wiki/Q123"}]))
        self.assertIsNone(wikidata_qid([{"url": "http://www.wikidata.org/wiki/Q123"}]))
        self.assertIsNone(wikidata_qid([{"url": "https://www.wikidata.org/wiki/Q123/extra"}]))

    def test_sitelink_catches_wrong_subject_even_with_similar_name(self):
        self.assertTrue(identity_matches(entity(), item(statement())))
        self.assertFalse(identity_matches(entity(), {
            "sitelinks": {"enwiki": {"title": "Example Band discography"}},
        }))
        self.assertFalse(identity_matches(entity(), {"labels": {"en": {"value": "Example Band"}}}))

    def test_direct_reference_must_be_external_https(self):
        self.assertEqual(external_references(statement("https://example.org/history")), ["https://example.org/history"])
        self.assertEqual(external_references(statement("http://example.org/history")), [])
        self.assertEqual(external_references(statement("https://en.wikipedia.org/wiki/Example_Band")), [])
        self.assertEqual(external_references(statement("https://www.wikidata.org/wiki/Q123")), [])

    def test_all_types_can_be_eligible_and_two_facts_are_full(self):
        rows = [entity("a", "genre"), entity("b", "guitar_brand"), entity("c", "band")]
        facts = [{"entity_id": "c", "status": "approved"}, {"entity_id": "c", "status": "review"}]
        self.assertEqual({row["id"] for row in eligible_entities(rows, facts, [])}, {"a", "b"})

    def test_name_origin_and_birth_name_are_specific_claims(self):
        leads = claim_leads(entity(), item(statement()), {
            "Q456": {"labels": {"en": {"value": "a historic song from the 1970s"}}},
        })
        self.assertEqual(leads[0]["category"], "name-origin")
        self.assertIn("historic song", leads[0]["text"])
        artist = entity(node_type="artist")
        artist["label"] = "Stage Name"
        birth_name = {
            "claims": {"P1477": [{
                "id": "Q123$birth", "mainsnak": {"datavalue": {"value": {
                    "text": "A Different Name", "language": "en",
                }}},
            }]},
        }
        self.assertEqual(claim_leads(artist, birth_name, {})[0]["category"], "birth-name")
        artist["label"] = "Amy Lee"
        birth_name["claims"]["P1477"][0]["mainsnak"]["datavalue"]["value"]["text"] = "Amy Lynn Lee"
        self.assertEqual(claim_leads(artist, birth_name, {}), [])

    def test_uncited_lead_stays_out_of_review_even_when_publish_requested(self):
        client = MagicMock()
        rows = {"entities": [entity()], "entity_facts": []}
        target = {"Q456": {"labels": {"en": {"value": "a historic song from the 1970s"}}}}
        with patch("wikidata_fact_scout.all_rows", side_effect=lambda _, table, *args: rows[table]), patch(
            "wikidata_fact_scout.fetch_entities", side_effect=[{"Q123": item(statement())}, target]
        ):
            result = scout(client, publish=True, limit=2, max_lookup=1)
        self.assertEqual(len(result["researchLeads"]), 1)
        self.assertEqual(result["reviewProposals"], [])
        client.table.assert_not_called()

    def test_cited_lead_preview_then_private_review_only(self):
        client = MagicMock()
        rows = {"entities": [entity()], "entity_facts": []}
        source = "https://example.org/band-history"
        targets = {"Q456": {"labels": {"en": {"value": "a historic song from the 1970s"}}}}
        with patch("wikidata_fact_scout.all_rows", side_effect=lambda _, table, *args: rows[table]), patch(
            "wikidata_fact_scout.fetch_entities", side_effect=[{"Q123": item(statement(source))}, targets,
                                                               {"Q123": item(statement(source))}, targets]
        ):
            preview = scout(client, publish=False, limit=2, max_lookup=1)
            self.assertEqual(len(preview["reviewProposals"]), 1)
            client.table.assert_not_called()
            published = scout(client, publish=True, limit=2, max_lookup=1)
        self.assertEqual(len(published["reviewProposals"]), 1)
        proposal = client.table.return_value.insert.call_args.args[0]
        self.assertEqual(proposal["status"], "review")
        self.assertEqual(len(proposal["sources"]), 2)
        self.assertEqual(proposal["sources"][1]["url"], source)

    def test_identity_mismatch_and_duplicate_do_not_write(self):
        client = MagicMock()
        rows = {"entities": [entity()], "entity_facts": []}
        wrong = {"sitelinks": {"enwiki": {"title": "Example Band discography"}}}
        with patch("wikidata_fact_scout.all_rows", side_effect=lambda _, table, *args: rows[table]), patch(
            "wikidata_fact_scout.fetch_entities", return_value={"Q123": wrong}
        ):
            result = scout(client, publish=True, limit=2, max_lookup=1)
        self.assertEqual(result["identityMismatches"][0]["actual"], "Example Band discography")
        client.table.assert_not_called()

        previous = {
            "entity_id": "example-band", "status": "rejected", "text": "Old wording",
            "source_fingerprint": hashlib.sha256(b"Q123\nQ123$statement-1").hexdigest(),
        }
        rows["entity_facts"] = [previous]
        targets = {"Q456": {"labels": {"en": {"value": "a historic song from the 1970s"}}}}
        with patch("wikidata_fact_scout.all_rows", side_effect=lambda _, table, *args: rows[table]), patch(
            "wikidata_fact_scout.fetch_entities", side_effect=[
                {"Q123": item(statement("https://example.org/history"))}, targets,
            ]
        ):
            result = scout(client, publish=True, limit=2, max_lookup=1)
        self.assertEqual(result["reviewProposals"], [])
        client.table.assert_not_called()

    def test_lookup_has_a_hard_cap(self):
        with self.assertRaises(ValueError):
            scout(MagicMock(), publish=False, limit=1, max_lookup=21)
        with self.assertRaises(ValueError):
            scout(MagicMock(), publish=False, limit=6, max_lookup=1)

    def test_api_retries_rate_limit(self):
        limited = MagicMock(status_code=429, headers={"Retry-After": "0"})
        success = MagicMock(status_code=200)
        success.json.return_value = {"entities": {"Q123": {"id": "Q123"}}}
        session = MagicMock()
        session.get.side_effect = [limited, success]
        with patch("wikidata_fact_scout.time.sleep") as sleep:
            self.assertEqual(fetch_entities(session, ["Q123"])["Q123"]["id"], "Q123")
        sleep.assert_called_once_with(0)
        self.assertEqual(session.get.call_count, 2)

    def test_offset_selects_another_batch(self):
        client = MagicMock()
        rows = {"entities": [entity("first"), entity("second")], "entity_facts": []}
        with patch("wikidata_fact_scout.all_rows", side_effect=lambda _, table, *args: rows[table]), patch(
            "wikidata_fact_scout.fetch_entities", return_value={"Q123": {"sitelinks": {"enwiki": {"title": "Example Band"}}}}
        ) as fetch:
            result = scout(client, publish=False, limit=1, max_lookup=1, offset=1)
        self.assertEqual(result["lookups"], 1)
        self.assertEqual(result["offset"], 1)
        fetch.assert_called_once()


if __name__ == "__main__":
    unittest.main()
