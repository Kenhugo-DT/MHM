# Guitar History Research Agent

Use `brain/AGENT.md` as the full instruction set.

This agent scouts Wikipedia, Wikidata, Wikimedia Commons and MusicBrainz for
candidate graph additions. It writes proposals to `brain/data/candidates/` and
must not publish directly to the live site.

Project-owner requests live in `brain/data/inbox/research-requests.json`.
