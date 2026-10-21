export interface PlaygroundParameters {
  spacing: number;
  connectionPull: number;
  zoneFreedom: number;
  iterations: number;
}

export interface PlaygroundMetrics {
  nodes: number;
  edges: number;
  overlaps: number;
  severeOverlaps: number;
  meanEdge: number;
  longEdges: number;
  meanDrift: number;
  score: number;
}

export interface PlaygroundResult {
  parameters: PlaygroundParameters;
  positions: Record<string, { x: number; y: number; zone?: string }>;
  before: PlaygroundMetrics;
  after: PlaygroundMetrics;
  outcome: "improved" | "regression" | "unchanged";
  trials?: Array<{ parameters: PlaygroundParameters; after: PlaygroundMetrics; outcome: PlaygroundResult["outcome"] }>;
}

export const DEFAULT_PARAMETERS: Readonly<PlaygroundParameters>;
export function evaluateLayout(graph: unknown, baseline: Record<string, { x: number; y: number }>, positions: Record<string, { x: number; y: number }>, scopeZone?: string): PlaygroundMetrics;
export function classifyOutcome(before: PlaygroundMetrics, after: PlaygroundMetrics): PlaygroundResult["outcome"];
export function runLayoutExperiment(graph: unknown, baseline: Record<string, { x: number; y: number }>, guidance: unknown, zones: unknown[], parameters?: Partial<PlaygroundParameters>, scopeZone?: string, movementPolicy?: Record<string, { weight: number; maxDistance: number }>): PlaygroundResult;
export function autoTuneLayout(graph: unknown, baseline: Record<string, { x: number; y: number }>, guidance: unknown, zones: unknown[], scopeZone?: string, feedback?: Array<{ verdict: string; parameters: PlaygroundParameters }>): PlaygroundResult;
