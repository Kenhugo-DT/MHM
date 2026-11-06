import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, frontmatterBlock, notePathFor } from "./obsidian-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "brain/data/approved/graph.json"), "utf8"));
const batch = JSON.parse(fs.readFileSync(path.join(root, "brain/data/registry-gaps-batch.json"), "utf8"));
const vault = path.join(root, "brain/obsidian");
const nodes = new Map(graph.nodes.map((node) => [node.id, node]));

for (const id of batch.nodeIds) {
  const node = nodes.get(id);
  if (!node) throw new Error(`Missing registry node: ${id}`);
  const filePath = notePathFor(vault, node);
  if (fs.existsSync(filePath)) throw new Error(`Refusing to replace an existing note: ${filePath}`);
  const links = graph.edges.filter((edge) => edge.source === id && edge.type === "associated_genre" &&
    edge.id.startsWith(batch.edgePrefix));
  if (links.length !== 1) throw new Error(`Expected one documented genre anchor for ${id}`);
  const genre = nodes.get(links[0].target);
  if (!genre) throw new Error(`Missing genre target for ${id}`);

  const frontmatter = frontmatterBlock({
    id,
    label: node.label,
    type: node.type,
    zone: node.zone,
    roles: node.roles,
    aliases: [],
    eraStart: node.eraStart,
    eraPeak: "",
    primaryGenres: [genre.label],
    curatorTags: ["documented recording", "recording-year anchor"],
    secondaryZones: [],
    layoutPinned: false,
    layoutX: node.x,
    layoutY: node.y,
    starter: false,
  });
  const sourceLines = node.sources.map((source) => `- ${source.label}: ${source.url}`);
  const sharedRecording = graph.edges.filter((edge) => edge.type === "collaboration" &&
    edge.id.startsWith(batch.edgePrefix) && (edge.source === id || edge.target === id));
  const connections = [
    `- ${genre.label}: ${links[0].context[0]}`,
    ...sharedRecording.map((edge) => {
      const other = nodes.get(edge.source === id ? edge.target : edge.source);
      return `- ${other.label}: ${edge.context[0]}`;
    }),
  ];
  const body = [
    `# ${node.label}`,
    "",
    "## Summary",
    "",
    node.summary,
    "",
    "## Connections",
    "",
    ...connections,
    "",
    "## Sources",
    "",
    ...sourceLines,
    "",
    "## Curator Notes",
    "",
    `The ${node.eraStart} value dates a documented recording, not the beginning of ${node.label}'s career. The ${genre.label} link is a style/context anchor, not a direct influence claim. Only separately credited shared recordings support the collaboration links above.`,
    "",
  ];
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${frontmatter}${body.join("\n")}`);
}

console.log(`Exported ${batch.nodeIds.length} registry gap notes.`);
