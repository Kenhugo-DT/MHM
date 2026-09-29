"""Keep reviewed source updates narrow and refuse conflicting live evidence."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sync_edge_evidence import change_state, reviewed_edges  # noqa: E402


class SyncEdgeEvidenceTests(unittest.TestCase):
    def test_review_requires_existing_sourced_connection(self):
        edge = {
            "id": "bridge", "label": "bridges into", "context": ["Reason"],
            "sources": [{"url": "https://example.com/source"}],
        }
        self.assertEqual(reviewed_edges({"edges": [edge]}, {"edgeIds": ["bridge"]}), [edge])
        for invalid in (
            {"edgeIds": []},
            {"edgeIds": ["bridge", "bridge"]},
            {"edgeIds": ["missing"]},
        ):
            with self.subTest(review=invalid), self.assertRaises(ValueError):
                reviewed_edges({"edges": [edge]}, invalid)
        with self.assertRaises(ValueError):
            reviewed_edges({"edges": [edge | {"label": "Wikipedia link signal"}]},
                           {"edgeIds": ["bridge"]})

    def test_conflicts_never_look_like_pending_updates(self):
        edge = {"sources": [{"url": "https://example.com/new"}], "context": ["New"]}
        self.assertEqual(change_state(edge, {"sources": [], "context": []}), "update")
        self.assertEqual(change_state(edge, edge), "current")
        self.assertEqual(change_state(edge, {"sources": [{"url": "https://example.com/old"}],
                                             "context": []}), "conflict")
        self.assertEqual(change_state(edge, {"sources": [], "context": ["Old"]}), "conflict")


if __name__ == "__main__":
    unittest.main()
