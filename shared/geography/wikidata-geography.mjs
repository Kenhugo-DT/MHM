export function wikipediaArticle(sources = []) {
  for (const source of sources) {
    try {
      const url = new URL(source.url);
      if (!/^[a-z]{2,3}\.wikipedia\.org$/.test(url.hostname) || !url.pathname.startsWith("/wiki/")) continue;
      return { host: url.hostname, title: decodeURIComponent(url.pathname.slice(6)).replaceAll("_", " ") };
    } catch { /* Ignore malformed source URLs. */ }
  }
  return undefined;
}

export function wikipediaTitle(sources = []) {
  return wikipediaArticle(sources)?.title;
}

export function wikidataId(sources = []) {
  const ids = new Set();
  for (const source of sources) {
    try {
      const url = new URL(source.url);
      if (url.hostname !== "www.wikidata.org" && url.hostname !== "wikidata.org") continue;
      const match = /^\/wiki\/(Q\d+)$/.exec(url.pathname);
      if (match) ids.add(match[1]);
    } catch { /* Ignore malformed source URLs. */ }
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}

export function musicbrainzId(sources = []) {
  const ids = new Set();
  for (const source of sources) {
    try {
      const url = new URL(source.url);
      if (url.hostname !== "musicbrainz.org" && url.hostname !== "www.musicbrainz.org") continue;
      const match = /^\/artist\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (match) ids.add(match[1]);
    } catch { /* Ignore malformed source URLs. */ }
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}

export function claimItem(entity, property) {
  const statements = (entity?.claims?.[property] ?? []).filter((claim) =>
    claim.rank !== "deprecated" && claim.mainsnak?.snaktype === "value");
  const preferred = statements.filter((claim) => claim.rank === "preferred");
  const active = preferred.length ? preferred : statements;
  const ids = new Set(active.map((claim) => claim.mainsnak?.datavalue?.value?.id).filter((id) => /^Q\d+$/.test(id ?? "")));
  return ids.size === 1 ? [...ids][0] : undefined;
}

export function coordinates(entity) {
  const statements = (entity?.claims?.P625 ?? []).filter((claim) =>
    claim.rank !== "deprecated" && claim.mainsnak?.snaktype === "value" &&
    claim.mainsnak.datavalue?.value?.globe === "http://www.wikidata.org/entity/Q2");
  const preferred = statements.filter((claim) => claim.rank === "preferred");
  const active = preferred.length ? preferred : statements;
  const points = active.map((claim) => claim.mainsnak.datavalue.value)
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
  if (!points.length || points.some((point) => Math.abs(point.latitude - points[0].latitude) > 0.01 ||
    Math.abs(point.longitude - points[0].longitude) > 0.01)) return undefined;
  return { lat: points[0].latitude, lon: points[0].longitude };
}

export function englishLabel(entity) {
  return entity?.labels?.en?.value || entity?.labels?.mul?.value;
}

export function locationClaim(node, entity) {
  const property = node.type === "band" ? "P740" :
    node.type === "artist" || node.type === "guitarist" ? "P19" : undefined;
  if (!property) return undefined;
  const placeId = claimItem(entity, property);
  if (!placeId) return undefined;
  return {
    nodeId: node.id,
    entityId: entity.id,
    placeId,
    role: property === "P740" ? "musical_base" : "birthplace",
    property,
  };
}

export function placementFromClaim(claim, placeEntity, countryEntity) {
  const point = coordinates(placeEntity);
  const name = englishLabel(placeEntity);
  const country = englishLabel(countryEntity);
  if (!point || !name || !country || !claim?.nodeId) return undefined;
  const description = claim.role === "musical_base" ? "Location of formation" : "Place of birth";
  const musicbrainz = claim.property === "MB_BEGIN_AREA";
  return {
    nodeId: claim.nodeId,
    placeId: `wikidata:${claim.placeId}`,
    role: claim.role,
    place: { id: `wikidata:${claim.placeId}`, name, country, ...point },
    evidenceUrl: musicbrainz ? `https://musicbrainz.org/artist/${claim.entityId}` : `https://www.wikidata.org/wiki/${claim.entityId}#${claim.property}`,
    evidence: musicbrainz ? `MusicBrainz begin area: ${description.toLowerCase()}` : `Wikidata ${claim.property}: ${description.toLowerCase()}`,
    note: `${description}: ${name}, ${country}. ${musicbrainz ? "MusicBrainz supplies the begin area; Wikidata P625 supplies its map point." : "Wikidata P625 supplies the place's map point."} Place precision varies; this is not a verified performance venue. ${claim.role === "birthplace" ? "Birthplace is not treated as a musical base." : "Formation location is not evidence of later residence or concerts."}`,
    ...(claim.identitySource ? { identitySource: claim.identitySource,
      identityNote: "Identity resolved by exact Wikipedia title, matching Wikidata label and music-specific type; review if a namesake is suspected." } : {}),
    sourceEntity: claim.entityId,
    sourceProperty: claim.property,
    coordinateSource: `https://www.wikidata.org/wiki/${claim.placeId}#P625`,
  };
}
