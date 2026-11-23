import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { edgeEvidenceTier, isMapConnection } from "../../shared/graph-schema/edge-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function verifyEdgeEvidence(graph, manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.ids) ||
      new Set(manifest.ids).size !== manifest.ids.length ||
      manifest.ids.some((id) => typeof id !== "string" || !id.startsWith("legacy-"))) {
    throw new Error("Invalid unsourced legacy edge manifest.");
  }
  const allowed = new Set(manifest.ids);
  const unsourced = graph.edges.filter((edge) => isMapConnection(edge) &&
    edgeEvidenceTier(edge) === "curated_unsourced");
  const actual = new Set(unsourced.map((edge) => edge.id));
  const newIds = unsourced.filter((edge) => !allowed.has(edge.id)).map((edge) => edge.id);
  const resolvedIds = manifest.ids.filter((id) => !actual.has(id));
  if (newIds.length || resolvedIds.length) {
    throw new Error(`Unsourced edge manifest differs: ${newIds.length} new, ${resolvedIds.length} resolved. ` +
      `New: ${newIds.slice(0, 8).join(", ") || "none"}; resolved: ${resolvedIds.slice(0, 8).join(", ") || "none"}.`);
  }
  return { unsourcedLegacyEdges: unsourced.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const graph = JSON.parse(fs.readFileSync(path.join(root, "brain/data/approved/graph.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, "brain/data/approved/unsourced-legacy-edges.json"), "utf8"));
  console.log("Verified edge evidence baseline:", verifyEdgeEvidence(graph, manifest));
}
