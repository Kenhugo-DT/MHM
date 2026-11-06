const registryByArtist = {
  label: "Library of Congress National Recording Registry, by artist",
  url: "https://www.loc.gov/static/programs/national-recording-preservation-board/documents/registry-by-artist.pdf",
  provider: "other",
};

const registryCurrent = {
  label: "Library of Congress National Recording Registry",
  url: "https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/",
  provider: "other",
};

const registryByGenre = {
  label: "Library of Congress National Recording Registry, by genre",
  url: "https://www.loc.gov/static/programs/national-recording-preservation-board/documents/registry-by-genre.pdf",
  provider: "other",
};

// The year identifies a registry recording, never an inferred birth, formation or career start.
// Rows: id, name, type, zone, recording year, recording, nearby genre, source.
const entries = [
  ["king-oliver", "King Oliver", "artist", "jazz", 1923, "Canal Street Blues", "jazz", registryByArtist],
  ["frankie-trumbauer", "Frankie Trumbauer", "artist", "jazz", 1927, "Singin' the Blues", "jazz", registryByArtist],
  ["bix-beiderbecke", "Bix Beiderbecke", "artist", "jazz", 1927, "Singin' the Blues", "jazz", registryByArtist],
  ["mary-lou-williams", "Mary Lou Williams", "artist", "jazz", 1930, "Night Life", "jazz", registryByArtist],
  ["coleman-hawkins", "Coleman Hawkins", "artist", "jazz", 1939, "Body and Soul", "jazz", registryByArtist],
  ["cab-calloway", "Cab Calloway", "artist", "jazz", 1931, "Minnie the Moocher", "jazz", registryByArtist],
  ["kid-ory", "Kid Ory", "artist", "jazz", 1922, "Ory's Creole Trombone", "jazz", registryByArtist],
  ["original-dixieland-jazz-band", "Original Dixieland Jazz Band", "band", "jazz", 1918, "Tiger Rag", "jazz", registryByArtist],
  ["clarence-williams-blue-five", "Clarence Williams' Blue Five", "band", "jazz", 1923, "Wild Cat Blues", "jazz", registryByArtist],
  ["illinois-jacquet", "Illinois Jacquet", "artist", "jazz", 1944, "Jazz at the Philharmonic", "jazz", registryByArtist],
  ["buddy-rich", "Buddy Rich", "artist", "jazz", 1944, "Jazz at the Philharmonic", "jazz", registryByArtist],
  ["bud-powell", "Bud Powell", "artist", "jazz", 1949, "The Jazz Scene", "jazz", registryByArtist],
  ["eddie-lang", "Eddie Lang", "artist", "jazz", 1927, "Singin' the Blues", "jazz", registryByArtist],
  ["charlie-christian", "Charlie Christian", "guitarist", "jazz", 1939, "Rose Room", "jazz", registryCurrent],
  ["sweet-emma-barrett", "Sweet Emma Barrett", "artist", "jazz", 1964, "New Orleans' Sweet Emma and Her Preservation Hall Jazz Band", "jazz", registryByArtist],

  ["mississippi-sheiks", "Mississippi Sheiks", "band", "roots-blues", 1930, "Sitting on Top of the World", "blues", registryByArtist],
  ["machito", "Machito", "artist", "jazz", 1949, "The Jazz Scene", "jazz", registryByArtist],
  ["michael-coleman", "Michael Coleman", "artist", "folk-country-vise", 1922, "Boys of the Lough / Humours of Ennistymon", "folk", registryByArtist],
  ["sol-hoopii", "Sol Hoopii", "guitarist", "folk-country-vise", 1938, "Fascinating Rhythm", "folk", registryByArtist],
  ["abe-elenkrigs-yidishe-orchestra", "Abe Elenkrig's Yidishe Orchestra", "band", "folk-country-vise", 1913, "Fon der Choope", "folk", registryByArtist],
  ["pawlo-humeniuk", "Pawlo Humeniuk", "artist", "folk-country-vise", 1926, "Tanec Pid Werbamy", "folk", registryByArtist],
  ["frank-proffitt", "Frank Proffitt", "artist", "folk-country-vise", 1940, "Tom Dooley", "folk", registryByArtist],
  ["jararaca-and-ratinho", "Jararaca and Ratinho", "band", "folk-country-vise", 1942, "Native Brazilian Music", "folk", registryByArtist],
  ["amade-ardoin", "Amade Ardoin", "artist", "folk-country-vise", 1929, "Cajun-Creole Columbia releases", "cajun-music", registryByArtist],
  ["dennis-mcgee", "Dennis McGee", "artist", "folk-country-vise", 1929, "Cajun-Creole Columbia releases", "cajun-music", registryByArtist],
  ["pixinguinha", "Pixinguinha", "artist", "folk-country-vise", 1942, "Native Brazilian Music", "folk", registryByArtist],
  ["cartola", "Cartola", "artist", "folk-country-vise", 1942, "Native Brazilian Music", "folk", registryByArtist],
  ["odetta", "Odetta", "artist", "folk-country-vise", 1957, "Odetta Sings Ballads and Blues", "folk", registryCurrent],

  ["don-azpiazu-havana-casino-orchestra", "Don Azpiazu and His Havana Casino Orchestra", "band", "pop-soul-disco", 1930, "El Manisero", "latin-music", registryByArtist],
  ["canario-y-su-grupo", "Canario y Su Grupo", "band", "pop-soul-disco", 1930, "Lamento Borincano", "latin-music", registryCurrent],
  ["rita-montaner", "Rita Montaner", "artist", "pop-soul-disco", 1927, "El Manisero", "latin-music", registryByArtist],
  ["lydia-mendoza", "Lydia Mendoza", "artist", "pop-soul-disco", 1934, "Mal Hombre", "latin-music", registryByArtist],
  ["carmen-miranda", "Carmen Miranda", "artist", "pop-soul-disco", 1939, "O Que e que a Bahiana tem", "latin-music", registryByArtist],
  ["cachao-y-su-ritmo-caliente", "Cachao y Su Ritmo Caliente", "band", "pop-soul-disco", 1957, "Descargas", "latin-music", registryByArtist],
  ["celia-cruz", "Celia Cruz", "artist", "pop-soul-disco", 1974, "Celia & Johnny", "latin-music", registryByArtist],
  ["johnny-pacheco", "Johnny Pacheco", "artist", "pop-soul-disco", 1974, "Celia & Johnny", "latin-music", registryByArtist],
  ["tito-puente", "Tito Puente", "artist", "pop-soul-disco", 1958, "Dance Mania", "latin-music", registryByArtist],
  ["fania-all-stars", "Fania All-Stars", "band", "pop-soul-disco", 1975, "Live at Yankee Stadium", "latin-music", registryByArtist],

  ["chuck-wagon-gang", "Chuck Wagon Gang", "band", "roots-blues", 1948, "I'll Fly Away", "gospel-music", registryByArtist],
  ["golden-gate-quartet", "Golden Gate Quartet", "band", "roots-blues", 1938, "John the Revelator", "gospel-music", registryByArtist],
  ["hampton-quartette", "Hampton Quartette", "band", "roots-blues", 1917, "Listen to the Lambs", "gospel-music", registryByArtist],
  ["swan-silvertones", "Swan Silvertones", "band", "roots-blues", 1959, "Oh Mary Don't You Weep", "gospel-music", registryByArtist],
  ["edwin-hawkins-singers", "Edwin Hawkins Singers", "band", "roots-blues", 1969, "Oh Happy Day", "gospel-music", registryByArtist],

  ["the-boswell-sisters", "The Boswell Sisters", "band", "pop-soul-disco", 1931, "It's the Girl", "american-popular-song", registryByArtist],
  ["the-ink-spots", "The Ink Spots", "band", "pop-soul-disco", 1939, "If I Didn't Care", "american-popular-song", registryByArtist],
  ["the-andrews-sisters", "The Andrews Sisters", "band", "pop-soul-disco", 1938, "Bei Mir Bist Du Schoen", "american-popular-song", registryByArtist],
  ["ruth-etting", "Ruth Etting", "artist", "pop-soul-disco", 1930, "Ten Cents a Dance", "american-popular-song", registryByArtist],
  ["ethel-waters", "Ethel Waters", "artist", "pop-soul-disco", 1933, "Stormy Weather", "american-popular-song", registryByArtist],
  ["paul-whiteman-orchestra", "Paul Whiteman Orchestra", "band", "classical-history", 1924, "Rhapsody in Blue", "classical-music", registryByArtist],

  ["jay-z", "Jay-Z", "artist", "hip-hop-rap", 2001, "The Blueprint", "hip-hop", registryByArtist],
  ["wu-tang-clan", "Wu-Tang Clan", "band", "hip-hop-rap", 1993, "Enter the Wu-Tang (36 Chambers)", "hip-hop", registryCurrent],
  ["nas", "Nas", "artist", "hip-hop-rap", 1994, "Illmatic", "hip-hop", registryCurrent],
  ["a-tribe-called-quest", "A Tribe Called Quest", "band", "hip-hop-rap", 1991, "The Low End Theory", "hip-hop", registryCurrent],
  ["lauryn-hill", "Lauryn Hill", "artist", "hip-hop-rap", 1998, "The Miseducation of Lauryn Hill", "hip-hop", registryByArtist],
  ["the-notorious-big", "The Notorious B.I.G.", "artist", "hip-hop-rap", 1994, "Ready to Die", "hip-hop", registryCurrent],
];

