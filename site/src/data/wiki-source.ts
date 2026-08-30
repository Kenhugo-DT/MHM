import type { GraphNode, SourceReference } from "../types/graph";

export interface WikiSource {
  title: string;
  language: string;
  url: string;
}

export const WIKI_API_HEADERS = {
  "Api-User-Agent": "MusicHistoryMap/0.1 (static web app; contact via project repository)",
};

export function sourceToWikiSource(source: SourceReference): WikiSource | undefined {
  if (source.provider !== "wikipedia") return undefined;

  try {
    const url = new URL(source.url);
    if (!url.hostname.endsWith(".wikipedia.org")) return undefined;
    const marker = "/wiki/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return undefined;

    const language = url.hostname.split(".")[0] || "en";
    const rawTitle = url.pathname.slice(markerIndex + marker.length).split("/")[0];
    const title = decodeURIComponent(rawTitle).replace(/_/g, " ").trim();
    if (!title) return undefined;
    return { title, language, url: source.url };
  } catch {
    return undefined;
  }
}

export function wikiSourceForNode(node: GraphNode): WikiSource | undefined {
  const sources = node.sources
    .map(sourceToWikiSource)
    .filter((source): source is WikiSource => Boolean(source));

  return sources.find((source) => source.language === "en") ?? sources[0];
}

export function wikipediaPageUrl(language: string, title: string): string {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}
