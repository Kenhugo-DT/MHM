import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function verifySnapshotPair(approvedPath, publicPath) {
  const approved = fs.readFileSync(approvedPath);
  const published = fs.readFileSync(publicPath);
  if (!approved.equals(published)) {
    throw new Error(`${path.basename(approvedPath)} differs between approved and public snapshots.`);
  }
  return JSON.parse(approved.toString("utf8"));
}

export function verifyPublishedSnapshots(basePath = root) {
  const read = (name) => verifySnapshotPair(
    path.join(basePath, "brain/data/approved", name),
    path.join(basePath, "site/public/data", name),
  );
  const graph = read("graph.json");
  const layouts = read("layouts.json");
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (nodeIds.size !== graph.nodes.length) throw new Error("Graph contains duplicate node IDs.");
  for (const [name, layout] of Object.entries(layouts.layouts)) {
    const positions = layout.nodes;
    if (Object.keys(positions).length !== nodeIds.size || [...nodeIds].some((id) =>
      !Number.isFinite(positions[id]?.x) || !Number.isFinite(positions[id]?.y))) {
      throw new Error(`Layout ${name} does not match the approved graph.`);
    }
  }
  return { nodes: graph.nodes.length, edges: graph.edges.length, layouts: Object.keys(layouts.layouts).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("Verified published snapshots:", verifyPublishedSnapshots());
}
