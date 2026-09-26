import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fact_coverage import coverage, research_sources


class FactCoverageTests(unittest.TestCase):
    def test_counts_approved_and_curated_across_all_types(self):
        entities = [
            {"id": "jazz", "label": "Jazz", "node_type": "genre", "map_zone": "jazz",
             "sources": [{"url": "https://en.wikipedia.org/wiki/Jazz"}]},
            {"id": "fender", "label": "Fender", "node_type": "guitar_brand", "map_zone": "workshop"},
            {"id": "strat", "label": "Stratocaster", "node_type": "guitar", "map_zone": "workshop",
             "sources": [{"url": "https://www.wikidata.org/wiki/Q123"},
                         {"url": "https://en.wikipedia.org/wiki/Fender_Stratocaster"}]},
            {"id": "blocked", "label": "Bad", "node_type": "band", "map_zone": "jazz"},
        ]
        result = coverage(
            entities,
            [{"entity_id": "fender", "status": "approved"}, {"entity_id": "strat", "status": "review"}],
            [{"entityId": "jazz"}],
            {"blocked"},
        )
        self.assertEqual((result["total"], result["covered"], result["missing"]), (3, 2, 1))
        self.assertEqual(result["nextUncovered"][0]["id"], "strat")
        self.assertEqual(result["nextUncovered"][0]["researchSources"], ["wikidata", "wikipedia"])
        self.assertEqual(result["byResearchSource"]["wikidata"], {"total": 1, "uncovered": 1})
        self.assertEqual(result["byResearchSource"]["wikipedia"], {"total": 2, "uncovered": 1})
        self.assertEqual(result["byType"]["genre"], {"total": 1, "covered": 1})

    def test_only_known_https_hosts_count_as_research_sources(self):
        self.assertEqual(research_sources([
            {"provider": "wikidata", "url": "https://example.com/wiki/Q123"},
            {"url": "http://musicbrainz.org/artist/123"},
            {"url": "https://musicbrainz.org/artist/123"},
            {"url": "https://musicbrainz.org/artist/123"},
            {"url": "https://[broken"},
            {"url": None},
        ]), ["musicbrainz"])


if __name__ == "__main__":
    unittest.main()
