export function nodeOffset(index: number): { x: number; y: number };
export function offsetPlace<T extends { lat: number; lon: number }>(place: T, index: number): T;
export const PLACE_PAGE_SIZE: number;
export function visiblePlaceIndices(count: number, page?: number, showAll?: boolean, pinFirst?: boolean): number[];
export function connectionPath(a: { x: number; y: number }, b: { x: number; y: number }): string;
