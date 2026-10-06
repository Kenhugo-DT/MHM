"""Connection leads enter review without acquiring approval implicitly."""

import sys
import re
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publish_connection_candidates import candidate_payloads, new_run_id  # noqa: E402


class ConnectionCandidateTests(unittest.TestCase):
    def setUp(self):
        self.nodes = {
            "person": {"id": "person", "label": "Person", "type": "artist"},
            "band": {"id": "band", "label": "Band", "type": "band"},
        }
        self.proposal = {
            "id": "mb-member-person-band", "source": "person", "target": "band",
            "type": "member_of", "status": "review",
            "evidence": {"relationTypeId": "5be4c609-9afa-4ea0-910b-12ffb71e3821"},
        }

    def test_new_lead_is_review_only(self):
        rows = candidate_payloads({"version": 1, "proposals": [self.proposal]}, set(), self.nodes)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "review")
        self.assertEqual(rows[0]["name"], "Person -> Band")
        self.assertEqual(rows[0]["kind"], "typed_connection")
        self.assertEqual(candidate_payloads({"version": 1, "proposals": [self.proposal]},
                                            {self.proposal["id"]}, self.nodes), [])

    def test_invalid_leads_fail_closed(self):
        with self.assertRaises(ValueError):
            candidate_payloads({"version": 1, "proposals": [
                {**self.proposal, "status": "approved"}]}, set(), self.nodes)
        with self.assertRaises(ValueError):
            candidate_payloads({"version": 1, "proposals": [
                {**self.proposal, "target": "missing"}]}, set(), self.nodes)
        with self.assertRaises(ValueError):
            candidate_payloads({"version": 1, "proposals": [self.proposal, self.proposal]},
                               set(), self.nodes)

    def test_run_id_matches_supabase_constraint(self):
        self.assertRegex(new_run_id(), re.compile(r"^[a-z0-9][a-z0-9-]*$"))


if __name__ == "__main__":
    unittest.main()
