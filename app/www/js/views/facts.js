/* The overview card's sentences. Pure data so the tests can check them; they also measure every sentence in the real
   card. */

/* By pool: the moment of the day (momentOf() in views/overview.js), a moment after a meal was left, a birthday.
   {time}, {span} and {pet} come bold; a sentence with {age} is only taken with the age known. */
export const POOLS = {
  due: [
    'Die Uhr sagt {meal}, und sie ist hier nicht die Einzige.',
    'Das {meal} ist dran, das hat sich herumgesprochen.',
    'Ein besserer Moment fürs {meal} kommt nicht mehr.',
    'Wer jetzt in die Küche geht, hat sofort Begleitung.',
    'Nur falls es untergeht, das {meal} wäre jetzt dran.',
    'Das {meal} ist dran, also bitte nicht erst aufs Sofa.',
    'Zeit fürs {meal}, und zwar vor der nächsten Folge.',
    'Zeit fürs {meal}, die großen Augen warten schon.',
    'Der Napf ist leer und wird sehr gründlich bewacht.',
    'Ein Wunder, dass du noch sitzt. Das {meal} ist dran.',
  ],
  dueFirst: [
    'Heute war noch niemand am Napf, außer zum Nachgucken.',
    'Der Napf ist heute noch unberührt, aus Mangel an Inhalt.',
    'Der Tag läuft schon, nur der Napf ist noch nicht dabei.',
    'Zeit fürs {meal}, heute gab’s ja noch gar nichts.',
    'Heute ist der Napf noch leer, und das wird zum Thema.',
    'Noch nichts heute, und das wird persönlich genommen.',
    'Heute gab’s noch keinen Krümel, die Geduld lässt nach.',
    'Der erste Napf des Tages wird sehnsüchtig erwartet.',
    'Bisher gab’s heute nichts. Das lässt sich ja ändern.',
    'Zeit fürs {meal}, der Tag hat bisher nichts gebracht.',
  ],
  fresh: [
    'Der Napf ist voll, und für eine Weile bist du jetzt abgemeldet.',
    'Frisch serviert. Mal sehen, ob es so gut ankommt wie gedacht.',
    'Es gibt Futter, und damit ist erst mal alles gesagt.',
    'Jetzt wird geprüft, gekostet und hoffentlich aufgegessen.',
    'Gerade serviert. Ob’s schmeckt, zeigt sich gleich.',
    'Das Futter steht, der Rest liegt nicht mehr bei dir.',
    'Gerade gab’s Futter, jetzt dürfte kurz Ruhe sein.',
    'Die ersten Happen entscheiden über den ganzen Napf.',
    'Mahlzeit. Bis der Napf leer ist, herrscht Ruhe.',
    'Gerade aufgetischt, und die Welt ist kurz in Ordnung.',
  ],
  freshTreat: [
    'Ein Snack zwischendurch, rein aus Gründen der Höflichkeit.',
    'Es gab einen Snack, und keiner muss wissen, der wievielte.',
    'Ein Snack. Gebettelt wurde vorher natürlich nicht.',
    'Ein Leckerli hat noch keinem geschadet, sagt man hier.',
    'Jetzt ist leider bekannt, wo die Snacks liegen.',
    'Manche Blicke überzeugen eben, daher der Snack.',
  ],
  later: [
    'Bis {time} hilft nur Geduld, dann gibt’s wieder was.',
    'Das {meal} kommt gegen {time}, bis dahin wird gedöst.',
    'Bis {time} bleibt Zeit für ein ordentliches Nickerchen.',
    'Es dauert noch bis {time}, auch wenn es anders aussieht.',
    'Gegen {time} gibt’s mehr. Gewartet wird gern im Weg.',
    'Gegen {time} gibt’s {meal}, bis dahin ist der Napf Deko.',
    'Das {meal} ist für {time} verabredet, nicht früher.',
    'Gegen {time} gibt’s {meal}, so sicher wie jeden Tag.',
    'Bis {time} ist Pause. Der Napf weiß das, der Bauch nicht.',
    'Nachschub gibt’s gegen {time}, bis dahin heißt es warten.',
  ],
  morning: [
    'Heute gab’s noch nichts, aber gegen {time} ist es so weit.',
    'Der erste Napf heute kommt gegen {time}, versprochen.',
    'Gegen {time} gibt’s {meal}, bis dahin wird gegähnt.',
    'Vor {time} bleibt der Napf heute leer, danach nicht mehr.',
    'Das {meal} kommt gegen {time}, ein Weilchen noch.',
    'Gegen {time} gibt’s den ersten Napf. Darauf ist Verlass.',
    'Vor {time} gibt’s nichts, auch nicht für schöne Augen.',
    'Heute geht’s am Napf gegen {time} los, nicht früher.',
  ],
  done: [
    'Für heute ist alles gefressen, oder zumindest alles serviert.',
    'Alles serviert, morgen gegen {time} geht’s weiter.',
    'Der Napf hat Feierabend, das Betteln eher nicht.',
    'Heute gibt’s nichts mehr, da hilft auch kein Gucken.',
    'Das war’s für heute. Nachgeguckt wird trotzdem.',
    'Ab jetzt wird hier nur noch verdaut und geschlafen.',
    'Mehr gibt’s heute nicht, und dabei bleibt es auch.',
    'Was jetzt noch an Blicken kommt, ist Rahmenprogramm.',
    'Für heute ist Schluss, alles Weitere klärt sich morgen.',
  ],
  night: [
    'Wer um diese Uhrzeit Hunger hat, muss bis {time} durchhalten.',
    'Gefüttert wird gegen {time}, bis dahin ist Schlafenszeit.',
    'Jetzt schon Hunger? Futter gibt’s erst gegen {time}.',
    'Der Napf schläft bis {time}, eigentlich wie alle hier.',
    'Nachfragen ist zwecklos, Futter gibt’s erst gegen {time}.',
    'Falls du gleich geweckt wirst, bleib standhaft bis {time}.',
    'Schlaf gut. Der Napf öffnet wieder gegen {time}.',
    'Erst wird geschlafen, ums Futter geht’s gegen {time}.',
    'Das nächste Futter kommt gegen {time}, nicht vorher.',
  ],
  today: [
    'Seit {span} wird verdaut, und das ganz in Ruhe.',
    'Das letzte Futter ist {span} her, alles im Lot.',
    'Seit {span} ist Ruhe am Napf, noch jedenfalls.',
    'Vor {span} gab’s Futter, seitdem wird gedöst.',
    'Nach {span} wird so langsam wieder nachgefragt.',
  ],
  yesterday: [
    'Heute ist noch alles offen, vor allem der Napf.',
    'Laut Tagebuch stand heute noch nichts im Napf.',
    'Das Tagebuch wartet heute geduldiger als der Rest.',
    'Falls heute schon gefüttert wurde, fehlt der Eintrag.',
    'Heute ist der Napf noch ein unbeschriebenes Blatt.',
  ],
  lastNight: [
    'Um diese Zeit gehört alles dem Schlaf, nicht dem Napf.',
    'Der Napf hat frei, und alle anderen hoffentlich auch.',
    'Am Napf ist Ruhe, und so soll es bis zum Morgen bleiben.',
    'Jetzt wird geschlafen, das Futter läuft nicht weg.',
    'Der Napf bleibt jetzt leer, egal wer gerade wach ist.',
    'Schlaf gut. Der Napf macht bis morgen früh dasselbe.',
  ],
  older: [
    'Den letzten Eintrag gab’s {since}. Willkommen zurück.',
    'Hier war eine Weile Ruhe. Schön, dass du wieder da bist.',
    'Das Tagebuch hatte Pause, der Napf hoffentlich nicht.',
    'Der letzte Eintrag ist etwas her. Einfach weitermachen.',
  ],
  none: [
    'Noch ist das Tagebuch leer. Mit dem ersten Napf geht es los.',
    'Das Tagebuch ist noch leer, der Napf vermutlich auch.',
    'Fürs erste Kapitel unten rechts auf „Füttern“ tippen.',
    'Hier beginnt das Tagebuch, sobald etwas im Napf landet.',
    'Alles ist bereit, jetzt fehlt nur noch das Futter.',
  ],
  leftDue: [
    'Zeit fürs {meal}. Vielleicht diesmal eine andere Sorte?',
    'Neues {meal}, neues Glück, das letzte war ja nichts.',
    'Zeit fürs {meal}, das letzte ist hoffentlich vergessen.',
    'Das {meal} ist dran, gern mal was anderes als zuletzt.',
  ],
  leftLater: [
    'Der nächste Versuch kommt gegen {time}, mit neuem Glück.',
    'Bis {time} ist Zeit, über die Sorte nachzudenken.',
    'Gegen {time} gibt’s Futter, diesmal mit mehr Begeisterung?',
  ],
  leftDone: [
    'Für heute ist Schluss. Morgen gibt’s eine neue Chance.',
    'Heute lief’s nicht rund, morgen wird neu probiert.',
    'Was übrig blieb, war wohl nicht ganz der Geschmack.',
  ],
  leftToday: ['Vor {span} lief’s eher zäh, seitdem ist Ruhe.', 'Seit {span} steht der Napf, eher unbeachtet.'],
  birthdayToday: [
    'Heute wird gefeiert, und der Napf darf voller sein.',
    'Ein Jahr älter und kein bisschen weniger hungrig.',
    'Alles Gute, und heute darf es ruhig etwas mehr sein.',
    'Das {age}. Jahr ist geschafft, darauf eine Extraportion.',
  ],
  birthdayTomorrow: [
    'Morgen ist Geburtstag, und {pet} ahnt noch nichts.',
    'Noch einmal schlafen, dann hat {pet} Geburtstag.',
  ],
};

// values come escaped from the caller; one missing stays as it is, so a test sees it
export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all);
// small words a heading and its sentence may share without sounding repetitive
const STOP = new Set(
  `der die das dem den des ein eine einen einem einer und oder aber auch noch schon mal nur ist sind war hat haben
  gibt gab sie dein deine dich dir man sich hier nicht nichts auf aufs aus bei mit von vom zum zur für fürs bis seit
  nach vor wie was`.split(/\s+/),
);
// content words cut to a light stem, so Tag, Tage and Tagen match; numbers do not count, 3 Stunden is not 3 Tage
const words = text =>
  new Set(
    text
      .replace(/<[^>]*>/g, ' ')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(w => w.length > 2 && !STOP.has(w))
      .map(w => w.replace(/(?<=.{3})(e[nrs]?|[ns])$/, '')),
  );
export function sharesWord(a, b) {
  const seen = words(a);
  return [...words(b)].some(w => seen.has(w));
}
