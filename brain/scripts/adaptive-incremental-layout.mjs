import { isMapConnection } from "../../shared/graph-schema/edge-evidence.mjs";
import { classifyOutcome, evaluateFocusedConnections, evaluateLayout, evaluateNodeLegibility, runLayoutExperiment } from "../../shared/layout-playground/experiment.mjs";
import { historicalLayoutPreference } from "./layout-experience.mjs";
import { deriveGrowthConstraints, evaluateLayoutConstraints } from "../../shared/layout-playground/constraints.mjs";

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
  const constraints = options.constraintsEnabled === false ? [] : [
    ...(options.constraints ?? []).filter((item) =>
      freshIds.has(item.source) || freshIds.has(item.target)),
    ...deriveGrowthConstraints(graph, freshIds),
  ];

  const affectedZones = [...new Set(graph.nodes.filter((node) => freshIds.has(node.id)).map((node) => node.zone))].sort();
  for (const mode of ["organized", "genre", "chaos"]) {
    const layout = layouts[mode];
    if (!layout?.nodes || !previous.layouts[mode]?.nodes) continue;
    for (const zone of affectedZones) {
      const baseline = layout.nodes;
      const zoneFreshIds = new Set(graph.nodes.filter((node) => node.zone === zone && freshIds.has(node.id))
        .map((node) => node.id));
      const activeHints = constraints.filter((item) =>
        zoneFreshIds.has(item.source) || zoneFreshIds.has(item.target));
      const movement = localMovementPolicy(graph, baseline, previous.layouts[mode].nodes,
        freshIds, zone, pinnedIds);
      const preferred = feedback.filter((item) => item.mode === mode && item.zone === zone && item.verdict === "better")
        .map((item) => item.parameters);
      const preferredKeys = new Set(preferred.map(parameterKey));
      const standardKeys = new Set([...preferred, ...PRESETS].map(parameterKey));
      const rejected = new Set(feedback.filter((item) => item.mode === mode && item.zone === zone && item.verdict === "worse")
        .map((item) => parameterKey(item.parameters)));
      const practiceParameters = options.practice?.enabled
        ? options.practice.parametersByModeZone?.[mode]?.[zone] ?? [] : [];
      const parameters = [...preferred, ...PRESETS, ...practiceParameters, ...(options.additionalParameters ?? [])]
        .filter((item, index, items) => items.findIndex((other) => parameterKey(other) === parameterKey(item)) === index)
        .filter((item) => !rejected.has(parameterKey(item)))
        .slice(0, 12);
      const candidates = parameters.map((item) => runLayoutExperiment(graph, baseline, guidance, zones, item, zone,
        movement, activeHints));
      const plainCandidates = activeHints.length ? parameters.map((item) =>
        runLayoutExperiment(graph, baseline, guidance, zones, item, zone, movement)) : [];
      const mapBefore = evaluateLayout(graph, baseline, baseline);
      const focusBefore = evaluateNodeLegibility(graph, baseline, zoneFreshIds);
      const assess = (candidate, arm) => {
        const mapAfter = evaluateLayout(graph, baseline, candidate.positions);
        const focusAfter = evaluateNodeLegibility(graph, candidate.positions, zoneFreshIds);
        const reason = candidate.outcome !== "improved" ? "no-local-improvement"
          : candidate.after.severeOverlaps > candidate.before.severeOverlaps ||
            candidate.after.overlaps > candidate.before.overlaps ? "local-overlap-regression"
          : focusAfter.severelyOverlappingNodes > focusBefore.severelyOverlappingNodes ||
            focusAfter.overlapPairs > focusBefore.overlapPairs ? "new-node-legibility-regression"
          : candidate.constraintsAfter.violations > candidate.constraintsBefore.violations ||
            candidate.constraintsAfter.totalExcess > candidate.constraintsBefore.totalExcess
            ? "constraint-regression"
          : classifyOutcome(mapBefore, mapAfter) === "regression" || mapAfter.score >= mapBefore.score
            ? "whole-map-regression" : "safe";
        const connectionsAfter = evaluateFocusedConnections(graph, candidate.positions, zoneFreshIds);
        return { candidate, arm, reason, mapAfter, focusAfter, connectionsAfter };
      };
      const assessed = candidates.map((candidate) => assess(candidate, activeHints.length ? "hinted" : "plain"));
      const plainAssessed = plainCandidates.map((candidate) => assess(candidate, "plain"));
      const rank = (a, b) => a.focusAfter.severelyOverlappingNodes - b.focusAfter.severelyOverlappingNodes ||
          a.focusAfter.overlapPairs - b.focusAfter.overlapPairs ||
          a.candidate.constraintsAfter.totalExcess - b.candidate.constraintsAfter.totalExcess ||
          a.connectionsAfter.mean - b.connectionsAfter.mean ||
          a.candidate.after.score - b.candidate.after.score;
      const eligible = assessed.filter((item) => item.reason === "safe").sort(rank);
      const standardBest = eligible.find((item) => standardKeys.has(parameterKey(item.candidate.parameters)));
      const plainBest = plainAssessed.filter((item) => item.reason === "safe").sort(rank)[0];
      const objectiveBest = eligible[0];
      const comparable = (item) =>
        item.focusAfter.severelyOverlappingNodes === objectiveBest?.focusAfter.severelyOverlappingNodes &&
        item.focusAfter.overlapPairs === objectiveBest?.focusAfter.overlapPairs &&
        item.mapAfter.severeOverlaps <= objectiveBest.mapAfter.severeOverlaps &&
        item.mapAfter.overlaps <= objectiveBest.mapAfter.overlaps &&
        item.connectionsAfter.mean <= objectiveBest.connectionsAfter.mean + 100 &&
        item.connectionsAfter.longestSameZone <= objectiveBest.connectionsAfter.longestSameZone + 150 &&
        item.connectionsAfter.longestCrossZone <= objectiveBest.connectionsAfter.longestCrossZone + 150 &&
        item.mapAfter.score <= objectiveBest.mapAfter.score + 25;
      const reviewedBest = eligible.find((item) => preferredKeys.has(parameterKey(item.candidate.parameters)) &&
        comparable(item));
      const realHistory = options.experience;
      const realSamples = standardBest && historicalLayoutPreference(realHistory, mode, zone,
        standardBest.candidate.parameters, activeHints.length > 0).samples;
      const history = realSamples >= 3 ? realHistory : practiceParameters.length ? options.practice : undefined;
      const baselineHistory = objectiveBest && historicalLayoutPreference(history, mode, zone,
        objectiveBest.candidate.parameters, activeHints.length > 0);
      const learnedBest = !reviewedBest && baselineHistory?.samples >= 3 ? eligible.find((item) => {
        if (!comparable(item)) return false;
        const prior = historicalLayoutPreference(history, mode, zone, item.candidate.parameters,
          activeHints.length > 0);
        return prior.samples >= 3 && prior.safe >= 2 && prior.rate >= 0.75 &&
          prior.rate > baselineHistory.rate + 0.15;
      }) : undefined;
      let bestChoice = reviewedBest ?? learnedBest ?? objectiveBest;
      let selection = reviewedBest && reviewedBest !== objectiveBest ? "reviewed-preference" :
        learnedBest && learnedBest !== objectiveBest ? history === realHistory ? "observed-history" : "observed-practice" :
        bestChoice ? "objective" : "none";
      if (practiceParameters.length && bestChoice && standardBest &&
          !standardKeys.has(parameterKey(bestChoice.candidate.parameters))) {
        const safeAgainstStandard =
          bestChoice.focusAfter.severelyOverlappingNodes <= standardBest.focusAfter.severelyOverlappingNodes &&
          bestChoice.focusAfter.overlapPairs <= standardBest.focusAfter.overlapPairs &&
          bestChoice.mapAfter.severeOverlaps <= standardBest.mapAfter.severeOverlaps &&
          bestChoice.mapAfter.overlaps <= standardBest.mapAfter.overlaps &&
          bestChoice.candidate.constraintsAfter.totalExcess <= standardBest.candidate.constraintsAfter.totalExcess &&
          bestChoice.connectionsAfter.mean <= standardBest.connectionsAfter.mean + 100 &&
          bestChoice.connectionsAfter.longestSameZone <= standardBest.connectionsAfter.longestSameZone + 150 &&
          bestChoice.connectionsAfter.longestCrossZone <= standardBest.connectionsAfter.longestCrossZone + 150;
        if (!safeAgainstStandard) {
          bestChoice = standardBest;
          selection = "practice-safety-fallback";
        }
      }
      if (plainBest && activeHints.length) {
        const plainPairExcess = evaluateLayoutConstraints(plainBest.candidate.positions, activeHints).totalExcess;
        const guidedSafe = bestChoice &&
          bestChoice.candidate.constraintsAfter.totalExcess < plainPairExcess &&
          bestChoice.focusAfter.severelyOverlappingNodes <= plainBest.focusAfter.severelyOverlappingNodes &&
          bestChoice.focusAfter.overlapPairs <= plainBest.focusAfter.overlapPairs &&
          bestChoice.mapAfter.severeOverlaps <= plainBest.mapAfter.severeOverlaps &&
          bestChoice.mapAfter.overlaps <= plainBest.mapAfter.overlaps &&
          bestChoice.connectionsAfter.mean <= plainBest.connectionsAfter.mean + 100 &&
          bestChoice.connectionsAfter.longestSameZone <= plainBest.connectionsAfter.longestSameZone + 150 &&
          bestChoice.connectionsAfter.longestCrossZone <= plainBest.connectionsAfter.longestCrossZone + 150;
        if (!guidedSafe) {
          bestChoice = plainBest;
          selection = "unhinted-fallback";
        }
      }
      const best = bestChoice?.candidate;
      report.trials.push({ mode, zone, hintIds: activeHints.map((item) => item.id),
        attempted: candidates.length + plainCandidates.length, before: candidates[0]?.before,
        bestScore: best?.after.score ?? null,
        selection,
        ...(options.captureTrials ? { focusBefore, candidates: [...assessed, ...plainAssessed]
          .map(({ candidate, arm, reason, mapAfter, focusAfter, connectionsAfter }) => ({
            arm, parameters: candidate.parameters, reason, localAfter: candidate.after,
            wholeMapAfter: mapAfter, focusAfter, connectionsAfter,
            constraintsBefore: arm === "plain" && activeHints.length
              ? evaluateLayoutConstraints(baseline, activeHints) : candidate.constraintsBefore,
            constraintsAfter: arm === "plain" && activeHints.length
              ? evaluateLayoutConstraints(candidate.positions, activeHints) : candidate.constraintsAfter,
          })) } : {}),
      });
      if (best) {
        for (const [id, point] of Object.entries(best.positions)) {
          if (!movement[id]?.weight) continue;
          layout.nodes[id].x = point.x;
          layout.nodes[id].y = point.y;
        }
        report.accepted.push({ mode, zone, arm: bestChoice.arm,
          parameters: best.parameters, before: best.before, after: best.after });
      }
      const remaining = evaluateNodeLegibility(graph, layout.nodes, zoneFreshIds);
      if (remaining.overlapPairs) report.unresolved.push({ mode, zone,
        reason: "new-node-label-overlap", ...remaining });
      const connections = evaluateFocusedConnections(graph, layout.nodes, zoneFreshIds);
      if (connections.longestSameZone > 1800 || connections.longestCrossZone > 3200) {
        report.unresolved.push({ mode, zone, reason: "new-connection-long", ...connections });
      }
      const constraintState = evaluateLayoutConstraints(layout.nodes, activeHints);
      if (constraintState.violations) report.unresolved.push({ mode, zone,
        reason: "pair-constraint-unmet", violations: constraintState.violations,
        totalExcess: constraintState.totalExcess });
    }
  }
  return report;
}
