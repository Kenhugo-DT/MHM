import entries from "./global-atlas.json" with { type: "json" };

export function extendAtlas(nodes, placements) {
  const nextNodes = [...nodes];
  const nextPlacements = [...placements];
  const byName = new Map(nodes.filter((node) => node.type === "band")
    .map((node) => [node.label.toLocaleLowerCase(), node]));
  const bySource = new Map(nodes.flatMap((node) => (node.sources ?? []).map((source) => [source.url, node])));
  const placed = new Set(placements.filter((entry) => entry.role === "musical_base").map((entry) => entry.nodeId));
  for (const entry of entries) {
    const sourceUrl = `https://musicbrainz.org/artist/${entry.mbid}`;
    const sameName = byName.get(entry.label.toLocaleLowerCase());
    const conflictingIdentity = sameName?.sources?.some((source) =>
      /^https:\/\/musicbrainz\.org\/artist\//.test(source.url) && source.url !== sourceUrl);
    let node = bySource.get(sourceUrl) ?? (conflictingIdentity ? undefined : sameName);
    if (!node) {
      node = {
        id: `atlas:${entry.mbid}`, label: entry.label, type: "band", aliases: [],
        summary: `Formed in ${entry.city}, ${entry.country} in ${entry.year}.`,
        roles: [], metadata: [], eraStart: entry.year, atlasOnly: true,
        sources: [{ label: "MusicBrainz artist", url: sourceUrl }],
      };
      nextNodes.push(node);
    }
    if (placed.has(node.id)) continue;
    nextPlacements.push({
      nodeId: node.id, placeId: `atlas:${entry.id}`, role: "musical_base",
      place: { id: `atlas:${entry.id}`, name: entry.city, country: entry.country, lat: entry.lat, lon: entry.lon },
      evidenceUrl: sourceUrl, evidence: "MusicBrainz founded-in area",
      note: "Documented formation city; point is an approximate city centre, not a venue or later residence.",
    });
    placed.add(node.id);
  }
  return { nodes: nextNodes, placements: nextPlacements };
}
