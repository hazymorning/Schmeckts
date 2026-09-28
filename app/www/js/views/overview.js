/* The overview card at the top of the home page: the pet in the filter, the household under „Alle“, with picture,
   name and a few sentences about the day from glance.js. First when the last meal was, what it was and in a household
   who served it, then whether it is time for the next one or when that usually is, and one line more that changes
   from day to day: a first time, a milestone close by, the treats, the week's feeding duel, a streak, an idea for a
   change, the usual times, the week so far or something about the animal, often with a wink. Never how a meal went:
   that is what the cards below it are for. */
import {esc} from '../text.js';
import {addDays, dayStart, timeStr} from '../dates.js';
import {typeOf} from '../config.js';
import {db} from '../store.js';
import {isConnected} from '../sync.js';
import {getPet, getProduct, petNames, pname, servingPets} from '../derive.js';
import {glance} from '../glance.js';
import {avatar} from './parts.js';

/* Something about the animal, one a day. Only what holds for most of them; "Andere" and mixed households take the
   general ones. */
export const FACTS = {
  Katze: [
    'Katzen schmecken nichts Süßes. Ihnen fehlt der Rezeptor dafür.',
    'Katzen haben nur einige Hundert Geschmacksknospen, Menschen mehrere Tausend.',
    'Katzen fressen mit der Nase: Zimmerwarm riecht Futter stärker als kühlschrankkalt.',
    'Mit Schnupfen fressen viele Katzen schlecht, weil sie ihr Futter kaum riechen.',
    'Frei lebende Katzen fressen viele kleine Mahlzeiten über den Tag verteilt.',
    'Viele Katzen trinken lieber, wenn das Wasser nicht direkt neben dem Futter steht.',
    'Katzen verschlafen 12 bis 16 Stunden am Tag. Den Rest der Zeit denken sie vermutlich ans Essen.',
    'Was direkt vor ihrer Nase liegt, sehen Katzen unscharf. Die Schnurrhaare tasten das Futter ab.',
  ],
  Hund: [
    'Hunde haben rund 1700 Geschmacksknospen, Menschen etwa fünfmal so viele.',
    'Anders als Katzen schmecken Hunde auch Süßes.',
    'Beim Futter zählt für Hunde vor allem, wie es riecht.',
    'Hunde kennen ihre Fütterzeiten meist besser als jede Uhr.',
    'Eine Hundenase riecht zehntausendmal feiner als unsere. Das Leckerli in deiner Tasche ist also kein Geheimnis.',
  ],
  Kaninchen: [
    'Kaninchen fressen am meisten in der Dämmerung, morgens und abends.',
    'Heu sollte immer da sein. Das Kauen hält die Zähne der Kaninchen kurz.',
    'Kaninchen können nicht erbrechen. Umso wichtiger ist, was im Napf landet.',
  ],
  Vogel: ['Vögel haben nur wenige Hundert Geschmacksknospen.'],
  Nager: ['Bei Nagern wachsen die Schneidezähne ein Leben lang nach.'],
};
export const GENERAL = [
  'Frisches Wasser gehört zu jeder Mahlzeit.',
  'Neues Futter am besten nach und nach unter das gewohnte mischen.',
  'Wer regelmäßig füttert, hat bald ein Tier, das die Uhr lesen kann. Zumindest zu den Fütterzeiten.',
];
const FRESH = 60; // minutes after a meal in which it is still news
const NIGHT = 5; // until this hour it is still night
const STREAK = 5; // from this many days in a row the streak is worth a line
const MILESTONE_NEAR = 5; // and a milestone from this many meals before it
const SNACKS = 3; // and the treats of the day from this many on
const WORDS = [
  'keine',
  'eine',
  'zwei',
  'drei',
  'vier',
  'fünf',
  'sechs',
  'sieben',
  'acht',
  'neun',
  'zehn',
  'elf',
  'zwölf',
];

const b = text => `<b>${text}</b>`;
/* „eine Mahlzeit“, „einen Snack“, „zwei Snacks“, „14 Mahlzeiten“ */
const count = (n, one, many, article) => (n === 1 ? `${article} ${one}` : `${WORDS[n] || n} ${many}`);
/* A usual time as people say it, to the quarter hour: „18 Uhr“, „7:15 Uhr“ */
function clock(min) {
  const m = Math.round(min / 15) * 15,
    h = Math.floor(m / 60) % 24;
  return (m % 60 ? `${h}:${String(m % 60).padStart(2, '0')}` : String(h)) + ' Uhr';
}
/* When a meal was served, as it is said: „7:10“ */
const at = t => b(timeStr(t).replace(/^0(?=\d:)/, ''));
/* The meal a usual time is, where people have a name for it */
const mealAt = min =>
  min < 630 ? 'Frühstück' : min < 870 ? 'Mittagessen' : min >= 1020 && min < 1290 ? 'Abendessen' : null;
