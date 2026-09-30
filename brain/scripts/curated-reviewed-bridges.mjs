const source = (label, url) => ({ label, url, provider: "other" });

const rockHall = (slug) => source("Rock & Roll Hall of Fame", `https://rockhall.com/inductees/${slug}/`);
const countryHall = (slug) => source("Country Music Hall of Fame and Museum", `https://countrymusichalloffame.org/hall-of-fame/${slug}`);
const nea = (slug) => source("National Endowment for the Arts", `https://www.arts.gov/honors/jazz/${slug}`);
const stax = source("Stax Records", "https://staxrecords.com/spotlight/otis-redding/");
const locEvans = source("Library of Congress", "https://lcweb2.loc.gov/static/programs/national-recording-preservation-board/documents/Complete-Village-Vanguard-Recordings_Nass.pdf");
const smithsonianMiles = source("Smithsonian Folkways", "https://folkways-media.si.edu/docs/folkways/artwork/SFW40820.pdf");
const bakersfield = source("Country Music Hall of Fame and Museum", "https://www.countrymusichalloffame.org/press/releases/museum-exhibit-the-bakersfield-sound-buck-owens-merle-haggard-and-california-country-closes-december-31-2014-2");

function node(id, label, type, zone, eraStart, summary, reference, secondaryZones = [], curatorTags = []) {
  return {
    id, label, type, zone, eraStart, summary,
    roles: [type], metadata: [], sources: [reference], curatorTags,
    layoutHints: { preferredZone: zone, secondaryZones },
  };
}

function link(from, to, type, label, context, reference) {
  return {
    id: `reviewed-bridge-${from}-${to}-${type}`,
    source: from, target: to, type, label,
    strength: 0.76, context: [context], sources: [reference],
  };
}

export const reviewedBridgeNodes = [
  node("mahalia-jackson", "Mahalia Jackson", "artist", "roots-blues", 1930, "Gospel singer whose expressive style became a major influence beyond sacred music.", rockHall("mahalia-jackson"), ["pop-soul-disco"], ["gospel anchor", "sacred music"]),
  node("sam-cooke", "Sam Cooke", "artist", "pop-soul-disco", 1950, "Singer who moved from the Soul Stirrers' gospel repertoire into soul and popular music.", rockHall("sam-cooke"), ["roots-blues"], ["gospel-to-soul", "vocal transition"]),
  node("ruth-brown", "Ruth Brown", "artist", "roots-blues", 1950, "Rhythm-and-blues singer central to Atlantic's early recording history.", rockHall("ruth-brown"), ["pop-soul-disco"], ["early R&B", "recording history"]),
  node("big-joe-turner", "Big Joe Turner", "artist", "roots-blues", 1938, "Blues and jump singer whose work bridged jazz, swing, R&B and early rock and roll.", rockHall("big-joe-turner"), ["jazz", "rock-circuit"], ["blues-to-rock", "jazz-swing crossover"]),
  node("fats-domino", "Fats Domino", "artist", "roots-blues", 1949, "New Orleans pianist and singer whose R&B sound became part of early rock and roll.", rockHall("fats-domino"), ["rock-circuit"], ["R&B-to-rock", "New Orleans"]),
  node("otis-redding", "Otis Redding", "artist", "pop-soul-disco", 1962, "Stax singer whose emotionally direct recordings helped define Southern soul.", stax, ["roots-blues"], ["Southern soul", "Stax scene"]),
  node("james-brown", "James Brown", "artist", "pop-soul-disco", 1956, "Singer and bandleader whose rhythmic innovations connected soul to funk.", rockHall("james-brown"), ["roots-blues", "hip-hop-rap"], ["soul-to-funk", "rhythm innovation"]),
  node("solomon-burke", "Solomon Burke", "artist", "pop-soul-disco", 1960, "Soul singer whose recordings also drew from country music.", rockHall("solomon-burke"), ["country-roots"], ["country-influenced soul", "cross-zone bridge"]),
  node("dave-brubeck", "Dave Brubeck", "artist", "jazz", 1949, "Pianist associated with West Coast cool jazz and experiments in time signature.", nea("dave-brubeck"), [], ["cool jazz", "rhythmic experiment"]),
  node("bill-evans", "Bill Evans", "artist", "jazz", 1956, "Jazz pianist whose work included Miles Davis's modal-era Kind of Blue sessions.", smithsonianMiles, [], ["modal-era collaboration", "jazz piano"]),
  node("herbie-hancock", "Herbie Hancock", "artist", "jazz", 1962, "Pianist who played in Miles Davis's group and later brought funk textures into jazz.", nea("herbie-hancock"), ["pop-soul-disco"], ["jazz-to-funk bridge", "electric piano"]),
  node("ernest-tubb", "Ernest Tubb", "artist", "country-roots", 1936, "Honky-tonk singer who began as a Jimmie Rodgers admirer and shaped country performance.", countryHall("ernest-tubb"), [], ["honky-tonk", "Jimmie Rodgers lineage"]),
  node("lefty-frizzell", "Lefty Frizzell", "artist", "country-roots", 1950, "Country vocalist whose phrasing strongly influenced Merle Haggard and later singers.", countryHall("lefty-frizzell"), [], ["country vocal style", "Merle Haggard influence"]),
  node("wynn-stewart", "Wynn Stewart", "artist", "country-roots", 1954, "Bakersfield-area singer whose bandstands and songs helped shape Buck Owens and Merle Haggard.", bakersfield, [], ["Bakersfield precursor", "regional scene"]),
  node("gram-parsons", "Gram Parsons", "artist", "country-roots", 1968, "Musician who brought country arrangements into rock with the Byrds and Flying Burrito Brothers.", rockHall("gram-parsons"), ["rock-circuit", "folk-country-vise"], ["country-rock bridge", "Byrds to Burritos"]),
  node("emmylou-harris", "Emmylou Harris", "artist", "country-roots", 1973, "Singer who worked with Gram Parsons and developed a country-rock and traditional-country repertoire.", countryHall("emmylou-harris"), ["rock-circuit", "folk-country-vise"], ["Gram Parsons collaboration", "country-rock"]),
  node("the-flying-burrito-brothers", "The Flying Burrito Brothers", "band", "country-roots", 1968, "Band co-founded by Gram Parsons that developed a country-rock sound.", rockHall("gram-parsons"), ["rock-circuit"], ["country-rock band", "Gram Parsons"]),
];

