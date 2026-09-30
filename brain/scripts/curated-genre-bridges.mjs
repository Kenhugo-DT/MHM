const source = (label, url) => ({ label, url, provider: "other" });

const smithsonianRnB = source("Smithsonian Folklife", "https://folklife.si.edu/magazine/freedom-sounds-tell-it-like-it-is-a-history-of-rhythm-and-blues");
const nmaahc = source("National Museum of African American History and Culture", "https://nmaahc.si.edu/explore/stories/celebrating-black-music-month");
const rockRoots = source("Rock & Roll Hall of Fame", "https://rockhall.com/exhibitions/roots-of-rock/");
const rockSoul = source("Rock & Roll Hall of Fame", "https://rockhall.com/exhibitions/cities-and-sounds/");
const rosetta = source("Rock & Roll Hall of Fame", "https://rockhall.com/inductees/sister-rosetta-tharpe/");
const ray = source("Smithsonian Music", "https://music.si.edu/story/brother-ray%E2%80%99s-message-people");
const aretha = source("Smithsonian National Portrait Gallery", "https://npg.si.edu/blog/aretha-franklin-queen-soul");
const miles = source("National Endowment for the Arts", "https://www.arts.gov/honors/jazz/miles-davis");
const coltrane = source("Smithsonian Magazine", "https://www.smithsonianmag.com/smithsonian-institution/rusty-hassan-talks-about-john-coltrane-herbie-hancock-and-todays-jazz-scene-67287299/");
const bob = source("Country Music Hall of Fame and Museum", "https://countrymusichalloffame.org/hall-of-fame/bob-wills");
const bakersfield = source("Country Music Hall of Fame and Museum", "https://www.countrymusichalloffame.org/press/releases/museum-exhibit-the-bakersfield-sound-buck-owens-merle-haggard-and-california-country-closes-december-31-2014-2");
const buck = source("Country Music Hall of Fame and Museum", "https://countrymusichalloffame.org/hall-of-fame/buck-owens");
const willie = source("Country Music Hall of Fame and Museum", "https://countrymusichalloffame.org/hall-of-fame/willie-nelson");
const waylon = source("Country Music Hall of Fame and Museum", "https://countrymusichalloffame.org/hall-of-fame/waylon-jennings");

function node(id, label, type, zone, eraStart, summary, reference, secondaryZones = [], curatorTags = []) {
  return {
    id, label, type, zone, eraStart, summary,
    roles: [type], metadata: [], sources: [reference],
    primaryGenres: type === "genre" ? [label] : [],
    curatorTags,
    layoutHints: { preferredZone: zone, secondaryZones },
  };
}

function link(from, to, type, label, context, reference) {
  return {
    id: `genre-bridge-${from}-${to}-${type}`,
    source: from, target: to, type, label,
    strength: 0.78, context: [context], sources: [reference],
  };
}

