import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { autoTuneLayout, classifyOutcome, evaluateLayout, runLayoutExperiment } from "../shared/layout-playground/experiment.mjs";
import { ORGANIZED_MAP_ZONES } from "../brain/scripts/organize-graph-layout.mjs";

const graph = {
  nodes: [
    { id: "a", label: "A long artist name", type: "artist", zone: "rock" },
    { id: "b", label: "Another long artist", type: "artist", zone: "rock" },
    { id: "c", label: "A band", type: "band", zone: "pop" },
  ],
  edges: [
    { source: "a", target: "c", type: "member_of", label: "Member of", strength: 0.9, sources: [{ url: "https://musicbrainz.org" }] },
    { source: "b", target: "c", type: "related", label: "Wikipedia link signal", strength: 0.5, sources: [{ url: "https://wikipedia.org" }] },
  ],
};
const baseline = { a: { x: 0, y: 0 }, b: { x: 8, y: 3 }, c: { x: 700, y: 0 } };
const zones = [
  { id: "rock", x: -100, y: -100, width: 400, height: 300 },
  { id: "pop", x: 600, y: -100, width: 400, height: 300 },
];

test("playground measurements exclude research leads and detect unreadable labels", () => {
  const metrics = evaluateLayout(graph, baseline, baseline);
  assert.equal(metrics.overlaps, 1);
  assert.equal(metrics.edges, 1);
  assert.equal(metrics.meanDrift, 0);
});

test("experiment is deterministic and never mutates the approved baseline", () => {
  const snapshot = JSON.stringify(baseline);
  const first = runLayoutExperiment(graph, baseline, { zones: {}, bridgeNodes: {} }, zones);
  const second = runLayoutExperiment(graph, baseline, { zones: {}, bridgeNodes: {} }, zones);
  assert.deepEqual(first.positions, second.positions);
  assert.equal(JSON.stringify(baseline), snapshot);
  assert.deepEqual(first.positions.c, second.positions.c);
  assert.ok(first.after.meanDrift > 0);
  assert.throws(() => runLayoutExperiment(graph, baseline, {}, zones, { spacing: 5 }), /Invalid/);
});

test("zone scope fixes other zones and autotune reports all trials", () => {
  const trial = runLayoutExperiment(graph, baseline, {}, zones, {}, "rock");
  assert.equal(trial.positions.c.x, baseline.c.x);
  assert.equal(trial.positions.c.y, baseline.c.y);
  const tuned = autoTuneLayout(graph, baseline, {}, zones, "rock");
  assert.equal(tuned.trials.length, 6);
  assert.equal(tuned.before.nodes, 2);
  const rejected = autoTuneLayout(graph, baseline, {}, zones, "rock", [
    { verdict: "worse", parameters: tuned.trials[0].parameters },
  ]);
  assert.equal(rejected.trials.length, 5);
});

test("quality gate rejects worse overlap even if edges shorten", () => {
  const before = evaluateLayout(graph, baseline, baseline);
  assert.equal(classifyOutcome(before, { ...before, severeOverlaps: before.severeOverlaps + 1, score: 0 }), "regression");
});

test("approved rock-circuit snapshot gets a measurable sandbox improvement", () => {
  const approvedGraph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const layout = JSON.parse(readFileSync("brain/data/approved/layouts.json", "utf8")).layouts.organized.nodes;
  const guidance = JSON.parse(readFileSync("brain/data/approved/organization-model.json", "utf8")).layoutIntelligence;
  const original = JSON.stringify(layout);
  const trial = autoTuneLayout(approvedGraph, layout, guidance, Object.entries(ORGANIZED_MAP_ZONES)
    .map(([id, zone]) => ({ ...zone, id })), "rock-circuit");
  assert.equal(trial.outcome, "improved");
  assert.ok(trial.after.overlaps < trial.before.overlaps);
  assert.ok(trial.after.severeOverlaps < trial.before.severeOverlaps);
  assert.equal(JSON.stringify(layout), original);
});
