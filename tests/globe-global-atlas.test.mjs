import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { extendAtlas } from "../site/src/globe/global-atlas.mjs";

const entries = JSON.parse(readFileSync(new URL("../site/src/globe/global-atlas.json", import.meta.url), "utf8"));

test("atlas additions have unique sourced identities, years and valid city centres", () => {
  assert.ok(!entries.some((entry) => entry.label === "U2"));
  assert.ok(entries.length >= 25);
  assert.ok(new Set(entries.map((entry) => entry.country)).size >= 18);
  assert.equal(new Set(entries.map((entry) => entry.mbid)).size, entries.length);
  for (const entry of entries) {
    assert.match(entry.mbid, /^[a-f0-9]{8}-[a-f0-9-]{27,}$/);
    assert.ok(Number.isInteger(entry.year) && entry.year >= 1900 && entry.year <= 2026);
    assert.ok(entry.lat >= -90 && entry.lat <= 90);
    assert.ok(entry.lon >= -180 && entry.lon <= 180);
  }
});

test("globe atlas never restores an entity blocked from the main graph", () => {
  const atlas = extendAtlas([], []);
  assert.ok(!atlas.nodes.some((node) => node.label === "U2"));
});

test("atlas adds only missing bands and preserves an existing graph identity", () => {
  const source = `https://musicbrainz.org/artist/${entries[0].mbid}`;
  const existing = { id: "graph-band", label: entries[0].label, type: "band", sources: [{ url: source }] };
  const atlas = extendAtlas([existing], []);
  assert.equal(atlas.nodes.length, entries.length);
  assert.equal(atlas.placements.find((entry) => entry.nodeId === "graph-band")?.role, "musical_base");
  assert.ok(atlas.nodes.slice(1).every((node) => node.atlasOnly && node.sources[0].url.startsWith("https://musicbrainz.org/artist/")));
  assert.equal(extendAtlas([existing], [{ nodeId: "graph-band", role: "musical_base" }]).placements.length, entries.length);
});
