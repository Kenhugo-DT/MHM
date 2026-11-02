import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from supabase_brain import fetch_requests, recover_stale_requests  # noqa: E402


class Query:
    def __init__(self, rows):
        self.rows = rows
        self.start = 0
        self.end = 0

    def select(self, _columns):
        return self

    def order(self, _column, desc=False):
        return self

    def eq(self, _column, _value):
        return self

    def range(self, start, end):
        self.start, self.end = start, end
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows[self.start:self.end + 1])


class SupabaseQueueTests(unittest.TestCase):
    def test_request_history_is_paginated_past_500_rows(self):
        rows = [{"id": f"request-{index}"} for index in range(1201)]
        client = SimpleNamespace(table=lambda _name: Query(rows))
        self.assertEqual(len(fetch_requests(client, status="all", limit=None)), 1201)
        self.assertEqual(len(fetch_requests(client, status="queued", limit=25)), 25)

    def test_interrupted_processing_is_requeued_after_lease_expires(self):
        query = MagicMock()
        query.update.return_value = query
        query.eq.return_value = query
        query.lt.return_value = query
        client = SimpleNamespace(table=lambda _name: query)
        recover_stale_requests(client)
        self.assertEqual(query.update.call_args.args[0]["status"], "queued")
        query.eq.assert_called_once_with("status", "processing")
        self.assertEqual(query.lt.call_args.args[0], "updated_at")
        query.execute.assert_called_once()


if __name__ == "__main__":
    unittest.main()
