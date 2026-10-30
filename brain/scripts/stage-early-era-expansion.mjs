import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const poolPath = path.join(root, "brain/data/runs/early-era-reviewed-pool.json");
const graphPaths = [
  path.join(root, "brain/data/approved/graph.json"),
  path.join(root, "site/public/data/graph.json"),
];
const batchPath = path.join(root, "brain/data/early-era-expansion-2026-10-30.json");
const prefix = "early-era-20261030-";
const genreInfo = new Map([
  ["Q1344", ["opera", "Opera", "classical-history"]],
  ["Q9730", ["classical-music", "Classical music", "classical-history"]],
  ["Q207591", ["romantic-music", "Romantic music", "classical-history"]],
  ["Q8361", ["baroque-music", "Baroque music", "classical-history"]],
  ["Q8341", ["jazz", "Jazz", "jazz"]],
  ["Q9759", ["blues", "Blues", "roots-blues"]],
  ["Q37073", ["pop-music", "Pop music", "pop-soul-disco"]],
  ["Q43343", ["folk", "Folk", "folk-country-vise"]],
  ["Q185652", ["ragtime", "Ragtime", "jazz"]],
  ["Q1338153", ["twentieth-century-classical-music", "20th-century classical music", "classical-history"]],
  ["Q1062400", ["chanson", "Chanson", "pop-soul-disco"]],
  ["Q1323698", ["indian-classical-music", "Indian classical music", "classical-history"]],
  ["Q14390274", ["tango", "Tango", "pop-soul-disco"]],
  ["Q1196752", ["traditional-pop", "Traditional pop", "pop-soul-disco"]],
  ["Q205049", ["world-music", "World music", "pop-soul-disco"]],
  ["Q189201", ["chamber-music", "Chamber music", "classical-history"]],
  ["Q85477", ["oratorio", "Oratorio", "classical-history"]],
]);

const wikiSource = (item) => ({ label: "Wikipedia: " + item.name, url: item.article, provider: "wikipedia" });
const dataSource = (qid) => ({ label: "Wikidata: " + qid, url: `https://www.wikidata.org/wiki/${qid}`, provider: "wikidata" });
const slug = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const normalize = (value) => slug(value).replaceAll("-", "");
const candidates = JSON.parse(fs.readFileSync(poolPath, "utf8")).candidates
  .filter((item) => item.issues.length === 0 && item.name !== "Thomas Carter"
    && item.genreIds.some((qid) => genreInfo.has(qid)))
  .sort((a, b) => a.startYear - b.startYear || a.qid.localeCompare(b.qid));
if (candidates.length !== 120) throw new Error(`Expected 120 source-checked artists, got ${candidates.length}`);

const graph = JSON.parse(fs.readFileSync(graphPaths[0], "utf8"));
const siteGraph = JSON.parse(fs.readFileSync(graphPaths[1], "utf8"));
if (graph.nodes.length !== siteGraph.nodes.length || graph.edges.length !== siteGraph.edges.length) {
  throw new Error("Approved and browser graphs differ; reconcile before staging.");
}
const existingIds = new Set(graph.nodes.map((node) => node.id));
const existingLabels = new Set(graph.nodes.map((node) => normalize(node.label)));
const newNodes = [];
const newEdges = [];
const genreIds = [...new Set(candidates.flatMap((item) => item.genreIds.filter((qid) => genreInfo.has(qid))))];
const newGenreIds = genreIds.filter((qid) => !existingIds.has(genreInfo.get(qid)[0]));

for (const [index, qid] of newGenreIds.entries()) {
  const [id, label, zone] = genreInfo.get(qid);
  if (existingLabels.has(normalize(label))) throw new Error(`Genre label already exists: ${label}`);
  newNodes.push({
    id, label, type: "genre", zone, summary: `${label} is a musical genre associated with the documented artists in this expansion.`,
    roles: ["genre"], metadata: [], sources: [dataSource(qid)],
    x: zone === "classical-history" ? -4770 + (index % 3) * 350 : -1780 + (index % 3) * 350,
    y: zone === "classical-history" ? -2940 + Math.floor(index / 3) * 180 : 3490 + Math.floor(index / 3) * 180,
  });
  existingIds.add(id);
  existingLabels.add(normalize(label));
}

