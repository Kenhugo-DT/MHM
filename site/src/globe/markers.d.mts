import type { Placement } from "./InteractiveGlobeScene";

export function markerPlacements(placements: Placement[], selectedId?: string): Placement[];
export function samePlace(a: Placement["place"], b: Placement["place"]): boolean;
