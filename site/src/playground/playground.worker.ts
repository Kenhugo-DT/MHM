import organization from "../../../brain/data/approved/organization-model.json";
import { autoTuneLayout, runLayoutExperiment } from "../../../shared/layout-playground/experiment.mjs";
import type { GraphDataset, LayoutNodePosition } from "../types/graph";
import type { PlaygroundParameters } from "../../../shared/layout-playground/experiment.mjs";
import { MAP_ZONES } from "../lib/graph-config";

interface Request {
  id: number;
  graph: GraphDataset;
  baseline: Record<string, LayoutNodePosition>;
  scopeZone: string;
  parameters: PlaygroundParameters;
  auto: boolean;
  feedback: Array<{ verdict: string; parameters: PlaygroundParameters }>;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, graph, baseline, scopeZone, parameters, auto, feedback } = event.data;
  try {
    if (organization.graph.nodes !== graph.nodes.length) {
      throw new Error("Brain guidance and graph snapshots differ. Reload after deployment.");
    }
    const guidance = organization.layoutIntelligence;
    const result = auto
      ? autoTuneLayout(graph, baseline, guidance, MAP_ZONES, scopeZone, feedback)
      : runLayoutExperiment(graph, baseline, guidance, MAP_ZONES, parameters, scopeZone);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
