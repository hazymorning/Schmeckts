/* The overview card at the top of the home page: the pet in the filter, the household under „Alle“, with picture,
   name and three sentences about the day from glance.js, as people talk and with a wink. First when the last meal
   was, what it was and in a household who served it, then whether it is time for the next one or when that usually
   is, then one line more: what is only true today (a birthday, a first time, a milestone close by, an anniversary,
   a record, a meal off its usual time, the treats, a fact bound to the day) or, without any, every other day a fact
   about the animal with a lead-in and on the days between one of the kinds taking turns (the feeding duel, a
   streak, an idea for a change, a person's feeding run, a weekday's own time, the week so far, a look back, the
   varieties tried, the days in the diary), never both. The wordings are in views/facts.js, each kind with several
   ways of saying it, one of them picked by the day; the memory of what was shown is in prefs.overview. The card
   shows two lines and unfolds with a tap (toggleOverview() in views/home.js). Never how a meal went: that is what
   the cards below it are for. */
import {esc} from '../text.js';
import {addDays, dayStart, timeStr} from '../dates.js';
import {typeOf} from '../config.js';
import {db, prefs, savePrefs} from '../store.js';
import {isConnected} from '../sync.js';
import {getPet, getProduct, petNames, pname, servingPets} from '../derive.js';
import {dayNumber, glance, pick, takeTurn} from '../glance.js';
import {factsOn, fill, LINES} from './facts.js';
import {avatar, since} from './parts.js';

const FRESH = 60; // minutes after a meal in which it is still news
const NIGHT = 5; // until this hour it is still night
const STREAK = 5; // from this many days in a row the streak is worth a line
const MILESTONE_NEAR = 5; // and a milestone from this many meals before it
const BIRTHDAY_SOON = 3; // days before a birthday from which it is announced
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
/* The meal a usual time is, where people have a name for it, otherwise „Futter“ */
const mealAt = min =>
  min < 630 ? 'Frühstück' : min < 870 ? 'Mittagessen' : min >= 1020 && min < 1290 ? 'Abendessen' : 'Futter';
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
    what = p ? b(esc(pname(p))) : 'unbenanntes Futter',
    server = isConnected() && last.by ? b(esc(last.by)) : '',
    by = server ? ` von ${server}` : '',
    fed = subject(pets.length > 1 ? servingPets(last) : pets.map(x => x.id)),
    today = last.servedAt >= dayStart(now),
    time = at(last.servedAt);
  if (g.next?.due) return [say('due', now, {when: today ? 'um ' + time : since(last.servedAt, now, b), what, by})];
  if (fresh(g, now)) {
    const minutes = Math.round((now - last.servedAt) / 6e4),
      when = minutes < 2 ? 'gerade eben' : `vor ${b(minutes + ' Minuten')}`;
    if (server)
      return [say('freshHouse', now, {server, names: fed.names, when, what, verb: treat ? 'zugesteckt' : 'gegeben'})];
    return [
      say('fresh', now, {
        names: fed.names,
        hat: fed.verb('hat', 'haben'),
        when,
        what,
        verb: treat ? 'genascht' : 'bekommen',
      }),
    ];
  }
  if (today) {
    if (g.meals + g.snacks === 1) return [say('todayOne', now, {at: time, what, by})];
    const both = [
      g.meals && count(g.meals, 'Mahlzeit', 'Mahlzeiten', 'eine'),
      g.snacks && count(g.snacks, 'Snack', 'Snacks', 'einen'),
    ]
      .filter(Boolean)
      .map(b)
      .join(' und ');
    return [
      say('today', now, {
        so: g.meals ? 'schon' : 'bisher nur',
        both,
        at: time,
        what,
        by,
        names: fed.names,
        hat: fed.verb('hat', 'haben'),
      }),
      true,
    ];
  }
  if (last.servedAt >= addDays(dayStart(now), -1)) {
    if (new Date(now).getHours() >= NIGHT) return [say('nothingYet', now, {at: time, what, by})];
    return [
      say('lastNight', now, {evening: new Date(last.servedAt).getHours() >= 17 ? 'Abend ' : '', at: time, what, by}),
    ];
  }
  return [say('older', now, {since: b(since(last.servedAt, now)), what, by})];
}

/* The second sentence: whether it is time for the next meal, or when that usually is */
function outlookLine(g, pets, now) {
  const next = g.next;
  if (!next) return '';
  if (next.due) {
    const all = subject(pets.map(x => x.id));
    return say('waiting', now, {
      names: all.names,
      wartet: all.verb('wartet', 'warten'),
      uebt: all.verb('übt', 'üben'),
      hat: all.verb('hat', 'haben'),
      sitzt: all.verb('sitzt', 'sitzen'),
    });
  }
  const meal = mealAt(next.at),
    when = `gegen ${b(clock(next.at))}`;
  if (fresh(g, now)) return say('digest', now, {meal, when: (next.tomorrow ? 'morgen ' : '') + when});
  if (next.tomorrow) return say('doneToday', now, {meal, when});
  if (new Date(now).getHours() < NIGHT) return say('night', now, {meal, when});
  return say('usual', now, {meal, when});
}

