import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const paths = ["brain/data/approved/graph.json", "site/public/data/graph.json"]
  .map((name) => path.join(root, name));
const batch = JSON.parse(fs.readFileSync(path.join(root, "brain/data/early-era-expansion-2026-10-30.json"), "utf8"));
const graph = JSON.parse(fs.readFileSync(paths[0], "utf8"));
const focusIds = new Set(batch.nodeIds);
const occupied = graph.nodes.filter((node) => !focusIds.has(node.id));
const fresh = graph.nodes.filter((node) => focusIds.has(node.id));
if (fresh.length !== batch.nodeIds.length) throw new Error("Expansion batch and graph differ.");

function bounds(node, x, y) {
  const width = Math.min(540, Math.max(120, 32 + node.label.length * 16));
  return { left: x - width / 2 - 10, right: x + width / 2 + 10,
    top: y - 28, bottom: y + 80 };
}

function vacant(node, x, y) {
  const box = bounds(node, x, y);
  return occupied.every((other) => {
    const existing = bounds(other, other.x, other.y);
    return box.right <= existing.left || box.left >= existing.right ||
      box.bottom <= existing.top || box.top >= existing.bottom;
  });
}

function place(node, desiredX, desiredY) {
  for (let radius = 0; radius <= 20; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = desiredX + dx * 75;
        const y = desiredY + dy * 120;
        if (!vacant(node, x, y)) continue;
        node.x = x;
        node.y = y;
        occupied.push(node);
        return;
      }
    }
  }
  throw new Error(`Could not place ${node.id} without label overlap.`);
}

const genres = fresh.filter((node) => node.type === "genre");
const artists = fresh.filter((node) => node.type !== "genre")
  .sort((a, b) => a.eraStart - b.eraStart || a.label.localeCompare(b.label));
genres.forEach((node, index) => {
  if (node.zone === "classical-history") {
    place(node, -6150 + index * 340, -3900);
  } else {
    place(node, -2050 + index * 340, 3600);
  }
});
const zoneCounts = new Map();
for (const node of artists) {
  const index = zoneCounts.get(node.zone) ?? 0;
  zoneCounts.set(node.zone, index + 1);
  if (node.zone === "classical-history") {
    place(node, -6200 + Math.floor(index / 12) * 340, -3550 + (index % 12) * 135);
  } else if (node.zone === "jazz") {
    place(node, -2250 + index * 300, -2050);
  } else {
    place(node, -2200 + (index % 5) * 330, 3850 + Math.floor(index / 5) * 150);
  }
}

for (const filePath of paths) fs.writeFileSync(filePath, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Placed ${fresh.length} new nodes without overlap with any existing graph label.`);
