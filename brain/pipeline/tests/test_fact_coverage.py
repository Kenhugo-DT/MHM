import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fact_coverage import coverage


class FactCoverageTests(unittest.TestCase):
    def test_counts_approved_and_curated_across_all_types(self):
        entities = [
            {"id": "jazz", "label": "Jazz", "node_type": "genre", "map_zone": "jazz"},
            {"id": "fender", "label": "Fender", "node_type": "guitar_brand", "map_zone": "workshop"},
            {"id": "strat", "label": "Stratocaster", "node_type": "guitar", "map_zone": "workshop"},
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
        self.assertEqual(result["byType"]["genre"], {"total": 1, "covered": 1})


if __name__ == "__main__":
    unittest.main()
