import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ORGANIZED_MAP_ZONES } from "./organize-graph-layout.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(brainRoot, "..");
const graphPath = path.join(brainRoot, "data", "approved", "graph.json");
const learningModelPath = path.join(brainRoot, "data", "approved", "learning-model.json");
const organizationModelPath = path.join(brainRoot, "data", "approved", "organization-model.json");
const approvedOutputPath = path.join(brainRoot, "data", "approved", "layouts.json");
const browserOutputPath = path.join(repoRoot, "site", "public", "data", "layouts.json");

const LAYOUTS = {
  organized: {
    label: "Map",
    description: "Current brain-organized map positions.",
  },
  genre: {
    label: "Genres",
    description: "Genre-led clusters with bridge nodes pulled toward related scenes.",
  },
  timeline: {
    label: "Timeline",
    description: "Older scenes left, newer scenes right, with zones kept as loose lanes.",
  },
  alphabetic: {
    label: "A-Z",
    description: "A simple training layout sorted by label.",
  },
  chaos: {
    label: "Chaos",
    description: "Seeded loose layout for stress-testing readable disorder.",
  },
};

const TYPE_ORDER = {
  genre: 0,
  guitarist: 1,
  artist: 2,
  band: 3,
  guitar_brand: 4,
  guitar: 5,
};

const ZONE_ORDER = [
  "roots-blues",
  "rock-circuit",
  "psychedelia-prog",
  "hard-rock-metal",
  "punk-alt",
  "hip-hop-rap",
  "folk-country-vise",
  "guitar-workshop",
];

