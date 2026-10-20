import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from research_learning import (  # noqa: E402
    build_learning_model, fetch_review_rows, prepare_decisions, priority_adjustment,
)
from scout_agent import (  # noqa: E402
    organization_frontier_request, public_priority_adjustment,
    select_frontier_seeds, should_activate_learning, snapshot_issue,
    write_learning_report,
)


def graph():
    return {"nodes": [
        {"id": "jazz-1", "label": "Jazz One", "type": "band", "zone": "jazz"},
        {"id": "jazz-2", "label": "Jazz Two", "type": "band", "zone": "jazz"},
        {"id": "jazz-3", "label": "Jazz Three", "type": "band", "zone": "jazz"},
        {"id": "rock-1", "label": "Rock One", "type": "band", "zone": "rock"},
        {"id": "rock-2", "label": "Rock Two", "type": "band", "zone": "rock"},
        {"id": "rock-3", "label": "Rock Three", "type": "band", "zone": "rock"},
    ], "edges": []}


def row(index, seed, status, reason=None, kind="band"):
    return {
        "id": f"candidate-{index:03d}", "seed_name": seed,
        "requested_kind": kind, "status": status,
        "review_reason_code": reason, "payload": {},
        "updated_at": f"2026-10-{1 + index // 20:02d}T{index % 20:02d}:00:00Z",
    }


class ResearchLearningTests(unittest.TestCase):
    def test_duplicates_identity_failures_and_connection_reviews_do_not_penalize_zone(self):
        rows = [
            row(0, "Jazz One", "approved"),
            row(1, "Jazz One", "rejected", "duplicate"),
            row(2, "Jazz One", "rejected", "wrong_entity"),
            row(3, "Jazz One", "rejected", "not_relevant"),
            {**row(4, "Jazz One", "rejected"), "reason": "Already in graph"},
            {**row(5, "Jazz One", "approved"), "payload": {"kind": "typed_connection"}},
            row(6, "Rock One", "rejected"),
        ]
        decisions, skipped = prepare_decisions(rows, graph())
        self.assertEqual([item["id"] for item in decisions], [
            "candidate-000", "candidate-003", "candidate-006"
        ])
        self.assertEqual(skipped["rejection_not_about_frontier"], 3)
        self.assertEqual(skipped["connection_review"], 1)
        self.assertEqual(decisions[-1]["weight"], 0.2)

    def test_review_outcomes_change_shadow_ranking_with_traceable_reasons(self):
        rows = [
            row(index, "Rock One", "approved") if index % 2 == 0
            else row(index, "Jazz One", "rejected", "not_relevant")
            for index in range(60)
        ]
        model = build_learning_model(rows, graph())
        rock = priority_adjustment(model, "band", "rock")
        jazz = priority_adjustment(model, "band", "jazz")
        self.assertGreater(rock["score"], 0)
        self.assertLess(jazz["score"], 0)
        self.assertTrue(rock["reasons"][0]["reviewExamples"])
        self.assertEqual(model["validation"]["holdoutCount"], 12)
        self.assertGreaterEqual(model["validation"]["holdoutApproved"], 3)
        self.assertGreaterEqual(model["validation"]["holdoutRejected"], 3)
        self.assertLess(model["validation"]["learnedBrier"],
                        model["validation"]["baselineBrier"])
        self.assertTrue(model["activationEligible"])
        self.assertNotIn("reviewExamples", public_priority_adjustment(model, "band", "rock")["reasons"][0])
        with patch.object(Path, "mkdir"), patch.object(Path, "write_text") as write:
            write_learning_report(model)
        report = write.call_args.args[0]
        self.assertNotIn("candidate-", report)
        self.assertIn('"approved"', report)

        baseline = select_frontier_seeds(graph(), set(), set(), 3)
        learned = select_frontier_seeds(graph(), set(), set(), 3, model)
        self.assertEqual(baseline[0]["name"], "Jazz One")
        self.assertEqual(learned[0]["name"], "Rock One")

        recommendations = {"recommendedResearchRequests": [
            {"id": "jazz-request", "priority": 50,
             "seeds": [{"name": "Jazz One", "kind": "band"}]},
            {"id": "rock-request", "priority": 50,
             "seeds": [{"name": "Rock One", "kind": "band"}]},
        ]}
        with patch("scout_agent.load_organization_model", return_value=recommendations):
            self.assertEqual(organization_frontier_request(set(), set())["id"], "jazz-request")
            self.assertEqual(organization_frontier_request(set(), set(), graph(), model)["id"],
                             "rock-request")

    def test_sparse_or_ambiguous_feedback_cannot_activate_itself(self):
        rows = [row(index, "Rock One", "approved") for index in range(12)]
        model = build_learning_model(rows, graph())
        self.assertFalse(model["activationEligible"])
        self.assertEqual(model["validation"]["holdoutCount"], 0)
        self.assertEqual(priority_adjustment(model, "band", "rock")["score"], 0)

    def test_holdout_requires_both_outcomes(self):
        rows = [
            row(index, "Jazz One", "rejected", "not_relevant") if index < 12
            else row(index, "Rock One", "approved")
            for index in range(60)
        ]
        model = build_learning_model(rows, graph())
        self.assertEqual(model["validation"]["holdoutRejected"], 0)
        self.assertFalse(model["eligibilityChecks"]["holdoutHasBothOutcomes"])
        self.assertFalse(model["activationEligible"])

    def test_auto_mode_requires_validated_model_and_stored_snapshot(self):
        model = {"activationEligible": True}
        self.assertFalse(should_activate_learning("shadow", model, True))
        self.assertFalse(should_activate_learning("auto", model, False))
        self.assertTrue(should_activate_learning("auto", model, True))
        self.assertFalse(should_activate_learning("auto", {"activationEligible": False}, True))

    def test_snapshot_error_names_missing_migration_without_leaking_message(self):
        class MissingTableError(Exception):
            code = "PGRST205"

        issue = snapshot_issue(MissingTableError("private token must not appear"))
        self.assertEqual(issue["code"], "PGRST205")
        self.assertIn("0007_research_learning.sql", issue["hint"])
        self.assertNotIn("private token", str(issue))

    def test_fetches_all_pages_of_reviewed_candidates_only(self):
        class Query:
            def __init__(self):
                self.calls = []

            def select(self, value):
                return self

            def in_(self, field, statuses):
                self.calls.append((field, statuses))
                return self

            def order(self, field):
                return self

            def range(self, first, last):
                self.start, self.end = first, last
                return self

            def execute(self):
                self.data = [{"id": str(index)} for index in range(self.start, min(self.end + 1, 255))]
                return self

        class Client:
            def __init__(self):
                self.query = Query()

            def table(self, name):
                self.name = name
                return self.query

        client = Client()
        self.assertEqual(len(fetch_review_rows(client)), 255)
        self.assertEqual(client.name, "research_candidates")
        self.assertEqual(client.query.calls[0][0], "status")


if __name__ == "__main__":
    unittest.main()
