import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const input = path.join(root, "brain/data/source-reviews/2026-10-02-start-years.json");
const output = path.join(root, "brain/data/source-reviews/2026-10-02-musicbrainz-years.json");
const audit = JSON.parse(fs.readFileSync(input, "utf8"));
const results = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")).results : {};

function save() {
  fs.writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
}

async function lookup(id) {
  const url = `https://musicbrainz.org/ws/2/artist/${id}?fmt=json`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "MHM-StartYearAudit/0.1 (https://github.com/Kenhugo-DT/MHM)" },
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return response.json();
    if (response.status === 404) return undefined;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`MusicBrainz request failed for ${id}: ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000 * 2 ** attempt));
  }
}

const bands = audit.results.filter((entry) => entry.type === "band" && entry.musicbrainzIds.length === 1);
let checked = 0;
for (const entry of bands) {
  if (Object.hasOwn(results, entry.id)) continue;
  const artist = await lookup(entry.musicbrainzIds[0]);
  const begin = artist?.["life-span"]?.begin;
  const year = /^\d{4}(?:$|-)/.test(begin ?? "") ? Number(begin.slice(0, 4)) : undefined;
  results[entry.id] = {
    name: artist?.name,
    type: artist?.type,
    begin,
    year,
    sourceUrl: `https://musicbrainz.org/artist/${entry.musicbrainzIds[0]}`,
  };
  checked += 1;
  if (checked % 10 === 0) {
    save();
    console.log(`Checked ${checked} additional MusicBrainz artists`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1250));
}
save();
console.log(`Cross-checked ${Object.keys(results).length}/${bands.length} bands`);
