import type { GraphEdge, GraphNeighborhood, GraphNode } from "../types/graph";
import blockedEntities from "../../../shared/graph-schema/blocked-entities.json";

interface BlockedEntity {
  id: string;
  labels: string[];
}

const BLOCKED_ENTITIES = blockedEntities.entities as BlockedEntity[];
const EXCLUDED_ENTITY_TERMS = BLOCKED_ENTITIES.flatMap((entity) => [
  entity.id,
  ...entity.labels,
]);

function normalizeBlockedText(text: string): string {
  return text.toLocaleLowerCase("en").replace(/_/g, " ").trim();
}

export const EXCLUDED_ENTITY_IDS = new Set(
  BLOCKED_ENTITIES.map((entity) => normalizeBlockedText(entity.id)),
);

export function isBlockedEntityText(text: string): boolean {
  const normalized = normalizeBlockedText(text);
  return EXCLUDED_ENTITY_TERMS.some((term) => normalized.includes(normalizeBlockedText(term)));
}

export function isIncludedNode(node: GraphNode): boolean {
  return !EXCLUDED_ENTITY_IDS.has(normalizeBlockedText(node.id));
}

export function isIncludedEdge(edge: GraphEdge): boolean {
  return (
    !EXCLUDED_ENTITY_IDS.has(normalizeBlockedText(edge.source)) &&
    !EXCLUDED_ENTITY_IDS.has(normalizeBlockedText(edge.target))
  );
}

export function filterExcludedEntities(
  graph: GraphNeighborhood,
): GraphNeighborhood {
  const nodes = graph.nodes.filter(isIncludedNode);
  const ids = new Set(nodes.map((node) => node.id));

  return {
    centerId: graph.centerId,
    nodes,
    edges: graph.edges.filter(
      (edge) => isIncludedEdge(edge) && ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}
