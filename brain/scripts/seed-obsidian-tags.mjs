import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_NODE_TYPES,
  coerceStringArray,
  entityFiles,
  frontmatterBlock,
  parseFrontmatter,
} from "./obsidian-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(scriptDir, "..");
const graphPath = path.join(brainRoot, "data", "approved", "graph.json");
const vaultRoot = path.join(brainRoot, "obsidian");

const ZONE_TAGS = {
  "roots-blues": ["roots", "blues"],
  "rock-circuit": ["rock", "classic rock"],
  "psychedelia-prog": ["psychedelic", "progressive"],
  "hard-rock-metal": ["hard rock", "metal"],
  "punk-alt": ["punk", "alternative"],
  "folk-country-vise": ["folk", "country"],
  "guitar-workshop": ["guitar", "instrument"],
};

const ZONE_KEYWORDS = {
  "roots-blues": [
    "blues",
    "blues rock",
    "electric blues",
    "delta blues",
    "chicago blues",
    "rhythm and blues",
    "rockabilly",
    "southern rock",
    "slide guitar",
  ],
  "rock-circuit": [
    "rock",
    "classic rock",
    "glam rock",
    "pop rock",
    "funk",
    "yardbirds",
    "beatles",
    "rolling stones",
    "queen",
  ],
  "psychedelia-prog": [
    "progressive rock",
    "progressive metal",
    "psychedelic rock",
    "art rock",
    "space rock",
    "jazz fusion",
    "prog",
  ],
  "hard-rock-metal": [
    "hard rock",
    "heavy metal",
    "thrash metal",
    "speed metal",
    "power metal",
    "doom metal",
    "gothic metal",
    "death metal",
    "glam metal",
    "metal",
  ],
  "punk-alt": [
    "punk",
    "punk rock",
    "horror punk",
    "hardcore punk",
    "post-punk",
    "alternative rock",
    "post-grunge",
    "industrial rock",
    "gothic rock",
    "indie rock",
    "shoegaze",
    "grunge",
  ],
  "folk-country-vise": [
    "folk",
    "country",
    "country rock",
    "singer-songwriter",
    "bluegrass",
    "flamenco",
    "norwegian vise",
    "vise",
    "jazz",
  ],
};

const TAG_KEYWORDS = [
  "horror punk",
  "punk rock",
  "hardcore punk",
  "post-punk",
  "alternative rock",
  "post-grunge",
  "industrial rock",
  "gothic rock",
  "indie rock",
  "shoegaze",
  "grunge",
  "thrash metal",
  "speed metal",
  "power metal",
  "progressive metal",
  "progressive rock",
  "psychedelic rock",
  "space rock",
  "art rock",
  "glam metal",
  "hard rock",
  "heavy metal",
  "doom metal",
  "death metal",
  "gothic metal",
  "glam rock",
  "pop rock",
  "country rock",
  "southern rock",
  "roots rock",
  "swamp rock",
  "blues rock",
  "electric blues",
  "rockabilly",
  "blues",
  "folk",
  "country",
  "jazz fusion",
  "jazz",
  "funk",
  "rock and roll",
  "rock",
];

