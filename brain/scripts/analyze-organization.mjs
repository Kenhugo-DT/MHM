import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ORGANIZED_MAP_ZONES } from "./organize-graph-layout.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(brainRoot, "..");
const approvedGraphPath = path.join(brainRoot, "data", "approved", "graph.json");
const browserGraphPath = path.join(repoRoot, "site", "public", "data", "graph.json");
const learningModelPath = path.join(brainRoot, "data", "approved", "learning-model.json");
const organizationModelPath = path.join(brainRoot, "data", "approved", "organization-model.json");
const runsDir = path.join(brainRoot, "data", "runs");
const reportPath = path.join(runsDir, "organization-report.md");
const generatedRequestsPath = path.join(runsDir, "organization-frontier-requests.json");

const NODE_KIND_PRIORITY = {
  genre: 11,
  guitarist: 10,
  artist: 9,
  band: 8,
  guitar: 5,
  guitar_brand: 4,
};

const BLOCKED_SEED_LABELS = new Set(["bandcamp", "bandcamp daily"]);
const CATEGORYISH_GENRE_TERMS = /\b(duos|trios|quartets|groups|musicians|artists|bands|singers|songwriters|people|albums|songs|record labels|companies)\b/;

const ZONE_DESCRIPTIONS = {
  "roots-blues": "roots, blues, blues rock, early rock and Southern guitar lineage",
  "rock-circuit": "rock, classic rock, glam, funk and broad band history",
  "psychedelia-prog": "psychedelia, art rock, progressive rock and progressive metal bridges",
  "hard-rock-metal": "hard rock, metal, riff culture, virtuoso guitar and heavier scenes",
  "punk-alt": "punk, post-punk, alternative, indie, hardcore and adjacent scenes",
  "hip-hop-rap": "hip-hop, rap, G-funk, West Coast hip-hop and crossover links",
  "folk-country-vise": "folk, country, singer-songwriter, jazz, acoustic traditions and Norwegian vise",
  "guitar-workshop": "guitar models, guitar brands and instrument history",
};

function readJson(filePath, fallback = undefined) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-") || "frontier";
}

function median(values) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function quantile(values, q) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
}

function nodeRadius(node) {
  if (node.type === "genre") return 104;
  if (node.type === "band") return 82;
  if (node.type === "guitar" || node.type === "guitar_brand") return 82;
  return 68;
}

function sourceQuality(node) {
  const sources = Array.isArray(node.sources) ? node.sources : [];
  if (!sources.length) return 0;
  let score = Math.min(0.45, sources.length * 0.12);
  for (const source of sources) {
    const provider = normalize(source.provider);
    const url = normalize(source.url);
    if (["wikipedia", "wikidata", "wikimedia", "musicbrainz"].includes(provider)) score += 0.22;
    if (url.includes("wikipedia org") || url.includes("wikidata org") || url.includes("musicbrainz org")) score += 0.16;
  }
  return Math.min(1, score);
}

function mapById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function buildConnectionData(graph) {
  const nodeById = mapById(graph.nodes ?? []);
  const degree = new Map((graph.nodes ?? []).map((node) => [node.id, 0]));
  const weightedDegree = new Map((graph.nodes ?? []).map((node) => [node.id, 0]));
  const neighbors = new Map((graph.nodes ?? []).map((node) => [node.id, []]));
  const connectedZones = new Map((graph.nodes ?? []).map((node) => [node.id, new Map()]));
  const linkedGenres = new Map((graph.nodes ?? []).map((node) => [node.id, new Set()]));
  const edgesByZone = new Map();

  for (const edge of graph.edges ?? []) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;

    const strength = Number.isFinite(edge.strength) ? edge.strength : 0.5;
    degree.set(source.id, (degree.get(source.id) ?? 0) + 1);
    degree.set(target.id, (degree.get(target.id) ?? 0) + 1);
    weightedDegree.set(source.id, (weightedDegree.get(source.id) ?? 0) + strength);
    weightedDegree.set(target.id, (weightedDegree.get(target.id) ?? 0) + strength);
    neighbors.get(source.id)?.push({ node: target, edge, strength });
    neighbors.get(target.id)?.push({ node: source, edge, strength });

    const zoneKey = source.zone === target.zone ? source.zone : `${source.zone}->${target.zone}`;
    edgesByZone.set(zoneKey, (edgesByZone.get(zoneKey) ?? 0) + 1);

    if (source.zone && target.zone && source.zone !== target.zone) {
      connectedZones.get(source.id)?.set(target.zone, (connectedZones.get(source.id)?.get(target.zone) ?? 0) + strength);
      connectedZones.get(target.id)?.set(source.zone, (connectedZones.get(target.id)?.get(source.zone) ?? 0) + strength);
    }

    if (source.type === "genre" && target.type !== "genre") {
      linkedGenres.get(target.id)?.add(source.id);
    }
    if (target.type === "genre" && source.type !== "genre") {
      linkedGenres.get(source.id)?.add(target.id);
    }
  }

  return { nodeById, degree, weightedDegree, neighbors, connectedZones, linkedGenres, edgesByZone };
}

