/* A glance at the pets shown, for the overview card: what they had today, when and from whom, when the next meal
   usually comes, and the material for one more line that changes from day to day. It reads when, what and by
   whom a meal was served, never how it went: no rating reaches the overview (PROJECT.md, Cards). Pure;
   views/overview.js words it. */
import {typeOf} from './config.js';
import {addDays, dayKey, dayStart, weekStart} from './dates.js';
import {feedSlots, nextMeal, nextMilestone} from './smart.js';

const DAY = 864e5;
const SPAN = 400 * DAY; // how far back it looks day by day: a streak of a year and more is still counted
const IDEA = {span: 90 * DAY, served: 3, after: 10}; // a regular of the last 90 days, served 3 times, not for 10 days
const RECORD = {meals: 3, streak: 7}; // a record day from this many meals, a record streak from this many days
const SHIFT = {least: 30, most: 180}; // minutes off its usual time a meal is worth a word from, and no longer that meal beyond
const RUN = {least: 3, days: 60}; // a person's feeding run from this many days, looked for within this many
const WEEKDAY = {weeks: 8, least: 3, apart: 30}; // a weekday's own time: over this many weeks, from this many meals on it, this many minutes off the other days
const ANNIVERSARY = [1, 3, 6, 12]; // months since the first meal that are worth a word
const LOOKBACK = 365; // days back: „Heute vor einem Jahr“
const BIRTHDAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/; // pets[].birthday, anything else is left alone
/* The kinds of the line taking turns, in their rank (views/overview.js words each), and the memory: the kinds of
   the last three days and the facts of the last sixty are not repeated */
export const TURNS = ['duel', 'streak', 'idea', 'run', 'weekday', 'week', 'lookback', 'sorts', 'days'];
export const MEMORY = {kinds: 3, facts: 60};

/* One of several ways to say a thing, the same all day */
export const pick = (list, now) => list[Math.round(dayStart(now) / DAY) % list.length];

const median = values => {
  const v = [...values].sort((a, b) => a - b);
  return (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2;
};
const minuteOf = t => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};
/* The usual time a meal at `min` belongs to: the nearest of the slots, or -1 without any */
const slotOf = (slots, min) =>
  slots.reduce((best, s, i) => (best < 0 || Math.abs(s.at - min) < Math.abs(slots[best].at - min) ? i : best), -1);
/* The longest run of days in a row among `days` (keys), the run ending at `last` left out */
function longestRun(days, last) {
  const sorted = [...days].sort();
  let longest = 0,
    run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i && Date.parse(sorted[i]) - Date.parse(sorted[i - 1]) === DAY ? run + 1 : 1;
    if (sorted[i] !== last && (i === sorted.length - 1 || Date.parse(sorted[i + 1]) - Date.parse(sorted[i]) !== DAY))
      longest = Math.max(longest, run);
  }
  return longest;
}
/* Midnight of a day of the year `y`, or of the month's last day where it has none: February 29 on the 28th */
const onDay = (y, month, day) => new Date(y, month - 1, Math.min(day, new Date(y, month, 0).getDate())).getTime();
/* The next birthday among the pets shown: {pet, today: true, age} on the day, {pet, days} before it, null without
   one. The age from the year, and null before the first birthday. */
function nextBirthday(db, shown, now) {
  const today = dayStart(now),
    year = new Date(now).getFullYear();
  let best = null;
  for (const p of db.pets) {
    const m = shown.has(p.id) && BIRTHDAY_RE.exec(p.birthday || '');
    if (!m) continue;
    const [born, month, day] = m.slice(1).map(Number);
    let at = onDay(year, month, day);
    if (at < today) at = onDay(year + 1, month, day);
    const days = Math.round((at - today) / DAY);
    if (!best || days < best.days) best = {pet: p.id, days, age: new Date(at).getFullYear() - born};
  }
  if (!best) return null;
  return best.days
    ? {pet: best.pet, days: best.days}
    : {pet: best.pet, today: true, age: best.age > 0 ? best.age : null};
}
/* The same calendar day `months` months after t, or the month's last day where it has none: {first} in a month */
function monthsAfter(t, months) {
  const d = new Date(t),
    m = new Date(d.getFullYear(), d.getMonth() + months, 1),
    last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  m.setDate(Math.min(d.getDate(), last));
  return dayKey(m.getTime());
}

