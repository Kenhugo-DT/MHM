import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { evaluateNodeLegibility } from "../shared/layout-playground/experiment.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const graph = read("brain/data/approved/graph.json");
const layouts = read("brain/data/approved/layouts.json");
const batch = read("brain/data/early-era-expansion-2026-10-30.json");
const newIds = new Set(batch.nodeIds);
const nodes = graph.nodes.filter((node) => newIds.has(node.id));
const edges = graph.edges.filter((edge) => edge.id.startsWith(batch.edgePrefix));

test("early-era expansion has 120 documented musicians and sourced genre links", () => {
  const artists = nodes.filter((node) => node.type === "artist");
  assert.equal(artists.length, 120);
  assert.equal(nodes.length, 129);
  assert.equal(edges.length, batch.expectedEdges);
  for (const node of artists) {
    assert.ok(node.eraStart >= 1600 && node.eraStart <= 1950, node.id);
    assert.equal(node.eraStartEvidence.basis, "work_period_start");
    assert.ok(node.eraStartEvidence.sources.some((source) => source.provider === "wikidata"), node.id);
    assert.ok(node.sources.some((source) => source.provider === "wikipedia"), node.id);
  }
  for (const edge of edges) {
    assert.ok(edge.sources.some((source) => source.provider === "wikidata"), edge.id);
    assert.ok(edge.context.some((value) => value.includes("P136")), edge.id);
  }
});

test("large historical import leaves new labels readable on map and timeline", () => {
  for (const mode of ["organized", "timeline"]) {
    const result = evaluateNodeLegibility(graph, layouts.layouts[mode].nodes, newIds);
    assert.equal(result.overlapPairs, 0, `${mode} new-label overlap`);
  }
});
