const OFFSETS = [
  [0, 0], [160, 0], [0, 160], [-160, 0], [0, -160],
  [150, 150], [-150, 150], [150, -150], [-150, -150],
  [240, 0], [0, 240], [-240, 0], [0, -240],
];

function openPoint(x, y, occupied, timeline) {
  let best;
  for (const [dx, dy] of OFFSETS) {
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

export function preserveIncrementalLayouts(layouts, previous, graph) {
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
      const placed = openPoint(origin.x, origin.y, occupied, mode === "timeline");
      point.x = placed.x;
      point.y = placed.y;
      occupied.push(point);
    }
  }
  return layouts;
}
