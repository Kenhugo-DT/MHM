import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "brain/data/approved/graph.json"), "utf8"));
const learning = JSON.parse(fs.readFileSync(path.join(root, "brain/data/approved/learning-model.json"), "utf8"));
const output = path.join(root, "brain/data/source-reviews/2026-10-02-start-years.json");

function wikiTitle(node) {
  const source = node.sources?.find(({ url }) => url?.startsWith("https://en.wikipedia.org/wiki/"));
  if (!source) return undefined;
  return decodeURIComponent(new URL(source.url).pathname.slice(6)).replaceAll("_", " ");
}

function statementYears(entity, property) {
  return (entity?.claims?.[property] ?? [])
    .filter((claim) => claim.rank !== "deprecated")
    .map((claim) => ({
      year: Number(claim.mainsnak?.datavalue?.value?.time?.slice(1, 5)),
      claimId: claim.id,
      references: claim.references?.length ?? 0,
      referenceDetails: (claim.references ?? []).map((reference) => ({
        statedIn: reference.snaks?.P248?.map((snak) => snak.datavalue?.value?.id).filter(Boolean) ?? [],
        urls: reference.snaks?.P854?.map((snak) => snak.datavalue?.value).filter(Boolean) ?? [],
        importedFrom: reference.snaks?.P143?.map((snak) => snak.datavalue?.value?.id).filter(Boolean) ?? [],
      })),
    }))
    .filter(({ year }) => Number.isInteger(year) && year >= 1400 && year <= 2026);
}

async function fetchEntities(titles) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    action: "wbgetentities",
    sites: "enwiki",
    titles: titles.join("|"),
    props: "claims|sitelinks|labels|descriptions",
    languages: "en",
    format: "json",
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "MHM-StartYearAudit/0.1 (https://github.com/Kenhugo-DT/MHM)" },
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return Object.values((await response.json()).entities ?? {});
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error(`Wikidata request failed: ${response.status} ${response.headers.get("retry-after") ?? ""}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await new Promise((resolve) => setTimeout(resolve, Math.max(
      Number.isFinite(retryAfter) ? retryAfter * 1000 : 0,
      5000 * 2 ** attempt,
    )));
  }
}

const missing = graph.nodes.filter((node) =>
  !Number.isInteger(node.eraStart) && !Number.isInteger(learning.nodes?.[node.id]?.eraStart)
);
const titles = [...new Set(missing.map(wikiTitle).filter(Boolean))];
const byTitle = new Map();
for (let offset = 0; offset < titles.length; offset += 10) {
  for (const entity of await fetchEntities(titles.slice(offset, offset + 10))) {
    const title = entity.sitelinks?.enwiki?.title;
    if (title) byTitle.set(title.replaceAll("_", " "), entity);
  }
  console.log(`Checked ${Math.min(offset + 10, titles.length)}/${titles.length} encyclopedia titles`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

const results = missing.map((node) => {
  const title = wikiTitle(node);
  const entity = byTitle.get(title);
  const instanceOf = (entity?.claims?.P31 ?? []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
  const property = ["artist", "guitarist"].includes(node.type) ? "P2031" : "P571";
  const claims = statementYears(entity, property);
  const years = [...new Set(claims.map(({ year }) => year))];
  const status = !entity ? "not-found"
    : node.type === "genre" ? "genre-needs-context"
      : node.type === "band" && instanceOf.includes("Q5") ? "type-mismatch"
        : years.length === 0 ? "no-claim"
          : years.length > 1 ? "conflicting-years"
            : "candidate";
  return {
    id: node.id,
    label: node.label,
    type: node.type,
    title,
    entityId: entity?.id,
    description: entity?.descriptions?.en?.value,
    instanceOf,
    musicbrainzIds: (entity?.claims?.P434 ?? []).map((claim) => claim.mainsnak?.datavalue?.value).filter(Boolean),
    property,
    claims,
    status,
    sourceUrl: entity?.id ? `https://www.wikidata.org/wiki/${entity.id}` : undefined,
  };
});

fs.writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
const counts = Object.groupBy(results, ({ status }) => status);
console.log(`Audited ${results.length} nodes: ${Object.entries(counts).map(([status, rows]) => `${status} ${rows.length}`).join(", ")}`);
console.log(`Saved ${output}`);
