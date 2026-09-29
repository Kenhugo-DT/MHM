const source = (label, url) => ({ label, url, provider: "other" });

const bach = source("Bach-Archiv Leipzig", "https://www.bachmuseumleipzig.de/de/node/6146");
const pachelbel = source("Brigham Young University Organ", "https://organ.byu.edu/composers/pachelbel.html");
const viennese = source("Carnegie Hall Data Lab", "https://data.carnegiehall.org/datalab/experiments/chdl-0003/");
const mozarteum = source("Mozarteum Foundation", "https://mozarteum.at/en/wolfgang-amade-mozart");
const beethoven = source("Beethoven-Haus Bonn", "https://www.beethoven.de/en/g/zeittafel-beethoven-in-bonn");
const romantic = source("The Metropolitan Museum of Art", "https://www.metmuseum.org/pt/essays/nineteenth-century-classical-music");
const grieg = source("Bergen City Archives", "https://www.bergen.kommune.no/hvaskjer/tema/bergen-byarkiv-forteller/byhistorie/manedens-dokument/gjendine-slalien-hedersgjest-pa-festspillene-1961");
const prog = source("Rock & Roll Hall of Fame", "https://rockhall.com/wp-content/uploads/2024/03/Genesis_2010.pdf");
const zappa = source("Rock & Roll Hall of Fame", "https://rockhall.com/wp-content/uploads/2024/03/Frank_Zappa_1995.pdf");
const rockHall = (slug) => source("Rock & Roll Hall of Fame", `https://rockhall.com/inductees/${slug}/`);
const supremes = source("Rock Hall EDU", "https://oldschool-edu.rockhall.com/sites/default/files/2021-02/Supremes%20playlist.pdf");
const beeGeesDisco = rockHall("arif-mardin");
const bowieGlam = source("Rock & Roll Hall of Fame", "https://rockhall.com/wp-content/uploads/2024/03/Green_Day_2015.pdf");

function node(id, label, type, zone, eraStart, summary, reference) {
  return {
    id, label, type, zone, eraStart, summary,
    roles: [type], metadata: [], sources: [reference],
    layoutHints: { preferredZone: zone },
  };
}

function link(sourceId, targetId, type, label, context, reference) {
  return {
    id: `era-${sourceId}-${targetId}-${type}`,
    source: sourceId, target: targetId, type, label,
    strength: 0.78, context: [context], sources: [reference],
  };
}

