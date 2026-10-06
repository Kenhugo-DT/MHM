import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { edgeEvidenceTier } from "../../shared/graph-schema/edge-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function documentedEraBackfill(before, after) {
  const allowed = new Set(["eraStart", "eraStartEvidence", "sources"]);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!allowed.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])) return false;
  }
  if (!Number.isInteger(after.eraStart) || after.eraStart < 1400 || after.eraStart > 2100) return false;
  const evidenceSources = after.eraStartEvidence?.sources;
  if (!Array.isArray(evidenceSources) || evidenceSources.length === 0) return false;
  const currentUrls = new Set((after.sources ?? []).map((source) => source.url));
  if (!(before.sources ?? []).every((source) => currentUrls.has(source.url))) return false;
  return evidenceSources.every((source) => source.url && currentUrls.has(source.url));
}

export function checkConnectionBatch(before, after, published, promotions, maxNew = 12, previousPromotions, allowEraBackfill = false) {
  const issues = [];
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  if (beforeNodes.size !== before.nodes.length || afterNodes.size !== after.nodes.length ||
      beforeNodes.size !== afterNodes.size) issues.push("Node count or unique identities changed.");
  for (const [id, node] of beforeNodes) {
    const next = afterNodes.get(id);
    if (JSON.stringify(next) !== JSON.stringify(node) &&
        !(allowEraBackfill && next && documentedEraBackfill(node, next))) {
      issues.push(`Existing node changed: ${id}`);
    }
  }
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  if (beforeEdges.size !== before.edges.length || afterEdges.size !== after.edges.length) {
    issues.push("Duplicate edge IDs detected.");
  }
  for (const [id, edge] of beforeEdges) {
    if (JSON.stringify(afterEdges.get(id)) !== JSON.stringify(edge)) issues.push(`Existing edge changed: ${id}`);
  }
  const additions = after.edges.filter((edge) => !beforeEdges.has(edge.id));
  if (additions.length === 0 || additions.length > maxNew) {
    issues.push(`Expected 1..${maxNew} new edges, got ${additions.length}.`);
  }
  const approvedEdgeIds = new Set((promotions.candidateRows ?? [])
    .filter((row) => row.kind === "typed_connection").map((row) => row.edgeId));
  const promotionEdges = new Map((promotions.edges ?? []).map((edge) => [edge.id, edge]));
  for (const edge of additions) {
    if (edge.type !== "member_of" || edgeEvidenceTier(edge) !== "source_linked" ||
        !approvedEdgeIds.has(edge.id) ||
        JSON.stringify(promotionEdges.get(edge.id)) !== JSON.stringify(edge) ||
        !edge.sources?.some((source) =>
          source.provider === "musicbrainz" && /^https:\/\/musicbrainz\.org\/artist\//.test(source.url))) {
      issues.push(`Unreviewed or unsupported new edge: ${edge.id}`);
    }
  }
  if (previousPromotions) {
    if (JSON.stringify(previousPromotions.nodes ?? []) !== JSON.stringify(promotions.nodes ?? [])) {
      issues.push("Promotion nodes changed.");
    }
    const oldPromotionRows = new Map((previousPromotions.candidateRows ?? [])
      .map((row) => [String(row.id), row]));
    const newPromotionRows = (promotions.candidateRows ?? [])
      .filter((row) => !oldPromotionRows.has(String(row.id)));
    for (const oldRow of previousPromotions.candidateRows ?? []) {
      const current = (promotions.candidateRows ?? []).find((row) => String(row.id) === String(oldRow.id));
      if (JSON.stringify(current) !== JSON.stringify(oldRow)) issues.push(`Promotion record changed: ${oldRow.id}`);
    }
    const oldPromotionEdges = new Map((previousPromotions.edges ?? [])
      .map((edge) => [edge.id, edge]));
    for (const [id, edge] of oldPromotionEdges) {
      const current = (promotions.edges ?? []).find((item) => item.id === id);
      if (JSON.stringify(current) !== JSON.stringify(edge)) issues.push(`Promotion edge changed: ${id}`);
    }
    const newPromotionEdges = (promotions.edges ?? [])
      .filter((edge) => !oldPromotionEdges.has(edge.id));
    const newIds = new Set(additions.map((edge) => edge.id));
    if (newPromotionRows.length !== additions.length ||
        newPromotionRows.length > maxNew ||
        newPromotionRows.some((row) => row.kind !== "typed_connection" ||
          !newIds.has(row.edgeId)) ||
        newPromotionEdges.length !== additions.length ||
        newPromotionEdges.some((edge) => !newIds.has(edge.id))) {
      issues.push("Promotion delta is not limited to the reviewed connection batch.");
    }
  }
  if (JSON.stringify(after.nodes) !== JSON.stringify(published.nodes) ||
      JSON.stringify(after.edges) !== JSON.stringify(published.edges)) {
    issues.push("Browser and approved graph differ.");
  }
  return { beforeNodes: before.nodes.length, beforeEdges: before.edges.length,
    afterNodes: after.nodes.length, afterEdges: after.edges.length,
    newEdges: additions.map((edge) => edge.id), issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baselinePath = process.argv[2];
  if (!baselinePath) throw new Error("Pass the graph snapshot taken before staging.");
  const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const previousPromotions = process.argv[3] ? readJson(path.resolve(process.argv[3])) : undefined;
  const allowEraBackfill = process.argv.includes("--allow-era-backfill");
  const result = checkConnectionBatch(
    readJson(path.resolve(baselinePath)),
    readJson(path.join(root, "brain/data/approved/graph.json")),
    readJson(path.join(root, "site/public/data/graph.json")),
    readJson(path.join(root, "brain/data/approved/promotions.json")),
    12,
    previousPromotions,
    allowEraBackfill,
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.issues.length) process.exitCode = 1;
}