export const curatedGenreNodes = [
  node("gospel-music", "Gospel music", "genre", "roots-blues", 1930, "African American sacred music whose vocal and rhythmic practices shaped R&B, soul and early rock and roll.", rockRoots, ["pop-soul-disco"], ["sacred-to-secular bridge", "soul roots"]),
  node("rhythm-and-blues", "Rhythm and blues", "genre", "roots-blues", 1940, "A broad African American popular-music tradition drawing on blues, gospel and swing, and feeding soul and rock and roll.", smithsonianRnB, ["jazz", "pop-soul-disco", "rock-circuit"], ["blues-gospel-swing synthesis", "rock and soul roots"]),
  node("cool-jazz", "Cool jazz", "genre", "jazz", 1949, "A post-bebop jazz direction associated with the arranged sound of Miles Davis's Birth of the Cool sessions.", miles, [], ["arranged jazz", "Miles Davis nonet"]),
  node("modal-jazz", "Modal jazz", "genre", "jazz", 1959, "Jazz improvisation organized around modes rather than rapid chord changes, associated with Miles Davis and John Coltrane.", miles, [], ["mode-based improvisation", "Kind of Blue"]),
  node("western-swing", "Western swing", "genre", "country-roots", 1930, "Southwestern dance music joining country fiddles with jazz, blues and big-band swing.", bob, ["jazz", "roots-blues"], ["country-jazz bridge", "dance-band roots"]),
  node("bakersfield-sound", "Bakersfield sound", "genre", "country-roots", 1950, "California country sound associated with Buck Owens and Merle Haggard, drawing on honky-tonk, rockabilly and western swing.", bakersfield, ["roots-blues"], ["electric country", "honky-tonk-rockabilly bridge"]),
  node("outlaw-country", "Outlaw country", "genre", "country-roots", 1970, "1970s country movement centered on performers taking greater control of their recordings and repertoire.", waylon, [], ["artist-led recording", "1970s country"]),
  node("ray-charles", "Ray Charles", "artist", "roots-blues", 1954, "Singer and pianist who combined gospel and R&B into soul while also recording country and jazz material.", ray, ["pop-soul-disco", "country-roots", "jazz"], ["gospel-to-soul bridge", "cross-genre recordings"]),
  node("aretha-franklin", "Aretha Franklin", "artist", "pop-soul-disco", 1967, "Soul singer whose gospel background met rhythm and blues, jazz and pop.", aretha, ["roots-blues", "jazz"], ["gospel voice", "soul crossover"]),
  node("bob-wills", "Bob Wills", "artist", "country-roots", 1934, "Bandleader whose Texas Playboys made western swing a country-jazz-blues dance music.", bob, ["jazz", "roots-blues"], ["western swing anchor", "country-jazz bridge"]),
  node("buck-owens", "Buck Owens", "artist", "country-roots", 1963, "Singer and guitarist whose bright electric band sound became central to Bakersfield country.", buck, ["roots-blues"], ["Bakersfield anchor", "western swing and R&B influence"]),
  node("waylon-jennings", "Waylon Jennings", "artist", "country-roots", 1973, "Country singer whose campaign for control over recordings helped define the Outlaw movement.", waylon, [], ["outlaw country anchor", "artist autonomy"]),
];

