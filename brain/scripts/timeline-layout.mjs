const FIRST_DECADE = 1600;
const LAST_DECADE = 2030;
const START_X = -4800;
const BODY_TOP = -1040;
const ROW_GAP = 126;
const MIN_NODE_GAP_X = 112;
const MIN_NODE_GAP_Y = 112;

function decadeWidth(year) {
  if (year < 1900) return 140;
  if (year < 1920) return 260;
  if (year < 1950) return 500;
  return 640;
}

function validStartYear(value) {
  return Number.isInteger(value) && value >= 1400 && value <= 2100;
}

function stableFraction(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
}

export function firstActiveYear(node, learningModel) {
  if (validStartYear(node.eraStart)) return node.eraStart;
  const learned = learningModel?.nodes?.[node.id]?.eraStart;
  return validStartYear(learned) ? learned : undefined;
}

export function buildTimelineLayout(nodes, learningModel) {
  const dated = nodes.map((node) => ({
    node,
    startYear: firstActiveYear(node, learningModel),
  }));
  const knownYears = dated.map((entry) => entry.startYear).filter(Number.isFinite);
  const firstDecade = Math.min(FIRST_DECADE, ...knownYears.map((year) => Math.floor(year / 10) * 10));
  const lastDecade = Math.max(LAST_DECADE, ...knownYears.map((year) => Math.floor(year / 10) * 10));

  const markers = [];
  let nextX = START_X;
  for (let year = firstDecade; year <= lastDecade; year += 10) {
    const width = decadeWidth(year);
    markers.push({ year, x: nextX, width });
    nextX += width;
  }

  const byDecade = new Map();
  const undated = [];
  for (const entry of dated) {
    if (entry.startYear === undefined) {
      undated.push(entry.node);
      continue;
    }
    const decade = Math.floor(entry.startYear / 10) * 10;
    if (!byDecade.has(decade)) byDecade.set(decade, []);
    byDecade.get(decade).push(entry);
  }

  const items = [];
  const occupied = [];
  let knownBottom = BODY_TOP;
  for (const marker of markers) {
    const entries = byDecade.get(marker.year) ?? [];
    entries.sort((a, b) =>
      a.startYear - b.startYear ||
      a.node.zone.localeCompare(b.node.zone) ||
      a.node.label.localeCompare(b.node.label, "en", { sensitivity: "base" }),
    );
    const height = Math.max(850, Math.ceil(entries.length / 3.5) * ROW_GAP);
    entries.forEach(({ node, startYear }) => {
      const x = marker.x + Math.max(18, (startYear - marker.year) * marker.width / 10);
      const preferredY = BODY_TOP + Math.round(stableFraction(node.id) * height);
      let y = preferredY;
      for (let step = 0; ; step += 1) {
        const candidate = preferredY + (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * ROW_GAP;
        if (candidate < BODY_TOP) continue;
        if (occupied.every((item) =>
          Math.abs(item.x - x) >= MIN_NODE_GAP_X || Math.abs(item.y - candidate) >= MIN_NODE_GAP_Y
        )) {
          y = candidate;
          break;
        }
      }
      occupied.push({ x, y });
      items.push({
        node,
        startYear,
        decade: marker.year,
        x,
        y,
      });
      knownBottom = Math.max(knownBottom, y + ROW_GAP);
    });
  }

  const unknown = {
    left: START_X + 80,
    top: knownBottom + 470,
    columns: Math.max(1, Math.floor((nextX - START_X - 160) / 164)),
    rowGap: ROW_GAP,
    count: undated.length,
  };
  unknown.columnGap = (nextX - START_X - 160) / unknown.columns;
  undated.sort((a, b) =>
    a.zone.localeCompare(b.zone) ||
    a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
  );
  undated.forEach((node, index) => {
    items.push({
      node,
      decade: null,
      x: unknown.left + (index % unknown.columns + 0.5) * unknown.columnGap,
      y: unknown.top + Math.floor(index / unknown.columns) * unknown.rowGap,
    });
  });

  return {
    items,
    guide: {
      markers,
      minY: BODY_TOP - 230,
      maxY: knownBottom + 150,
      unknown,
      unknownBottom: unknown.top + Math.ceil((undated.length + 24) / unknown.columns) * ROW_GAP + 100,
    },
  };
}
