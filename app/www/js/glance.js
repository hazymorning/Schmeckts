// What the overview card needs of the day. Of a rating it only reads whether the meal was left.
import {RATINGS, sexOf, typeOf} from './config.js';
import {addDays, dayStart} from './dates.js';
import {nextMeal, NO, rOf} from './smart.js';

const TREATS = {days: 14, usual: 5}; // treats are usual on this many of the last days

/* last: the newest serving of the pets shown up to now; meal: the newest that is no treat, left when one of them left
   it. meals and treats: today's. next: the next usual meal. sex: of the one pet shown, if known. */
export function glance(db, pets, now) {
  const shown = new Set(pets),
    treat = new Set(db.products.filter(p => typeOf(p) === 'Snack').map(p => p.id)),
    today = dayStart(now),
    since = addDays(today, 1 - TREATS.days),
    treatDays = new Set();
  let last = null,
    meal = null,
    meals = 0,
    treats = 0;
  for (const s of db.servings) {
    if (s.servedAt > now || !Object.keys(s.pets || {}).some(id => shown.has(id))) continue;
    if (meal && s.servedAt < since) break; // newest first
    const isTreat = treat.has(s.productId);
    last ||= s;
    if (!isTreat) meal ||= s;
    if (s.servedAt >= today) isTreat ? treats++ : meals++;
    if (isTreat && s.servedAt >= since) treatDays.add(dayStart(s.servedAt));
  }
  return {
    last,
    meal,
    left: !!meal && Object.entries(meal.pets).some(([id, x]) => shown.has(id) && RATINGS[rOf(x)]?.score < NO),
    meals,
    treats,
    treatsUsual: treatDays.size >= TREATS.usual,
    next: nextMeal(db, now, pets),
    sex: pets.length === 1 ? sexOf(db.pets.find(p => p.id === pets[0])) : null,
  };
}
