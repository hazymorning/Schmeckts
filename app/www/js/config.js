/* Fixed values: species, food types, ratings and their scales, consistency and treat type, patterns for flavour. */

export const SPECIES = [{k:'Katze',i:'cat'},{k:'Hund',i:'dog'},{k:'Kaninchen',i:'rabbit'},{k:'Vogel',i:'bird'},{k:'Nager',i:'rodent'},{k:'Andere',i:'paw'}];
export const speciesIcon = k => (SPECIES.find(s => s.k === k) || SPECIES.at(-1)).i;
export const TYPES = ['Nassfutter', 'Trockenfutter', 'Snack', 'Sonstiges'];
export const typeOf = product => TYPES.includes(product?.type) ? product.type : TYPES[0]; // without a known type: wet food
/* Rating levels of every scale. What is measured is acceptance: score, 0 to 100. The keys live in the data and never
   change; the key alone determines points, wording and icon. lines: the two lines on the rating button */
export const RATINGS = {
  top:          {label:'Sofort leer',     lines:['Sofort', 'leer'],       score:100},
  gut:          {label:'Später leer',     lines:['Später', 'leer'],       score:80},
  mittel:       {label:'Halb gegessen',   lines:['Halb', 'gegessen'],     score:50},
  sosse:        {label:'Soße geleckt',    lines:['Soße', 'geleckt'],      score:30},
  schlecht:     {label:'Kaum angerührt',  lines:['Kaum', 'angerührt'],    score:0},
  gern:         {label:'Gern gefressen',  lines:['Gern', 'gefressen'],    score:100},
  normal:       {label:'Normal gefressen', lines:['Normal', 'gefressen'], score:80},
  wenig:        {label:'Wenig gefressen', lines:['Wenig', 'gefressen'],   score:35},
  liegen:       {label:'Liegen gelassen', lines:['Liegen', 'gelassen'],   score:0},
  verputzt:     {label:'Sofort verputzt', lines:['Sofort', 'verputzt'],   score:100},
  spaeter:      {label:'Später gefressen', lines:['Später', 'gefressen'], score:70},
  angeknabbert: {label:'Nur angeknabbert', lines:['Nur', 'angeknabbert'], score:35},
  unberuehrt:   {label:'Nicht angerührt', lines:['Nicht', 'angerührt'],   score:0}
};
/* Observation scales: what you observe depends on the food type. Only scaleOf knows the mapping. */
export const SCALES = {
  portion: ['top', 'gut', 'mittel', 'sosse', 'schlecht'],           // the bowl after the meal
  bowl:    ['gern', 'normal', 'wenig', 'liegen'],                   // the bowl stands for longer
  bite:    ['verputzt', 'spaeter', 'angeknabbert', 'unberuehrt']    // a single morsel
};
const SCALE_OF = {Nassfutter:'portion', Trockenfutter:'bowl', Snack:'bite', Sonstiges:'bite'};
export const scaleOf = product => SCALES[SCALE_OF[typeOf(product)]];
/* Consistency (wet food) and treat type: the variety's optional texture field, per type [key, label, keywords].
   The keywords in brand and variety fill an empty field and stand in for it in the evaluation while it is missing.
   The keys live in the data. Dry food and other have no choice to make. */
export const TEXTURES = {
  Nassfutter: {title:'Konsistenz', items:[['sosse', 'In Soße', /so(ß|ss)e|sauce|gravy/i], ['gelee', 'In Gelee', /gelee|jelly|aspik/i],
    ['pastete', 'Pastete', /pastete|p[aâ]t[eé]|terrine/i], ['mousse', 'Mousse', /mousse/i], ['block', 'Fester Block', /loaf|block/i],
    ['suppe', 'Suppe', /suppe|soup|brühe/i]]},
  Snack: {title:'Snack-Art', items:[['knusprig', 'Knusprig', /knusp|crunch/i], ['weich', 'Weich', /soft|weich/i],
    ['creme', 'Creme', /creme|crème|cream|paste/i], ['milch', 'Milch', /milch|milk|drink/i], ['stick', 'Stick', /stick|streifen/i],
    ['kau', 'Kauartikel', /kau|chew/i]]}
};
/* textureOf: the entry for a key, only when it fits the variety's type; guessTexture: the key from the keywords */
export const textureOf = (product, key) => TEXTURES[typeOf(product)]?.items.find(([k]) => k === key);
export const guessTexture = product => TEXTURES[typeOf(product)]?.items.find(([, , re]) => re.test(`${product.brand} ${product.variety}`))?.[0];
/* Text recognition on the packaging (js/ocr.js). BRANDS: common cat and dog food brands including German retail
   brands; if one of them appears in the text, it applies with this spelling. Where several match, the longest wins.
   TYPE_WORDS and ANIMAL_WORDS: keywords for type and species; the consistency comes from TEXTURES. */
