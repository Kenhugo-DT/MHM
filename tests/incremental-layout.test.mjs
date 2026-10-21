import assert from "node:assert/strict";
import test from "node:test";
import { preserveIncrementalLayouts } from "../brain/scripts/incremental-layout.mjs";
import { repairIncrementalLayouts } from "../brain/scripts/adaptive-incremental-layout.mjs";

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

test("new candidates trigger bounded local layout repair without moving distant history", () => {
  const oldNodes = {
    anchor: { x: 0, y: 0, zone: "rock" },
    neighbor: { x: 180, y: 0, zone: "rock" },
    distant: { x: 1500, y: 0, zone: "rock" },
    outside: { x: 0, y: 800, zone: "pop" },
  };
  const nextNodes = { ...structuredClone(oldNodes), newcomer: { x: 15, y: 4, zone: "rock" } };
  const previous = { layouts: Object.fromEntries(["organized", "genre", "chaos"]
    .map((mode) => [mode, { nodes: structuredClone(oldNodes) }])) };
  const layouts = Object.fromEntries(["organized", "genre", "chaos"]
    .map((mode) => [mode, { nodes: structuredClone(nextNodes) }]));
  const graph = { nodes: [
    { id: "anchor", label: "Anchor artist", zone: "rock", type: "artist" },
    { id: "neighbor", label: "Neighbor artist", zone: "rock", type: "artist" },
    { id: "newcomer", label: "Newcomer artist", zone: "rock", type: "artist" },
    { id: "distant", label: "Distant artist", zone: "rock", type: "artist" },
    { id: "outside", label: "Outside artist", zone: "pop", type: "artist" },
  ], edges: [{ source: "newcomer", target: "anchor", type: "member_of", strength: 0.8 }] };
  const zones = [{ id: "rock", x: -500, y: -500, width: 2000, height: 1500 },
    { id: "pop", x: -500, y: 500, width: 1000, height: 1000 }];
  const report = repairIncrementalLayouts(layouts, previous, graph, {}, zones, [], new Set(["anchor"]));
  assert.equal(report.freshNodes, 1);
  assert.ok(report.accepted.length > 0);
  for (const layout of Object.values(layouts)) {
    assert.deepEqual(layout.nodes.distant, oldNodes.distant);
    assert.deepEqual(layout.nodes.outside, oldNodes.outside);
    assert.deepEqual(layout.nodes.anchor, oldNodes.anchor);
    assert.ok(Math.hypot(layout.nodes.neighbor.x - 180, layout.nodes.neighbor.y) <= 86);
    assert.ok(Math.hypot(layout.nodes.newcomer.x - 15, layout.nodes.newcomer.y - 4) <= 341);
  }
  assert.ok(report.accepted.every((item) => item.after.overlaps <= item.before.overlaps &&
    item.after.severeOverlaps <= item.before.severeOverlaps));
  assert.deepEqual(previous.layouts.organized.nodes, oldNodes);

  const withFeedback = Object.fromEntries(["organized", "genre", "chaos"]
    .map((mode) => [mode, { nodes: structuredClone(nextNodes) }]));
  const rejected = repairIncrementalLayouts(withFeedback, previous, graph, {}, zones, [{
    mode: "organized", zone: "rock", verdict: "worse",
    parameters: { spacing: 1.1, connectionPull: 0.2, zoneFreedom: 0.35, iterations: 24 },
  }]);
  assert.equal(rejected.trials.find((item) => item.mode === "organized").attempted, 2);
});

test("incremental repair does nothing when there are no fresh nodes", () => {
  const previous = { layouts: { organized: { nodes: { a: { x: 0, y: 0, zone: "rock" } } } } };
  const layouts = structuredClone(previous.layouts);
  const report = repairIncrementalLayouts(layouts, previous,
    { nodes: [{ id: "a", label: "A", zone: "rock", type: "artist" }], edges: [] }, {}, []);
  assert.equal(report.freshNodes, 0);
  assert.deepEqual(layouts, previous.layouts);
});