function zoneBounds(zoneId) {
  const zone = ORGANIZED_MAP_ZONES[zoneId];
  if (!zone) return undefined;
  return {
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    minX: zone.x,
    maxX: zone.x + zone.width,
    minY: zone.y,
    maxY: zone.y + zone.height,
    centerX: zone.x + zone.width / 2,
    centerY: zone.y + zone.height / 2,
  };
}

function overflowDistance(node) {
  const bounds = zoneBounds(node.zone);
  if (!bounds) return 0;
  const dx = node.x < bounds.minX ? bounds.minX - node.x : node.x > bounds.maxX ? node.x - bounds.maxX : 0;
  const dy = node.y < bounds.minY ? bounds.minY - node.y : node.y > bounds.maxY ? node.y - bounds.maxY : 0;
  return Math.round(Math.hypot(dx, dy));
}

function overlapAnalysis(nodes) {
  const risks = [];
  const counts = new Map(nodes.map((node) => [node.id, 0]));

  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const first = nodes[a];
      const second = nodes[b];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const threshold = (nodeRadius(first) + nodeRadius(second)) * (first.zone === second.zone ? 0.72 : 0.5);
      if (distance >= threshold) continue;
      const severity = Number(((threshold - distance) / threshold).toFixed(3));
      risks.push({
        source: first.id,
        target: second.id,
        sourceLabel: first.label,
        targetLabel: second.label,
        zone: first.zone === second.zone ? first.zone : "cross-zone",
        distance: Math.round(distance),
        severity,
      });
      counts.set(first.id, (counts.get(first.id) ?? 0) + 1);
      counts.set(second.id, (counts.get(second.id) ?? 0) + 1);
    }
  }

  risks.sort((a, b) => b.severity - a.severity || a.sourceLabel.localeCompare(b.sourceLabel, "en"));
  return { risks, counts };
}

function eraFor(node, learned) {
  const year = node.eraStart ?? learned?.eraStart ?? node.eraPeak ?? learned?.eraPeak;
  return Number.isFinite(year) ? year : undefined;
}

