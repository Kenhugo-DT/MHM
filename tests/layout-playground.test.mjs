import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { autoTuneLayout, classifyOutcome, evaluateLayout, runLayoutExperiment } from "../shared/layout-playground/experiment.mjs";
import { ORGANIZED_MAP_ZONES } from "../brain/scripts/organize-graph-layout.mjs";
import { validateLayoutReport } from "../brain/scripts/import-layout-feedback.mjs";

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

test("review import reproduces metrics and rejects stale or embellished experiments", () => {
  const source = { ...graph, generatedAt: "graph-1", nodes: graph.nodes.slice(0, 2), edges: [] };
  const original = { a: { x: 0, y: 0 }, b: { x: 8, y: 3 } };
  const moved = { a: { x: 0, y: 0 }, b: { x: 500, y: 3 } };
  const layouts = { generatedAt: "layout-1", layouts: { organized: { nodes: original } } };
  const before = evaluateLayout(source, original, original, "rock");
  const after = evaluateLayout(source, original, moved, "rock");
  const parameters = { spacing: 1, connectionPull: 0.2, zoneFreedom: 0.4, iterations: 24 };
  const report = { version: 1, graphGeneratedAt: "graph-1", layoutGeneratedAt: "layout-1",
    mode: "organized", zone: "rock", current: { parameters, before, after, outcome: "improved",
      positions: moved, review: { mode: "organized", zone: "rock", verdict: "better",
        parameters, before, after, note: "Labels separated" } } };
  const accepted = validateLayoutReport(report, source, layouts);
  assert.equal(accepted.verdict, "better");
  assert.equal(accepted.after.overlaps, 0);
  assert.throws(() => validateLayoutReport({ ...report, graphGeneratedAt: "old" }, source, layouts), /stale/);
  assert.throws(() => validateLayoutReport({ ...report, current: { ...report.current,
    after: { ...after, score: 0 } } }, source, layouts), /cannot be reproduced/);
  assert.throws(() => validateLayoutReport({ ...report, current: { ...report.current,
    review: { ...report.current.review, verdict: "unsure" } } }, source, layouts), /Mark the current/);
});
