import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artistIndex, isolatedArtistSeeds, membershipProposals, musicBrainzArtistId } from "./connection-evidence.mjs";
import { lookupMusicBrainzArtist } from "./musicbrainz-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "brain/data/approved/graph.json"), "utf8"));
const args = process.argv.slice(2);
const requestedIds = [];
let limit = 12;
let dryRun = false;
let outputPath;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--node") requestedIds.push(args[++index]);
  else if (args[index] === "--limit") limit = Number(args[++index]);
  else if (args[index] === "--dry-run") dryRun = true;
  else if (args[index] === "--output") outputPath = args[++index];
  else throw new Error(`Unknown argument: ${args[index]}`);
}
if (!Number.isInteger(limit) || limit < 1 || limit > 25 || requestedIds.some((id) => !id) ||
    (outputPath !== undefined && !outputPath)) {
  throw new Error("Use --limit 1..25 and non-empty --node IDs.");
}

const seeds = isolatedArtistSeeds(graph, requestedIds, limit);
if (dryRun) {
  console.log(JSON.stringify({ seeds: seeds.map((node) => ({ id: node.id, label: node.label, type: node.type })) }, null, 2));
  process.exit(0);
}

const index = artistIndex(graph);
const proposals = new Map();
const checked = [];
const errors = [];
for (const seed of seeds) {
  try {
    const artist = await lookupMusicBrainzArtist(musicBrainzArtistId(seed));
    checked.push(seed.id);
    for (const proposal of membershipProposals(seed, artist, index, graph)) {
      const existing = proposals.get(proposal.id);
      if (!existing) proposals.set(proposal.id, proposal);
      else {
        for (const period of proposal.evidence.periods) {
          if (!existing.evidence.periods.some((item) => item.begin === period.begin && item.end === period.end)) {
            existing.evidence.periods.push(period);
          }
        }
      }
    }
  } catch (error) {
    errors.push({ id: seed.id, message: String(error.message ?? error) });
  }
  if (seed !== seeds.at(-1)) await new Promise((resolve) => setTimeout(resolve, 1250));
}

const generatedAt = new Date().toISOString();
const output = outputPath ? path.resolve(outputPath) : path.join(root, "brain/data/candidates", `connection-evidence-${generatedAt.replace(/[-:.]/g, "").slice(0, 15)}Z.json`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({
  version: 1,
  generatedAt,
  source: "MusicBrainz artist relationships; review only",
  checked,
  errors,
  proposals: [...proposals.values()].sort((a, b) => a.id.localeCompare(b.id, "en")),
}, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), checked: checked.length,
  proposals: proposals.size, errors }, null, 2));
