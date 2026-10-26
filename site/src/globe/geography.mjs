// This file is deliberately independent of the 2D map and its layout pipeline.
// Coordinates are approximate city centres, not claims about a building or venue.
export const PLACES = [
  { id: "london", name: "London", country: "United Kingdom", lat: 51.507, lon: -0.128, aliases: ["London"] },
  { id: "liverpool", name: "Liverpool", country: "United Kingdom", lat: 53.408, lon: -2.992, aliases: ["Liverpool"] },
  { id: "birmingham", name: "Birmingham", country: "United Kingdom", lat: 52.486, lon: -1.890, aliases: ["Birmingham"] },
  { id: "salford", name: "Salford", country: "United Kingdom", lat: 53.487, lon: -2.290, aliases: ["Salford"] },
  { id: "berlin", name: "Berlin", country: "Germany", lat: 52.520, lon: 13.405, aliases: ["Berlin"] },
  { id: "fulda", name: "Fulda", country: "Germany", lat: 50.552, lon: 9.676, aliases: ["Fulda"] },
  { id: "helsinki", name: "Helsinki", country: "Finland", lat: 60.170, lon: 24.938, aliases: ["Helsinki"] },
  { id: "kitee", name: "Kitee", country: "Finland", lat: 62.098, lon: 30.144, aliases: ["Kitee"] },
  { id: "espoo", name: "Espoo", country: "Finland", lat: 60.205, lon: 24.655, aliases: ["Espoo"] },
  { id: "kemi", name: "Kemi", country: "Finland", lat: 65.736, lon: 24.563, aliases: ["Kemi"] },
  { id: "gothenburg", name: "Gothenburg", country: "Sweden", lat: 57.708, lon: 11.974, aliases: ["Gothenburg"] },
  { id: "stockholm", name: "Stockholm", country: "Sweden", lat: 59.329, lon: 18.069, aliases: ["Stockholm"] },
  { id: "stavanger", name: "Stavanger", country: "Norway", lat: 58.970, lon: 5.733, aliases: ["Stavanger"] },
  { id: "sydney", name: "Sydney", country: "Australia", lat: -33.869, lon: 151.209, aliases: ["Sydney"] },
  { id: "pretoria", name: "Pretoria", country: "South Africa", lat: -25.747, lon: 28.188, aliases: ["Pretoria"] },
  { id: "toronto", name: "Toronto", country: "Canada", lat: 43.653, lon: -79.383, aliases: ["Toronto"] },
  { id: "los-angeles", name: "Los Angeles", country: "United States", lat: 34.052, lon: -118.244, aliases: ["Los Angeles"] },
  { id: "new-york", name: "New York City", country: "United States", lat: 40.713, lon: -74.006, aliases: ["New York City", "New York"] },
  { id: "washington-dc", name: "Washington, D.C.", country: "United States", lat: 38.907, lon: -77.037, aliases: ["Washington, D.C.", "Washington, DC"] },
  { id: "boston", name: "Boston", country: "United States", lat: 42.361, lon: -71.059, aliases: ["Boston"] },
  { id: "detroit", name: "Detroit", country: "United States", lat: 42.331, lon: -83.046, aliases: ["Detroit"] },
  { id: "ann-arbor", name: "Ann Arbor", country: "United States", lat: 42.281, lon: -83.748, aliases: ["Ann Arbor"] },
  { id: "compton", name: "Compton", country: "United States", lat: 33.895, lon: -118.220, aliases: ["Compton"] },
  { id: "oakland", name: "Oakland", country: "United States", lat: 37.805, lon: -122.271, aliases: ["Oakland"] },
  { id: "san-francisco", name: "San Francisco", country: "United States", lat: 37.775, lon: -122.419, aliases: ["San Francisco"] },
  { id: "newark", name: "Newark", country: "United States", lat: 40.736, lon: -74.173, aliases: ["Newark"] },
  { id: "toms-river", name: "Toms River", country: "United States", lat: 39.953, lon: -74.198, aliases: ["Toms River"] },
  { id: "roosevelt-ny", name: "Roosevelt", country: "United States", lat: 40.679, lon: -73.589, aliases: ["Roosevelt, New York"] },
  { id: "rodeo-ca", name: "Rodeo", country: "United States", lat: 38.033, lon: -122.267, aliases: ["Rodeo, California"] },
  { id: "garden-grove", name: "Garden Grove", country: "United States", lat: 33.774, lon: -117.941, aliases: ["Garden Grove"] },
  { id: "manhattan-beach", name: "Manhattan Beach", country: "United States", lat: 33.884, lon: -118.411, aliases: ["Manhattan Beach"] },
  { id: "huntington-beach", name: "Huntington Beach", country: "United States", lat: 33.660, lon: -117.999, aliases: ["Huntington Beach"] },
  { id: "agoura-hills", name: "Agoura Hills", country: "United States", lat: 34.136, lon: -118.774, aliases: ["Agoura Hills"] },
  { id: "san-diego", name: "San Diego", country: "United States", lat: 32.716, lon: -117.161, aliases: ["San Diego"] },
  { id: "jacksonville", name: "Jacksonville", country: "United States", lat: 30.333, lon: -81.655, aliases: ["Jacksonville, Florida"] },
  { id: "des-moines", name: "Des Moines", country: "United States", lat: 41.587, lon: -93.626, aliases: ["Des Moines"] },
  { id: "champaign", name: "Champaign", country: "United States", lat: 40.116, lon: -88.243, aliases: ["Champaign"] },
  { id: "el-cerrito", name: "El Cerrito", country: "United States", lat: 37.916, lon: -122.311, aliases: ["El Cerrito"] },
  { id: "memphis", name: "Memphis", country: "United States", lat: 35.150, lon: -90.049, aliases: ["Memphis"] },
  { id: "tupelo", name: "Tupelo", country: "United States", lat: 34.258, lon: -88.704, aliases: ["Tupelo"] },
];