function analyzeGraph(graph, learningModel) {
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  const connections = buildConnectionData(graph);
  const overlaps = overlapAnalysis(nodes);
  const nodeAnalysis = {};
  const zones = {};

  for (const zoneId of Object.keys(ORGANIZED_MAP_ZONES)) {
    zones[zoneId] = {
      label: ORGANIZED_MAP_ZONES[zoneId].label,
      description: ZONE_DESCRIPTIONS[zoneId] ?? zoneId,
      nodes: [],
      edgesInternal: 0,
      edgesCrossing: 0,
      isolatedNodes: [],
      underConnectedImportantNodes: [],
      bridgeNodes: [],
      topHubs: [],
      overlapRisk: 0,
      overflowNodes: [],
      eraMedian: undefined,
      averageDegree: 0,
      averageSourceQuality: 0,
      needsAttentionScore: 0,
    };
  }

  for (const [key, count] of connections.edgesByZone.entries()) {
    if (zones[key]) zones[key].edgesInternal += count;
    if (key.includes("->")) {
      const [sourceZone, targetZone] = key.split("->");
      if (zones[sourceZone]) zones[sourceZone].edgesCrossing += count;
      if (zones[targetZone]) zones[targetZone].edgesCrossing += count;
    }
  }

  for (const node of nodes) {
    const learned = learningModel?.nodes?.[node.id] ?? {};
    const degree = connections.degree.get(node.id) ?? 0;
    const weightedDegree = Number((connections.weightedDegree.get(node.id) ?? 0).toFixed(3));
    const secondaryZones = [
      ...(learned.secondaryZones ?? []),
      ...[...(connections.connectedZones.get(node.id) ?? new Map()).keys()],
    ].filter((zone) => zone && zone !== node.zone);
    const uniqueSecondaryZones = [...new Set(secondaryZones)];
    const bridgeScore = Math.min(
      1,
      Number(learned.bridgeScore ?? 0) +
        uniqueSecondaryZones.length * 0.1 +
        Math.min(0.35, (connections.linkedGenres.get(node.id)?.size ?? 0) * 0.05),
    );
    const hubScore = Math.min(1, Number(learned.hubScore ?? 0) + Math.min(0.45, degree / 24));
    const overlapCount = overlaps.counts.get(node.id) ?? 0;
    const overflow = overflowDistance(node);
    const sourceScore = sourceQuality(node);
    const era = eraFor(node, learned);
    const isolated = degree === 0;
    const important = Boolean(node.starter || node.type === "genre" || hubScore >= 0.45 || bridgeScore >= 0.35);
    const recommendedActions = [];

    if (isolated) recommendedActions.push("research-first-connections");
    if (important && degree <= 2) recommendedActions.push("expand-important-node");
    if (uniqueSecondaryZones.length) recommendedActions.push("preserve-cross-zone-bridge");
    if (overlapCount >= 3) recommendedActions.push("spread-local-neighborhood");
    if (overflow > 0) recommendedActions.push("review-zone-bleed");
    if (sourceScore < 0.45) recommendedActions.push("improve-source-quality");

    nodeAnalysis[node.id] = {
      id: node.id,
      label: node.label,
      type: node.type,
      zone: node.zone,
      degree,
      weightedDegree,
      era,
      sourceQuality: Number(sourceScore.toFixed(3)),
      hubScore: Number(hubScore.toFixed(3)),
      bridgeScore: Number(bridgeScore.toFixed(3)),
      secondaryZones: uniqueSecondaryZones,
      linkedGenres: [...(connections.linkedGenres.get(node.id) ?? [])],
      overlapCount,
      overflow,
      recommendedActions,
    };

    if (!zones[node.zone]) {
      zones[node.zone] = {
        label: node.zone,
        description: node.zone,
        nodes: [],
        edgesInternal: 0,
        edgesCrossing: 0,
        isolatedNodes: [],
        underConnectedImportantNodes: [],
        bridgeNodes: [],
        topHubs: [],
        overlapRisk: 0,
        overflowNodes: [],
        eraMedian: undefined,
        averageDegree: 0,
        averageSourceQuality: 0,
        needsAttentionScore: 0,
      };
    }

    const zone = zones[node.zone];
    zone.nodes.push(node.id);
    if (isolated) zone.isolatedNodes.push(node.id);
    if (important && degree <= 2) zone.underConnectedImportantNodes.push(node.id);
    if (bridgeScore >= 0.34 || uniqueSecondaryZones.length >= 2) zone.bridgeNodes.push(node.id);
    if (hubScore >= 0.34 || node.starter || node.type === "genre") zone.topHubs.push(node.id);
    zone.overlapRisk += overlapCount;
    if (overflow > 0) zone.overflowNodes.push(node.id);
  }

  for (const zone of Object.values(zones)) {
    const zoneNodes = zone.nodes.map((id) => nodeAnalysis[id]).filter(Boolean);
    const degrees = zoneNodes.map((node) => node.degree);
    const eras = zoneNodes.map((node) => node.era).filter(Number.isFinite);
    const sourceScores = zoneNodes.map((node) => node.sourceQuality);
    zone.nodeCount = zone.nodes.length;
    zone.averageDegree = Number((degrees.reduce((sum, value) => sum + value, 0) / Math.max(1, degrees.length)).toFixed(2));
    zone.degreeP25 = quantile(degrees, 0.25) ?? 0;
    zone.eraMedian = median(eras);
    zone.averageSourceQuality = Number((sourceScores.reduce((sum, value) => sum + value, 0) / Math.max(1, sourceScores.length)).toFixed(3));
    zone.isolatedNodes = zone.isolatedNodes
      .sort((a, b) => nodeAnalysis[a].label.localeCompare(nodeAnalysis[b].label, "en"))
      .slice(0, 20);
    zone.underConnectedImportantNodes = zone.underConnectedImportantNodes
      .sort((a, b) => {
        const first = nodeAnalysis[a];
        const second = nodeAnalysis[b];
        return second.hubScore + second.bridgeScore - (first.hubScore + first.bridgeScore);
      })
      .slice(0, 20);
    zone.bridgeNodes = zone.bridgeNodes
      .sort((a, b) => nodeAnalysis[b].bridgeScore - nodeAnalysis[a].bridgeScore)
      .slice(0, 20);
    zone.topHubs = zone.topHubs
      .sort((a, b) => nodeAnalysis[b].hubScore - nodeAnalysis[a].hubScore)
      .slice(0, 20);
    zone.overflowNodes = zone.overflowNodes
      .sort((a, b) => nodeAnalysis[b].overflow - nodeAnalysis[a].overflow)
      .slice(0, 20);
    zone.needsAttentionScore = Number((
      zone.isolatedNodes.length * 2.2 +
      zone.underConnectedImportantNodes.length * 2.8 +
      zone.bridgeNodes.length * 0.8 +
      Math.min(30, zone.overlapRisk * 0.38) +
      Math.max(0, 0.68 - zone.averageSourceQuality) * 18 +
      Math.max(0, 2.4 - zone.averageDegree) * 5
    ).toFixed(2));
  }

  const recommendedResearchRequests = buildRecommendedRequests(zones, nodeAnalysis);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "approved graph + learning model + layout analysis",
    graph: {
      nodes: nodes.length,
      edges: edges.length,
      generatedAt: graph.generatedAt,
    },
    layoutPolicy: {
      target: "organized chaos",
      notes: [
        "Zones are guidance, not cages.",
        "Bridge nodes may bleed toward secondary zones.",
        "Dense genre clusters should use local constellation spacing rather than rows.",
        "Research should prioritize isolated hubs, bridge nodes and zones with low average source quality.",
      ],
    },
    zones,
    nodes: nodeAnalysis,
    issues: {
      overlapRisks: overlaps.risks.slice(0, 80),
      isolatedNodes: Object.values(nodeAnalysis)
        .filter((node) => node.degree === 0)
        .sort((a, b) => b.hubScore + b.bridgeScore - (a.hubScore + a.bridgeScore))
        .slice(0, 80)
        .map((node) => node.id),
      underConnectedImportantNodes: Object.values(nodeAnalysis)
        .filter((node) => node.recommendedActions.includes("expand-important-node"))
        .sort((a, b) => b.hubScore + b.bridgeScore - (a.hubScore + a.bridgeScore))
        .slice(0, 80)
        .map((node) => node.id),
    },
    recommendedResearchRequests,
  };
}