export const registryGapNodes = entries.map(([id, label, type, zone, eraStart, recording, , source]) => ({
  id,
  label,
  type,
  zone,
  eraStart,
  summary: `${label} is documented on ${recording} (${eraStart}) in the Library of Congress National Recording Registry. This is a recording-year anchor, not a claim about when the act began.`,
  roles: [type],
  metadata: [],
  sources: [source],
  layoutHints: { preferredZone: zone },
}));

export const registryGapLinks = entries.map(([id, label, , , eraStart, recording, genre, source]) => ({
  id: `registry-gap-${id}-${genre}`,
  source: id,
  target: genre,
  type: "associated_genre",
  label: "documented recording context",
  strength: 0.72,
  context: [`${label} is credited on ${recording} (${eraStart}) in the Library of Congress registry. This edge locates a documented style or adjacent tradition; it does not imply a collaboration with another act or an origin date.`],
  sources: [source, registryByGenre],
}));

for (const [source, target, recording] of [
  ["frankie-trumbauer", "bix-beiderbecke", "Singin' the Blues"],
  ["bix-beiderbecke", "eddie-lang", "Singin' the Blues"],
  ["celia-cruz", "johnny-pacheco", "Celia & Johnny"],
]) {
  registryGapLinks.push({
    id: `registry-gap-${source}-${target}-shared-recording`,
    source,
    target,
    type: "collaboration",
    label: "recorded together",
    strength: 0.84,
    context: [`Both acts are credited on ${recording} in the Library of Congress registry. This is a shared recording, not a claim that their entire careers were collaborative.`],
    sources: [registryByArtist],
  });
}