const EXPLICIT = [
  { nodeId: "the-beatles", placeId: "liverpool", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d" },
  { nodeId: "metallica", placeId: "los-angeles", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab" },
  { nodeId: "black-sabbath", placeId: "birmingham", role: "musical_base", evidenceUrl: "https://en.wikipedia.org/wiki/Black_Sabbath" },
  { nodeId: "acdc", placeId: "sydney", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/66c662b6-6e2f-4930-8610-912e24c63ed1" },
  { nodeId: "seether", placeId: "pretoria", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/fbcd7b29-455f-49e6-9c4f-8249d20a055e" },
  { nodeId: "rush", placeId: "toronto", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/534ee493-bfac-4575-a44a-0ae41e2c3fe4" },
  { nodeId: "abba", placeId: "stockholm", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/d87e52c5-bb8d-4da8-b941-9f4928627dc8" },
  { nodeId: "queen", placeId: "london", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/0383dadf-2a4e-4d10-a46a-e9e041da8eb3" },
  { nodeId: "iron-maiden", placeId: "london", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/ca891d65-d9b0-4258-89f7-e6ba29d83767" },
  { nodeId: "ramones", placeId: "new-york", role: "musical_base", evidenceUrl: "https://musicbrainz.org/artist/d6ed7887-a401-47a8-893c-34b967444d26" },
  { nodeId: "elvis-presley", placeId: "memphis", role: "musical_base", evidenceUrl: "https://www.graceland.com/biography" },
  { nodeId: "elvis-presley", placeId: "tupelo", role: "birthplace", evidenceUrl: "https://www.graceland.com/biography" },
];

const placeById = new Map(PLACES.map((place) => [place.id, place]));
const aliases = PLACES.flatMap((place) => place.aliases.map((alias) => ({ place, alias })))
  .sort((a, b) => b.alias.length - a.alias.length);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferredBandPlace(node) {
  if (node.type !== "band" || !node.summary || !node.sources?.length) return undefined;
  for (const { place, alias } of aliases) {
    const match = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").exec(node.summary);
    if (!match) continue;
    const prefix = node.summary.slice(Math.max(0, match.index - 80), match.index);
    const anchored = /\b(?:formed|founded|created|established)\b[^.!?]{0,48}\b(?:in|at)\s*$/i.test(prefix)
      || /\b(?:band|group|collective)\s+from\s*$/i.test(prefix);
    if (anchored) return place;
  }
  return undefined;
}

export function buildGeography(nodes, sourceBacked = []) {
  const existing = new Set(nodes.map((node) => node.id));
  const placements = EXPLICIT.filter((entry) => existing.has(entry.nodeId)).map((entry) => ({
    ...entry,
    place: placeById.get(entry.placeId),
    evidence: "Curated source",
  }));
  const keys = new Set(placements.map((entry) => `${entry.nodeId}:${entry.role}`));
  for (const entry of sourceBacked) {
    const key = `${entry.nodeId}:${entry.role}`;
    if (!existing.has(entry.nodeId) || keys.has(key)) continue;
    placements.push(entry);
    keys.add(key);
  }
  for (const node of nodes) {
    if (keys.has(`${node.id}:musical_base`)) continue;
    const place = inferredBandPlace(node);
    if (!place) continue;
    placements.push({
      nodeId: node.id,
      placeId: place.id,
      role: "musical_base",
      place,
      evidenceUrl: node.sources[0].url,
      evidence: "Place stated in reviewed node summary",
    });
    keys.add(`${node.id}:musical_base`);
  }
  return placements;
}
