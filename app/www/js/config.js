/* Fixed values: species, food types, ratings and their scales, consistency and treat type, patterns for flavour. */

export const SPECIES = [
  {k: 'Katze', i: 'cat'},
  {k: 'Hund', i: 'dog'},
  {k: 'Kaninchen', i: 'rabbit'},
  {k: 'Vogel', i: 'bird'},
  {k: 'Nager', i: 'rodent'},
  {k: 'Andere', i: 'paw'},
];
export const speciesIcon = k => (SPECIES.find(s => s.k === k) || SPECIES.at(-1)).i;
export const TYPES = ['Nassfutter', 'Trockenfutter', 'Snack', 'Sonstiges'];
export const typeOf = product => (TYPES.includes(product?.type) ? product.type : TYPES[0]); // without a known type: wet food
/* Rating levels of every scale. What is measured is acceptance: score, 0 to 100. The keys live in the data and never
   change; the key alone determines points, wording and icon. short: the level in one word, under its icon on the
   rating slider. note: what the bowl or the morsel looks like, under the level's name wherever the rating slider
   names it. said: the level inside a sentence, „2 von 3 Mal nur die Soße geleckt“. */
export const RATINGS = {
  top: {label: 'Sofort leer', short: 'Leer', note: 'Napf blitzblank', said: 'sofort leer', score: 100},
  gut: {label: 'Später leer', short: 'Später', note: 'Nach und nach aufgegessen', said: 'später leer', score: 80},
  mittel: {label: 'Halb gegessen', short: 'Halb', note: 'Die Hälfte blieb übrig', said: 'halb gegessen', score: 50},
  eager: {
    label: 'Erst gierig',
    short: 'Gierig',
    note: 'Dann stehen gelassen',
    said: 'erst gierig, dann stehen gelassen',
    score: 40,
  },
  sosse: {
    label: 'Soße geleckt',
    short: 'Soße',
    note: 'Die Stückchen liegen noch da',
    said: 'nur die Soße geleckt',
    score: 30,
  },
  schlecht: {
    label: 'Kaum angerührt',
    short: 'Voll',
    note: 'Der Napf ist noch fast voll',
    said: 'kaum angerührt',
    score: 0,
  },
  gern: {label: 'Gern gefressen', short: 'Gern', note: 'Kräftig zugelangt', said: 'gern gefressen', score: 100},
  normal: {label: 'Normal gefressen', short: 'Normal', note: 'Wie sonst auch', said: 'normal gefressen', score: 80},
  wenig: {label: 'Wenig gefressen', short: 'Wenig', note: 'Nur ein paar Bröckchen', said: 'wenig gefressen', score: 35},
  liegen: {label: 'Liegen gelassen', short: 'Voll', note: 'Kaum etwas angerührt', said: 'liegen gelassen', score: 0},
  verputzt: {
    label: 'Sofort verputzt',
    short: 'Verputzt',
    note: 'Weg in einem Happs',
    said: 'sofort verputzt',
    score: 100,
  },
  spaeter: {label: 'Später gefressen', short: 'Später', note: 'Erst beschnuppert', said: 'später gefressen', score: 70},
  angeknabbert: {
    label: 'Nur angeknabbert',
    short: 'Geknabbert',
    note: 'Ein Rest blieb liegen',
    said: 'nur angeknabbert',
    score: 35,
  },
  unberuehrt: {
    label: 'Nicht angerührt',
    short: 'Unberührt',
    note: 'Nicht mal probiert',
    said: 'nicht angerührt',
    score: 0,
  },
};
/* Observation scales: what you observe depends on the food type. The mapping is in SCALE_OF. */
export const SCALES = {
  portion: ['top', 'gut', 'mittel', 'eager', 'sosse', 'schlecht'], // the bowl after the meal
  bowl: ['gern', 'normal', 'wenig', 'liegen'], // the bowl stands for longer
  bite: ['verputzt', 'spaeter', 'angeknabbert', 'unberuehrt'], // a single morsel
};
const SCALE_OF = {Nassfutter: 'portion', Trockenfutter: 'bowl', Snack: 'bite', Sonstiges: 'bite'};
export const scaleOf = product => SCALES[SCALE_OF[typeOf(product)]];
/* Consistency (wet food) and treat type: the variety's optional texture field, per type [key, label, keywords].
   The keywords in brand and variety fill an empty field and stand in for it in the evaluation while it is missing.
   The keys live in the data. Dry food and Sonstiges have no entry here. */
