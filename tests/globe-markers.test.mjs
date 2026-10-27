import assert from "node:assert/strict";
import test from "node:test";
import { markerPlacements } from "../site/src/globe/markers.mjs";

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
