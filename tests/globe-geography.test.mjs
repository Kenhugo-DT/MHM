import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildGeography, PLACES } from "../site/src/globe/geography.mjs";
import {
  claimItem, coordinates, locationClaim, musicbrainzId, placementFromClaim, wikipediaArticle, wikipediaTitle,
} from "../shared/geography/wikidata-geography.mjs";

const graph = JSON.parse(readFileSync(new URL("../site/public/data/graph.json", import.meta.url), "utf8"));
const sourceBacked = JSON.parse(readFileSync(new URL("../site/public/data/geography.json", import.meta.url), "utf8"));
const learningModel = JSON.parse(readFileSync(new URL("../brain/data/approved/learning-model.json", import.meta.url), "utf8"));

test("geographic placements use real graph nodes, valid city centres and source URLs", () => {
  const placements = buildGeography(graph.nodes, sourceBacked.placements);
  const ids = new Set(graph.nodes.map((node) => node.id));
  const unique = new Set();
  assert.ok(placements.length >= 680);
  for (const entry of placements) {
    assert.ok(ids.has(entry.nodeId), entry.nodeId);
    assert.ok(entry.place.lat >= -90 && entry.place.lat <= 90);
    assert.ok(entry.place.lon >= -180 && entry.place.lon <= 180);
    assert.match(entry.evidenceUrl, /^https:\/\//);
    const key = `${entry.nodeId}:${entry.role}`;
    assert.ok(!unique.has(key), `duplicate placement ${key}`);
    unique.add(key);
  }
  assert.ok(PLACES.length >= 30);
});

test("source-backed geography is attached only to approved graph nodes", () => {
  const ids = new Set([...graph.nodes.map((node) => node.id), ...sourceBacked.summary.liveOnlyNodeIds]);
  for (const entry of sourceBacked.placements) {
    assert.ok(ids.has(entry.nodeId), entry.nodeId);
    assert.ok(!entry.nodeId.startsWith("candidate:"));
    assert.ok([entry.role === "musical_base" ? "P740" : "P19", "MB_BEGIN_AREA", "REVIEWED"].includes(entry.sourceProperty));
    assert.match(entry.coordinateSource, /#P625$/);
    assert.ok(entry.note.includes("not"), entry.nodeId);
    if (entry.identitySource) assert.match(entry.identitySource, /^https:\/\/(?:en\.wikipedia\.org\/wiki|musicbrainz\.org\/artist|www\.wikidata\.org\/wiki)\//);
  }
  for (const note of sourceBacked.bridgeNotes) {
    assert.ok(note.sourceUrls.length);
    assert.match(note.note, /not evidence of travel/);
  }
});

test("reviewed correction displaces the bad Bee Gees formation claim", () => {
  const entry = sourceBacked.placements.find((item) => item.nodeId === "bee-gees");
  assert.equal(entry.place.name, "Redcliffe");
  assert.equal(entry.place.country, "Australia");
  assert.equal(entry.sourceProperty, "REVIEWED");
  assert.match(entry.evidenceUrl, /^https:\/\/www\.beegees\.com\//);
  assert.match(entry.note, /incorrect, unsourced formation place/);
});

test("album identity cannot displace Kvelertak's reviewed band location", () => {
  const entry = sourceBacked.placements.find((item) => item.nodeId === "kvelertak");
  assert.equal(entry.place.name, "Stavanger");
  assert.equal(entry.place.country, "Norway");
  assert.equal(entry.sourceProperty, "REVIEWED");
  assert.match(entry.identityNote, /album, not the band/);
});

test("the brain retains sourced geography without promoting candidate locations to facts", () => {
  assert.equal(learningModel.geographyEvidence.nodesCovered,
    sourceBacked.placements.filter((item) => graph.nodes.some((node) => node.id === item.nodeId)).length);
  assert.ok(learningModel.nodes["bee-gees"].geographyEvidence.some((entry) =>
    entry.place === "Redcliffe, Australia" && entry.sourceUrl.includes("beegees.com")));
  assert.ok(learningModel.nodes.kvelertak.geographyEvidence.some((entry) =>
    entry.place === "Stavanger, Norway" && entry.identityNote.includes("album")));
  assert.match(learningModel.geographyEvidence.caution, /proximity alone does not create a graph edge/);
  assert.ok(!Object.keys(learningModel.nodes).some((id) => id.startsWith("candidate:")));
});

test("ambiguous Wikidata locations and coordinates are rejected", () => {
  const item = (id, rank = "normal") => ({ rank, mainsnak: { snaktype: "value", datavalue: { value: { id } } } });
  const coordinate = (latitude, longitude) => ({
    rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: {
      latitude, longitude, globe: "http://www.wikidata.org/entity/Q2",
    } } },
  });
  const entity = { id: "Q1", claims: { P740: [item("Q10"), item("Q11")], P19: [item("Q12")] } };
  assert.equal(claimItem(entity, "P740"), undefined);
  assert.equal(locationClaim({ id: "band", type: "band" }, entity), undefined);
  assert.deepEqual(locationClaim({ id: "person", type: "artist" }, entity), {
    nodeId: "person", entityId: "Q1", placeId: "Q12", role: "birthplace", property: "P19",
  });
  assert.equal(coordinates({ claims: { P625: [coordinate(40, -74), coordinate(41, -75)] } }), undefined);
  assert.equal(placementFromClaim({ nodeId: "person", entityId: "Q1", placeId: "Q12", role: "birthplace", property: "P19" },
    { labels: { en: { value: "City" } }, claims: {} }, { labels: { en: { value: "Country" } } }), undefined);
});

test("Wikipedia identities come only from an actual article source", () => {
  assert.equal(wikipediaTitle([{ url: "https://en.wikipedia.org/wiki/The_Beatles" }]), "The Beatles");
  assert.equal(wikipediaTitle([{ url: "https://example.org/wiki/The_Beatles" }]), undefined);
  assert.deepEqual(wikipediaArticle([{ url: "https://no.wikipedia.org/wiki/Jan_Eggum" }]),
    { host: "no.wikipedia.org", title: "Jan Eggum" });
  assert.equal(musicbrainzId([{ url: "https://musicbrainz.org/artist/f4a31f0a-51dd-4fa7-986d-3095c40c5ed9" }]),
    "f4a31f0a-51dd-4fa7-986d-3095c40c5ed9");
});

test("birthplace is distinct from the musical base", () => {
  const entries = buildGeography(graph.nodes, sourceBacked.placements).filter((entry) => entry.nodeId === "elvis-presley");
  assert.equal(entries.find((entry) => entry.role === "musical_base")?.placeId, "memphis");
  assert.equal(entries.find((entry) => entry.role === "birthplace")?.placeId, "tupelo");
});

test("new band nodes with an explicit formation place can be placed without changing the 2D map", () => {
  const placements = buildGeography([{
    id: "future-band", type: "band", summary: "Future Band formed in Berlin in 2025.",
    sources: [{ url: "https://example.org/future-band" }],
  }]);
  assert.equal(placements[0]?.placeId, "berlin");
  assert.equal(placements[0]?.nodeId, "future-band");
});

test("unknown and non-geographic nodes are never assigned invented coordinates", () => {
  const placements = buildGeography([
    { id: "unknown-band", type: "band", summary: "A band with no documented base.", sources: [{ url: "https://example.org" }] },
    { id: "a-genre", type: "genre", summary: "A genre from London.", sources: [{ url: "https://example.org" }] },
  ]);
  assert.equal(placements.length, 0);
});