const sortName = id => esc(pname(getProduct(id)));
/* One of several ways to say a thing, the same all day */
const pick = (list, now) => list[Math.round(dayStart(now) / 864e5) % list.length];

/* Who the sentences are about: the names, and the verb in the singular or the plural */
function subject(ids) {
  return {names: esc(petNames(ids)), verb: (one, many) => (ids.length > 1 ? many : one)};
}
const fresh = (g, now) => g.last && (now - g.last.servedAt) / 6e4 < FRESH;

/* The first sentence: when the last meal was, what it was and who served it. Also says whether it counted today's. */
function statusLine(g, pets, now) {
  const last = g.last,
    p = getProduct(last.productId),
    treat = p && typeOf(p) === 'Snack',
    what = p ? b(esc(pname(p))) : 'unbenanntes Futter',
    server = isConnected() && last.by ? b(esc(last.by)) : '',
    by = server ? ` von ${server}` : '',
    fed = subject(pets.length > 1 ? servingPets(last) : pets.map(x => x.id)),
    today = last.servedAt >= dayStart(now);
  if (g.next?.due)
    return [
      `Futterzeit! Zuletzt gab es ${today ? 'um ' + at(last.servedAt) : since(last.servedAt, now)} ${what}${by}.`,
    ];
  if (fresh(g, now)) {
    const minutes = Math.round((now - last.servedAt) / 6e4),
      when = minutes < 2 ? 'gerade eben' : `vor ${b(minutes + ' Minuten')}`;
    if (server) return [`${server} hat ${fed.names} ${when} ${what} ${treat ? 'zugesteckt' : 'gegeben'}.`];
    return [`${fed.names} ${fed.verb('hat', 'haben')} ${when} ${what} ${treat ? 'genascht' : 'bekommen'}.`];
  }
  if (today) {
    if (g.meals + g.snacks === 1) return [`Heute gab es um ${at(last.servedAt)} ${what}${by}.`];
    const both = [
      g.meals && count(g.meals, 'Mahlzeit', 'Mahlzeiten', 'eine'),
      g.snacks && count(g.snacks, 'Snack', 'Snacks', 'einen'),
    ]
      .filter(Boolean)
      .map(b)
      .join(' und ');
    return [
      `Heute gab es ${g.meals ? 'schon' : 'bisher nur'} ${both}, zuletzt um ${at(last.servedAt)} ${what}${by}.`,
      true,
    ];
  }
  if (last.servedAt >= addDays(dayStart(now), -1)) {
    if (new Date(now).getHours() >= NIGHT)
      return [`Heute gab es noch nichts, zuletzt gestern um ${at(last.servedAt)} ${what}${by}.`];
    const evening = new Date(last.servedAt).getHours() >= 17 ? 'Abend ' : '';
    return [`Zuletzt gab es gestern ${evening}um ${at(last.servedAt)} ${what}${by}.`];
  }
  return [`Das letzte Futter gab es ${b(since(last.servedAt, now))}: ${what}${by}.`];
}
/* „gestern um 19:30“, „vorgestern“, „vor 3 Tagen“, „am 3. Juni“ */
function since(t, now) {
  if (t >= addDays(dayStart(now), -1)) return `gestern um ${at(t)}`;
  const days = Math.round((dayStart(now) - dayStart(t)) / 864e5);
  if (days < 7) return days === 2 ? 'vorgestern' : `vor ${days} Tagen`;
  return 'am ' + new Date(t).toLocaleDateString('de-DE', {day: 'numeric', month: 'long'});
}

/* The second sentence: whether it is time for the next meal, or when that usually is */
function outlookLine(g, pets, now) {
  const next = g.next;
  if (!next) return '';
  if (next.due) {
    const all = subject(pets.map(x => x.id));
    return pick(
      [
        `${all.names} ${all.verb('wartet', 'warten')} bestimmt schon neben dem Napf.`,
        `${all.names} ${all.verb('übt', 'üben')} schon mal den vorwurfsvollen Blick.`,
        `${all.names} ${all.verb('hat', 'haben')} die Uhr bestimmt schon im Blick.`,
      ],
      now,
    );
  }
  const meal = mealAt(next.at),
    when = `gegen ${b(clock(next.at))}`;
  if (fresh(g, now)) {
    const then = `${meal || 'Futter'} gibt es ${next.tomorrow ? 'morgen ' : ''}${when}`;
    return pick([`Jetzt ist erst mal Verdauungsschlaf dran, ${then}.`, `Jetzt wird erst mal verdaut, ${then}.`], now);
  }
  if (next.tomorrow)
    return pick(
      [
        `Für heute ist alles serviert, ${meal || 'Futter'} gibt es morgen meist ${when}.`,
        `Feierabend für heute: ${meal || 'Futter'} gibt es morgen meist ${when}.`,
      ],
      now,
    );
  if (new Date(now).getHours() < NIGHT)
    return pick(
      [
        `Bis zum ${meal || 'nächsten Futter'} ${when} ist noch Schlafenszeit.`,
        `Bis zum ${meal || 'nächsten Futter'} ${when} heißt es: weiterschlafen.`,
      ],
      now,
    );
  return `${meal || 'Futter'} gibt es meist ${when}.`;
}