export const BRANDS = ['Whiskas', 'Sheba', 'Felix', 'Kitekat', 'Gourmet', 'Perfect Fit', 'Purina One', 'Pro Plan', 'Friskies', 'Beneful',
  'Cesar', 'Pedigree', 'Frolic', 'Chappi', 'Dreamies', 'Catessy', 'Vitakraft', 'Animonda', 'Miamor', 'Schesir',
  'Catz Finefood', 'MAC’s', 'Wildes Land', 'Terra Canis', 'Herrmann’s', 'Lukullus', 'Rocco', 'Cosma', 'Feringa', 'Smilla',
  'Concept for Life', 'Wolf of Wilderness', 'Purizon', 'Josera', 'Happy Cat', 'Happy Dog', 'Bosch', 'Sanabelle', 'Royal Canin', 'Hill’s',
  'Eukanuba', 'Iams', 'Select Gold', 'Real Nature', 'Multifit', 'Wolfsblut', 'Belcando', 'Dr. Clauder’s', 'Granatapet', 'Leonardo',
  'Almo Nature', 'Applaws', 'Yarrah', 'Defu', 'Christopherus', 'Mera', 'MjAMjAM', 'Rinti', 'Bozita', 'Platinum',
  'Kattovit', 'Lily’s Kitchen', 'Edgard & Cooper', 'Coshida', 'Orlando', 'Winston', 'Cachet', 'Romeo', 'K-Classic', 'Dein Bestes'];
export const TYPE_WORDS = [['Trockenfutter', /trockenfutter|trockennahrung|kroketten|kibble|dry food/i],
  ['Snack', /snack|leckerli|leckerchen|belohnung|treat/i], ['Nassfutter', /nassfutter|nassnahrung|wet food/i]];
export const ANIMAL_WORDS = [['Katze', /katze|kätzchen|kitten|\bcat\b/i], ['Hund', /hund|welpe|puppy|\bdog\b/i]];
export const FLAVORS = [['Thunfisch',/thunfisch|tuna/i],['Lachs',/lachs|salmon/i],['Huhn',/huhn|hühn|chicken|geflügel/i],
  ['Pute',/pute|truthahn|turkey/i],['Rind',/rind|beef/i],['Ente',/ente|duck/i],['Lamm',/lamm|lamb/i],
  ['Kaninchen',/kaninchen|rabbit/i],['Wild',/wild|hirsch|reh/i],['Fisch',/fisch|fish|forelle|kabeljau/i],['Käse',/käse|cheese/i]];
/* Rating reminder in minutes after serving, 0 = off: the REMIND steps, or whole hours of your own from 1 to
   REMIND_MAX_H. tidyRemind turns any stored value into a valid one. */
export const REMIND = [0, 60, 180, 360];
export const REMIND_MAX_H = 24;
export const tidyRemind = m => Number.isFinite(m) && m > 0 ? Math.min(REMIND_MAX_H, Math.max(1, Math.round(m / 60))) * 60 : 0;
/* What feeding starts with (prefs.feedStart, per device): both buttons in the feeding sheet, or only one. Only the
   button is hidden; scanning and photographing stay reachable through shortcuts, deep links and the route via the
   photo after an unknown barcode. tidyFeedStart turns any stored value into a valid one. */
export const FEED_START = [['beides', 'Barcode & Foto'], ['foto', 'Nur Foto'], ['barcode', 'Nur Barcode']];
export const tidyFeedStart = v => FEED_START.some(([k]) => k === v) ? v : FEED_START[0][0];
export const REMIND_MAX_AGE = 10 * 60e3;    // only meals at most 10 minutes old get one scheduled
export const PENDING_WINDOW = 48 * 3600e3; // open meals drop out of „Wie war’s?“ after 48 h
export const DEMO = 'demo'; // sample data identifiers start with this; they are removed on connecting
