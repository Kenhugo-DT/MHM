export interface Place {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  aliases?: string[];
}

export interface Placement {
  nodeId: string;
  placeId: string;
  role: "musical_base" | "birthplace";
  place: Place;
  evidenceUrl: string;
  evidence: string;
  note?: string;
  sourceEntity?: string;
  sourceProperty?: string;
  coordinateSource?: string;
  identitySource?: string;
  identityNote?: string;
}

export const PLACES: Place[];
export function buildGeography(nodes: Array<{
  id: string;
  type: string;
  summary: string;
  sources: Array<{ url: string }>;
}>, sourceBacked?: Placement[]): Placement[];
