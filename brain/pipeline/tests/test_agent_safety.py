import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from candidate_quality import review_candidate_payload, review_music_candidate  # noqa: E402
from process_inbox import main as process_inbox_main  # noqa: E402
from promote_candidates import build_patch, promoted_edge, seed_node  # noqa: E402


class CandidateSafetyTests(unittest.TestCase):
    def test_generic_wikipedia_topics_are_not_map_entities(self):
        for title in ("Bandleader", "Military band"):
            candidate = {"title": title, "kind": "band", "source": "link"}
            issues = review_music_candidate(candidate, "James Reese Europe", set())
            self.assertIn("out_of_scope_candidate", {item["code"] for item in issues})

    def test_wikipedia_link_is_only_a_research_lead_without_identity(self):
        candidate = {"title": "Example Band", "kind": "band", "source": "link"}
        issues = review_music_candidate(candidate, "Example Artist", set())
        self.assertIn("unverified_candidate_identity", {item["code"] for item in issues})

    def test_verified_identity_does_not_invent_a_relation(self):
        candidate = {
            "title": "Example Band", "kind": "band", "source": "link",
            "musicbrainz": {"id": "1234", "type": "Group"},
            "wikipedia": {
                "title": "Example Band", "wikidata_id": "Q123",
                "extract": "Example Band is a rock band.",
                "musicbrainz_artist_ids": ["1234"],
            },
        }
        self.assertEqual(review_music_candidate(candidate, "Example Artist", set()), [])
        self.assertIsNone(promoted_edge("artist", "band", {}, {}, candidate, {}))
        self.assertIn("unverified_candidate_identity", {
            item["code"] for item in review_music_candidate(
                {**candidate, "musicbrainz": {"id": "1234", "type": "Person"}},
                "Example Artist", set(),
            )
        })

    def test_seed_requires_source_and_relevant_zone(self):
        existing = {
            "bach": {"id": "bach", "zone": "classical-history", "x": -1000, "y": -900},
        }
        payload = {
            "name": "Example Composer", "requested_kind": "artist",
            "wikipedia": {"title": "Example Composer", "extract": "A classical composer."},
            "suggested_zone": "classical-history",
        }
        node = seed_node(payload, existing, {}, set(), set())
        self.assertEqual(node["zone"], "classical-history")
        self.assertIsNone(seed_node({**payload, "suggested_zone": ""}, existing, {}, set(), set()))
        self.assertEqual(review_candidate_payload({"name": "Bandleader", "requested_kind": "band"})["level"], "reject")

    def test_bulk_approval_does_not_publish_unverified_links(self):
        graph = {"nodes": [{
            "id": "seed", "label": "Seed", "type": "artist",
            "zone": "jazz", "x": 0, "y": 0,
        }], "edges": []}
        payload = {
            "name": "Seed", "requested_kind": "artist",
            "wikipedia": {"title": "Seed", "extract": "Seed is a musician."},
            "music_candidates": [
                {"title": "Bandleader", "kind": "band", "source": "link"},
                {"title": "Jazz Band", "kind": "band", "source": "link",
                 "musicbrainz": {"id": "1234", "type": "Group"},
                 "wikipedia": {"title": "Jazz Band", "wikidata_id": "Q123",
                               "extract": "Jazz Band is a jazz band.",
                               "musicbrainz_artist_ids": ["1234"]}},
            ],
        }
        row = {"id": "row-1", "payload": payload}
        with patch("promote_candidates.existing_graph", return_value=graph), patch(
            "promote_candidates.load_json", return_value={"candidateRows": [], "nodes": [], "edges": []}
        ), patch("promote_candidates.load_blocked_terms", return_value=set()):
            result = build_patch([row], max_new_nodes=10, max_per_seed=10)
        self.assertEqual([node["label"] for node in result["nodes"]], ["Jazz Band"])
        self.assertEqual(result["edges"], [])

    def test_upload_failure_requeues_request_and_closes_run(self):
        request = {
            "id": "test-research", "title": "Research", "status": "queued",
            "priority": 50, "seeds": [{"name": "Example Band", "kind": "band"}],
        }
        statuses = []
        run_statuses = []
        helpers = {
            "require_client": lambda: object(),
            "load_queued_requests": lambda _client, _limit: [request],
            "mark_requests": lambda _client, _ids, status, **_extra: statuses.append(status),
            "start_run": lambda _client, _summary: None,
            "upsert_candidates": lambda *_args: (_ for _ in ()).throw(RuntimeError("upload failed")),
            "finish_run": lambda _client, _id, status, *_args, **_kwargs: run_statuses.append(status),
        }
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[3]) as directory:
            with patch("process_inbox.load_supabase_helpers", return_value=helpers), patch(
                "process_inbox.RUNS_DIR", Path(directory)
            ), patch.dict(sys.modules, {"sync": types.SimpleNamespace(collect=lambda _path: [])}), patch(
                "sys.argv", ["process_inbox", "--source", "supabase", "--output-dir", directory]
            ):
                with self.assertRaisesRegex(RuntimeError, "upload failed"):
                    process_inbox_main()
        self.assertEqual(statuses, ["processing", "queued"])
        self.assertEqual(run_statuses, ["failed"])


if __name__ == "__main__":
    unittest.main()
