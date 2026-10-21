import { isMapConnection } from "../../shared/graph-schema/edge-evidence.mjs";
import { classifyOutcome, evaluateFocusedConnections, evaluateLayout, evaluateNodeLegibility, runLayoutExperiment } from "../../shared/layout-playground/experiment.mjs";

const PRESETS = [
  { spacing: 1.1, connectionPull: 0.2, zoneFreedom: 0.35, iterations: 24 },
  { spacing: 1.4, connectionPull: 0.3, zoneFreedom: 0.6, iterations: 32 },
  { spacing: 1.65, connectionPull: 0.15, zoneFreedom: 0.8, iterations: 36 },
];

function parameterKey(parameters) {
  return [parameters.spacing, parameters.connectionPull, parameters.zoneFreedom]
    .map((value) => Number(value).toFixed(2)).join(":");
}

function localMovementPolicy(graph, positions, original, freshIds, zone, pinnedIds) {
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
    if (near || connected.has(node.id)) {
      const starting = original[node.id];
      const spent = starting ? Math.hypot(point.x - starting.x, point.y - starting.y) : 0;
      const remaining = Math.max(0, 84 - spent);
      if (remaining > 0) policy[node.id] = { weight: 0.35, maxDistance: remaining };
    }
  }
  return policy;
}

export function repairIncrementalLayouts(layouts, previous, graph, guidance, zones, feedback = [], pinnedIds = new Set(), options = {}) {
  const report = { freshNodes: 0, trials: [], accepted: [], unresolved: [] };
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
      const movement = localMovementPolicy(graph, baseline, previous.layouts[mode].nodes,
        freshIds, zone, pinnedIds);
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
      const zoneFreshIds = new Set(graph.nodes.filter((node) => node.zone === zone && freshIds.has(node.id))
        .map((node) => node.id));
      const focusBefore = evaluateNodeLegibility(graph, baseline, zoneFreshIds);
      const assessed = candidates.map((candidate) => {
        const mapAfter = evaluateLayout(graph, baseline, candidate.positions);
        const focusAfter = evaluateNodeLegibility(graph, candidate.positions, zoneFreshIds);
        const reason = candidate.outcome !== "improved" ? "no-local-improvement"
          : candidate.after.severeOverlaps > candidate.before.severeOverlaps ||
            candidate.after.overlaps > candidate.before.overlaps ? "local-overlap-regression"
          : focusAfter.severelyOverlappingNodes > focusBefore.severelyOverlappingNodes ||
            focusAfter.overlapPairs > focusBefore.overlapPairs ? "new-node-legibility-regression"
          : classifyOutcome(mapBefore, mapAfter) === "regression" || mapAfter.score >= mapBefore.score
            ? "whole-map-regression" : "safe";
        const connectionsAfter = evaluateFocusedConnections(graph, candidate.positions, zoneFreshIds);
        return { candidate, reason, mapAfter, focusAfter, connectionsAfter };
      });
      const best = assessed.filter((item) => item.reason === "safe")
        .sort((a, b) => a.focusAfter.severelyOverlappingNodes - b.focusAfter.severelyOverlappingNodes ||
          a.focusAfter.overlapPairs - b.focusAfter.overlapPairs ||
          a.connectionsAfter.mean - b.connectionsAfter.mean ||
          a.candidate.after.score - b.candidate.after.score)[0]?.candidate;
      report.trials.push({ mode, zone, attempted: candidates.length, before: candidates[0]?.before,
        bestScore: best?.after.score ?? null,
        ...(options.captureTrials ? { focusBefore, candidates: assessed.map(({ candidate, reason, mapAfter, focusAfter, connectionsAfter }) => ({
          parameters: candidate.parameters, reason, localAfter: candidate.after,
          wholeMapAfter: mapAfter, focusAfter, connectionsAfter,
        })) } : {}),
      });
      if (best) {
        for (const [id, point] of Object.entries(best.positions)) {
          if (!movement[id]?.weight) continue;
          layout.nodes[id].x = point.x;
          layout.nodes[id].y = point.y;
        }
        report.accepted.push({ mode, zone, parameters: best.parameters, before: best.before, after: best.after });
      }
      const remaining = evaluateNodeLegibility(graph, layout.nodes, zoneFreshIds);
      if (remaining.overlapPairs) report.unresolved.push({ mode, zone,
        reason: "new-node-label-overlap", ...remaining });
      const connections = evaluateFocusedConnections(graph, layout.nodes, zoneFreshIds);
      if (connections.longestSameZone > 1800 || connections.longestCrossZone > 3200) {
        report.unresolved.push({ mode, zone, reason: "new-connection-long", ...connections });
      }
    }
  }
  return report;
}
