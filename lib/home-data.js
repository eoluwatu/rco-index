/*
 * KETSU Comics - curated data for the main page.
 *
 * RCO_ALL_TIME_POPULAR: the site's own "Most Viewed" chart, as shown on
 * readcomicsonline.ru's homepage on 21 May 2026 (Internet Archive copy, see
 * fixtures/live-homepage.archived-2026-05-21.html). The live chart is behind
 * the Cloudflare check, so this ranking is a snapshot and does not update.
 *
 * RCO_RECOMMENDED: hand-picked, widely acclaimed series that exist in the
 * site's catalogue (checked 16 Oct 2026). Creators + a one-line pitch are
 * editorial text written for this module.
 *
 * Slugs missing from the live catalogue are skipped automatically.
 */

var RCO_ALL_TIME_POPULAR = [
    'batman-2016',
    'absolute-batman-2024',
    'saga-2012',
    'invincible-compendium-20112018',
    'ultimate-spiderman-2024',
    'absolute-superman-2024',
    'sonic-the-hedgehog-2018',
    'amazing-spiderman-2018',
    'the-boys-20062012',
    'nightwing-2016',
    'absolute-wonder-woman-2024',
    'darth-vader-2017',
    'the-flash-2016',
    'star-wars-darth-vader-2020',
    'the-batman-who-laughs-2018',
    'something-is-killing-the-children-2019',
    'dark-knights-of-steel-2021',
    'immortal-hulk-2018',
    'detective-comics-2016',
    'the-amazing-spiderman-2022'
];

var RCO_RECOMMENDED = [
    ['invincible-2005', 'Robert Kirkman & Ryan Ottley', 'The superhero saga behind the hit animated series'],
    ['the-walking-dead-2003', 'Robert Kirkman & Charlie Adlard', 'The zombie-apocalypse epic that started it all'],
    ['paper-girls-2015', 'Brian K. Vaughan & Cliff Chiang', 'Four paper girls, 1988, and a war across time'],
    ['east-of-west-2013', 'Jonathan Hickman & Nick Dragotta', 'Death rides out in an apocalyptic sci-fi western'],
    ['monstress-2015', 'Marjorie Liu & Sana Takeda', 'Gorgeous, brutal dark fantasy'],
    ['daredevil-2019', 'Chip Zdarsky & Marco Checchetto', 'A modern classic run for the Man Without Fear'],
    ['batman-the-killing-joke', 'Alan Moore & Brian Bolland', 'The definitive Joker story'],
    ['kingdom-come-2019', 'Mark Waid & Alex Ross', 'Painted epic: the old heroes return'],
    ['fables-2002', 'Bill Willingham & Mark Buckingham', 'Fairy-tale characters in exile in New York'],
    ['descender-2015', 'Jeff Lemire & Dustin Nguyen', 'A robot boy in a galaxy that fears machines'],
    ['black-science-2013', 'Rick Remender & Matteo Scalera', 'Lost across infinite dimensions'],
    ['deadly-class-2014', 'Rick Remender & Wes Craig', 'High school for assassins, 1980s'],
    ['the-department-of-truth-2020', 'James Tynion IV & Martin Simmonds', 'Conspiracy theories that become real'],
    ['the-nice-house-on-the-lake-2021', 'James Tynion IV & Alvaro Martinez Bueno', 'A dream getaway at the end of the world'],
    ['house-of-x-2019', 'Jonathan Hickman & Pepe Larraz', 'The X-Men reinvented'],
    ['ultimate-xmen-2024', 'Peach Momoko', 'Mutant horror in a brand-new Ultimate universe'],
    ['transformers-2023', 'Daniel Warren Johnson', 'Robots in disguise, with huge heart'],
    ['mister-miracle-2017', 'Tom King & Mitch Gerads', 'The escape artist vs. the gods'],
    ['ice-cream-man-2018', 'W. Maxwell Prince & Martin Morazzo', 'Strange, unsettling horror one-shots'],
    ['gideon-falls-2018', 'Jeff Lemire & Andrea Sorrentino', 'A mysterious Black Barn haunts two lives'],
    ['absolute-martian-manhunter-2025', 'Deniz Camp & Javier Rodriguez', 'A mind-bending reinvention'],
    ['blacksad-2016', 'Juan Diaz Canales & Juanjo Guarnido', 'Feline private eye noir'],
    ['batman-white-knight-2017', 'Sean Murphy', 'What if the Joker were the hero?'],
    ['venom-2018', 'Donny Cates & Ryan Stegman', 'The symbiote run that redefined Venom'],
    ['batman-earth-one-2011', 'Geoff Johns & Gary Frank', 'A grounded new Batman origin'],
    ['lazarus-2013', 'Greg Rucka & Michael Lark', 'Dystopia ruled by families'],
    ['wynd-2020', 'James Tynion IV & Michael Dialynas', 'A boy with a secret in a world that hates magic'],
    ['brzrkr-2021', 'Keanu Reeves, Matt Kindt & Ron Garney', 'An immortal warrior\'s bloody history'],
    ['radiant-black-2021', 'Kyle Higgins & Marcelo Costa', 'An indie superhero universe kicks off'],
    ['spawn-1992', 'Todd McFarlane', 'The legendary hellspawn anti-hero'],
    ['teenage-mutant-ninja-turtles-2011', 'Kevin Eastman, Tom Waltz & others', 'The turtles\' modern epic'],
    ['star-wars-2015', 'Jason Aaron & John Cassaday', 'Luke, Leia and Han after A New Hope'],
    ['absolute-flash-2025', 'Jeff Lemire & Nick Robles', 'The Flash, reinvented for the Absolute line'],
    ['ultimate-black-panther-2024', 'Bryan Hill & Stefano Caselli', 'Wakanda at war in the new Ultimate universe'],
    ['ultimate-wolverine-2025', 'Chris Condon & Alessandro Cappuccio', 'The Winter Soldier as you have never seen him'],
    ['uncanny-xmen-2024', 'Gail Simone & David Marquez', 'Rogue leads the X-Men into a new era'],
    ['fire-power-2020', 'Robert Kirkman & Chris Samnee', 'Kung fu and a legendary fire power'],
    ['geiger-2021', 'Geoff Johns & Gary Frank', 'A glowing survivor in a nuclear wasteland'],
    ['allstar-superman-2024', 'Grant Morrison & Frank Quitely', 'Often called the greatest Superman story']
];