export const TEXTURES = {
  Nassfutter: {
    title: 'Konsistenz',
    items: [
      ['sosse', 'In Soße', /so(ß|ss)e|sauce|gravy/i],
      ['gelee', 'In Gelee', /gelee|jelly|aspik/i],
      ['pastete', 'Pastete', /pastete|p[aâ]t[eé]|terrine/i],
      ['mousse', 'Mousse', /mousse/i],
      ['block', 'Fester Block', /loaf|block/i],
      ['suppe', 'Suppe', /suppe|soup|brühe/i],
    ],
  },
  Snack: {
    title: 'Snack-Art',
    items: [
      ['knusprig', 'Knusprig', /knusp|crunch/i],
      ['weich', 'Weich', /soft|weich/i],
      ['creme', 'Creme', /creme|crème|cream|paste/i],
      ['milch', 'Milch', /milch|milk|drink/i],
      ['stick', 'Stick', /stick|streifen/i],
      ['kau', 'Kauartikel', /kau|chew/i],
    ],
  },
};
/* textureOf: the entry for a key, only when it fits the variety's type; guessTexture: the key from the keywords */
export const textureOf = (product, key) => TEXTURES[typeOf(product)]?.items.find(([k]) => k === key);
export const guessTexture = product =>
  TEXTURES[typeOf(product)]?.items.find(([, , re]) => re.test(`${product.brand} ${product.variety}`))?.[0];
/* Text recognition on the packaging (js/ocr.js). BRANDS: common cat and dog food brands including German retail
   brands; if one of them appears in the text, it applies with this spelling. Where several match, the longest wins.
   TYPE_WORDS and ANIMAL_WORDS: keywords for type and species; the consistency comes from TEXTURES. */
export const BRANDS = [
  'Whiskas',
  'Sheba',
  'Felix',
  'Kitekat',
  'Gourmet',
  'Perfect Fit',
  'Purina One',
  'Pro Plan',
  'Friskies',
  'Beneful',
  'Cesar',
  'Pedigree',
  'Frolic',
  'Chappi',
  'Dreamies',
  'Catessy',
  'Vitakraft',
  'Animonda',
  'Miamor',
  'Schesir',
  'Catz Finefood',
  'MAC’s',
  'Wildes Land',
  'Terra Canis',
  'Herrmann’s',
  'Lukullus',
  'Rocco',
  'Cosma',
  'Feringa',
  'Smilla',
  'Concept for Life',
  'Wolf of Wilderness',
  'Purizon',
  'Josera',
  'Happy Cat',
  'Happy Dog',
  'Bosch',
  'Sanabelle',
  'Royal Canin',
  'Hill’s',
  'Eukanuba',
  'Iams',
  'Select Gold',
  'Real Nature',
  'Multifit',
  'Wolfsblut',
  'Belcando',
  'Dr. Clauder’s',
  'Granatapet',
  'Leonardo',
  'Almo Nature',
  'Applaws',
  'Yarrah',
  'Defu',
  'Christopherus',
  'Mera',
  'MjAMjAM',
  'Rinti',
  'Bozita',
  'Platinum',
  'Kattovit',
  'Lily’s Kitchen',
  'Edgard & Cooper',
  'Coshida',
  'Orlando',
  'Winston',
  'Cachet',
  'Romeo',
  'K-Classic',
  'Dein Bestes',
];
/* Product lines that belong to one brand and stand on the front larger than the logo, which a script logo often
   keeps from being read („Miamor“). Read on a packaging without a brand, the line names the brand (js/ocr.js).
   Only lines no other brand uses. */
export const PRODUCT_LINES = [
  ['Miamor', ['Ragout Royale', 'Feine Filets', 'Feine Beutel', 'Milde Mahlzeit', 'Trinkfein']],
  ['Animonda', ['Carny', 'Vom Feinsten', 'Rafiné', 'Integra Protect', 'GranCarno']],
  ['Sheba', ['Selection in Sauce', 'Sauce Spéciale', 'Fresh & Fine', 'Craft Collection', 'Fine Flakes']],
  ['Felix', ['So gut wie es aussieht', 'Sensations', 'Tasty Shreds']],
  ['Gourmet', ['Mon Petit', 'Nature’s Creations']],
  ['Catz Finefood', ['Purrrr']],
  ['Happy Cat', ['Minkas']],
  ['Vitakraft', ['Poésie']],
];
export const TYPE_WORDS = [
  ['Trockenfutter', /trockenfutter|trockennahrung|kroketten|kibble|dry food/i],
  ['Snack', /snack|leckerli|leckerchen|belohnung|treat/i],
  ['Nassfutter', /nassfutter|nassnahrung|wet food/i],
];
export const ANIMAL_WORDS = [
  ['Katze', /katze|kätzchen|kitten|\bcat\b/i],
  ['Hund', /hund|welpe|puppy|\bdog\b/i],
];
/* Flavour groups for „Vorlieben“ (profile() in smart.js) and the keywords of ocr.js. A word matches at its start,
   after a space, a comma, an „&“ or a „/“ or at the beginning, so „Elemente“ is no duck and „Herzhaftes“ no heart;
   „Wild“ does not match inside „Wildschwein“, and „Lachs“ not inside „Seelachs“, which is fish. Heart, liver and
   cheese are what a compound ends in as well („Rinderherz“, „Hühnerleber“, „Frischkäse“). A variety may name
   several flavours („Huhn & Thunfisch“): flavoursOf() gives every group it names, in this order. */
