import { isMapConnection } from "../../shared/graph-schema/edge-evidence.mjs";
import { classifyOutcome, evaluateLayout, runLayoutExperiment } from "../../shared/layout-playground/experiment.mjs";

const PRESETS = [
  { spacing: 1.1, connectionPull: 0.2, zoneFreedom: 0.35, iterations: 24 },
  { spacing: 1.4, connectionPull: 0.3, zoneFreedom: 0.6, iterations: 32 },
  { spacing: 1.65, connectionPull: 0.15, zoneFreedom: 0.8, iterations: 36 },
];

function parameterKey(parameters) {
  return [parameters.spacing, parameters.connectionPull, parameters.zoneFreedom]
    .map((value) => Number(value).toFixed(2)).join(":");
}

function localMovementPolicy(graph, positions, freshIds, zone, pinnedIds) {
  const zoneFresh = graph.nodes.filter((node) => node.zone === zone && freshIds.has(node.id));
  const freshSet = new Set(zoneFresh.map((node) => node.id));
  const connected = new Set();
  for (const edge of graph.edges) {
    if (!isMapConnection(edge)) continue;
    if (freshSet.has(edge.source)) connected.add(edge.target);
    if (freshSet.has(edge.target)) connected.add(edge.source);
  }
  const policy = {};
  for (const node of graph.nodes) {
    if (node.zone !== zone || !positions[node.id] || pinnedIds.has(node.id)) continue;
    if (freshSet.has(node.id)) {
      policy[node.id] = { weight: 1, maxDistance: 340 };
      continue;
    }
    const point = positions[node.id];
    const near = zoneFresh.some((fresh) => {
      const origin = positions[fresh.id];
      return origin && Math.hypot(point.x - origin.x, point.y - origin.y) < 390;
    });
    if (near || connected.has(node.id)) policy[node.id] = { weight: 0.35, maxDistance: 85 };
  }
  return policy;
}

export function repairIncrementalLayouts(layouts, previous, graph, guidance, zones, feedback = [], pinnedIds = new Set()) {
  const report = { freshNodes: 0, trials: [], accepted: [] };
  if (!previous?.layouts?.organized?.nodes) return report;
  const freshIds = new Set(graph.nodes.filter((node) => !previous.layouts.organized.nodes[node.id]).map((node) => node.id));
  report.freshNodes = freshIds.size;
  if (!freshIds.size) return report;

  const affectedZones = [...new Set(graph.nodes.filter((node) => freshIds.has(node.id)).map((node) => node.zone))].sort();
  for (const mode of ["organized", "genre", "chaos"]) {
    const layout = layouts[mode];
    if (!layout?.nodes || !previous.layouts[mode]?.nodes) continue;
    for (const zone of affectedZones) {
      const baseline = layout.nodes;
      const movement = localMovementPolicy(graph, baseline, freshIds, zone, pinnedIds);
      const preferred = feedback.filter((item) => item.mode === mode && item.zone === zone && item.verdict === "better")
        .map((item) => item.parameters);
      const rejected = new Set(feedback.filter((item) => item.mode === mode && item.zone === zone && item.verdict === "worse")
        .map((item) => parameterKey(item.parameters)));
      const parameters = [...preferred, ...PRESETS]
        .filter((item, index, items) => items.findIndex((other) => parameterKey(other) === parameterKey(item)) === index)
        .filter((item) => !rejected.has(parameterKey(item)))
        .slice(0, 6);
      const candidates = parameters.map((item) => runLayoutExperiment(graph, baseline, guidance, zones, item, zone, movement));
      const mapBefore = evaluateLayout(graph, baseline, baseline);
      const safe = candidates.filter((candidate) => {
        if (candidate.outcome !== "improved" || candidate.after.severeOverlaps > candidate.before.severeOverlaps ||
            candidate.after.overlaps > candidate.before.overlaps) return false;
        const mapAfter = evaluateLayout(graph, baseline, candidate.positions);
        return classifyOutcome(mapBefore, mapAfter) !== "regression" && mapAfter.score < mapBefore.score;
      });
      const best = safe.sort((a, b) => a.after.score - b.after.score)[0];
      report.trials.push({ mode, zone, attempted: candidates.length, before: candidates[0]?.before,
        bestScore: best?.after.score ?? null });
      if (!best) continue;
      for (const [id, point] of Object.entries(best.positions)) {
        if (!movement[id]?.weight) continue;
        layout.nodes[id].x = point.x;
        layout.nodes[id].y = point.y;
      }
      report.accepted.push({ mode, zone, parameters: best.parameters, before: best.before, after: best.after });
    }
  }
  return report;
}
