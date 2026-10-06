// What the overview card needs of the day. Of a rating it only reads whether the meal was left.
import {RATINGS, sexOf, typeOf} from './config.js';
import {nextMeal, NO, rOf} from './smart.js';

/* last: the newest serving of the pets shown up to now. left: it is a meal one of them left; a treat is no meal.
   next: the next usual meal. sex: of the one pet shown, if known. cats: every pet shown is a cat. */
export function glance(db, pets, now) {
  const shown = new Set(pets),
    last = db.servings.find(s => s.servedAt <= now && Object.keys(s.pets || {}).some(id => shown.has(id))) || null,
    meal = last && typeOf(db.products.find(p => p.id === last.productId)) !== 'Snack';
  return {
    last,
    left: !!meal && Object.entries(last.pets).some(([id, x]) => shown.has(id) && RATINGS[rOf(x)]?.score < NO),
    next: nextMeal(db, now, pets),
    sex: pets.length === 1 ? sexOf(db.pets.find(p => p.id === pets[0])) : null,
    cats: db.pets.filter(p => shown.has(p.id)).every(p => p.species === 'Katze'),
  };
}
