const registry = {
  label: "Library of Congress National Recording Registry",
  url: "https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/",
  provider: "other",
};

const registryDetails = {
  label: "Library of Congress Registry recording details",
  url: "https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/descriptions-and-essays/",
  provider: "other",
};

// Year means the cited recording's year, not the start of an artist's career.
// Rows: id, name, type, zone, year, recording, nearby genre.
const recordings = [
  ["art-tatum", "Art Tatum", "artist", "jazz", 1940, "Sweet Lorraine", "jazz"],
  ["wings-over-jordan-choir", "Wings Over Jordan Choir", "band", "roots-blues", 1942, "Wings Over Jordan", "gospel-music"],
  ["merle-travis", "Merle Travis", "guitarist", "country-roots", 1946, "Folk Songs of the Hills", "country"],
  ["harry-choates", "Harry Choates", "artist", "folk-country-vise", 1946, "Jole Blon", "folk"],
  ["t-bone-walker", "T-Bone Walker", "guitarist", "roots-blues", 1947, "Call It Stormy Monday", "blues"],
  ["the-fairfield-four", "The Fairfield Four", "band", "roots-blues", 1947, "Don't Let Nobody Turn You Around", "gospel-music"],
  ["robert-shaw", "Robert Shaw", "artist", "classical-history", 1947, "Bach B-Minor Mass", "classical-music"],
  ["louis-kaufman", "Louis Kaufman", "artist", "classical-history", 1947, "The Four Seasons", "classical-music"],
  ["brother-bones", "Brother Bones", "artist", "pop-soul-disco", 1949, "Sweet Georgia Brown", "american-popular-song"],
  ["red-foley", "Red Foley", "artist", "country-roots", 1951, "Peace in the Valley", "gospel-music"],
  ["the-roger-wagner-chorale", "The Roger Wagner Chorale", "band", "classical-history", 1951, "Pope Marcellus Mass", "classical-music"],
  ["alex-north", "Alex North", "artist", "classical-history", 1951, "A Streetcar Named Desire soundtrack", "film-score"],
  ["arthur-rubinstein", "Arthur Rubinstein", "artist", "classical-history", 1952, "Chopin Polonaise", "classical-music"],
  ["roy-rogers", "Roy Rogers", "artist", "country-roots", 1952, "Happy Trails", "country"],
  ["dale-evans", "Dale Evans", "artist", "country-roots", 1952, "Happy Trails", "country"],
  ["the-dixie-hummingbirds", "The Dixie Hummingbirds", "band", "roots-blues", 1953, "Let's Go Out to the Programs", "gospel-music"],
  ["maria-callas", "Maria Callas", "artist", "classical-history", 1953, "Puccini: Tosca", "classical-music"],
  ["the-penguins", "The Penguins", "band", "roots-blues", 1954, "Earth Angel", "rhythm-and-blues"],
  ["kaye-ballard", "Kaye Ballard", "artist", "pop-soul-disco", 1954, "In Other Words (Fly Me to the Moon)", "american-popular-song"],
  ["bill-haley-and-his-comets", "Bill Haley and His Comets", "band", "rock-circuit", 1954, "Rock Around the Clock", "rock-and-roll"],
  ["howlin-wolf", "Howlin' Wolf", "artist", "roots-blues", 1956, "Smokestack Lightning", "blues"],
  ["the-crickets", "The Crickets", "band", "rock-circuit", 1957, "That'll Be the Day", "rock-and-roll"],
  ["perry-como", "Perry Como", "artist", "pop-soul-disco", 1957, "Catch a Falling Star", "pop-music"],
  ["johnny-mathis", "Johnny Mathis", "artist", "pop-soul-disco", 1957, "Chances Are", "pop-music"],
  ["van-cliburn", "Van Cliburn", "artist", "classical-history", 1958, "Tchaikovsky's Piano Concerto No. 1", "classical-music"],
  ["the-dave-brubeck-quartet", "The Dave Brubeck Quartet", "band", "jazz", 1959, "Time Out", "jazz"],
  ["the-shirelles", "The Shirelles", "band", "pop-soul-disco", 1960, "Tonight's the Night", "pop-music"],
  ["chubby-checker", "Chubby Checker", "artist", "rock-circuit", 1960, "The Twist", "rock-and-roll"],
  ["mance-lipscomb", "Mance Lipscomb", "artist", "roots-blues", 1960, "Texas Sharecropper and Songster", "blues"],
  ["doc-watson", "Doc Watson", "guitarist", "folk-country-vise", 1960, "Old Time Music at Clarence Ashley's", "folk"],
  ["clarence-ashley", "Clarence Ashley", "artist", "folk-country-vise", 1960, "Old Time Music at Clarence Ashley's", "folk"],
  ["ben-e-king", "Ben E. King", "artist", "pop-soul-disco", 1961, "Stand by Me", "soul-music"],
  ["judy-garland", "Judy Garland", "artist", "pop-soul-disco", 1961, "Judy at Carnegie Hall", "american-popular-song"],
  ["james-cleveland", "James Cleveland", "artist", "roots-blues", 1962, "Peace Be Still", "gospel-music"],
  ["steve-reich", "Steve Reich", "artist", "classical-history", 1967, "New Sounds in Electronic Music", "classical-music"],
  ["pauline-oliveros", "Pauline Oliveros", "artist", "classical-history", 1967, "New Sounds in Electronic Music", "classical-music"],
  ["morton-subotnick", "Morton Subotnick", "artist", "classical-history", 1967, "Silver Apples of the Moon", "classical-music"],
  ["bobbie-gentry", "Bobbie Gentry", "artist", "country-roots", 1967, "Ode to Billie Joe", "country"],
  ["jefferson-airplane", "Jefferson Airplane", "band", "psychedelia-prog", 1967, "Surrealistic Pillow", "psychedelic-rock"],
  ["the-velvet-underground", "The Velvet Underground", "band", "punk-alt", 1967, "The Velvet Underground and Nico", "alternative-rock"],
  ["wendy-carlos", "Wendy Carlos", "artist", "classical-history", 1968, "Switched-On Bach", "classical-music"],
  ["glen-campbell", "Glen Campbell", "artist", "country-roots", 1968, "Wichita Lineman", "country"],
  ["big-brother-and-the-holding-company", "Big Brother and the Holding Company", "band", "psychedelia-prog", 1968, "Cheap Thrills", "psychedelic-rock"],
  ["captain-beefheart-and-his-magic-band", "Captain Beefheart and His Magic Band", "band", "psychedelia-prog", 1969, "Trout Mask Replica", "psychedelic-rock"],
  ["judy-collins", "Judy Collins", "artist", "folk-country-vise", 1970, "Amazing Grace", "folk"],
  ["crosby-stills-nash-and-young", "Crosby, Stills, Nash & Young", "band", "folk-country-vise", 1970, "Deja Vu", "folk"],
  ["carole-king", "Carole King", "artist", "pop-soul-disco", 1971, "Tapestry", "pop-music"],
  ["john-lennon", "John Lennon", "artist", "pop-soul-disco", 1971, "Imagine", "pop-music"],
  ["jackson-browne", "Jackson Browne", "artist", "pop-soul-disco", 1974, "Late for the Sky", "pop-rock"],
  ["the-fania-all-stars", "The Fania All-Stars", "band", "pop-soul-disco", 1975, "Live at Yankee Stadium", "latin-music"],
];

