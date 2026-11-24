const MODES = ["organized", "genre", "chaos", "timeline"];
const RADII = [96, 144, 192, 256, 320, 400, 480, 576, 672, 768,
  864, 960, 1088, 1216, 1408, 1600, 1800];
const DIRECTIONS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
  [1, -2], [2, -1], [2, 1], [1, 2],
  [-1, 2], [-2, 1], [-2, -1], [-1, -2],
];

function bounds(node, point) {
  const width = Math.min(540, Math.max(120, 32 + String(node.label).length * 16));
  return { left: point.x - width / 2, right: point.x + width / 2,
    top: point.y - 18, bottom: point.y + 70 };
}

function collisionCost(node, point, graphNodes, positions) {
  const box = bounds(node, point);
  let count = 0;
  let severe = 0;
  for (const other of graphNodes) {
    if (other.id === node.id || !positions[other.id]) continue;
    const otherBox = bounds(other, positions[other.id]);
    const dx = Math.min(box.right, otherBox.right) - Math.max(box.left, otherBox.left);
    const dy = Math.min(box.bottom, otherBox.bottom) - Math.max(box.top, otherBox.top);
    if (dx <= 0 || dy <= 0) continue;
    count += 1;
    if (dx > 28 && dy > 16) severe += 1;
  }
  return { count, severe };
}

export function polishFreshLabels(layouts, previousLayouts, graph, repolishIds = new Set()) {
  const report = {};
  for (const mode of MODES) {
    const positions = layouts[mode]?.nodes;
    const previous = previousLayouts?.layouts?.[mode]?.nodes;
    if (!positions || !previous) continue;
    const fresh = graph.nodes.filter((node) => positions[node.id] &&
      (!previous[node.id] || repolishIds.has(node.id)));
    let moved = 0;
    let remaining = 0;
    let maxShift = 0;
    for (const node of fresh) {
      const original = positions[node.id];
      const genreEdge = graph.edges?.find((edge) => edge.source === node.id &&
        edge.type === "associated_genre" && positions[edge.target]);
      const anchor = genreEdge && mode !== "chaos" ? positions[genreEdge.target] : undefined;
      const before = collisionCost(node, original, graph.nodes, positions);
      const outsideUnknown = mode === "timeline" && original.decade === null &&
        original.y < (layouts.timeline.guide?.unknown?.top ?? Number.NEGATIVE_INFINITY);
      if (!before.count && !outsideUnknown) continue;
      let choice = original;
      const scoreFor = (point) => {
        if (mode === "timeline" && original.decade === null &&
            point.y < (layouts.timeline.guide?.unknown?.top ?? Number.NEGATIVE_INFINITY)) {
          return Number.POSITIVE_INFINITY;
        }
        const hit = collisionCost(node, point, graph.nodes, positions);
        const shift = Math.hypot(point.x - original.x, point.y - original.y);
        if (shift > 1800) return Number.POSITIVE_INFINITY;
        const anchorDistance = anchor ? Math.hypot(point.x - anchor.x, point.y - anchor.y) : 0;
        return hit.count * 100_000 + hit.severe * 50_000 + shift * 0.4 + anchorDistance * 0.6;
      };
      let best = scoreFor(original);
      const directions = mode === "timeline" ? [[0, -1], [0, 1]] : DIRECTIONS;
      for (const origin of [original, anchor].filter(Boolean)) {
        for (const radius of [0, ...RADII]) {
          for (const [vx, vy] of directions) {
            const length = Math.hypot(vx, vy);
            const point = { x: Math.round(origin.x + radius * vx / length),
              y: Math.round(origin.y + radius * vy / length) };
            const score = scoreFor(point);
            if (score < best) {
              best = score;
              choice = point;
            }
          }
        }
      }
      if (choice !== original) {
        positions[node.id] = { ...original, x: choice.x, y: choice.y };
        moved += 1;
        maxShift = Math.max(maxShift, Math.round(Math.hypot(choice.x - original.x, choice.y - original.y)));
      }
      if (collisionCost(node, positions[node.id], graph.nodes, positions).count) remaining += 1;
    }
    report[mode] = { fresh: fresh.length, moved, remaining, maxShift };
  }
  return report;
}
