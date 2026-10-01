import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { graphFingerprint, matchingLayouts, MODE_NODE_TYPES } from "../shared/graph-schema/graph-snapshot.mjs";
import { edgeEvidenceTier, isMapConnection } from "../shared/graph-schema/edge-evidence.mjs";
import { ORGANIZED_MAP_ZONES, organizeGraphLayout } from "../brain/scripts/organize-graph-layout.mjs";
import { curatedEraLinks, curatedEraNodes } from "../brain/scripts/curated-era-expansion.mjs";
import { curatedGenreLinks, curatedGenreNodes } from "../brain/scripts/curated-genre-bridges.mjs";
import { reviewedBridgeLinks, reviewedBridgeNodes } from "../brain/scripts/curated-reviewed-bridges.mjs";
import { genreDepthLinks, genreDepthNodes } from "../brain/scripts/curated-genre-depth.mjs";
import { earlyEraCorrections, earlyRootLinks, earlyRootNodes } from "../brain/scripts/curated-early-roots.mjs";
import { midcenturyLinks, midcenturyNodes } from "../brain/scripts/curated-midcentury.mjs";
import { thousandLinks, thousandNodes } from "../brain/scripts/curated-thousand.mjs";
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
  const moved = { ...added, nodes: added.nodes.map((node) => node.id === "a" ? { ...node, x: 999 } : node) };
  assert.equal(await matchingLayouts(moved, "artists", layouts, graph), layouts);
  assert.equal(await matchingLayouts({ ...moved, nodes: moved.nodes.filter((node) => node.id !== "a") }, "artists", layouts, graph), undefined);
  assert.equal(await matchingLayouts({ ...moved, nodes: moved.nodes.map((node) => node.id === "a" ? { ...node, zone: "jazz" } : node) }, "artists", layouts, graph), undefined);
  assert.equal(await matchingLayouts({ ...moved, nodes: moved.nodes.map((node) => node.id === "a" ? { ...node, type: "artist" } : node) }, "artists", layouts, graph), undefined);
  assert.equal(await matchingLayouts({ ...moved, edges: moved.edges.map((edge) => edge.target === "b" ? { ...edge, strength: 0.2 } : edge) }, "artists", layouts, graph), undefined);
});

test("live layout matching keeps current map positions without mutating saved layouts", async () => {
  const baseline = {
    nodes: [{ id: "a", type: "band", x: 1, y: 2, zone: "rock" }],
    edges: [],
  };
  const layouts = {
    graphFingerprints: { artists: await graphFingerprint(baseline, "artists") },
    layouts: {
      organized: { nodes: { a: { x: 1, y: 2, zone: "rock", priority: 3 } } },
      timeline: { nodes: { a: { x: 100, y: 200 } } },
    },
  };
  const live = {
    nodes: [
      { ...baseline.nodes[0], x: 50, y: 60 },
      { id: "new", type: "band", x: 80, y: 90, zone: "rock" },
    ],
    edges: [],
  };
  const matched = await matchingLayouts(live, "artists", layouts, baseline);
  assert.notEqual(matched, layouts);
  assert.deepEqual(matched.layouts.organized.nodes.a, { x: 50, y: 60, zone: "rock", priority: 3 });
  assert.deepEqual(matched.layouts.organized.nodes.new, { x: 80, y: 90, zone: "rock" });
  assert.equal(matched.layouts.timeline, layouts.layouts.timeline);
  assert.deepEqual(layouts.layouts.organized.nodes.a, { x: 1, y: 2, zone: "rock", priority: 3 });
  assert.equal(layouts.layouts.organized.nodes.new, undefined);
});

test("published layouts match the approved graph in every map mode", async () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const layouts = JSON.parse(readFileSync("brain/data/approved/layouts.json", "utf8"));
  for (const mode of Object.keys(MODE_NODE_TYPES)) {
    assert.equal(layouts.graphFingerprints[mode], await graphFingerprint(graph, mode));
  }
});

