import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  claimItem, coordinates, englishLabel, locationClaim, musicbrainzId, placementFromClaim, wikidataId, wikipediaArticle,
} from "../../shared/geography/wikidata-geography.mjs";

const reviewedCorrections = [{
  nodeId: "bee-gees", placeId: "Q1026184", role: "musical_base",
  evidenceUrl: "https://www.beegees.com/bee-gees-way-redcliffe-australia/",
  identitySource: "https://musicbrainz.org/artist/bf0f7e29-dfe1-416c-b5c6-f9ebc19ea810",
  identityNote: "MusicBrainz independently places the Bee Gees' formation in Redcliffe, matching the band's own history.",
  note: "The group took the Bee Gees name and began its documented career in Redcliffe, Queensland. The band's own history and MusicBrainz agree; Wikidata Q133405 currently has an incorrect, unsourced formation place in Argentina. This is a city-centre map point, not a venue or later residence.",
}, {
  nodeId: "kvelertak", placeId: "Q25416", role: "musical_base",
  evidenceUrl: "https://musicbrainz.org/artist/61fdc79c-df1a-4999-8d2f-668f18c11283",
  identitySource: "https://www.wikidata.org/wiki/Q1794838",
  identityNote: "The graph's older Wikidata link Q1757337 identifies the album, not the band. MusicBrainz links the band to Q1794838.",
  note: "MusicBrainz documents Kvelertak as founded in Stavanger in 2007. The coordinate marks the city centre, not a venue or later residence.",
}];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const graphPath = path.join(root, "site/public/data/graph.json");
const blockedPath = path.join(root, "shared/graph-schema/blocked-entities.json");
const globeExcludedPath = path.join(root, "site/src/globe/excluded.json");
const outputPath = path.join(root, "site/public/data/geography.json");
const runDir = path.join(root, "brain/data/runs");
const cachePath = path.join(runDir, "geography-api-cache.json");
const candidatePath = path.join(runDir, "geography-candidate-review.json");
const unresolvedPath = path.join(runDir, "geography-unresolved-review.json");
const labelReviewPath = path.join(runDir, "geography-label-review.json");
const apply = process.argv.includes("--apply");
const includeLive = process.argv.includes("--live");
const includeCandidates = process.argv.includes("--candidates");
const auditLabels = process.argv.includes("--audit-labels");
const acceptExactLabels = process.argv.includes("--accept-exact-labels");
const userAgent = "MHMGeographyScout/0.1 (https://github.com/Kenhugo-DT/MHM; read-only source audit)";
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
let lastRequest = 0;
let fetched = 0;
let cacheDirty = false;

function saveCache() {
  if (!cacheDirty) return;
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  cacheDirty = false;
}

