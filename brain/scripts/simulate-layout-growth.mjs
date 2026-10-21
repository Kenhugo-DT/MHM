import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateLayout, evaluateNodeLegibility } from "../../shared/layout-playground/experiment.mjs";
import { ORGANIZED_MAP_ZONES } from "./organize-graph-layout.mjs";
import { preserveIncrementalLayouts } from "./incremental-layout.mjs";
import { repairIncrementalLayouts } from "./adaptive-incremental-layout.mjs";
import { deriveGrowthConstraints, evaluateLayoutConstraints } from "../../shared/layout-playground/constraints.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODES = ["organized", "genre", "chaos"];
export const TRAINING_SCENARIOS = [
  { id: "single-rock", groups: [{ zone: "rock-circuit", count: 1, bridge: false }] },
  { id: "dense-rock", groups: [{ zone: "rock-circuit", count: 18, bridge: false }] },
  { id: "early-history", groups: [{ zone: "classical-history", count: 12, bridge: false }] },
  { id: "pop-and-jazz", groups: [
    { zone: "pop-soul-disco", count: 8, bridge: false },
    { zone: "jazz", count: 8, bridge: false },
  ] },
  { id: "cross-zone-bridges", groups: [
    { zone: "roots-blues", count: 4, bridge: "rock-circuit" },
    { zone: "rock-circuit", count: 4, bridge: "hard-rock-metal" },
  ] },
];

export const CALIBRATION_SCENARIOS = [
  { id: "metal-and-rap", groups: [
    { zone: "hard-rock-metal", count: 11, anchorRank: 5, type: "band" },
    { zone: "hip-hop-rap", count: 7, anchorRank: 3, type: "artist" },
  ] },
  { id: "country-pop-bridge", groups: [
    { zone: "country-roots", count: 5, anchorRank: 4, bridge: "pop-soul-disco", type: "artist" },
    { zone: "folk-country-vise", count: 4, anchorRank: 2, bridge: "roots-blues", type: "genre" },
  ] },
  { id: "instrument-workshop", groups: [
    { zone: "guitar-workshop", count: 10, anchorRank: 8, type: "guitar" },
  ] },
  { id: "punk-prog-growth", groups: [
    { zone: "punk-alt", count: 9, anchorRank: 9, type: "band" },
    { zone: "psychedelia-prog", count: 6, anchorRank: 3, type: "genre" },
  ] },
];

export const VALIDATION_SCENARIOS = [
  { id: "blues-jazz-crossing", groups: [
    { zone: "roots-blues", count: 7, anchorRank: 12, bridge: "jazz", type: "artist" },
    { zone: "jazz", count: 9, anchorRank: 14, type: "guitarist" },
  ] },
  { id: "soul-disco-wave", groups: [
    { zone: "pop-soul-disco", count: 14, anchorRank: 28, type: "band" },
  ] },
  { id: "classical-country-line", groups: [
    { zone: "classical-history", count: 7, anchorRank: 7, type: "artist" },
    { zone: "country-roots", count: 7, anchorRank: 17, type: "artist" },
  ] },
  { id: "guitar-to-metal-bridge", groups: [
    { zone: "guitar-workshop", count: 6, anchorRank: 18, bridge: "hard-rock-metal", type: "guitar" },
    { zone: "hard-rock-metal", count: 6, anchorRank: 22, type: "guitarist" },
  ] },
];

function readApproved(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "approved", name), "utf8"));
}

function anchorFor(graph, layouts, zone, rank = 0) {
  const candidates = graph.nodes.filter((node) => node.zone === zone && layouts.organized.nodes[node.id]);
  if (!candidates.length) throw new Error(`No anchor in ${zone}`);
  const edgeCounts = new Map(candidates.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    if (edgeCounts.has(edge.source)) edgeCounts.set(edge.source, edgeCounts.get(edge.source) + 1);
    if (edgeCounts.has(edge.target)) edgeCounts.set(edge.target, edgeCounts.get(edge.target) + 1);
  }
  return candidates.sort((a, b) => edgeCounts.get(b.id) - edgeCounts.get(a.id) || a.id.localeCompare(b.id))
    [Math.min(rank, candidates.length - 1)];
}

