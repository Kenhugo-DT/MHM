import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GraphDataset,
  GraphEdge,
  GraphNeighborhood,
  GraphNode,
  MapMode,
  NodeType,
} from "../types/graph";
import { filterExcludedEntities, isIncludedNode } from "../lib/excluded-entities";
import { MODE_TYPES } from "../lib/graph-config";

export interface GraphRepository {
  readonly source: "local" | "supabase";
  loadMap(mode: MapMode): Promise<GraphNeighborhood>;
  loadNeighborhood(nodeId: string, depth?: number): Promise<GraphNeighborhood>;
  search(query: string, limit?: number): Promise<GraphNode[]>;
}

let localDatasetPromise: Promise<GraphDataset> | undefined;

function loadLocalDataset(): Promise<GraphDataset> {
  if (!localDatasetPromise) {
    localDatasetPromise = fetch(`${import.meta.env.BASE_URL}data/graph.json`).then(
      async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load graph data (${response.status}).`);
        }
        return (await response.json()) as GraphDataset;
      },
    );
  }
  return localDatasetPromise;
}

class LocalGraphRepository implements GraphRepository {
  readonly source = "local" as const;

  async loadMap(mode: MapMode): Promise<GraphNeighborhood> {
    const dataset = await loadLocalDataset();
    const nodes = dataset.nodes.filter((node) => MODE_TYPES[mode].has(node.type));
    const ids = new Set(nodes.map((node) => node.id));
    return filterExcludedEntities({
      nodes,
      edges: dataset.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    });
  }

  async loadNeighborhood(nodeId: string, depth = 1): Promise<GraphNeighborhood> {
    const dataset = await loadLocalDataset();
    const ids = new Set([nodeId]);

    for (let level = 0; level < depth; level += 1) {
      dataset.edges.forEach((edge) => {
        if (ids.has(edge.source)) ids.add(edge.target);
        if (ids.has(edge.target)) ids.add(edge.source);
      });
    }

    return filterExcludedEntities({
      centerId: nodeId,
      nodes: dataset.nodes.filter((node) => ids.has(node.id)),
      edges: dataset.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    });
  }

  async search(query: string, limit = 12): Promise<GraphNode[]> {
    const dataset = await loadLocalDataset();
    const normalized = query.trim().toLocaleLowerCase("en");
    if (!normalized) return [];

    return dataset.nodes
      .filter(isIncludedNode)
      .filter((node) =>
        [node.label, node.type, ...node.roles, ...node.metadata, ...(node.aliases ?? [])]
          .join(" ")
          .toLocaleLowerCase("en")
          .includes(normalized),
      )
      .sort((a, b) => {
        const aStarts = a.label.toLocaleLowerCase("en").startsWith(normalized);
        const bStarts = b.label.toLocaleLowerCase("en").startsWith(normalized);
        return Number(bStarts) - Number(aStarts) || a.label.localeCompare(b.label);
      })
      .slice(0, limit);
  }
}

interface EntityRow {
  id: string;
  label: string;
  node_type: NodeType;
  roles: string[];
  summary: string | null;
  metadata: string[] | null;
  aliases: string[] | null;
  map_x: number;
  map_y: number;
  map_zone: string;
  starter: boolean;
  image: GraphNode["image"] | null;
  sources: GraphNode["sources"] | null;
}

interface RelationRow {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: GraphEdge["type"];
  label: string;
  strength: number;
  context: string[] | null;
  year: number | null;
  sources: GraphEdge["sources"] | null;
}

function mapNode(row: EntityRow): GraphNode {
  return {
    id: row.id,
    label: row.label,
    type: row.node_type,
    roles: row.roles ?? [],
    summary: row.summary ?? "",
    metadata: row.metadata ?? [],
    aliases: row.aliases ?? [],
    x: row.map_x,
    y: row.map_y,
    zone: row.map_zone,
    starter: row.starter,
    image: row.image ?? undefined,
    sources: row.sources ?? [],
  };
}

function mapEdge(row: RelationRow): GraphEdge {
  return {
    id: row.id,
    source: row.source_id,
    target: row.target_id,
    type: row.relation_type,
    label: row.label,
    strength: row.strength,
    context: row.context ?? [],
    year: row.year ?? undefined,
    sources: row.sources ?? [],
  };
}

class SupabaseGraphRepository implements GraphRepository {
  readonly source = "supabase" as const;
  private clientPromise?: Promise<SupabaseClient>;

  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}

  private async client(): Promise<SupabaseClient> {
    if (!this.clientPromise) {
      this.clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
        createClient(this.url, this.key),
      );
    }
    return this.clientPromise;
  }

  async loadMap(mode: MapMode): Promise<GraphNeighborhood> {
    const types = [...MODE_TYPES[mode]];
    const client = await this.client();
    const { data, error } = await client.rpc("graph_map", {
      node_types: types,
      entity_limit: 800,
    });
    if (error) throw error;
    const payload = data as { nodes: EntityRow[]; edges: RelationRow[] };
    return filterExcludedEntities({
      nodes: payload.nodes.map(mapNode),
      edges: payload.edges.map(mapEdge),
    });
  }

  async loadNeighborhood(nodeId: string): Promise<GraphNeighborhood> {
    const client = await this.client();
    const { data, error } = await client.rpc("graph_neighborhood", {
      center_id: nodeId,
      neighbor_limit: 80,
    });
    if (error) throw error;
    const payload = data as { nodes: EntityRow[]; edges: RelationRow[] };
    return filterExcludedEntities({
      centerId: nodeId,
      nodes: payload.nodes.map(mapNode),
      edges: payload.edges.map(mapEdge),
    });
  }

  async search(query: string, limit = 12): Promise<GraphNode[]> {
    const client = await this.client();
    const { data, error } = await client
      .from("entities")
      .select("*")
      .ilike("search_text", `%${query.trim()}%`)
      .limit(limit);
    if (error) throw error;
    return (data as EntityRow[]).map(mapNode).filter(isIncludedNode);
  }
}

export function createGraphRepository(): GraphRepository {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (url && key) {
    return new SupabaseGraphRepository(url, key);
  }

  return new LocalGraphRepository();
}
