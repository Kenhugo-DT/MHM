"""Publication is limited to newly approved, evidence-matched membership rows."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publish_reviewed_connection_batch import (  # noqa: E402
    approved_discovered_nodes, approved_relation_rows, new_batch_rows,
)


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

    def test_discovered_band_requires_matching_approval_and_identity(self):
        mbid = "f4a31f0a-51dd-4fa7-986d-3095c40c5ed9"
        band = {"id": f"mb-band-{mbid}", "label": "Evanescence", "type": "band",
                "sources": [{"provider": "musicbrainz",
                             "url": f"https://musicbrainz.org/artist/{mbid}"}]}
        candidate = {**self.candidate, "payload": {**self.candidate["payload"],
                     "connection": {**self.candidate["payload"]["connection"],
                                    "target": band["id"],
                                    "discovery": {"mbid": mbid, "name": "Evanescence"}}}}
        row = {**self.row, "target": band["id"]}
        graph = {"nodes": [band], "edges": [{**self.graph["edges"][0], "target": band["id"]}]}
        self.assertEqual(approved_discovered_nodes([row], {"candidate-1": candidate}, graph)[0]["id"],
                         band["id"])
        with self.assertRaises(ValueError):
            approved_discovered_nodes([row], {"candidate-1": candidate},
                                      {**graph, "nodes": [{**band, "label": "Wrong"}]})
        with self.assertRaises(ValueError):
            approved_discovered_nodes([row], {"candidate-1":
                                      {**candidate, "status": "rejected"}}, graph)


if __name__ == "__main__":
    unittest.main()
