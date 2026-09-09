const ZONE_LAYOUTS = {
  "roots-blues": {
    label: "ROOTS / BLUES",
    x: -1740,
    y: -520,
    width: 920,
    height: 900,
    columns: 4,
    colGap: 205,
    rowGap: 118,
  },
  "rock-circuit": {
    label: "ROCK CIRCUIT",
    x: -720,
    y: -440,
    width: 1120,
    height: 1460,
    columns: 5,
    colGap: 205,
    rowGap: 98,
  },
  "psychedelia-prog": {
    label: "PSYCHEDELIA / PROG",
    x: -660,
    y: -1180,
    width: 1500,
    height: 640,
    columns: 6,
    colGap: 220,
    rowGap: 116,
  },
  "hard-rock-metal": {
    label: "HARD ROCK / METAL",
    x: 500,
    y: -620,
    width: 2180,
    height: 1740,
    columns: 8,
    colGap: 235,
    rowGap: 98,
  },
  "punk-alt": {
    label: "PUNK / ALTERNATIVE",
    x: 400,
    y: 1180,
    width: 1620,
    height: 760,
    columns: 6,
    colGap: 225,
    rowGap: 112,
  },
  "folk-country-vise": {
    label: "FOLK / COUNTRY / VISE",
    x: -1740,
    y: 1060,
    width: 1500,
    height: 900,
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

const LANE_Y = {
  0: 92,
  1: 245,
  2: 430,
  3: 610,
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
    ...(node.metadata ?? []),
    ...(node.aliases ?? []),
    ...(edgeTextByNode.get(node.id) ?? []),
  ].join(" "));
}

function inferEra(text) {
  const directYears = [...text.matchAll(/\b(19[2-9]\d|20[0-2]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1920 && year <= 2026);

  if (directYears.length) return Math.min(...directYears);

  for (const [pattern, year] of ERA_HINTS) {
    if (pattern.test(text)) return year;
  }

  return 1988;
}

function scoreZone(text, zone) {
  const terms = ZONE_TERMS[zone] ?? [];
  return terms.reduce((score, term) => {
    const normalized = normalize(term);
    if (!normalized) return score;
    if (text.includes(normalized)) return score + Math.max(2, normalized.split(" ").length + 1);
    return score;
  }, 0);
}

function zoneForNode(node, edgeTextByNode) {
  if (node.type === "guitar" || node.type === "guitar_brand") return "guitar-workshop";

  const text = textForNode(node, edgeTextByNode);
  let bestZone = "rock-circuit";
  let bestScore = -1;

  for (const zone of ZONE_PRIORITY.filter((candidate) => candidate !== "guitar-workshop")) {
    const score = scoreZone(text, zone) + (node.zone === zone ? 1 : 0);
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

function compareNodes(edgeTextByNode) {
  return (a, b) => {
    const laneDiff = (LANE_ORDER[a.type] ?? 3) - (LANE_ORDER[b.type] ?? 3);
    if (laneDiff !== 0) return laneDiff;

    const eraDiff = inferEra(textForNode(a, edgeTextByNode)) - inferEra(textForNode(b, edgeTextByNode));
    if (eraDiff !== 0) return eraDiff;

    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  };
}

function pointFor(zone, index, node) {
  const layout = ZONE_LAYOUTS[zone] ?? ZONE_LAYOUTS["rock-circuit"];
  const columns = Math.max(1, layout.columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const lane = LANE_ORDER[node.type] ?? 3;
  const jitter = hashValue(`${zone}:${node.id}`);
  const jitterX = ((jitter % 21) - 10) * 1.6;
  const jitterY = (((jitter >>> 8) % 17) - 8) * 1.3;
  const leftPadding = 82;

  return {
    x: Math.round(layout.x + leftPadding + column * layout.colGap + jitterX),
    y: Math.round(layout.y + (LANE_Y[lane] ?? LANE_Y[3]) + row * layout.rowGap + jitterY),
  };
}

export function organizeGraphLayout(nodes, edges) {
  const edgeTextByNode = buildEdgeText(nodes, edges);
  const grouped = new Map();

  for (const node of nodes) {
    const zone = zoneForNode(node, edgeTextByNode);
    node.zone = zone;
    if (!grouped.has(zone)) grouped.set(zone, []);
    grouped.get(zone).push(node);
  }

  for (const [zone, zoneNodes] of grouped) {
    zoneNodes.sort(compareNodes(edgeTextByNode));
    const lanes = new Map();

    for (const node of zoneNodes) {
      const lane = LANE_ORDER[node.type] ?? 3;
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane).push(node);
    }

    for (const laneNodes of lanes.values()) {
      laneNodes.forEach((node, index) => {
        const point = pointFor(zone, index, node);
        node.x = point.x;
        node.y = point.y;
      });
    }
  }

  return nodes;
}

export const ORGANIZED_MAP_ZONES = ZONE_LAYOUTS;
