import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { graphFingerprint, MODE_NODE_TYPES } from "../../shared/graph-schema/graph-snapshot.mjs";
import { graphDataSignature, jsonSignature, learningInputSignature } from "./data-signatures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function verifyApprovedModels(graph, learning, organization, layouts, basePath = root) {
  const signature = graphDataSignature(graph);
  if (learning.graphDataSignature !== signature ||
      learning.inputSignature !== learningInputSignature(basePath)) {
    throw new Error("Learning model is stale for the approved graph or research inputs.");
  }
  if (organization.graphDataSignature !== signature ||
      organization.graph?.generatedAt !== graph.generatedAt) {
    throw new Error("Organization model is stale for the approved graph.");
  }
  if (organization.learningModelSignature !== jsonSignature(learning)) {
    throw new Error("Organization model is stale for the learning model.");
  }
  if (layouts.inputSignatures?.learningModel !== jsonSignature(learning) ||
      layouts.inputSignatures?.organizationModel !== jsonSignature(organization)) {
    throw new Error("Layouts are stale for the approved models.");
  }
  for (const mode of Object.keys(MODE_NODE_TYPES)) {
    if (layouts.graphFingerprints?.[mode] !== await graphFingerprint(graph, mode)) {
      throw new Error(`Layouts are stale for the ${mode} graph.`);
    }
  }
  return { nodes: graph.nodes.length, edges: graph.edges.length, layouts: Object.keys(layouts.layouts).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const approved = (name) => JSON.parse(fs.readFileSync(
    path.join(root, "brain", "data", "approved", `${name}.json`), "utf8"));
  console.log("Verified approved models:", await verifyApprovedModels(
    approved("graph"), approved("learning-model"), approved("organization-model"), approved("layouts")));
}