function seedFor(node) {
  return {
    name: node.label,
    kind: node.type,
  };
}

function isActionableSeedNode(node) {
  const label = normalize(node.label);
  if (!label || BLOCKED_SEED_LABELS.has(label)) return false;

  if (node.type === "genre") {
    if (label.startsWith("history of ")) return false;
    if (CATEGORYISH_GENRE_TERMS.test(label)) return false;
  }

  return true;
}

function scoreSeed(node) {
  return (
    (NODE_KIND_PRIORITY[node.type] ?? 1) * 5 +
    (node.recommendedActions.includes("expand-important-node") ? 22 : 0) +
    (node.recommendedActions.includes("research-first-connections") ? 16 : 0) +
    node.bridgeScore * 14 +
    node.hubScore * 12 +
    Math.max(0, 3 - node.degree) * 5 +
    (node.sourceQuality < 0.45 ? 5 : 0)
  );
}

function buildRecommendedRequests(zones, nodeAnalysis) {
  const requests = [];
  const sortedZones = Object.entries(zones)
    .filter(([, zone]) => zone.nodeCount > 0)
    .sort((a, b) => b[1].needsAttentionScore - a[1].needsAttentionScore)
    .slice(0, 5);

  for (const [zoneId, zone] of sortedZones) {
    const candidates = [
      ...zone.underConnectedImportantNodes,
      ...zone.isolatedNodes,
      ...zone.bridgeNodes,
      ...zone.topHubs,
    ]
      .map((id) => nodeAnalysis[id])
      .filter(Boolean);
    const seen = new Set();
    const seeds = candidates
      .sort((a, b) => scoreSeed(b) - scoreSeed(a) || a.label.localeCompare(b.label, "en"))
      .filter((node) => {
        if (seen.has(node.id)) return false;
        seen.add(node.id);
        return isActionableSeedNode(node);
      })
      .slice(0, 8)
      .map(seedFor);

    if (!seeds.length) continue;

    const title = `Organize ${zone.label || zoneId} frontier`;
    requests.push({
      id: `organization-${slugify(zoneId)}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
      title,
      status: "queued",
      priority: Math.max(50, Math.min(90, Math.round(52 + zone.needsAttentionScore))),
      scope: seeds.some((seed) => seed.kind === "guitar" || seed.kind === "guitar_brand")
        ? "guitar_history"
        : "artist_network",
      createdAt: new Date().toISOString(),
      instructions: [
        `Expand and clarify the ${zone.label || zoneId} part of Music History Map.`,
        `Current organization signal: ${ZONE_DESCRIPTIONS[zoneId] ?? zoneId}.`,
        "Prioritize documented music-related connections that help layout organization: associated genres, shared members, collaborations, influences, instruments and clear bridges to neighboring zones.",
        "Use albums, songs and releases only as context for edges. Do not create release/song nodes.",
        "Only propose node types allowed by MHM: band, guitarist, artist, guitar, guitar_brand and genre.",
      ].join(" "),
      seeds,
      limits: {
        maxSeeds: seeds.length,
        maxCandidates: 70,
      },
      notes: `Generated by brain:organize. Needs-attention score ${zone.needsAttentionScore}.`,
    });
  }

  return requests;
}

function writeReport(model) {
  const lines = [
    "# MHM Organization Report",
    "",
    `Generated: ${model.generatedAt}`,
    "",
    "## Intent",
    "",
    "This is the first deterministic organization layer for the MHM brain. It does not invent facts and it does not move the map by itself. It reads the approved graph, the learning model and the current layout, then produces signals the scout and future layout modes can use.",
    "",
    "## Map Health",
    "",
    `- Nodes: ${model.graph.nodes}`,
    `- Edges: ${model.graph.edges}`,
    `- Isolated nodes flagged: ${model.issues.isolatedNodes.length}`,
    `- Under-connected important nodes: ${model.issues.underConnectedImportantNodes.length}`,
    `- Overlap risks sampled: ${model.issues.overlapRisks.length}`,
    "",
    "## Zone Priorities",
    "",
  ];

  for (const [zoneId, zone] of Object.entries(model.zones)
    .filter(([, zone]) => zone.nodeCount > 0)
    .sort((a, b) => b[1].needsAttentionScore - a[1].needsAttentionScore)) {
    lines.push(`### ${zone.label || zoneId}`, "");
    lines.push(`- Needs-attention score: ${zone.needsAttentionScore}`);
    lines.push(`- Nodes: ${zone.nodeCount}`);
    lines.push(`- Average degree: ${zone.averageDegree}`);
    lines.push(`- Average source quality: ${zone.averageSourceQuality}`);
    lines.push(`- Isolated: ${zone.isolatedNodes.length ? zone.isolatedNodes.slice(0, 8).join(", ") : "none"}`);
    lines.push(`- Under-connected important: ${zone.underConnectedImportantNodes.length ? zone.underConnectedImportantNodes.slice(0, 8).join(", ") : "none"}`);
    lines.push(`- Bridge nodes: ${zone.bridgeNodes.length ? zone.bridgeNodes.slice(0, 8).join(", ") : "none"}`);
    lines.push("");
  }

  lines.push("## Generated Frontier Requests", "");
  for (const request of model.recommendedResearchRequests) {
    lines.push(`### ${request.title}`, "");
    lines.push(`- Request id: ${request.id}`);
    lines.push(`- Priority: ${request.priority}`);
    lines.push(`- Seeds: ${request.seeds.map((seed) => `${seed.name}:${seed.kind}`).join(", ")}`);
    lines.push("");
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

function main() {
  const quiet = process.argv.includes("--quiet");
  const graphPath = fs.existsSync(approvedGraphPath) ? approvedGraphPath : browserGraphPath;
  const graph = readJson(graphPath);
  const learningModel = readJson(learningModelPath, {});
  const model = analyzeGraph(graph, learningModel);

  writeJson(organizationModelPath, model);
  writeJson(generatedRequestsPath, {
    version: 1,
    generatedAt: model.generatedAt,
    requests: model.recommendedResearchRequests,
  });
  writeReport(model);

  if (!quiet) {
    console.log(JSON.stringify({
      organizationModelPath: path.relative(repoRoot, organizationModelPath).replace(/\\/g, "/"),
      reportPath: path.relative(repoRoot, reportPath).replace(/\\/g, "/"),
      generatedRequestsPath: path.relative(repoRoot, generatedRequestsPath).replace(/\\/g, "/"),
      graph: model.graph,
      topZones: Object.entries(model.zones)
        .filter(([, zone]) => zone.nodeCount > 0)
        .sort((a, b) => b[1].needsAttentionScore - a[1].needsAttentionScore)
        .slice(0, 5)
        .map(([id, zone]) => ({ id, score: zone.needsAttentionScore, nodes: zone.nodeCount })),
      recommendedRequests: model.recommendedResearchRequests.map((request) => ({
        id: request.id,
        title: request.title,
        seeds: request.seeds.length,
      })),
    }, null, 2));
  }
}

main();