const MANUAL_HINTS = {
  "misfits": {
    zone: "punk-alt",
    primaryGenres: ["horror punk", "punk rock"],
    curatorTags: ["horror punk", "punk rock", "punk roots"],
  },
  "ramones": {
    zone: "punk-alt",
    primaryGenres: ["punk rock"],
    curatorTags: ["punk rock", "punk roots", "new york punk"],
  },
  "sex-pistols": {
    zone: "punk-alt",
    primaryGenres: ["punk rock"],
    curatorTags: ["punk rock", "uk punk", "punk roots"],
  },
  "bad-religion": {
    zone: "punk-alt",
    primaryGenres: ["punk rock", "hardcore punk"],
    curatorTags: ["punk rock", "hardcore punk", "melodic punk"],
  },
  "black-flag": {
    zone: "punk-alt",
    primaryGenres: ["hardcore punk", "punk rock"],
    curatorTags: ["hardcore punk", "punk rock", "california punk"],
  },
  "afi": {
    zone: "punk-alt",
    primaryGenres: ["horror punk", "punk rock"],
    curatorTags: ["horror punk", "punk rock", "alternative"],
  },
  "germs": {
    zone: "punk-alt",
    primaryGenres: ["punk rock", "hardcore punk"],
    curatorTags: ["punk rock", "hardcore punk", "la punk"],
  },
  "suicidal-tendencies": {
    zone: "punk-alt",
    primaryGenres: ["hardcore punk", "thrash metal"],
    curatorTags: ["crossover thrash", "hardcore punk", "venice scene"],
  },
  "the-good-the-bad-and-the-zugly": {
    zone: "punk-alt",
    primaryGenres: ["punk rock", "hardcore punk"],
    curatorTags: ["norwegian punk", "hardcore punk", "punk rock"],
  },
  "kvelertak": {
    zone: "hard-rock-metal",
    primaryGenres: ["hard rock", "punk rock"],
    curatorTags: ["norwegian rock", "metal", "punk energy"],
  },
};

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function pushWeighted(scores, value, amount = 1) {
  const key = String(value ?? "").trim();
  if (!key) return;
  scores.set(key, (scores.get(key) ?? 0) + amount);
}

function scoreZone(text, currentZone) {
  const scores = new Map();
  if (currentZone) pushWeighted(scores, currentZone, 1);

  for (const [zone, terms] of Object.entries(ZONE_KEYWORDS)) {
    for (const term of terms) {
      if (text.includes(normalize(term))) {
        pushWeighted(scores, zone, term.includes(" ") ? 4 : 2);
      }
    }
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? currentZone ?? "rock-circuit";
}

function graphContext(graph) {
  const nodeById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const genreLabelsByNode = new Map((graph.nodes ?? []).map((node) => [node.id, []]));
  const neighborLabelsByNode = new Map((graph.nodes ?? []).map((node) => [node.id, []]));

  for (const edge of graph.edges ?? []) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;

    neighborLabelsByNode.get(source.id)?.push(target.label, edge.label, ...(edge.context ?? []));
    neighborLabelsByNode.get(target.id)?.push(source.label, edge.label, ...(edge.context ?? []));

    if (source.type === "genre" && target.type !== "genre") {
      genreLabelsByNode.get(target.id)?.push(source.label);
    }
    if (target.type === "genre" && source.type !== "genre") {
      genreLabelsByNode.get(source.id)?.push(target.label);
    }
  }

  return { nodeById, genreLabelsByNode, neighborLabelsByNode };
}

function tagScores(node, frontmatter, genreLabels, neighborLabels) {
  const scores = new Map();
  const text = normalize([
    node.id,
    node.label,
    node.type,
    node.zone,
    node.summary,
    ...(node.metadata ?? []),
    ...(node.aliases ?? []),
    ...coerceStringArray(frontmatter.primaryGenres),
    ...coerceStringArray(frontmatter.curatorTags),
    ...genreLabels,
    ...neighborLabels,
  ].join(" "));

  for (const tag of TAG_KEYWORDS) {
    const normalized = normalize(tag);
    if (text.includes(normalized)) {
      pushWeighted(scores, tag, tag.includes(" ") ? 4 : 2);
    }
  }

  for (const genre of genreLabels) {
    pushWeighted(scores, genre, 5);
  }

  if (node.type === "genre") {
    pushWeighted(scores, node.label, 8);
    for (const zoneTag of ZONE_TAGS[node.zone] ?? []) pushWeighted(scores, zoneTag, 2);
  }

  if (node.type === "guitar_brand") {
    pushWeighted(scores, "guitar brand", 7);
    pushWeighted(scores, "manufacturer", 4);
  }

  if (node.type === "guitar") {
    pushWeighted(scores, text.includes("acoustic") ? "acoustic guitar" : "electric guitar", 5);
    if (text.includes("solid body") || text.includes("solid-body")) pushWeighted(scores, "solid-body", 4);
    if (text.includes("signature")) pushWeighted(scores, "signature guitar", 4);
  }

  if (node.type === "guitarist") {
    pushWeighted(scores, "guitarist", 3);
  }

  if (node.type === "artist") {
    pushWeighted(scores, "artist", 2);
  }

  if (node.type === "band") {
    pushWeighted(scores, "band", 2);
  }

  return scores;
}

