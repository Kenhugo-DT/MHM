import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateLayoutConstraints, validateLayoutConstraints } from "../../shared/layout-playground/constraints.mjs";
import { evaluateNodeLegibility, runLayoutExperiment } from "../../shared/layout-playground/experiment.mjs";
import { ORGANIZED_MAP_ZONES } from "./organize-graph-layout.mjs";
import { repairIncrementalLayouts } from "./adaptive-incremental-layout.mjs";
import { TRAINING_SCENARIOS, VALIDATION_SCENARIOS, simulateLayoutGrowth } from "./simulate-layout-growth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODES = ["organized", "genre", "chaos"];
const PARAMETERS = { spacing: 1.65, connectionPull: 0.25, zoneFreedom: 0.7, iterations: 48 };
const REPLAY_NODES = ["bruce-dickinson", "duff-mckagan", "chester-bennington", "john-coltrane"];

export function benchmarkDocumentedGrowth(graph, layouts, guidance, feedback, constraints,
  replayNodes = REPLAY_NODES) {
  const zones = Object.entries(ORGANIZED_MAP_ZONES).map(([id, zone]) => ({ id, ...zone }));
  return replayNodes.flatMap((id) => {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) throw new Error(`Replay node missing: ${id}`);
    const previous = structuredClone(layouts);
    for (const mode of MODES) delete previous.layouts[mode].nodes[id];
    const plain = structuredClone(layouts.layouts);
    const guided = structuredClone(layouts.layouts);
    const plainReport = repairIncrementalLayouts(plain, previous, graph, guidance, zones,
      feedback, new Set(), { constraintsEnabled: false });
    const guidedReport = repairIncrementalLayouts(guided, previous, graph, guidance, zones,
      feedback, new Set(), { constraints });
    const rules = constraints.filter((item) => item.source === id || item.target === id);
    return MODES.map((mode) => {
      const old = layouts.layouts[mode].nodes;
      const before = evaluateLayoutConstraints(old, rules);
      const without = evaluateLayoutConstraints(plain[mode].nodes, rules);
      const withHints = evaluateLayoutConstraints(guided[mode].nodes, rules);
      const plainLabels = evaluateNodeLegibility(graph, plain[mode].nodes, new Set([id]));
      const guidedLabels = evaluateNodeLegibility(graph, guided[mode].nodes, new Set([id]));
      const plainMetrics = plainReport.accepted.find((item) => item.mode === mode);
      const guidedMetrics = guidedReport.accepted.find((item) => item.mode === mode);
      return { node: id, mode, zone: node.zone, ruleIds: rules.map((item) => item.id),
        pairExcess: [before.totalExcess, without.totalExcess, withHints.totalExcess],
        newLabelPairs: [plainLabels.overlapPairs, guidedLabels.overlapPairs],
        severeNewLabels: [plainLabels.severelyOverlappingNodes, guidedLabels.severelyOverlappingNodes],
        accepted: [Boolean(plainMetrics), Boolean(guidedMetrics)],
        warningCount: [plainReport.unresolved.filter((item) => item.mode === mode).length,
          guidedReport.unresolved.filter((item) => item.mode === mode).length],
      };
    });
  });
}

export function benchmarkExistingPairs(graph, layouts, guidance, constraints) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const zones = Object.entries(ORGANIZED_MAP_ZONES).map(([id, zone]) => ({ id, ...zone }));
  const grouped = Map.groupBy(constraints, (item) => nodes.get(item.source).zone);
  return [...grouped].flatMap(([zone, rules]) => MODES.map((mode) => {
    const baseline = layouts.layouts[mode].nodes;
    const focusIds = new Set(rules.flatMap((rule) => [rule.source, rule.target]));
    const movement = Object.fromEntries([...focusIds].map((id) => [id, { weight: 1, maxDistance: 650 }]));
    const plain = runLayoutExperiment(graph, baseline, guidance, zones, PARAMETERS, zone, movement);
    const guided = runLayoutExperiment(graph, baseline, guidance, zones, PARAMETERS, zone, movement, rules);
    const plainLabels = evaluateNodeLegibility(graph, plain.positions, focusIds);
    const guidedLabels = evaluateNodeLegibility(graph, guided.positions, focusIds);
    const safe = guided.after.overlaps <= plain.after.overlaps &&
      guided.after.severeOverlaps <= plain.after.severeOverlaps &&
      guidedLabels.overlapPairs <= plainLabels.overlapPairs &&
      guidedLabels.severelyOverlappingNodes <= plainLabels.severelyOverlappingNodes;
    const plainExcess = evaluateLayoutConstraints(plain.positions, rules).totalExcess;
    const guidedExcess = guided.constraintsAfter.totalExcess;
    const status = guidedExcess < plainExcess ? safe ? "improved" : "blocked-overlap"
      : guidedExcess > plainExcess ? "worse" : "unchanged";
    return { zone, mode, ruleIds: rules.map((item) => item.id), safe, status,
      pairExcess: [guided.constraintsBefore.totalExcess,
        plainExcess, guidedExcess],
      labelPairs: [plainLabels.overlapPairs, guidedLabels.overlapPairs],
      mapOverlaps: [plain.after.overlaps, guided.after.overlaps],
      severeMapOverlaps: [plain.after.severeOverlaps, guided.after.severeOverlaps],
      meanEdge: [plain.after.meanEdge, guided.after.meanEdge] };
  }));
}

