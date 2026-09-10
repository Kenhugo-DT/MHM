import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_NODE_TYPES,
  ensureDir,
  frontmatterBlock,
  keepEditable,
  notePathFor,
  parseFrontmatter,
} from "./obsidian-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(scriptDir, "..");
const vaultRoot = path.join(brainRoot, "obsidian");
const graphPath = path.join(brainRoot, "data", "approved", "graph.json");

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const nodes = (graph.nodes ?? []).filter((node) => ALLOWED_NODE_TYPES.has(node.type));
const nodesById = new Map(nodes.map((node) => [node.id, node]));
const edgesByNode = new Map(nodes.map((node) => [node.id, []]));

for (const edge of graph.edges ?? []) {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  if (!source || !target) continue;
  edgesByNode.get(source.id)?.push({ edge, other: target, direction: "out" });
  edgesByNode.get(target.id)?.push({ edge, other: source, direction: "in" });
}

for (const node of nodes) {
  const outputPath = notePathFor(vaultRoot, node);
  ensureDir(path.dirname(outputPath));

  const existing = fs.existsSync(outputPath)
    ? parseFrontmatter(fs.readFileSync(outputPath, "utf8"))
    : {};
  const editable = keepEditable(existing);
  const hints = node.layoutHints ?? {};

  const frontmatter = {
    id: node.id,
    label: node.label,
    type: node.type,
    zone: editable.zone ?? node.zone,
    roles: editable.roles ?? node.roles ?? [node.type],
    aliases: editable.aliases ?? node.aliases ?? [],
    eraStart: editable.eraStart ?? node.eraStart ?? "",
    eraPeak: editable.eraPeak ?? node.eraPeak ?? "",
    primaryGenres: editable.primaryGenres ?? node.primaryGenres ?? [],
    secondaryZones: editable.secondaryZones ?? hints.secondaryZones ?? node.secondaryZones ?? [],
    layoutPinned: editable.layoutPinned ?? hints.pinned ?? false,
    layoutX: editable.layoutX ?? hints.x ?? node.x,
    layoutY: editable.layoutY ?? hints.y ?? node.y,
    starter: editable.starter ?? node.starter ?? false,
  };

  fs.writeFileSync(outputPath, `${frontmatterBlock(frontmatter)}${noteBody(node, edgesByNode.get(node.id) ?? [])}`);
}

writeIndex(nodes, graph.edges ?? []);

console.log(`Exported ${nodes.length} Obsidian entity notes to ${vaultRoot}.`);

function noteBody(node, connections) {
  return [
    `# ${node.label}`,
    "",
    "## Summary",
    "",
    node.summary || "No summary yet.",
    "",
    "## Connections",
    "",
    ...connectionLines(connections),
    "",
    "## Sources",
    "",
    ...sourceLines(node.sources ?? []),
    "",
    "## Curator Notes",
    "",
    "Use this section for human notes. Machine-readable organization belongs in the frontmatter above.",
    "",
  ].join("\n");
}

function connectionLines(connections) {
  if (!connections.length) return ["No documented connections yet."];
  return connections
    .sort((a, b) => a.other.label.localeCompare(b.other.label, "en"))
    .map(({ edge, other }) => {
      const context = (edge.context ?? []).length ? ` (${edge.context.join("; ")})` : "";
      return `- [[${other.id}|${other.label}]] - ${edge.label}${context}`;
    });
}

function sourceLines(sources) {
  if (!sources.length) return ["No sources yet."];
  return sources.map((source) => `- [${source.label ?? source.provider ?? "Source"}](${source.url})`);
}

function writeIndex(nodes, edges) {
  const byType = Object.groupBy(nodes, (node) => node.type);
  const lines = [
    "# Graph Index",
    "",
    `Generated entity notes: ${nodes.length}`,
    `Documented connections: ${edges.length}`,
    "",
  ];

  for (const type of [...ALLOWED_NODE_TYPES].sort()) {
    const items = (byType[type] ?? []).sort((a, b) => a.label.localeCompare(b.label, "en"));
    lines.push(`## ${type}`, "");
    for (const node of items) {
      lines.push(`- [[${node.id}|${node.label}]]`);
    }
    lines.push("");
  }

  fs.writeFileSync(path.join(vaultRoot, "Graph Index.md"), `${lines.join("\n")}\n`);
}
