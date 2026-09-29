/* The overview card at the top of the home page: the pet in the filter, the household under „Alle“, with picture,
   name and a few sentences about the day from glance.js. First when the last meal was, what it was and in a household
   who served it, then whether it is time for the next one or when that usually is, and one line more: what is only
   true today (a first time, a milestone close by, an anniversary, a record, a meal off its usual time,
   the treats, a fact bound to the day) or, without any, one of the kinds taking turns by the day (the feeding duel,
   a streak, an idea for a change, a person's feeding run, a weekday's own time, the week so far, a look back, the
   varieties tried, the days in the diary, something about the animal), the wordings in views/facts.js and the
   memory of what was shown in prefs.overview. Never how a meal went: that is what the cards below it are for. */
import {esc} from '../text.js';
import {addDays, dayStart, timeStr} from '../dates.js';
import {typeOf} from '../config.js';
import {db, prefs, savePrefs} from '../store.js';
import {isConnected} from '../sync.js';
import {getPet, getProduct, petNames, pname, servingPets} from '../derive.js';
import {glance, pick, takeTurn} from '../glance.js';
import {factsOn, fill, LINES} from './facts.js';
import {avatar, since} from './parts.js';

const FRESH = 60; // minutes after a meal in which it is still news
const NIGHT = 5; // until this hour it is still night
const STREAK = 5; // from this many days in a row the streak is worth a line
const MILESTONE_NEAR = 5; // and a milestone from this many meals before it
const SNACKS = 3; // and the treats of the day from this many on
const WEEK = {meals: 5, sorts: 2}; // and the week so far from this many meals of this many varieties
const SORTS = 5; // and the varieties tried from this many
const DAYS = 7; // and the days in the diary from this many
const HOURS_FROM = 90; // minutes off the usual time that are said in hours, to the half hour
const HALF = {1: 'eineinhalb', 2: 'zweieinhalb'};
const SPANS = {1: 'einem Monat', 3: 'drei Monaten', 6: 'sechs Monaten', 12: 'einem Jahr'}; // the anniversaries glance.js finds
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
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
/* A time of day in minutes as on a clock: „8:45“ */
const clockOf = min => `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, '0')}`;
/* When a meal was served, as it is said: „7:10“ */
const at = t => b(timeStr(t).replace(/^0(?=\d:)/, ''));
/* Minutes off the usual time as people say them: „40 Minuten“, from HOURS_FROM on to the half hour: „eineinhalb
   Stunden“, „2 Stunden“ */
function spanOf(min) {
  if (min < HOURS_FROM) return `${min} Minuten`;
  const halves = Math.round(min / 30),
    hours = Math.floor(halves / 2);
  return halves % 2 && HALF[hours] ? `${HALF[hours]} Stunden` : `${Math.round(min / 60)} Stunden`;
}
/* The meal a usual time is, where people have a name for it */
const mealAt = min =>
  min < 630 ? 'Frühstück' : min < 870 ? 'Mittagessen' : min >= 1020 && min < 1290 ? 'Abendessen' : null;
