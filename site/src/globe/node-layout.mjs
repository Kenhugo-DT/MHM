export function nodeOffset(index) {
  let ring = 1;
  let slot = index;
  while (slot >= ring * 8) {
    slot -= ring * 8;
    ring += 1;
  }
  const angle = -Math.PI / 2 + (slot + (ring % 2) * 0.5) * Math.PI * 2 / (ring * 8);
  const radius = 34 + (ring - 1) * 32;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
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
