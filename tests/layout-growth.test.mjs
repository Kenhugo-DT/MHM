import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { simulateLayoutGrowth } from "../brain/scripts/simulate-layout-growth.mjs";
import { benchmarkLayoutGrowth } from "../brain/scripts/benchmark-layout-growth.mjs";
import { benchmarkFeedbackImpact } from "../brain/scripts/benchmark-layout-feedback.mjs";
import { VALIDATION_SCENARIOS } from "../brain/scripts/simulate-layout-growth.mjs";
import { preserveIncrementalLayouts } from "../brain/scripts/incremental-layout.mjs";
import { evaluateFocusedConnections, evaluateNodeLegibility } from "../shared/layout-playground/experiment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const approved = (name) => JSON.parse(fs.readFileSync(path.join(root, "brain", "data", "approved", name), "utf8"));

test("focused legibility counts overlaps involving only the new labels", () => {
  const graph = { nodes: [
    { id: "old", label: "Old node" },
    { id: "new", label: "New node" },
    { id: "far", label: "Far node" },
  ], edges: [] };
  const positions = { old: { x: 0, y: 0 }, new: { x: 10, y: 0 }, far: { x: 1000, y: 0 } };
  assert.deepEqual(evaluateNodeLegibility(graph, positions, new Set(["new"])), {
    focusedNodes: 1, overlappingNodes: 1, severelyOverlappingNodes: 1, overlapPairs: 1,
  });
});

test("focused connections distinguish real map links from research leads", () => {
  const graph = { nodes: [
    { id: "new", zone: "rock" }, { id: "local", zone: "rock" },
    { id: "remote", zone: "jazz" }, { id: "lead", zone: "rock" },
  ], edges: [
    { source: "new", target: "local", type: "related" },
    { source: "new", target: "remote", type: "related" },
    { source: "new", target: "lead", label: "Wikipedia link signal" },
  ] };
  const positions = { new: { x: 0, y: 0 }, local: { x: 300, y: 0 },
    remote: { x: 0, y: 800 }, lead: { x: 5000, y: 0 } };
  assert.deepEqual(evaluateFocusedConnections(graph, positions, new Set(["new"])), {
    edges: 2, mean: 550, longestSameZone: 300, longestCrossZone: 800,
  });
});

test("synthetic growth experiments never degrade existing or newly added labels", () => {
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const organization = approved("organization-model.json");
  const feedback = approved("layout-feedback.json").reviews;
  const result = simulateLayoutGrowth(graph, layouts, organization.layoutIntelligence, feedback);
  assert.equal(result.syntheticOnly, true);
  assert.equal(result.scenarios.length, 5);
  assert.equal(result.scenarios.reduce((sum, scenario) => sum + scenario.syntheticNodes, 0), 55);
  for (const scenario of result.scenarios) {
    assert.equal(scenario.timelineUnchanged, true, scenario.id);
    assert.equal(scenario.alphabeticUnchanged, true, scenario.id);
    for (const [mode, metrics] of Object.entries(scenario.modes)) {
      assert.ok(metrics.after.overlaps <= metrics.before.overlaps, `${scenario.id}/${mode} total overlaps`);
      assert.ok(metrics.after.severeOverlaps <= metrics.before.severeOverlaps,
        `${scenario.id}/${mode} severe overlaps`);
      assert.ok(metrics.newNodeLegibilityAfter.overlapPairs <= metrics.newNodeLegibilityBefore.overlapPairs,
        `${scenario.id}/${mode} new label pairs`);
      assert.ok(metrics.newNodeLegibilityAfter.severelyOverlappingNodes <=
        metrics.newNodeLegibilityBefore.severelyOverlappingNodes,
      `${scenario.id}/${mode} severe new labels`);
      assert.ok(metrics.maxOldDrift <= 85, `${scenario.id}/${mode} old-node drift`);
    }
    for (const item of scenario.feedback) {
      if (item.verdict === "needs-work") {
        assert.ok(scenario.unresolved.some((entry) => entry.mode === item.mode &&
          item.signals.includes(entry.reason)));
      } else {
        assert.equal(item.severeNewLabels, 0);
        assert.ok(!scenario.unresolved.some((entry) => entry.mode === item.mode));
      }
    }
  }
  assert.equal(graph.nodes.length, result.graphNodes);
  assert.ok(graph.nodes.every((node) => !node.id.startsWith("__simulation_")));
});

