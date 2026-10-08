/* The overview card's sentence by pool: the moment of the day (momentOf() in views/overview.js) or a moment after a
   meal was left. Facts first, said as people say them. {time} and {span} come bold, so a sentence holds only one of
   them; a sentence is only taken when the card knows all it names, {Sie} and {sie} the sex of the one pet shown.
   {when} is the last meal's time with its day, {what} its flavours, {count} today's meals as „zweimal“, {nth} the next
   meal's place today as „dritte“. */
export const POOLS = {
  none: [
    'Noch ist nichts eingetragen. Tipp unten auf „Füttern“, sobald es was gibt.',
    'Das Tagebuch ist noch leer. Die erste Mahlzeit trägst du über „Füttern“ ein.',
    'Sobald du fütterst, steht hier, wann es zuletzt was gab.',
  ],
  fresh: [
    'Eben gab’s {what}. Guten Appetit!',
    'Vor {span} gab’s {what}. Weiter geht’s gegen {time}.',
    'Gerade gefüttert, heute schon {count}.',
    '{Sie} hat eben {what} bekommen. Guten Appetit!',
    'Frisch gefüttert. Das {meal} gibt’s gegen {time}.',
    'Gerade gefüttert. Guten Appetit!',
  ],
  freshTreat: [
    'Eben gab’s einen Snack. Das {meal} gibt’s gegen {time}.',
    'Ein Snack zwischendurch. Die letzte Mahlzeit ist {span} her.',
    'Eben gab’s einen Snack, heute schon den {nthTreat}.',
    'Snackpause. Gefüttert wird wieder gegen {time}.',
    'Eben gab’s einen Snack zwischendurch.',
  ],
  due: [
    'Zeit fürs {meal}, das gibt’s meist gegen {time}.',
    'Zeit fürs {meal}. Die letzte Mahlzeit ist {span} her.',
    'Das {meal} ist dran. Zuletzt gab’s {what}, vor {span}.',
    '{Sie} wartet bestimmt schon aufs {meal}.',
    'Zeit fürs {meal}, heute die {nth} Mahlzeit.',
    'Das {meal} ist fällig, meist gibt’s das gegen {time}.',
  ],
  dueFirst: [
    'Zeit fürs {meal}. Heute gab’s noch nichts.',
    'Heute gab’s noch nichts, das {meal} gibt’s meist gegen {time}.',
    'Das {meal} ist dran. Zuletzt gab’s {when} {what}.',
    '{Sie} hat heute noch nichts bekommen. Zeit fürs {meal}.',
    'Zeit fürs {meal}, die letzte Mahlzeit war {when}.',
  ],
  later: [
    'Heute schon {count} gefüttert. Weiter geht’s gegen {time}.',
    'Zuletzt gab’s vor {span} {what}. Das {meal} gibt’s gegen {time}.',
    'Die letzte Mahlzeit ist {span} her. Das {meal} gibt’s gegen {time}.',
    'Bis zum {meal} gegen {time} ist Pause. Zuletzt gab’s {what}.',
    '{Sie} hat vor {span} {what} bekommen. Weiter geht’s gegen {time}.',
    'Gegen {time} gibt’s {meal}, heute die {nth} Mahlzeit.',
    'Weiter geht’s gegen {time}.',
  ],
  morning: [
    'Heute gab’s noch nichts. Das {meal} gibt’s meist gegen {time}.',
    'Das {meal} gibt’s meist gegen {time}. Zuletzt gab’s {when} {what}.',
    '{Sie} bekommt das {meal} meist gegen {time}.',
    'Noch ist der Napf leer, das {meal} gibt’s meist gegen {time}.',
    'Die letzte Mahlzeit war {when}. Das {meal} gibt’s meist gegen {time}.',
  ],
  done: [
    'Heute {count} gefüttert. Morgen geht’s gegen {time} weiter.',
    'Für heute ist alles gefüttert. Das {meal} gibt’s morgen gegen {time}.',
    'Zuletzt gab’s {what}, {when}. Morgen geht’s gegen {time} weiter.',
    '{Sie} hat heute {count} was bekommen. Morgen gegen {time} geht’s weiter.',
    'Feierabend am Napf. Das {meal} gibt’s morgen gegen {time}.',
  ],
  night: [
    'Zuletzt gab’s {when} {what}. Das {meal} gibt’s gegen {time}.',
    'Die letzte Mahlzeit war {when}. Weiter geht’s gegen {time}.',
    'Jetzt ist Nachtruhe. Das {meal} gibt’s gegen {time}.',
    'Bis zum {meal} gegen {time} wird geschlafen.',
    '{Sie} hat zuletzt {when} was bekommen. Das {meal} gibt’s gegen {time}.',
  ],
  today: [
    'Heute schon {count} gefüttert, zuletzt vor {span}.',
    'Zuletzt gab’s vor {span} {what}.',
    'Die letzte Mahlzeit ist {span} her.',
    '{Sie} hat vor {span} zuletzt was bekommen.',
    'Heute gab’s schon was, jetzt ist erst mal Pause.',
  ],
  yesterday: [
    'Heute ist noch nichts eingetragen. Zuletzt gab’s {when} {what}.',
    'Die letzte Mahlzeit war {when}. Heute fehlt noch ein Eintrag.',
    'Heute ist noch nichts eingetragen.',
  ],
  lastNight: [
    'Zuletzt gab’s {when} {what}.',
    'Die letzte Mahlzeit war {when}.',
    'Jetzt ist Nachtruhe, zuletzt gab’s {when} was.',
  ],
  older: [
    'Der letzte Eintrag ist {days} her. Schön, dass du wieder da bist.',
    'Zuletzt eingetragen war {what}, {date}.',
    'Eine Weile gab’s keinen Eintrag. Mit der nächsten Mahlzeit geht’s weiter.',
  ],
  leftDue: [
    'Zeit fürs {meal}. Zuletzt blieb fast alles stehen, vielleicht passt eine andere Sorte.',
    'Das {meal} ist dran. Beim letzten Mal blieb viel übrig.',
    'Zeit fürs {meal}. Die letzte Mahlzeit kam nicht gut an.',
  ],
  leftLater: [
    'Zuletzt blieb fast alles stehen. Gegen {time} gibt’s einen neuen Versuch.',
    'Die letzte Mahlzeit kam nicht gut an. Das {meal} gibt’s gegen {time}.',
  ],
  leftDone: [
    'Die letzte Mahlzeit blieb fast stehen. Morgen gegen {time} gibt’s einen neuen Versuch.',
    'Zuletzt kam die Sorte nicht gut an. Morgen geht’s gegen {time} weiter.',
  ],
  leftToday: [
    'Die letzte Mahlzeit vor {span} blieb fast stehen.',
    'Vor {span} blieb fast alles im Napf.',
    'Die letzte Mahlzeit kam nicht gut an.',
  ],
};

// added after the sentence where there is room: today's treats, or none yet where they are usual
export const TREAT_LINES = {
  some: ['Dazu gab’s {treats}.', 'Außerdem gab’s heute {treats}.', 'Dazu gab’s heute {treats}.'],
  none: ['Noch kein Snack heute.', 'Ein Snack steht noch aus.', 'Snack gab’s heute noch keinen.'],
};