const TIMELINE_ZONE_LANES = {
  "roots-blues": -520,
  "psychedelia-prog": -930,
  "rock-circuit": -150,
  "hard-rock-metal": 350,
  "punk-alt": 940,
  "hip-hop-rap": 1370,
  "folk-country-vise": 1730,
  "guitar-workshop": -1180,
};

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hashValue(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed) {
  return (hashValue(seed) % 100000) / 100000;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function compareByTypeEraLabel(learningModel) {
  return (a, b) => {
    const typeDiff = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
    if (typeDiff !== 0) return typeDiff;

    const eraDiff = inferEra(a, learningModel) - inferEra(b, learningModel);
    if (eraDiff !== 0) return eraDiff;

    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  };
}

function inferEra(node, learningModel) {
  const learned = learningModel?.nodes?.[node.id];
  if (Number.isFinite(node.eraStart)) return node.eraStart;
  if (Number.isFinite(learned?.eraStart)) return learned.eraStart;
  if (Number.isFinite(node.eraPeak)) return node.eraPeak;
  if (Number.isFinite(learned?.eraPeak)) return learned.eraPeak;

  const text = normalize([
    node.id,
    node.label,
    node.summary,
    ...(node.metadata ?? []),
    ...(node.primaryGenres ?? []),
    ...(node.curatorTags ?? []),
  ].join(" "));

  const directYear = text.match(/\b(19[2-9]\d|20[0-2]\d)\b/);
  if (directYear) return Number(directYear[1]);

  if (/robert johnson|lead belly|muddy waters|blues|swing|country/.test(text)) return 1948;
  if (/beatles|hendrix|cream|psychedelic|progressive|black sabbath|led zeppelin/.test(text)) return 1969;
  if (/punk|ramones|misfits|sex pistols|hard rock|heavy metal|van halen|judas priest/.test(text)) return 1978;
  if (/thrash|metallica|megadeth|hip hop|rap|g funk|gangsta/.test(text)) return 1988;
  if (/grunge|alternative|post grunge|nu metal|symphonic|gothic/.test(text)) return 1998;
  if (/kvelertak|beartooth|a wake in providence|modern/.test(text)) return 2010;

  return 1984;
}

function buildDegreeMap(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

function buildNeighborMap(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const neighbors = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    neighbors.get(edge.source)?.push(edge.target);
    neighbors.get(edge.target)?.push(edge.source);
  }
  return neighbors;
}

function innerBounds(zoneId) {
  const zone = ORGANIZED_MAP_ZONES[zoneId] ?? ORGANIZED_MAP_ZONES["rock-circuit"];
  return {
    minX: zone.x + 90,
    maxX: zone.x + zone.width - 90,
    minY: zone.y + 108,
    maxY: zone.y + zone.height - 90,
    width: zone.width - 180,
    height: zone.height - 198,
    centerX: zone.x + zone.width / 2,
    centerY: zone.y + zone.height / 2,
  };
}

function layoutPriority(node, degree) {
  const typeScore = node.type === "genre" ? 1 : node.starter ? 0.92 : 0.42;
  return Number(Math.min(1, typeScore + Math.min(0.45, (degree.get(node.id) ?? 0) * 0.045)).toFixed(3));
}

function toLayoutNode(node, x, y, degree) {
  return {
    x: Math.round(x),
    y: Math.round(y),
    zone: node.zone,
    priority: layoutPriority(node, degree),
  };
}

function connectedZonePull(node, nodeById, neighbors, learningModel) {
  const learned = learningModel?.nodes?.[node.id];
  const targets = new Map();

  for (const zone of learned?.secondaryZones ?? []) {
    if (ORGANIZED_MAP_ZONES[zone] && zone !== node.zone) {
      targets.set(zone, (targets.get(zone) ?? 0) + 1.2);
    }
  }

  for (const neighborId of neighbors.get(node.id) ?? []) {
    const neighbor = nodeById.get(neighborId);
    if (!neighbor?.zone || neighbor.zone === node.zone) continue;
    targets.set(neighbor.zone, (targets.get(neighbor.zone) ?? 0) + 0.35);
  }

  if (!targets.size) return undefined;

  let x = 0;
  let y = 0;
  let weight = 0;
  for (const [zone, value] of targets) {
    const bounds = innerBounds(zone);
    x += bounds.centerX * value;
    y += bounds.centerY * value;
    weight += value;
  }

  return weight ? { x: x / weight, y: y / weight, weight: Math.min(0.42, 0.12 + weight * 0.08) } : undefined;
}

function spreadInZone(nodes, zoneId, degree, learningModel, neighbors, nodeById, mode) {
  const bounds = innerBounds(zoneId);
  const sorted = [...nodes].sort(compareByTypeEraLabel(learningModel));
  const positions = new Map();
  const columns = Math.max(3, Math.ceil(Math.sqrt(sorted.length) * (mode === "genre" ? 1.28 : 1.05)));
  const rows = Math.max(1, Math.ceil(sorted.length / columns));
  const cellW = bounds.width / columns;
  const cellH = bounds.height / rows;

  sorted.forEach((node, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const hash = hashValue(`${mode}:${zoneId}:${node.id}`);
    const wave = Math.sin((index + (hash % 29)) * 0.77);
    const xJitter = (seededUnit(`${node.id}:x:${mode}`) - 0.5) * cellW * (mode === "chaos" ? 1.35 : 0.76);
    const yJitter = (seededUnit(`${node.id}:y:${mode}`) - 0.5) * cellH * (mode === "chaos" ? 1.2 : 0.72);
    let x = bounds.minX + cellW * (col + 0.5) + xJitter + wave * 28;
    let y = bounds.minY + cellH * (row + 0.5) + yJitter;

    if (node.type === "genre") y -= cellH * 0.22;
    if (mode !== "chaos") {
      const pull = connectedZonePull(node, nodeById, neighbors, learningModel);
      if (pull) {
        x += (pull.x - x) * pull.weight;
        y += (pull.y - y) * pull.weight;
      }
    }

    const bleed = mode === "genre" ? 240 : mode === "chaos" ? 460 : 120;
    positions.set(node.id, {
      node,
      x: clamp(x, bounds.minX - bleed, bounds.maxX + bleed),
      y: clamp(y, bounds.minY - bleed, bounds.maxY + bleed),
    });
  });

  return [...positions.values()];
}

function collisionRadius(node, mode) {
  const label = String(node.label ?? "");
  const base = node.type === "genre" ? 118 : node.type === "band" ? 94 : 86;
  const extra = Math.min(60, Math.max(0, label.length - 10) * 2.5);
  return (base + extra) * (mode === "chaos" ? 0.86 : 1);
}

function relaxPositions(items, mode, passes = 34) {
  for (let pass = 0; pass < passes; pass += 1) {
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const first = items[a];
        const second = items[b];
        const sameZone = first.node.zone === second.node.zone;
        const minDistance = (collisionRadius(first.node, mode) + collisionRadius(second.node, mode)) * (sameZone ? 0.86 : 0.52);
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);

        if (distance >= minDistance) continue;
        if (distance < 0.001) {
          const angle = (hashValue(`${first.node.id}:${second.node.id}:${mode}`) % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const push = (minDistance - distance) * (sameZone ? 0.09 : 0.045);
        const nx = dx / distance;
        const ny = dy / distance;
        first.x -= nx * push;
        first.y -= ny * push;
        second.x += nx * push;
        second.y += ny * push;
      }
    }
  }
}

function makeOrganizedLayout(nodes, degree) {
  const layoutNodes = {};
  for (const node of nodes) {
    layoutNodes[node.id] = toLayoutNode(node, node.x, node.y, degree);
  }
  return layoutNodes;
}

