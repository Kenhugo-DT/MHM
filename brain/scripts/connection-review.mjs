import { MEMBER_OF_BAND_TYPE_ID, musicBrainzArtistId } from "./connection-evidence.mjs";

export const CONNECTION_CANDIDATE_KIND = "typed_connection";

function membershipKey(edge) {
  return `${edge.source}|${edge.target}|${edge.type}`;
}

function validPeriod(value) {
  return value === null || /^\d{4}(?:-\d{2}){0,2}$/.test(value);
}

export function discoveredBandNode(proposal, graph) {
  if (!proposal?.discovery) return null;
  const person = graph.nodes.find((node) => node.id === proposal.source);
  const { name, mbid, type } = proposal.discovery;
  const sourceMbid = proposal.evidence?.artistIds?.[0];
  if (!person || !["artist", "guitarist"].includes(person.type) || type !== "band" ||
      typeof name !== "string" || !name.trim() ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(mbid ?? "") ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sourceMbid ?? "") ||
      proposal.evidence?.sourceName !== person.label ||
      proposal.evidence.artistIds[1] !== mbid ||
      proposal.target !== `mb-band-${mbid}` ||
      (musicBrainzArtistId(person) && musicBrainzArtistId(person) !== sourceMbid)) {
    throw new Error(`Discovered band identity is not independently matched: ${proposal?.id}`);
  }
  const existing = graph.nodes.find((node) => node.id === proposal.target);
  if (existing) {
    if (existing.type !== "band" || existing.label !== name || musicBrainzArtistId(existing) !== mbid) {
      throw new Error(`Discovered band conflicts with existing node: ${proposal.id}`);
    }
    return null;
  }
  if (graph.nodes.some((node) => node.label.trim().toLocaleLowerCase("en") === name.trim().toLocaleLowerCase("en"))) {
    throw new Error(`Discovered band label already exists: ${proposal.id}`);
  }
  return {
    id: proposal.target, label: name.trim(), type: "band", roles: ["band"],
    summary: `Band with a documented membership connection to ${person.label}.`,
    metadata: ["Band"], x: person.x + 140, y: person.y + 80,
    zone: person.zone, starter: false,
    layoutHints: { preferredZone: person.zone, nearNode: person.id },
    sources: [{ label: "MusicBrainz: artist identity", url: `https://musicbrainz.org/artist/${mbid}`,
      provider: "musicbrainz" }],
  };
}

export function applyMusicBrainzGroupStart(node, artist) {
  const mbid = musicBrainzArtistId(node);
  if (!mbid || artist?.id?.toLowerCase() !== mbid || artist.type !== "Group" ||
      artist.name?.trim() !== node.label) {
    throw new Error(`Discovered band could not be verified on MusicBrainz: ${node.id}`);
  }
  const begin = artist["life-span"]?.begin;
  if (!/^\d{4}(?:-\d{2}){0,2}$/.test(begin ?? "")) return node;
  const year = Number(begin.slice(0, 4));
  if (year < 1600 || year > new Date().getUTCFullYear()) return node;
  const source = { label: "MusicBrainz: group begin", url: `https://musicbrainz.org/artist/${mbid}`,
    provider: "musicbrainz" };
  node.eraStart = year;
  node.eraStartEvidence = { basis: "group_formation", note: "MusicBrainz group begin date.", sources: [source] };
  if (!node.sources.some((item) => item.url === source.url && item.label === source.label)) node.sources.push(source);
  return node;
}

