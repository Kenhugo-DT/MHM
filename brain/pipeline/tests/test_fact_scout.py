import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fact_scout import candidate_sentence, eligible_entities, propose_fact, wikipedia_title


class FakeSession:
    def __init__(self, answer):
        self.answer = answer

    def post(self, *args, **kwargs):
        class Response:
            def __init__(self, answer):
                self.answer = answer

            def raise_for_status(self):
                pass

            def json(self):
                return {"output": [{"type": "message", "content": [
                    {"type": "output_text", "text": self.answer},
                ]}]}

        return Response(self.answer)


class FactScoutTests(unittest.TestCase):
    def test_title_requires_english_wikipedia_source(self):
        self.assertEqual(
            wikipedia_title([{"url": "https://en.wikipedia.org/wiki/The_Rolling_Stones"}]),
            "The Rolling Stones",
        )
        self.assertIsNone(wikipedia_title([{"url": "https://example.com/The_Rolling_Stones"}]))

    def test_selects_specific_lead_but_not_generic_or_superlative(self):
        extract = (
            "The group released several records. "
            "The first band named after a planet won a prize. "
            "Metallica was originally known as a different name before its first show. "
        )
        self.assertIsNone(candidate_sentence("The Beatles", extract))
        self.assertIsNone(candidate_sentence("Metallica", extract))
        self.assertEqual(
            candidate_sentence("Metallica", "Metallica was originally known as a different name before touring."),
            "Metallica was originally known as a different name before touring.",
        )
        self.assertEqual(
            candidate_sentence("Ramones", "The band was originally known as another name for a short period."),
            "Ramones was originally known as another name for a short period.",
        )

    def test_review_and_curated_facts_fill_the_two_fact_limit(self):
        now = datetime.now(UTC)
        source = [{"url": "https://en.wikipedia.org/wiki/Metallica"}]
        entities = [
            {"id": "metallica", "label": "Metallica", "node_type": "band", "sources": source},
            {"id": "misfits", "label": "Misfits", "node_type": "band", "sources": source},
            {"id": "ramones", "label": "Ramones", "node_type": "band", "sources": source},
            {"id": "hard-rock", "label": "Hard rock", "node_type": "genre", "sources": source},
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

    def test_model_lead_requires_exact_evidence_and_paraphrase(self):
        article = "Ramones took their name from Paul McCartney's early stage name, Paul Ramon."
        good = '{"text":"Ramones borrowed their band name from a stage name once used by Paul McCartney.","evidence":"' + article + '"}'
        self.assertEqual(
            propose_fact(FakeSession(good), "Ramones", "band", article, "test-key"),
            ("Ramones borrowed their band name from a stage name once used by Paul McCartney.", article),
        )
        unsupported = good.replace("Paul Ramon.", "John Lennon.")
        self.assertIsNone(propose_fact(FakeSession(unsupported), "Ramones", "band", article, "test-key"))
        copied = '{"text":"' + article + '","evidence":"' + article + '"}'
        self.assertIsNone(propose_fact(FakeSession(copied), "Ramones", "band", article, "test-key"))


if __name__ == "__main__":
    unittest.main()
