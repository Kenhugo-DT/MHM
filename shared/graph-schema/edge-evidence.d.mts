export interface EvidenceEdge {
  label?: string;
  context?: readonly string[];
  sources?: readonly { url?: string }[];
}

export function edgeEvidenceTier(edge: EvidenceEdge): "research_lead" | "source_linked" | "curated_unsourced";
export function isMapConnection(edge: EvidenceEdge): boolean;
