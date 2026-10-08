/* The overview card's words: a sentence on the last meal for the moment, then one fact of the day. Facts first, said
   as people say them, the cat by its pronoun where its sex is known. A wording is only taken when the card knows all
   it names. {ago} is the last meal's time as „vor 2 Stunden“ or „gestern um 19:28“ (bold), {Ago} the same at the
   start of a sentence, {what} its flavours, {said} how it went for the one cat („fast alles gefressen“), {all} the
   same for several („beide haben gut gefressen“). */
export const ANCHORS = {
  none: [
    'Noch ist nichts eingetragen. Tipp unten auf „Füttern“, sobald es was gibt.',
    'Das Tagebuch ist noch leer. Die erste Mahlzeit trägst du über „Füttern“ ein.',
    'Sobald du fütterst, steht hier, wie der Tag am Napf läuft.',
  ],
  older: [
    'Der letzte Eintrag ist {days} her. Schön, dass du wieder da bist.',
    'Zuletzt eingetragen war {what}, {date}.',
    'Eine Weile gab’s keinen Eintrag. Mit der nächsten Mahlzeit geht’s weiter.',
  ],
  fresh: [
    'Eben gab’s {what}. Guten Appetit!',
    '{Sie} hat eben {what} bekommen. Guten Appetit!',
    'Gerade gefüttert: {what}.',
    'Gerade gefüttert. Guten Appetit!',
  ],
  // a variety's first time, in place of fresh and last
  firstFresh: [
    'Eben gab’s zum ersten Mal {variety}. Guten Appetit!',
    'Premiere im Napf: Eben gab’s zum ersten Mal {variety}.',
  ],
  firstLast: [
    'Zum ersten Mal gab’s heute {variety}: {said}.',
    '{Sie} hat {ago} zum ersten Mal {variety} bekommen und {said}.',
    'Heute gab’s zum ersten Mal {variety}: {all}.',
    'Heute gab’s zum ersten Mal {variety}.',
  ],
  freshTreat: [
    'Eben gab’s einen Snack, heute schon den {nthTreat}.',
    'Eben gab’s einen Snack zwischendurch.',
    '{Sie} hat eben einen Snack bekommen.',
  ],
  notYet: [
    'Heute gab’s noch keine Mahlzeit, zuletzt {ago} {what}.',
    'Heute ist noch nichts eingetragen. Zuletzt gab’s {ago} {what}.',
    '{Sie} hat heute noch nichts bekommen, zuletzt {ago} {what}.',
    'Heute gab’s noch keine Mahlzeit, die letzte war {ago}.',
  ],
  last: [
    '{Sie} hat {ago} {what} bekommen und {said}.',
    '{Ago} gab’s {what}: {said}.',
    'Zuletzt gab’s {ago} {what}: {said}.',
    '{Ago} gab’s {what}: {all}.',
    'Zuletzt gab’s {ago} {what}.',
    '{Ago} gab’s {what}.',
    'Zuletzt im Napf: {what}, {ago}.',
    '{Sie} hat {ago} zuletzt {what} bekommen.',
    'Die letzte Mahlzeit war {ago}: {said}.',
    'Die letzte Mahlzeit war {ago}.',
  ],
};

/* The second sentence. Notable facts come first where there are any, in the order of NOTABLE; the others take
   turns. */
export const FACTS = {
  noted: ['Heute notiert: {noted}.', 'Heute schon notiert: {noted}.'],
  streakLeft: [
    'Die letzten {k} Mahlzeiten blieben fast stehen.',
    '{Sie} hat die letzten {k} Mahlzeiten stehen lassen.',
  ],
  treatsNone: ['Einen Snack gab’s heute noch nicht.', '{Sie} hatte heute noch keinen Snack.', 'Noch kein Snack heute.'],
  streakGood: [
    'Die letzten {k} Mahlzeiten gingen alle gut weg.',
    '{Sie} hat die letzten {k} Mahlzeiten alle gut gefressen.',
  ],
  week: ['Diese Woche {good} von {n} Mal gut gefressen.', '{Sie} hat diese Woche {good} von {n} Mal gut gefressen.'],
  favourite: ['Am liebsten frisst {sie} gerade {fav}.', 'Liebling gerade: {fav}.', '{fav} ist gerade {ihr} Liebling.'],
  treats: ['Heute gab’s schon {treats}.', '{Sie} hatte heute schon {treats}.'],
  count: ['Heute gab’s schon {count} Mahlzeiten.', '{Sie} hat heute schon {count} Mahlzeiten bekommen.'],
  sorts: ['Diese Woche gab’s schon {sorts} verschiedene Sorten.'],
};
export const NOTABLE = ['noted', 'streakLeft', 'treatsNone'];
