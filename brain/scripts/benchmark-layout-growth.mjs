import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CALIBRATION_SCENARIOS, VALIDATION_SCENARIOS, simulateLayoutGrowth } from "./simulate-layout-growth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD_OFFSETS = [
  [0, 0], [160, 0], [0, 160], [-160, 0], [0, -160],
  [150, 150], [-150, 150], [150, -150], [-150, -150],
  [240, 0], [0, 240], [-240, 0], [0, -240],
];

function oldOpenPoint(x, y, occupied, timeline) {
  let best;
  for (const [dx, dy] of OLD_OFFSETS) {
    const candidate = { x: x + (timeline ? 0 : dx), y: y + dy };
    let clearance = Infinity;
    for (const point of occupied) {
      if (Math.abs(point.x - candidate.x) > 360 || Math.abs(point.y - candidate.y) > 360) continue;
      clearance = Math.min(clearance, Math.hypot(point.x - candidate.x, point.y - candidate.y));
    }
    if (!best || clearance > best.clearance) best = { ...candidate, clearance };
    if (clearance >= 135) return candidate;
  }
  return { x: best.x, y: best.y };
}

// Historical placement from before the legibility-aware search; used only as a benchmark control.
export function preserveLegacyIncrementalLayouts(layouts, previous, graph) {
  if (!previous?.layouts) return layouts;
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const [mode, layout] of Object.entries(layouts)) {
    if (mode === "alphabetic" || !previous.layouts[mode]?.nodes) continue;
    const old = previous.layouts[mode].nodes;
    const occupied = [];
    for (const [id, point] of Object.entries(layout.nodes)) {
      if (!old[id] || !graphNodes.has(id)) continue;
      const node = graphNodes.get(id);
      if (old[id].zone !== node.zone ||
          (mode === "timeline" && old[id].startYear !== point.startYear)) continue;
      point.x = old[id].x;
      const unknownShift = mode === "timeline" && point.decade === null
        ? Math.max(0, layout.guide.unknown.top - previous.layouts.timeline.guide.unknown.top) : 0;
      point.y = old[id].y + unknownShift;
      occupied.push(point);
    }
    for (const [id, point] of Object.entries(layout.nodes)) {
      if (old[id]) continue;
      const node = graphNodes.get(id);
      const connection = graph.edges.find((edge) => edge.type === "member_of" &&
        ((edge.source === id && old[edge.target]) || (edge.target === id && old[edge.source])));
      const connectedId = connection?.source === id ? connection.target : connection?.source;
      const nearId = node?.layoutHints?.nearNode ?? connectedId;
      const anchor = mode === "timeline" ? undefined : layout.nodes[nearId];
      const origin = anchor ? { x: anchor.x, y: anchor.y } : point;
      const placed = oldOpenPoint(origin.x, origin.y, occupied, mode === "timeline");
      point.x = placed.x;
      point.y = placed.y;
      occupied.push(point);
    }
  }
  return layouts;
}

export function benchmarkLayoutGrowth(graph, layouts, guidance, feedback = [], scenarios = VALIDATION_SCENARIOS) {
  const legacy = simulateLayoutGrowth(graph, layouts, guidance, feedback, scenarios,
    preserveLegacyIncrementalLayouts);
  const current = simulateLayoutGrowth(graph, layouts, guidance, feedback, scenarios);
  const comparisons = [];
  for (let i = 0; i < scenarios.length; i += 1) {
    for (const mode of ["organized", "genre", "chaos"]) {
      const old = legacy.scenarios[i].modes[mode];
      const next = current.scenarios[i].modes[mode];
      comparisons.push({ scenario: scenarios[i].id, mode, syntheticNodes: current.scenarios[i].syntheticNodes,
        legacyWarnings: [...new Set(legacy.scenarios[i].unresolved.filter((item) => item.mode === mode)
          .map((item) => item.reason))],
        currentWarnings: [...new Set(current.scenarios[i].unresolved.filter((item) => item.mode === mode)
          .map((item) => item.reason))],
        legacy: { severeNewLabels: old.newNodeLegibilityAfter.severelyOverlappingNodes,
          newLabelPairs: old.newNodeLegibilityAfter.overlapPairs,
          mapOverlaps: old.after.overlaps, mapSevere: old.after.severeOverlaps,
          longestNewEdge: old.newNodeFitAfter.longestNewEdge },
        current: { severeNewLabels: next.newNodeLegibilityAfter.severelyOverlappingNodes,
          newLabelPairs: next.newNodeLegibilityAfter.overlapPairs,
          mapOverlaps: next.after.overlaps, mapSevere: next.after.severeOverlaps,
          longestNewEdge: next.newNodeFitAfter.longestNewEdge },
      });
    }
  }
  const summary = Object.fromEntries(["severeNewLabels", "newLabelPairs", "mapOverlaps", "longestNewEdge"]
    .map((metric) => [metric, {
      legacy: comparisons.reduce((sum, item) => sum + item.legacy[metric], 0),
      current: comparisons.reduce((sum, item) => sum + item.current[metric], 0),
      improvedViews: comparisons.filter((item) => item.current[metric] < item.legacy[metric]).length,
      regressedViews: comparisons.filter((item) => item.current[metric] > item.legacy[metric]).length,
    }]));
  return { version: 1, syntheticOnly: true, baseline: "pre-legibility placement with current repair gate",
    scenarios: scenarios.map((item) => item.id), summary, comparisons };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const approved = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "approved", name), "utf8"));
  const graph = approved("graph.json");
  const layouts = approved("layouts.json");
  const guidance = approved("organization-model.json").layoutIntelligence;
  const feedback = approved("layout-feedback.json").reviews;
  const calibration = process.argv.includes("--calibration");
  const report = benchmarkLayoutGrowth(graph, layouts, guidance, feedback,
    calibration ? CALIBRATION_SCENARIOS : VALIDATION_SCENARIOS);
  const output = path.join(ROOT, "data", "runs", "layout-growth-benchmark.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${calibration ? "Calibration" : "Validation"} layout benchmark: ${report.scenarios.length} scenarios, report ${output}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
  for (const item of report.comparisons) {
    console.log(`${item.scenario}/${item.mode}: severe new labels ${item.legacy.severeNewLabels}->${item.current.severeNewLabels}, ` +
      `new label pairs ${item.legacy.newLabelPairs}->${item.current.newLabelPairs}, ` +
      `map overlaps ${item.legacy.mapOverlaps}->${item.current.mapOverlaps}, ` +
      `longest new edge ${item.legacy.longestNewEdge}->${item.current.longestNewEdge}`);
  }
}