const start = words => new RegExp(`(?<!\\p{L})(?:${words})`, 'iu');
const FISH_KINDS = start(
  'hering|makrele|sardine|sardelle|seelachs|kabeljau|forelle|weißfisch|seehecht|herring|mackerel|cod(?!\\p{L})|trout|whitefish',
);
export const FLAVORS = [
  ['Thunfisch', start('thunfisch|tuna')],
  ['Lachs', start('lachs|wildlachs|salmon')],
  ['Huhn', start('huhn|hühn|chicken|geflügel')],
  ['Pute', start('pute|truthahn|turkey')],
  ['Rind', start('rind|beef')],
  ['Ente', start('ente|duck')],
  ['Lamm', start('lamm|lamb')],
  ['Kaninchen', start('kaninchen|hase|rabbit')],
  ['Wild', start('wild(?!schwein|lachs)|hirsch|reh|venison')],
  ['Wildschwein', start('wildschwein|boar')],
  ['Schwein', start('schwein|pork')],
  ['Kalb', start('kalb|veal')],
  ['Pferd', start('pferd|horse')],
  ['Ziege', start('ziege|goat')],
  ['Strauß', start('strauß|strauss|ostrich')],
  ['Känguru', start('känguru|kangaroo')],
  ['Büffel', start('büffel|buffalo')],
  ['Garnele', start('garnele|krabbe|shrimp|prawn')],
  ['Fisch', new RegExp(`${start('fisch|fish').source}|${FISH_KINDS.source}`, 'iu')],
  ['Leber', /leber|liver/i],
  ['Herz', /(?<!\p{L})herz(?!haft)|(?<=\p{L})herz/iu],
  ['Käse', /käse|cheese/i],
];
const OWN_FISH = ['Thunfisch', 'Lachs']; // fish with a group of their own
/* Every flavour group a text names, in the order of FLAVORS. The general fish counts only when no particular one is
   named: „Lachs mit Fischöl“ is salmon, „Seelachs“ and „Forelle“ are fish. Remembered per text: the evaluation asks
   for the same variety names on every redraw, and the patterns are not free. */
const flavoursKnown = new Map();
const FLAVOURS_REMEMBERED = 2000; // texts remembered at most, then the memory starts over
export function flavoursOf(text) {
  const t = String(text || '');
  if (flavoursKnown.has(t)) return flavoursKnown.get(t);
  const hits = FLAVORS.filter(([, re]) => re.test(t)).map(([name]) => name);
  const out = hits.filter(name => name !== 'Fisch' || FISH_KINDS.test(t) || !hits.some(x => OWN_FISH.includes(x)));
  if (flavoursKnown.size >= FLAVOURS_REMEMBERED) flavoursKnown.clear();
  flavoursKnown.set(t, out);
  return out;
}
/* Rating reminder in minutes after serving, 0 = off: the REMIND steps, or whole hours of your own from 1 to
   REMIND_MAX_H. tidyRemind turns any stored value into a valid one. */
export const REMIND = [0, 60, 180, 360];
export const REMIND_DEFAULT = 180; // what the switch turns on with when nothing was chosen yet
export const REMIND_MAX_H = 24;
export const tidyRemind = m =>
  Number.isFinite(m) && m > 0 ? Math.min(REMIND_MAX_H, Math.max(1, Math.round(m / 60))) * 60 : 0;
export const REMIND_MAX_AGE = 10 * 60e3; // only meals at most 10 minutes old get one scheduled
export const PENDING_WINDOW = 48 * 3600e3; // open meals drop out of „Wie war’s?“ after 48 h
export const DEMO = 'demo'; // sample data identifiers start with this; they are removed on connecting
