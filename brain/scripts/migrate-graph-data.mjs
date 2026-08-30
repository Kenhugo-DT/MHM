import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { extraEdges, extraNodes } from "./graph-expansion.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(brainRoot, "..");
const legacyDataPath = path.join(scriptDir, "graph-data.js");
const legacyAppPath = path.join(scriptDir, "app.js");
const browserOutputPath = path.join(repoRoot, "site", "public", "data", "graph.json");
const approvedOutputPath = path.join(brainRoot, "data", "approved", "graph.json");
const blockedEntitiesPath = path.join(repoRoot, "shared", "graph-schema", "blocked-entities.json");

const blockedEntities = JSON.parse(fs.readFileSync(blockedEntitiesPath, "utf8"));
const excludedEntityIds = new Set(blockedEntities.entities.map((entity) => entity.id));

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(legacyDataPath, "utf8"), sandbox);
const legacy = sandbox.window.GUITAR_GRAPH_DATA;

const appSource = fs.readFileSync(legacyAppPath, "utf8");
const positionMatch = appSource.match(
  /const STRUCTURED_POSITIONS = (\{[\s\S]*?\n  \});\n\n  const MAP_ZONES/,
);

if (!legacy || !positionMatch) {
  throw new Error("Could not read the legacy graph or structured positions.");
}

const positions = vm.runInNewContext(`(${positionMatch[1]})`);
const supportedTypes = new Set(["artist", "band", "genre", "maker", "guitar"]);
const artistOnly = new Set([
  "bob-dylan",
  "elvis-presley",
  "johnny-cash",
  "lillebjorn-nilsen",
  "jan-eggum",
  "halvdan-sivertsen",
  "alf-cranner",
  "ozzy-osbourne",
  "willie-nelson",
]);

const typeMap = {
  artist: "guitarist",
  band: "band",
  genre: "genre",
  maker: "guitar_brand",
  guitar: "guitar",
};

function nodeType(node) {
  if (node.type === "artist" && artistOnly.has(node.id)) return "artist";
  return typeMap[node.type];
}

function zoneFor(x, y, type) {
  if (type === "guitar" || type === "guitar_brand") return "guitar-workshop";
  if (y > 400 && x < 500) return "folk-country-vise";
  if (x > 250 && y > -500) return "hard-rock-metal";
  if (y < -350) return "psychedelia-prog";
  if (x < -650) return "roots-blues";
  return "rock-circuit";
}

function relationType(edge, sourceNode, targetNode) {
  const label = edge.label.toLowerCase();
  if (label.includes("member") || label.includes("frontman") || label.includes("guitarist")) {
    return "member_of";
  }
  if (label.includes("influence") || label.includes("draws from") || label.includes("roots source")) {
    return "influenced_by";
  }
  if (sourceNode.type === "genre" || targetNode.type === "genre") {
    return "associated_genre";
  }
  if (sourceNode.type === "maker" || targetNode.type === "maker") {
    return "made_by";
  }
  if (sourceNode.type === "guitar" || targetNode.type === "guitar") {
    return label.includes("signature") || label.includes("iconic")
      ? "signature_instrument"
      : "plays";
  }
  if (label.includes("collab") || label.includes("shared") || label.includes("link")) {
    return "collaboration";
  }
  return "related";
}

const graphNodes = [...legacy.nodes, ...extraNodes];
const graphEdges = [...legacy.edges, ...extraEdges];

const keptLegacyNodes = graphNodes.filter(
  (node) => supportedTypes.has(node.type) && !excludedEntityIds.has(node.id),
);
const keptIds = new Set(keptLegacyNodes.map((node) => node.id));
const nodeById = new Map(graphNodes.map((node) => [node.id, node]));

function normalizeSources(sources = []) {
  return sources.map((source) => ({
    ...source,
    provider: source.provider ?? (source.url.includes("wikipedia.org") ? "wikipedia" : "other"),
  }));
}

const nodes = keptLegacyNodes.map((node) => {
  const [x, y] = positions[node.id] ?? [node.x, node.y];
  const type = nodeType(node);
  return {
    id: node.id,
    label: node.label,
    type,
    roles: type === "guitarist" ? ["guitarist", "artist"] : [type],
    summary: node.summary ?? "",
    metadata: node.meta ?? [],
    x,
    y,
    zone: zoneFor(x, y, type),
    starter: Boolean(node.starter),
    sources: normalizeSources(node.sources),
  };
});

const edges = graphEdges
  .filter((edge) => keptIds.has(edge.from) && keptIds.has(edge.to))
  .map((edge, index) => {
    const sourceNode = nodeById.get(edge.from);
    const targetNode = nodeById.get(edge.to);
    return {
      id: `legacy-${index}-${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: relationType(edge, sourceNode, targetNode),
      label: edge.label,
      strength: edge.strength ?? 0.55,
      context: edge.context ?? [],
      sources: normalizeSources(edge.sources),
    };
  });

const releaseNodes = graphNodes.filter((node) => node.type === "release");
for (const release of releaseNodes) {
  const people = graphEdges
    .filter((edge) => edge.from === release.id || edge.to === release.id)
    .map((edge) => (edge.from === release.id ? edge.to : edge.from))
    .filter((id) => {
      const node = nodeById.get(id);
      return node && ["artist", "band"].includes(node.type) && keptIds.has(id);
    });

  for (let a = 0; a < people.length; a += 1) {
    for (let b = a + 1; b < people.length; b += 1) {
      const [source, target] = [people[a], people[b]].sort();
      const id = `release-${release.id}-${source}-${target}`;
      if (edges.some((edge) => edge.id === id)) continue;
      edges.push({
        id,
        source,
        target,
        type: "collaboration",
        label: "recorded together",
        strength: 0.72,
        context: [release.label],
        sources: release.sources ?? [],
      });
    }
  }
}

const dataset = {
  version: 1,
  generatedAt: new Date().toISOString(),
  nodes,
  edges,
};

for (const outputPath of [browserOutputPath, approvedOutputPath]) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);
}

console.log(
  `Migrated ${nodes.length} nodes and ${edges.length} edges to ${browserOutputPath} and ${approvedOutputPath}.`,
);
