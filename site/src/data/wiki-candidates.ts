import type { GraphNode, NodeType } from "../types/graph";
import { isBlockedEntityText } from "../lib/excluded-entities";
import {
  WIKI_API_HEADERS,
  wikipediaPageUrl,
  wikiSourceForNode,
} from "./wiki-source";

export type WikiCandidateSource = "category" | "link";
export type WikiCandidateKind = NodeType | "unknown";

export interface WikiConnectionCandidate {
  title: string;
  url: string;
  source: WikiCandidateSource;
  kind: WikiCandidateKind;
  reason: string;
  score: number;
}

export interface WikiActionContext {
  title: string;
  url: string;
  language: string;
  categories: string[];
  candidates: WikiConnectionCandidate[];
  retrievedAt: string;
}

interface ActionPage {
  title?: string;
  fullurl?: string;
  missing?: boolean;
  categories?: Array<{ title?: string }>;
  links?: Array<{ title?: string }>;
}

const contextCache = new Map<string, WikiActionContext | undefined>();
const inFlightContexts = new Map<string, Promise<WikiActionContext | undefined>>();

const musicTerms = [
  "acoustic",
  "artist",
  "banjo",
  "band",
  "bass",
  "blues",
  "country",
  "electric",
  "fender",
  "folk",
  "funk",
  "gibson",
  "guitar",
  "guitarist",
  "hard rock",
  "heavy metal",
  "ibanez",
  "jazz",
  "metal",
  "music",
  "musician",
  "punk",
  "rickenbacker",
  "rock",
  "songwriter",
];

const releaseTerms = [
  "album",
  "albums",
  "discography",
  "single",
  "singles",
  "song",
  "songs",
  "track",
];

const boringTerms = [
  "articles",
  "births",
  "commons category",
  "deaths",
  "living people",
  "pages",
  "stub",
  "templates",
  "wikipedia",
];

function normalize(text: string): string {
  return text.toLocaleLowerCase("en").replace(/_/g, " ").trim();
}

function categoryLabel(title: string): string {
  return title.replace(/^Category:/, "").trim();
}

function includesAny(text: string, terms: string[]): boolean {
  const normalized = normalize(text);
  return terms.some((term) => normalized.includes(term));
}

function isBlockedTitle(title: string): boolean {
  const normalized = normalize(title);
  return (
    includesAny(normalized, boringTerms) ||
    isBlockedEntityText(normalized) ||
    includesAny(normalized, releaseTerms) ||
    /^list of /.test(normalized) ||
    /^\d{4}/.test(normalized)
  );
}

function classify(text: string, source: WikiCandidateSource): WikiCandidateKind {
  const normalized = normalize(text);

  if (normalized.includes("guitarist")) return "guitarist";
  if (normalized.includes("band") || normalized.includes("music group")) return "band";
  if (normalized.includes("genre") || normalized.includes("rock music")) return "genre";
  if (normalized.includes("guitar manufacturer") || normalized.includes("guitar brands")) {
    return "guitar_brand";
  }
  if (
    normalized.includes("stratocaster") ||
    normalized.includes("telecaster") ||
    normalized.includes("les paul") ||
    normalized.includes("guitar")
  ) {
    return "guitar";
  }
  if (normalized.includes("musician") || normalized.includes("songwriter")) return "artist";

  return source === "category" ? "unknown" : "unknown";
}

function scoreCandidate(title: string, source: WikiCandidateSource, kind: WikiCandidateKind): number {
  const normalized = normalize(title);
  let score = source === "category" ? 0.56 : 0.42;

  if (kind !== "unknown") score += 0.22;
  if (normalized.includes("guitar")) score += 0.18;
  if (normalized.includes("guitarist")) score += 0.12;
  if (normalized.includes("band")) score += 0.1;
  if (normalized.includes("genre")) score += 0.08;
  if (normalized.includes("rock") || normalized.includes("blues")) score += 0.06;

  return Math.min(1, score);
}

