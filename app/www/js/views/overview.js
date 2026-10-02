/* Home page overview card: where the day stands for the bowl, then one line that is only true today or a rotating
   aside. Never how a meal went; the cards below cover that. */
import {cap, esc} from '../text.js';
import {addDays, dayStart, timeStr} from '../dates.js';
import {OBSERVATIONS, typeOf} from '../config.js';
import {icon} from '../icons.js';
import {db, prefs, savePrefs} from '../store.js';
import {getObservation, getPet, getProduct, petNames, pname, servingPets} from '../derive.js';
import {dayNumber, glance, pick, takeTurn} from '../glance.js';
import {factsOn, fill, LEADS, LINES} from './facts.js';
import {avatar, since} from './parts.js';

const FRESH = 60; // minutes a meal counts as news
const NIGHT = 5; // night lasts until this hour
const STREAK = 5; // days in a row
const MILESTONE_NEAR = 5; // meals left
const BIRTHDAY_SOON = 3; // days ahead
const SNACKS = 3;
const WEEK = {meals: 5, sorts: 2};
const SORTS = 5;
const DAYS = 7;
const HOURS_FROM = 90; // minutes
const HALF = {1: 'eineinhalb', 2: 'zweieinhalb'};
const SPANS = {1: 'einem Monat', 3: 'drei Monaten', 6: 'sechs Monaten', 12: 'einem Jahr'}; // keyed by months
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
const count = (n, one, many, article) => (n === 1 ? `${article} ${one}` : `${WORDS[n] || n} ${many}`);
// min: minutes after midnight
function clock(min) {
  const m = Math.round(min / 15) * 15,
    h = Math.floor(m / 60) % 24;
  return m % 60 ? `${h}:${String(m % 60).padStart(2, '0')}` : `${h} Uhr`;
}
const clockOf = min => `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, '0')}`;
const at = t => b(timeStr(t).replace(/^0(?=\d:)/, ''));
function spanOf(min) {
  if (min < HOURS_FROM) return `${min} Minuten`;
  const halves = Math.round(min / 30),
    hours = Math.floor(halves / 2);
  return halves % 2 && HALF[hours] ? `${HALF[hours]} Stunden` : `${Math.round(min / 60)} Stunden`;
}
const mealAt = min =>
  min < 630 ? 'Frühstück' : min < 870 ? 'Mittagessen' : min >= 1020 && min < 1290 ? 'Abendessen' : 'Futter';
const sortName = id => esc(pname(getProduct(id)));
// pick() goes by the day, so a wording stays the same all day
const say = (kind, now, values = {}) => fill(pick(LINES[kind], now), values);
const sayLead = (moment, now, values = {}) => fill(pick(LEADS[moment], now), values);

function subject(ids) {
  return {names: esc(petNames(ids)), verb: (one, many) => (ids.length > 1 ? many : one)};
}
const fresh = (g, now) => g.last && (now - g.last.servedAt) / 6e4 < FRESH;

// the moment the card speaks of, a key into LEADS and ASIDE
export function momentOf(g, now) {
  if (!g.last) return 'none';
  const today = g.last.servedAt >= dayStart(now),
    yesterday = !today && g.last.servedAt >= addDays(dayStart(now), -1),
    night = new Date(now).getHours() < NIGHT;
  if (g.next?.due) return today ? 'due' : 'dueFirst';
  if (fresh(g, now)) return 'fresh';
  if (!today && !yesterday) return 'older';
  if (g.next && night) return 'night';
  if (g.next && !g.next.tomorrow) return today ? 'later' : 'morning';
  if (g.next && today) return 'done';
  return today ? 'today' : night ? 'lastNight' : 'yesterday';
}
// moment -> `when` of a fact; missing means only facts that fit any time
const ASIDE = {
  due: 'due',
  dueFirst: 'due',
  fresh: 'fresh',
  later: 'wait',
  morning: 'wait',
  today: 'wait',
  yesterday: 'wait',
  done: 'evening',
  night: 'night',
  lastNight: 'night',
};

