const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function lookupMusicBrainzArtist(mbid) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=artist-rels&fmt=json`, {
      headers: { "User-Agent": "MHM-ConnectionEvidence/0.1 (https://github.com/Kenhugo-DT/MHM)" },
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return response.json();
    if (response.status === 404) return undefined;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`MusicBrainz ${mbid}: HTTP ${response.status}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await delay(Math.max(Number.isFinite(retryAfter) ? retryAfter * 1000 : 0, 3000 * 2 ** attempt));
  }
}