test("classical and pop expansion is sourced, connected and keeps historical order", () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const layouts = JSON.parse(readFileSync("brain/data/approved/layouts.json", "utf8"));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  assert.equal(curatedEraNodes.length, 25);
  assert.equal(curatedEraLinks.length, 39);
  const batch = JSON.parse(readFileSync("brain/data/curated-era-batch.json", "utf8"));
  assert.deepEqual(new Set(batch.nodeIds), new Set(curatedEraNodes.map((node) => node.id)));
  assert.equal(batch.expectedEdges, curatedEraLinks.length);

  for (const entry of curatedEraNodes) {
    const node = nodes.get(entry.id);
    assert.ok(node, entry.id);
    assert.equal(node.type, entry.type);
    assert.equal(node.zone, entry.zone);
    assert.equal(node.eraStart, entry.eraStart);
    assert.ok(node.sources.some((source) => source.url.startsWith("https://")));
    assert.ok(curatedEraLinks.some((edge) => edge.source === entry.id || edge.target === entry.id));
    const bounds = ORGANIZED_MAP_ZONES[entry.zone];
    assert.ok(node.x >= bounds.x - 200 && node.x <= bounds.x + bounds.width + 200);
    assert.ok(node.y >= bounds.y - 200 && node.y <= bounds.y + bounds.height + 200);
  }
  for (const entry of curatedEraLinks) {
    const edge = edges.get(entry.id);
    assert.ok(edge, entry.id);
    assert.equal(edgeEvidenceTier(edge), "source_linked");
    assert.ok(nodes.has(edge.source) && nodes.has(edge.target));
  }

  const timeline = layouts.layouts.timeline.nodes;
  assert.ok(timeline["johann-pachelbel"].x < timeline["johann-sebastian-bach"].x);
  assert.ok(timeline["johann-sebastian-bach"].x < timeline["wolfgang-amadeus-mozart"].x);
  assert.ok(timeline["wolfgang-amadeus-mozart"].x < timeline["edvard-grieg"].x);
  assert.ok(timeline["edvard-grieg"].x < timeline["the-supremes"].x);
});

test("early timeline roots are sourced, connected and precede modern clusters", () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const layouts = JSON.parse(readFileSync("brain/data/approved/layouts.json", "utf8"));
  const batch = JSON.parse(readFileSync("brain/data/early-roots-batch.json", "utf8"));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  assert.ok(graph.nodes.filter((node) => Number.isFinite(node.eraStart) && node.eraStart < 1930).length >= 86);
  assert.equal(new Set(earlyRootNodes.map((node) => node.id)).size, earlyRootNodes.length);
  assert.deepEqual(new Set(batch.nodeIds), new Set(earlyRootNodes.map((node) => node.id)));
  assert.equal(batch.expectedEdges, earlyRootLinks.length);
  for (const entry of earlyRootNodes) {
    const node = nodes.get(entry.id);
    assert.ok(node, entry.id);
    assert.equal(node.eraStart, entry.eraStart);
    assert.equal(node.zone, entry.zone);
    assert.ok(node.sources.some((source) => source.url.startsWith("https://") && !source.url.includes("wikipedia.org")));
    assert.ok(earlyRootLinks.some((edge) => edge.source === entry.id || edge.target === entry.id));
  }
  for (const entry of earlyRootLinks) {
    const edge = edges.get(entry.id);
    assert.ok(edge, entry.id);
    assert.equal(edgeEvidenceTier(edge), "source_linked");
  }
  for (const entry of earlyEraCorrections) {
    const node = nodes.get(entry.id);
    assert.equal(node?.eraStart, entry.eraStart, entry.id);
    assert.ok(node.sources.some((source) => source.url === entry.reference.url));
  }
  const timeline = layouts.layouts.timeline.nodes;
  assert.ok(timeline.spirituals.x < timeline.ragtime.x);
  assert.ok(timeline.ragtime.x < timeline["mamie-smith"].x);
  assert.ok(nodes.get("eck-robertson").eraStart < nodes.get("the-carter-family").eraStart);
  assert.ok(timeline["the-carter-family"].x < timeline["the-supremes"].x);
});

