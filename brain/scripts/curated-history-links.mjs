const jazzHistory = {
  label: "Jazz at Lincoln Center",
  url: "https://jazz.org/education/school-programs/let-freedom-swing/what-is-jazz/",
  provider: "other",
};
const milesHistory = {
  label: "Smithsonian National Museum of American History",
  url: "https://www.smithsonianmag.com/smithsonian-institution/Smithsonian-jazz-expert-gives-liner-notes-to-new-miles-davis-biopic-180958658/",
  provider: "other",
};
const parkerHistory = {
  label: "Smithsonian",
  url: "https://www.smithsonianmag.com/arts-culture/miles-davis-emerged-middle-america-become-picasso-jazz-taught-us-all-how-to-be-cool-180987828/",
  provider: "other",
};
const countryHall = (slug) => ({
  label: "Country Music Hall of Fame and Museum",
  url: `https://www.countrymusichalloffame.org/hall-of-fame/${slug}`,
  provider: "other",
});
const rockHallRodgers = {
  label: "Rock & Roll Hall of Fame",
  url: "https://rockhall.com/inductees/jimmie-rodgers/",
  provider: "other",
};

function link(source, target, type, label, context, reference) {
  return {
    id: `curated-${source}-${target}-${type}`,
    source,
    target,
    type,
    label,
    strength: 0.78,
    context: [context],
    sources: [reference],
  };
}

export const curatedHistoryLinks = [
  link("louis-armstrong", "jazz", "associated_genre", "early jazz innovator", "Armstrong reshaped jazz improvisation.", jazzHistory),
  link("duke-ellington", "jazz", "associated_genre", "jazz orchestra leader", "Ellington joined composition and improvisation in jazz.", jazzHistory),
  link("duke-ellington", "swing-music", "associated_genre", "swing-era orchestra", "Ellington led one of jazz's major swing-era orchestras.", jazzHistory),
  link("swing-music", "jazz", "associated_genre", "jazz era", "Swing grew within the jazz tradition.", jazzHistory),
  link("bebop", "jazz", "associated_genre", "jazz movement", "Bebop followed the swing era as a jazz movement.", jazzHistory),
  link("charlie-parker", "bebop", "associated_genre", "bebop innovator", "Parker was a central voice in bebop.", parkerHistory),
  link("miles-davis", "bebop", "associated_genre", "bebop beginnings", "Davis played with Charlie Parker before his later jazz phases.", parkerHistory),
  link("miles-davis", "jazz-fusion", "associated_genre", "jazz-rock fusion", "Davis brought rock influences into his late-1960s jazz recordings.", milesHistory),
  link("miles-davis", "john-coltrane", "related", "played together", "Coltrane worked with Davis during a pivotal period of modern jazz.", milesHistory),
  link("john-coltrane", "jazz", "associated_genre", "modern jazz", "Coltrane became a major voice in modern jazz.", milesHistory),

  link("jimmie-rodgers", "country", "associated_genre", "early country pioneer", "Rodgers helped establish early country music.", countryHall("jimmie-rodgers")),
  link("jimmie-rodgers", "blues", "associated_genre", "country-blues crossover", "Rodgers fused country with blues phrasing.", rockHallRodgers),
  link("jimmie-rodgers", "rock-and-roll", "related", "rock and roll influence", "His country-blues fusion became an early framework for rock and roll.", rockHallRodgers),
  link("the-carter-family", "country", "associated_genre", "early country foundation", "The Carter Family shaped country harmony singing and guitar style.", countryHall("carter-family")),
  link("the-carter-family", "folk", "associated_genre", "folk repertoire", "The group drew on British folk ballads and other traditional songs.", countryHall("carter-family")),
  link("the-carter-family", "blues", "associated_genre", "blues repertoire", "The Carter Family also performed blues material.", countryHall("carter-family")),
  link("hank-williams", "country", "associated_genre", "country songwriter", "Williams shaped country songwriting in the late 1940s and early 1950s.", countryHall("hank-williams")),
  link("hank-williams", "honky-tonk", "associated_genre", "honky-tonk voice", "His honky-tonk repertoire became central to postwar country.", countryHall("hank-williams")),
  link("bill-monroe", "bluegrass", "associated_genre", "bluegrass pioneer", "Monroe's band and acoustic sound helped define bluegrass.", countryHall("bill-monroe")),
  link("bill-monroe", "jimmie-rodgers", "related", "recorded Rodgers material", "Monroe's early repertoire included Jimmie Rodgers material.", countryHall("bill-monroe")),
  link("patsy-cline", "country", "associated_genre", "country vocalist", "Cline was a landmark country vocalist.", countryHall("patsy-cline")),
  link("patsy-cline", "willie-nelson", "related", "recorded Nelson composition", "Cline recorded a Willie Nelson composition during her career.", countryHall("patsy-cline")),
  link("merle-haggard", "country", "associated_genre", "country songwriter", "Haggard was an influential country singer-songwriter.", countryHall("merle-haggard")),
  link("merle-haggard", "honky-tonk", "associated_genre", "honky-tonk tradition", "Haggard drew heavily on honky-tonk.", countryHall("merle-haggard")),
  link("merle-haggard", "jazz", "associated_genre", "jazz influence", "Haggard's style drew from jazz as well as country and blues.", countryHall("merle-haggard")),
  link("honky-tonk", "country", "associated_genre", "country tradition", "Honky-tonk is a central country style.", countryHall("merle-haggard")),
];
