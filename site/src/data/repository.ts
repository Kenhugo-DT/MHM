import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GraphDataset,
  GraphEdge,
  GraphLayoutDataset,
  GraphMapSnapshot,
  GraphNeighborhood,
  GraphNode,
  MapMode,
  NodeType,
} from "../types/graph";
import { filterExcludedEntities, isIncludedNode } from "../lib/excluded-entities";
import { MODE_TYPES } from "../lib/graph-config";
import { matchingLayouts } from "../../../shared/graph-schema/graph-snapshot.mjs";
import { loadAllRows } from "./load-all-rows.mjs";

export interface GraphRepository {
  readonly source: "local" | "supabase";
  loadMap(mode: MapMode): Promise<GraphMapSnapshot>;
  loadNeighborhood(nodeId: string, depth?: number): Promise<GraphNeighborhood>;
  search(query: string, limit?: number): Promise<GraphNode[]>;
}

let localDatasetPromise: Promise<GraphDataset> | undefined;
let localLayoutsPromise: Promise<GraphLayoutDataset | undefined> | undefined;

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

function loadLocalLayouts(): Promise<GraphLayoutDataset | undefined> {
  if (!localLayoutsPromise) {
    localLayoutsPromise = fetch(`${import.meta.env.BASE_URL}data/layouts.json`).then(
      async (response) => {
        if (response.status === 404) return undefined;
        if (!response.ok) {
          throw new Error(`Could not load layout data (${response.status}).`);
        }
        return (await response.json()) as GraphLayoutDataset;
      },
    );
  }
  return localLayoutsPromise;
}

class LocalGraphRepository implements GraphRepository {
  readonly source = "local" as const;

  async loadMap(mode: MapMode): Promise<GraphMapSnapshot> {
    const [dataset, layouts] = await Promise.all([loadLocalDataset(), loadLocalLayouts()]);
    const nodes = dataset.nodes.filter((node) => MODE_TYPES[mode].has(node.type));
    const ids = new Set(nodes.map((node) => node.id));
    const graph = filterExcludedEntities({
      nodes,
      edges: dataset.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    });
    return { ...graph, layouts: await matchingLayouts(graph, mode, layouts) };
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

const ENTITY_COLUMNS = "id,label,node_type,roles,summary,metadata,aliases,map_x,map_y,map_zone,starter,image,sources";
const RELATION_COLUMNS = "id,source_id,target_id,relation_type,label,strength,context,year,sources";

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

  async loadMap(mode: MapMode): Promise<GraphMapSnapshot> {
    const types = [...MODE_TYPES[mode]];
    const client = await this.client();
    const [entities, relations, layouts, baseline] = await Promise.all([
      loadAllRows<EntityRow>(async (afterId, pageSize) => {
        let query = client.from("entities").select(ENTITY_COLUMNS).in("node_type", types).order("id").limit(pageSize);
        if (afterId) query = query.gt("id", afterId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as EntityRow[];
      }),
      loadAllRows<RelationRow>(async (afterId, pageSize) => {
        let query = client.from("relations").select(RELATION_COLUMNS).order("id").limit(pageSize);
        if (afterId) query = query.gt("id", afterId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as RelationRow[];
      }),
      loadLocalLayouts(),
      loadLocalDataset(),
    ]);
    const nodes = entities.map(mapNode);
    const ids = new Set(nodes.map((node) => node.id));
    const graph = filterExcludedEntities({
      nodes,
      edges: relations
        .filter((edge) => ids.has(edge.source_id) && ids.has(edge.target_id))
        .map(mapEdge),
    });
    return {
      ...graph,
      layouts: await matchingLayouts(graph, mode, layouts, filterExcludedEntities(baseline)),
    };
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