function leadLine(g, pets, now, moment) {
  const all = subject(pets.map(x => x.id));
  if (moment === 'none') return sayLead('none', now, {names: all.names, wartet: all.verb('wartet', 'warten')});
  const last = g.last,
    p = getProduct(last.productId),
    treat = p && typeOf(p) === 'Snack',
    feeder = g.feeders.length > 1 && last.by ? b(esc(last.by)) : '',
    fed = servingPets(last),
    some = pets.length > 1 && fed.length < pets.length ? subject(fed) : null,
    next = g.next,
    minutes = Math.round((now - last.servedAt) / 6e4),
    ago = minutes < 2 ? 'gerade eben' : `vor ${b(minutes + ' Minuten')}`;
  const values = {
    what: p ? b(esc(pname(p))) : 'unbenanntes Futter',
    at: at(last.servedAt),
    by: feeder ? ` von ${feeder}` : '',
    for: some ? ` für ${some.names}` : '',
    ago,
    Ago: cap(ago),
    meal: next ? mealAt(next.at) : 'Futter',
    time: next ? b(clock(next.at)) : '',
    since: b(since(last.servedAt, now)),
    evening: new Date(last.servedAt).getHours() >= 17 ? 'Abend ' : '',
    names: all.names,
    wartet: all.verb('wartet', 'warten'),
    findet: all.verb('findet', 'finden'),
    freut: all.verb('freut', 'freuen'),
    ist: all.verb('ist', 'sind'),
    hat: all.verb('hat', 'haben'),
  };
  if (moment === 'fresh') return sayLead(treat ? 'freshTreat' : 'fresh', now, values);
  if (moment === 'today') {
    const both = [
      g.meals && count(g.meals, 'Mahlzeit', 'Mahlzeiten', 'eine'),
      g.snacks && count(g.snacks, 'Snack', 'Snacks', 'einen'),
    ]
      .filter(Boolean)
      .map(b)
      .join(' und ');
    return sayLead('today', now, {
      ...values,
      so: g.meals ? 'schon' : 'bisher nur',
      both,
      Names: all.names,
    });
  }
  return sayLead(moment, now, values);
}

// First thing only true today, in priority order. counted: the lead already gave the treat count
function message(g, pets, now, counted) {
  if (g.birthday && (g.birthday.today || g.birthday.days <= BIRTHDAY_SOON)) {
    const {today, days, age} = g.birthday,
      pet = esc(getPet(g.birthday.pet).name);
    if (today)
      return age ? say('birthdayAge', now, {pet: b(pet), age: b(age)}) : say('birthdayToday', now, {pet: b(pet)});
    return days === 1 ? say('birthdayTomorrow', now, {pet}) : say('birthdaySoon', now, {pet, days: b(days + ' Tagen')});
  }
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
      meal: mealAt(g.shift.at),
      span: b(spanOf(Math.abs(g.shift.diff))),
    });
  if (g.sameMinute) return say('sameMinute', now);
  if (g.snacks >= SNACKS) {
    const all = subject(pets.map(x => x.id)),
      grip = `${all.names} ${all.verb('hat', 'haben')} ${g.feeders.length > 1 ? 'euch' : 'dich'} im Griff.`;
    return say(counted ? 'snacksCounted' : 'snacks', now, {n: b(g.snacks + ' Snacks'), grip});
  }
  return '';
}

