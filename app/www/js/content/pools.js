/* The overview card's words, said as people say them: plain sentences, no colons. The heading greets whoever holds
   the phone, the first sentence tells the last meal, the second one fact of the day. A wording is only taken when
   the card knows all it names. {ago} is the last meal's time as „vor 2 Stunden“ or „gestern um 19:28“ (bold),
   {Ago} the same at the start of a sentence, {what} its flavours, {name} the cat, {said} how it went for the one cat
   („fast alles gefressen“), {All} how it went for several („Beide haben gut gefressen“). */

// from the hour on; Saturday and Sunday their own from noon to the evening
export const GREETINGS = [
  [0, 'Gute Nacht'],
  [5, 'Guten Morgen'],
  [11, 'Mahlzeit'],
  [14, 'Schönen Nachmittag'],
  [18, 'Guten Abend'],
  [22, 'Gute Nacht'],
];
export const WEEKEND = {6: 'Schönes Wochenende', 0: 'Schönen Sonntag'};

export const ANCHORS = {
  none: [
    'Noch ist nichts eingetragen. Die erste Mahlzeit trägst du unten über „Füttern“ ein.',
    'Das Tagebuch ist noch leer. Nach dem ersten Füttern geht es hier los.',
  ],
  older: ['Der letzte Eintrag ist {days} her. Willkommen zurück!', 'Zuletzt gab es {date} {what}.'],
  fresh: [
    '{name} hat {ago} {what} bekommen und {said}.',
    '{Ago} gab es {what}. {All}.',
    '{name} hat gerade {what} bekommen.',
    'Eben gab es {what}.',
    '{Ago} gab es {what}.',
    '{name} wurde gerade gefüttert.',
    'Eben wurde gefüttert.',
  ],
  // a variety's first time, in place of fresh and last
  firstFresh: [
    '{name} hat {ago} zum ersten Mal {variety} bekommen und {said}.',
    '{Ago} hat {name} zum ersten Mal {variety} bekommen und {said}.',
    '{Ago} gab es zum ersten Mal {variety}. {All}.',
    '{name} probiert gerade zum ersten Mal {variety}.',
    'Eben gab es zum ersten Mal {variety}.',
    '{variety} gibt es heute zum ersten Mal.',
  ],
  firstLast: [
    '{name} hat {ago} zum ersten Mal {variety} bekommen und {said}.',
    '{Ago} hat {name} zum ersten Mal {variety} bekommen und {said}.',
    '{Ago} gab es zum ersten Mal {variety}. {All}.',
    '{Ago} gab es zum ersten Mal {variety}.',
    '{name} hat heute zum ersten Mal {variety} bekommen.',
    'Heute gab es zum ersten Mal {variety}.',
  ],
  freshTreat: [
    '{name} hat heute schon den {nthTreat} Snack bekommen.',
    'Eben gab es schon den {nthTreat} Snack.',
    '{name} hat gerade einen Snack bekommen.',
    'Eben gab es einen Snack.',
  ],
  notYet: [
    '{name} hat {ago} {what} bekommen und {said}.',
    '{Ago} gab es {what}. {All}.',
    '{name} hat zuletzt {ago} {what} bekommen.',
    'Zuletzt gab es {ago} {what}.',
    '{Ago} gab es zuletzt {what}.',
    'Heute gab es noch keine Mahlzeit. Die letzte war {ago}.',
  ],
  last: [
    '{name} hat {ago} {what} bekommen und {said}.',
    '{Ago} hat {name} {what} bekommen und {said}.',
    'Zuletzt hat {name} {ago} {what} bekommen und {said}.',
    '{Ago} gab es {what}. {All}.',
    'Zuletzt gab es {ago} {what}. {All}.',
    '{name} hat {ago} {what} bekommen.',
    '{Ago} gab es {what}.',
    'Zuletzt gab es {ago} {what}.',
    'Die letzte Mahlzeit war {ago}.',
  ],
};

/* The second sentence. Notable facts come first where there are any, in the order of NOTABLE; the others take
   turns. {Wer} is the cat: by its pronoun once the first sentence has named it and its sex is known, else by name. */
export const FACTS = {
  noted: ['{noted}'],
  streakLeft: ['Die letzten {k} Mahlzeiten kamen schlecht an.', '{Wer} hat die letzten {k} Mahlzeiten kaum angerührt.'],
  treatsNone: ['Heute gab es noch keinen Snack.', '{Wer} hatte heute noch keinen Snack.'],
  streakGood: ['Die letzten {k} Mahlzeiten kamen gut an.', 'Die letzten {k} Mahlzeiten hat {wer} gut gefressen.'],
  week: [
    'Diese Woche hat es {good} von {n} Mal gut geschmeckt.',
    '{Wer} hat diese Woche {good} von {n} Mal gut gefressen.',
  ],
  favourite: ['Am liebsten frisst {wer} zurzeit {fav}.', 'Am besten kommt gerade {fav} an.'],
  treats: ['Heute gab es schon {treats}.', '{Wer} hatte heute schon {treats}.'],
  count: ['Heute gab es schon {count} Mahlzeiten.', '{Wer} hat heute schon {count} Mahlzeiten bekommen.'],
  sorts: [
    'Diese Woche gab es {sorts} verschiedene Sorten.',
    '{Wer} hat diese Woche {sorts} verschiedene Sorten bekommen.',
  ],
};
export const NOTABLE = ['noted', 'streakLeft', 'treatsNone'];

// {noted}: the first kind noted today, in this order, said of the cats it was noted for
export const NOTED = {
  vomit: '{Wer} {hat} heute erbrochen.',
  stink: 'Heute gab es Stunk.',
  tired: '{Wer} {ist} heute besonders müde.',
  hungry: '{Wer} {war} heute extra hungrig.',
  happy: '{Wer} {ist} heute gut drauf.',
};
