import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { graphFingerprint, matchingLayouts, MODE_NODE_TYPES } from "../shared/graph-schema/graph-snapshot.mjs";
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
