"""Typed relationship candidates must never become generic research nodes."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from promote_candidates import build_patch  # noqa: E402


class ConnectionPromotionIsolationTests(unittest.TestCase):
    def test_generic_promoter_skips_typed_connection(self):
        row = {
            "id": "connection-review-example",
            "payload": {
                "kind": "typed_connection",
                "name": "Person -> Band",
                "requested_kind": "artist",
                "connection": {"source": "person", "target": "band"},
            },
        }
        patch = build_patch([row], max_new_nodes=10, max_per_seed=3)
        self.assertEqual(patch["nodes"], [])
        self.assertEqual(patch["edges"], [])
        self.assertEqual(patch["candidateRows"], [])
        self.assertIn("Typed connection", patch["skipped"][0]["reason"])


if __name__ == "__main__":
    unittest.main()
