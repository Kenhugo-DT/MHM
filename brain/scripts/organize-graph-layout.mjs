const ZONE_LAYOUTS = {
  "roots-blues": {
    label: "ROOTS / BLUES",
    x: -1800,
    y: -520,
    width: 1080,
    height: 930,
    columns: 4,
    colGap: 205,
    rowGap: 118,
  },
  "rock-circuit": {
    label: "ROCK CIRCUIT",
    x: -840,
    y: -440,
    width: 1500,
    height: 1560,
    columns: 5,
    colGap: 205,
    rowGap: 98,
  },
  "psychedelia-prog": {
    label: "PSYCHEDELIA / PROG",
    x: -700,
    y: -1180,
    width: 1650,
    height: 720,
    columns: 6,
    colGap: 220,
    rowGap: 116,
  },
  "hard-rock-metal": {
    label: "HARD ROCK / METAL",
    x: 420,
    y: -620,
    width: 2380,
    height: 1760,
    columns: 8,
    colGap: 235,
    rowGap: 98,
  },
  "punk-alt": {
    label: "PUNK / ALTERNATIVE",
    x: 80,
    y: 980,
    width: 2100,
    height: 920,
    columns: 6,
    colGap: 225,
    rowGap: 112,
  },
  "folk-country-vise": {
    label: "FOLK / COUNTRY / VISE",
    x: -1780,
    y: 880,
    width: 1800,
    height: 980,
    columns: 5,
    colGap: 225,
    rowGap: 118,
  },
  "guitar-workshop": {
    label: "GUITAR WORKSHOP",
    x: 2580,
    y: -760,
    width: 1300,
    height: 1710,
    columns: 5,
    colGap: 220,
    rowGap: 116,
  },
};

const ZONE_PRIORITY = [
  "guitar-workshop",
  "roots-blues",
  "folk-country-vise",
  "punk-alt",
  "hard-rock-metal",
  "psychedelia-prog",
  "rock-circuit",
];

const ZONE_TERMS = {
  "roots-blues": [
    "albert king",
    "b.b. king",
    "bb king",
    "blues",
    "blues rock",
    "buddy guy",
    "chuck berry",
    "delta blues",
    "dickey betts",
    "duane allman",
    "electric blues",
    "freddie king",
    "lead belly",
    "muddy waters",
    "rhythm and blues",
    "robert johnson",
    "rockabilly",
    "slide guitar",
    "southern rock",
    "stray cats",
  ],
  "folk-country-vise": [
    "acoustic",
    "alf cranner",
    "bluegrass",
    "bob dylan",
    "chet atkins",
    "country",
    "django",
    "fingerpicking",
    "flamenco",
    "folk",
    "gitarkameratene",
    "jan eggum",
    "jazz",
    "jazz fusion",
    "john mclaughlin",
    "johnny cash",
    "lillebjørn",
    "norwegian vise",
    "oystein sunde",
    "paco de lucía",
    "singer-songwriter",
    "vise",
    "wes montgomery",
    "willie nelson",
    "øystein sunde",
  ],
  "punk-alt": [
    "afi",
    "alternative",
    "bad religion",
    "black flag",
    "black president",
    "blondie",
    "germs",
    "hardcore punk",
    "horror punk",
    "indie rock",
    "kvelertak",
    "misfits",
    "post-punk",
    "punk",
    "punk rock",
    "ramones",
    "shoegaze",
    "suicidal tendencies",
    "the good the bad and the zugly",
  ],
  "hard-rock-metal": [
    "accept",
    "ac/dc",
    "acdc",
    "annihilator",
    "anthrax",
    "apocalyptica",
    "avenged sevenfold",
    "bathory",
    "black sabbath",
    "body count",
    "caliban",
    "carcass",
    "death metal",
    "dio",
    "doom metal",
    "edguy",
    "gamma ray",
    "ghost",
    "gojira",
    "guns n' roses",
    "hard rock",
    "heavy metal",
    "helloween",
    "iron maiden",
    "judas priest",
    "kvelertak",
    "led zeppelin",
    "megadeth",
    "metal",
    "metallica",
    "ozzy osbourne",
    "pantera",
    "power metal",
    "primal fear",
    "rob halford",
    "savatage",
    "sebastian bach",
    "skid row",
    "slash",
    "speed metal",
    "thrash",
    "thrash metal",
    "tony iommi",
    "van halen",
  ],
  "psychedelia-prog": [
    "art rock",
    "david gilmour",
    "dream theater",
    "frank zappa",
    "jimi hendrix",
    "king crimson",
    "mike portnoy",
    "pink floyd",
    "prog",
    "progressive",
    "progressive metal",
    "progressive rock",
    "psychedelic",
    "rush",
    "space rock",
    "the beatles",
    "yes",
  ],
  "rock-circuit": [
    "beatles",
    "cream",
    "dire straits",
    "elvis",
    "funk",
    "glam",
    "jeff beck",
    "mark knopfler",
    "prince",
    "queen",
    "rock",
    "rolling stones",
    "santana",
    "the who",
    "yardbirds",
  ],
};

