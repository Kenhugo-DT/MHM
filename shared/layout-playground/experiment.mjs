import { isMapConnection } from "../graph-schema/edge-evidence.mjs";

export const DEFAULT_PARAMETERS = Object.freeze({
  spacing: 1,
  connectionPull: 0.35,
  zoneFreedom: 0.45,
  iterations: 32,
});

const CELL = 240;

function labelBox(node, point) {
  const width = Math.min(540, Math.max(120, 32 + String(node.label).length * 16));
  return { left: point.x - width / 2, right: point.x + width / 2,
    top: point.y - 18, bottom: point.y + 70 };
}

function cellKey(x, y) {
  return `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
}

function nearbyPairs(nodes, points, visit) {
  const grid = new Map();
  for (let i = 0; i < nodes.length; i += 1) {
    const point = points[i];
    if (!point) continue;
    const cx = Math.floor(point.x / CELL);
    const cy = Math.floor(point.y / CELL);
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const j of grid.get(`${cx + dx}:${cy + dy}`) ?? []) visit(j, i);
      }
    }
    const key = cellKey(point.x, point.y);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
}

function overlap(first, second) {
  const x = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const y = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return x > 0 && y > 0 ? { x, y } : null;
}

function safeParameters(parameters) {
  const result = { ...DEFAULT_PARAMETERS, ...parameters };
  for (const [key, min, max] of [
    ["spacing", 0.5, 2], ["connectionPull", 0, 1],
    ["zoneFreedom", 0, 1], ["iterations", 1, 100],
  ]) {
    if (!Number.isFinite(result[key]) || result[key] < min || result[key] > max) {
      throw new Error(`Invalid playground parameter: ${key}`);
    }
  }
  result.iterations = Math.floor(result.iterations);
  return result;
}

export function evaluateLayout(graph, baseline, positions, scopeZone = "all") {
  const nodes = graph.nodes;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const points = nodes.map((node) => positions[node.id]);
  let overlaps = 0;
  let severeOverlaps = 0;
  nearbyPairs(nodes, points, (a, b) => {
    if (scopeZone !== "all" && nodes[a].zone !== scopeZone && nodes[b].zone !== scopeZone) return;
    const hit = overlap(labelBox(nodes[a], points[a]), labelBox(nodes[b], points[b]));
    if (!hit) return;
    overlaps += 1;
    if (hit.x > 28 && hit.y > 16) severeOverlaps += 1;
  });

  let edgeSum = 0;
  let edgeCount = 0;
  let longEdges = 0;
  for (const edge of graph.edges) {
    if (!isMapConnection(edge)) continue;
    const a = index.get(edge.source);
    const b = index.get(edge.target);
    if (a === undefined || b === undefined || !points[a] || !points[b]) continue;
    if (scopeZone !== "all" && nodes[a].zone !== scopeZone && nodes[b].zone !== scopeZone) continue;
    const distance = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
    edgeSum += distance;
    edgeCount += 1;
    if (distance > 1800) longEdges += 1;
  }

  let driftSum = 0;
  let measuredNodes = 0;
  for (const node of nodes) {
    if (scopeZone !== "all" && node.zone !== scopeZone) continue;
    const current = positions[node.id];
    const original = baseline[node.id];
    if (!current || !original) continue;
    driftSum += Math.hypot(current.x - original.x, current.y - original.y);
    measuredNodes += 1;
  }
  const meanEdge = edgeCount ? edgeSum / edgeCount : 0;
  const meanDrift = measuredNodes ? driftSum / measuredNodes : 0;
  return {
    nodes: measuredNodes,
    edges: edgeCount,
    overlaps,
    severeOverlaps,
    meanEdge: Math.round(meanEdge),
    longEdges,
    meanDrift: Math.round(meanDrift),
    score: Math.round((overlaps * 8 + severeOverlaps * 14 +
      meanEdge * Math.max(1, edgeCount / Math.max(1, measuredNodes)) * 0.025 +
      longEdges * 2 + meanDrift * 0.035) * 10) / 10,
  };
}

export function evaluateNodeLegibility(graph, positions, focusIds) {
  const nodes = graph.nodes;
  const points = nodes.map((node) => positions[node.id]);
  const collided = new Set();
  const severe = new Set();
  let overlapPairs = 0;
  nearbyPairs(nodes, points, (a, b) => {
    if (!focusIds.has(nodes[a].id) && !focusIds.has(nodes[b].id)) return;
    const hit = overlap(labelBox(nodes[a], points[a]), labelBox(nodes[b], points[b]));
    if (!hit) return;
    overlapPairs += 1;
    if (focusIds.has(nodes[a].id)) collided.add(nodes[a].id);
    if (focusIds.has(nodes[b].id)) collided.add(nodes[b].id);
    if (hit.x > 28 && hit.y > 16) {
      if (focusIds.has(nodes[a].id)) severe.add(nodes[a].id);
      if (focusIds.has(nodes[b].id)) severe.add(nodes[b].id);
    }
  });
  return { focusedNodes: focusIds.size, overlappingNodes: collided.size,
    severelyOverlappingNodes: severe.size, overlapPairs };
}

export function evaluateFocusedConnections(graph, positions, focusIds) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  let edges = 0;
  let sum = 0;
  let longestSameZone = 0;
  let longestCrossZone = 0;
  for (const edge of graph.edges) {
    if (!isMapConnection(edge) || (!focusIds.has(edge.source) && !focusIds.has(edge.target))) continue;
    const a = positions[edge.source];
    const b = positions[edge.target];
    if (!a || !b) continue;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    sum += distance;
    edges += 1;
    if (nodeById.get(edge.source)?.zone === nodeById.get(edge.target)?.zone) {
      longestSameZone = Math.max(longestSameZone, distance);
    } else {
      longestCrossZone = Math.max(longestCrossZone, distance);
    }
  }
  return { edges, mean: edges ? Math.round(sum / edges) : 0,
    longestSameZone: Math.round(longestSameZone), longestCrossZone: Math.round(longestCrossZone) };
}

export function classifyOutcome(before, after) {
  if (after.severeOverlaps > before.severeOverlaps || after.overlaps > before.overlaps ||
      after.meanEdge > Math.max(before.meanEdge * 1.15, before.meanEdge + 100)) return "regression";
  if (after.score < before.score - 0.1) return "improved";
  return "unchanged";
}

export function runLayoutExperiment(graph, baseline, guidance, zones, input = {}, scopeZone = "all", movementPolicy) {
  const parameters = safeParameters(input);
  const nodes = graph.nodes;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const points = nodes.map((node) => {
    const point = baseline[node.id] ?? node;
    return { x: Number(point.x), y: Number(point.y) };
  });
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error("Layout has missing or invalid node positions.");
  }
  const mobility = nodes.map((node) => {
    if (scopeZone !== "all" && node.zone !== scopeZone) return 0;
    if (!movementPolicy) return 1;
    return Math.max(0, Math.min(1, Number(movementPolicy[node.id]?.weight) || 0));
  });
  const edges = graph.edges.filter(isMapConnection).map((edge) => ({
    a: index.get(edge.source), b: index.get(edge.target), strength: Number(edge.strength) || 0.5,
  })).filter((edge) => edge.a !== undefined && edge.b !== undefined);
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const baselinePoints = nodes.map((node) => baseline[node.id] ?? node);

  for (let pass = 0; pass < parameters.iterations; pass += 1) {
    const fx = new Float64Array(nodes.length);
    const fy = new Float64Array(nodes.length);
    const cooling = 1 - pass / (parameters.iterations * 1.7);

    for (let i = 0; i < nodes.length; i += 1) {
      if (!mobility[i]) continue;
      const zone = zoneById.get(nodes[i].zone);
      const pressure = Number(guidance?.zones?.[nodes[i].zone]?.pressureScore ?? 0);
      const tether = (0.025 - parameters.zoneFreedom * 0.018) / (1 + pressure);
      fx[i] += (baselinePoints[i].x - points[i].x) * tether;
      fy[i] += (baselinePoints[i].y - points[i].y) * tether;
      const bridge = guidance?.bridgeNodes?.[nodes[i].id];
      if (!zone || !bridge?.pullZones?.length) continue;
      const targets = bridge.pullZones.map((id) => zoneById.get(id)).filter(Boolean);
      if (!targets.length) continue;
      const centerX = targets.reduce((sum, item) => sum + item.x + item.width / 2, 0) / targets.length;
      const centerY = targets.reduce((sum, item) => sum + item.y + item.height / 2, 0) / targets.length;
      const pull = parameters.connectionPull * parameters.zoneFreedom *
        Math.min(0.007, Number(bridge.pullStrength ?? 0.2) * 0.012);
      fx[i] += (centerX - points[i].x) * pull;
      fy[i] += (centerY - points[i].y) * pull;
    }

    for (const edge of edges) {
      const { a, b } = edge;
      if (!mobility[a] && !mobility[b]) continue;
      const dx = points[b].x - points[a].x;
      const dy = points[b].y - points[a].y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const preferred = nodes[a].zone === nodes[b].zone ? 280 : 650;
      const excess = Math.max(0, distance - preferred);
      const force = Math.min(18, excess * parameters.connectionPull * edge.strength * 0.012);
      if (mobility[a]) { fx[a] += dx / distance * force; fy[a] += dy / distance * force; }
      if (mobility[b]) { fx[b] -= dx / distance * force; fy[b] -= dy / distance * force; }
    }

    nearbyPairs(nodes, points, (a, b) => {
      if (!mobility[a] && !mobility[b]) return;
      const first = labelBox(nodes[a], points[a]);
      const second = labelBox(nodes[b], points[b]);
      const pad = 10 * parameters.spacing;
      const hit = overlap(
        { left: first.left - pad, right: first.right + pad, top: first.top - pad, bottom: first.bottom + pad },
        second,
      );
      if (!hit) return;
      const signX = points[a].x <= points[b].x ? -1 : 1;
      const signY = points[a].y <= points[b].y ? -1 : 1;
      const amount = Math.min(26, (Math.min(hit.x, hit.y) + 4) * 0.36 * parameters.spacing);
      const horizontal = hit.x < hit.y * 1.4;
      const dx = horizontal ? signX * amount : 0;
      const dy = horizontal ? 0 : signY * amount;
      if (mobility[a]) { fx[a] += dx; fy[a] += dy; }
      if (mobility[b]) { fx[b] -= dx; fy[b] -= dy; }
    });

    for (let i = 0; i < nodes.length; i += 1) {
      if (!mobility[i]) continue;
      points[i].x += Math.max(-32, Math.min(32, fx[i])) * cooling * mobility[i];
      points[i].y += Math.max(-32, Math.min(32, fy[i])) * cooling * mobility[i];
      const limit = movementPolicy?.[nodes[i].id]?.maxDistance;
      if (Number.isFinite(limit)) {
        const dx = points[i].x - baselinePoints[i].x;
        const dy = points[i].y - baselinePoints[i].y;
        const distance = Math.hypot(dx, dy);
        if (distance > limit) {
          points[i].x = baselinePoints[i].x + dx / distance * limit;
          points[i].y = baselinePoints[i].y + dy / distance * limit;
        }
      }
    }
  }

  const positions = Object.fromEntries(nodes.map((node, i) => [node.id, {
    x: Math.round(points[i].x), y: Math.round(points[i].y), zone: node.zone,
  }]));
  const before = evaluateLayout(graph, baseline, baseline, scopeZone);
  const after = evaluateLayout(graph, baseline, positions, scopeZone);
  return { parameters, positions, before, after, outcome: classifyOutcome(before, after) };
}

export function autoTuneLayout(graph, baseline, guidance, zones, scopeZone = "all", feedback = []) {
  const presets = [
    { spacing: 0.85, connectionPull: 0.2, zoneFreedom: 0.25 },
    { spacing: 1.15, connectionPull: 0.2, zoneFreedom: 0.45 },
    { spacing: 1.45, connectionPull: 0.3, zoneFreedom: 0.6 },
    { spacing: 1.15, connectionPull: 0.5, zoneFreedom: 0.45 },
    { spacing: 1.4, connectionPull: 0.55, zoneFreedom: 0.75 },
    { spacing: 1.65, connectionPull: 0.15, zoneFreedom: 0.8 },
  ];
  const liked = feedback.filter((item) => item.verdict === "better" && item.parameters);
  const disliked = feedback.filter((item) => item.verdict === "worse" && item.parameters);
  const key = (item) => [item.spacing, item.connectionPull, item.zoneFreedom].map((value) => Number(value).toFixed(2)).join(":");
  const options = [...liked.map((item) => item.parameters), ...presets]
    .filter((item, index, items) => items.findIndex((other) => key(other) === key(item)) === index)
    .filter((item) => !disliked.some((other) => key(other.parameters) === key(item)))
    .slice(0, 8);
  const trials = options.map((parameters) => runLayoutExperiment(graph, baseline, guidance, zones,
    { ...parameters, iterations: 36 }, scopeZone));
  if (!trials.length) throw new Error("No eligible parameter sets remain after feedback.");
  const eligible = trials.filter((trial) => trial.outcome !== "regression");
  const best = (eligible.length ? eligible : trials).sort((a, b) => a.after.score - b.after.score)[0];
  return { ...best, trials: trials.map(({ parameters, after, outcome }) => ({ parameters, after, outcome })) };
}