async function api(host, params) {
  const target = new URL(`https://${host}/w/api.php`);
  for (const [key, value] of Object.entries({ ...params, format: "json", maxlag: "15" })) {
    target.searchParams.set(key, value);
  }
  const key = target.toString();
  if (cache[key]) return cache[key];
  const previous = key.replace("maxlag=15", "maxlag=5");
  if (cache[previous]) return cache[previous];
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = Math.max(0, 1000 - (Date.now() - lastRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    let response;
    try {
      response = await fetch(target, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (response.ok) {
        const result = await response.json();
        if (!result.error) {
          cache[key] = result;
          fetched += 1;
          cacheDirty = true;
          return result;
        }
        lastError = `${result.error.code}: ${result.error.info}`;
        if (result.error.code !== "maxlag") throw new Error(lastError);
      } else if (response.status !== 429 && response.status < 500) {
        throw new Error(`${host} returned ${response.status}`);
      }
    } catch (error) {
      if (attempt === 3) throw error;
    }
    if (attempt === 3) throw new Error(`${host} unavailable (${response?.status ?? "network error"}): ${lastError ?? "no API detail"}`);
    await new Promise((resolve) => setTimeout(resolve, Math.max(1500 * 2 ** attempt, Number(response?.headers?.get("retry-after") || 0) * 1000)));
  }
}

function chunks(items, size = 45) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function wikipediaItems(articles) {
  const result = new Map();
  const hosts = new Set(articles.map((article) => article.host));
  for (const host of hosts) {
    const titles = [...new Set(articles.filter((article) => article.host === host).map((article) => article.title))];
    for (const group of chunks(titles)) {
    const response = await api(host, {
      action: "query", prop: "pageprops", ppprop: "wikibase_item", redirects: "1",
      formatversion: "2", titles: group.join("|"),
    });
    const redirects = new Map([...(response.query?.normalized ?? []), ...(response.query?.redirects ?? [])]
      .map((item) => [item.from, item.to]));
    const pages = new Map((response.query?.pages ?? []).map((page) => [page.title, page.pageprops?.wikibase_item]));
    for (const title of group) {
      let resolved = title;
      for (let index = 0; index < 3 && redirects.has(resolved); index += 1) resolved = redirects.get(resolved);
      if (pages.get(resolved)) result.set(`${host}:${title}`, pages.get(resolved));
    }
    }
  }
  return result;
}

async function entities(ids) {
  const result = new Map();
  for (const group of chunks([...new Set(ids)].filter((id) => /^Q\d+$/.test(id ?? "")))) {
    const response = await api("www.wikidata.org", {
      action: "wbgetentities", ids: group.join("|"), props: "claims|labels", languages: "en|mul",
    });
    for (const entity of Object.values(response.entities ?? {})) {
      if (!entity.missing) result.set(entity.id, entity);
    }
  }
  return result;
}

async function musicbrainz(resource, id) {
  const target = `https://musicbrainz.org/ws/2/${resource}/${id}?inc=url-rels&fmt=json`;
  if (cache[target]) return cache[target];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = Math.max(0, 1200 - (Date.now() - lastRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    try {
      const response = await fetch(target, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (response.ok) {
        cache[target] = await response.json();
        fetched += 1;
        cacheDirty = true;
        return cache[target];
      }
      if (response.status !== 503 && response.status !== 429) return undefined;
    } catch (error) {
      if (attempt === 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500 * 2 ** attempt));
  }
  return undefined;
}

function relatedWikidata(entity) {
  const ids = new Set((entity?.relations ?? []).flatMap((relation) => {
    const id = wikidataId([{ url: relation.url?.resource }]);
    return id ? [id] : [];
  }));
  return ids.size === 1 ? [...ids][0] : undefined;
}

function sameName(a, b) {
  const normalize = (value) => String(value ?? "").toLocaleLowerCase("en").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return normalize(a) === normalize(b);
}

async function liveNodes() {
  if (!includeLive || !process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return [];
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("entities").select("id,label,node_type,sources").order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows.map((row) => ({ id: row.id, label: row.label, type: row.node_type, sources: row.sources ?? [] }));
}

async function researchCandidates() {
  if (!includeCandidates || !process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return [];
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await client.from("research_candidates")
    .select("id,status,seed_name,requested_kind,payload")
    .in("status", ["review", "approved"]).limit(1000);
  if (error) throw error;
  return data.filter((row) => row.payload?.kind !== "typed_connection")
    .map((row) => ({
      id: `candidate:${row.id}`, label: row.payload?.name || row.seed_name,
      type: row.requested_kind, status: row.status,
      sources: [
        ...(row.payload?.wikidata?.id ? [{ url: `https://www.wikidata.org/wiki/${row.payload.wikidata.id}` }] : []),
        ...(row.payload?.wikipedia?.title ? [{ url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.payload.wikipedia.title.replaceAll(" ", "_"))}` }] : []),
      ],
    }));
}

function bridgeNotes(graph, placements) {
  const located = new Map();
  for (const entry of [...placements].sort((a, b) =>
    Number(a.role !== "musical_base") - Number(b.role !== "musical_base"))) {
    if (!located.has(entry.nodeId)) located.set(entry.nodeId, entry);
  }
  return (graph.edges ?? []).flatMap((edge) => {
    const from = located.get(edge.source);
    const to = located.get(edge.target);
    if (!from || !to || from.placeId === to.placeId || !edge.sources?.length ||
      /^wikipedia (?:link|category) signal$/i.test(edge.label ?? "")) return [];
    return [{
      edgeId: edge.id, sourceId: edge.source, targetId: edge.target,
      sourcePlaceId: from.placeId, targetPlaceId: to.placeId,
      sourcePlaceRole: from.role, targetPlaceRole: to.role,
      relationType: edge.type,
      note: `Existing ${edge.type.replaceAll("_", " ")} relation connects ${from.role === "birthplace" ? "a person born" : "a group formed"} in ${from.place.name} with ${to.role === "birthplace" ? "a person born" : "a group formed"} in ${to.place.name}. This is geographic context, not evidence of travel or directional influence.`,
      sourceUrls: edge.sources.map((source) => source.url).filter(Boolean),
    }];
  });
}

async function main() {
  if (acceptExactLabels && !auditLabels) throw new Error("--accept-exact-labels requires --audit-labels.");
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const blockedIds = new Set([
    ...JSON.parse(fs.readFileSync(blockedPath, "utf8")).entities.map((entry) => entry.id),
    ...JSON.parse(fs.readFileSync(globeExcludedPath, "utf8")),
  ]);
  const publishedIds = new Set(graph.nodes.map((node) => node.id));
  const byId = new Map(graph.nodes.filter((node) => !blockedIds.has(node.id)).map((node) => [node.id, node]));
  for (const node of await liveNodes()) {
    if (blockedIds.has(node.id)) continue;
    const approved = byId.get(node.id);
    if (!approved) { byId.set(node.id, node); continue; }
    const sources = [...(approved.sources ?? [])];
    for (const source of node.sources ?? []) {
      if (!sources.some((item) => item.url === source.url)) sources.push(source);
    }
    byId.set(node.id, { ...node, sources });
  }
  const targets = [...byId.values()].filter((node) => ["band", "artist", "guitarist"].includes(node.type));
  const candidates = await researchCandidates();
  const all = [...targets, ...candidates];
  const articles = all.map((node) => wikipediaArticle(node.sources)).filter(Boolean);
  const titleIds = await wikipediaItems(articles);
  const identity = new Map();
  const identityConflicts = [];
  for (const node of all) {
    const direct = wikidataId(node.sources);
    const article = wikipediaArticle(node.sources);
    const byPage = article && titleIds.get(`${article.host}:${article.title}`);
    if (direct && byPage && direct !== byPage) {
      identityConflicts.push(node.id);
      continue;
    }
    if (direct || byPage) identity.set(node.id, direct || byPage);
  }
  const subjects = await entities([...identity.values()]);
  const beginAreas = new Map();
  let musicbrainzChecked = 0;
  for (const node of all) {
    if (locationClaim(node, subjects.get(identity.get(node.id)))) continue;
    const mbid = musicbrainzId(node.sources);
    if (!mbid) continue;
    const artist = await musicbrainz("artist", mbid);
    musicbrainzChecked += 1;
    if (!artist || !sameName(artist.name, node.label) ||
      (node.type === "band" ? artist.type !== "Group" : artist.type !== "Person")) continue;
    const related = relatedWikidata(artist);
    if (related && identity.has(node.id) && identity.get(node.id) !== related) {
      identityConflicts.push(node.id);
      continue;
    }
    if (related && !identity.has(node.id)) identity.set(node.id, related);
    if (artist["begin-area"]?.id) beginAreas.set(node.id, { areaId: artist["begin-area"].id, mbid });
  }
  const additionalSubjects = await entities([...identity.values()].filter((id) => !subjects.has(id)));
  for (const [id, entity] of additionalSubjects) subjects.set(id, entity);
  let labelReview = [];
  const exactIdentitySources = new Map();
  if (auditLabels) {
    const unmatched = all.filter((node) => !identity.has(node.id));
    const matches = await wikipediaItems(unmatched.map((node) => ({ host: "en.wikipedia.org", title: node.label })));
    const possible = await entities([...matches.values()]);
    const classifications = await entities([...possible.values()].flatMap((entity) => [
      ...(entity.claims?.P31 ?? []).map((item) => item.mainsnak?.datavalue?.value?.id),
      ...(entity.claims?.P106 ?? []).map((item) => item.mainsnak?.datavalue?.value?.id),
    ]).filter(Boolean));
    labelReview = unmatched.flatMap((node) => {
      const qid = matches.get(`en.wikipedia.org:${node.label}`);
      const entity = possible.get(qid);
      if (!entity || !sameName(entity.labels?.en?.value, node.label)) return [];
      const classes = (entity.claims?.P31 ?? []).map((item) => classifications.get(item.mainsnak?.datavalue?.value?.id)?.labels?.en?.value).filter(Boolean);
      const occupations = (entity.claims?.P106 ?? []).map((item) => classifications.get(item.mainsnak?.datavalue?.value?.id)?.labels?.en?.value).filter(Boolean);
      const typeMatched = node.type === "band"
        ? classes.some((name) => /\b(band|musical group|music group|musical ensemble|orchestra|duo|trio|quartet|choir|hip hop group)\b/i.test(name))
        : classes.includes("human") && occupations.some((name) => /\b(musician|singer|composer|guitarist|songwriter|rapper|conductor|pianist|producer|keyboardist|drummer|bassist|violinist|vocalist|disc jockey)\b/i.test(name));
      return [{ nodeId: node.id, label: node.label, type: node.type, qid,
        article: `https://en.wikipedia.org/wiki/${encodeURIComponent(node.label.replaceAll(" ", "_"))}`,
        classes, occupations, typeMatched, hasLocationClaim: Boolean(locationClaim(node, entity)) }];
    });
    if (acceptExactLabels) {
      const names = new Map();
      for (const node of all) {
        const key = node.label.toLocaleLowerCase("en");
        names.set(key, (names.get(key) ?? 0) + 1);
      }
      for (const match of labelReview) {
        if (!match.typeMatched || !match.hasLocationClaim || names.get(match.label.toLocaleLowerCase("en")) !== 1) continue;
        const node = all.find((entry) => entry.id === match.nodeId);
        if (!node?.sources?.length || identity.has(node.id) || identityConflicts.includes(node.id)) continue;
        identity.set(node.id, match.qid);
        subjects.set(match.qid, possible.get(match.qid));
        exactIdentitySources.set(node.id, match.article);
      }
    }
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(labelReviewPath, `${JSON.stringify({ version: 1, suggestions: labelReview }, null, 2)}\n`);
  }
  const areaQids = new Map();
  for (const areaId of new Set([...beginAreas.values()].map((entry) => entry.areaId))) {
    const area = await musicbrainz("area", areaId);
    const qid = relatedWikidata(area);
    if (qid) areaQids.set(areaId, qid);
  }
  const claims = all.flatMap((node) => {
    if (identityConflicts.includes(node.id)) return [];
    const entity = subjects.get(identity.get(node.id));
    const direct = entity && locationClaim(node, entity);
    const begin = beginAreas.get(node.id);
    const placeId = areaQids.get(begin?.areaId);
    const claim = direct || (begin && placeId ? {
      nodeId: node.id, entityId: begin.mbid, placeId,
      role: node.type === "band" ? "musical_base" : "birthplace",
      property: "MB_BEGIN_AREA",
    } : undefined);
    return claim ? [{ ...claim, ...(exactIdentitySources.has(node.id)
      ? { identitySource: exactIdentitySources.get(node.id) } : {}) }] : [];
  });
  const places = await entities([...claims.map((claim) => claim.placeId), ...reviewedCorrections.map((item) => item.placeId)]);
  const countries = await entities([...places.values()].map((place) => claimItem(place, "P17")).filter(Boolean));
  const found = claims.flatMap((claim) => {
    const place = places.get(claim.placeId);
    const country = countries.get(claimItem(place, "P17"));
    const placement = placementFromClaim(claim, place, country);
    return placement ? [placement] : [];
  });
  const corrections = reviewedCorrections.flatMap((item) => {
    if (!byId.has(item.nodeId)) return [];
    const place = places.get(item.placeId);
    const country = countries.get(claimItem(place, "P17"));
    const point = coordinates(place);
    if (!point || !englishLabel(place) || !englishLabel(country)) return [];
    return [{
      nodeId: item.nodeId, placeId: `wikidata:${item.placeId}`, role: item.role,
      place: { id: `wikidata:${item.placeId}`, name: englishLabel(place), country: englishLabel(country), ...point },
      evidenceUrl: item.evidenceUrl, evidence: "Independently reviewed correction",
      note: item.note, sourceProperty: "REVIEWED",
      coordinateSource: `https://www.wikidata.org/wiki/${item.placeId}#P625`,
      identitySource: item.identitySource, identityNote: item.identityNote,
    }];
  });
  const corrected = new Set(corrections.map((entry) => `${entry.nodeId}:${entry.role}`));
  const placements = [...found.filter((entry) => !entry.nodeId.startsWith("candidate:") && !corrected.has(`${entry.nodeId}:${entry.role}`)), ...corrections]
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId) || a.role.localeCompare(b.role));
  const pending = found.filter((entry) => entry.nodeId.startsWith("candidate:"))
    .map((entry) => ({ ...entry, candidateStatus: candidates.find((node) => node.id === entry.nodeId)?.status }));
  const placedIds = new Set(placements.map((entry) => entry.nodeId));
  const claimedIds = new Set(claims.map((entry) => entry.nodeId));
  const unresolved = targets.filter((node) => !placedIds.has(node.id)).map((node) => ({
    nodeId: node.id, label: node.label, type: node.type,
    reason: identityConflicts.includes(node.id) ? "identity_conflict"
      : !identity.has(node.id) ? "identity_unresolved"
        : !claimedIds.has(node.id) ? "location_claim_missing" : "place_or_coordinates_missing",
    sourceUrls: (node.sources ?? []).map((source) => source.url).filter(Boolean),
  }));
  const unresolvedByReason = Object.fromEntries([...new Set(unresolved.map((item) => item.reason))]
    .map((reason) => [reason, unresolved.filter((item) => item.reason === reason).length]));
  const bridges = bridgeNotes(graph, placements);
  const summary = {
    graphTargets: targets.length,
    liveOnlyNodeIds: targets.filter((node) => !publishedIds.has(node.id)).map((node) => node.id),
    candidatesChecked: candidates.length,
    identified: identity.size,
    identityConflicts: identityConflicts.length,
    claims: claims.length,
    musicbrainzChecked,
    exactLabelMatches: labelReview.length,
    typedLabelMatchesWithLocation: labelReview.filter((item) => item.typeMatched && item.hasLocationClaim).length,
    exactLabelsAccepted: exactIdentitySources.size,
    placed: placements.length,
    bandsPlaced: placements.filter((entry) => byId.get(entry.nodeId)?.type === "band").length,
    peopleWithBirthplace: placements.filter((entry) => entry.role === "birthplace").length,
    candidatesWithLocation: pending.length,
    reviewedCorrections: corrections.length,
    unplaced: unresolved.length,
    unresolvedByReason,
    sourcedCrossPlaceRelations: bridges.length,
    fetchedApiBatches: fetched,
  };
  if (apply) {
    fs.writeFileSync(outputPath, `${JSON.stringify({ version: 1, summary, placements, bridgeNotes: bridges }, null, 2)}\n`);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(candidatePath, `${JSON.stringify({ version: 1, summary, placements: pending, identityConflicts }, null, 2)}\n`);
    fs.writeFileSync(unresolvedPath, `${JSON.stringify({ version: 1, summary, nodes: unresolved }, null, 2)}\n`);
  }
  saveCache();
  console.log(JSON.stringify({ ...summary, applied: apply, output: apply ? outputPath : undefined }, null, 2));
}

main().catch((error) => { saveCache(); console.error(error); process.exitCode = 1; });
