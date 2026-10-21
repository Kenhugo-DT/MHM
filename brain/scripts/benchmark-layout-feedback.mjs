import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TRAINING_SCENARIOS, simulateLayoutGrowth } from "./simulate-layout-growth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODES = ["organized", "genre", "chaos"];

function selectedAttempts(scenario, mode) {
  return scenario.accepted.filter((item) => item.mode === mode)
    .map((item) => ({ zone: item.zone, parameters: item.parameters }));
}

export function benchmarkFeedbackImpact(graph, layouts, guidance, feedback, scenarios = TRAINING_SCENARIOS) {
  const without = simulateLayoutGrowth(graph, layouts, guidance, [], scenarios);
  const withFeedback = simulateLayoutGrowth(graph, layouts, guidance, feedback, scenarios);
  const comparisons = [];
  for (let i = 0; i < scenarios.length; i += 1) {
    for (const mode of MODES) {
      const plain = without.scenarios[i];
      const guided = withFeedback.scenarios[i];
      const before = plain.modes[mode];
      const after = guided.modes[mode];
      comparisons.push({ scenario: scenarios[i].id, mode,
        changedChoice: JSON.stringify(selectedAttempts(plain, mode)) !==
          JSON.stringify(selectedAttempts(guided, mode)),
        changedOutcome: before.after.overlaps !== after.after.overlaps ||
          before.after.severeOverlaps !== after.after.severeOverlaps ||
          before.newNodeLegibilityAfter.overlapPairs !== after.newNodeLegibilityAfter.overlapPairs ||
          before.newNodeFitAfter.longestNewEdge !== after.newNodeFitAfter.longestNewEdge,
      });
    }
  }
  return { version: 1, syntheticOnly: true, reviewedFeedbackCount: feedback.length,
    testedViews: comparisons.length,
    changedChoices: comparisons.filter((item) => item.changedChoice).length,
    changedOutcomes: comparisons.filter((item) => item.changedOutcome).length,
    comparisons };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const approved = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "approved", name), "utf8"));
  const report = benchmarkFeedbackImpact(approved("graph.json"), approved("layouts.json"),
    approved("organization-model.json").layoutIntelligence, approved("layout-feedback.json").reviews);
  const output = path.join(ROOT, "data", "runs", "layout-feedback-impact.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Reviewed layout feedback changed ${report.changedChoices}/${report.testedViews} choices ` +
    `and ${report.changedOutcomes}/${report.testedViews} outcomes; report ${output}`);
}
