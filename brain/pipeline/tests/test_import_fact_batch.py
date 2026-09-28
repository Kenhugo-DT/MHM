import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from import_fact_batch import DEFAULT_BATCH, GRAPH_PATH, CURATED_PATH, prepare_batch


class ImportFactBatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.batch = json.loads(DEFAULT_BATCH.read_text(encoding="utf-8"))
        cls.nodes = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))["nodes"]
        cls.curated = json.loads(CURATED_PATH.read_text(encoding="utf-8"))

    def test_sixty_sourced_review_proposals(self):
        rows, errors = prepare_batch(self.batch, self.nodes, self.curated, [])
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), 60)
        self.assertTrue(all(row["status"] == "review" for row in rows))
        self.assertTrue(all(row["sources"][0]["url"].startswith("https://") for row in rows))

    def test_repeat_import_is_idempotent(self):
        rows, _ = prepare_batch(self.batch, self.nodes, self.curated, [])
        existing = [{**row, "id": str(index)} for index, row in enumerate(rows)]
        again, errors = prepare_batch(self.batch, self.nodes, self.curated, existing)
        self.assertEqual(errors, [])
        self.assertEqual(again, [])

    def test_rejects_missing_source_and_saturated_node(self):
        batch = {**self.batch, "facts": [self.batch["facts"][0][:-2] + ["absent", "evidence"]]}
        _, errors = prepare_batch(batch, self.nodes, self.curated, [])
        self.assertTrue(any("missing source" in error for error in errors))
        batch = {**self.batch, "facts": [self.batch["facts"][0]]}
        existing = [{"entity_id": "kiss", "status": "review", "text": "One unrelated fact.",
                     "source_fingerprint": "one"},
                    {"entity_id": "kiss", "status": "approved", "text": "Another unrelated fact.",
                     "source_fingerprint": "two"}]
        _, errors = prepare_batch(batch, self.nodes, self.curated, existing)
        self.assertTrue(any("more than two" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
