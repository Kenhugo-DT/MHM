export const NODE_TYPES = [
  "band",
  "guitarist",
  "artist",
  "guitar",
  "guitar_brand",
  "genre",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type MapMode = "artists" | "guitars";

export interface SourceReference {
  label: string;
  url: string;
  provider?: "wikipedia" | "wikidata" | "musicbrainz" | "wikimedia" | "other";
  retrievedAt?: string;
}

export interface ImageReference {
  url: string;
  thumbnailUrl?: string;
  alt: string;
  creator?: string;
  license?: string;
  licenseUrl?: string;
  sourceUrl?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  roles: string[];
  summary: string;
  metadata: string[];
  aliases?: string[];
  x: number;
  y: number;
  zone: string;
  starter?: boolean;
  image?: ImageReference;
  sources: SourceReference[];
}

export type RelationType =
  | "member_of"
  | "collaboration"
  | "influenced_by"
  | "associated_genre"
  | "plays"
  | "made_by"
  | "signature_instrument"
  | "related";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  label: string;
  strength: number;
  context: string[];
  year?: number;
  sources: SourceReference[];
}

export interface GraphDataset {
  version: number;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNeighborhood {
  centerId?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BrowseRoute {
  id: string;
  name: string;
  description: string;
  mode?: MapMode;
  color: number;
  nodeIds: string[];
}

export interface MapZone {
  id: string;
  label: string;
  mode: MapMode | "all";
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
}