export function benchmarkLayoutConstraints(graph, layouts, guidance, feedback, constraints,
  scenarios = [...TRAINING_SCENARIOS, ...VALIDATION_SCENARIOS]) {
  const plain = simulateLayoutGrowth(graph, layouts, guidance, feedback, scenarios,
    undefined, undefined, { constraintsEnabled: false, constraints });
  const guided = simulateLayoutGrowth(graph, layouts, guidance, feedback, scenarios,
    undefined, undefined, { constraints });
  const comparisons = plain.scenarios.flatMap((scenario, index) => MODES.map((mode) => {
    const before = scenario.modes[mode];
    const after = guided.scenarios[index].modes[mode];
    return { scenario: scenario.id, mode,
      severeLabels: [before.newNodeLegibilityAfter.severelyOverlappingNodes,
        after.newNodeLegibilityAfter.severelyOverlappingNodes],
      labelPairs: [before.newNodeLegibilityAfter.overlapPairs, after.newNodeLegibilityAfter.overlapPairs],
      mapOverlaps: [before.after.overlaps, after.after.overlaps],
      longestNewEdge: [before.newNodeFitAfter.longestNewEdge, after.newNodeFitAfter.longestNewEdge],
      pairViolations: [before.pairHintsAfter.violations, after.pairHintsAfter.violations],
      pairExcess: [before.pairHintsAfter.totalExcess, after.pairHintsAfter.totalExcess],
      accepted: [scenario.accepted.filter((item) => item.mode === mode).length,
        guided.scenarios[index].accepted.filter((item) => item.mode === mode).length],
    };
  }));
  const summary = Object.fromEntries(["severeLabels", "labelPairs", "mapOverlaps", "longestNewEdge",
    "pairViolations", "pairExcess"].map((key) => [key, {
    without: comparisons.reduce((sum, item) => sum + item[key][0], 0),
    with: comparisons.reduce((sum, item) => sum + item[key][1], 0),
    improvedViews: comparisons.filter((item) => item[key][1] < item[key][0]).length,
    regressedViews: comparisons.filter((item) => item[key][1] > item[key][0]).length,
  }]));
  return { version: 1, sandboxOnly: true, syntheticGrowthViews: comparisons.length,
    documentedReplayViews: REPLAY_NODES.length * MODES.length,
    testedViews: comparisons.length, summary, comparisons,
    existingPairSandbox: benchmarkExistingPairs(graph, layouts, guidance, constraints),
    documentedGrowthReplay: benchmarkDocumentedGrowth(graph, layouts, guidance, feedback, constraints) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const approved = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "approved", name), "utf8"));
  const graph = approved("graph.json");
  const constraints = validateLayoutConstraints(approved("layout-constraints.json"), graph);
  const report = benchmarkLayoutConstraints(graph, approved("layouts.json"),
    approved("organization-model.json").layoutIntelligence,
    approved("layout-feedback.json").reviews, constraints);
  const output = path.join(ROOT, "data", "runs", "layout-constraints-benchmark.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Pair-hint A/B benchmark: ${report.testedViews} views; report ${output}`);
  console.log(JSON.stringify(report.summary));
  console.log(`Existing-pair sandbox: ${report.existingPairSandbox.filter((item) => item.status === "improved").length}/${report.existingPairSandbox.length} ` +
    "views improved pair distance without more overlap.");
  console.log(`Documented growth replay: ${report.documentedGrowthReplay.filter((item) =>
    item.pairExcess[2] < item.pairExcess[1] && item.newLabelPairs[1] <= item.newLabelPairs[0]).length}/` +
    `${report.documentedGrowthReplay.length} views improved pair distance without more new-label overlaps.`);
}
