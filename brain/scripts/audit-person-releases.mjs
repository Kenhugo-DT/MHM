import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const input = path.join(root, "brain/data/source-reviews/2026-10-02-start-years.json");
const output = path.join(root, "brain/data/source-reviews/2026-10-02-person-releases.json");
const audit = JSON.parse(fs.readFileSync(input, "utf8"));
const results = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")).results : {};
const people = audit.results.filter((entry) =>
  ["artist", "guitarist"].includes(entry.type) && entry.musicbrainzIds.length === 1
);

function save() {
  fs.writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
}

async function request(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "MHM-StartYearAudit/0.1 (https://github.com/Kenhugo-DT/MHM)" },
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`MusicBrainz request failed: ${response.status} ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000 * 2 ** attempt));
  }
}

let checked = 0;
for (const person of people) {
  if (Object.hasOwn(results, person.id)) continue;
  const id = person.musicbrainzIds[0];
  let offset = 0;
  let total = 0;
  const releases = [];
  do {
    const url = new URL("https://musicbrainz.org/ws/2/release-group");
    url.search = new URLSearchParams({
      artist: id,
      type: "album|single|ep",
      "release-group-status": "website-default",
      limit: "100",
      offset: String(offset),
      fmt: "json",
    });
    const page = await request(url);
    const groups = page["release-groups"] ?? [];
    total = page["release-group-count"] ?? 0;
    releases.push(...groups.filter((group) =>
      /^\d{4}(?:$|-)/.test(group["first-release-date"] ?? "") &&
      !(group["secondary-types"] ?? []).some((type) =>
        ["Compilation", "Live", "Remix", "Interview", "Audiobook"].includes(type)
      )
    ));
    offset += groups.length;
    if (groups.length === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 1250));
  } while (offset < total && offset < 800);

  releases.sort((a, b) => a["first-release-date"].localeCompare(b["first-release-date"]));
  const first = releases[0];
  results[person.id] = {
    catalogCount: total,
    complete: offset >= total,
    first: first ? {
      title: first.title,
      date: first["first-release-date"],
      year: Number(first["first-release-date"].slice(0, 4)),
      type: first["primary-type"],
      sourceUrl: `https://musicbrainz.org/release-group/${first.id}`,
    } : null,
  };
  checked += 1;
  if (checked % 5 === 0) {
    save();
    console.log(`Checked ${checked} additional people`);
  }
}
save();
console.log(`Audited releases for ${Object.keys(results).length}/${people.length} people`);
