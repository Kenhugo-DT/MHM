const ref = (label, url) => ({ label, url, provider: "other" });
const countryHall = ref("Country Music Hall of Fame and Museum", "https://countrymusichalloffame.org/hall-of-fame");
const bluegrassHall = ref("Bluegrass Music Hall of Fame and Museum", "https://www.bluegrasshall.org/inductees/the-stanley-brothers/");
const nea = (slug) => ref("National Endowment for the Arts", `https://www.arts.gov/honors/jazz/${slug}`);
const loc = (url) => ref("Library of Congress", url);
const rockHall = (slug) => ref("Rock & Roll Hall of Fame", `https://rockhall.com/inductees/${slug}/`);

// Each row is a reviewed identity and one deliberately modest, source-supported genre claim.
// A source naming two musicians alone is not treated as evidence of influence.
const country = [
  ["roy-acuff", "Roy Acuff", 1930, "Opry singer; rural string-band bridge", countryHall],
  ["deford-bailey", "DeFord Bailey", 1925, "Opry harmonica; Black country pioneer", countryHall],
  ["gene-autry", "Gene Autry", 1930, "Singing cowboy; country on radio and film", countryHall],
  ["eddy-arnold", "Eddy Arnold", 1944, "Nashville vocalist; country-pop crossover", countryHall],
  ["kitty-wells", "Kitty Wells", 1952, "Honky-tonk voice; women in country", countryHall],
  ["webb-pierce", "Webb Pierce", 1952, "Honky-tonk singer; 1950s country", countryHall],
  ["carl-smith", "Carl Smith", 1951, "Country vocalist; Opry and honky-tonk", countryHall],
  ["george-jones", "George Jones", 1954, "Country vocalist; honky-tonk phrasing", countryHall],
  ["loretta-lynn", "Loretta Lynn", 1960, "Country songwriting; working-class voice", countryHall],
  ["tammy-wynette", "Tammy Wynette", 1966, "Country vocalist; Nashville recordings", countryHall],
  ["bobby-bare", "Bobby Bare", 1962, "Country storyteller; Nashville songwriter link", countryHall],
  ["floyd-cramer", "Floyd Cramer", 1955, "Session piano; Nashville Sound", countryHall],
  ["jim-reeves", "Jim Reeves", 1953, "Smooth country voice; Nashville Sound", countryHall],
  ["hank-snow", "Hank Snow", 1936, "Canadian-born country singer; Opry", countryHall],
  ["kris-kristofferson", "Kris Kristofferson", 1966, "Country songwriter; singer-songwriter crossover", countryHall],
  ["roger-miller", "Roger Miller", 1957, "Country songwriter; playful pop crossover", countryHall],
  ["conway-twitty", "Conway Twitty", 1958, "Rock-to-country vocalist; duets", countryHall],
  ["don-gibson", "Don Gibson", 1956, "Country songwriter; Nashville recordings", countryHall],
  ["charley-pride", "Charley Pride", 1965, "Country singer; barrier-breaking mainstream success", countryHall],
  ["ray-price", "Ray Price", 1950, "Honky-tonk singer; shuffle rhythm", countryHall],
  ["the-louvin-brothers", "The Louvin Brothers", 1947, "Brother harmony; country-gospel repertoire", ref("Country Music Hall of Fame and Museum", "https://www.countrymusichalloffame.org/hall-of-fame/the-louvin-brothers"), "band"],
  ["the-stanley-brothers", "The Stanley Brothers", 1946, "Brother duo; Appalachian bluegrass", bluegrassHall, "band", "bluegrass"],
];

