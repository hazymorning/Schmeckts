// Facts for the overview card. Of a rating it only reads whether the meal was left.
import {RATINGS, typeOf} from './config.js';
import {DAY, addDays, dayKey, dayStart, weekStart} from './dates.js';
import {feedSlots, nextMeal, nextMilestone, NO, rOf} from './smart.js';

const SPAN = 400 * DAY; // long enough that a streak of over a year still counts
const IDEA = {span: 90 * DAY, served: 3, after: 10}; // after in days
const RECORD = {meals: 3, streak: 7};
const SHIFT = {least: 30, most: 180}; // minutes; beyond most it is taken for a different meal
const RUN = {least: 3, days: 60};
const WEEKDAY = {weeks: 8, least: 3, apart: 30}; // least meals on each side, apart in minutes
const ANNIVERSARY = [1, 3, 6, 12]; // months since the first meal
const LOOKBACK = 365; // days
const CALM = {rated: 3}; // days after the newest rating that the days without a meal left still count
const BIRTHDAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/; // anything else is ignored
// TURNS is in rank order; MEMORY is how many days a kind or a fact is not repeated
export const TURNS = ['duel', 'streak', 'calm', 'idea', 'run', 'weekday', 'week', 'lookback', 'sorts', 'days'];
export const MEMORY = {kinds: 3, facts: 60};

export const dayNumber = now => Math.round(dayStart(now) / DAY);
// stays the same all day
export const pick = (list, now) => list[dayNumber(now) % list.length];

const median = values => {
  const v = [...values].sort((a, b) => a - b);
  return (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2;
};
const minuteOf = t => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};
const slotOf = (slots, min) =>
  slots.reduce((best, s, i) => (best < 0 || Math.abs(s.at - min) < Math.abs(slots[best].at - min) ? i : best), -1);
// local noon of a YYYY-MM-DD key
const noonOf = key => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};
// leaves out the run ending at `last`
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
// clamped to the month's last day, so February 29 falls on the 28th
const onDay = (y, month, day) => new Date(y, month - 1, Math.min(day, new Date(y, month, 0).getDate())).getTime();
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
// day key, clamped to the month's last day
function monthsAfter(t, months) {
  const d = new Date(t),
    m = new Date(d.getFullYear(), d.getMonth() + months, 1),
    last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  m.setDate(Math.min(d.getDate(), last));
  return dayKey(m.getTime());
}

/* Treats count as snacks, not meals, as in the history. The streak runs up to yesterday while nothing is served
   today. Times of day are minutes after midnight; shift.diff is negative when earlier. left: the last serving is a
   meal a pet left. calm: days since a meal was left, the sign on a building site, and the longest such run before. */
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
      left: false,
      calm: null,
    },
    fed = new Map(),
    sorts = new Set(),
    tried = new Set(),
    days = new Set(),
    perDay = new Map(),
    fedOn = new Map(), // day key → names
    recent = [],
    todays = [], // newest first
    yesterdays = [],
    served = new Set(),
    before = new Set(),
    regulars = new Map(),
    left = []; // days a meal was left, newest first
  let total = 0,
    first = null,
    rated = null,
    firstRated = null;
  for (const s of db.servings) {
    if (s.servedAt > now || !Object.keys(s.pets || {}).some(id => shown.has(id))) continue;
    total++;
    first = s.servedAt; // servings are newest first, so this ends on the oldest
    if (products.has(s.productId)) tried.add(s.productId);
    if (s.servedAt <= now - SPAN) continue; // older ones only count toward the totals above
    out.last ||= s;
    const key = dayKey(s.servedAt),
      meal = !snack.has(s.productId),
      rs = meal
        ? Object.entries(s.pets)
            .filter(([id]) => shown.has(id))
            .map(([, x]) => rOf(x))
            .filter(Boolean)
        : [];
    if (rs.length) {
      const poor = rs.some(r => RATINGS[r].score < NO);
      if (out.last === s) out.left = poor;
      if (poor) left.push(dayStart(s.servedAt));
      rated ??= s.servedAt;
      firstRated = s.servedAt;
    }
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
  const most = Math.max(0, ...[...perDay].filter(([key]) => key !== todayKey).map(([, n]) => n));
  if (out.meals >= RECORD.meals && out.meals > most) out.record.meals = out.meals;
  const streakEnd = days.has(todayKey) ? todayKey : yesterdayKey;
  if (out.streak >= RECORD.streak && days.has(todayKey) && out.streak > longestRun(days, streakEnd))
    out.record.streak = out.streak;
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
  const last = todays[0];
  if (last && slots.length) {
    const i = slotOf(slots, last.min),
      usual = out.weekday?.at === slots[i].at ? out.weekday.mine : slots[i].at,
      diff = last.min - usual;
    if (Math.abs(diff) >= SHIFT.least && Math.abs(diff) <= SHIFT.most) out.shift = {at: slots[i].at, diff};
  }
  if (last) out.sameMinute = yesterdays.some(y => y.min === last.min);
  const runs = new Map();
  for (const name of fedOn.get(streakEnd) || [])
    for (let d = noonOf(streakEnd), n = 0; ; d = addDays(d, -1)) {
      if (!fedOn.get(dayKey(d))?.has(name)) break;
      runs.set(name, ++n);
    }
  const run = [...runs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))[0];
  if (run && run[1] >= RUN.least) {
    const others = new Set([...out.feeders.map(f => f.name), ...[...fedOn.values()].flatMap(set => [...set])]);
    others.delete(run[0]);
    out.feedRun = {name: run[0], days: run[1], other: others.size ? [...others][0] : null};
  }
  if (rated > now - CALM.rated * DAY) {
    const ends = [...left, dayStart(firstRated)];
    out.calm = {
      days: Math.round((today - ends[0]) / DAY),
      record: Math.max(0, ...ends.slice(1).map((d, i) => Math.round((ends[i] - d) / DAY))),
    };
  }
  out.next = nextMeal(db, now, pets);
  out.milestone = nextMilestone(db);
  return out;
}

/* The choice holds all day while it still applies. Otherwise kinds rotate in TURNS order, skipping recent ones while
   another is left, and a fact not shown recently is preferred. Memory comes back as given when nothing changed. */
export function takeTurn(kinds, facts, memory, now) {
  const day = dayKey(now),
    m = memory || {day: '', kind: null, fact: null, kinds: [], facts: []},
    today = m.day === day,
    holds = (choice, list) => (choice ? list.includes(choice) : !list.length);
  if (today && holds(m.kind, kinds) && holds(m.fact, facts)) return {kind: m.kind, fact: m.fact, memory: m};
  // today's earlier choice is dropped so it does not block itself
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