/* {last, meals, snacks, feeders, week, next, streak, premiere, idea, milestone, first, sorts, anniversary, record,
    shift, sameMinute, feedRun, weekday, lookback, birthday}
   last        the newest meal of the pets up to now, null without one
   meals       today's meals, snacks today's treats (a treat is not a meal, as in the history)
   feeders     this week's meals per person, the most first: [{name, n}]
   week        this week's meals and how many varieties they were: {meals, sorts}
   next        nextMeal() in smart.js for these pets
   streak      how many days in a row something has been served, up to today or, while nothing has been yet, yesterday
   premiere    a variety served today for the first time, null without one
   idea        a regular that has not been served for a while: {id, days}; varieties in `avoid` are left out
   milestone   nextMilestone() in smart.js
   first       the first meal in the diary: {at, days: since then, meals: all of them}, null without one
   sorts       how many varieties there are that the pets have had
   anniversary today the first meal lies exactly 1, 3, 6 or 12 months back: that number, else null
   record      {meals: today's meals, where no day had that many (from RECORD.meals), streak: the streak, where none was
               that long (from RECORD.streak); 0 where not}
   shift       today's last meal lies off the usual time of its slot, or off this weekday's own time where it has
               one: {at: the slot's minute, diff: minutes, earlier negative}, null within SHIFT.least or beyond
               SHIFT.most
   sameMinute  today's last meal at the very minute of one yesterday
   feedRun     a person feeding day after day: {name, days, other: another name of the week or the run, or null}
   weekday     this weekday's own time for a slot, in the median over WEEKDAY.weeks weeks against the other days:
               {at: the slot's minute, mine: this weekday's, later, weekday}, null without one
   lookback    the variety served exactly LOOKBACK days ago, null without one
   birthday    the next birthday among the pets shown: {pet, today: true, age} on the day (age null before the
               first one), {pet, days} before it, null without a birthday; February 29 falls on the 28th in a year
               without it */