const jazz = [
  ["dizzy-gillespie", "Dizzy Gillespie", 1937, "Bebop trumpet; jazz diplomacy", loc("https://wwws.loc.gov/exhibits/hope-for-america/cultural-diplomacy.html")],
  ["thelonious-monk", "Thelonious Monk", 1941, "Jazz piano; angular composition", loc("https://www.loc.gov/item/prn-05-090/")],
  ["ella-fitzgerald", "Ella Fitzgerald", 1935, "Jazz voice; scat and songbook", nea("ella-fitzgerald")],
  ["sarah-vaughan", "Sarah Vaughan", 1943, "Jazz voice; bop phrasing", nea("sarah-vaughan")],
  ["art-blakey", "Art Blakey", 1942, "Hard-bop drums; Jazz Messengers", nea("art-blakey")],
  ["horace-silver", "Horace Silver", 1950, "Hard-bop piano; blues and gospel phrasing", nea("horace-silver")],
  ["sonny-rollins", "Sonny Rollins", 1949, "Tenor saxophone; hard-bop improvisation", nea("sonny-rollins")],
  ["cannonball-adderley", "Cannonball Adderley", 1955, "Soul-jazz saxophone; Riverside recordings", ref("National Endowment for the Arts", "https://www.arts.gov/sites/default/files/2012-JazzMasters.pdf")],
  ["benny-goodman", "Benny Goodman", 1934, "Swing clarinet; 1938 Carnegie Hall jazz concert", loc("https://www.loc.gov/static/programs/national-recording-preservation-board/documents/BennyGoodman.pdf")],
  ["count-basie", "Count Basie", 1935, "Swing orchestra; Kansas City jazz", nea("william-count-basie")],
  ["billie-holiday", "Billie Holiday", 1933, "Jazz voice; phrasing and protest song", loc("https://wwws.loc.gov/exhibits/jazz-singers/online-exhibition.html")],
  ["gil-evans", "Gil Evans", 1947, "Jazz orchestration; Miles Davis arrangements", nea("gil-evans")],
  ["wayne-shorter", "Wayne Shorter", 1959, "Jazz saxophone; Messengers and fusion", nea("wayne-shorter")],
  ["joe-zawinul", "Joe Zawinul", 1959, "Electric jazz keyboards; Weather Report", nea("wayne-shorter")],
  ["ron-carter", "Ron Carter", 1959, "Jazz bass; Davis quintet", nea("ron-carter")],
  ["max-roach", "Max Roach", 1942, "Bebop drums; Brown-Roach quintet", nea("max-roach")],
  ["clifford-brown", "Clifford Brown", 1953, "Hard-bop trumpet; Brown-Roach quintet", loc("https://www.loc.gov/static/programs/national-recording-preservation-board/documents/Night-at-Birdland.pdf")],
  ["ornette-coleman", "Ornette Coleman", 1958, "Free-jazz saxophone; harmolodics", nea("ornette-coleman")],
  ["cecil-taylor", "Cecil Taylor", 1956, "Avant-garde jazz piano; percussive style", nea("cecil-taylor")],
  ["charles-mingus", "Charles Mingus", 1943, "Jazz bass and composition; collective improvisation", loc("https://findingaids.loc.gov/exist_collections/ead3pdf/music/2004/mu004009.pdf")],
  ["mccoy-tyner", "McCoy Tyner", 1959, "Jazz piano; Coltrane quartet", nea("mccoy-tyner")],
  ["wynton-marsalis", "Wynton Marsalis", 1980, "Jazz trumpet; Lincoln Center education", ref("National Endowment for the Arts", "https://www.arts.gov/honors/medals/wynton-marsalis")],
];

const soul = [
  ["the-soul-stirrers", "The Soul Stirrers", "band", 1930, "Gospel quartet; Sam Cooke beginnings", rockHall("soul-stirrers"), "gospel-music"],
  ["the-temptations", "The Temptations", "band", 1961, "Motown vocal group; soul harmonies", rockHall("temptations"), "soul-music"],
  ["the-four-tops", "The Four Tops", "band", 1956, "Motown quartet; Holland-Dozier-Holland songs", rockHall("four-tops"), "soul-music"],
  ["the-drifters", "The Drifters", "band", 1953, "Gospel-to-R&B vocal group", rockHall("drifters"), "rhythm-and-blues"],
  ["the-platters", "The Platters", "band", 1953, "R&B vocal group; early rock ballads", rockHall("platters"), "rhythm-and-blues"],
  ["wilson-pickett", "Wilson Pickett", "artist", 1962, "Southern soul; forceful vocal style", ref("Rock & Roll Hall of Fame", "https://rockhall.com/wp-content/uploads/2024/03/Wilson_Pickett_1991.pdf"), "soul-music"],
  ["jackie-wilson", "Jackie Wilson", "artist", 1957, "R&B singer; gospel-inflected delivery", rockHall("jackie-wilson"), "rhythm-and-blues"],
  ["etta-james", "Etta James", "artist", 1955, "Blues and soul singer; vocal crossover", rockHall("etta-james"), "rhythm-and-blues"],
  ["carla-thomas", "Carla Thomas", "artist", 1960, "Stax singer; Memphis soul recordings", ref("Stax Museum of American Soul Music", "https://staxmuseum.com/wp-content/uploads/2014/07/Sounds_of_Change_Stax_Museum_American_Soul_Music1.pdf"), "soul-music"],
  ["booker-t-and-the-mgs", "Booker T. & the M.G.'s", "band", 1962, "Stax house band; Memphis soul instrumentals", rockHall("booker-t-and-mgs"), "soul-music"],
  ["isaac-hayes", "Isaac Hayes", "artist", 1962, "Stax songwriter; soul arrangements", rockHall("isaac-hayes"), "soul-music"],
  ["al-green", "Al Green", "artist", 1967, "Memphis soul; gospel-inflected singing", rockHall("al-green"), "soul-music"],
  ["curtis-mayfield", "Curtis Mayfield", "artist", 1958, "Soul songwriting; social commentary", rockHall("curtis-mayfield"), "soul-music"],
  ["sly-and-the-family-stone", "Sly and the Family Stone", "band", 1966, "Rock-soul-funk band; integrated lineup", rockHall("sly-and-family-stone"), "funk"],
  ["parliament", "Parliament", "band", 1970, "George Clinton's P-Funk group; funk grooves", rockHall("parliament-funkadelic"), "funk"],
  ["funkadelic", "Funkadelic", "band", 1968, "George Clinton's P-Funk group; psychedelic funk", rockHall("parliament-funkadelic"), "funk"],
  ["the-staple-singers", "The Staple Singers", "band", 1956, "Gospel family group; message soul", rockHall("staple-singers"), "gospel-music"],
  ["marvin-gaye", "Marvin Gaye", "artist", 1961, "Motown soul; socially conscious albums", rockHall("marvin-gaye"), "soul-music"],
  ["smokey-robinson", "Smokey Robinson", "artist", 1957, "Motown singer-songwriter; vocal soul", rockHall("smokey-robinson"), "soul-music"],
  ["martha-and-the-vandellas", "Martha and the Vandellas", "band", 1962, "Motown group; dance-oriented soul", rockHall("martha-and-the-vandellas"), "soul-music"],
  ["gladys-knight-and-the-pips", "Gladys Knight & the Pips", "band", 1959, "Vocal group; soul and R&B", rockHall("gladys-knight-and-the-pips"), "soul-music"],
  ["mavis-staples", "Mavis Staples", "artist", 1956, "Staples lead voice; gospel-to-soul", rockHall("staple-singers"), "gospel-music"],
];

