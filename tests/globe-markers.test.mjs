import assert from "node:assert/strict";
import test from "node:test";
import { markerPlacements, samePlace } from "../site/src/globe/markers.mjs";

const placements = [
  { nodeId: "a", role: "musical_base", placeId: "london" },
  { nodeId: "a", role: "birthplace", placeId: "liverpool" },
  { nodeId: "b", role: "birthplace", placeId: "paris" },
  { nodeId: "c", role: "musical_base", placeId: "berlin" },
];

test("unselected birthplaces never appear in globe markers or clusters", () => {
  assert.deepEqual(markerPlacements(placements).map((entry) => entry.placeId), ["london", "berlin"]);
  assert.deepEqual(markerPlacements(placements, "a").map((entry) => entry.placeId), ["london", "berlin", "liverpool"]);
  assert.deepEqual(markerPlacements(placements, "b").map((entry) => entry.placeId), ["london", "berlin", "paris"]);
});

test("source IDs for the same city can share a globe cluster without merging distant namesakes", () => {
  const london = { name: "London", country: "United Kingdom", lat: 51.5072, lon: -0.1275 };
  assert.ok(samePlace(london, { name: "London", country: "United Kingdom", lat: 51.507, lon: -0.128 }));
  assert.ok(!samePlace(london, { name: "London", country: "Canada", lat: 42.9849, lon: -81.2453 }));
  assert.ok(!samePlace(london, { name: "London", country: "United Kingdom", lat: 52, lon: -0.1275 }));
});

test("a selected birthplace does not duplicate a musical base in the same city", () => {
  const london = { name: "London", country: "United Kingdom", lat: 51.5072, lon: -0.1275 };
  const sameCity = [
    { nodeId: "a", role: "musical_base", placeId: "wikidata:Q84", place: london },
    { nodeId: "a", role: "birthplace", placeId: "atlas:london", place: { ...london, lat: 51.507 } },
  ];
  assert.deepEqual(markerPlacements(sameCity, "a"), sameCity.slice(0, 1));
});
