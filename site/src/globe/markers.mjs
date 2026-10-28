export function markerPlacements(placements, selectedId) {
  const bases = placements.filter((entry) => entry.role === "musical_base");
  if (!selectedId) return bases;
  const selectedBirthplace = placements.find((entry) => entry.nodeId === selectedId && entry.role === "birthplace");
  if (!selectedBirthplace) return bases;
  const selectedBase = bases.find((entry) => entry.nodeId === selectedId);
  return selectedBirthplace.placeId === selectedBase?.placeId ? bases : [...bases, selectedBirthplace];
}

export function samePlace(a, b) {
  return a.name.trim().toLocaleLowerCase() === b.name.trim().toLocaleLowerCase()
    && a.country.trim().toLocaleLowerCase() === b.country.trim().toLocaleLowerCase()
    && Math.abs(a.lat - b.lat) < 0.15 && Math.abs(a.lon - b.lon) < 0.15;
}