export const curatedEraNodes = [
  node("classical-music", "Classical music", "genre", "classical-history", 1600, "European art-music traditions spanning the Baroque, Classical and Romantic periods.", viennese),
  node("baroque-music", "Baroque music", "genre", "classical-history", 1600, "The seventeenth- and early eighteenth-century tradition of contrapuntal, sacred and instrumental composition.", bach),
  node("classical-period", "Classical period", "genre", "classical-history", 1750, "The late-eighteenth-century musical era associated with Haydn, Mozart and early Beethoven.", viennese),
  node("romantic-music", "Romantic music", "genre", "classical-history", 1800, "Nineteenth-century music emphasizing expressive individuality, public concerts and intimate piano works.", romantic),
  node("johann-pachelbel", "Johann Pachelbel", "artist", "classical-history", 1680, "German Baroque organist and composer known for keyboard and chamber music.", pachelbel),
  node("johann-sebastian-bach", "Johann Sebastian Bach", "artist", "classical-history", 1700, "Baroque composer whose church and instrumental music developed contrapuntal forms.", bach),
  node("joseph-haydn", "Joseph Haydn", "artist", "classical-history", 1750, "Composer of the First Viennese School and Beethoven's teacher in Vienna.", viennese),
  node("wolfgang-amadeus-mozart", "Wolfgang Amadeus Mozart", "artist", "classical-history", 1760, "Salzburg-born composer and performer central to the Classical period.", mozarteum),
  node("ludwig-van-beethoven", "Ludwig van Beethoven", "artist", "classical-history", 1790, "Viennese composer whose career spans late Classical music and early Romanticism.", beethoven),
  node("frederic-chopin", "Frédéric Chopin", "artist", "classical-history", 1830, "Romantic composer-pianist associated with the nineteenth-century piano repertoire.", romantic),
  node("edvard-grieg", "Edvard Grieg", "artist", "classical-history", 1860, "Norwegian composer who incorporated traditional melodies into art music.", grieg),

  node("pop-music", "Pop music", "genre", "pop-soul-disco", 1960, "Popular song traditions linking Motown vocal groups, disco and later studio-led pop.", supremes),
  node("soul-music", "Soul music", "genre", "pop-soul-disco", 1960, "Vocal music that became a foundation for Motown-era pop and later R&B.", supremes),
  node("disco", "Disco", "genre", "pop-soul-disco", 1973, "Dance music of the 1970s associated with Donna Summer and the Bee Gees.", rockHall("donna-summer")),
  node("synth-pop", "Synth-pop", "genre", "pop-soul-disco", 1980, "Pop built around synthesizer-led production, prominent in Madonna's early-1980s sound.", rockHall("madonna")),
  node("the-supremes", "The Supremes", "band", "pop-soul-disco", 1964, "Motown vocal group whose recordings bridged soul and pop in the 1960s.", supremes),
  node("the-jackson-5", "The Jackson 5", "band", "pop-soul-disco", 1969, "Motown family group that launched Michael Jackson's career.", rockHall("jackson-5")),
  node("bee-gees", "Bee Gees", "band", "pop-soul-disco", 1967, "Pop group whose later recordings helped define the disco era.", beeGeesDisco),
  node("abba", "ABBA", "band", "pop-soul-disco", 1974, "Swedish pop group known for melodic, studio-crafted recordings.", rockHall("abba")),
  node("donna-summer", "Donna Summer", "artist", "pop-soul-disco", 1975, "Singer whose recordings became central to disco and modern dance music.", rockHall("donna-summer")),
  node("stevie-wonder", "Stevie Wonder", "artist", "pop-soul-disco", 1963, "Motown singer, songwriter and keyboard player who crossed soul, pop and funk.", rockHall("stevie-wonder")),
  node("michael-jackson", "Michael Jackson", "artist", "pop-soul-disco", 1979, "Former Jackson 5 singer whose solo work blended pop, soul, funk and disco.", rockHall("michael-jackson")),
  node("madonna", "Madonna", "artist", "pop-soul-disco", 1983, "Pop artist whose early sound included synth-pop and dance music.", rockHall("madonna")),
  node("david-bowie", "David Bowie", "artist", "pop-soul-disco", 1969, "British artist who crossed glam rock, art rock and later pop.", rockHall("david-bowie")),
  node("phil-collins", "Phil Collins", "artist", "pop-soul-disco", 1981, "Genesis drummer and singer who crossed progressive rock, pop and soul.", rockHall("phil-collins")),
];

