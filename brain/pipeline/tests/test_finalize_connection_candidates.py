"""Published status follows the committed edge and live relation, never just approval."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from finalize_connection_candidates import (  # noqa: E402
    candidate_matches_manifest, live_relation_matches, reviewed_rows,
)


class FinalizeConnectionTests(unittest.TestCase):
    def setUp(self):
        self.row = {"id": "candidate-1", "kind": "typed_connection",
                    "edgeId": "mb-member-person-band", "source": "person", "target": "band"}
        self.candidate = {"status": "approved", "payload": {
            "kind": "typed_connection", "connection": {
                "id": self.row["edgeId"], "source": "person", "target": "band"}}}
        self.graph = {"edges": [{"id": self.row["edgeId"], "source": "person",
                                 "target": "band", "type": "member_of",
                                 "sources": [{"provider": "musicbrainz"}]}]}
        self.relation = {"source_id": "person", "target_id": "band",
                         "relation_type": "member_of", "label": "Member of",
                         "sources": [{"provider": "musicbrainz"}]}

    def test_approval_and_readback_both_match(self):
        self.assertEqual(reviewed_rows({"candidateRows": [self.row]}), [self.row])
        self.assertTrue(candidate_matches_manifest(self.row, self.candidate, self.graph))
        self.assertTrue(live_relation_matches(self.row, self.relation))

    def test_revoked_or_missing_evidence_blocks_finalization(self):
        self.assertFalse(candidate_matches_manifest(self.row,
                                                    {**self.candidate, "status": "rejected"},
                                                    self.graph))
        self.assertFalse(candidate_matches_manifest(self.row, self.candidate, {"edges": []}))
        self.assertFalse(live_relation_matches(self.row, None))
        self.assertFalse(live_relation_matches(self.row,
                                               {**self.relation, "sources": []}))


if __name__ == "__main__":
    unittest.main()
