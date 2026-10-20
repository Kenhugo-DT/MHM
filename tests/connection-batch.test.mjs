import assert from "node:assert/strict";
import test from "node:test";
import { checkConnectionBatch } from "../brain/scripts/check-connection-batch.mjs";

const nodes = [
  { id: "person", label: "Person", type: "artist", x: 0, y: 0, zone: "rock-circuit" },
  { id: "band", label: "Band", type: "band", x: 100, y: 0, zone: "rock-circuit" },
];
const edge = { id: "mb-member-person-band", source: "person", target: "band",
  type: "member_of", label: "Member of", sources: [{
    provider: "musicbrainz", url: "https://musicbrainz.org/artist/example/relationships",
  }] };
const before = { nodes, edges: [] };
const after = { nodes, edges: [edge] };
const promotions = { candidateRows: [{ kind: "typed_connection", edgeId: edge.id }], edges: [edge] };
const previousPromotions = { candidateRows: [], nodes: [], edges: [] };

test("connection batch gate accepts only the documented reviewed addition", () => {
  assert.deepEqual(checkConnectionBatch(before, after, after, promotions).issues, []);
  assert.deepEqual(checkConnectionBatch(before, after, after, promotions, 12, previousPromotions).issues, []);
  assert.deepEqual(checkConnectionBatch(before, after, after, promotions).newEdges, [edge.id]);
});

test("connection batch gate rejects changed nodes and weak additions", () => {
  assert.ok(checkConnectionBatch(before, {
    nodes: [{ ...nodes[0], x: 50 }, nodes[1]], edges: [edge],
  }, after, promotions).issues.some((issue) => issue.includes("Existing node changed")));
  assert.ok(checkConnectionBatch(before, {
    nodes, edges: [{ ...edge, label: "Wikipedia link signal" }],
  }, after, promotions).issues.some((issue) => issue.includes("unsupported new edge")));
  assert.ok(checkConnectionBatch(before, after, after, { candidateRows: [], edges: [] }).issues
    .some((issue) => issue.includes("Unreviewed")));
  assert.ok(checkConnectionBatch(before, before, before, promotions).issues
    .some((issue) => issue.includes("Expected 1..")));
  assert.ok(checkConnectionBatch(before, after, after, {
    ...promotions, candidateRows: [{ kind: "generic", edgeId: edge.id }],
  }, 12, previousPromotions).issues.some((issue) => issue.includes("Promotion delta")));
});

test("publish gate permits only sourced era backfill alongside the reviewed edges", () => {
  const source = { provider: "musicbrainz", url: "https://musicbrainz.org/artist/example" };
  const published = { nodes: [{ ...nodes[0], eraStart: 1970,
    eraStartEvidence: { basis: "first_release", sources: [source] }, sources: [source] }, nodes[1]],
  edges: [edge] };
  assert.deepEqual(checkConnectionBatch(before, published, published, promotions,
    12, previousPromotions, true).issues, []);
  assert.ok(checkConnectionBatch(before, { ...published,
    nodes: [{ ...published.nodes[0], x: 50 }, nodes[1]] }, published, promotions,
  12, previousPromotions, true).issues.some((issue) => issue.includes("Existing node changed")));
  assert.ok(checkConnectionBatch(before, { ...published,
    nodes: [{ ...published.nodes[0], eraStartEvidence: { sources: [] } }, nodes[1]] },
  published, promotions, 12, previousPromotions, true).issues
    .some((issue) => issue.includes("Existing node changed")));
});

test("connection batch gate accepts only a reviewed MusicBrainz band discovery", () => {
  const mbid = "f4a31f0a-51dd-4fa7-986d-3095c40c5ed9";
  const band = { id: `mb-band-${mbid}`, label: "Evanescence", type: "band", zone: "rock-circuit",
    sources: [{ provider: "musicbrainz", url: `https://musicbrainz.org/artist/${mbid}` }] };
  const person = nodes[0];
  const membership = { ...edge, id: "new-member", target: band.id };
  const beforeGraph = { nodes: [person], edges: [] };
  const afterGraph = { nodes: [person, { ...band, x: 20, y: 30, curatorTags: [] }], edges: [membership] };
  const current = { nodes: [{ ...band, x: 0, y: 0, layoutHints: { nearNode: person.id } }],
    edges: [membership], candidateRows: [{ id: "review-1", kind: "typed_connection", edgeId: membership.id }] };
  assert.deepEqual(checkConnectionBatch(beforeGraph, afterGraph, afterGraph, current,
    12, previousPromotions).issues, []);
  assert.ok(checkConnectionBatch(beforeGraph, { ...afterGraph, nodes: [person, { ...band, label: "Wrong" }] },
    afterGraph, current, 12, previousPromotions).issues.some((issue) => issue.includes("unsupported new node")));
  assert.ok(checkConnectionBatch(beforeGraph, afterGraph, afterGraph,
    { ...current, nodes: [] }, 12, previousPromotions).issues.some((issue) => issue.includes("unsupported new node")));
});
