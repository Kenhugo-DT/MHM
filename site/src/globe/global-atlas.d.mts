import type { GlobeNode } from "./data";
import type { Placement } from "./InteractiveGlobeScene";

export function extendAtlas(nodes: GlobeNode[], placements: Placement[]): { nodes: GlobeNode[]; placements: Placement[] };
