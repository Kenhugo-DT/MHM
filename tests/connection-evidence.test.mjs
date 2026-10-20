import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMBER_OF_BAND_TYPE_ID,
  artistIndex,
  feedbackArtistSeeds,
  isolatedArtistSeeds,
  membershipDiscoveryProposals,
  membershipProposals,
  musicBrainzArtistId,
} from "../brain/scripts/connection-evidence.mjs";
import {
  applyMusicBrainzGroupStart,
  connectionCandidate,
  hasMusicBrainzMembership,
  stageConnectionRows,
} from "../brain/scripts/connection-review.mjs";
import { exactMusicBrainzArtistMatch } from "../brain/scripts/musicbrainz-client.mjs";

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

test("weak-connection feedback routes only exact graph identities for typed follow-up", () => {
  const reviewed = { id: "reviewed", label: "Reviewed Artist", type: "artist", sources: [] };
  const graph = { nodes: [reviewed, person, band], edges: [] };
  const rows = [
    { seed_name: "Reviewed Artist", requested_kind: "artist", status: "rejected",
      review_reason_code: "weak_connection", payload: {} },
    { seed_name: "Mike Portnoy", requested_kind: "artist", status: "rejected",
      review_reason_code: "weak_connection", payload: { musicbrainz: { id: personId } } },
    { seed_name: "Dream Theater", requested_kind: "band", status: "rejected",
      review_reason_code: "not_relevant", payload: {} },
    { seed_name: "Reviewed Artist", requested_kind: "band", status: "rejected",
      review_reason_code: "weak_connection", payload: {} },
  ];
  assert.deepEqual(feedbackArtistSeeds(graph, rows).map((item) => [item.node.id, item.musicbrainzId]), [
    ["reviewed", undefined], [person.id, personId],
  ]);
  assert.deepEqual(feedbackArtistSeeds(graph, rows, 3, new Set(["reviewed"])).map((item) => item.node.id), [person.id]);
  assert.deepEqual(feedbackArtistSeeds(graph, [{ ...rows[1], payload: { musicbrainz: { id: bandId } } }]), []);
  assert.deepEqual(feedbackArtistSeeds({ nodes: [reviewed, { ...reviewed, id: "duplicate" }], edges: [] }, [rows[0]]), []);
});

test("MusicBrainz name lookup refuses ambiguous or wrong-kind identities", () => {
  const personResult = { id: personId, name: "Mike Portnoy", type: "Person" };
  assert.equal(exactMusicBrainzArtistMatch([personResult], "mike portnoy", "artist"), personResult);
  assert.equal(exactMusicBrainzArtistMatch([personResult], "Mike Portnoy", "band"), undefined);
  assert.equal(exactMusicBrainzArtistMatch([personResult, { ...personResult, id: bandId }], "Mike Portnoy", "artist"), undefined);
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

test("reviewed person can discover a missing band through a typed MusicBrainz relation", () => {
  const graph = { nodes: [person], edges: [] };
  const artist = { id: personId, name: person.label, type: "Person", relations: [
    { "type-id": MEMBER_OF_BAND_TYPE_ID, artist: { id: bandId, name: "New Band", type: "Group" },
      begin: "1985", end: null },
  ] };
  const proposal = membershipDiscoveryProposals(person, artist, graph)[0];
  assert.equal(proposal.target, `mb-band-${bandId}`);
  assert.equal(proposal.discovery.name, "New Band");
  assert.equal(proposal.evidence.sourceName, person.label);
  const rows = [{ id: "approved", status: "approved", payload: { kind: "typed_connection", connection: proposal } }];
  const staged = stageConnectionRows(rows, graph, { nodes: [], edges: [], candidateRows: [] });
  assert.deepEqual(staged.nodes.map((node) => node.label), ["New Band"]);
  assert.equal(staged.edges[0].type, "member_of");
  assert.deepEqual(staged.edges[0].sources.map((source) => source.provider), ["musicbrainz"]);
  applyMusicBrainzGroupStart(staged.nodes[0], { id: bandId, name: "New Band", type: "Group",
    "life-span": { begin: "1985-03-01" } });
  assert.equal(staged.nodes[0].eraStart, 1985);
  assert.equal(staged.nodes[0].eraStartEvidence.basis, "group_formation");
  assert.throws(() => applyMusicBrainzGroupStart(staged.nodes[0], {
    id: bandId, name: "Another Band", type: "Group", "life-span": { begin: "1985" },
  }), /verified/);
  assert.deepEqual(stageConnectionRows(rows, graph, {
    nodes: staged.nodes, edges: staged.edges, candidateRows: staged.candidateRows,
  }).nodes, []);
  assert.equal(membershipDiscoveryProposals(person, artist, {
    nodes: [person, { id: "different", label: "New Band", type: "band" }], edges: [],
  }).length, 0);
  assert.throws(() => stageConnectionRows([{
    ...rows[0], payload: { kind: "typed_connection", connection: {
      ...proposal, evidence: { ...proposal.evidence, sourceName: "Wrong Person" },
    } },
  }], graph, { nodes: [], edges: [], candidateRows: [] }), /identity/);
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
