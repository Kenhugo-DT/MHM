import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { entityFiles } from "./obsidian-utils.mjs";

export function jsonSignature(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function graphDataSignature(graph) {
  // Layout coordinates can change between migration passes and are checked by layout fingerprints.
  return jsonSignature({
    nodes: graph.nodes.map(({ x, y, ...node }) => node),
    edges: graph.edges,
  });
}

export function learningInputSignature(repoRoot) {
  const brainRoot = path.join(repoRoot, "brain");
  const factBatchRoot = path.join(brainRoot, "data", "fact-batches");
  const files = [
    ...entityFiles(path.join(brainRoot, "obsidian")),
    ...(fs.existsSync(factBatchRoot) ? fs.readdirSync(factBatchRoot)
      .filter((name) => name.endsWith(".json")).map((name) => path.join(factBatchRoot, name)) : []),
    path.join(brainRoot, "data", "approved", "curator-feedback.json"),
    path.join(brainRoot, "data", "approved", "fact-evidence.json"),
    path.join(repoRoot, "shared", "facts", "curated.json"),
    path.join(repoRoot, "site", "public", "data", "geography.json"),
  ].filter((file) => fs.existsSync(file));
  const inputs = files.map((file) => [
    path.relative(repoRoot, file).split(path.sep).join("/"),
    createHash("sha256").update(fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n")).digest("hex"),
  ]).sort((a, b) => Buffer.compare(Buffer.from(a[0]), Buffer.from(b[0])));
  return jsonSignature(inputs);
}