const LANE_ORDER = {
  genre: 0,
  guitar_brand: 0,
  guitarist: 1,
  artist: 1,
  guitar: 1,
  band: 2,
};

const ERA_HINTS = [
  [/robert johnson|lead belly|sister rosetta|muddy waters|b\.b\. king|bb king|chuck berry|rockabilly|blues|folk|country/, 1935],
  [/beatles|yardbirds|cream|hendrix|pink floyd|black sabbath|led zeppelin|deep purple|rolling stones|the who|santana|hard rock|heavy metal|prog|psychedelic/, 1968],
  [/punk|ramones|misfits|judas priest|iron maiden|van halen|ac\/dc|metallica|megadeth|thrash|doom|post-punk|new wave/, 1982],
  [/grunge|alternative|dream theater|progressive metal|pantera|black metal|death metal|power metal|symphonic|gothic/, 1994],
  [/kvelertak|gojira|beartooth|atreyu|all that remains|a wake in providence|caliban/, 2010],
];

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hashValue(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function textForNode(node, edgeTextByNode) {
  return normalize([
    node.id,
    node.label,
    node.type,
    node.zone,
    node.summary,
    node.eraStart,
    node.eraPeak,
    ...(node.metadata ?? []),
    ...(node.aliases ?? []),
    ...(node.primaryGenres ?? []),
    ...(node.curatorTags ?? []),
    ...(edgeTextByNode.get(node.id) ?? []),
  ].join(" "));
}

function inferEra(node, text, learningModel) {
  const learned = learningModel?.nodes?.[node.id];
  if (Number.isFinite(node.eraStart)) return node.eraStart;
  if (Number.isFinite(learned?.eraStart)) return learned.eraStart;
  if (Number.isFinite(node.eraPeak)) return node.eraPeak;
  if (Number.isFinite(learned?.eraPeak)) return learned.eraPeak;

  const directYears = [...text.matchAll(/\b(19[2-9]\d|20[0-2]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1920 && year <= 2026);

  if (directYears.length) return Math.min(...directYears);

  for (const [pattern, year] of ERA_HINTS) {
    if (pattern.test(text)) return year;
  }

  return 1988;
}

function scoreZone(text, zone, learningModel) {
  const terms = ZONE_TERMS[zone] ?? [];
  let score = terms.reduce((total, term) => {
    const normalized = normalize(term);
    if (!normalized) return total;
    if (text.includes(normalized)) return total + Math.max(2, normalized.split(" ").length + 1);
    return total;
  }, 0);

  for (const item of learningModel?.zones?.[zone]?.learnedTerms ?? []) {
    const normalized = normalize(item.term);
    if (!normalized || !text.includes(normalized)) continue;
    score += Math.min(6, Math.max(0.5, Number(item.weight) * 0.35));
  }

  return score;
}

function zoneForNode(node, edgeTextByNode, learningModel) {
  if (node.type === "guitar" || node.type === "guitar_brand") return "guitar-workshop";
  if (node.layoutHints?.preferredZone && ZONE_LAYOUTS[node.layoutHints.preferredZone]) {
    return node.layoutHints.preferredZone;
  }
  if (learningModel?.nodes?.[node.id]?.zone && ZONE_LAYOUTS[learningModel.nodes[node.id].zone]) {
    return learningModel.nodes[node.id].zone;
  }

  const text = textForNode(node, edgeTextByNode);
  let bestZone = "rock-circuit";
  let bestScore = -1;

  for (const zone of ZONE_PRIORITY.filter((candidate) => candidate !== "guitar-workshop")) {
    const score = scoreZone(text, zone, learningModel) + (node.zone === zone ? 1 : 0);
    if (score > bestScore) {
      bestZone = zone;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestZone : "rock-circuit";
}

function buildEdgeText(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edgeTextByNode = new Map();

  function push(id, value) {
    if (!edgeTextByNode.has(id)) edgeTextByNode.set(id, []);
    edgeTextByNode.get(id).push(value);
  }

  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const edgeText = [edge.type, edge.label, ...(edge.context ?? [])].join(" ");
    push(edge.source, `${target.label} ${target.type} ${edgeText}`);
    push(edge.target, `${source.label} ${source.type} ${edgeText}`);
  }

  return edgeTextByNode;
}

function compareNodes(edgeTextByNode, learningModel) {
  return (a, b) => {
    const laneDiff = (LANE_ORDER[a.type] ?? 3) - (LANE_ORDER[b.type] ?? 3);
    if (laneDiff !== 0) return laneDiff;

    const eraDiff =
      inferEra(a, textForNode(a, edgeTextByNode), learningModel) -
      inferEra(b, textForNode(b, edgeTextByNode), learningModel);
    if (eraDiff !== 0) return eraDiff;

    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function innerBounds(zone) {
  const layout = ZONE_LAYOUTS[zone] ?? ZONE_LAYOUTS["rock-circuit"];
  return {
    minX: layout.x + 92,
    maxX: layout.x + layout.width - 92,
    minY: layout.y + 104,
    maxY: layout.y + layout.height - 88,
  };
}

function zoneCenter(zone) {
  const layout = ZONE_LAYOUTS[zone] ?? ZONE_LAYOUTS["rock-circuit"];
  return {
    x: layout.x + layout.width / 2,
    y: layout.y + layout.height / 2,
  };
}

function bridgeScoreForNode(node, connectedZones, learningModel) {
  const learned = learningModel?.nodes?.[node.id];
  const learnedBridge = Number.isFinite(learned?.bridgeScore) ? learned.bridgeScore : 0;
  const secondaryCount = Array.isArray(learned?.secondaryZones) ? learned.secondaryZones.length : 0;
  const connectedCount = [...(connectedZones.get(node.id) ?? new Map()).keys()]
    .filter((zone) => zone && zone !== node.zone).length;
  return Math.min(1, learnedBridge + secondaryCount * 0.08 + connectedCount * 0.1);
}

function looseBounds(zone, node, connectedZones, learningModel) {
  const base = innerBounds(zone);
  const score = node ? bridgeScoreForNode(node, connectedZones, learningModel) : 0;
  const layout = ZONE_LAYOUTS[zone] ?? ZONE_LAYOUTS["rock-circuit"];
  const baseBleed = zone === "guitar-workshop" ? 80 : 150;
  const bleed = Math.min(Math.max(layout.width, layout.height) * 0.22, baseBleed + score * 330);

  return {
    minX: base.minX - bleed,
    maxX: base.maxX + bleed,
    minY: base.minY - bleed,
    maxY: base.maxY + bleed,
  };
}

function pointFor(zone, x, y) {
  const bounds = innerBounds(zone);
  return {
    x: Math.round(clamp(x, bounds.minX, bounds.maxX)),
    y: Math.round(clamp(y, bounds.minY, bounds.maxY)),
  };
}

function loosePointFor(zone, node, x, y, connectedZones, learningModel) {
  const bounds = looseBounds(zone, node, connectedZones, learningModel);
  return {
    x: Math.round(clamp(x, bounds.minX, bounds.maxX)),
    y: Math.round(clamp(y, bounds.minY, bounds.maxY)),
  };
}

function pinnedPoint(node, zone) {
  if (!node.layoutHints?.pinned) return undefined;
  if (!Number.isFinite(node.layoutHints.x) || !Number.isFinite(node.layoutHints.y)) return undefined;
  return pointFor(zone, node.layoutHints.x, node.layoutHints.y);
}

function connectionMaps(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const genreLinks = new Map(nodes.map((node) => [node.id, []]));
  const connectedZones = new Map(nodes.map((node) => [node.id, new Map()]));

  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;

    if (source.zone && target.zone && source.zone !== target.zone) {
      connectedZones.get(source.id)?.set(target.zone, (connectedZones.get(source.id)?.get(target.zone) ?? 0) + 1);
      connectedZones.get(target.id)?.set(source.zone, (connectedZones.get(target.id)?.get(source.zone) ?? 0) + 1);
    }

    if (source.type === "genre" && target.type !== "genre") {
      genreLinks.get(target.id)?.push(source.id);
    } else if (target.type === "genre" && source.type !== "genre") {
      genreLinks.get(source.id)?.push(target.id);
    }
  }

  return { genreLinks, connectedZones };
}

function makeAnchors(zone, hubs, edgeTextByNode, learningModel) {
  const layout = ZONE_LAYOUTS[zone] ?? ZONE_LAYOUTS["rock-circuit"];
  const bounds = innerBounds(zone);
  const anchorBounds = {
    minX: bounds.minX + Math.min(180, layout.width * 0.13),
    maxX: bounds.maxX - Math.min(180, layout.width * 0.13),
    minY: bounds.minY + Math.min(130, layout.height * 0.12),
    maxY: bounds.maxY - Math.min(170, layout.height * 0.15),
  };
  const sorted = [...hubs].sort(compareNodes(edgeTextByNode, learningModel));
  const anchors = new Map();
  const spreadY = Math.min(360, layout.height * 0.34);
  const baseY = bounds.minY + layout.height * 0.28;
  const phase = (hashValue(zone) % 90) / 90;

  sorted.forEach((hub, index) => {
    const t = sorted.length === 1 ? 0.5 : (index + 0.62) / (sorted.length + 0.24);
    const wobble = Math.sin((t + phase) * Math.PI * 2.2) * spreadY * 0.36;
    const stepDown = (index % 4) * 44;
    const jitter = hashValue(`${zone}:${hub.id}:anchor`);
    anchors.set(
      hub.id,
      pointFor(
        zone,
        anchorBounds.minX + t * (anchorBounds.maxX - anchorBounds.minX) + ((jitter % 71) - 35),
        clamp(
          baseY + wobble + stepDown + (((jitter >>> 8) % 39) - 19),
          anchorBounds.minY,
          anchorBounds.maxY,
        ),
      ),
    );
  });

  return anchors;
}

function fallbackAnchor(zone, index, total) {
  const bounds = innerBounds(zone);
  const t = total <= 1 ? 0.5 : index / (total - 1);
  return pointFor(
    zone,
    bounds.minX + t * (bounds.maxX - bounds.minX),
    bounds.minY + (bounds.maxY - bounds.minY) * (0.42 + (index % 3) * 0.12),
  );
}

function chooseHub(node, hubs, genreLinks, edgeTextByNode, learningModel) {
  if (!hubs.length) return undefined;

  const hubIds = new Set(hubs.map((hub) => hub.id));
  const directGenre = (genreLinks.get(node.id) ?? []).find((id) => hubIds.has(id));
  if (directGenre) return directGenre;

  const text = textForNode(node, edgeTextByNode);
  let best = hubs[hashValue(node.id) % hubs.length];
  let bestScore = -1;

  for (const hub of hubs) {
    const score =
      scoreZone(`${text} ${normalize(hub.label)}`, node.zone, learningModel) +
      (text.includes(normalize(hub.label)) ? 8 : 0);
    if (score > bestScore) {
      best = hub;
      bestScore = score;
    }
  }

  return best.id;
}

function placeAroundAnchor(zone, anchor, node, index, total) {
  const bounds = innerBounds(zone);
  const hash = hashValue(`${zone}:${node.id}:organic`);
  const goldenAngle = 2.399963229728653;
  const ringSize = zone === "hard-rock-metal" ? 8 : 7;
  const ring = Math.floor(index / ringSize);
  const localIndex = index % ringSize;
  const angle = localIndex * goldenAngle + ring * 0.58 + (hash % 360) * Math.PI / 180;
  const density = Math.max(0, total - 5);
  const rawRadius = 95 + ring * 72 + Math.min(82, density * 2.2) + ((hash >>> 7) % 28);
  const maxRadius = Math.max(
    92,
    Math.min(
      anchor.x - bounds.minX,
      bounds.maxX - anchor.x,
      anchor.y - bounds.minY,
      bounds.maxY - anchor.y,
    ) * 0.86,
  );
  const radius = Math.min(rawRadius, maxRadius);
  const typeDrift = node.type === "band" ? 34 : node.type === "artist" ? 8 : -10;
  const xScale = zone === "hard-rock-metal" ? 1.08 : zone === "psychedelia-prog" ? 1.12 : 1;
  const yScale = zone === "punk-alt" ? 0.88 : 1;

  return pointFor(
    zone,
    anchor.x + Math.cos(angle) * radius * xScale,
    anchor.y + Math.sin(angle) * radius * yScale + typeDrift,
  );
}

function collisionRadius(node) {
  if (node.type === "genre") return 92;
  if (node.type === "band") return 74;
  if (node.type === "guitar" || node.type === "guitar_brand") return 76;
  return 62;
}

function relaxZone(zone, zoneNodes) {
  const bounds = innerBounds(zone);

  for (let pass = 0; pass < 42; pass += 1) {
    for (let a = 0; a < zoneNodes.length; a += 1) {
      for (let b = a + 1; b < zoneNodes.length; b += 1) {
        const first = zoneNodes[a];
        const second = zoneNodes[b];
        const minDistance = collisionRadius(first) + collisionRadius(second);
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);

        if (distance >= minDistance) continue;

        if (distance < 0.001) {
          const angle = (hashValue(`${first.id}:${second.id}`) % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const push = (minDistance - distance) * 0.23;
        const nx = dx / distance;
        const ny = dy / distance;
        const firstPinned = Boolean(pinnedPoint(first, zone));
        const secondPinned = Boolean(pinnedPoint(second, zone));

        if (!firstPinned && !secondPinned) {
          first.x = clamp(first.x - nx * push, bounds.minX, bounds.maxX);
          first.y = clamp(first.y - ny * push, bounds.minY, bounds.maxY);
          second.x = clamp(second.x + nx * push, bounds.minX, bounds.maxX);
          second.y = clamp(second.y + ny * push, bounds.minY, bounds.maxY);
        } else if (!firstPinned) {
          first.x = clamp(first.x - nx * push * 1.8, bounds.minX, bounds.maxX);
          first.y = clamp(first.y - ny * push * 1.8, bounds.minY, bounds.maxY);
        } else if (!secondPinned) {
          second.x = clamp(second.x + nx * push * 1.8, bounds.minX, bounds.maxX);
          second.y = clamp(second.y + ny * push * 1.8, bounds.minY, bounds.maxY);
        }
      }
    }
  }

  zoneNodes.forEach((node) => {
    node.x = Math.round(node.x);
    node.y = Math.round(node.y);
  });
}

function driftBridgeNodes(nodes, edges, learningModel, connectedZones) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (pinnedPoint(node, node.zone)) continue;
    const learned = learningModel?.nodes?.[node.id] ?? {};
    const targetWeights = new Map();

    for (const zone of learned.secondaryZones ?? []) {
      if (ZONE_LAYOUTS[zone] && zone !== node.zone) {
        targetWeights.set(zone, (targetWeights.get(zone) ?? 0) + 1.2);
      }
    }

    for (const [zone, count] of connectedZones.get(node.id) ?? []) {
      if (ZONE_LAYOUTS[zone] && zone !== node.zone) {
        targetWeights.set(zone, (targetWeights.get(zone) ?? 0) + Math.min(1.8, count * 0.5));
      }
    }

    let targetX = node.x;
    let targetY = node.y;
    let weight = 1;

    for (const [zone, zoneWeight] of targetWeights) {
      const center = zoneCenter(zone);
      targetX += center.x * zoneWeight;
      targetY += center.y * zoneWeight;
      weight += zoneWeight;
    }

    for (const edge of edges) {
      if (edge.source !== node.id && edge.target !== node.id) continue;
      const other = nodeById.get(edge.source === node.id ? edge.target : edge.source);
      if (!other || other.zone === node.zone) continue;
      const edgeWeight = Math.max(0.2, Math.min(1, Number(edge.strength) || 0.45)) * 0.85;
      targetX += other.x * edgeWeight;
      targetY += other.y * edgeWeight;
      weight += edgeWeight;
    }

    if (weight <= 1) continue;

    targetX /= weight;
    targetY /= weight;
    const bridgeScore = bridgeScoreForNode(node, connectedZones, learningModel);
    const typeMultiplier = node.type === "genre" ? 0.7 : node.type === "band" ? 1 : 0.86;
    const pull = Math.min(0.46, (0.14 + bridgeScore * 0.32) * typeMultiplier);
    const point = loosePointFor(
      node.zone,
      node,
      node.x + (targetX - node.x) * pull,
      node.y + (targetY - node.y) * pull,
      connectedZones,
      learningModel,
    );

    node.x = point.x;
    node.y = point.y;
  }
}

function relaxAll(nodes, connectedZones, learningModel) {
  for (let pass = 0; pass < 28; pass += 1) {
    for (let a = 0; a < nodes.length; a += 1) {
      for (let b = a + 1; b < nodes.length; b += 1) {
        const first = nodes[a];
        const second = nodes[b];
        const sameZone = first.zone === second.zone;
        const minDistance =
          (collisionRadius(first) + collisionRadius(second)) *
          (sameZone ? 0.92 : 0.66);
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);

        if (distance >= minDistance) continue;

        if (distance < 0.001) {
          const angle = (hashValue(`${first.id}:${second.id}:global`) % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const push = (minDistance - distance) * (sameZone ? 0.11 : 0.08);
        const nx = dx / distance;
        const ny = dy / distance;
        const firstPinned = Boolean(pinnedPoint(first, first.zone));
        const secondPinned = Boolean(pinnedPoint(second, second.zone));

        if (!firstPinned) {
          const point = loosePointFor(
            first.zone,
            first,
            first.x - nx * push,
            first.y - ny * push,
            connectedZones,
            learningModel,
          );
          first.x = point.x;
          first.y = point.y;
        }
        if (!secondPinned) {
          const point = loosePointFor(
            second.zone,
            second,
            second.x + nx * push,
            second.y + ny * push,
            connectedZones,
            learningModel,
          );
          second.x = point.x;
          second.y = point.y;
        }
      }
    }
  }

  nodes.forEach((node) => {
    node.x = Math.round(node.x);
    node.y = Math.round(node.y);
  });
}

export function organizeGraphLayout(nodes, edges, learningModel = undefined) {
  const edgeTextByNode = buildEdgeText(nodes, edges);
  const { genreLinks } = connectionMaps(nodes, edges);
  const grouped = new Map();

  for (const node of nodes) {
    const zone = zoneForNode(node, edgeTextByNode, learningModel);
    node.zone = zone;
    if (!grouped.has(zone)) grouped.set(zone, []);
    grouped.get(zone).push(node);
  }

  for (const [zone, zoneNodes] of grouped) {
    zoneNodes.sort(compareNodes(edgeTextByNode, learningModel));
    const hubType = zone === "guitar-workshop" ? "guitar_brand" : "genre";
    let hubs = zoneNodes.filter((node) => node.type === hubType);

    if (!hubs.length && zone !== "guitar-workshop") {
      hubs = zoneNodes.filter((node) => node.type === "band").slice(0, 4);
    }

    const anchors = makeAnchors(zone, hubs, edgeTextByNode, learningModel);
    const buckets = new Map();

    hubs.forEach((hub, index) => {
      const anchor = pinnedPoint(hub, zone) ?? anchors.get(hub.id) ?? fallbackAnchor(zone, index, hubs.length);
      hub.x = anchor.x;
      hub.y = anchor.y;
      anchors.set(hub.id, anchor);
      buckets.set(hub.id, []);
    });

    const looseNodes = zoneNodes.filter((node) => !anchors.has(node.id));
    looseNodes.forEach((node, index) => {
      const pinned = pinnedPoint(node, zone);
      if (pinned) {
        node.x = pinned.x;
        node.y = pinned.y;
        return;
      }

      const hubId = chooseHub(node, hubs, genreLinks, edgeTextByNode, learningModel);
      if (!hubId) {
        const point = fallbackAnchor(zone, index, looseNodes.length);
        node.x = point.x;
        node.y = point.y;
        return;
      }
      if (!buckets.has(hubId)) buckets.set(hubId, []);
      buckets.get(hubId).push(node);
    });

    for (const [hubId, bucket] of buckets) {
      const anchor = anchors.get(hubId) ?? fallbackAnchor(zone, 0, 1);
      bucket.sort(compareNodes(edgeTextByNode, learningModel));
      bucket.forEach((node, index) => {
        const point = placeAroundAnchor(zone, anchor, node, index, bucket.length);
        node.x = point.x;
        node.y = point.y;
      });
    }

    relaxZone(zone, zoneNodes);
  }

  const { connectedZones } = connectionMaps(nodes, edges);
  driftBridgeNodes(nodes, edges, learningModel, connectedZones);
  relaxAll(nodes, connectedZones, learningModel);

  return nodes;
}

export const ORGANIZED_MAP_ZONES = ZONE_LAYOUTS;
