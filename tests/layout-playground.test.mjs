import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { autoTuneLayout, classifyOutcome, evaluateLayout, runLayoutExperiment, runWholeMapPilot } from "../shared/layout-playground/experiment.mjs";
import { ORGANIZED_MAP_ZONES } from "../brain/scripts/organize-graph-layout.mjs";
import { validateLayoutReport } from "../brain/scripts/import-layout-feedback.mjs";
import { deriveGrowthConstraints, evaluateLayoutConstraints, validateLayoutConstraints } from "../shared/layout-playground/constraints.mjs";

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

test("whole-map pilot reflows the approved graph without changing the published layout", () => {
  const approvedGraph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const layout = JSON.parse(readFileSync("brain/data/approved/layouts.json", "utf8")).layouts.organized.nodes;
  const guidance = JSON.parse(readFileSync("brain/data/approved/organization-model.json", "utf8")).layoutIntelligence;
  const zones = Object.entries(ORGANIZED_MAP_ZONES).map(([id, zone]) => ({ ...zone, id }));
  const original = JSON.stringify(layout);
  const trial = runWholeMapPilot(approvedGraph, layout, guidance, zones);
  assert.equal(trial.before.nodes, approvedGraph.nodes.length);
  assert.equal(Object.keys(trial.positions).length, approvedGraph.nodes.length);
  assert.equal(trial.trials.length, 4);
  assert.equal(trial.outcome, "improved");
  assert.ok(trial.after.overlaps < trial.before.overlaps);
  assert.ok(trial.after.severeOverlaps < trial.before.severeOverlaps);
  assert.ok(trial.after.meanEdge < trial.before.meanEdge);
  assert.ok(approvedGraph.nodes.filter((node) =>
    Math.hypot(trial.positions[node.id].x - layout[node.id].x,
      trial.positions[node.id].y - layout[node.id].y) > 1).length > approvedGraph.nodes.length * 0.9);
  assert.equal(JSON.stringify(layout), original);
});

