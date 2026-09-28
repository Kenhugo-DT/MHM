const SIGNAL_LABEL = /^wikipedia (?:link|category) signal$/i;
const SIGNAL_CONTEXT = /^wikipedia (?:link|category):/i;

export function edgeEvidenceTier(edge) {
  const label = String(edge?.label ?? "").trim();
  const context = Array.isArray(edge?.context) ? edge.context : [];
  if (SIGNAL_LABEL.test(label) || context.some((item) => SIGNAL_CONTEXT.test(String(item).trim()))) {
    return "research_lead";
  }
  const sources = Array.isArray(edge?.sources) ? edge.sources : [];
  return sources.some((source) => String(source?.url ?? "").trim())
    ? "source_linked"
    : "curated_unsourced";
}

export function isMapConnection(edge) {
  return edgeEvidenceTier(edge) !== "research_lead";
}