export const curatedEraLinks = [
  link("baroque-music", "classical-music", "associated_genre", "Baroque era", "Baroque is an early period within Western classical music history.", bach),
  link("classical-period", "classical-music", "associated_genre", "Classical era", "The First Viennese School anchors the Classical period.", viennese),
  link("romantic-music", "classical-music", "associated_genre", "Romantic era", "Romanticism reshaped nineteenth-century classical composition and performance.", romantic),
  link("johann-pachelbel", "baroque-music", "associated_genre", "Baroque composer", "Pachelbel was a German Baroque organist and composer.", pachelbel),
  link("johann-sebastian-bach", "baroque-music", "associated_genre", "Baroque composer", "Bach's compositions belong to the Baroque era.", bach),
  link("joseph-haydn", "classical-period", "associated_genre", "Viennese Classical composer", "Haydn is one of the First Viennese School composers.", viennese),
  link("wolfgang-amadeus-mozart", "classical-period", "associated_genre", "Viennese Classical composer", "Mozart is one of the First Viennese School composers.", viennese),
  link("ludwig-van-beethoven", "classical-period", "associated_genre", "late Classical composer", "Beethoven is counted among the First Viennese School composers.", viennese),
  link("ludwig-van-beethoven", "romantic-music", "related", "Classical-to-Romantic transition", "Beethoven's public concerts helped shape the nineteenth-century Romantic performance world.", romantic),
  link("ludwig-van-beethoven", "joseph-haydn", "related", "studied with Haydn", "Beethoven moved to Vienna in 1792 to study with Haydn.", beethoven),
  link("frederic-chopin", "romantic-music", "associated_genre", "Romantic piano", "Chopin is a major nineteenth-century Romantic pianist and composer.", romantic),
  link("edvard-grieg", "folk", "influenced_by", "Norwegian folk melody", "Grieg drew on Gjendine Slålien's songs and other folk tunes in later compositions.", grieg),
  link("edvard-grieg", "classical-music", "associated_genre", "Norwegian composer", "Grieg incorporated Norwegian traditional melodies into composed art music.", grieg),
  link("classical-music", "progressive-rock", "related", "classical/prog bridge", "Progressive rock drew on classical composition and instrumentation.", prog),
  link("frank-zappa", "classical-music", "related", "orchestral compositions", "Zappa also composed and recorded orchestral music.", zappa),

  link("soul-music", "pop-music", "related", "Motown pop-soul bridge", "The Supremes bridged pop and soul audiences.", supremes),
  link("disco", "pop-music", "related", "dance-pop bridge", "Michael Jackson's late-1970s solo music fused disco and pop.", rockHall("michael-jackson")),
  link("synth-pop", "pop-music", "associated_genre", "electronic pop", "Madonna's early-1980s pop sound included synth-pop.", rockHall("madonna")),
  link("the-supremes", "soul-music", "associated_genre", "Motown soul", "The Supremes' vocal sound bridged soul and pop.", supremes),
  link("the-supremes", "pop-music", "associated_genre", "1960s pop", "The Supremes brought Motown songs to a broad pop audience.", supremes),
  link("the-jackson-5", "soul-music", "associated_genre", "Motown vocal group", "The Jackson 5 blended vocal-group, soul and Motown influences.", rockHall("jackson-5")),
  link("michael-jackson", "the-jackson-5", "member_of", "Jackson 5 singer", "Michael Jackson performed with his brothers in the Jackson 5 before his solo career.", rockHall("jackson-5")),
  link("bee-gees", "disco", "associated_genre", "disco era", "The Bee Gees helped bring disco into the late-1970s mainstream.", beeGeesDisco),
  link("bee-gees", "pop-music", "associated_genre", "pop group", "The Bee Gees crossed from pop songwriting into disco-era hits.", rockHall("bee-gees")),
  link("abba", "pop-music", "associated_genre", "1970s pop", "ABBA became an international pop group in the 1970s.", rockHall("abba")),
  link("donna-summer", "disco", "associated_genre", "disco singer", "Donna Summer was a central voice of disco.", rockHall("donna-summer")),
  link("stevie-wonder", "soul-music", "associated_genre", "Motown soul", "Stevie Wonder's career developed within Motown's soul tradition.", rockHall("stevie-wonder")),
  link("stevie-wonder", "funk", "related", "soul-funk crossover", "Wonder's recordings joined soul songwriting with funk rhythms.", rockHall("stevie-wonder")),
  link("michael-jackson", "pop-music", "associated_genre", "1980s pop", "Jackson's solo recordings redefined mainstream pop.", rockHall("michael-jackson")),
  link("michael-jackson", "disco", "associated_genre", "Off the Wall", "His 1979 album Off the Wall fused funk, disco and soul.", rockHall("michael-jackson")),
  link("madonna", "pop-music", "associated_genre", "1980s pop", "Madonna's early recordings reshaped 1980s pop.", rockHall("madonna")),
  link("madonna", "synth-pop", "associated_genre", "early synth-pop", "Madonna's early-1980s sound included synth-pop.", rockHall("madonna")),
  link("david-bowie", "glam-rock", "associated_genre", "glam-rock pioneer", "Bowie helped shape early-1970s glam rock.", bowieGlam),
  link("david-bowie", "pop-music", "related", "rock-to-pop crossover", "Bowie's later work crossed into mainstream pop.", source("Rock & Roll Hall of Fame", "https://rockhall.com/wp-content/uploads/2024/03/David_Bowie_1996.pdf")),
  link("phil-collins", "genesis", "member_of", "Genesis drummer and singer", "Collins joined Genesis in 1970 and later became its lead singer.", rockHall("phil-collins")),
  link("phil-collins", "pop-music", "associated_genre", "prog-to-pop crossover", "Collins crossed from progressive rock into pop during his solo career.", rockHall("phil-collins")),
  link("phil-collins", "soul-music", "related", "soul influence", "Collins brought soul material into his 1980s work.", rockHall("phil-collins")),
  link("the-supremes", "phil-collins", "related", "covered Supremes song", "Collins recorded the Supremes hit You Can't Hurry Love.", rockHall("phil-collins")),
  link("madonna", "david-bowie", "influenced_by", "Bowie influence", "Rock Hall lists David Bowie among Madonna's influences.", rockHall("madonna")),
];
