import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "brain/data/approved/graph.json"), "utf8"));
const blocked = JSON.parse(fs.readFileSync(path.join(root, "shared/graph-schema/blocked-entities.json"), "utf8"));
const existing = new Set(graph.nodes.map((node) => node.label.toLocaleLowerCase()));
const excluded = new Set(blocked.entities.flatMap((entity) => entity.labels).map((label) => label.toLocaleLowerCase()));
const pool = [];

for (let year = 1600; year < 1950; year += 50) {
  const end = Math.min(year + 50, 1951);
  const query = `SELECT DISTINCT ?person ?personLabel ?personDescription ?start ?sitelinks ?article WHERE {
    ?person wdt:P2031 ?start; wdt:P106/wdt:P279* wd:Q36834; wikibase:sitelinks ?sitelinks.
    ?article schema:about ?person; schema:isPartOf <https://en.wikipedia.org/>.
    FILTER(YEAR(?start) >= ${year} && YEAR(?start) < ${end})
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } ORDER BY DESC(?sitelinks) LIMIT 70`;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "MHMResearch/1.0 (music history map; GitHub Kenhugo-DT/MHM)",
    } });
    if (response.ok) { result = await response.json(); break; }
    if (attempt === 2) throw new Error(`Wikidata ${year}-${end - 1}: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  const items = result.results.bindings.map((item) => ({
    qid: item.person.value.split("/").pop(),
    name: item.personLabel.value,
    description: item.personDescription?.value ?? "",
    startYear: Number(item.start.value.slice(0, 4)),
    sitelinks: Number(item.sitelinks.value),
    article: item.article.value,
  })).filter((item) => !/^Q\d+$/.test(item.name)
    && !existing.has(item.name.toLocaleLowerCase())
    && !excluded.has(item.name.toLocaleLowerCase()));
  pool.push(...items);
  console.log(`${year}-${end - 1}: ${items.length} new candidates`);
}

const output = path.join(root, "brain/data/runs/early-era-source-pool.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ source: "Wikidata P2031 and English Wikipedia", candidates: pool }, null, 2));
console.log(`Saved ${pool.length} source-backed identities to ${output}`);
