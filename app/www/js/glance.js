// What the overview card needs of the day. Pure, so it can be told in words elsewhere.
import {RATINGS, sexOf, typeOf} from './config.js';
import {addDays, dayStart} from './dates.js';
import {GOOD, nextMeal, NO, rOf} from './smart.js';

const TREATS = {days: 14, usual: 5}; // treats are usual on this many of the last days
const WEEK = 7; // days

// how a meal went for the pets shown: good when each one rated ate well, left when one of them left it
function outcomeOf(s, shown) {
  const scores = Object.entries(s.pets || {})
    .filter(([id, x]) => shown.has(id) && rOf(x))
    .map(([, x]) => RATINGS[rOf(x)].score);
  if (!scores.length) return null;
  return scores.some(v => v < NO) ? 'left' : scores.every(v => v >= GOOD) ? 'good' : 'mid';
}

/* last: the newest serving of the pets shown up to now; meal: the newest that is no treat, with how it went and,
   for one pet, its rating; first: it was that variety's first time. meals and treats: today's. streak: the newest
   rated meals that all went the same way, good or left. week: the ratings and varieties of the last WEEK days.
   noted: the kinds noted today. next: the next usual meal. sex: of the one pet shown, if known. */
export function glance(db, pets, now) {
  const shown = new Set(pets),
    concerns = s => Object.keys(s.pets || {}).some(id => shown.has(id)),
    treat = new Set(db.products.filter(p => typeOf(p) === 'Snack').map(p => p.id)),
    today = dayStart(now),
    since = addDays(today, 1 - Math.max(TREATS.days, WEEK)),
    weekFrom = addDays(today, 1 - WEEK),
    treatDays = new Set(),
    sorts = new Set(),
    week = {n: 0, good: 0},
    streak = {kind: null, n: 0, done: false};
  let last = null,
    meal = null,
    meals = 0,
    treats = 0;
  for (const s of db.servings) {
    if (s.servedAt > now || !concerns(s)) continue;
    if (meal && s.servedAt < since) break; // newest first
    const isTreat = treat.has(s.productId);
    last ||= s;
    if (isTreat) {
      if (s.servedAt >= today) treats++;
      if (s.servedAt >= addDays(today, 1 - TREATS.days)) treatDays.add(dayStart(s.servedAt));
      continue;
    }
    meal ||= s;
    if (s.servedAt >= today) meals++;
    if (s.servedAt >= weekFrom) {
      if (s.productId) sorts.add(s.productId);
      for (const [id, x] of Object.entries(s.pets || {}))
        if (shown.has(id) && rOf(x)) {
          week.n++;
          if (RATINGS[rOf(x)].score >= GOOD) week.good++;
        }
    }
    const went = outcomeOf(s, shown);
    if (went && !streak.done) {
      if (!streak.kind) streak.kind = went;
      if (went === streak.kind) streak.n++;
      else streak.done = true;
    }
  }
  const one = pets.length === 1 && meal ? rOf(meal.pets?.[pets[0]]) : null;
  return {
    last,
    meal,
    left: !!meal && outcomeOf(meal, shown) === 'left',
    outcome: meal && outcomeOf(meal, shown),
    rating: one,
    first:
      !!meal?.productId &&
      meal.servedAt >= today &&
      !db.servings.some(s => s.productId === meal.productId && s.servedAt < meal.servedAt && concerns(s)),
    meals,
    treats,
    treatsUsual: treatDays.size >= TREATS.usual,
    streak: streak.kind === 'mid' ? {kind: null, n: 0} : {kind: streak.kind, n: streak.n},
    week: {...week, sorts: sorts.size},
    noted: [
      ...new Set(
        (db.observations || [])
          .filter(o => o.at >= today && o.at <= now && Object.keys(o.pets || {}).some(id => shown.has(id)))
          .map(o => o.kind),
      ),
    ],
    next: nextMeal(db, now, pets),
    sex: pets.length === 1 ? sexOf(db.pets.find(p => p.id === pets[0])) : null,
  };
}