export const reviewedBridgeLinks = [
  link("mahalia-jackson", "gospel-music", "associated_genre", "gospel voice", "Jackson's recorded and live work is rooted in gospel; this is not a claim that she recorded secular soul.", rockHall("mahalia-jackson")),
  link("sam-cooke", "gospel-music", "related", "gospel beginnings", "Cooke sang with the Soul Stirrers before his secular pop and soul career.", rockHall("sam-cooke")),
  link("sam-cooke", "soul-music", "associated_genre", "soul singer", "Cooke is identified as a foundational soul singer by the Rock Hall.", rockHall("sam-cooke")),
  link("ruth-brown", "rhythm-and-blues", "associated_genre", "Atlantic R&B", "Brown's R&B hits were central to Atlantic's early history.", rockHall("ruth-brown")),
  link("big-joe-turner", "rhythm-and-blues", "associated_genre", "jump blues to R&B", "Turner's blend of blues, jazz and swing fed his R&B recordings.", rockHall("big-joe-turner")),
  link("rock-and-roll", "big-joe-turner", "influenced_by", "early rock lineage", "Rock Hall credits Turner's style as a precursor to rock and roll; the link describes lineage rather than a genre identity.", rockHall("big-joe-turner")),
  link("fats-domino", "rhythm-and-blues", "associated_genre", "New Orleans R&B", "Domino's New Orleans piano and vocal sound grew from rhythm and blues.", rockHall("fats-domino")),
  link("fats-domino", "rock-and-roll", "associated_genre", "early rock and roll", "Rock Hall documents Domino's R&B style entering the new rock-and-roll idiom.", rockHall("fats-domino")),
  link("otis-redding", "soul-music", "associated_genre", "Southern soul", "Stax documents Redding's emotionally direct soul performances and recordings.", stax),
  link("james-brown", "soul-music", "associated_genre", "soul performer", "Rock Hall places Brown in the development of soul before his funk innovations.", rockHall("james-brown")),
  link("james-brown", "funk", "associated_genre", "funk pioneer", "Brown's rhythmic approach is documented as a formative step in funk.", rockHall("james-brown")),
  link("solomon-burke", "soul-music", "associated_genre", "soul singer", "Rock Hall describes Burke's soul singing as the main tradition of his recordings.", rockHall("solomon-burke")),
  link("solomon-burke", "country", "related", "country-influenced repertoire", "Burke's soul incorporated country influence; this is a stylistic bridge, not a claim that he was primarily a country singer.", rockHall("solomon-burke")),
  link("dave-brubeck", "jazz", "associated_genre", "jazz pianist", "NEA identifies Brubeck as a jazz pianist and bandleader.", nea("dave-brubeck")),
  link("dave-brubeck", "cool-jazz", "associated_genre", "West Coast cool", "NEA associates Brubeck's West Coast work with cool jazz.", nea("dave-brubeck")),
  link("bill-evans", "jazz", "associated_genre", "jazz piano", "Library of Congress documents Evans's modern-jazz trio recordings.", locEvans),
  link("bill-evans", "miles-davis", "collaboration", "Kind of Blue sessions", "Smithsonian Folkways identifies Evans as the pianist on Davis's Kind of Blue sessions.", smithsonianMiles),
  link("herbie-hancock", "jazz", "associated_genre", "jazz pianist", "NEA documents Hancock's jazz career before and after his Miles Davis tenure.", nea("herbie-hancock")),
  link("herbie-hancock", "miles-davis", "collaboration", "Davis group", "Hancock joined Davis's group in 1963; this is documented work together, not merely a shared style.", nea("herbie-hancock")),
  link("herbie-hancock", "jazz-fusion", "related", "electric jazz and funk", "NEA describes Hancock's electric-instrument and funk experiments after his Davis tenure.", nea("herbie-hancock")),
  link("ernest-tubb", "country", "associated_genre", "country singer", "Country Music Hall of Fame identifies Tubb as a major country performer.", countryHall("ernest-tubb")),
  link("ernest-tubb", "honky-tonk", "associated_genre", "honky-tonk trailblazer", "The museum explicitly describes Tubb as a honky-tonk trailblazer.", countryHall("ernest-tubb")),
  link("ernest-tubb", "jimmie-rodgers", "influenced_by", "Rodgers model", "The museum documents Tubb's early imitation of Jimmie Rodgers.", countryHall("ernest-tubb")),
  link("lefty-frizzell", "country", "associated_genre", "country vocalist", "Country Music Hall of Fame places Frizzell among country's influential vocalists.", countryHall("lefty-frizzell")),
  link("merle-haggard", "lefty-frizzell", "influenced_by", "vocal influence", "Country Music Hall of Fame documents Haggard's admiration for Frizzell's vocal style.", countryHall("lefty-frizzell")),
  link("wynn-stewart", "bakersfield-sound", "related", "Bakersfield scene", "The museum names Stewart as an influential Bakersfield bandstand musician and songwriter.", bakersfield),
  link("wynn-stewart", "buck-owens", "related", "early Bakersfield work", "Owens worked as a sideman for Stewart before his solo career; this is a work-history link.", bakersfield),
  link("gram-parsons", "country-rock", "associated_genre", "country-rock pioneer", "Rock Hall documents Parsons's blend of country and rock.", rockHall("gram-parsons")),
  link("gram-parsons", "the-flying-burrito-brothers", "member_of", "co-founder", "Parsons co-founded the Flying Burrito Brothers after the Byrds.", rockHall("gram-parsons")),
  link("emmylou-harris", "country", "associated_genre", "country singer", "Country Music Hall of Fame documents Harris's traditional-country repertoire.", countryHall("emmylou-harris")),
  link("emmylou-harris", "country-rock", "related", "California crossover", "The museum places Harris in the Southern California country-rock community of the 1970s.", countryHall("emmylou-harris")),
  link("emmylou-harris", "gram-parsons", "collaboration", "Parsons band", "Parsons recruited Harris to sing harmony and tour in his band.", countryHall("emmylou-harris")),
  link("the-flying-burrito-brothers", "country-rock", "associated_genre", "country-rock band", "Rock Hall identifies the band's role in Parsons's development of country rock.", rockHall("gram-parsons")),
];
