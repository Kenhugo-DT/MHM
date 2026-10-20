import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { artistIndex, feedbackArtistSeeds, isolatedArtistSeeds, membershipDiscoveryProposals, membershipProposals, musicBrainzArtistId } from "./connection-evidence.mjs";
import { lookupMusicBrainzArtist, searchMusicBrainzArtist } from "./musicbrainz-client.mjs";

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

let feedback = [];
let feedbackError;
if (!requestedIds.length && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
  try {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false } });
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: runs, error: runError } = await client.from("research_runs")
      .select("id,log,started_at").like("id", "connection-evidence-%")
      .eq("status", "completed").gte("started_at", since)
      .order("started_at", { ascending: false }).limit(100);
    if (runError) throw runError;
    const recentlyChecked = new Set((runs ?? []).flatMap((run) => run.log?.checked ?? []));
    const { data, error } = await client.from("research_candidates")
      .select("seed_name,requested_kind,payload,status,review_reason_code,updated_at")
      .eq("status", "rejected")
      .eq("review_reason_code", "weak_connection")
      .order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    feedback = feedbackArtistSeeds(graph, data ?? [], Math.min(3, limit), recentlyChecked);
  } catch (error) {
    feedbackError = String(error.message ?? error);
  }
}
const resolved = new Map();
for (const item of feedback) {
  let mbid = item.musicbrainzId;
  if (!mbid && !dryRun) {
    try {
      mbid = (await searchMusicBrainzArtist(item.node.label, item.node.type))?.id;
    } catch (error) {
      feedbackError = String(error.message ?? error);
    }
  }
  if (mbid) resolved.set(item.node.id, {
    ...item.node,
    sources: [...(item.node.sources ?? []), { url: `https://musicbrainz.org/artist/${mbid}` }],
  });
}
const baseline = isolatedArtistSeeds(graph, requestedIds, limit + resolved.size);
const seeds = requestedIds.length ? baseline.slice(0, limit) : [
  ...feedback.filter((item) => resolved.has(item.node.id)).map((item) => item.node),
  ...baseline.filter((node) => !resolved.has(node.id)),
].slice(0, limit);
if (dryRun) {
  console.log(JSON.stringify({ seeds: seeds.map((node) => ({ id: node.id, label: node.label, type: node.type })),
    feedbackSeeds: feedback.map((item) => item.node.id), feedbackResolved: [...resolved.keys()], feedbackError }, null, 2));
  process.exit(0);
}

const resolvedGraph = { ...graph, nodes: graph.nodes.map((node) => resolved.get(node.id) ?? node) };
const index = artistIndex(resolvedGraph);
const proposals = new Map();
const checked = [];
const errors = [];
for (const seed of seeds) {
  const resolvedSeed = resolved.get(seed.id) ?? seed;
  const mbid = musicBrainzArtistId(resolvedSeed);
  if (!mbid) continue;
  try {
    const artist = await lookupMusicBrainzArtist(mbid);
    if (resolved.has(seed.id) && artist?.name?.trim().toLocaleLowerCase("en") !== seed.label.trim().toLocaleLowerCase("en")) {
      errors.push({ id: seed.id, message: "Feedback identity did not match the graph label." });
      continue;
    }
    checked.push(seed.id);
    for (const proposal of [
      ...membershipProposals(resolvedSeed, artist, index, graph),
      ...membershipDiscoveryProposals(resolvedSeed, artist, graph),
    ]) {
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
  feedbackSeeds: feedback.map((item) => item.node.id),
  feedbackResolved: [...resolved.keys()],
  feedbackError,
  proposals: [...proposals.values()].slice(0, 25).sort((a, b) => a.id.localeCompare(b.id, "en")),
}, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), checked: checked.length,
  proposals: Math.min(proposals.size, 25), feedbackSeeds: feedback.length, feedbackResolved: resolved.size,
  feedbackError, errors }, null, 2));
