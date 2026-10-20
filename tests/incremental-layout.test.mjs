import assert from "node:assert/strict";
import test from "node:test";
import { preserveIncrementalLayouts } from "../brain/scripts/incremental-layout.mjs";

test("incremental layouts keep existing nodes and place discoveries near a reviewed member", () => {
  const previous = { layouts: {
    organized: { nodes: { person: { x: 100, y: 200, zone: "rock-circuit" } } },
    timeline: { nodes: { person: { x: 400, y: 200, zone: "rock-circuit", startYear: 1990 } } },
    alphabetic: { nodes: { person: { x: 100, y: 200, zone: "rock-circuit" } } },
  } };
  const layouts = {
    organized: { nodes: { person: { x: 900, y: 900, zone: "rock-circuit" },
      band: { x: 1000, y: 1000, zone: "rock-circuit" } } },
    timeline: { nodes: { person: { x: 1000, y: 1000, zone: "rock-circuit", startYear: 1990 },
      band: { x: 800, y: 500, zone: "rock-circuit" } } },
    alphabetic: { nodes: { person: { x: 700, y: 700, zone: "rock-circuit" } } },
  };
  const graph = { nodes: [
    { id: "person", zone: "rock-circuit" },
    { id: "band", zone: "rock-circuit" },
  ], edges: [{ source: "person", target: "band", type: "member_of" }] };
  preserveIncrementalLayouts(layouts, previous, graph);
  assert.deepEqual([layouts.organized.nodes.person.x, layouts.organized.nodes.person.y], [100, 200]);
  assert.ok(Math.hypot(layouts.organized.nodes.band.x - 100, layouts.organized.nodes.band.y - 200) <= 240);
  assert.deepEqual([layouts.timeline.nodes.person.x, layouts.timeline.nodes.person.y], [400, 200]);
  assert.equal(layouts.timeline.nodes.band.x, 800);
  assert.equal(layouts.alphabetic.nodes.person.x, 700);
});