test("whole-map pilot reduces collisions after a sourced candidate batch is added", () => {
  const approvedGraph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const current = JSON.parse(readFileSync("brain/data/approved/layouts.json", "utf8")).layouts.organized.nodes;
  const guidance = JSON.parse(readFileSync("brain/data/approved/organization-model.json", "utf8")).layoutIntelligence;
  const zones = Object.entries(ORGANIZED_MAP_ZONES).map(([id, zone]) => ({ ...zone, id }));
  const anchor = approvedGraph.nodes.find((node) => node.id === "led-zeppelin");
  assert.ok(anchor);
  const additions = Array.from({ length: 12 }, (_, index) => ({
    id: `test-candidate-${index}`, label: `Test candidate ${index}`, type: "artist",
    zone: anchor.zone, x: current[anchor.id].x + index * 3, y: current[anchor.id].y,
  }));
  const graphWithCandidates = { ...approvedGraph,
    nodes: [...approvedGraph.nodes, ...additions],
    edges: [...approvedGraph.edges, ...additions.map((node) => ({
      source: node.id, target: anchor.id, type: "member_of", strength: 0.8,
      sources: [{ url: "https://example.org/test-only" }],
    }))] };
  const baseline = { ...current, ...Object.fromEntries(additions.map((node) => [node.id,
    { x: node.x, y: node.y, zone: node.zone }])) };
  const trial = runWholeMapPilot(graphWithCandidates, baseline, guidance, zones);
  assert.equal(trial.before.nodes, graphWithCandidates.nodes.length);
  assert.equal(trial.after.nodes, graphWithCandidates.nodes.length);
  assert.ok(trial.after.severeOverlaps < trial.before.severeOverlaps);
  assert.ok(additions.every((node) => Number.isFinite(trial.positions[node.id].x)));
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

test("whole-map feedback can be reviewed without accepting an arbitrary all-zone report", () => {
  const approvedGraph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const layouts = JSON.parse(readFileSync("brain/data/approved/layouts.json", "utf8"));
  const guidance = JSON.parse(readFileSync("brain/data/approved/organization-model.json", "utf8")).layoutIntelligence;
  const zones = Object.entries(ORGANIZED_MAP_ZONES).map(([id, zone]) => ({ ...zone, id }));
  const trial = runWholeMapPilot(approvedGraph, layouts.layouts.organized.nodes, guidance, zones);
  const report = { version: 1, graphGeneratedAt: approvedGraph.generatedAt,
    layoutGeneratedAt: layouts.generatedAt, mode: "organized", zone: "all", trialKind: "whole-map",
    current: { ...trial, review: { mode: "organized", zone: "all", verdict: "better",
      parameters: trial.parameters, before: trial.before, after: trial.after, note: "Whole map is clearer" } } };
  const accepted = validateLayoutReport(report, approvedGraph, layouts);
  assert.equal(accepted.zone, "all");
  assert.equal(accepted.trialKind, "whole-map");
  assert.throws(() => validateLayoutReport({ ...report, trialKind: "standard" }, approvedGraph, layouts), /Unknown/);
  assert.throws(() => validateLayoutReport({ ...report, current: { ...report.current,
    after: { ...trial.after, overlaps: 0 } } }, approvedGraph, layouts), /cannot be reproduced/);
});

test("curated pair hints require a real sourced edge and display-only separation", () => {
  const approvedGraph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const document = JSON.parse(readFileSync("brain/data/approved/layout-constraints.json", "utf8"));
  const constraints = validateLayoutConstraints(document, approvedGraph);
  assert.equal(constraints.length, 5);
  const wrongEdge = { ...document, constraints: [{ ...constraints[0], evidenceEdgeId: "missing" }] };
  assert.throws(() => validateLayoutConstraints(wrongEdge, approvedGraph), /matching sourced connection/);
  const unsupportedSeparation = { ...document, constraints: [{ ...constraints.at(-1), displayOnly: false }] };
  assert.throws(() => validateLayoutConstraints(unsupportedSeparation, approvedGraph), /display-only/);
  const conflicting = { ...document, constraints: [{ ...constraints[3], maxDistance: 180 },
    { ...constraints[4], minDistance: 190 }] };
  assert.throws(() => validateLayoutConstraints(conflicting, approvedGraph), /Conflicting/);
  const duplicatedPair = { ...document, constraints: [constraints[0],
    { ...constraints[0], id: "second-rule" }] };
  assert.throws(() => validateLayoutConstraints(duplicatedPair, approvedGraph), /Duplicate near/);
});

test("new-node hints come only from sourced membership or collaboration", () => {
  const sample = { nodes: [
    { id: "band", zone: "rock" }, { id: "member", zone: "rock" }, { id: "lead", zone: "rock" },
  ], edges: [
    { id: "membership", source: "member", target: "band", type: "member_of", strength: 0.9,
      sources: [{ url: "https://example.org/fixture" }] },
    { id: "second-membership", source: "band", target: "member", type: "member_of", strength: 0.8,
      sources: [{ url: "https://example.org/second-fixture" }] },
    { id: "research", source: "member", target: "lead", type: "related",
      label: "Wikipedia link signal", sources: [{ url: "https://example.org/fixture" }] },
  ] };
  const hints = deriveGrowthConstraints(sample, new Set(["member"]));
  assert.equal(hints.length, 1);
  assert.equal(hints[0].evidenceEdgeId, "membership");
  assert.equal(hints[0].maxDistance, 700);
  const start = { band: { x: 0, y: 0 }, member: { x: 1200, y: 0 }, lead: { x: 1600, y: 0 } };
  const trial = runLayoutExperiment(sample, start, {}, zones, { connectionPull: 0.2 }, "rock",
    { band: { weight: 0 }, member: { weight: 1, maxDistance: 500 } }, hints);
  assert.ok(evaluateLayoutConstraints(trial.positions, hints).totalExcess <
    evaluateLayoutConstraints(start, hints).totalExcess);
});
