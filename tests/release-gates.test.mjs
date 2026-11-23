import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyPublishedSnapshots, verifySnapshotPair } from "../brain/scripts/verify-published-snapshots.mjs";
import { verifyEdgeEvidence } from "../brain/scripts/verify-edge-evidence.mjs";

const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
const manifest = JSON.parse(readFileSync("brain/data/approved/unsourced-legacy-edges.json", "utf8"));
const curatedEvidence = JSON.parse(readFileSync("brain/data/curated-legacy-edge-evidence.json", "utf8"));
const legacyPositions = JSON.parse(readFileSync("brain/data/legacy-structured-positions.json", "utf8"));

test("published graph and layouts exactly match approved snapshots", () => {
  assert.deepEqual(verifyPublishedSnapshots(), { nodes: graph.nodes.length, edges: graph.edges.length, layouts: 5 });
});

test("publishing rejects a browser copy that differs from the approved snapshot", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mhm-snapshot-"));
  try {
    const approved = path.join(directory, "approved.json");
    const published = path.join(directory, "published.json");
    writeFileSync(approved, '{"nodes":[]}');
    writeFileSync(published, '{"nodes":[{}]}');
    assert.throws(() => verifySnapshotPair(approved, published), /differs/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("only the documented legacy edges may lack relation sources", () => {
  assert.deepEqual(verifyEdgeEvidence(graph, manifest), { unsourcedLegacyEdges: 259 });
  const newEdge = { id: "new-unsourced-edge", source: "blues", target: "rock", type: "influenced_by",
    label: "influenced", sources: [] };
  assert.throws(() => verifyEdgeEvidence({ ...graph, edges: [...graph.edges, newEdge] }, manifest),
    /1 new, 0 resolved/);
  const sourced = graph.edges.map((edge) => edge.id === manifest.ids[0]
    ? { ...edge, sources: [{ url: "https://example.org/reviewed-evidence" }] } : edge);
  assert.throws(() => verifyEdgeEvidence({ ...graph, edges: sourced }, manifest),
    /0 new, 1 resolved/);
  assert.throws(() => verifyEdgeEvidence(graph, { ...manifest, ids: [...manifest.ids, manifest.ids[0]] }),
    /Invalid/);
});

test("legacy position extraction remains unchanged after moving it to JSON", () => {
  assert.equal(Object.keys(legacyPositions).length, 94);
  assert.equal(createHash("sha256").update(JSON.stringify(legacyPositions)).digest("hex"),
    "003076c2ca46d9e54ec05048aba4793093af013c3d60974a2b45813be8a19902");
});

test("reviewed legacy sources and explanations reach the graph", () => {
  for (const entry of curatedEvidence.entries) {
    const edge = graph.edges.find((item) => item.id === entry.id);
    assert.ok(edge, entry.id);
    assert.ok(edge.context.includes(entry.note), entry.id);
    assert.deepEqual(edge.sources, entry.sources, entry.id);
    assert.ok(!manifest.ids.includes(entry.id), entry.id);
  }
});