function duelLine([first, second]) {
  if (first.n > second.n)
    return `Im Fütter-Duell dieser Woche führt ${b(esc(first.name))} mit ${first.n} zu ${second.n}. ${esc(second.name)}, da geht noch was!`;
  return `Fütter-Duell dieser Woche: ${b(`${first.n} zu ${second.n}`)} zwischen ${esc(first.name)} und ${esc(second.name)}. Spannend!`;
}
/* One line more. What is only true today comes first, the rest takes turns by the day. counted: the first sentence
   has already said how many treats there were. */
function extraLine(g, pets, now, counted) {
  const all = subject(pets.map(x => x.id)),
    house = isConnected(),
    grip = `${all.names} ${all.verb('hat', 'haben')} ${house ? 'euch' : 'dich'} ganz schön im Griff.`;
  if (g.premiere)
    return g.premiere === g.last.productId
      ? 'Das gab es heute zum ersten Mal. Mutig!'
      : `Heute zum ersten Mal im Napf: ${b(sortName(g.premiere))}. Mutig!`;
  if (g.milestone && g.milestone.left <= MILESTONE_NEAR)
    return g.milestone.left === 1
      ? `Das nächste Füttern ist das ${b(g.milestone.n + '.')}! Fast schon ein Jubiläum.`
      : `Noch ${b(g.milestone.left + '×')} füttern bis zum ${b(g.milestone.n + '. Mal')}. Fast schon ein Jubiläum.`;
  if (g.snacks >= SNACKS)
    return counted ? `Bei so vielen Snacks: ${grip}` : `Schon ${b(g.snacks + ' Snacks')} heute: ${grip}`;
  const kinds = new Set(pets.map(p => p.species)),
    lines = [
      house && g.feeders.length > 1 && duelLine(g.feeders),
      g.streak >= STREAK &&
        `Seit ${b(g.streak + ' Tagen')} lückenlos eingetragen. Dafür ${house ? 'hättet eigentlich ihr' : 'hättest eigentlich du'} ein Leckerli verdient.`,
      g.idea && `Wie wär’s mal wieder mit ${b(sortName(g.idea.id))}? Das gab es seit ${g.idea.days} Tagen nicht.`,
      g.week?.meals >= 5 &&
        g.week.sorts > 1 &&
        `Diese Woche standen schon ${b(g.week.meals + ' Mahlzeiten')} aus ${b(g.week.sorts + ' Sorten')} auf dem Speiseplan.`,
      pick((kinds.size === 1 && FACTS[[...kinds][0]]) || GENERAL, now),
    ].filter(Boolean);
  return pick(lines, now);
}
export function overviewText(g, pets, now = Date.now()) {
  if (!g.last) {
    const all = subject(pets.map(x => x.id));
    return `${all.names} ${all.verb('wartet', 'warten')} noch auf die erste Mahlzeit im Tagebuch.`;
  }
  const [status, counted] = statusLine(g, pets, now);
  return [status, outlookLine(g, pets, now), extraLine(g, pets, now, counted)].filter(Boolean).join(' ');
}

/* The card. A tap on the picture opens the pet. Folded up the text is two lines ending in „…“; a tap on the card
   shows all of it and back again (toggleOverview() in views/home.js). open: unfolded. */
export function overviewHTML(m, open) {
  const pets = m.pet ? [getPet(m.pet)] : db.pets,
    one = pets.length === 1 ? pets[0] : null;
  const flops = new Set(m.sorts.filter(e => e.choice === 'nicht').map(e => e.id)), // no idea of a variety nobody buys
    g = glance(
      db,
      pets.map(p => p.id),
      Date.now(),
      flops,
    );
  const pic = one
    ? `<button class="ov-pic" data-action="open-pet" data-id="${one.id}" aria-label="${esc(one.name)} bearbeiten">${avatar(one, 'xxl')}</button>`
    : `<span class="ov-pic">${pets
        .slice(0, 2)
        .map(p => avatar(p, 'l pair'))
        .join('')}</span>`;
  const tap = g.last ? ` data-action="toggle-overview" aria-expanded="${!!open}"` : ''; // „Noch nichts serviert.“ is short
  return `<section class="card overview${open ? ' open' : ''}" data-sec="overview"${tap} style="view-transition-name:sec-overview">${pic}<div class="ov-text"><h2>${esc(petNames(pets.map(p => p.id)))}</h2><p>${overviewText(g, pets)}</p></div></section>`;
}
