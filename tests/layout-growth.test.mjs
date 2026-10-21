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
import { appendLayoutExperience, EMPTY_LAYOUT_EXPERIENCE, historicalLayoutPreference,
  layoutParameterKey } from "../brain/scripts/layout-experience.mjs";
import { evaluateFocusedConnections, evaluateNodeLegibility } from "../shared/layout-playground/experiment.mjs";
import { repairIncrementalLayouts } from "../brain/scripts/adaptive-incremental-layout.mjs";
import { benchmarkDocumentedGrowth } from "../brain/scripts/benchmark-layout-constraints.mjs";
import { validateLayoutConstraints } from "../shared/layout-playground/constraints.mjs";
import { replayNode, selectPracticeNodes } from "../brain/scripts/train-layout-practice.mjs";

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

test("a positive review changes only a safe, comparable layout choice", () => {
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const guidance = approved("organization-model.json").layoutIntelligence;
  const scenarios = [{ id: "positive-review", groups: [{ zone: "rock-circuit", count: 1 }] }];
  const review = [{ mode: "chaos", zone: "rock-circuit", verdict: "better",
    parameters: { spacing: 1.65, connectionPull: 0.15, zoneFreedom: 0.8, iterations: 36 } }];
  const impact = benchmarkFeedbackImpact(graph, layouts, guidance, review, scenarios);
  assert.equal(impact.changedChoices, 1);
  assert.equal(impact.changedOutcomes, 1);
  const plain = simulateLayoutGrowth(graph, layouts, guidance, [], scenarios).scenarios[0];
  const guided = simulateLayoutGrowth(graph, layouts, guidance, review, scenarios).scenarios[0];
  assert.ok(guided.modes.chaos.newNodeLegibilityAfter.overlapPairs <=
    plain.modes.chaos.newNodeLegibilityAfter.overlapPairs);
  assert.ok(guided.modes.chaos.after.overlaps <= plain.modes.chaos.after.overlaps);
});

test("only real growth is recorded once as layout experience", () => {
  const graph = { generatedAt: "2026-10-21T00:00:00Z", nodes: [
    { id: "old", zone: "rock-circuit" }, { id: "new", zone: "rock-circuit" },
  ] };
  const previous = { layouts: { organized: { nodes: { old: { x: 0, y: 0 } } } } };
  const parameters = { spacing: 1.4, connectionPull: 0.3, zoneFreedom: 0.6, iterations: 32 };
  const report = { freshNodes: 1, accepted: [{ mode: "organized", zone: "rock-circuit", parameters }],
    trials: [{ mode: "organized", zone: "rock-circuit", candidates: [{ parameters, reason: "safe",
      focusAfter: { severelyOverlappingNodes: 0, overlapPairs: 0 }, connectionsAfter: { mean: 200 } }] }] };
  const recorded = appendLayoutExperience(EMPTY_LAYOUT_EXPERIENCE, graph, previous, report);
  assert.equal(recorded.batches.length, 1);
  assert.equal(recorded.batches[0].trials[0].parameters, layoutParameterKey(parameters));
  assert.equal(recorded.batches[0].trials[0].selected, true);
  assert.deepEqual(appendLayoutExperience(recorded, graph, previous, report), recorded);
  assert.throws(() => appendLayoutExperience(EMPTY_LAYOUT_EXPERIENCE,
    { ...graph, nodes: [...graph.nodes, { id: "__simulation_x", synthetic: true }] },
    previous, { ...report, freshNodes: 2 }), /Synthetic nodes/);
});

test("experience distinguishes hinted trials from an unhinted fallback", () => {
  const graph = { nodes: [{ id: "old" }, { id: "new" }], edges: [] };
  const previous = { layouts: { organized: { nodes: { old: { x: 0, y: 0 } } } } };
  const parameters = { spacing: 1.4, connectionPull: 0.3, zoneFreedom: 0.6, iterations: 32 };
  const candidate = (arm, excess) => ({ arm, parameters, reason: "safe",
    focusAfter: { severelyOverlappingNodes: 0, overlapPairs: 0 },
    connectionsAfter: { mean: 300 },
    constraintsBefore: { totalExcess: 400 }, constraintsAfter: { totalExcess: excess } });
  const report = { freshNodes: 1, accepted: [{ mode: "organized", zone: "rock", arm: "plain", parameters }],
    trials: [{ mode: "organized", zone: "rock", hintIds: ["near-old"],
      candidates: [candidate("hinted", 200), candidate("plain", 400)] }] };
  const learned = appendLayoutExperience(EMPTY_LAYOUT_EXPERIENCE, graph, previous, report);
  const [hinted, plain] = learned.batches[0].trials;
  assert.equal(hinted.selected, false);
  assert.equal(hinted.hintCount, 1);
  assert.equal(plain.selected, true);
  assert.equal(plain.hintCount, 0);
  assert.equal(historicalLayoutPreference(learned, "organized", "rock", parameters, true).samples, 1);
  assert.equal(historicalLayoutPreference(learned, "organized", "rock", parameters, false).samples, 1);
});