// Group pages name the musicians, not merely artists with a similar style.
const memberships = [
  { group: "jefferson-airplane", zone: "psychedelia-prog", year: 1967, recording: "Surrealistic Pillow", url: "https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/registry-by-induction-years/2024/", members: [
    ["grace-slick", "Grace Slick", "artist"], ["marty-balin", "Marty Balin", "artist"],
    ["paul-kantner", "Paul Kantner", "guitarist"], ["jorma-kaukonen", "Jorma Kaukonen", "guitarist"],
    ["jack-casady", "Jack Casady", "artist"], ["spencer-dryden", "Spencer Dryden", "artist"],
  ] },
  { group: "the-cars", zone: "pop-soul-disco", year: 1978, recording: "The Cars", url: "https://lcweb2.loc.gov/static/programs/national-recording-preservation-board/documents/The-Cars_Milliken.pdf", members: [
    ["ric-ocasek", "Ric Ocasek", "artist"], ["benjamin-orr", "Benjamin Orr", "artist"],
    ["greg-hawkes", "Greg Hawkes", "artist"], ["elliot-easton", "Elliot Easton", "guitarist"],
    ["david-robinson-cars", "David Robinson", "artist"],
  ] },
  { group: "talking-heads", zone: "punk-alt", year: 1980, recording: "Remain in Light", url: "https://lcweb2.loc.gov/static/programs/national-recording-preservation-board/documents/RemainInLight.pdf", members: [
    ["david-byrne", "David Byrne", "artist"], ["chris-frantz", "Chris Frantz", "artist"],
    ["tina-weymouth", "Tina Weymouth", "artist"], ["jerry-harrison", "Jerry Harrison", "artist"],
  ] },
  { group: "abba", zone: "pop-soul-disco", year: 1976, recording: "Arrival", url: "https://lcweb2.loc.gov/static/programs/national-recording-preservation-board/documents/Arrival_Palm.pdf", members: [
    ["benny-andersson", "Benny Andersson", "artist"], ["bjorn-ulvaeus", "Bjorn Ulvaeus", "artist"],
    ["agnetha-faltskog", "Agnetha Faltskog", "artist"], ["anni-frid-lyngstad", "Anni-Frid Lyngstad", "artist"],
  ] },
  { group: "eurythmics", zone: "pop-soul-disco", year: 1983, recording: "Sweet Dreams (Are Made of This)", url: "https://www.loc.gov/item/prn-23-036/national-recording-registry-inducts-music-from-madonna-mariah-carey-queen-latifah-daddy-yankee/2023-04-12/", members: [
    ["annie-lennox", "Annie Lennox", "artist"], ["dave-stewart", "Dave Stewart", "artist"],
  ] },
  { group: "chic", zone: "pop-soul-disco", year: 1978, recording: "Le Freak", url: "https://lcweb2.loc.gov/static/programs/national-recording-preservation-board/documents/LeFreak.pdf", members: [
    ["nile-rodgers", "Nile Rodgers", "guitarist"], ["bernard-edwards", "Bernard Edwards", "artist"],
    ["tony-thompson-chic", "Tony Thompson", "artist"], ["norma-jean-wright", "Norma Jean Wright", "artist"],
    ["alfa-anderson", "Alfa Anderson", "artist"],
  ] },
  { group: "fleetwood-mac", zone: "pop-soul-disco", year: 1977, recording: "Rumours", url: "https://lcweb2.loc.gov/static/programs/national-recording-preservation-board/documents/Rumours.pdf", members: [
    ["stevie-nicks", "Stevie Nicks", "artist"], ["christine-mcvie", "Christine McVie", "artist"],
    ["john-mcvie", "John McVie", "artist"], ["mick-fleetwood", "Mick Fleetwood", "artist"],
  ] },
  { group: "r-e-m", zone: "punk-alt", year: 1981, recording: "Radio Free Europe", url: "https://www.loc.gov/static/programs/national-recording-preservation-board/documents/RadioFreeEurope.pdf", members: [
    ["michael-stipe", "Michael Stipe", "artist"], ["mike-mills-rem", "Mike Mills", "artist"],
    ["peter-buck", "Peter Buck", "guitarist"], ["bill-berry-rem", "Bill Berry", "artist"],
  ] },
  { group: "earth-wind-and-fire", zone: "pop-soul-disco", year: 1978, recording: "September", url: "https://lcweb2.loc.gov/static/programs/national-recording-preservation-board/documents/September.pdf", members: [
    ["al-mckay", "Al McKay", "guitarist"], ["maurice-white", "Maurice White", "artist"],
  ] },
  { group: "the-beach-boys", zone: "pop-soul-disco", year: 1966, recording: "Pet Sounds", url: "https://rockhall.com/inductees/beach-boys/", members: [
    ["brian-wilson", "Brian Wilson", "artist"], ["mike-love", "Mike Love", "artist"],
  ] },
  { group: "the-velvet-underground", zone: "punk-alt", year: 1967, recording: "The Velvet Underground and Nico", url: "https://www.loc.gov/static/programs/national-recording-preservation-board/documents/VelvetUnderground.pdf", members: [
    ["lou-reed", "Lou Reed", "guitarist"], ["john-cale", "John Cale", "artist"],
    ["sterling-morrison", "Sterling Morrison", "guitarist"], ["maureen-tucker", "Maureen Tucker", "artist"],
  ] },
];