export const curatedGenreLinks = [
  link("rhythm-and-blues", "blues", "influenced_by", "blues roots", "Early R&B drew on blues song forms and performance practices; this is a lineage, not a synonym.", smithsonianRnB),
  link("rhythm-and-blues", "swing-music", "influenced_by", "swing roots", "Swing horn riffs and small-combo arrangements fed early R&B.", smithsonianRnB),
  link("rhythm-and-blues", "gospel-music", "influenced_by", "gospel roots", "Gospel was one of several sources of R&B; the two traditions should remain distinct.", nmaahc),
  link("soul-music", "rhythm-and-blues", "influenced_by", "R&B to soul", "Soul grew from R&B while developing a more pronounced gospel-derived vocal language.", rockSoul),
  link("soul-music", "gospel-music", "influenced_by", "gospel to soul", "Gospel vocal practices helped shape secular soul singing.", rockSoul),
  link("rock-and-roll", "rhythm-and-blues", "influenced_by", "R&B to rock and roll", "Early rock and roll drew on the rhythmic language of R&B, alongside country and other sources.", rockRoots),
  link("rock-and-roll", "gospel-music", "influenced_by", "gospel to rock and roll", "The gospel tradition was one of rock and roll's documented early influences.", rockRoots),
  link("sister-rosetta-tharpe", "gospel-music", "associated_genre", "electric gospel", "Tharpe brought a powerful electric-guitar sound to gospel performance.", rosetta),
  link("ray-charles", "rhythm-and-blues", "associated_genre", "R&B recordings", "Charles brought gospel phrasing into rhythm and blues recordings.", ray),
  link("ray-charles", "gospel-music", "related", "gospel vocabulary", "Gospel was a source for Charles's secular music; this edge describes influence, not a gospel-only career.", ray),
  link("ray-charles", "soul-music", "associated_genre", "soul pioneer", "Charles's fusion of gospel expression and R&B helped define soul.", ray),
  link("ray-charles", "country", "related", "country recordings", "Charles recorded country songs as part of a deliberately cross-genre career.", ray),
  link("aretha-franklin", "gospel-music", "related", "gospel roots", "Franklin sang in church before her secular career; gospel remained a vocal foundation.", aretha),
  link("aretha-franklin", "rhythm-and-blues", "associated_genre", "R&B voice", "Franklin's recordings brought gospel-inflected singing into R&B.", aretha),
  link("aretha-franklin", "soul-music", "associated_genre", "soul singer", "Franklin became a defining voice of soul, not merely a generic pop performer.", aretha),
  link("aretha-franklin", "pop-music", "related", "pop crossover", "Franklin's soul recordings also reached a broad pop audience.", aretha),

  link("cool-jazz", "jazz", "associated_genre", "jazz direction", "Cool jazz is a direction within jazz, not a separate origin tradition.", miles),
  link("miles-davis", "cool-jazz", "associated_genre", "Birth of the Cool", "Davis's late-1940s nonet recordings are an anchor for cool jazz.", miles),
  link("modal-jazz", "jazz", "associated_genre", "jazz direction", "Modal jazz changes the improvisational framework inside jazz.", miles),
  link("miles-davis", "modal-jazz", "associated_genre", "modal turn", "Davis moved toward modal improvisation on Kind of Blue after his earlier cool-jazz work.", miles),
  link("john-coltrane", "modal-jazz", "associated_genre", "modal improvisation", "Coltrane later used modal improvisation in major recordings; his connection is not limited to Davis's band.", coltrane),

  link("western-swing", "country", "associated_genre", "country dance music", "Western swing developed in the Southwestern country-dance tradition.", bob),
  link("western-swing", "jazz", "influenced_by", "jazz phrasing", "Western swing incorporated New Orleans jazz and improvising dance-band practices.", bob),
  link("western-swing", "blues", "influenced_by", "blues roots", "Blues was one ingredient of western swing rather than its whole sound.", bob),
  link("western-swing", "swing-music", "related", "big-band swing bridge", "Big-band swing was another ingredient in the western-swing mixture.", bob),
  link("bob-wills", "western-swing", "associated_genre", "western swing bandleader", "Wills and his Texas Playboys are a documented anchor of western swing.", bob),
  link("bob-wills", "country", "associated_genre", "country bandleader", "Wills belongs to country history even though his bands drew widely from jazz and blues.", bob),
  link("bakersfield-sound", "country", "associated_genre", "California country", "Bakersfield is a regional country sound, not a separate broad musical tradition.", bakersfield),
  link("bakersfield-sound", "honky-tonk", "influenced_by", "honky-tonk roots", "Bakersfield musicians kept honky-tonk directness in a louder electric setting.", bakersfield),
  link("bakersfield-sound", "rockabilly", "influenced_by", "rockabilly edge", "The sound added a harder rockabilly edge to honky-tonk country.", bakersfield),
  link("bakersfield-sound", "western-swing", "influenced_by", "western swing roots", "Western swing was one of the ingredients in Owens's Bakersfield sound.", bakersfield),
  link("buck-owens", "bakersfield-sound", "associated_genre", "Bakersfield anchor", "Owens's band made the bright, amplified Bakersfield sound widely heard.", bakersfield),
  link("buck-owens", "western-swing", "related", "western swing background", "Owens learned western swing as a working Southwestern dance-band musician.", buck),
  link("buck-owens", "rhythm-and-blues", "related", "R&B repertoire", "Owens played R&B material in Bakersfield dance halls; this is a repertoire bridge, not a claim that he was an R&B artist.", buck),
  link("merle-haggard", "bakersfield-sound", "associated_genre", "Bakersfield anchor", "Haggard was one of the two best-known artists associated with the Bakersfield sound.", bakersfield),
  link("outlaw-country", "country", "associated_genre", "country movement", "Outlaw country was a 1970s movement within country, distinguished partly by artist control.", waylon),
  link("willie-nelson", "outlaw-country", "associated_genre", "Outlaw movement", "Nelson helped establish the 1970s Outlaw country movement.", willie),
  link("waylon-jennings", "outlaw-country", "associated_genre", "Outlaw movement", "Jennings fought for control of songs, sessions and musicians, a core Outlaw-country distinction.", waylon),
  link("waylon-jennings", "country", "associated_genre", "country singer", "Jennings remained a country artist while challenging Nashville recording practices.", waylon),
  link("waylon-jennings", "willie-nelson", "collaboration", "Waylon and Willie", "Jennings and Nelson recorded together and became a paired public face of Outlaw country.", waylon),
];
