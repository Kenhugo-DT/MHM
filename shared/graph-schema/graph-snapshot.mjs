export const MODE_NODE_TYPES = {
  artists: ["band", "guitarist", "artist", "genre"],
  guitars: ["guitar", "guitar_brand", "genre"],
};

export async function graphFingerprint(graph, mode) {
  const types = new Set(MODE_NODE_TYPES[mode]);
  if (!types.size) throw new Error(`Unknown map mode: ${mode}`);

  const nodes = graph.nodes
    .filter((node) => types.has(node.type))
    .map((node) => [node.id, node.type, node.x, node.y, node.zone, Boolean(node.starter), node.eraStart ?? null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "en"));
  const ids = new Set(nodes.map((node) => node[0]));
  const edges = graph.edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => [edge.source, edge.target, edge.type, edge.label, edge.strength])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));

  const bytes = new TextEncoder().encode(JSON.stringify([nodes, edges]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function edgeKey(edge) {
  return JSON.stringify([edge.source, edge.target, edge.type, edge.label]);
}

function stableFraction(value) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 2 ** 32;
}

function extendTimeline(timeline, graph, baselineNodes, types) {
  if (!timeline?.guide?.markers?.length) return timeline;
  const changed = graph.nodes
    .filter((node) => types.has(node.type))
    .filter((node) => !baselineNodes.has(node.id) ||
      (node.eraStart ?? null) !== (baselineNodes.get(node.id).eraStart ?? null))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  if (!changed.length) return timeline;

  const positions = { ...timeline.nodes };
  for (const node of changed) delete positions[node.id];
  const markers = new Map(timeline.guide.markers.map((marker) => [marker.year, marker]));
  const cellSize = 112;
  const cells = new Map();
  const cellKey = (x, y) => `${x},${y}`;
  const insert = (x, y) => {
    const key = cellKey(Math.floor(x / cellSize), Math.floor(y / cellSize));
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ x, y });
  };
  for (const position of Object.values(positions)) {
    if (position.decade !== null && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      insert(position.x, position.y);
    }
  }
  const clear = (x, y) => {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if ((cells.get(cellKey(cx + dx, cy + dy)) ?? []).some((item) =>
          Math.abs(item.x - x) < cellSize && Math.abs(item.y - y) < cellSize)) return false;
      }
    }
    return true;
  };

  const undated = [];
  let maxKnownY = timeline.guide.maxY - 276;
  for (const node of changed) {
    const year = node.eraStart;
    const decade = Number.isInteger(year) ? Math.floor(year / 10) * 10 : undefined;
    const marker = markers.get(decade);
    if (!marker) {
      undated.push(node);
      continue;
    }
    const x = marker.x + Math.max(18, (year - decade) * marker.width / 10);
    const preferredY = timeline.guide.minY + 230 +
      Math.round(stableFraction(node.id) * Math.max(850, timeline.guide.maxY - timeline.guide.minY - 380));
    let y;
    for (let step = 0; step < 10000; step += 1) {
      const candidate = preferredY + (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 126;
      if (candidate < timeline.guide.minY + 230 || !clear(x, candidate)) continue;
      y = candidate;
      break;
    }
    if (y === undefined) {
      undated.push(node);
      continue;
    }
    positions[node.id] = { x, y, zone: node.zone, decade, startYear: year };
    maxKnownY = Math.max(maxKnownY, y);
    insert(x, y);
  }

  const unknown = { ...timeline.guide.unknown };
  const requiredTop = maxKnownY + 126 + 470;
  if (requiredTop > unknown.top) {
    const shift = requiredTop - unknown.top;
    for (const position of Object.values(positions)) {
      if (position.decade === null) position.y += shift;
    }
    unknown.top = requiredTop;
  }
  let slot = timeline.guide.unknown.count;
  for (const node of undated) {
    positions[node.id] = {
      x: unknown.left + (slot % unknown.columns + 0.5) * unknown.columnGap,
      y: unknown.top + Math.floor(slot / unknown.columns) * unknown.rowGap,
      zone: node.zone,
      decade: null,
    };
    slot += 1;
  }
  unknown.count = Object.values(positions).filter((position) => position.decade === null).length;
  return {
    ...timeline,
    nodes: positions,
    guide: {
      ...timeline.guide,
      maxY: Math.max(timeline.guide.maxY, maxKnownY + 276),
      unknown,
      unknownBottom: Math.max(timeline.guide.unknownBottom, unknown.top + Math.ceil((slot + 24) / unknown.columns) * unknown.rowGap + 100),
    },
  };
}

export async function matchingLayouts(graph, mode, layouts, baseline) {
  const expected = layouts?.graphFingerprints?.[mode];
  if (!expected) return undefined;
  if (!baseline) {
    return (await graphFingerprint(graph, mode)) === expected ? layouts : undefined;
  }

  const types = new Set(MODE_NODE_TYPES[mode]);
  const baselineNodes = baseline.nodes.filter((node) => types.has(node.type));
  const baselineIds = new Set(baselineNodes.map((node) => node.id));
  const baselineEdges = baseline.edges.filter(
    (edge) => baselineIds.has(edge.source) && baselineIds.has(edge.target),
  );
  if ((await graphFingerprint({ nodes: baselineNodes, edges: baselineEdges }, mode)) !== expected) {
    return undefined;
  }

  const liveNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const baselineNodeMap = new Map(baselineNodes.map((node) => [node.id, node]));
  const liveEdges = new Map(graph.edges.map((edge) => [edgeKey(edge), edge]));
  const matchingNodes = baselineNodes.map((node) => liveNodes.get(node.id));
  const matchingEdges = baselineEdges.map((edge) => liveEdges.get(edgeKey(edge)));
  if (matchingNodes.some((node) => !node) || matchingEdges.some((edge) => !edge)) {
    return undefined;
  }
  if (baselineNodes.some((node, index) => {
    const live = matchingNodes[index];
    return live.type !== node.type || live.zone !== node.zone || Boolean(live.starter) !== Boolean(node.starter);
  }) || baselineEdges.some((edge, index) => matchingEdges[index].strength !== edge.strength)) {
    return undefined;
  }

  const organized = layouts.layouts?.organized;
  if (!organized) return layouts;
  const positions = { ...organized.nodes };
  for (const node of graph.nodes) {
    if (!types.has(node.type)) continue;
    positions[node.id] = { ...positions[node.id], x: node.x, y: node.y, zone: node.zone };
  }
  return {
    ...layouts,
    layouts: {
      ...layouts.layouts,
      organized: { ...organized, nodes: positions },
      timeline: extendTimeline(layouts.layouts.timeline, graph, baselineNodeMap, types),
    },
  };
}
