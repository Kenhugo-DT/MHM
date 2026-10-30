import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const input = JSON.parse(fs.readFileSync(path.join(root, "brain/data/runs/early-era-source-pool.json"), "utf8"));
const candidates = [...new Map(input.candidates.map((item) => [item.qid, item])).values()];
const batches = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const headers = { "User-Agent": "MHMResearch/1.0 (music history map; GitHub Kenhugo-DT/MHM)" };

async function readJson(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers });
    if (response.ok) return response.json();
    if (attempt === 2) throw new Error(`${response.status} from ${new URL(url).host}`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
}

const entities = new Map();
for (const batch of batches(candidates, 40)) {
  const ids = batch.map((item) => item.qid).join("|");
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(ids)}&props=claims%7Cdescriptions&languages=en&format=json`;
  const data = await readJson(url);
  for (const [qid, entity] of Object.entries(data.entities ?? {})) entities.set(qid, entity);
}

const role = /\b(composer|musician|singer|guitarist|instrumentalist|pianist|violinist|cellist|conductor|organist|harpsichordist|songwriter|sitarist|saxophonist|trumpeter|bandleader|hymnist|musicologist|operatic soprano)\b/i;
const nonMusicalLead = /^(?:American|English|British|French|German|Russian|Italian|Austrian|Scottish|Australian|Canadian|Spanish|Polish|Swedish|Dutch|Irish|Soviet|Ukrainian|Finnish|Mexican|Argentine|Japanese|Indian|Greek|Portuguese|Norwegian|Danish|Hungarian|Czech|Swiss|Belgian|Turkish|Armenian|Romanian|Chilean|Bengali|New Zealand|South African|Serbian|Slovenian|Croatian|Israeli|Icelandic|Chinese|Korean|Brazilian|Egyptian|British-American|American-born)\s+(?:writer|actor|actress|film director|filmmaker|politician|poet|novelist|philosopher|painter|scholar|royal|noble|prince|princess)\b/i;

const reviewed = candidates.map((item) => {
  const entity = entities.get(item.qid);
  const birth = entity?.claims?.P569?.find((claim) => claim.mainsnak?.datavalue?.value?.time)?.mainsnak.datavalue.value.time;
  const birthYear = birth && /^\+\d{4}/.test(birth) ? Number(birth.slice(1, 5)) : null;
  const death = entity?.claims?.P570?.find((claim) => claim.mainsnak?.datavalue?.value?.time)?.mainsnak.datavalue.value.time;
  const deathYear = death && /^\+\d{4}/.test(death) ? Number(death.slice(1, 5)) : null;
  const musicbrainzId = entity?.claims?.P434?.find((claim) => claim.mainsnak?.datavalue?.value)?.mainsnak.datavalue.value ?? null;
  const genreIds = (entity?.claims?.P136 ?? []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
  const startClaim = entity?.claims?.P2031?.find((claim) =>
    Number(claim.mainsnak?.datavalue?.value?.time?.slice(1, 5)) === item.startYear);
  const startReferenceCount = startClaim?.references?.length ?? 0;
  const issues = [];
  if (!role.test(item.description)) issues.push("music identity not clear in description");
  if (nonMusicalLead.test(item.description)) issues.push("primarily non-musical identity");
  if (birthYear && item.startYear < birthYear + 8) issues.push("work start predates plausible career age");
  if (birthYear && item.startYear > birthYear + 85) issues.push("work start implausibly late");
  if (deathYear && item.startYear > deathYear) issues.push("work start follows death");
  if (!musicbrainzId && item.sitelinks < 8) issues.push("limited independent identity signals");
  return { ...item, birthYear, deathYear, musicbrainzId, genreIds, startReferenceCount, issues };
});

const output = path.join(root, "brain/data/runs/early-era-reviewed-pool.json");
fs.writeFileSync(output, JSON.stringify({ source: input.source, candidates: reviewed }, null, 2));
for (let year = 1600; year < 1950; year += 50) {
  const items = reviewed.filter((item) => item.startYear >= year && item.startYear < year + 50);
  console.log(`${year}-${year + 49}: ${items.filter((item) => item.issues.length === 0).length} eligible / ${items.length} checked`);
}
console.log(`Saved detailed source checks to ${output}`);
