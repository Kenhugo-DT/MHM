"""Read-only preflight for the graph import schema."""

from __future__ import annotations

from supabase_brain import require_client


def main() -> None:
    client = require_client()
    try:
        client.table("entities").select("id,era_start,era_start_evidence").limit(1).execute()
    except Exception as exc:
        if getattr(exc, "code", None) == "42703" or "era_start" in str(exc):
            raise SystemExit(
                "The timeline columns are missing. Apply "
                "brain/supabase/migrations/0006_entity_start_year.sql before enabling publication."
            ) from exc
        raise
    print("Graph import schema is ready.")


if __name__ == "__main__":
    main()