function node(id, label, type, zone, eraStart, summary, source, tag) {
  return { id, label, type, zone, eraStart, summary, roles: [type], metadata: [],
    sources: [source], curatorTags: [tag], layoutHints: { preferredZone: zone, secondaryZones: [] } };
}

function link(from, to, type, label, context, source) {
  return { id: `genre-depth-${from}-${to}-${type}`, source: from, target: to, type, label,
    strength: 0.72, context: [context], sources: [source] };
}

export const genreDepthNodes = [
  ...country.map(([id, label, year, summary, source, type = "artist", genre = "country"]) =>
    node(id, label, type, "country-roots", year, summary, source, `${genre} lineage`)),
  ...jazz.map(([id, label, year, summary, source]) =>
    node(id, label, "artist", "jazz", year, summary, source, "jazz lineage")),
  ...soul.map(([id, label, type, year, summary, source, genre]) =>
    node(id, label, type, genre === "gospel-music" || genre === "rhythm-and-blues" ? "roots-blues" : "pop-soul-disco", year, summary, source, `${genre} lineage`)),
];

export const genreDepthLinks = [
  ...country.map(([id, label, , summary, source, , genre = "country"]) =>
    link(id, genre, "associated_genre", `${label} in ${genre}`, `${label}: ${summary}. Museum or Hall documentation establishes this tradition.`, source)),
  ...jazz.map(([id, label, , summary, source]) =>
    link(id, "jazz", "associated_genre", `${label} in jazz`, `${label}: ${summary}. The linked institutional source identifies this musical work.`, source)),
  ...soul.map(([id, label, , , summary, source, genre]) =>
    link(id, genre, "associated_genre", `${label} in ${genre}`, `${label}: ${summary}. The source documents this repertoire; no direct influence is inferred.`, source)),
  link("sam-cooke", "the-soul-stirrers", "member_of", "Soul Stirrers singer", "Cooke sang with the Soul Stirrers before his secular career.", rockHall("soul-stirrers")),
  link("mavis-staples", "the-staple-singers", "member_of", "Staples family voice", "Rock Hall lists Mavis Staples as a member of the family group.", rockHall("staple-singers")),
  link("booker-t-and-the-mgs", "otis-redding", "collaboration", "Stax sessions", "The M.G.'s played with Otis Redding on Stax recordings.", rockHall("booker-t-and-mgs")),
  link("wayne-shorter", "art-blakey", "collaboration", "Jazz Messengers", "Shorter played in Blakey's Jazz Messengers before joining Miles Davis.", nea("wayne-shorter")),
  link("gil-evans", "miles-davis", "collaboration", "orchestral jazz", "Evans arranged the Miles Ahead and Sketches of Spain collaborations with Davis.", nea("gil-evans")),
  link("mccoy-tyner", "john-coltrane", "collaboration", "Coltrane quartet", "Tyner played piano in Coltrane's quartet from 1960 to 1965.", nea("mccoy-tyner")),
  link("max-roach", "clifford-brown", "collaboration", "Brown-Roach quintet", "Roach and Brown led a short-lived but important quintet together.", nea("max-roach")),
  link("parliament", "funkadelic", "related", "P-Funk family", "Rock Hall documents the two George Clinton-led groups as the Parliament-Funkadelic collective.", rockHall("parliament-funkadelic")),
  link("the-louvin-brothers", "emmylou-harris", "related", "Louvins in Harris repertoire", "Harris recorded Louvin Brothers material; this is repertoire lineage, not a shared-band claim.", ref("Country Music Hall of Fame and Museum", "https://www.countrymusichalloffame.org/hall-of-fame/the-louvin-brothers")),
];