test("genre bridges are sourced, explain their relationship and reach the learning model", () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const model = JSON.parse(readFileSync("brain/data/approved/learning-model.json", "utf8"));
  const batch = JSON.parse(readFileSync("brain/data/curated-genre-batch.json", "utf8"));
  const feedback = JSON.parse(readFileSync("brain/data/approved/curator-feedback.json", "utf8"));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  assert.equal(curatedGenreNodes.length, 12);
  assert.equal(curatedGenreLinks.length, 40);
  assert.deepEqual(new Set(batch.nodeIds), new Set(curatedGenreNodes.map((node) => node.id)));
  assert.equal(batch.expectedEdges, curatedGenreLinks.length);
  for (const entry of curatedGenreNodes) {
    const node = nodes.get(entry.id);
    assert.ok(node, entry.id);
    assert.equal(node.type, entry.type);
    assert.equal(node.zone, entry.zone);
    assert.ok(node.sources.some((source) => source.url.startsWith("https://") && !source.url.includes("wikipedia.org")));
    assert.ok(model.nodes[entry.id]?.curatorFeedback, `Missing learning feedback: ${entry.id}`);
    assert.ok(feedback.nodeFeedback.some((item) => item.id === entry.id));
    assert.ok(curatedGenreLinks.some((edge) => edge.source === entry.id || edge.target === entry.id));
  }
  for (const entry of curatedGenreLinks) {
    const edge = edges.get(entry.id);
    assert.ok(edge, entry.id);
    assert.equal(edgeEvidenceTier(edge), "source_linked", entry.id);
    assert.ok(edge.context.some(Boolean));
    assert.ok(edge.sources.every((source) => source.url.startsWith("https://") && !source.url.includes("wikipedia.org")));
    assert.ok(nodes.has(edge.source) && nodes.has(edge.target));
  }
  assert.ok(model.nodes["rhythm-and-blues"].secondaryZones.includes("pop-soul-disco"));
  assert.ok(model.nodes["western-swing"].secondaryZones.includes("jazz"));
});

test("reviewed genre-depth seeds only publish independently sourced bridges", () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const batch = JSON.parse(readFileSync("brain/data/reviewed-bridge-batch.json", "utf8"));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  assert.equal(reviewedBridgeNodes.length, 17);
  assert.equal(reviewedBridgeLinks.length, 33);
  assert.deepEqual(new Set(batch.nodeIds), new Set(reviewedBridgeNodes.map((node) => node.id)));
  assert.equal(batch.expectedEdges, reviewedBridgeLinks.length);
  for (const entry of reviewedBridgeNodes) {
    const node = nodes.get(entry.id);
    assert.ok(node, entry.id);
    assert.equal(node.zone, entry.zone);
    assert.ok(node.sources.some((source) => source.url.startsWith("https://") && !source.url.includes("wikipedia.org")));
    assert.ok(reviewedBridgeLinks.some((edge) => edge.source === entry.id || edge.target === entry.id));
  }
  for (const entry of reviewedBridgeLinks) {
    const edge = edges.get(entry.id);
    assert.ok(edge, entry.id);
    assert.equal(edgeEvidenceTier(edge), "source_linked", entry.id);
    assert.ok(edge.context.some(Boolean));
    assert.ok(edge.sources.every((source) => source.url.startsWith("https://") && !source.url.includes("wikipedia.org")));
  }
});

test("reviewed genre-depth batch is sourced and matches its live sync manifest", () => {
  const batch = JSON.parse(readFileSync("brain/data/genre-depth-batch.json", "utf8"));
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  assert.equal(genreDepthNodes.length, 66);
  assert.equal(genreDepthLinks.length, 75);
  assert.deepEqual(new Set(batch.nodeIds), new Set(genreDepthNodes.map((node) => node.id)));
  assert.equal(batch.expectedEdges, genreDepthLinks.length);
  for (const node of genreDepthNodes) {
    assert.ok(nodeIds.has(node.id), node.id);
    assert.ok(batch.allowedZones.includes(node.zone), node.id);
    assert.ok(node.sources.some((source) => source.url.startsWith("https://")), node.id);
    assert.ok(genreDepthLinks.some((edge) => edge.source === node.id || edge.target === node.id), node.id);
  }
  for (const edge of genreDepthLinks) {
    assert.ok(edgeIds.has(edge.id), edge.id);
    assert.ok(nodeIds.has(edge.source) && nodeIds.has(edge.target), edge.id);
    assert.equal(edgeEvidenceTier(edge), "source_linked", edge.id);
    assert.ok(edge.context.some(Boolean), edge.id);
    assert.ok(edge.sources.every((source) => source.url.startsWith("https://") && !source.url.includes("wikipedia.org")), edge.id);
  }
});

