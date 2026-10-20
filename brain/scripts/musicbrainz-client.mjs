const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;

async function requestMusicBrainz(path) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await delay(Math.max(0, 1250 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    const response = await fetch(`https://musicbrainz.org/ws/2/${path}`, {
      headers: { "User-Agent": "MHM-ConnectionEvidence/0.1 (https://github.com/Kenhugo-DT/MHM)" },
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return response.json();
    if (response.status === 404) return undefined;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`MusicBrainz HTTP ${response.status}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await delay(Math.max(Number.isFinite(retryAfter) ? retryAfter * 1000 : 0, 3000 * 2 ** attempt));
  }
}

export function exactMusicBrainzArtistMatch(results, name, kind) {
  const expectedType = kind === "band" ? "Group" : "Person";
  const matches = (results ?? []).filter((artist) =>
    artist.name?.trim().toLocaleLowerCase("en") === name.trim().toLocaleLowerCase("en") &&
    artist.type === expectedType
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export async function searchMusicBrainzArtist(name, kind) {
  const query = encodeURIComponent(`artist:"${name.replaceAll('"', "")}"`);
  const result = await requestMusicBrainz(`artist?query=${query}&limit=10&fmt=json`);
  return exactMusicBrainzArtistMatch(result?.artists, name, kind);
}

export async function lookupMusicBrainzArtist(mbid) {
  return requestMusicBrainz(`artist/${mbid}?inc=artist-rels&fmt=json`);
}
