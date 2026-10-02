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
export const typeOf = product => (TYPES.includes(product?.type) ? product.type : TYPES[0]);
// Keys are stored in the data, never rename them. Every wording says what the pet ate; short has to fit a column of
// six at 360px. cheer: what the confirmation adds
export const RATINGS = {
  top: {label: 'Alles gefressen', short: 'Alles', said: 'alles gefressen', score: 100, cheer: 'Ratzeputz!'},
  gut: {
    label: 'Fast alles gefressen',
    short: 'Fast alles',
    said: 'fast alles gefressen',
    score: 80,
    cheer: 'Fast wie geleckt.',
  },
  mittel: {
    label: 'Die Hälfte gefressen',
    short: 'Die Hälfte',
    said: 'die Hälfte gefressen',
    score: 50,
    cheer: 'Halbe-halbe.',
  },
  eager: {
    label: 'Nur ein bissl gefressen',
    short: 'Ein bissl',
    said: 'nur ein bissl gefressen',
    score: 40,
    cheer: 'Probiert ist probiert.',
  },
  sosse: {
    label: 'Nur die Soße geleckt',
    short: 'Nur Soße',
    said: 'nur die Soße geleckt',
    score: 30,
    cheer: 'Die Soße war der Star.',
  },
  schlecht: {
    label: 'Fast nix gefressen',
    short: 'Fast nix',
    said: 'fast nix gefressen',
    score: 0,
    cheer: 'Heute lieber nicht.',
  },
  gern: {label: 'Gern gefressen', short: 'Gern gefressen', said: 'gern gefressen', score: 100, cheer: 'Läuft!'},
  normal: {
    label: 'Normal gefressen',
    short: 'Normal gefressen',
    said: 'normal gefressen',
    score: 80,
    cheer: 'Alles im grünen Bereich.',
  },
  wenig: {
    label: 'Wenig gefressen',
    short: 'Wenig gefressen',
    said: 'wenig gefressen',
    score: 35,
    cheer: 'Heute eher sparsam.',
  },
  liegen: {
    label: 'Liegen gelassen',
    short: 'Liegen gelassen',
    said: 'liegen gelassen',
    score: 0,
    cheer: 'Der Napf bleibt voll.',
  },
  verputzt: {
    label: 'Sofort verputzt',
    short: 'Sofort verputzt',
    said: 'sofort verputzt',
    score: 100,
    cheer: 'Weg war’s!',
  },
  spaeter: {
    label: 'Später gefressen',
    short: 'Später gefressen',
    said: 'später gefressen',
    score: 70,
    cheer: 'Gut Ding will Weile.',
  },
  angeknabbert: {
    label: 'Nur angeknabbert',
    short: 'Nur geknabbert',
    said: 'nur angeknabbert',
    score: 35,
    cheer: 'Immerhin probiert.',
  },
  unberuehrt: {
    label: 'Nicht angerührt',
    short: 'Nicht angerührt',
    said: 'nicht angerührt',
    score: 0,
    cheer: 'Keine Chance.',
  },
};
export const SCALES = {
  portion: ['top', 'gut', 'mittel', 'eager', 'sosse', 'schlecht'], // the bowl after the meal
  bowl: ['gern', 'normal', 'wenig', 'liegen'], // the bowl stands for longer
  bite: ['verputzt', 'spaeter', 'angeknabbert', 'unberuehrt'], // a single morsel
};
const SCALE_OF = {Nassfutter: 'portion', Trockenfutter: 'bowl', Snack: 'bite', Sonstiges: 'bite'};
export const scaleOf = product => SCALES[SCALE_OF[typeOf(product)]];
// [key, label, pattern]; keys are stored in the data, the pattern guesses a missing texture from the name
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
export const textureOf = (product, key) => TEXTURES[typeOf(product)]?.items.find(([k]) => k === key);
export const guessTexture = product =>
  TEXTURES[typeOf(product)]?.items.find(([, , re]) => re.test(`${product.brand || ''} ${product.variety || ''}`))?.[0];
