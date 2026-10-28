export function nodeOffset(index) {
  if (index === 0) return { x: 0, y: 0 };
  const ring = Math.floor((index - 1) / 7);
  const slot = (index - 1) % 7;
  const angle = -Math.PI / 2 + (slot + (ring % 2) * 0.5) * Math.PI * 2 / 7;
  const radius = Math.min(38, 26 + ring * 6);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export const PLACE_PAGE_SIZE = 8;

export function visiblePlaceIndices(count, page = 0, showAll = false, pinFirst = false) {
  if (showAll || count <= PLACE_PAGE_SIZE) return Array.from({ length: count }, (_, index) => index);
  const pageSize = PLACE_PAGE_SIZE - Number(pinFirst);
  const start = Number(pinFirst) + page * pageSize;
  const pageIndices = Array.from({ length: Math.min(pageSize, count - start) }, (_, index) => start + index);
  return pinFirst ? [0, ...pageIndices] : pageIndices;
}

export function connectionPath(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  const bend = {
    x: a.x + Math.sign(dx) * diagonal,
    y: a.y + Math.sign(dy) * diagonal,
  };
  const round = (value) => Math.round(value * 10) / 10;
  return `M ${round(a.x)} ${round(a.y)} L ${round(bend.x)} ${round(bend.y)} L ${round(b.x)} ${round(b.y)}`;
}
