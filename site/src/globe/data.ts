import blocked from "../../../shared/graph-schema/blocked-entities.json";
import curatedFacts from "../../../shared/facts/curated.json";
import globeExcluded from "./excluded.json";

export interface GlobeNode {
  id: string;
  label: string;
  type: string;
  aliases?: string[];
  summary: string;
  roles: string[];
  metadata: string[];
  eraStart?: number;
  image?: { url: string; alt: string; sourceUrl?: string };
  sources: Array<{ label: string; url: string }>;
}

export interface GlobeEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  context: string[];
  year?: number;
  sources: Array<{ label: string; url: string }>;
}

export interface GlobeFact {
  id: string;
  entityId: string;
  text: string;
  year?: number;
  sources: Array<{ label: string; url: string }>;
}

export interface GlobeData {
  nodes: GlobeNode[];
  edges: GlobeEdge[];
  source: "published" | "live";
}

const blockedIds = new Set([...blocked.entities.map((entry) => entry.id), ...globeExcluded]);
const base = import.meta.env.BASE_URL;
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function included(data: { nodes: GlobeNode[]; edges: GlobeEdge[] }): GlobeData {
  const nodes = data.nodes.filter((node) => !blockedIds.has(node.id));
  const ids = new Set(nodes.map((node) => node.id));
  const isConnection = (edge: GlobeEdge) => !/^wikipedia (?:link|category) signal$/i.test(edge.label.trim())
    && !edge.context.some((item) => /^wikipedia (?:link|category):/i.test(item.trim()));
  return {
    nodes,
    edges: data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && isConnection(edge)),
    source: "published",
  };
}

async function publishedData(): Promise<GlobeData> {
  const response = await fetch(`${base}data/graph.json`);
  if (!response.ok) throw new Error(`Graph data unavailable (${response.status}).`);
  return included(await response.json() as { nodes: GlobeNode[]; edges: GlobeEdge[] });
}

async function allRows<T>(table: string, select: string): Promise<T[]> {
  if (!url || !key) return [];
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const query = new URL(`${url}/rest/v1/${table}`);
    query.searchParams.set("select", select);
    query.searchParams.set("order", "id.asc");
    query.searchParams.set("limit", "1000");
    query.searchParams.set("offset", String(offset));
    const response = await fetch(query, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`Live ${table} unavailable (${response.status}).`);
    const page = await response.json() as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

interface EntityRow {
  id: string; label: string; node_type: string; summary: string | null;
  aliases: string[] | null;
  roles: string[] | null; metadata: string[] | null; era_start: number | null;
  image: GlobeNode["image"] | null; sources: GlobeNode["sources"] | null;
}

interface RelationRow {
  id: string; source_id: string; target_id: string; relation_type: string;
  label: string; context: string[] | null; year: number | null;
  sources: GlobeEdge["sources"] | null;
}

export async function loadGlobeData(): Promise<GlobeData> {
  const published = await publishedData();
  if (!url || !key) return published;
  try {
    const [entities, relations] = await Promise.all([
      allRows<EntityRow>("entities", "id,label,node_type,aliases,summary,roles,metadata,era_start,image,sources"),
      allRows<RelationRow>("relations", "id,source_id,target_id,relation_type,label,context,year,sources"),
    ]);
    const baseline = new Map(published.nodes.map((node) => [node.id, node]));
    const nodes = entities.map((row): GlobeNode => ({
      id: row.id,
      label: row.label,
      type: row.node_type,
      aliases: row.aliases ?? baseline.get(row.id)?.aliases ?? [],
      summary: row.summary ?? "",
      roles: row.roles ?? [],
      metadata: row.metadata ?? [],
      eraStart: row.era_start ?? baseline.get(row.id)?.eraStart,
      image: row.image ?? baseline.get(row.id)?.image,
      sources: row.sources ?? [],
    }));
    const graph = included({
      nodes,
      edges: relations.map((row) => ({
        id: row.id,
        source: row.source_id,
        target: row.target_id,
        type: row.relation_type,
        label: row.label,
        context: row.context ?? [],
        year: row.year ?? undefined,
        sources: row.sources ?? [],
      })),
    });
    return { ...graph, source: "live" };
  } catch {
    return published;
  }
}

export async function loadFacts(entityId: string): Promise<GlobeFact[]> {
  const local = (curatedFacts as GlobeFact[]).filter((fact) => fact.entityId === entityId);
  if (!url || !key) return local;
  try {
    const query = new URL(`${url}/rest/v1/entity_facts`);
    query.searchParams.set("select", "id,entity_id,text,year,sources");
    query.searchParams.set("entity_id", `eq.${entityId}`);
    query.searchParams.set("status", "eq.approved");
    query.searchParams.set("limit", "3");
    const response = await fetch(query, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) return local;
    const remote = await response.json() as Array<{ id: string; entity_id: string; text: string; year?: number; sources: GlobeFact["sources"] }>;
    const seen = new Set(local.map((fact) => fact.text.trim().toLowerCase()));
    return [...local, ...remote.filter((fact) => !seen.has(fact.text.trim().toLowerCase())).map((fact) => ({
      id: fact.id, entityId: fact.entity_id, text: fact.text, year: fact.year, sources: fact.sources ?? [],
    }))].slice(0, 2);
  } catch {
    return local;
  }
}
