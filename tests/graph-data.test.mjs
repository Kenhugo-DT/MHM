import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { graphFingerprint, matchingLayouts, MODE_NODE_TYPES } from "../shared/graph-schema/graph-snapshot.mjs";
import { edgeEvidenceTier, isMapConnection } from "../shared/graph-schema/edge-evidence.mjs";
import { organizeGraphLayout } from "../brain/scripts/organize-graph-layout.mjs";
import { loadAllRows } from "../site/src/data/load-all-rows.mjs";

test("pagination returns every row beyond the old 800-node cap", async () => {
  const source = Array.from({ length: 1105 }, (_, index) => ({
    id: String(index).padStart(5, "0"),
  }));
  let calls = 0;
  const rows = await loadAllRows(async (afterId, pageSize) => {
    calls += 1;
    const start = afterId ? source.findIndex((row) => row.id === afterId) + 1 : 0;
    return source.slice(start, start + pageSize);
  });

  assert.deepEqual(rows, source);
  assert.equal(calls, 3);
});

test("pagination rejects a page that repeats the cursor", async () => {
  await assert.rejects(
    loadAllRows(async () => [{ id: "a" }, { id: "b" }], 2),
    /did not advance/,
  );
});

test("pagination completes when the last page is exactly full", async () => {
  const source = Array.from({ length: 1000 }, (_, index) => ({ id: String(index).padStart(5, "0") }));
  let calls = 0;
  const rows = await loadAllRows(async (afterId, pageSize) => {
    calls += 1;
    const start = afterId ? source.findIndex((row) => row.id === afterId) + 1 : 0;
    return source.slice(start, start + pageSize);
  });
  assert.equal(rows.length, 1000);
  assert.equal(calls, 3);
});

test("graph fingerprint ignores ordering but detects changed positions and connections", async () => {
  const graph = {
    nodes: [
      { id: "a", type: "band", x: 1, y: 2, zone: "rock", starter: true },
      { id: "b", type: "genre", x: 3, y: 4, zone: "rock" },
      { id: "guitar", type: "guitar", x: 5, y: 6, zone: "guitars" },
    ],
    edges: [
      { source: "a", target: "b", type: "associated_genre", label: "Genre", strength: 0.8 },
      { source: "a", target: "guitar", type: "plays", label: "Plays", strength: 0.9 },
    ],
  };
  const original = await graphFingerprint(graph, "artists");
  assert.equal(
    await graphFingerprint({ nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() }, "artists"),
    original,
  );
  assert.equal(
    await graphFingerprint({ ...graph, nodes: graph.nodes.map((node) => node.id === "guitar" ? { ...node, x: 999 } : node) }, "artists"),
    original,
  );
  assert.notEqual(
    await graphFingerprint({ ...graph, nodes: graph.nodes.map((node) => node.id === "a" ? { ...node, x: 999 } : node) }, "artists"),
    original,
  );
  assert.notEqual(await graphFingerprint({ ...graph, edges: [] }, "artists"), original);
  const layouts = { graphFingerprints: { artists: original } };
  assert.equal(await matchingLayouts(graph, "artists", layouts), layouts);
  assert.equal(await matchingLayouts({ ...graph, edges: [] }, "artists", layouts), undefined);
  const added = {
    nodes: [...graph.nodes, { id: "new", type: "band", x: 7, y: 8, zone: "rock" }],
    edges: [...graph.edges, { source: "a", target: "new", type: "related", label: "New", strength: 0.6 }],
  };
  assert.equal(await matchingLayouts(added, "artists", layouts, graph), layouts);
  assert.equal(await matchingLayouts({ ...added, edges: added.edges.slice(1) }, "artists", layouts, graph), undefined);
  assert.equal(
    await matchingLayouts({ ...added, nodes: added.nodes.map((node) => node.id === "a" ? { ...node, x: 999 } : node) }, "artists", layouts, graph),
    undefined,
  );
});

test("published layouts match the approved graph in every map mode", async () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const layouts = JSON.parse(readFileSync("brain/data/approved/layouts.json", "utf8"));
  for (const mode of Object.keys(MODE_NODE_TYPES)) {
    assert.equal(layouts.graphFingerprints[mode], await graphFingerprint(graph, mode));
  }
});

test("Wikipedia link and category signals stay research leads even with source URLs", () => {
  for (const signal of ["link", "category"]) {
    const edge = {
      label: `Wikipedia ${signal} signal`,
      context: [`Wikipedia ${signal}: Example`],
      sources: [{ url: "https://en.wikipedia.org/wiki/Example" }],
    };
    assert.equal(edgeEvidenceTier(edge), "research_lead");
    assert.equal(isMapConnection(edge), false);
  }
  assert.equal(edgeEvidenceTier({ label: "member", sources: [] }), "curated_unsourced");
  assert.equal(edgeEvidenceTier({ label: "member", sources: [{ url: "https://example.org/history" }] }), "source_linked");
  assert.equal(isMapConnection({ label: "member", sources: [] }), true);
});

test("research leads cannot pull nodes into another layout zone", () => {
  const nodes = [
    { id: "punk-band", label: "Punk Band", type: "band", zone: "punk-alt", x: 0, y: 0 },
    { id: "jazz", label: "Jazz", type: "genre", zone: "jazz", x: 0, y: 0 },
  ];
  const lead = {
    source: "punk-band", target: "jazz", type: "associated_genre",
    label: "Wikipedia link signal", context: ["Wikipedia link: Jazz"], sources: [],
  };
  const alone = organizeGraphLayout(structuredClone(nodes), []);
  const withLead = organizeGraphLayout(structuredClone(nodes), [lead]);
  assert.deepEqual(withLead, alone);
});

test("reviewed bridges retain relation-specific context and non-Wikipedia sources", () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const review = JSON.parse(readFileSync("brain/data/source-reviews/2026-09-29-bridges.json", "utf8"));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  assert.equal(review.edgeIds.length, 12);
  for (const id of review.edgeIds) {
    const edge = edges.get(id);
    assert.ok(edge, `Missing reviewed edge ${id}`);
    assert.equal(edgeEvidenceTier(edge), "source_linked", id);
    assert.ok(edge.context.some(Boolean), `Missing relation context for ${id}`);
    assert.ok(edge.sources.every((source) => source.url && !source.url.includes("wikipedia.org")), id);
  }
});