test("midcentury expansion adds distinct, sourced 1940s-1980s nodes and relations", () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const batch = JSON.parse(readFileSync("brain/data/midcentury-batch.json", "utf8"));
  const blocked = JSON.parse(readFileSync("shared/graph-schema/blocked-entities.json", "utf8"));
  const blockedTerms = new Set(blocked.entities.flatMap((entity) => [entity.id, ...entity.labels]).map((value) => value.toLowerCase()));
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const graphEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  assert.ok(midcenturyNodes.length >= 120);
  assert.deepEqual(new Set(batch.nodeIds), new Set(midcenturyNodes.map((node) => node.id)));
  assert.equal(batch.expectedEdges, midcenturyLinks.length);
  assert.ok(midcenturyLinks.every((edge) => edge.id.startsWith(batch.edgePrefix)));
  assert.equal(new Set(midcenturyNodes.map((node) => node.id)).size, midcenturyNodes.length);
  assert.equal(new Set(midcenturyLinks.map((edge) => edge.id)).size, midcenturyLinks.length);
  for (const entry of midcenturyNodes) {
    const node = graphNodes.get(entry.id);
    assert.ok(node, entry.id);
    assert.ok(node.eraStart >= 1940 && node.eraStart < 1990, entry.id);
    assert.equal(node.zone, entry.zone);
    assert.ok(batch.allowedZones.includes(node.zone), entry.id);
    assert.ok(!blockedTerms.has(node.id.toLowerCase()) && !blockedTerms.has(node.label.toLowerCase()), entry.id);
    assert.ok(node.sources.some((source) => source.url.startsWith("https://www.loc.gov/")), entry.id);
  }
  for (const entry of midcenturyLinks) {
    const edge = graphEdges.get(entry.id);
    assert.ok(edge, entry.id);
    assert.ok(graphNodes.has(edge.source) && graphNodes.has(edge.target), entry.id);
    assert.equal(edgeEvidenceTier(edge), "source_linked", entry.id);
    assert.ok(edge.context.some(Boolean), entry.id);
  }
});

test("1000-node checkpoint adds unique, sourced recordings and group membership", () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const batch = JSON.parse(readFileSync("brain/data/thousand-batch.json", "utf8"));
  const blocked = JSON.parse(readFileSync("shared/graph-schema/blocked-entities.json", "utf8"));
  const blockedTerms = new Set(blocked.entities.flatMap((entity) => [entity.id, ...entity.labels]).map((value) => value.toLowerCase()));
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const graphEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const normalizedLabels = thousandNodes.map((node) => node.label.toLowerCase().replace(/[^a-z0-9]/g, ""));
  assert.ok(graph.nodes.length > 1000);
  assert.ok(thousandNodes.length >= 80);
  assert.deepEqual(new Set(batch.nodeIds), new Set(thousandNodes.map((node) => node.id)));
  assert.equal(batch.expectedEdges, thousandLinks.length);
  assert.equal(new Set(thousandNodes.map((node) => node.id)).size, thousandNodes.length);
  assert.equal(new Set(normalizedLabels).size, thousandNodes.length);
  assert.equal(new Set(thousandLinks.map((edge) => edge.id)).size, thousandLinks.length);
  for (const entry of thousandNodes) {
    const node = graphNodes.get(entry.id);
    assert.ok(node, entry.id);
    assert.ok(batch.allowedZones.includes(node.zone), entry.id);
    assert.ok(!blockedTerms.has(node.id.toLowerCase()) && !blockedTerms.has(node.label.toLowerCase()), entry.id);
    assert.ok(node.sources.some((source) => source.url.startsWith("https://www.loc.gov/") || source.url.startsWith("https://lcweb2.loc.gov/") || source.url.startsWith("https://rockhall.com/")), entry.id);
    assert.ok(thousandLinks.some((edge) => edge.source === entry.id || edge.target === entry.id), entry.id);
  }
  for (const entry of thousandLinks) {
    const edge = graphEdges.get(entry.id);
    assert.ok(edge, entry.id);
    assert.ok(edge.id.startsWith(batch.edgePrefix));
    assert.ok(graphNodes.has(edge.source) && graphNodes.has(edge.target), entry.id);
    assert.equal(edgeEvidenceTier(edge), "source_linked", entry.id);
    assert.ok(edge.context.some(Boolean), entry.id);
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

test("reviewed connections retain relation-specific context and non-Wikipedia sources", () => {
  const graph = JSON.parse(readFileSync("brain/data/approved/graph.json", "utf8"));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const [file, count] of [["2026-09-29-bridges.json", 12], ["2026-09-29-roots-and-branches.json", 16], ["2026-09-29-artist-links.json", 15], ["2026-09-29-instrument-links.json", 17]]) {
    const review = JSON.parse(readFileSync(`brain/data/source-reviews/${file}`, "utf8"));
    assert.equal(review.edgeIds.length, count);
    for (const id of review.edgeIds) {
      const edge = edges.get(id);
      assert.ok(edge, `Missing reviewed edge ${id}`);
      assert.equal(edgeEvidenceTier(edge), "source_linked", id);
      assert.ok(edge.context.some(Boolean), `Missing relation context for ${id}`);
      assert.ok(edge.sources.every((source) => source.url && !source.url.includes("wikipedia.org")), id);
    }
  }
});