export function glance(db, pets, now, avoid = new Set()) {
  const shown = new Set(pets),
    today = dayStart(now),
    todayKey = dayKey(now),
    yesterdayKey = dayKey(addDays(now, -1)),
    backKey = dayKey(addDays(now, -LOOKBACK)),
    monday = weekStart(now),
    runFrom = today - RUN.days * DAY,
    weeksFrom = addDays(today, -7 * WEEKDAY.weeks),
    products = new Set(db.products.map(p => p.id)),
    snack = new Set(db.products.filter(p => typeOf(p) === 'Snack').map(p => p.id));
  const out = {
      last: null,
      meals: 0,
      snacks: 0,
      feeders: [],
      week: {meals: 0, sorts: 0},
      streak: 0,
      premiere: null,
      idea: null,
      first: null,
      sorts: 0,
      anniversary: null,
      record: {meals: 0, streak: 0},
      shift: null,
      sameMinute: false,
      feedRun: null,
      weekday: null,
      lookback: null,
      birthday: nextBirthday(db, shown, now),
    },
    fed = new Map(),
    sorts = new Set(), // the varieties of this week's meals
    tried = new Set(), // and of every meal
    days = new Set(),
    perDay = new Map(), // meals per day, treats aside
    fedOn = new Map(), // day → who fed
    recent = [], // the meals of the last weeks: {min, wd}
    todays = [], // today's meals, treats aside, the newest first: {min}
    yesterdays = [], // and yesterday's
    served = new Set(), // the varieties of today
    before = new Set(), // and those served before today
    regulars = new Map();
  let total = 0,
    first = null;
  for (const s of db.servings) {
    if (s.servedAt > now || !Object.keys(s.pets || {}).some(id => shown.has(id))) continue;
    total++;
    first = s.servedAt; // the newest first, so the last one seen is the oldest
    if (products.has(s.productId)) tried.add(s.productId);
    if (s.servedAt <= now - SPAN) continue; // beyond the span only what counts over the whole diary
    out.last ||= s;
    const key = dayKey(s.servedAt),
      meal = !snack.has(s.productId);
    days.add(key);
    if (meal) perDay.set(key, (perDay.get(key) || 0) + 1);
    if (s.servedAt >= today) {
      out[meal ? 'meals' : 'snacks']++;
      if (s.productId) served.add(s.productId);
      if (meal) todays.push({min: minuteOf(s.servedAt)});
    } else before.add(s.productId);
    if (meal && key === yesterdayKey) yesterdays.push({min: minuteOf(s.servedAt)});
    if (meal && s.servedAt >= weeksFrom) recent.push({min: minuteOf(s.servedAt), wd: new Date(s.servedAt).getDay()});
    if (key === backKey && products.has(s.productId)) out.lookback ||= s.productId;
    const name = (s.by || '').trim();
    if (s.servedAt >= monday && name) fed.set(name, (fed.get(name) || 0) + 1);
    if (s.servedAt >= runFrom && name) (fedOn.get(key) || fedOn.set(key, new Set()).get(key)).add(name);
    if (s.servedAt >= monday && meal) {
      out.week.meals++;
      if (s.productId) sorts.add(s.productId);
    }
    if (s.productId && s.servedAt > now - IDEA.span) {
      const r = regulars.get(s.productId) || {n: 0, t: s.servedAt};
      r.n++;
      regulars.set(s.productId, r);
    }
  }
  out.feeders = [...fed]
    .map(([name, n]) => ({name, n}))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de'));
  for (let d = days.has(todayKey) ? now : addDays(now, -1); days.has(dayKey(d)); d = addDays(d, -1)) out.streak++;
  out.premiere = db.products.find(p => served.has(p.id) && !before.has(p.id) && p.createdAt >= today)?.id || null;
  const idea = [...regulars]
    .filter(([id, r]) => r.n >= IDEA.served && now - r.t >= IDEA.after * DAY && !avoid.has(id))
    .sort(([, a], [, b]) => b.n - a.n || a.t - b.t)[0];
  out.idea = idea ? {id: idea[0], days: Math.round((today - dayStart(idea[1].t)) / DAY)} : null;
  out.week.sorts = sorts.size;
  out.sorts = tried.size;
  if (first !== null) {
    out.first = {at: first, days: Math.round((today - dayStart(first)) / DAY), meals: total};
    if (out.first.days) out.anniversary = ANNIVERSARY.find(m => monthsAfter(first, m) === todayKey) || null;
  }
  // Records: today's meals against every other day, the streak against every earlier one
  const most = Math.max(0, ...[...perDay].filter(([key]) => key !== todayKey).map(([, n]) => n));
  if (out.meals >= RECORD.meals && out.meals > most) out.record.meals = out.meals;
  const streakEnd = days.has(todayKey) ? todayKey : yesterdayKey;
  if (out.streak >= RECORD.streak && days.has(todayKey) && out.streak > longestRun(days, streakEnd))
    out.record.streak = out.streak;
  // This weekday's own time for one of the slots
  const slots = feedSlots(db, now, pets),
    wd = new Date(now).getDay();
  for (const [i, slot] of slots.entries()) {
    const mine = recent.filter(x => slotOf(slots, x.min) === i);
    const here = mine.filter(x => x.wd === wd).map(x => x.min),
      there = mine.filter(x => x.wd !== wd).map(x => x.min);
    if (here.length < WEEKDAY.least || there.length < WEEKDAY.least) continue;
    const diff = median(here) - median(there);
    if (Math.abs(diff) < WEEKDAY.apart) continue;
    out.weekday = {at: slot.at, mine: Math.round(median(here) / 5) * 5, later: diff > 0, weekday: wd};
    break;
  }
  // Today's last meal against its usual time, on a weekday with a time of its own against that, and against yesterday
  const last = todays[0];
  if (last && slots.length) {
    const i = slotOf(slots, last.min),
      usual = out.weekday?.at === slots[i].at ? out.weekday.mine : slots[i].at,
      diff = last.min - usual;
    if (Math.abs(diff) >= SHIFT.least && Math.abs(diff) <= SHIFT.most) out.shift = {at: slots[i].at, diff};
  }
  if (last) out.sameMinute = yesterdays.some(y => y.min === last.min);
  // A person feeding day after day, from the last day fed on
  const runs = new Map();
  for (const name of fedOn.get(streakEnd) || [])
    for (let d = Date.parse(streakEnd), n = 0; ; d -= DAY) {
      if (!fedOn.get(dayKey(d + 36e5 * 12))?.has(name)) break; // the key of noon, safe across a clock change
      runs.set(name, ++n);
    }
  const run = [...runs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))[0];
  if (run && run[1] >= RUN.least) {
    const others = new Set([...out.feeders.map(f => f.name), ...[...fedOn.values()].flatMap(set => [...set])]);
    others.delete(run[0]);
    out.feedRun = {name: run[0], days: run[1], other: others.size ? [...others][0] : null};
  }
  out.next = nextMeal(db, now, pets);
  out.milestone = nextMilestone(db);
  return out;
}

