import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reviewRoot = path.join(root, "brain/data/source-reviews");
const wikidata = JSON.parse(fs.readFileSync(path.join(reviewRoot, "2026-10-02-start-years.json"), "utf8"));
const musicbrainz = JSON.parse(fs.readFileSync(path.join(reviewRoot, "2026-10-02-musicbrainz-years.json"), "utf8"));
const output = path.join(root, "brain/data/curated-start-years.json");
const manual = JSON.parse(fs.readFileSync(path.join(root, "brain/data/manual-start-years.json"), "utf8"));
const existing = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : { nodes: [] };
const byId = new Map(existing.nodes.map((entry) => [entry.id, entry]));

for (const candidate of wikidata.results) {
  const match = musicbrainz.results[candidate.id];
  if (candidate.type !== "band" || candidate.status !== "candidate" ||
    candidate.claims.length !== 1 || match?.type !== "Group" ||
    candidate.claims[0].year !== match.year) continue;

  const sources = [
    { label: "Wikidata: inception", url: candidate.sourceUrl, provider: "wikidata" },
    { label: "MusicBrainz: group begin", url: match.sourceUrl, provider: "musicbrainz" },
  ];
  const entry = {
    id: candidate.id,
    eraStart: match.year,
    basis: "group_formation",
    note: "Wikidata inception and MusicBrainz group begin agree on the year.",
    sources,
  };
  const previous = byId.get(entry.id);
  if (previous && previous.eraStart !== entry.eraStart) {
    throw new Error(`Conflicting curated year for ${entry.id}`);
  }
  byId.set(entry.id, entry);
}

for (const entry of manual.nodes) {
  const previous = byId.get(entry.id);
  if (previous && previous.eraStart !== entry.eraStart) {
    throw new Error(`Conflicting manually reviewed year for ${entry.id}`);
  }
  byId.set(entry.id, entry);
}

const nodes = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(output, `${JSON.stringify({ nodes }, null, 2)}\n`);
console.log(`Curated ${nodes.length} source-reviewed start years to ${output}`);