export function connectionCandidate(proposal, graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const person = nodes.get(proposal?.source);
  const newBand = discoveredBandNode(proposal, graph);
  const band = nodes.get(proposal?.target) ?? newBand;
  if (!person || !band || !["artist", "guitarist"].includes(person.type) || band.type !== "band") {
    throw new Error(`Invalid member nodes: ${proposal?.id ?? "unknown"}`);
  }
  const personMbid = musicBrainzArtistId(person) ?? (proposal.discovery ? proposal.evidence?.artistIds?.[0] : undefined);
  const bandMbid = musicBrainzArtistId(band);
  if (!personMbid || !bandMbid || proposal.id !== `mb-member-${person.id}-${band.id}` ||
      proposal.type !== "member_of" ||
      proposal.evidence?.relationTypeId !== MEMBER_OF_BAND_TYPE_ID ||
      JSON.stringify(proposal.evidence?.artistIds) !== JSON.stringify([personMbid, bandMbid])) {
    throw new Error(`Membership identity is not independently matched: ${proposal.id}`);
  }
  const sourceUrl = `https://musicbrainz.org/artist/${personMbid}/relationships`;
  const sourceUrls = [
    sourceUrl,
    `https://musicbrainz.org/artist/${bandMbid}/relationships`,
  ];
  if (!proposal.sources?.some((source) => source.provider === "musicbrainz" &&
      sourceUrls.includes(source.url))) {
    throw new Error(`Missing relation-specific MusicBrainz source: ${proposal.id}`);
  }
  const periods = proposal.evidence?.periods;
  if (!Array.isArray(periods) || !periods.length || periods.some((period) =>
    !period || !validPeriod(period.begin) || !validPeriod(period.end))) {
    throw new Error(`Invalid membership dates: ${proposal.id}`);
  }
  const dates = periods.map((period) => `${period.begin ?? "unknown"} to ${period.end ?? "present"}`);
  return {
    id: `mb-member-${person.id}-${band.id}`,
    source: person.id,
    target: band.id,
    type: "member_of",
    label: "Member of",
    strength: 0.9,
    context: [
      `MusicBrainz records ${person.label} as a member of ${band.label}.`,
      `Documented period${dates.length === 1 ? "" : "s"}: ${dates.join("; ")}.`,
    ],
    sources: [{
      label: "MusicBrainz: member of band relationship",
      url: sourceUrl,
      provider: "musicbrainz",
    }],
  };
}

export function stageConnectionRows(rows, graph, promotions, limit = 12) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new Error("Connection batch limit must be 1..25.");
  }
  const existing = new Map([...graph.edges, ...(promotions.edges ?? [])]
    .filter((edge) => edge.type === "member_of")
    .map((edge) => [membershipKey(edge), edge]));
  const recorded = new Set((promotions.candidateRows ?? []).map((row) => String(row.id)));
  const eligible = rows.filter((row) => row.status === "approved" &&
    row.payload?.kind === CONNECTION_CANDIDATE_KIND && !recorded.has(String(row.id)));
  const selected = eligible.slice(0, limit);
  const edges = [];
  const nodes = [];
  const candidateRows = [];
  const alreadyPresent = [];
  for (const row of selected) {
    const stageGraph = { ...graph, nodes: [...graph.nodes, ...(promotions.nodes ?? []), ...nodes] };
    const newBand = discoveredBandNode(row.payload.connection, stageGraph);
    const edge = connectionCandidate(row.payload.connection, stageGraph);
    if (newBand) nodes.push(newBand);
    const key = membershipKey(edge);
    candidateRows.push({ id: String(row.id), kind: CONNECTION_CANDIDATE_KIND,
      edgeId: edge.id, source: edge.source, target: edge.target });
    if (existing.has(key)) {
      const previous = existing.get(key);
      if (previous.label !== "Member of" || !previous.sources?.some((source) =>
          source.provider === "musicbrainz")) {
        throw new Error(`Existing membership needs manual evidence review: ${edge.id}`);
      }
      alreadyPresent.push(edge.id);
      continue;
    }
    edges.push(edge);
    existing.set(key, edge);
  }
  return { nodes, edges, candidateRows, alreadyPresent, deferred: eligible.length - selected.length };
}

export function hasMusicBrainzMembership(artist, personMbid, bandMbid, expectedPeriods = []) {
  if (artist?.id?.toLowerCase() !== personMbid || artist.type !== "Person") return false;
  const matching = (artist.relations ?? []).filter((relation) =>
      relation["type-id"] === MEMBER_OF_BAND_TYPE_ID &&
      relation.artist?.id?.toLowerCase() === bandMbid &&
      relation.artist?.type === "Group");
  return matching.length > 0 && expectedPeriods.every((period) => matching.some((relation) =>
    (relation.begin || null) === period.begin && (relation.end || null) === period.end));
}