/* The line more, first of all what is only true today, the first that holds: a birthday today or within
   BIRTHDAY_SOON days, a variety served for the first time, a milestone close by, an anniversary of the first meal, a
   record, a meal off its usual time or at yesterday's minute, a lot of treats. counted: the first sentence has
   already said how many treats there were. '' without any. */
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
      grip = `${all.names} ${all.verb('hat', 'haben')} ${isConnected() ? 'euch' : 'dich'} ganz schön im Griff.`;
    return say(counted ? 'snacksCounted' : 'snacks', now, {n: b(g.snacks + ' Snacks'), grip});
  }
  return '';
}

/* The kinds taking turns, each worded from what glance() found */
const TURN_LINES = {
  duel(g, now) {
    const [first, second] = g.feeders,
      names = {first: esc(first.name), second: esc(second.name)};
    return first.n > second.n
      ? say('duel', now, {...names, first: b(names.first), n: first.n, m: second.n})
      : say('duelTie', now, {...names, score: b(`${first.n} zu ${second.n}`)});
  },
  streak: (g, now, house) =>
    say('streak', now, {
      since: b(g.streak + ' Tagen'),
      days: b(g.streak + ' Tage'),
      you: house ? 'hättet eigentlich ihr' : 'hättest eigentlich du',
    }),
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
/* The line taking turns: on a day with an even number (dayNumber() in glance.js) a fact about the animal, on the
   days between one of the kinds that hold today, in the order of TURNS in glance.js, and a fact again where none
   holds; takeTurn() there picks by the memory. on: no message holds, so the turn is on at all (without a meal no
   kind holds, so the fact comes). facts: the facts of the day. {text: the line or '', memory} */
function turn(g, pets, now, memory, on, facts) {
  const house = isConnected(),
    kinds = on
      ? [
          house && g.feeders.length > 1 && 'duel',
          g.streak >= STREAK && 'streak',
          g.idea && 'idea',
          house && g.feedRun && 'run',
          g.weekday && 'weekday',
          g.week.meals >= WEEK.meals && g.week.sorts >= WEEK.sorts && 'week',
          g.lookback && 'lookback',
          g.sorts >= SORTS && 'sorts',
          g.first?.days >= DAYS && 'days',
        ].filter(Boolean)
      : [],
    factDay = on && (dayNumber(now) % 2 === 0 || !kinds.length);
  const took = takeTurn(factDay ? [] : kinds, factDay ? facts.map(f => f.id) : [], memory, now);
  return {
    text: took.kind
      ? TURN_LINES[took.kind](g, now, house)
      : took.fact
        ? say('factLead', now, {fact: facts.find(f => f.id === took.fact).text})
        : '',
    memory: took.memory,
  };
}
/* The sentences, each in a span of its own (layout only), and the memory to keep, this phone's prefs.overview.
   {text, memory} */
const line = text => `<span class="ov-line">${text}</span>`;
export function overviewLines(g, pets, now, memory) {
  const kinds = new Set(pets.map(p => p.species)),
    species = kinds.size === 1 ? [...kinds][0] : null,
    date = new Date(now),
    dated = factsOn(species, date, true)[0]?.text || '',
    facts = factsOn(species, date);
  if (!g.last) {
    const all = subject(pets.map(x => x.id)),
      took = turn(g, pets, now, memory, !dated, facts);
    return {
      text: [say('firstMeal', now, {names: all.names, wartet: all.verb('wartet', 'warten')}), dated || took.text]
        .filter(Boolean)
        .map(line)
        .join(' '),
      memory: took.memory,
    };
  }
  const [status, counted] = statusLine(g, pets, now),
    more = message(g, pets, now, counted) || dated,
    took = turn(g, pets, now, memory, !more, facts);
  return {
    text: [status, outlookLine(g, pets, now), more || took.text].filter(Boolean).map(line).join(' '),
    memory: took.memory,
  };
}
export const overviewText = (g, pets, now = Date.now(), memory = prefs.overview) =>
  overviewLines(g, pets, now, memory).text;

/* The card: a tap on the picture opens the pet, a tap anywhere else unfolds the text and folds it again (open: the
   state kept in views/home.js). What the line more and the fact of the day chose goes into the memory, so it stays
   the same all day. */
export function overviewHTML(m, open) {
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
  return `<section class="card overview${open ? ' open' : ''}" data-sec="overview" data-action="toggle-overview" aria-expanded="${!!open}" style="view-transition-name:sec-overview">${pic}<div class="ov-text"><h2>${esc(petNames(pets.map(p => p.id)))}</h2><p>${text}</p></div></section>`;
}