export const thousandNodes = [
  ...recordings.map(([id, label, type, zone, eraStart, recording]) => ({
    id, label, type, zone, eraStart,
    summary: `${label} is documented on the ${eraStart} recording ${recording} in the Library of Congress National Recording Registry. This dates the recording, not the start of the artist's career.`,
    roles: [type], metadata: [], sources: [registry], layoutHints: { preferredZone: zone },
  })),
  ...memberships.flatMap(({ group, zone, year, recording, url, members }) => members.map(([id, label, type]) => ({
    id, label, type, zone, eraStart: year,
    summary: `${label} is documented as a member of ${group.replaceAll("-", " ")} in the cited account of ${recording} (${year}). The year marks that recording, not when membership began.`,
    roles: [type], metadata: [], sources: [{ label: group === "the-beach-boys" ? "Rock & Roll Hall of Fame" : "Library of Congress recording essay", url, provider: "other" }],
    layoutHints: { preferredZone: zone },
  }))),
];

export const thousandLinks = [
  ...recordings.map(([id, , , , year, recording, genre]) => ({
    id: `thousand-${id}-${genre}`, source: id, target: genre,
    type: "associated_genre", label: "documented recording context", strength: 0.72,
    context: [`The Library of Congress lists ${recording} (${year}); this places the act near a relevant tradition without claiming that the Registry uses the same genre label.`],
    sources: [registry],
  })),
  ...memberships.flatMap(({ group, year, recording, url, members }) => members.map(([id]) => ({
    id: `thousand-${id}-${group}`, source: id, target: group,
    type: "member_of", label: "member", strength: 0.9,
    context: [`The cited account names this musician as a group member; ${recording} (${year}) anchors the placement in time.`],
    sources: [{ label: group === "the-beach-boys" ? "Rock & Roll Hall of Fame" : "Library of Congress recording essay", url, provider: "other" }],
  }))),
  {
    id: "thousand-roy-rogers-dale-evans-happy-trails",
    source: "roy-rogers", target: "dale-evans", type: "collaboration", label: "recorded together", strength: 0.85,
    context: ["The Library of Congress credits both on Happy Trails (1952)."], sources: [registryDetails],
  },
  {
    id: "thousand-doc-watson-clarence-ashley-old-time-music",
    source: "doc-watson", target: "clarence-ashley", type: "collaboration", label: "recorded together", strength: 0.85,
    context: ["The Library of Congress credits both on Old Time Music at Clarence Ashley's (1960-62)."], sources: [registryDetails],
  },
];