function synthesize(graph, layouts, scenario) {
  const synthetic = [];
  for (const group of scenario.groups) {
    const anchor = anchorFor(graph, layouts, group.zone, group.anchorRank);
    const bridgeAnchor = group.bridge ? anchorFor(graph, layouts, group.bridge) : undefined;
    for (let i = 0; i < group.count; i += 1) {
      const id = `__simulation_${scenario.id}_${group.zone}_${i}`;
      const node = { id, label: `Test ${group.type ?? "band"} ${i + 1} ${group.zone.replaceAll("-", " ")}`,
        type: group.type ?? "band", zone: group.zone, layoutHints: { nearNode: anchor.id }, synthetic: true };
      graph.nodes.push(node);
      synthetic.push(node);
      graph.edges.push({ id: `${id}_anchor`, source: id, target: anchor.id,
        type: "simulation_link", strength: 0.85, synthetic: true });
      if (bridgeAnchor) graph.edges.push({ id: `${id}_bridge`, source: id, target: bridgeAnchor.id,
        type: "simulation_link", strength: 0.8, synthetic: true });
      for (const layout of Object.values(layouts)) {
        const point = layout.nodes[anchor.id];
        layout.nodes[id] = { ...point, x: point.x + (i % 3) * 10, y: point.y + (i % 2) * 10,
          zone: group.zone, label: node.label, type: node.type };
      }
    }
  }
  return synthetic;
}

function counts(graph, baseline, positions) {
  const { overlaps, severeOverlaps, meanEdge, longEdges, score } = evaluateLayout(graph, baseline, positions);
  return { overlaps, severeOverlaps, meanEdge, longEdges, score };
}

function maxOldDrift(previous, current) {
  let max = 0;
  for (const [id, point] of Object.entries(previous)) {
    const moved = current[id];
    if (moved) max = Math.max(max, Math.hypot(moved.x - point.x, moved.y - point.y));
  }
  return Math.round(max);
}