function topTags(node, frontmatter, zone, genreLabels, neighborLabels) {
  const manual = MANUAL_HINTS[node.id];
  if (manual?.curatorTags?.length) return manual.curatorTags.slice(0, 3);

  const scores = tagScores(node, frontmatter, genreLabels, neighborLabels);
  for (const zoneTag of ZONE_TAGS[zone] ?? []) pushWeighted(scores, zoneTag, 1.5);

  const tags = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))
    .map(([tag]) => tag)
    .filter((tag) => tag !== node.label)
    .slice(0, 3);

  while (tags.length < 2) {
    const fallback = (ZONE_TAGS[zone] ?? ZONE_TAGS["rock-circuit"])[tags.length] ?? node.type;
    if (!tags.includes(fallback)) tags.push(fallback);
    else tags.push(node.type);
  }

  return unique(tags).slice(0, 3);
}

function primaryGenresFor(node, tags) {
  if (MANUAL_HINTS[node.id]?.primaryGenres) return MANUAL_HINTS[node.id].primaryGenres;
  if (node.type === "genre") return [node.label];
  if (node.type === "guitar" || node.type === "guitar_brand") return [];

  return tags.filter((tag) => TAG_KEYWORDS.includes(tag)).slice(0, 3);
}

function splitFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return {
    frontmatter: parseFrontmatter(markdown),
    body: match ? markdown.slice(match[0].length) : markdown,
  };
}

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const { nodeById, genreLabelsByNode, neighborLabelsByNode } = graphContext(graph);
const updated = [];

for (const filePath of entityFiles(vaultRoot)) {
  const markdown = fs.readFileSync(filePath, "utf8");
  const { frontmatter, body } = splitFrontmatter(markdown);
  const id = String(frontmatter.id ?? "").trim();
  const node = nodeById.get(id);
  if (!node || !ALLOWED_NODE_TYPES.has(node.type)) continue;

  const genreLabels = unique(genreLabelsByNode.get(id) ?? []);
  const neighborLabels = unique(neighborLabelsByNode.get(id) ?? []);
  const text = normalize([
    node.id,
    node.label,
    node.summary,
    ...(node.metadata ?? []),
    ...genreLabels,
    ...neighborLabels,
  ].join(" "));
  const zone = node.type === "guitar" || node.type === "guitar_brand"
    ? "guitar-workshop"
    : MANUAL_HINTS[id]?.zone ?? scoreZone(text, frontmatter.zone || node.zone);
  const curatorTags = topTags(node, frontmatter, zone, genreLabels, neighborLabels);
  const primaryGenres = primaryGenresFor(node, curatorTags);

  const nextFrontmatter = {
    ...frontmatter,
    zone,
    primaryGenres,
    curatorTags,
  };

  fs.writeFileSync(filePath, `${frontmatterBlock(nextFrontmatter)}${body}`);
  updated.push({ id, label: node.label, type: node.type, zone, curatorTags, primaryGenres });
}

const missingTags = updated.filter((node) => node.curatorTags.length < 2);

console.log(JSON.stringify({
  updatedNotes: updated.length,
  notesWithCuratorTags: updated.filter((node) => node.curatorTags.length).length,
  notesWithPrimaryGenres: updated.filter((node) => node.primaryGenres.length).length,
  missingTags,
  anchors: Object.fromEntries(
    Object.keys(MANUAL_HINTS)
      .filter((id) => updated.some((node) => node.id === id))
      .map((id) => [id, updated.find((node) => node.id === id)]),
  ),
}, null, 2));