const TURN_LINES = {
  duel(g, now) {
    const [first, second] = g.feeders,
      names = {first: esc(first.name), second: esc(second.name)};
    return first.n > second.n
      ? say('duel', now, {...names, first: b(names.first), n: first.n, m: second.n})
      : say('duelTie', now, {...names, score: b(`${first.n} zu ${second.n}`)});
  },
  streak: (g, now) => say('streak', now, {since: b(g.streak + ' Tagen'), days: b(g.streak + ' Tage')}),
  idea: (g, now) => say('idea', now, {sort: b(sortName(g.idea.id)), days: g.idea.days}),
  run(g, now) {
    const {name, days, other} = g.feedRun;
    return say(other ? 'feedRun' : 'feedRunAlone', now, {
      name: b(esc(name)),
      days: b(days + ' Tage'),
      since: b(days + ' Tagen'),
      other: esc(other),
    });
  },
  weekday(g, now) {
    const {weekday, mine, later} = g.weekday;
    return say('weekday', now, {
      weekday: WEEKDAYS[weekday] + 's',
      day: WEEKDAYS[weekday],
      meal: mealAt(g.weekday.at),
      shift: later ? 'später' : 'früher',
      time: b(clockOf(mine)),
    });
  },
  week: (g, now) => say('week', now, {meals: b(g.week.meals + ' Mahlzeiten'), sorts: b(g.week.sorts + ' Sorten')}),
  lookback: (g, now) => say('lookback', now, {sort: b(sortName(g.lookback))}),
  sorts: (g, now) => say('sorts', now, {n: b(g.sorts + ' Sorten')}),
  days: (g, now) =>
    say('days', now, {since: b(g.first.days + ' Tagen'), days: b(g.first.days + ' Tage'), n: b(g.first.days)}),
};
// Even days get an aside about the animal, other days one of the kinds that hold, or an aside if none does
function turn(g, now, memory, facts) {
  // the duel and the run need several people feeding, whether they share a server or files
  const kinds = [
      g.feeders.length > 1 && 'duel',
      g.streak >= STREAK && 'streak',
      g.idea && 'idea',
      g.feedRun?.other && 'run',
      g.weekday && 'weekday',
      g.week.meals >= WEEK.meals && g.week.sorts >= WEEK.sorts && 'week',
      g.lookback && 'lookback',
      g.sorts >= SORTS && 'sorts',
      g.first?.days >= DAYS && 'days',
    ].filter(Boolean),
    factDay = dayNumber(now) % 2 === 0 || !kinds.length;
  const took = takeTurn(factDay ? [] : kinds, factDay ? facts.map(f => f.id) : [], memory, now);
  return {
    text: took.kind ? TURN_LINES[took.kind](g, now) : took.fact ? facts.find(f => f.id === took.fact).text : '',
    memory: took.memory,
  };
}
const line = text => `<span class="ov-line">${text}</span>`;
export function overviewLines(g, pets, now, memory) {
  const kinds = new Set(pets.map(p => p.species)),
    species = kinds.size === 1 ? [...kinds][0] : null,
    date = new Date(now),
    moment = momentOf(g, now),
    dated = factsOn(species, date, true)[0]?.text || '',
    news = (g.last && message(g, pets, now, moment === 'today')) || dated;
  let more = news,
    kept = memory;
  if (!more && (moment === 'due' || moment === 'dueFirst')) {
    const all = subject(pets.map(x => x.id));
    more = say('waiting', now, {
      names: all.names,
      wartet: all.verb('wartet', 'warten'),
      uebt: all.verb('übt', 'üben'),
      hat: all.verb('hat', 'haben'),
      sitzt: all.verb('sitzt', 'sitzen'),
    });
  } else if (!more) {
    const took = turn(g, now, memory, factsOn(species, date, false, ASIDE[moment] || null));
    more = took.text;
    kept = took.memory;
  }
  // a birthday today goes first, except at feeding time
  const first = leadLine(g, pets, now, moment),
    order = g.birthday?.today && news && moment !== 'due' && moment !== 'dueFirst' ? [more, first] : [first, more];
  return {text: order.filter(Boolean).map(line).join(' '), memory: kept, moment};
}
// always at hand, so noting takes one tap; who: the pet's name, or the whole bunch; just: the kind just noted
const observeRail = (who, just) =>
  `<div class="rail obs" role="group" aria-label="Beobachtung notieren">${Object.entries(OBSERVATIONS)
    .map(
      ([k, o]) =>
        `<button class="chip toned o-${k}" data-action="observe" data-v="${k}" aria-label="${o.label} notieren"><i class="disc${k === just ? ' pop' : ''}">${icon(o.icon)}</i>${o.button.replace('{pet}', who)}</button>`,
    )
    .join('')}</div>`;
const SLEEP = new Set(['night', 'lastNight']),
  DUE = new Set(['due', 'dueFirst']);

// noted: the entry just made, so the chip just tapped can answer
export function overviewHTML(m, noted = null) {
  const pets = m.pet ? [getPet(m.pet)] : db.pets,
    one = pets.length === 1 ? pets[0] : null,
    now = Date.now();
  const flops = new Set(m.sorts.filter(e => e.choice === 'nicht').map(e => e.id)), // never suggest a variety nobody buys
    g = glance(
      db,
      pets.map(p => p.id),
      now,
      flops,
    ),
    {text, memory, moment} = overviewLines(g, pets, now, prefs.overview);
  if (memory !== prefs.overview) {
    prefs.overview = memory;
    savePrefs();
  }
  // a party hat on a birthday, sleepy z's at night
  const party = g.birthday?.today,
    mood = party ? ' party' : SLEEP.has(moment) ? ' sleepy' : '',
    hat = party ? `<i class="hat">${icon('hat')}</i>` : '',
    pic = one
      ? `<button class="ov-pic${mood}" data-action="open-pet" data-id="${one.id}" aria-label="${esc(one.name)} bearbeiten">${avatar(one, 'xxl')}${hat}</button>`
      : `<span class="ov-pic${mood}">${pets
          .slice(0, 2)
          .map(p => avatar(p, 'l pair'))
          .join('')}${hat}</span>`,
    just = noted && getObservation(noted)?.kind;
  return `<section class="card overview" data-sec="overview"${DUE.has(moment) ? ' data-due' : ''} style="view-transition-name:sec-overview">
    <div class="ov-top">${pic}<div class="ov-text"><h2>${esc(petNames(pets.map(p => p.id)))}</h2><p>${text}</p></div></div>
    ${observeRail(one ? esc(one.name) : 'Bande', just)}</section>`;
}
