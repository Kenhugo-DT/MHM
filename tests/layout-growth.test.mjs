import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { simulateLayoutGrowth } from "../brain/scripts/simulate-layout-growth.mjs";
import { evaluateNodeLegibility } from "../shared/layout-playground/experiment.mjs";

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
        assert.ok(scenario.unresolved.some((entry) => entry.mode === item.mode));
      } else {
        assert.equal(item.severeNewLabels, 0);
        assert.ok(!scenario.unresolved.some((entry) => entry.mode === item.mode));
      }
    }
  }
  assert.equal(graph.nodes.length, result.graphNodes);
  assert.ok(graph.nodes.every((node) => !node.id.startsWith("__simulation_")));
});
