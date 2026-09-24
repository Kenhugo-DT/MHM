export const MODE_NODE_TYPES: {
  artists: readonly ["band", "guitarist", "artist", "genre"];
  guitars: readonly ["guitar", "guitar_brand", "genre"];
};

export interface FingerprintNode {
  id: string;
  type: string;
  x: number;
  y: number;
  zone: string;
  starter?: boolean;
}

export interface FingerprintEdge {
  source: string;
  target: string;
  type: string;
  label: string;
  strength: number;
}

export function graphFingerprint(
  graph: { nodes: FingerprintNode[]; edges: FingerprintEdge[] },
  mode: keyof typeof MODE_NODE_TYPES,
): Promise<string>;

export function matchingLayouts<T extends { graphFingerprints?: Partial<Record<keyof typeof MODE_NODE_TYPES, string>> }>(
  graph: { nodes: FingerprintNode[]; edges: FingerprintEdge[] },
  mode: keyof typeof MODE_NODE_TYPES,
  layouts: T | undefined,
  baseline?: { nodes: FingerprintNode[]; edges: FingerprintEdge[] },
): Promise<T | undefined>;