test("validation growth benchmark measures gains and connection-length cost separately", () => {
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const organization = approved("organization-model.json");
  const feedback = approved("layout-feedback.json").reviews;
  const report = benchmarkLayoutGrowth(graph, layouts, organization.layoutIntelligence,
    feedback, VALIDATION_SCENARIOS.slice(0, 1));
  assert.equal(report.comparisons.length, 3);
  assert.ok(report.summary.severeNewLabels.current < report.summary.severeNewLabels.legacy);
  assert.ok(report.summary.newLabelPairs.current < report.summary.newLabelPairs.legacy);
  assert.ok(report.summary.longestNewEdge.regressedViews > 0);
  assert.ok(report.comparisons.every((item) => Array.isArray(item.currentWarnings)));
});

test("feedback impact benchmark detects a rejected layout choice", () => {
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const organization = approved("organization-model.json");
  const scenarios = [{ id: "feedback-check", groups: [{ zone: "rock-circuit", count: 1 }] }];
  const baseline = simulateLayoutGrowth(graph, layouts, organization.layoutIntelligence, [], scenarios);
  const selected = baseline.scenarios[0].accepted.find((item) => item.mode === "genre");
  assert.ok(selected);
  const feedback = [{ mode: selected.mode, zone: selected.zone,
    verdict: "worse", parameters: selected.parameters }];
  const impact = benchmarkFeedbackImpact(graph, layouts, organization.layoutIntelligence,
    feedback, scenarios);
  assert.equal(impact.testedViews, 3);
  assert.ok(impact.changedChoices >= 1);
});

test("over-capacity placement keeps 20 discoveries distinct among 20k nodes", () => {
  const nodes = Array.from({ length: 20000 }, (_, index) => ({
    id: `n${index}`, label: `Existing node ${index}`, zone: "rock-circuit",
  }));
  const old = Object.fromEntries(nodes.map((node, index) => [node.id, {
    x: (index % 150) * 22 - 1500, y: Math.floor(index / 150) * 22 - 900, zone: node.zone,
  }]));
  old.n0 = { x: 0, y: 500, zone: "rock-circuit" };
  const fresh = Array.from({ length: 20 }, (_, index) => ({ id: `new${index}`,
    label: `Synthetic long-name band ${index}`, zone: "rock-circuit",
    layoutHints: { nearNode: "n0" } }));
  const layouts = { organized: { nodes: { ...structuredClone(old),
    ...Object.fromEntries(fresh.map((node) => [node.id, { x: 0, y: 500, zone: node.zone }])) } } };
  preserveIncrementalLayouts(layouts, { layouts: { organized: { nodes: old } } },
    { nodes: [...nodes, ...fresh], edges: [] });
  const points = fresh.map((node) => layouts.organized.nodes[node.id]);
  assert.equal(new Set(points.map((point) => `${point.x},${point.y}`)).size, fresh.length);
  assert.deepEqual(layouts.organized.nodes.n0, old.n0);
});

test("out-of-zone anchors still receive a finite incremental position", () => {
  const old = { anchor: { x: 10000, y: 10000, zone: "rock-circuit" } };
  const layouts = { organized: { nodes: { ...structuredClone(old),
    newcomer: { x: 10000, y: 10000, zone: "rock-circuit" } } } };
  preserveIncrementalLayouts(layouts, { layouts: { organized: { nodes: old } } }, {
    nodes: [{ id: "anchor", label: "Anchor", zone: "rock-circuit" },
      { id: "newcomer", label: "Newcomer", zone: "rock-circuit",
        layoutHints: { nearNode: "anchor" } }], edges: [],
  });
  const point = layouts.organized.nodes.newcomer;
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  assert.notDeepEqual([point.x, point.y], [old.anchor.x, old.anchor.y]);
});
