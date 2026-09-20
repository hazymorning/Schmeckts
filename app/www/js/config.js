/* Feste Werte: Tierarten, Futterarten, Bewertungen und ihre Skalen, Konsistenz und Snack-Art, Erkennungsmuster für den Geschmack. */

export const SPECIES = [{k:'Katze',i:'cat'},{k:'Hund',i:'dog'},{k:'Kaninchen',i:'rabbit'},{k:'Vogel',i:'bird'},{k:'Nager',i:'rodent'},{k:'Andere',i:'paw'}];
export const speciesIcon = k => (SPECIES.find(s => s.k === k) || SPECIES.at(-1)).i;
export const TYPES = ['Nassfutter', 'Trockenfutter', 'Snack', 'Sonstiges'];
export const typeOf = product => TYPES.includes(product?.type) ? product.type : TYPES[0]; // ohne bekannte Art: Nassfutter
/* Bewertungsstufen aller Skalen. Gemessen wird Akzeptanz: score, 0 bis 100. Die Schlüssel stehen in den Daten und ändern
   sich nie; der Schlüssel allein bestimmt Punkte, Text und Icon. lines: die zwei Zeilen im Bewertungsknopf */
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
/* Beobachtungsskalen: Was man beobachtet, hängt von der Futterart ab. Nur scaleOf kennt die Zuordnung. */
export const SCALES = {
  portion: ['top', 'gut', 'mittel', 'sosse', 'schlecht'],           // der Napf nach der Mahlzeit
  bowl:    ['gern', 'normal', 'wenig', 'liegen'],                   // der Napf steht länger
  bite:    ['verputzt', 'spaeter', 'angeknabbert', 'unberuehrt']    // ein Happen
};
const SCALE_OF = {Nassfutter:'portion', Trockenfutter:'bowl', Snack:'bite', Sonstiges:'bite'};
export const scaleOf = product => SCALES[SCALE_OF[typeOf(product)]];
/* Konsistenz (Nassfutter) und Snack-Art: das optionale Feld texture der Sorte, je Art [Schlüssel, Text, Stichwörter].
   Die Stichwörter in Marke und Sorte füllen ein leeres Feld und dienen der Auswertung, solange es fehlt. Die Schlüssel
   stehen in den Daten. Trockenfutter und Sonstiges haben keine Auswahl. */
export const TEXTURES = {
  Nassfutter: {title:'Konsistenz', items:[['sosse', 'In Soße', /so(ß|ss)e|sauce|gravy/i], ['gelee', 'In Gelee', /gelee|jelly|aspik/i],
    ['pastete', 'Pastete', /pastete|p[aâ]t[eé]|terrine/i], ['mousse', 'Mousse', /mousse/i], ['block', 'Fester Block', /loaf|block/i],
    ['suppe', 'Suppe', /suppe|soup|brühe/i]]},
  Snack: {title:'Snack-Art', items:[['knusprig', 'Knusprig', /knusp|crunch/i], ['weich', 'Weich', /soft|weich/i],
    ['creme', 'Creme', /creme|crème|cream|paste/i], ['milch', 'Milch', /milch|milk|drink/i], ['stick', 'Stick', /stick|streifen/i],
    ['kau', 'Kauartikel', /kau|chew/i]]}
};
/* textureOf: Eintrag zu einem Schlüssel, nur wenn er zur Art der Sorte passt; guessTexture: Schlüssel nach den Stichwörtern */
export const textureOf = (product, key) => TEXTURES[typeOf(product)]?.items.find(([k]) => k === key);
export const guessTexture = product => TEXTURES[typeOf(product)]?.items.find(([, , re]) => re.test(`${product.brand} ${product.variety}`))?.[0];
/* Texterkennung auf der Packung (js/ocr.js). BRANDS: gängige Futtermarken für Katze und Hund samt deutschen
   Handelsmarken; steht eine davon im Text, gilt sie mit dieser Schreibweise. Bei mehreren gewinnt die längste.
   TYPE_WORDS und ANIMAL_WORDS: Stichwörter für Art und Tierart, die Konsistenz kommt aus TEXTURES. */
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
/* Erinnerung zum Bewerten in Minuten nach dem Servieren, 0 = aus: die Stufen REMIND oder eigene ganze Stunden von 1 bis
   REMIND_MAX_H. tidyRemind macht aus jedem gespeicherten Wert einen gültigen. */
export const REMIND = [0, 60, 180, 360];
export const REMIND_MAX_H = 24;
export const tidyRemind = m => Number.isFinite(m) && m > 0 ? Math.min(REMIND_MAX_H, Math.max(1, Math.round(m / 60))) * 60 : 0;
export const REMIND_MAX_AGE = 10 * 60e3;    // geplant wird nur für Mahlzeiten, die höchstens 10 Minuten alt sind
export const PENDING_WINDOW = 48 * 3600e3; // offene Mahlzeiten verschwinden nach 48 h aus „Wie war’s?“
export const ALBUM_MAX = 8;                 // Fotos im Album eines Tiers
export const DEMO = 'demo'; // Kennungen der Beispieldaten beginnen damit, beim Verbinden werden sie entfernt
