"""Timeline provenance must survive the approved-graph to Supabase mapping."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_graph import entity_row  # noqa: E402


class ImportGraphEraTests(unittest.TestCase):
    def test_start_year_and_evidence_are_preserved(self):
        evidence = {
            "basis": "group_formation",
            "note": "Two sources agree.",
            "sources": [{"label": "Source", "url": "https://example.org/history"}],
        }
        row = entity_row({"id": "example", "label": "Example", "type": "band",
                          "eraStart": 1975, "eraStartEvidence": evidence})
        self.assertEqual(row["era_start"], 1975)
        self.assertEqual(row["era_start_evidence"], evidence)

    def test_undated_node_stays_undated(self):
        row = entity_row({"id": "unknown", "label": "Unknown", "type": "band"})
        self.assertIsNone(row["era_start"])
        self.assertIsNone(row["era_start_evidence"])

    def test_orphaned_or_invalid_evidence_is_rejected(self):
        with self.assertRaises(ValueError):
            entity_row({"id": "orphan", "label": "Orphan", "type": "band",
                        "eraStartEvidence": {"basis": "unknown"}})
        with self.assertRaises(ValueError):
            entity_row({"id": "invalid", "label": "Invalid", "type": "band",
                        "eraStart": 1200})
        with self.assertRaises(ValueError):
            entity_row({"id": "boolean", "label": "Boolean", "type": "band",
                        "eraStart": True})
        with self.assertRaises(ValueError):
            entity_row({"id": "non-object", "label": "Non-object", "type": "band",
                        "eraStart": 1975, "eraStartEvidence": []})


if __name__ == "__main__":
    unittest.main()
