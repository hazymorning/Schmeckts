// What the overview card needs of the day. Of a rating it only reads whether the meal was left.
import {RATINGS, typeOf} from './config.js';
import {DAY, dayStart} from './dates.js';
import {nextMeal, NO, rOf} from './smart.js';

const BIRTHDAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/; // anything else is ignored

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

/* last: the newest serving of the pets shown up to now. left: it is a meal one of them left; a treat is no meal.
   next: the next usual meal. */
export function glance(db, pets, now) {
  const shown = new Set(pets),
    last = db.servings.find(s => s.servedAt <= now && Object.keys(s.pets || {}).some(id => shown.has(id))) || null,
    meal = last && typeOf(db.products.find(p => p.id === last.productId)) !== 'Snack';
  return {
    last,
    left: !!meal && Object.entries(last.pets).some(([id, x]) => shown.has(id) && RATINGS[rOf(x)]?.score < NO),
    birthday: nextBirthday(db, shown, now),
    next: nextMeal(db, now, pets),
  };
}
