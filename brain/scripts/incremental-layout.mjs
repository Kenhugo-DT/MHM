import { ORGANIZED_MAP_ZONES } from "./organize-graph-layout.mjs";

const OFFSETS = [
  [0, 0], [160, 0], [0, 160], [-160, 0], [0, -160],
  [150, 150], [-150, 150], [150, -150], [-150, -150],
  [240, 0], [0, 240], [-240, 0], [0, -240],
];

function labelWidth(label) {
  return Math.min(540, Math.max(120, 32 + String(label ?? "").length * 16));
}

function openPoint(x, y, occupied, timeline, label, zone) {
  if (!timeline) {
    const offsets = [];
    for (let row = -16; row <= 16; row += 1) {
      for (let column = -16; column <= 16; column += 1) {
        offsets.push([column * 160, row * 110]);
      }
    }
    offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    const width = labelWidth(label);
    let best;
    for (const [dx, dy] of offsets) {
      if (Math.hypot(dx, dy) > 1800) continue;
      const candidate = { x: x + dx, y: y + dy };
      if (zone && (candidate.x < zone.x - 400 || candidate.x > zone.x + zone.width + 400 ||
          candidate.y < zone.y - 400 || candidate.y > zone.y + zone.height + 400)) continue;
      let collisions = 0;
      for (const point of occupied) {
        if (Math.abs(point.y - candidate.y) >= 88 ||
            Math.abs(point.x - candidate.x) >= (width + labelWidth(point.label)) / 2) continue;
        collisions += 1;
      }
      if (!collisions) return candidate;
      const score = collisions * 2000 + Math.hypot(dx, dy);
      if (!best || score < best.score) best = { ...candidate, score };
    }
    return { x: best.x, y: best.y };
  }
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
      occupied.push({ ...point, label: node.label });
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
      const placed = openPoint(origin.x, origin.y, occupied, mode === "timeline", node?.label,
        mode === "organized" ? ORGANIZED_MAP_ZONES[node?.zone] : undefined);
      point.x = placed.x;
      point.y = placed.y;
      occupied.push({ ...point, label: node?.label });
    }
  }
  return layouts;
}