const sortName = id => esc(pname(getProduct(id)));
/* One of the ways of saying a kind of line, the same all day, with its places filled */
const say = (kind, now, values = {}) => fill(pick(LINES[kind], now), values);

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
    what = p ? `<b class="ov-sort">${esc(pname(p))}</b>` : 'unbenanntes Futter', // the class: fitOverview() in views/home.js may cut it
    server = isConnected() && last.by ? b(esc(last.by)) : '',
    by = server ? ` von ${server}` : '',
    fed = subject(pets.length > 1 ? servingPets(last) : pets.map(x => x.id)),
    today = last.servedAt >= dayStart(now);
  if (g.next?.due)
    return [
      `Futterzeit! Zuletzt gab es ${today ? 'um ' + at(last.servedAt) : since(last.servedAt, now, b)} ${what}${by}.`,
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

/* The line more, first of all what is only true today, the first that holds: a variety served for the first time, a
   milestone close by, an anniversary of the first meal, a record, a meal off its usual time or at yesterday's minute,
   a lot of treats, a fact bound to the day. counted: the first sentence has already said how many treats there were.
   '' without any. */
function message(g, pets, now, counted, species) {
  if (g.premiere)
    return g.premiere === g.last.productId
      ? say('premiereLast', now)
      : say('premiere', now, {sort: b(sortName(g.premiere))});
  if (g.milestone && g.milestone.left <= MILESTONE_NEAR)
    return g.milestone.left === 1
      ? say('milestoneNext', now, {m: b(g.milestone.n + '.')})
      : say('milestone', now, {n: b(g.milestone.left + '×'), m: b(g.milestone.n + '. Mal')});
  if (g.anniversary) return say('anniversary', now, {span: b(SPANS[g.anniversary]), n: b(g.first.meals)});
  if (g.record.streak) return say('recordStreak', now, {days: b(g.record.streak + ' Tage')});
  if (g.record.meals) return say('recordDay', now, {n: b(g.record.meals + ' Mahlzeiten')});
  if (g.shift)
    return say(g.shift.diff < 0 ? 'earlier' : 'later', now, {
      meal: mealAt(g.shift.at) || 'Futter',
      span: b(spanOf(Math.abs(g.shift.diff))),
    });
  if (g.sameMinute) return say('sameMinute', now);
  if (g.snacks >= SNACKS) {
    const all = subject(pets.map(x => x.id)),
      grip = `${all.names} ${all.verb('hat', 'haben')} ${isConnected() ? 'euch' : 'dich'} ganz schön im Griff.`;
    return say(counted ? 'snacksCounted' : 'snacks', now, {n: b(g.snacks + ' Snacks'), grip});
  }
  return factsOn(species, new Date(now), true)[0]?.text || '';
}

/* The kinds taking turns that hold today, in the order of TURNS in glance.js, and the facts that may come; takeTurn()
   there picks by the memory. {text, memory} */
function turn(g, pets, now, species, memory) {
  const house = isConnected(),
    facts = factsOn(species, new Date(now)),
    kinds = [
      house && g.feeders.length > 1 && 'duel',
      g.streak >= STREAK && 'streak',
      g.idea && 'idea',
      house && g.feedRun && 'run',
      g.weekday && 'weekday',
      g.week.meals >= WEEK.meals && g.week.sorts >= WEEK.sorts && 'week',
      g.lookback && 'lookback',
      g.sorts >= SORTS && 'sorts',
      g.first?.days >= DAYS && 'days',
      facts.length && 'fact',
    ].filter(Boolean);
  const took = takeTurn(
    kinds,
    facts.map(f => f.id),
    memory,
    now,
  );
  return {text: took.kind ? turnLine(took, g, now, facts, house) : '', memory: took.memory};
}
function turnLine({kind, fact}, g, now, facts, house) {
  switch (kind) {
    case 'duel': {
      const [first, second] = g.feeders,
        names = {first: esc(first.name), second: esc(second.name)};
      return first.n > second.n
        ? say('duel', now, {...names, first: b(names.first), n: first.n, m: second.n})
        : say('duelTie', now, {...names, score: b(`${first.n} zu ${second.n}`)});
    }
    case 'streak':
      return say('streak', now, {
        since: b(g.streak + ' Tagen'),
        days: b(g.streak + ' Tage'),
        you: house ? 'hättet eigentlich ihr' : 'hättest eigentlich du',
      });
    case 'idea':
      return say('idea', now, {sort: b(sortName(g.idea.id)), days: g.idea.days});
    case 'run': {
      const {name, days, other} = g.feedRun;
      return say(other ? 'feedRun' : 'feedRunAlone', now, {
        name: b(esc(name)),
        days: b(days + ' Tage'),
        since: b(days + ' Tagen'),
        other: esc(other),
      });
    }
    case 'weekday': {
      const {weekday, mine, later} = g.weekday;
      return say('weekday', now, {
        weekday: WEEKDAYS[weekday] + 's',
        day: WEEKDAYS[weekday],
        meal: mealAt(g.weekday.at) || 'Futter',
        shift: later ? 'später' : 'früher',
        time: b(clockOf(mine)),
      });
    }
    case 'week':
      return say('week', now, {meals: b(g.week.meals + ' Mahlzeiten'), sorts: b(g.week.sorts + ' Sorten')});
    case 'lookback':
      return say('lookback', now, {sort: b(sortName(g.lookback))});
    case 'sorts':
      return say('sorts', now, {n: b(g.sorts + ' Sorten')});
    case 'days':
      return say('days', now, {since: b(g.first.days + ' Tagen'), days: b(g.first.days + ' Tage')});
    default:
      return facts.find(f => f.id === fact).text;
  }
}
/* The sentences, each in a span of its own, so that fitOverview() in views/home.js can drop the last ones where the
   card's lines run out. memory: this phone's prefs.overview; the one given back is the one to keep. {text, memory} */
const line = text => `<span class="ov-line">${text}</span>`;
export function overviewLines(g, pets, now, memory) {
  if (!g.last) {
    const all = subject(pets.map(x => x.id));
    return {
      text: line(`${all.names} ${all.verb('wartet', 'warten')} noch auf die erste Mahlzeit im Tagebuch.`),
      memory,
    };
  }
  const kinds = new Set(pets.map(p => p.species)),
    species = kinds.size === 1 ? [...kinds][0] : null,
    [status, counted] = statusLine(g, pets, now);
  let more = message(g, pets, now, counted, species),
    kept = memory;
  if (!more) ({text: more, memory: kept} = turn(g, pets, now, species, memory));
  return {text: [status, outlookLine(g, pets, now), more].filter(Boolean).map(line).join(' '), memory: kept};
}
export const overviewText = (g, pets, now = Date.now(), memory = prefs.overview) =>
  overviewLines(g, pets, now, memory).text;

/* The card, as tall as its text: a tap on the picture opens the pet, the rest is no button. What the line more chose
   goes into the memory, so it stays the same all day. */
export function overviewHTML(m) {
  const pets = m.pet ? [getPet(m.pet)] : db.pets,
    one = pets.length === 1 ? pets[0] : null,
    now = Date.now();
  const flops = new Set(m.sorts.filter(e => e.choice === 'nicht').map(e => e.id)), // no idea of a variety nobody buys
    g = glance(
      db,
      pets.map(p => p.id),
      now,
      flops,
    ),
    {text, memory} = overviewLines(g, pets, now, prefs.overview);
  if (memory !== prefs.overview) {
    prefs.overview = memory;
    savePrefs();
  }
  const pic = one
    ? `<button class="ov-pic" data-action="open-pet" data-id="${one.id}" aria-label="${esc(one.name)} bearbeiten">${avatar(one, 'xxl')}</button>`
    : `<span class="ov-pic">${pets
        .slice(0, 2)
        .map(p => avatar(p, 'l pair'))
        .join('')}</span>`;
  return `<section class="card overview" data-sec="overview" style="view-transition-name:sec-overview">${pic}<div class="ov-text"><h2>${esc(petNames(pets.map(p => p.id)))}</h2><p>${text}</p></div></section>`;
}