function candidateFromCategory(title: string, language: string): WikiConnectionCandidate | undefined {
  const label = categoryLabel(title);
  if (!label || isBlockedTitle(label) || !includesAny(label, musicTerms)) return undefined;

  const kind = classify(label, "category");
  return {
    title: label,
    url: wikipediaPageUrl(language, title),
    source: "category",
    kind,
    reason: `Wikipedia category: ${label}`,
    score: scoreCandidate(label, "category", kind),
  };
}

function candidateFromLink(title: string, language: string): WikiConnectionCandidate | undefined {
  if (!title || isBlockedTitle(title) || !includesAny(title, musicTerms)) return undefined;

  const kind = classify(title, "link");
  return {
    title,
    url: wikipediaPageUrl(language, title),
    source: "link",
    kind,
    reason: "Linked from the selected Wikipedia article",
    score: scoreCandidate(title, "link", kind),
  };
}

function dedupeCandidates(candidates: WikiConnectionCandidate[]): WikiConnectionCandidate[] {
  const byTitle = new Map<string, WikiConnectionCandidate>();

  candidates.forEach((candidate) => {
    const key = normalize(candidate.title);
    const existing = byTitle.get(key);
    if (!existing || candidate.score > existing.score) byTitle.set(key, candidate);
  });

  return [...byTitle.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 12);
}

async function requestActionContext(node: GraphNode): Promise<WikiActionContext | undefined> {
  const source = wikiSourceForNode(node);
  if (!source) return undefined;

  const endpoint = `https://${source.language}.wikipedia.org/w/api.php`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    redirects: "1",
    prop: "categories|links|info",
    inprop: "url",
    cllimit: "80",
    clshow: "!hidden",
    pllimit: "120",
    plnamespace: "0",
    titles: source.title,
  });

  const response = await fetch(`${endpoint}?${params}`, {
    headers: WIKI_API_HEADERS,
  });
  if (!response.ok) throw new Error(`Wikipedia responded with ${response.status}.`);

  const payload = (await response.json()) as {
    query?: {
      pages?: ActionPage[];
    };
  };
  const page = payload.query?.pages?.[0];
  if (!page || page.missing) return undefined;

  const categories = (page.categories ?? [])
    .map((category) => category.title)
    .filter((title): title is string => Boolean(title))
    .map(categoryLabel)
    .filter((title) => !isBlockedTitle(title) && includesAny(title, musicTerms))
    .slice(0, 10);

  const candidates = dedupeCandidates([
    ...(page.categories ?? [])
      .map((category) => category.title)
      .filter((title): title is string => Boolean(title))
      .map((title) => candidateFromCategory(title, source.language))
      .filter((candidate): candidate is WikiConnectionCandidate => Boolean(candidate)),
    ...(page.links ?? [])
      .map((link) => link.title)
      .filter((title): title is string => Boolean(title))
      .map((title) => candidateFromLink(title, source.language))
      .filter((candidate): candidate is WikiConnectionCandidate => Boolean(candidate)),
  ]);

  return {
    title: page.title ?? source.title,
    url: page.fullurl ?? source.url,
    language: source.language,
    categories,
    candidates,
    retrievedAt: new Date().toISOString(),
  };
}

export async function fetchWikiActionContextForNode(
  node: GraphNode,
): Promise<WikiActionContext | undefined> {
  const source = wikiSourceForNode(node);
  if (!source) return undefined;

  const key = `${source.language}:${source.title}`;
  if (contextCache.has(key)) return contextCache.get(key);

  const existingRequest = inFlightContexts.get(key);
  if (existingRequest) return existingRequest;

  const request = requestActionContext(node).then((context) => {
    contextCache.set(key, context);
    return context;
  });
  inFlightContexts.set(key, request);

  try {
    return await request;
  } finally {
    inFlightContexts.delete(key);
  }
}