function makeGenreLayout(nodes, edges, degree, learningModel) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const neighbors = buildNeighborMap(nodes, edges);
  const byZone = new Map();
  for (const node of nodes) {
    const zone = node.zone && ORGANIZED_MAP_ZONES[node.zone] ? node.zone : "rock-circuit";
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(node);
  }

  const items = [];
  for (const zone of ZONE_ORDER) {
    items.push(...spreadInZone(byZone.get(zone) ?? [], zone, degree, learningModel, neighbors, nodeById, "genre"));
  }
  relaxPositions(items, "genre", 44);

  const layoutNodes = {};
  for (const item of items) {
    layoutNodes[item.node.id] = toLayoutNode(item.node, item.x, item.y, degree);
  }
  return layoutNodes;
}

function makeTimelineLayout(nodes, degree, learningModel) {
  const minYear = 1930;
  const maxYear = 2026;
  const minX = -2240;
  const maxX = 4300;
  const items = nodes.map((node) => {
    const era = clamp(inferEra(node, learningModel), minYear, maxYear);
    const t = (era - minYear) / (maxYear - minYear);
    const lane = TIMELINE_ZONE_LANES[node.zone] ?? 0;
    const degreeLift = Math.min(220, (degree.get(node.id) ?? 0) * 22);
    const hash = hashValue(`timeline:${node.id}`);
    const x = minX + t * (maxX - minX) + ((hash % 180) - 90);
    const y = lane + (((hash >>> 8) % 340) - 170) - degreeLift * 0.28;
    return { node, x, y };
  });

  relaxPositions(items, "timeline", 40);

  const layoutNodes = {};
  for (const item of items) {
    layoutNodes[item.node.id] = toLayoutNode(item.node, item.x, item.y, degree);
  }
  return layoutNodes;
}

function makeAlphabeticLayout(nodes, degree) {
  const sorted = [...nodes].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  const minX = -2260;
  const maxX = 4300;
  const columns = 16;
  const rowGap = 112;
  const colGap = (maxX - minX) / (columns - 1);
  const startY = -1220;
  const layoutNodes = {};

  sorted.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const letterOffset = normalize(node.label).charCodeAt(0) % 7;
    layoutNodes[node.id] = toLayoutNode(
      node,
      minX + col * colGap,
      startY + row * rowGap + letterOffset * 4,
      degree,
    );
  });

  return layoutNodes;
}

function makeChaosLayout(nodes, edges, degree, learningModel) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const neighbors = buildNeighborMap(nodes, edges);
  const byZone = new Map();
  for (const node of nodes) {
    const zone = node.zone && ORGANIZED_MAP_ZONES[node.zone] ? node.zone : "rock-circuit";
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(node);
  }

  const items = [];
  for (const zone of ZONE_ORDER) {
    items.push(...spreadInZone(byZone.get(zone) ?? [], zone, degree, learningModel, neighbors, nodeById, "chaos"));
  }
  relaxPositions(items, "chaos", 26);

  const layoutNodes = {};
  for (const item of items) {
    layoutNodes[item.node.id] = toLayoutNode(item.node, item.x, item.y, degree);
  }
  return layoutNodes;
}

const graph = readJson(graphPath);
const learningModel = readJson(learningModelPath, undefined);
const organizationModel = readJson(organizationModelPath, undefined);
const degree = buildDegreeMap(graph.nodes, graph.edges);
const generatedAt = new Date().toISOString();

const layouts = {
  organized: {
    id: "organized",
    ...LAYOUTS.organized,
    generatedAt,
    nodes: makeOrganizedLayout(graph.nodes, degree),
  },
  genre: {
    id: "genre",
    ...LAYOUTS.genre,
    generatedAt,
    nodes: makeGenreLayout(graph.nodes, graph.edges, degree, learningModel),
  },
  timeline: {
    id: "timeline",
    ...LAYOUTS.timeline,
    generatedAt,
    nodes: makeTimelineLayout(graph.nodes, degree, learningModel),
  },
  alphabetic: {
    id: "alphabetic",
    ...LAYOUTS.alphabetic,
    generatedAt,
    nodes: makeAlphabeticLayout(graph.nodes, degree),
  },
  chaos: {
    id: "chaos",
    ...LAYOUTS.chaos,
    generatedAt,
    nodes: makeChaosLayout(graph.nodes, graph.edges, degree, learningModel),
  },
};

const dataset = {
  version: 1,
  generatedAt,
  source: [
    "approved graph",
    learningModel ? "learning model" : undefined,
    organizationModel ? "organization model" : undefined,
  ].filter(Boolean).join(" + "),
  layouts,
};

for (const outputPath of [approvedOutputPath, browserOutputPath]) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);
}

console.log(
  `Generated ${Object.keys(layouts).length} layouts for ${graph.nodes.length} nodes to ${browserOutputPath} and ${approvedOutputPath}.`,
);