function syntheticFit(graph, positions, syntheticIds, zones) {
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  let outsideZone = 0;
  for (const node of graph.nodes) {
    if (!syntheticIds.has(node.id)) continue;
    const point = positions[node.id];
    const zone = zoneById.get(node.zone);
    if (zone && (point.x < zone.x || point.x > zone.x + zone.width ||
        point.y < zone.y || point.y > zone.y + zone.height)) outsideZone += 1;
  }
  const lengths = graph.edges.filter((edge) => edge.synthetic).map((edge) => {
    const a = positions[edge.source];
    const b = positions[edge.target];
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
  return { outsideZone, meanNewEdge: Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length),
    longestNewEdge: Math.round(Math.max(...lengths)) };
}

export function simulateLayoutGrowth(graphInput, layoutInput, guidance, feedback = [],
  scenarios = TRAINING_SCENARIOS, preserve = preserveIncrementalLayouts, experience, constraintOptions = {}) {
  const zones = Object.entries(ORGANIZED_MAP_ZONES).map(([id, zone]) => ({ id, ...zone }));
  const result = { version: 1, syntheticOnly: true, graphNodes: graphInput.nodes.length,
    scenarios: [], feedbackEvidence: [] };
  const evidence = new Map();
  for (const scenario of scenarios) {
    const graph = structuredClone(graphInput);
    const layouts = structuredClone(layoutInput.layouts);
    const synthetic = synthesize(graph, layouts, scenario);
    const syntheticIds = new Set(synthetic.map((node) => node.id));
    const pairHints = [...(constraintOptions.constraints ?? []), ...deriveGrowthConstraints(graph, syntheticIds)];
    const previous = layoutInput;
    preserve(layouts, previous, graph);
    const naive = Object.fromEntries(MODES.map((mode) => [mode, structuredClone(layouts[mode].nodes)]));
    const started = performance.now();
    const repair = repairIncrementalLayouts(layouts, previous, graph, guidance, zones, feedback,
      new Set(), { captureTrials: true, experience, ...constraintOptions });
    const runtimeMs = Math.round(performance.now() - started);
    const modeResults = Object.fromEntries(MODES.map((mode) => [mode, {
      before: counts(graph, naive[mode], naive[mode]),
      after: counts(graph, naive[mode], layouts[mode].nodes),
      newNodeLegibilityBefore: evaluateNodeLegibility(graph, naive[mode], syntheticIds),
      newNodeLegibilityAfter: evaluateNodeLegibility(graph, layouts[mode].nodes, syntheticIds),
      newNodeFitBefore: syntheticFit(graph, naive[mode], syntheticIds, zones),
      newNodeFitAfter: syntheticFit(graph, layouts[mode].nodes, syntheticIds, zones),
      pairHintsBefore: evaluateLayoutConstraints(naive[mode], pairHints),
      pairHintsAfter: evaluateLayoutConstraints(layouts[mode].nodes, pairHints),
      maxOldDrift: maxOldDrift(previous.layouts[mode].nodes, layouts[mode].nodes),
    }]));
    for (const trial of repair.trials) {
      for (const candidate of trial.candidates) {
        const key = `${trial.mode}|${trial.zone}|${JSON.stringify(candidate.parameters)}`;
        if (!evidence.has(key)) evidence.set(key, { mode: trial.mode, zone: trial.zone,
          parameters: candidate.parameters, safe: 0, rejected: 0, reasons: {} });
        const item = evidence.get(key);
        item[candidate.reason === "safe" ? "safe" : "rejected"] += 1;
        item.reasons[candidate.reason] = (item.reasons[candidate.reason] ?? 0) + 1;
      }
    }
    result.scenarios.push({ id: scenario.id, syntheticNodes: synthetic.length, runtimeMs,
      accepted: repair.accepted.map(({ mode, zone, arm, parameters, before, after }) => ({
        mode, zone, arm, parameters,
        localOverlapsBefore: before.overlaps, localOverlapsAfter: after.overlaps,
        localSevereBefore: before.severeOverlaps, localSevereAfter: after.severeOverlaps,
      })),
      unresolved: repair.unresolved,
      trials: repair.trials.map(({ mode, zone, attempted, candidates, hintIds }) => ({ mode, zone, attempted,
        hintIds, candidates: candidates.map(({ arm, parameters, reason, localAfter, wholeMapAfter,
          constraintsAfter }) => ({
          arm, parameters, reason, localOverlaps: localAfter.overlaps,
          localSevere: localAfter.severeOverlaps, wholeMapScore: wholeMapAfter.score,
          pairExcess: constraintsAfter.totalExcess,
        })) })),
      modes: modeResults,
      feedback: MODES.map((mode) => {
        const before = modeResults[mode].newNodeLegibilityBefore;
        const after = modeResults[mode].newNodeLegibilityAfter;
        const issues = [...new Set(repair.unresolved.filter((item) => item.mode === mode)
          .map((item) => item.reason))];
        return { mode, verdict: issues.length ? "needs-work"
          : before.overlapPairs > after.overlapPairs ? "better" : "stable",
          signals: issues.length ? issues : ["new-node-labels-readable"],
          severeNewLabels: after.severelyOverlappingNodes,
          improvedOverlapPairs: modeResults[mode].newNodeLegibilityBefore.overlapPairs - after.overlapPairs };
      }),
      timelineUnchanged: Object.entries(previous.layouts.timeline.nodes).every(([id, point]) =>
        layouts.timeline.nodes[id]?.x === point.x && layouts.timeline.nodes[id]?.y === point.y),
      alphabeticUnchanged: Object.entries(previous.layouts.alphabetic.nodes).every(([id, point]) =>
        layouts.alphabetic.nodes[id]?.x === point.x && layouts.alphabetic.nodes[id]?.y === point.y),
    });
  }
  result.feedbackEvidence = [...evidence.values()].sort((a, b) =>
    a.mode.localeCompare(b.mode) || a.zone.localeCompare(b.zone));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const graph = readApproved("graph.json");
  const layouts = readApproved("layouts.json");
  const organization = readApproved("organization-model.json");
  const feedback = readApproved("layout-feedback.json").reviews;
  const report = simulateLayoutGrowth(graph, layouts, organization.layoutIntelligence, feedback);
  const output = path.join(ROOT, "data", "runs", "layout-growth-simulation.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Synthetic layout growth: ${report.scenarios.length} scenarios, ${report.scenarios.reduce((sum, item) => sum + item.syntheticNodes, 0)} injected nodes, report ${output}`);
  for (const item of report.scenarios) {
    console.log(`${item.id}: ${item.accepted.length} accepted, ${item.runtimeMs} ms; ` +
      MODES.map((mode) => `${mode} ${item.modes[mode].before.overlaps}->${item.modes[mode].after.overlaps} overlaps`).join(", "));
  }
}
