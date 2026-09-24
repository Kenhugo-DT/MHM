export const MODE_NODE_TYPES = {
  artists: ["band", "guitarist", "artist", "genre"],
  guitars: ["guitar", "guitar_brand", "genre"],
};

export async function graphFingerprint(graph, mode) {
  const types = new Set(MODE_NODE_TYPES[mode]);
  if (!types.size) throw new Error(`Unknown map mode: ${mode}`);

  const nodes = graph.nodes
    .filter((node) => types.has(node.type))
    .map((node) => [node.id, node.type, node.x, node.y, node.zone, Boolean(node.starter)])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "en"));
  const ids = new Set(nodes.map((node) => node[0]));
  const edges = graph.edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => [edge.source, edge.target, edge.type, edge.label, edge.strength])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));

  const bytes = new TextEncoder().encode(JSON.stringify([nodes, edges]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function edgeKey(edge) {
  return JSON.stringify([edge.source, edge.target, edge.type, edge.label]);
}

export async function matchingLayouts(graph, mode, layouts, baseline) {
  const expected = layouts?.graphFingerprints?.[mode];
  if (!expected) return undefined;
  if (!baseline) {
    return (await graphFingerprint(graph, mode)) === expected ? layouts : undefined;
  }

  const types = new Set(MODE_NODE_TYPES[mode]);
  const baselineNodes = baseline.nodes.filter((node) => types.has(node.type));
  const baselineIds = new Set(baselineNodes.map((node) => node.id));
  const baselineEdges = baseline.edges.filter(
    (edge) => baselineIds.has(edge.source) && baselineIds.has(edge.target),
  );
  if ((await graphFingerprint({ nodes: baselineNodes, edges: baselineEdges }, mode)) !== expected) {
    return undefined;
  }

  const liveNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const liveEdges = new Map(graph.edges.map((edge) => [edgeKey(edge), edge]));
  const matchingNodes = baselineNodes.map((node) => liveNodes.get(node.id));
  const matchingEdges = baselineEdges.map((edge) => liveEdges.get(edgeKey(edge)));
  if (matchingNodes.some((node) => !node) || matchingEdges.some((edge) => !edge)) {
    return undefined;
  }
  const liveBaseline = { nodes: matchingNodes, edges: matchingEdges };
  return (await graphFingerprint(liveBaseline, mode)) === expected ? layouts : undefined;
}
