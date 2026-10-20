import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyMusicBrainzGroupStart, hasMusicBrainzMembership, stageConnectionRows } from "./connection-review.mjs";
import { musicBrainzArtistId } from "./connection-evidence.mjs";
import { lookupMusicBrainzArtist } from "./musicbrainz-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const graphPath = path.join(root, "brain/data/approved/graph.json");
const promotionsPath = path.join(root, "brain/data/approved/promotions.json");
const reportPath = path.join(root, "brain/data/runs/connection-stage-report.md");
const args = process.argv.slice(2);
let file;
let apply = false;
let limit = 12;
const candidateIds = new Set();
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--file") file = args[++i];
  else if (args[i] === "--apply") apply = true;
  else if (args[i] === "--limit") limit = Number(args[++i]);
  else if (args[i] === "--candidate") candidateIds.add(args[++i]);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if ((file && apply) || !Number.isInteger(limit) || limit < 1 || limit > 25 || candidateIds.has(undefined)) {
  throw new Error("Use --limit 1..25 and nonempty --candidate IDs. --file is preview-only; applying requires Supabase approval.");
}

function readJson(input) {
  return JSON.parse(fs.readFileSync(input, "utf8"));
}

async function approvedRows() {
  if (file) {
    const payload = readJson(path.resolve(file));
    return payload.proposals.map((proposal) => ({
      id: proposal.id,
      status: proposal.status,
      payload: { kind: "typed_connection", connection: proposal },
    }));
  }
  if (!process.env.SUPABASE_URL && fs.existsSync(path.join(root, ".env"))) {
    process.loadEnvFile(path.join(root, ".env"));
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let offset = 0; offset < 5000; offset += 200) {
    const { data, error } = await client.from("research_candidates")
      .select("id,status,payload").eq("status", "approved").order("id")
      .range(offset, offset + 199);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 200) return rows;
  }
  throw new Error("Approved queue exceeds 5000 rows; inspect it before staging.");
}

const graph = readJson(graphPath);
const promotions = readJson(promotionsPath);
const approved = await approvedRows();
const rows = candidateIds.size ? approved.filter((row) => candidateIds.has(String(row.id))) : approved;
if (candidateIds.size && rows.length !== candidateIds.size) {
  throw new Error("Every requested candidate must exist and be approved before staging.");
}
const staged = stageConnectionRows(rows, graph, promotions, limit);
const byId = new Map([...graph.nodes, ...(promotions.nodes ?? []), ...staged.nodes].map((node) => [node.id, node]));
const rowById = new Map(rows.map((row) => [String(row.id), row]));
const report = [
  "# Reviewed connection batch",
  "",
  `- Approved candidate rows: ${staged.candidateRows.length}`,
  `- New documented connections: ${staged.edges.length}`,
  `- New band nodes: ${staged.nodes.length}`,
  `- Already present: ${staged.alreadyPresent.length}`,
  `- Deferred to later batches: ${staged.deferred}`,
  `- Graph before: ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  "",
  "## New connections",
  "",
  ...staged.edges.map((edge) =>
    `- ${byId.get(edge.source).label} -> ${byId.get(edge.target).label}: ${edge.sources[0].url}`),
  "",
  "Human review and passing CI are required before merging. This step does not write to the live map.",
  "",
].join("\n");

if (apply && staged.edges.length) {
  let previousLookup;
  let previousMbid;
  for (const edge of staged.edges) {
    const stagedRow = staged.candidateRows.find((row) => row.edgeId === edge.id);
    const reviewed = rowById.get(stagedRow.id).payload.connection;
    const personMbid = musicBrainzArtistId(byId.get(edge.source)) ??
      (reviewed.discovery ? reviewed.evidence.artistIds[0] : undefined);
    const bandMbid = musicBrainzArtistId(byId.get(edge.target));
    if (personMbid !== previousMbid) {
      if (previousMbid) await new Promise((resolve) => setTimeout(resolve, 1250));
      previousLookup = await lookupMusicBrainzArtist(personMbid);
      previousMbid = personMbid;
    }
    const periods = reviewed.evidence.periods;
    if (!hasMusicBrainzMembership(previousLookup, personMbid, bandMbid, periods)) {
      throw new Error(`Live MusicBrainz membership check failed: ${edge.id}`);
    }
  }
}

if (apply) {
  for (const node of staged.nodes) {
    const artist = await lookupMusicBrainzArtist(musicBrainzArtistId(node));
    applyMusicBrainzGroupStart(node, artist);
  }
}

if (apply && staged.candidateRows.length) {
  const updated = {
    ...promotions,
    generatedAt: new Date().toISOString(),
    candidateRows: [...(promotions.candidateRows ?? []), ...staged.candidateRows],
    nodes: [...(promotions.nodes ?? []), ...staged.nodes],
    edges: [...(promotions.edges ?? []), ...staged.edges],
  };
  fs.writeFileSync(promotionsPath, `${JSON.stringify(updated, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
}

console.log(JSON.stringify({ approvedConnectionRows: staged.candidateRows.length,
  newNodes: staged.nodes.length, newEdges: staged.edges.length, alreadyPresent: staged.alreadyPresent,
  deferred: staged.deferred,
  applied: apply && staged.candidateRows.length > 0, report: apply ? path.relative(root, reportPath) : report }, null, 2));