test("observed history can break a safe tie after multiple real batches", () => {
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const guidance = approved("organization-model.json").layoutIntelligence;
  const scenarios = [{ id: "history-choice", groups: [{ zone: "rock-circuit", count: 1 }] }];
  const baseline = simulateLayoutGrowth(graph, layouts, guidance, [], scenarios).scenarios[0];
  const winner = baseline.accepted.find((item) => item.mode === "chaos");
  const alternative = baseline.trials.find((item) => item.mode === "chaos").candidates.find((item) =>
    item.reason === "safe" && layoutParameterKey(item.parameters) !== layoutParameterKey(winner.parameters) &&
    item.parameters.spacing === 1.65);
  assert.ok(winner && alternative);
  const experience = { version: 1, batches: Array.from({ length: 4 }, (_, index) => ({
    id: `actual-${index}`, trials: [
      { mode: "chaos", zone: "rock-circuit", parameters: layoutParameterKey(winner.parameters),
        reason: "whole-map-regression" },
      { mode: "chaos", zone: "rock-circuit", parameters: layoutParameterKey(alternative.parameters),
        reason: "safe" },
    ],
  })) };
  const learned = simulateLayoutGrowth(graph, layouts, guidance, [], scenarios,
    preserveIncrementalLayouts, experience).scenarios[0];
  assert.equal(layoutParameterKey(learned.accepted.find((item) => item.mode === "chaos").parameters),
    layoutParameterKey(alternative.parameters));
  assert.ok(learned.modes.chaos.newNodeLegibilityAfter.overlapPairs <=
    baseline.modes.chaos.newNodeLegibilityAfter.overlapPairs);
});

test("layout practice uses separate documented training and holdout nodes", () => {
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const selection = selectPracticeNodes(graph, layouts);
  const practice = approved("layout-practice.json");
  const training = selection.filter((item) => item.split === "train").map((item) => item.id);
  const holdout = selection.filter((item) => item.split === "holdout").map((item) => item.id);
  assert.deepEqual(practice.trainedNodes, training);
  assert.deepEqual(practice.holdoutNodes, holdout);
  assert.equal(new Set([...training, ...holdout]).size, selection.length);
  assert.ok(practice.batches.length > 0);
});

test("enabled practice improves a held-out replay without worsening labels or map overlap", () => {
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const guidance = approved("organization-model.json").layoutIntelligence;
  const feedback = approved("layout-feedback.json").reviews;
  const constraints = validateLayoutConstraints(approved("layout-constraints.json"), graph);
  const practice = approved("layout-practice.json");
  if (!practice.enabled) return;
  let improved = false;
  for (const [mode, zones] of Object.entries(practice.parametersByModeZone)) {
    for (const zone of Object.keys(zones)) {
      const held = graph.nodes.filter((node) => node.zone === zone &&
        practice.holdoutNodes.includes(node.id));
      for (const node of held) {
        const baseline = replayNode(graph, layouts, guidance, feedback, constraints, node.id);
        const learned = replayNode(graph, layouts, guidance, feedback, constraints, node.id, practice);
        const before = baseline.measurements[mode];
        const after = learned.measurements[mode];
        assert.ok(after.labels.overlapPairs <= before.labels.overlapPairs);
        assert.ok(after.after.severeOverlaps <= before.after.severeOverlaps);
        assert.ok(after.after.overlaps <= before.after.overlaps);
        if (after.chosen !== before.chosen && (after.after.severeOverlaps < before.after.severeOverlaps ||
            after.after.overlaps < before.after.overlaps ||
            after.connections.mean < before.connections.mean)) improved = true;
      }
    }
  }
  assert.ok(improved);
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

test("documented membership hint pulls a new node closer without harming labels", () => {
  const graph = { nodes: [
    { id: "band", label: "Band", zone: "rock" },
    { id: "person", label: "Person", zone: "rock" },
  ], edges: [{ id: "membership", source: "person", target: "band", type: "member_of",
    strength: 0.9, sources: [{ url: "https://example.org/test-fixture" }] }] };
  const previous = { layouts: Object.fromEntries(["organized", "genre", "chaos"].map((mode) =>
    [mode, { nodes: { band: { x: 0, y: 0 } } }])) };
  const freshLayouts = () => Object.fromEntries(["organized", "genre", "chaos"].map((mode) =>
    [mode, { nodes: { band: { x: 0, y: 0 }, person: { x: 1200, y: 0 } } }]));
  const zones = [{ id: "rock", x: -1000, y: -1000, width: 3000, height: 3000 }];
  const plain = freshLayouts();
  const guided = freshLayouts();
  repairIncrementalLayouts(plain, previous, graph, {}, zones, [], new Set(), { constraintsEnabled: false });
  const report = repairIncrementalLayouts(guided, previous, graph, {}, zones);
  assert.ok(guided.organized.nodes.person.x < plain.organized.nodes.person.x);
  assert.ok(guided.organized.nodes.person.x > 0);
  assert.ok(Math.hypot(guided.organized.nodes.band.x, guided.organized.nodes.band.y) <= 84);
  assert.equal(evaluateNodeLegibility(graph, guided.organized.nodes, new Set(["person"])).overlapPairs, 0);
  assert.ok(report.unresolved.some((item) => item.reason === "pair-constraint-unmet"));
});

test("real-node replay keeps the unhinted result when pair guidance hurts readability", () => {
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const guidance = approved("organization-model.json").layoutIntelligence;
  const constraints = validateLayoutConstraints(approved("layout-constraints.json"), graph);
  const original = JSON.stringify(layouts);
  const result = benchmarkDocumentedGrowth(graph, layouts, guidance, [], constraints,
    ["bruce-dickinson", "chester-bennington"]);
  assert.equal(result.length, 6);
  assert.ok(result.some((item) => item.pairExcess[2] < item.pairExcess[1]));
  assert.ok(result.every((item) => item.newLabelPairs[1] <= item.newLabelPairs[0] &&
    item.severeNewLabels[1] <= item.severeNewLabels[0]));
  assert.equal(JSON.stringify(layouts), original);
});
