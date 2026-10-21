import { isMapConnection } from "../graph-schema/edge-evidence.mjs";

export function validateLayoutConstraints(document, graph) {
  if (document?.version !== 1 || !Array.isArray(document.constraints)) {
    throw new Error("Unsupported layout constraints format.");
  }
  const nodes = new Set(graph.nodes.map((node) => node.id));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const ids = new Set();
  const constraints = [];
  for (const item of document.constraints) {
    if (!item?.id || ids.has(item.id) || !nodes.has(item.source) || !nodes.has(item.target) ||
        item.source === item.target || !["near", "apart"].includes(item.kind) ||
        typeof item.reason !== "string" || item.reason.trim().length < 20) {
      throw new Error(`Invalid layout constraint: ${item?.id ?? "unknown"}.`);
    }
    ids.add(item.id);
    if (item.kind === "near") {
      const edge = edges.get(item.evidenceEdgeId);
      if (!Number.isFinite(item.maxDistance) || item.maxDistance < 180 || item.maxDistance > 1800 ||
          !edge || !isMapConnection(edge) ||
          !edge.sources?.some((source) => String(source.url ?? "").trim()) ||
          ![edge.source, edge.target].includes(item.source) ||
          ![edge.source, edge.target].includes(item.target)) {
        throw new Error(`Near constraint requires a matching sourced connection: ${item.id}.`);
      }
    } else if (item.displayOnly !== true || !Number.isFinite(item.minDistance) ||
        item.minDistance < 120 || item.minDistance > 500 || item.evidenceEdgeId) {
      throw new Error(`Apart constraint must be a bounded display-only rule: ${item.id}.`);
    }
    constraints.push(item);
  }
  const pairs = new Map();
  for (const item of constraints) {
    const pair = [item.source, item.target].sort().join("|");
    const entry = pairs.get(pair) ?? {};
    if (entry[item.kind]) throw new Error(`Duplicate ${item.kind} constraint for ${pair}.`);
    entry[item.kind] = item;
    pairs.set(pair, entry);
    if (entry.near && entry.apart && entry.apart.minDistance >= entry.near.maxDistance) {
      throw new Error(`Conflicting layout constraints for ${pair}.`);
    }
  }
  return constraints;
}

export function evaluateLayoutConstraints(positions, constraints) {
  const details = constraints.map((item) => {
    const source = positions[item.source];
    const target = positions[item.target];
    if (!source || !target) throw new Error(`Missing constrained node: ${item.id}.`);
    const distance = Math.round(Math.hypot(source.x - target.x, source.y - target.y));
    const excess = item.kind === "near" ? Math.max(0, distance - item.maxDistance)
      : Math.max(0, item.minDistance - distance);
    return { id: item.id, kind: item.kind, distance, excess };
  });
  return { count: details.length, violations: details.filter((item) => item.excess > 0).length,
    totalExcess: details.reduce((sum, item) => sum + item.excess, 0), details };
}

export function deriveGrowthConstraints(graph, freshIds) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const candidates = graph.edges.filter((edge) =>
    edge.id && ["member_of", "collaboration"].includes(edge.type) && isMapConnection(edge) &&
    (freshIds.has(edge.source) || freshIds.has(edge.target)) &&
    edge.sources?.some((source) => String(source.url ?? "").trim()) &&
    nodes.has(edge.source) && nodes.has(edge.target));
  candidates.sort((a, b) => (Number(b.strength) || 0) - (Number(a.strength) || 0) ||
    String(a.id).localeCompare(String(b.id)));
  const used = new Map();
  const seenPairs = new Set();
  return candidates.flatMap((edge) => {
    const pair = [edge.source, edge.target].sort().join("|");
    if (seenPairs.has(pair)) return [];
    const fresh = [edge.source, edge.target].filter((id) => freshIds.has(id));
    if (fresh.some((id) => (used.get(id) ?? 0) >= 2)) return [];
    seenPairs.add(pair);
    for (const id of fresh) used.set(id, (used.get(id) ?? 0) + 1);
    return [{ id: `growth-${edge.id}`, kind: "near", source: edge.source, target: edge.target,
      maxDistance: nodes.get(edge.source).zone === nodes.get(edge.target).zone ? 700 : 1200,
      evidenceEdgeId: edge.id,
      reason: `Sourced ${edge.type} connection involving a newly approved node.` }];
  });
}
