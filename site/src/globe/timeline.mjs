export function visibleInTimeline(node, enabled, year) {
  return !enabled || (Number.isInteger(node.eraStart) && node.eraStart <= year);
}