// stored with this spelling when found in packaging text; when several match, the longest wins
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
// a script logo often cannot be read, so a line printed larger names the brand; only lines no other brand uses
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
/* Words match only at their start (so "Elemente" is no duck); liver, heart and cheese also end compounds.
   flavoursOf() returns groups in this order. */
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
/* Generic fish counts only when no fish with its own group is named ("Lachs mit Fischöl" is salmon). Cached because
   every redraw asks for the same names again. */
const flavoursKnown = new Map();
const FLAVOURS_REMEMBERED = 2000;
export function flavoursOf(text) {
  const t = String(text || '');
  if (flavoursKnown.has(t)) return flavoursKnown.get(t);
  const hits = FLAVORS.filter(([, re]) => re.test(t)).map(([name]) => name);
  const out = hits.filter(name => name !== 'Fisch' || FISH_KINDS.test(t) || !hits.some(x => OWN_FISH.includes(x)));
  if (flavoursKnown.size >= FLAVOURS_REMEMBERED) flavoursKnown.clear();
  flavoursKnown.set(t, out);
  return out;
}
/* Keys are stored in the data; a kind from a newer app version is kept and shown generically. 'meal' weighs it
   against the meals in the `within` hours before (a stink takes a day to come through, hunger means the last meal
   did not last), 'day' only against the day. */
// button: {pet} is the name, or "Bande" for several
export const OBSERVATIONS = {
  happy: {
    icon: 'o_happy',
    button: 'Happy {pet}',
    chip: 'Happy',
    label: 'Gute Laune',
    said: 'Gute Laune notiert. Herrlich!',
    about: 'meal',
    within: 24,
    window: 'in den 24 Stunden',
    after: 'innerhalb eines Tages',
  },
  stink: {
    icon: 'o_stink',
    button: 'Heftiger Stunk!',
    chip: 'Stunk',
    label: 'Heftiger Stunk',
    said: 'Stunk notiert. Fenster auf!',
    about: 'meal',
    within: 24,
    window: 'in den 24 Stunden',
    after: 'innerhalb eines Tages',
  },
  hungry: {
    icon: 'o_hungry',
    button: 'Heute extra hungrig',
    chip: 'Hunger',
    label: 'Großer Hunger',
    said: 'Hunger notiert. Der Napf ist gewarnt.',
    about: 'meal',
    within: 3,
    window: 'in den drei Stunden',
    after: 'innerhalb von drei Stunden',
  },
  tired: {
    icon: 'o_tired',
    button: 'Müde {pet}',
    chip: 'Müde',
    label: 'Müder Tag',
    said: 'Müdigkeit notiert. Gähn.',
    about: 'day',
  },
};
export const observationOf = kind =>
  OBSERVATIONS[kind] || {icon: 'sparkle', chip: 'Beobachtung', label: 'Beobachtung', said: 'Ist notiert', about: 'day'};

// rating reminder, minutes after serving, 0 = off
export const REMIND = [0, 60, 180, 360];
export const REMIND_DEFAULT = 180; // used when the switch is turned on with nothing chosen yet
export const REMIND_MAX_H = 24;
export const tidyRemind = m =>
  Number.isFinite(m) && m > 0 ? Math.min(REMIND_MAX_H, Math.max(1, Math.round(m / 60))) * 60 : 0;
export const REMIND_MAX_AGE = 10 * 60e3; // older meals get no reminder scheduled
export const PENDING_WINDOW = 48 * 3600e3; // older open meals no longer ask for a rating
export const DEMO = 'demo'; // id prefix of sample data, removed on connecting

/* What a release brought that one can see, newest first. Only the newest shows, as a card after an update, until it
   is hidden (neu:<v> in prefs.hiddenHints, so v never changes) or the novelty is used: usedNews(use). off: a setting
   it needs and what to say while that is off. */
export const NEWS = [
  {
    v: '0.25.0',
    use: 'rate-reminder',
    title: 'Neu: Schneller bewerten',
    say: 'In der Erinnerung „Wie war’s?“ bewertest du jetzt mit einem Tipp.',
    why: 'Gilt sie nur einem Tier, bietet sie gleich an, wie viel es von der Sorte meistens frisst.',
    off: ['remind', 'Sie ist noch aus. Du schaltest sie in den Einstellungen bei „Ans Bewerten erinnern“ ein.'],
  },
];
