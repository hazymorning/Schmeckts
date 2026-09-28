/* A glance at the pets shown, for the overview card: what they had today, when and from whom, when the next meal
   usually comes, and the material for one more line that changes from day to day. It reads when, what and by
   whom a meal was served, never how it went: no rating reaches the overview (PROJECT.md, Cards). Pure;
   views/overview.js words it. */
import {typeOf} from './config.js';
import {addDays, dayKey, dayStart, weekStart} from './dates.js';
import {nextMeal, nextMilestone} from './smart.js';

const DAY = 864e5;
const SPAN = 400 * DAY; // how far back it looks at all: a streak of a year and more is still counted
const IDEA = {span: 90 * DAY, served: 3, after: 10}; // a regular of the last 90 days, served 3 times, not for 10 days

/* {last, meals, snacks, feeders, week, next, streak, premiere, idea, milestone}
   last       the newest meal of the pets up to now, null without one
   meals      today's meals, snacks today's treats (a treat is not a meal, as in the history)
   feeders    this week's meals per person, the most first: [{name, n}]
   week       this week's meals and how many varieties they were: {meals, sorts}
   next       nextMeal() in smart.js for these pets
   streak     how many days in a row something has been served, up to today or, while nothing has been yet, yesterday
   premiere   a variety served today for the first time, null without one
   idea       a regular that has not been served for a while: {id, days}; varieties in `avoid` are left out
   milestone  nextMilestone() in smart.js */
export function glance(db, pets, now, avoid = new Set()) {
  const shown = new Set(pets),
    today = dayStart(now),
    monday = weekStart(now),
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
    },
    fed = new Map(),
    sorts = new Set(), // the varieties of this week's meals
    days = new Set(),
    served = new Set(), // the varieties of today
    before = new Set(), // and those served before today
    regulars = new Map();
  for (const s of db.servings) {
    if (s.servedAt > now || !Object.keys(s.pets || {}).some(id => shown.has(id))) continue;
    if (s.servedAt <= now - SPAN) break; // newest first
    out.last ||= s;
    days.add(dayKey(s.servedAt));
    if (s.servedAt >= today) {
      out[snack.has(s.productId) ? 'snacks' : 'meals']++;
      if (s.productId) served.add(s.productId);
    } else before.add(s.productId);
    const name = (s.by || '').trim();
    if (s.servedAt >= monday && name) fed.set(name, (fed.get(name) || 0) + 1);
    if (s.servedAt >= monday && !snack.has(s.productId)) {
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
  for (let d = days.has(dayKey(now)) ? now : addDays(now, -1); days.has(dayKey(d)); d = addDays(d, -1)) out.streak++;
  out.premiere = db.products.find(p => served.has(p.id) && !before.has(p.id) && p.createdAt >= today)?.id || null;
  const idea = [...regulars]
    .filter(([id, r]) => r.n >= IDEA.served && now - r.t >= IDEA.after * DAY && !avoid.has(id))
    .sort(([, a], [, b]) => b.n - a.n || a.t - b.t)[0];
  out.idea = idea ? {id: idea[0], days: Math.round((today - dayStart(idea[1].t)) / DAY)} : null;
  out.week.sorts = sorts.size;
  out.next = nextMeal(db, now, pets);
  out.milestone = nextMilestone(db);
  return out;
}
