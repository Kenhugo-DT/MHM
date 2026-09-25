import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fact_scout import candidate_leads, eligible_entities, feedback_bias, near_duplicate, scout, wikipedia_title


class FactScoutTests(unittest.TestCase):
    def test_title_requires_english_wikipedia_source(self):
        self.assertEqual(
            wikipedia_title([{"url": "https://en.wikipedia.org/wiki/The_Rolling_Stones"}]),
            "The Rolling Stones",
        )
        self.assertIsNone(wikipedia_title([{"url": "https://example.com/The_Rolling_Stones"}]))

    def test_ranks_specific_leads_but_not_generic_or_superlative(self):
        name_origin = (
            "Upon formation, Malcolm and Angus developed the band's name after their "
            "sister Margaret pointed out the symbol AC/DC on her sewing machine."
        )
        leads = candidate_leads("AC/DC", "band", name_origin)
        self.assertEqual(leads[0]["category"], "name-origin")
        self.assertEqual(leads[0]["evidence"], name_origin)
        self.assertEqual(candidate_leads("AC/DC", "artist", name_origin), [])
        self.assertEqual(candidate_leads("Metallica", "band", "Metallica released many albums and toured widely."), [])
        self.assertEqual(candidate_leads("Metallica", "band", "Metallica was the first band named after a planet."), [])

    def test_instrument_and_recording_stories_and_feedback(self):
        extract = (
            "Brian May built his Red Special guitar with his father from reclaimed wood. "
            "Brian May recorded the demo in three days in a home studio."
        )
        leads = candidate_leads("Brian May", "guitarist", extract)
        self.assertEqual({lead["category"] for lead in leads}, {"instrument-story", "recording-story"})
        boosted = candidate_leads("Brian May", "guitarist", extract, {"recording-story": 2})
        self.assertEqual(boosted[0]["category"], "recording-story")
        diverse = candidate_leads("Brian May", "guitarist", extract, used_categories={"instrument-story"})
        self.assertEqual(diverse[0]["category"], "recording-story")
        self.assertEqual(candidate_leads(
            "Brian May", "guitarist", "Queen invited Brian May to record with the group in 1975."
        ), [])
        self.assertEqual(candidate_leads(
            "The Allman Brothers Band", "band",
            "The Allman Brothers Band was recorded and mixed in two weeks, and proved a positive experience for the ensemble."
        ), [])
        self.assertEqual(candidate_leads(
            "Radiohead", "band",
            "With Deamer, Radiohead recorded The King of Limbs: Live from the Basement, released online in August 2011."
        ), [])

    def test_specific_stories_can_use_an_artist_surname(self):
        injury = (
            "As a teen, Iommi lost the tips of his right-hand ring and middle fingers in a work accident "
            "at a sheet metal factory, which influenced his distinct playing style."
        )
        stage = (
            "Young tried a number of stage costumes, such as Spider-Man, Zorro, a gorilla, "
            "and a parody of Superman named Super-Ang, before settling on his signature schoolboy look."
        )
        self.assertEqual(candidate_leads("Tony Iommi", "guitarist", injury)[0]["category"], "playing-technique")
        self.assertEqual(candidate_leads("Angus Young", "guitarist", stage)[0]["category"], "stage-identity")
        self.assertEqual(candidate_leads(
            "Johnny Cash", "artist", "Cash Loch and other locations in Fife are named after distant ancestors."
        ), [])
        self.assertEqual(candidate_leads(
            "Keith Richards", "guitarist", "Theodora was named after Richards's grandfather, Theodore Augustus Dupree."
        ), [])
        self.assertEqual(candidate_leads(
            "John McLaughlin", "guitarist",
            "John McLaughlin (born 4 January 1942), also previously known as Mahavishnu, is an English guitarist."
        ), [])

    def test_review_decisions_tune_categories_after_three_examples(self):
        facts = [
            {"status": "approved", "tags": ["music-history", "scout-instrument-story"]},
            {"status": "approved", "tags": ["music-history", "scout-instrument-story"]},
            {"status": "rejected", "tags": ["music-history", "scout-instrument-story"]},
            {"status": "rejected", "tags": ["scout-stage-identity"]},
        ]
        self.assertEqual(feedback_bias(facts), {"instrument-story": 1})
        self.assertTrue(near_duplicate("Brian May built a guitar from wood", ["Brian May built a guitar from wood"]))
        self.assertFalse(near_duplicate("Brian May built a guitar from wood", ["Brian May toured with Queen in 1975"]))

    def test_review_and_curated_facts_fill_the_two_fact_limit(self):
        now = datetime.now(UTC)
        source = [{"url": "https://en.wikipedia.org/wiki/Metallica"}]
        entities = [
            {"id": "metallica", "label": "Metallica", "node_type": "band", "sources": source, "map_zone": "metal"},
            {"id": "misfits", "label": "Misfits", "node_type": "band", "sources": source, "map_zone": "punk"},
            {"id": "ramones", "label": "Ramones", "node_type": "band", "sources": source, "map_zone": "punk"},
            {"id": "hard-rock", "label": "Hard rock", "node_type": "genre", "sources": source, "map_zone": "metal"},
        ]
        facts = [{"entity_id": "misfits", "status": "review"}]
        curated = [
            {"entityId": "metallica"}, {"entityId": "metallica"},
            {"entityId": "misfits"},
        ]
        attempts = [{"entity_id": "ramones", "attempted_at": now.isoformat(), "outcome": "no_match"}]
        self.assertEqual(eligible_entities(entities, facts, attempts, curated, now), [])
        attempts[0]["attempted_at"] = (now - timedelta(days=31)).isoformat()
        self.assertEqual([row["id"] for row in eligible_entities(entities, facts, attempts, curated, now)], ["ramones"])

    def test_zones_are_interleaved_instead_of_scanning_one_genre(self):
        now = datetime.now(UTC)
        source = [{"url": "https://en.wikipedia.org/wiki/Example"}]
        entities = [
            {"id": f"punk-{index}", "node_type": "band", "sources": source, "map_zone": "punk"}
            for index in range(3)
        ] + [{"id": "jazz-1", "node_type": "artist", "sources": source, "map_zone": "jazz"}]
        ids = [row["id"] for row in eligible_entities(entities, [], [], [], now)]
        self.assertIn("jazz-1", ids[:2])

    def test_blocked_entities_are_not_scouted_even_if_still_in_database(self):
        source = [{"url": "https://en.wikipedia.org/wiki/Bandcamp"}]
        entities = [{"id": "bandcamp", "node_type": "band", "sources": source, "map_zone": "rock"}]
        self.assertEqual(eligible_entities(entities, [], [], [], datetime.now(UTC)), [])

    def test_preview_does_not_write_and_publish_stays_in_review(self):
        article = (
            "Example Band was originally known as The Examples before the debut show. "
            "Example Band recorded its first demo in three days in a garage."
        )
        entity = {
            "id": "example-band", "label": "Example Band", "node_type": "band",
            "sources": [{"url": "https://en.wikipedia.org/wiki/Example_Band"}], "map_zone": "rock",
        }
        rows = {"entities": [entity], "entity_facts": [], "fact_scout_attempts": []}
        client = MagicMock()
        with patch("fact_scout.all_rows", side_effect=lambda _, table, *args: rows[table]), patch(
            "fact_scout.fetch_article", return_value=(article, "https://en.wikipedia.org/wiki/Example_Band")
        ):
            preview = scout(client, publish=False, limit=1, max_lookup=1)
            self.assertEqual(preview["lookups"], 1)
            self.assertEqual(len(preview["proposals"]), 1)
            client.table.assert_not_called()

            published = scout(client, publish=True, limit=1, max_lookup=1)
            self.assertEqual(len(published["proposals"]), 1)
            proposal = client.table.return_value.insert.call_args.args[0]
            self.assertEqual(proposal["status"], "review")
            self.assertIn("scout-name-origin", proposal["tags"])
            self.assertEqual(len(proposal["sources"]), 1)
            self.assertEqual(client.table.return_value.upsert.call_args.args[0]["outcome"], "proposed")

            client.reset_mock()
            targeted = scout(client, publish=False, limit=1, max_lookup=1, target_ids={"another-band"})
            self.assertEqual(targeted["lookups"], 0)
            self.assertEqual(targeted["proposals"], [])
            client.table.assert_not_called()


if __name__ == "__main__":
    unittest.main()
