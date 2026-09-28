"""Guard the approval boundary of the local fact-evidence snapshot."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sync_approved_fact_evidence import approved_rows, build_snapshot  # noqa: E402


def fact(**changes):
    row = {
        "entity_id": "the-yardbirds",
        "text": "The Yardbirds linked several guitarists to British blues rock.",
        "tags": ["music-history", "lineup-story"],
        "sources": [{"label": "Rock Hall", "url": "https://rockhall.com/inductees/yardbirds/"}],
        "source_fingerprint": "abc123",
        "status": "approved",
        "verified_at": "2026-09-28",
    }
    row.update(changes)
    return row


class ApprovedFactSnapshotTests(unittest.TestCase):
    def test_paginates_approved_rows_without_including_review(self):
        rows = [{"id": str(index), "status": "approved"} for index in range(1, 6)]
        rows.append({"id": "6", "status": "review"})

        class Query:
            def __init__(self):
                self.cursor = None
                self.page_size = None
                self.status = None

            def select(self, _):
                return self

            def eq(self, _, status):
                self.status = status
                return self

            def order(self, _):
                return self

            def limit(self, count):
                self.page_size = count
                return self

            def gt(self, _, cursor):
                self.cursor = cursor
                return self

            def execute(self):
                page = [row for row in rows if row["status"] == self.status and
                        (self.cursor is None or row["id"] > self.cursor)]
                return SimpleNamespace(data=page[:self.page_size])

        class Client:
            def table(self, _):
                return Query()

        with patch("sync_approved_fact_evidence.PAGE_SIZE", 2):
            result = approved_rows(Client())
        self.assertEqual([row["id"] for row in result], ["1", "2", "3", "4", "5"])

    def test_keeps_only_public_fields_and_stable_order(self):
        rows = [fact(entity_id="z", source_fingerprint="z", evidence="private"), fact()]
        snapshot = build_snapshot(rows, "2026-09-28T00:00:00Z")
        self.assertEqual([row["entityId"] for row in snapshot["facts"]], ["the-yardbirds", "z"])
        self.assertNotIn("evidence", snapshot["facts"][1])
        self.assertNotIn("id", snapshot["facts"][0])

    def test_rejects_unapproved_and_unsourced_rows(self):
        for invalid in (fact(status="review"), fact(status="rejected"),
                        fact(sources=[]), fact(sources=[{"label": "bad", "url": "http://example.com"}])):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    build_snapshot([invalid], "2026-09-28T00:00:00Z")

    def test_rejects_duplicate_fingerprints(self):
        with self.assertRaises(ValueError):
            build_snapshot([fact(), fact()], "2026-09-28T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