/* Which of the lines taking turns comes today, and which fact of the day (views/overview.js words them). kinds: the
   kinds that apply today, in the order of TURNS; facts: the ids of the facts that may come; memory: this phone's
   (prefs.overview). The same choice all day long while it still applies; otherwise the turn goes on from the kind
   last chosen, skipping the kinds of the last MEMORY.kinds days, and with nothing left that block falls. The fact is
   one not shown in the last MEMORY.facts days, and with none left any of them. {kind, fact, memory}: the memory to
   keep, the one given while nothing changed. */
export function takeTurn(kinds, facts, memory, now) {
  const day = dayKey(now),
    m = memory || {day: '', kind: null, fact: null, kinds: [], facts: []},
    today = m.day === day,
    holds = (choice, list) => (choice ? list.includes(choice) : !list.length);
  if (today && holds(m.kind, kinds) && holds(m.fact, facts)) return {kind: m.kind, fact: m.fact, memory: m};
  // What today chose earlier goes before choosing anew, so it does not block itself
  const before = today && m.kind ? m.kinds.slice(0, -1) : m.kinds,
    kept = m.facts.filter(f => f.day !== day && f.day > dayKey(addDays(now, -MEMORY.facts))),
    shown = new Set(kept.map(f => f.id)),
    fresh = facts.filter(id => !shown.has(id)),
    start = TURNS.indexOf(before.at(-1)) + 1,
    order = [...kinds].sort(
      (a, b) =>
        ((TURNS.indexOf(a) - start + TURNS.length) % TURNS.length) -
        ((TURNS.indexOf(b) - start + TURNS.length) % TURNS.length),
    ),
    open = order.filter(k => !before.includes(k));
  const kind = today && kinds.includes(m.kind) ? m.kind : (open[0] ?? order[0] ?? null),
    fact = today && facts.includes(m.fact) ? m.fact : facts.length ? pick(fresh.length ? fresh : facts, now) : null;
  return {
    kind,
    fact,
    memory: {
      day,
      kind,
      fact,
      kinds: kind ? [...before, kind].slice(-MEMORY.kinds) : before,
      facts: fact ? [...kept, {id: fact, day}] : kept,
    },
  };
}
