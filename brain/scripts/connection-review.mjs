import { MEMBER_OF_BAND_TYPE_ID, musicBrainzArtistId } from "./connection-evidence.mjs";

export const CONNECTION_CANDIDATE_KIND = "typed_connection";

function membershipKey(edge) {
  return `${edge.source}|${edge.target}|${edge.type}`;
}

function validPeriod(value) {
  return value === null || /^\d{4}(?:-\d{2}){0,2}$/.test(value);
}

export function connectionCandidate(proposal, graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const person = nodes.get(proposal?.source);
  const band = nodes.get(proposal?.target);
  if (!person || !band || !["artist", "guitarist"].includes(person.type) || band.type !== "band") {
    throw new Error(`Invalid member nodes: ${proposal?.id ?? "unknown"}`);
  }
  const personMbid = musicBrainzArtistId(person);
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
  const candidateRows = [];
  const alreadyPresent = [];
  for (const row of selected) {
    const edge = connectionCandidate(row.payload.connection, graph);
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
  return { edges, candidateRows, alreadyPresent, deferred: eligible.length - selected.length };
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
