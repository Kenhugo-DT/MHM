"""Publication is limited to newly approved, evidence-matched membership rows."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publish_reviewed_connection_batch import approved_relation_rows, new_batch_rows  # noqa: E402


class PublishReviewedConnectionsTests(unittest.TestCase):
    def setUp(self):
        self.row = {"id": "candidate-1", "kind": "typed_connection", "edgeId": "edge-1",
                    "source": "person", "target": "band"}
        source = {"provider": "musicbrainz",
                  "url": "https://musicbrainz.org/artist/person-id/relationships"}
        self.candidate = {"id": "candidate-1", "status": "approved", "payload": {
            "kind": "typed_connection", "connection": {
                "id": "edge-1", "source": "person", "target": "band", "type": "member_of",
                "sources": [source], "evidence": {
                    "relationTypeId": "5be4c609-9afa-4ea0-910b-12ffb71e3821"}}}}
        self.graph = {"edges": [{"id": "edge-1", "source": "person", "target": "band",
                                 "type": "member_of", "label": "Member of", "sources": [source]}]}

    def test_only_new_reviewed_row_is_selected(self):
        self.assertEqual(new_batch_rows({"candidateRows": []},
                                        {"candidateRows": [self.row]}), [self.row])
        with self.assertRaises(ValueError):
            new_batch_rows({"candidateRows": [self.row]},
                           {"candidateRows": [{**self.row, "source": "someone-else"}]})

    def test_publication_requires_matching_approval_and_source(self):
        rows = approved_relation_rows([self.row], {"candidate-1": self.candidate}, self.graph)
        self.assertEqual(rows[0]["source_id"], "person")
        self.assertEqual(rows[0]["sources"], self.graph["edges"][0]["sources"])
        with self.assertRaises(ValueError):
            approved_relation_rows([self.row], {"candidate-1": {
                **self.candidate, "status": "rejected"}}, self.graph)
        with self.assertRaises(ValueError):
            approved_relation_rows([self.row], {"candidate-1": self.candidate}, {
                "edges": [{**self.graph["edges"][0], "sources": [
                    {"provider": "musicbrainz", "url": "https://musicbrainz.org/artist/other"}]}]})


if __name__ == "__main__":
    unittest.main()
