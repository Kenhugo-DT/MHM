import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sync import get_json_with_backoff


class SourceBackoffTests(unittest.TestCase):
    @patch("sync.time.sleep")
    def test_rate_limit_retries_and_preserves_result(self, sleep):
        limited = MagicMock(status_code=429, headers={"Retry-After": "8"})
        success = MagicMock(status_code=200, headers={})
        success.json.return_value = {"search": [{"id": "Q1"}]}
        session = MagicMock()
        session.get.side_effect = [limited, success]

        result = get_json_with_backoff(session, "https://example.org/api", {"search": "jazz"})

        self.assertEqual(result["search"][0]["id"], "Q1")
        self.assertEqual(session.get.call_count, 2)
        sleep.assert_called_once_with(8)

    @patch("sync.time.sleep")
    def test_repeated_failure_stops_after_three_attempts(self, sleep):
        from requests import HTTPError

        limited = MagicMock(status_code=429, headers={})
        limited.raise_for_status.side_effect = HTTPError("rate limited")
        session = MagicMock()
        session.get.return_value = limited

        with self.assertRaises(HTTPError):
            get_json_with_backoff(session, "https://example.org/api", {})

        self.assertEqual(session.get.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [6, 12])


if __name__ == "__main__":
    unittest.main()
