import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(brainRoot, "..");
const approvedGraphPath = path.join(brainRoot, "data", "approved", "graph.json");
const browserGraphPath = path.join(repoRoot, "site", "public", "data", "graph.json");
const blockedEntitiesPath = path.join(repoRoot, "shared", "graph-schema", "blocked-entities.json");

const graphPath = fs.existsSync(approvedGraphPath) ? approvedGraphPath : browserGraphPath;
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const blockedEntities = JSON.parse(fs.readFileSync(blockedEntitiesPath, "utf8"));
const blockedTerms = blockedEntities.entities.flatMap((entity) => [
  entity.id,
  ...(entity.labels ?? []),
]);

const allowedNodeTypes = new Set([
  "band",
  "guitarist",
  "artist",
  "guitar",
  "guitar_brand",
  "genre",
]);
const allowedRelationTypes = new Set([
  "member_of",
  "collaboration",
  "influenced_by",
  "associated_genre",
  "plays",
  "made_by",
  "signature_instrument",
  "related",
]);

function normalize(text) {
  return String(text).toLocaleLowerCase("en").replace(/_/g, " ").trim();
}

function hasBlockedTerm(text) {
  const normalized = normalize(text);
  return blockedTerms.some((term) => normalized.includes(normalize(term)));
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

const errors = [];
const warnings = [];
const ids = new Set();
const duplicateIds = new Set();

for (const node of graph.nodes ?? []) {
  if (!node.id) errors.push(`Node without id: ${node.label ?? "unknown"}`);
  if (ids.has(node.id)) duplicateIds.add(node.id);
  ids.add(node.id);

  if (!allowedNodeTypes.has(node.type)) {
    errors.push(`Unsupported node type "${node.type}" on ${node.id}.`);
  }
  if (hasBlockedTerm(node.id) || hasBlockedTerm(node.label)) {
    errors.push(`Blocked entity appears in graph: ${node.id} / ${node.label}.`);
  }
  if (!Array.isArray(node.sources) || node.sources.length === 0) {
    warnings.push(`Node has no sources: ${node.id}.`);
  }
}

for (const id of duplicateIds) {
  errors.push(`Duplicate node id: ${id}.`);
}

for (const edge of graph.edges ?? []) {
  if (!ids.has(edge.source)) errors.push(`Edge ${edge.id} has missing source ${edge.source}.`);
  if (!ids.has(edge.target)) errors.push(`Edge ${edge.id} has missing target ${edge.target}.`);
  if (!allowedRelationTypes.has(edge.type)) {
    errors.push(`Unsupported relation type "${edge.type}" on ${edge.id}.`);
  }
  if (hasBlockedTerm(edge.source) || hasBlockedTerm(edge.target) || hasBlockedTerm(edge.label)) {
    errors.push(`Blocked entity appears in edge: ${edge.id}.`);
  }
  if ((edge.context ?? []).some((item) => hasBlockedTerm(item))) {
    errors.push(`Blocked entity appears in edge context: ${edge.id}.`);
  }
}

const report = {
  graphPath,
  nodes: graph.nodes?.length ?? 0,
  edges: graph.edges?.length ?? 0,
  nodeTypes: countBy(graph.nodes ?? [], "type"),
  relationTypes: countBy(graph.edges ?? [], "type"),
  warnings,
  errors,
};

console.log(JSON.stringify(report, null, 2));

if (errors.length > 0) {
  process.exitCode = 1;
}
