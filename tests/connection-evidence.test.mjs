import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMBER_OF_BAND_TYPE_ID,
  artistIndex,
  isolatedArtistSeeds,
  membershipProposals,
  musicBrainzArtistId,
} from "../brain/scripts/connection-evidence.mjs";
import {
  connectionCandidate,
  hasMusicBrainzMembership,
  stageConnectionRows,
} from "../brain/scripts/connection-review.mjs";

const personId = "b5f0d80b-d773-44dc-b136-36163e526589";
const bandId = "28503ab7-8bf2-4666-a7bd-2644bfc7cb1d";
const person = {
  id: "mike-portnoy", label: "Mike Portnoy", type: "artist", starter: false,
  sources: [{ url: `https://musicbrainz.org/artist/${personId}` }],
};
const band = {
  id: "dream-theater", label: "Dream Theater", type: "band", starter: false,
  sources: [{ url: `https://musicbrainz.org/artist/${bandId}` }],
};

test("connection scout selects isolated nodes with unambiguous MusicBrainz identities", () => {
  const graph = { nodes: [person, band], edges: [
    { source: person.id, target: band.id, label: "Wikipedia link signal", context: [] },
  ] };
  assert.equal(musicBrainzArtistId(person), personId);
  assert.deepEqual(isolatedArtistSeeds(graph, [person.id]).map((node) => node.id), [person.id]);
  assert.equal(artistIndex(graph).get(bandId), band);
  assert.throws(() => isolatedArtistSeeds(graph, ["missing"]), /No isolated MusicBrainz artist node/);
});

test("only typed band membership becomes a sourced review proposal", () => {
  const graph = { nodes: [person, band], edges: [] };
  const artist = {
    id: personId,
    type: "Person",
    relations: [
      { "type-id": MEMBER_OF_BAND_TYPE_ID, artist: { id: bandId, type: "Group" }, begin: "1985", end: "2010-09-08" },
      { "type-id": MEMBER_OF_BAND_TYPE_ID, artist: { id: bandId, type: "Group" }, begin: "2023", end: null },
      { "type-id": "collaboration", artist: { id: bandId, type: "Group" } },
    ],
  };
  const proposals = membershipProposals(person, artist, artistIndex(graph), graph);
  assert.equal(proposals.length, 1);
  assert.deepEqual([proposals[0].source, proposals[0].target, proposals[0].type, proposals[0].status],
    [person.id, band.id, "member_of", "review"]);
  assert.equal(proposals[0].evidence.periods.length, 2);
  assert.ok(proposals[0].sources[0].url.includes(personId));
  assert.deepEqual(membershipProposals(person, { ...artist, type: "Group" }, artistIndex(graph), graph), []);
  assert.deepEqual(membershipProposals(person, artist, artistIndex({
    nodes: [...graph.nodes, { ...band, id: "duplicate-band" }], edges: [],
  }), graph), []);
  assert.deepEqual(membershipProposals(person, artist, artistIndex({
    ...graph, edges: [{ source: person.id, target: band.id, type: "member_of", label: "Member of" }],
  }), { ...graph, edges: [{ source: person.id, target: band.id, type: "member_of", label: "Member of" }] }), []);
});

test("only approved, identity-matched memberships can be staged", () => {
  const graph = { nodes: [person, band], edges: [] };
  const artist = { id: personId, type: "Person", relations: [
    { "type-id": MEMBER_OF_BAND_TYPE_ID, artist: { id: bandId, type: "Group" }, begin: "1985", end: null },
  ] };
  const proposal = membershipProposals(person, artist, artistIndex(graph), graph)[0];
  const rows = [
    { id: "review", status: "review", payload: { kind: "typed_connection", connection: proposal } },
    { id: "generic", status: "approved", payload: { kind: "wikipedia_link", connection: proposal } },
    { id: "approved", status: "approved", payload: { kind: "typed_connection", connection: proposal } },
  ];
  const staged = stageConnectionRows(rows, graph, { edges: [], candidateRows: [] });
  assert.equal(staged.edges.length, 1);
  assert.deepEqual(staged.candidateRows.map((row) => row.id), ["approved"]);
  assert.deepEqual(staged.edges[0].sources.map((source) => source.provider), ["musicbrainz"]);
  assert.match(staged.edges[0].context[1], /1985 to present/);
  assert.equal(hasMusicBrainzMembership(artist, personId, bandId), true);
  assert.equal(hasMusicBrainzMembership(artist, personId, bandId,
    [{ begin: "1985", end: null }]), true);
  assert.equal(hasMusicBrainzMembership(artist, personId, bandId,
    [{ begin: "1986", end: null }]), false);
  assert.equal(hasMusicBrainzMembership({ ...artist, type: "Group" }, personId, bandId), false);
  assert.deepEqual(stageConnectionRows(rows, graph, {
    edges: staged.edges, candidateRows: staged.candidateRows,
  }).edges, []);
  assert.throws(() => stageConnectionRows(rows, {
    ...graph, edges: [{ ...staged.edges[0], sources: [] }],
  }, { edges: [], candidateRows: [] }), /manual evidence review/);
  assert.throws(() => stageConnectionRows(rows, graph, { edges: [], candidateRows: [] }, 0), /limit/);
});

test("membership gate rejects wrong types, identities and unsupported evidence", () => {
  const graph = { nodes: [person, band], edges: [] };
  const artist = { id: personId, type: "Person", relations: [
    { "type-id": MEMBER_OF_BAND_TYPE_ID, artist: { id: bandId, type: "Group" }, begin: "1985", end: null },
  ] };
  const proposal = membershipProposals(person, artist, artistIndex(graph), graph)[0];
  assert.throws(() => connectionCandidate({ ...proposal, target: person.id }, graph), /Invalid member nodes/);
  assert.throws(() => connectionCandidate({ ...proposal, evidence: {
    ...proposal.evidence, artistIds: [bandId, personId],
  } }, graph), /identity/);
  assert.throws(() => connectionCandidate({ ...proposal, evidence: {
    ...proposal.evidence, relationTypeId: "unrelated",
  } }, graph), /identity/);
  assert.throws(() => connectionCandidate({ ...proposal, sources: [{
    provider: "wikipedia", url: "https://en.wikipedia.org/wiki/Mike_Portnoy",
  }] }, graph), /relation-specific/);
  assert.throws(() => connectionCandidate({ ...proposal, evidence: {
    ...proposal.evidence, periods: [{ begin: "unknown", end: null }],
  } }, graph), /dates/);
  assert.equal(hasMusicBrainzMembership({ ...artist, relations: [] }, personId, bandId), false);
});