const zoneCounts = new Map();
for (const item of candidates) {
  const id = slug(item.name);
  if (!id || existingIds.has(id) || existingLabels.has(normalize(item.name))) {
    throw new Error(`Duplicate or invalid artist identity: ${item.name} (${id})`);
  }
  const genres = item.genreIds.filter((qid) => genreInfo.has(qid));
  const zone = genres.includes("Q8341") ? "jazz"
    : genres.some((qid) => ["Q37073", "Q1062400", "Q14390274", "Q1196752", "Q205049"].includes(qid))
      ? "pop-soul-disco" : "classical-history";
  const index = zoneCounts.get(zone) ?? 0;
  zoneCounts.set(zone, index + 1);
  const bin = Math.floor((item.startYear - 1600) / 50);
  const x = zone === "classical-history" ? -5500 + bin * 360 + (index % 3) * 112
    : zone === "jazz" ? -2200 + (index % 3) * 165 : -2250 + (index % 5) * 165;
  const y = zone === "classical-history" ? -2730 + Math.floor(index / 3) * 65
    : zone === "jazz" ? -1950 + Math.floor(index / 3) * 145 : 3630 + Math.floor(index / 5) * 145;
  const referenceNote = item.startReferenceCount > 0
    ? "The Wikidata work-period start claim has an attached reference."
    : "The Wikidata work-period start claim lacks an attached reference; retain for review if a stronger date source appears.";
  const sources = [dataSource(item.qid), wikiSource(item)];
  if (item.musicbrainzId) sources.push({
    label: "MusicBrainz artist identity", url: `https://musicbrainz.org/artist/${item.musicbrainzId}`, provider: "musicbrainz",
  });
  newNodes.push({
    id, label: item.name, type: "artist", zone, eraStart: item.startYear,
    eraStartEvidence: {
      basis: "work_period_start",
      note: `Year from Wikidata P2031 (work period start), not a birth year or an assumed first release. ${referenceNote}`,
      sources: [dataSource(item.qid)],
    },
    summary: item.description ? item.description[0].toUpperCase() + item.description.slice(1) + "." : "Musician.",
    roles: ["artist"], metadata: [], sources, x, y,
  });
  for (const qid of genres) {
    const [target, label] = genreInfo.get(qid);
    newEdges.push({
      id: `${prefix}${id}-${target}`,
      source: id, target, type: "associated_genre", label: `Associated with ${label}`,
      strength: 0.72,
      context: [`Wikidata lists ${label} under this artist's genre (P136); this is a genre association, not a claim of direct influence.`],
      sources: [dataSource(item.qid)],
    });
  }
  existingIds.add(id);
  existingLabels.add(normalize(item.name));
}

const staged = { ...graph, nodes: [...graph.nodes, ...newNodes], edges: [...graph.edges, ...newEdges] };
const batch = {
  description: "1600-1950 source-checked musician expansion; work start uses Wikidata P2031, genre edges use P136.",
  edgePrefix: prefix,
  expectedEdges: newEdges.length,
  nodeIds: newNodes.map((node) => node.id),
  allowedZones: ["classical-history", "jazz", "pop-soul-disco"],
  evidence: candidates.map((item) => ({ qid: item.qid, name: item.name, workStart: item.startYear,
    workStartReferences: item.startReferenceCount, musicbrainzId: item.musicbrainzId,
    wikipedia: item.article, genreQids: item.genreIds.filter((qid) => genreInfo.has(qid)) })),
};
for (const filePath of graphPaths) fs.writeFileSync(filePath, `${JSON.stringify(staged, null, 2)}\n`);
fs.writeFileSync(batchPath, `${JSON.stringify(batch, null, 2)}\n`);
console.log(JSON.stringify({ newArtists: candidates.length, newGenres: newGenreIds.length,
  newNodes: newNodes.length, newEdges: newEdges.length, zones: Object.fromEntries(zoneCounts),
  referencedStartYears: candidates.filter((item) => item.startReferenceCount > 0).length,
  batchPath }, null, 2));
