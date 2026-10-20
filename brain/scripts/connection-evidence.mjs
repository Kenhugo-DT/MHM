import { isMapConnection } from "../../shared/graph-schema/edge-evidence.mjs";

export const MEMBER_OF_BAND_TYPE_ID = "5be4c609-9afa-4ea0-910b-12ffb71e3821";
const MUSICBRAINZ_ARTIST_URL = /^https:\/\/musicbrainz\.org\/artist\/([0-9a-f-]{36})(?:[/?#]|$)/i;
const MUSICBRAINZ_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function feedbackArtistSeeds(graph, rows, limit = 3, recentlyChecked = new Set()) {
  const byLabel = new Map();
  for (const node of graph.nodes) {
    if (!["artist", "guitarist", "band"].includes(node.type)) continue;
    const key = node.label.trim().toLocaleLowerCase("en");
    byLabel.set(key, byLabel.has(key) ? null : node);
  }
  const chosen = [];
  const seen = new Set();
  for (const row of rows) {
    if (row.status !== "rejected" || row.review_reason_code !== "weak_connection") continue;
    if (row.payload?.kind === "typed_connection") continue;
    const node = byLabel.get(String(row.seed_name ?? "").trim().toLocaleLowerCase("en"));
    if (!node || seen.has(node.id) || recentlyChecked.has(node.id)) continue;
    const expectedKind = node.type === "band" ? "band" : node.type === "guitarist" ||
      (node.roles ?? []).includes("guitarist") ? "guitarist" : "artist";
    if (row.requested_kind !== expectedKind) continue;
    const candidateId = row.payload?.musicbrainz?.id;
    const reviewedId = MUSICBRAINZ_ID.test(candidateId ?? "") ? candidateId.toLowerCase() : undefined;
    const existingId = musicBrainzArtistId(node);
    if (reviewedId && existingId && reviewedId !== existingId) continue;
    const musicbrainzId = existingId ?? reviewedId;
    chosen.push({ node, musicbrainzId, reasonCode: row.review_reason_code });
    seen.add(node.id);
    if (chosen.length >= limit) break;
  }
  return chosen;
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

export function membershipDiscoveryProposals(seed, artist, graph, limit = 3) {
  const personMbid = musicBrainzArtistId(seed);
  if (!personMbid || seed.type === "band" || artist?.id !== personMbid || artist.type !== "Person") return [];
  const knownIds = new Set(graph.nodes.map(musicBrainzArtistId).filter(Boolean));
  const knownLabels = new Set(graph.nodes.map((node) => node.label.trim().toLocaleLowerCase("en")));
  const discoveries = new Map();
  for (const relation of artist.relations ?? []) {
    const band = relation.artist;
    if (relation["type-id"] !== MEMBER_OF_BAND_TYPE_ID || band?.type !== "Group" ||
        !MUSICBRAINZ_ID.test(band.id ?? "") || !band.name?.trim() ||
        knownIds.has(band.id.toLowerCase()) || knownLabels.has(band.name.trim().toLocaleLowerCase("en"))) continue;
    const mbid = band.id.toLowerCase();
    if (!discoveries.has(mbid)) discoveries.set(mbid, {
      id: `mb-member-${seed.id}-mb-band-${mbid}`,
      source: seed.id,
      target: `mb-band-${mbid}`,
      type: "member_of",
      label: "Member of",
      strength: 0.9,
      context: [`MusicBrainz records ${seed.label} as a member of ${band.name}.`],
      sources: [{ label: "MusicBrainz: member of band relationship",
        url: `https://musicbrainz.org/artist/${personMbid}/relationships`, provider: "musicbrainz" }],
      evidence: { relationTypeId: MEMBER_OF_BAND_TYPE_ID, artistIds: [personMbid, mbid],
        sourceName: seed.label, periods: [] },
      discovery: { name: band.name.trim(), mbid, type: "band" },
      status: "review",
    });
    const periods = discoveries.get(mbid).evidence.periods;
    const period = { begin: relation.begin || null, end: relation.end || null };
    if (!periods.some((item) => item.begin === period.begin && item.end === period.end)) periods.push(period);
  }
  return [...discoveries.values()].sort((a, b) => a.discovery.name.localeCompare(b.discovery.name, "en")).slice(0, limit);
}
