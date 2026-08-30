import type { GraphNode } from "../types/graph";
import {
  WIKI_API_HEADERS,
  type WikiSource,
  wikiSourceForNode,
} from "./wiki-source";

export interface WikiDetail {
  title: string;
  extract: string;
  url: string;
  language: string;
  thumbnailUrl?: string;
  retrievedAt: string;
}

interface CachedWikiDetail {
  cachedAt: string;
  detail: WikiDetail;
}

interface WikipediaPage {
  title?: string;
  fullurl?: string;
  extract?: string;
  missing?: boolean;
  thumbnail?: {
    source?: string;
  };
}

const CACHE_NAME = "guitars-wiki-details-v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const inMemoryCache = new Map<string, CachedWikiDetail>();
const inFlightRequests = new Map<string, Promise<WikiDetail | undefined>>();

function cacheKey(source: WikiSource): string {
  const encodedTitle = encodeURIComponent(source.title.replace(/ /g, "_"));
  return `https://guitars-history-map.local/wiki-cache/${source.language}/${encodedTitle}`;
}

function isFresh(cached: CachedWikiDetail): boolean {
  return Date.now() - Date.parse(cached.cachedAt) < CACHE_TTL_MS;
}

function localStorageKey(key: string): string {
  return `${CACHE_NAME}:${key}`;
}

function readLocalStorageDetail(key: string): WikiDetail | undefined {
  try {
    const raw = window.localStorage.getItem(localStorageKey(key));
    if (!raw) return undefined;

    const cached = JSON.parse(raw) as CachedWikiDetail;
    if (!isFresh(cached)) return undefined;
    inMemoryCache.set(key, cached);
    return cached.detail;
  } catch {
    return undefined;
  }
}

function writeLocalStorageDetail(key: string, cached: CachedWikiDetail): void {
  try {
    window.localStorage.setItem(localStorageKey(key), JSON.stringify(cached));
  } catch {
    // Local storage can fail in private browsing or when the quota is full.
  }
}

async function readCachedDetail(key: string): Promise<WikiDetail | undefined> {
  const memory = inMemoryCache.get(key);
  if (memory && isFresh(memory)) return memory.detail;

  if ("caches" in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(new Request(key));
      if (response) {
        const cached = (await response.json()) as CachedWikiDetail;
        if (isFresh(cached)) {
          inMemoryCache.set(key, cached);
          return cached.detail;
        }
      }
    } catch {
      // Fall through to localStorage.
    }
  }

  return readLocalStorageDetail(key);
}

async function writeCachedDetail(key: string, detail: WikiDetail): Promise<void> {
  const cached: CachedWikiDetail = {
    cachedAt: new Date().toISOString(),
    detail,
  };
  inMemoryCache.set(key, cached);
  writeLocalStorageDetail(key, cached);

  if (!("caches" in window)) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      new Request(key),
      new Response(JSON.stringify(cached), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    // Cache storage can fail in private browsing or under quota pressure.
  }
}

async function requestWikiDetail(source: WikiSource): Promise<WikiDetail | undefined> {
  const endpoint = `https://${source.language}.wikipedia.org/w/api.php`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    redirects: "1",
    prop: "extracts|pageimages|info",
    inprop: "url",
    exintro: "1",
    explaintext: "1",
    piprop: "thumbnail",
    pithumbsize: "900",
    pilicense: "free",
    titles: source.title,
  });

  const response = await fetch(`${endpoint}?${params}`, {
    headers: WIKI_API_HEADERS,
  });
  if (!response.ok) throw new Error(`Wikipedia responded with ${response.status}.`);

  const payload = (await response.json()) as {
    query?: {
      pages?: WikipediaPage[];
    };
  };
  const page = payload.query?.pages?.[0];
  if (!page || page.missing || !page.extract) return undefined;

  return {
    title: page.title ?? source.title,
    extract: page.extract.trim(),
    url: page.fullurl ?? source.url,
    language: source.language,
    thumbnailUrl: page.thumbnail?.source,
    retrievedAt: new Date().toISOString(),
  };
}

export async function fetchWikiDetailForNode(
  node: GraphNode,
): Promise<WikiDetail | undefined> {
  const source = wikiSourceForNode(node);
  if (!source) return undefined;

  const key = cacheKey(source);
  const cached = await readCachedDetail(key);
  if (cached) return cached;

  const existingRequest = inFlightRequests.get(key);
  if (existingRequest) return existingRequest;

  const request = requestWikiDetail(source).then(async (detail) => {
    if (detail) await writeCachedDetail(key, detail);
    return detail;
  });
  inFlightRequests.set(key, request);

  try {
    return await request;
  } finally {
    inFlightRequests.delete(key);
  }
}
