import { isMapConnection } from "../../shared/graph-schema/edge-evidence.mjs";

export const MEMBER_OF_BAND_TYPE_ID = "5be4c609-9afa-4ea0-910b-12ffb71e3821";
const MUSICBRAINZ_ARTIST_URL = /^https:\/\/musicbrainz\.org\/artist\/([0-9a-f-]{36})(?:[/?#]|$)/i;

export function musicBrainzArtistId(node) {
  const ids = new Set((node.sources ?? [])
    .map((source) => MUSICBRAINZ_ARTIST_URL.exec(source.url ?? "")?.[1]?.toLowerCase())
    .filter(Boolean));
  return ids.size === 1 ? [...ids][0] : undefined;
}

export function isolatedArtistSeeds(graph, requestedIds = [], limit = 12) {
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    if (!isMapConnection(edge)) continue;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const requested = new Set(requestedIds);
  const eligible = graph.nodes.filter((node) =>
    ["artist", "guitarist", "band"].includes(node.type) &&
    degree.get(node.id) === 0 &&
    musicBrainzArtistId(node) &&
    (!requested.size || requested.has(node.id))
  );
  if (requested.size) {
    const found = new Set(eligible.map((node) => node.id));
    for (const id of requested) {
      if (!found.has(id)) throw new Error(`No isolated MusicBrainz artist node: ${id}`);
    }
  }
  eligible.sort((a, b) =>
    Number(b.starter) - Number(a.starter) ||
    Number(a.type === "band") - Number(b.type === "band") ||
    a.label.localeCompare(b.label, "en")
  );
  return eligible.slice(0, limit);
}

export function artistIndex(graph) {
  const index = new Map();
  for (const node of graph.nodes) {
    const id = musicBrainzArtistId(node);
    if (!id) continue;
    index.set(id, index.has(id) ? null : node);
  }
  return index;
}

export function membershipProposals(seed, artist, index, graph) {
  const seedMbid = musicBrainzArtistId(seed);
  if (!seedMbid || artist?.id !== seedMbid) return [];
  if (artist.type !== (seed.type === "band" ? "Group" : "Person")) return [];
  const existing = new Set(graph.edges.filter(isMapConnection)
    .map((edge) => `${edge.source}|${edge.target}|${edge.type}`));
  const byPair = new Map();
  for (const relation of artist.relations ?? []) {
    if (relation["type-id"] !== MEMBER_OF_BAND_TYPE_ID || !relation.artist?.id) continue;
    const other = index.get(relation.artist.id.toLowerCase());
    if (!other || other.id === seed.id) continue;
    const person = seed.type === "band" ? other : seed;
    const band = seed.type === "band" ? seed : other;
    if (!["artist", "guitarist"].includes(person.type) || band.type !== "band") continue;
    if (relation.artist.type !== (seed.type === "band" ? "Person" : "Group")) continue;
    const key = `${person.id}|${band.id}|member_of`;
    if (existing.has(key)) continue;
    if (!byPair.has(key)) {
      byPair.set(key, {
        id: `mb-member-${person.id}-${band.id}`,
        source: person.id,
        target: band.id,
        type: "member_of",
        label: "Member of",
        strength: 0.9,
        context: [`MusicBrainz records ${person.label} as a member of ${band.label}.`],
        sources: [{
          label: "MusicBrainz: member of band relationship",
          url: `https://musicbrainz.org/artist/${seedMbid}/relationships`,
          provider: "musicbrainz",
        }],
        evidence: {
          relationTypeId: MEMBER_OF_BAND_TYPE_ID,
          artistIds: [musicBrainzArtistId(person), musicBrainzArtistId(band)],
          periods: [],
        },
        status: "review",
      });
    }
    const periods = byPair.get(key).evidence.periods;
    const period = { begin: relation.begin || null, end: relation.end || null };
    if (!periods.some((item) => item.begin === period.begin && item.end === period.end)) {
      periods.push(period);
    }
  }
  return [...byPair.values()];
}
