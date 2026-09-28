// The overview's glance at the day (js/glance.js) and the next usual meal (js/smart.js). Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {glance} from '../app/www/js/glance.js';
import {nextMeal, nextMilestone} from '../app/www/js/smart.js';

const at = text => new Date(text).getTime();
const NOW = at('2026-06-10T12:00');
const day = (d, time) => `2026-06-${String(d).padStart(2, '0')}T${time}`;

/* meals: [variety, pets (one id or several), 'DD hh:mm' or a time, person, rating] */
function household(products, meals, pets = ['A', 'B']) {
  return {
    pets: pets.map(id => ({id, name: id})),
    products: products
      .map(p => (typeof p === 'string' ? {id: p} : p))
      .map(p => ({brand: '', variety: '', codes: {}, createdAt: 1, ...p})),
    servings: meals
      .map(([productId, who, when, by, r = null], i) => ({
        id: 'meal' + i,
        productId,
        by,
        servedAt: typeof when === 'number' ? when : at(day(+when.slice(0, 2), when.slice(3))),
        pets: Object.fromEntries([who].flat().map(pet => [pet, {r}])),
      }))
      .sort((a, b) => b.servedAt - a.servedAt),
  };
}
const snack = {id: 'snack', type: 'Snack'};

test('today: meals and treats of the pets shown, the last one up to now, who fed this week', () => {
  const db = household(
    ['nass', snack],
    [
      ['nass', 'A', '10 07:10', 'Anna'],
      ['snack', 'A', '10 11:00', 'Jonas'],
      ['nass', 'B', '10 11:30', 'Jonas'],
      ['nass', ['A', 'B'], '09 18:00', 'Jonas'],
      ['nass', 'A', '08 07:00', 'Anna'],
      ['nass', 'A', '10 12:30', 'Anna'], // after now
    ],
  );
  const pick = g => [g.last?.id, g.meals, g.snacks, g.feeders.map(x => `${x.name} ${x.n}`)];
  assert.deepEqual(pick(glance(db, ['A', 'B'], NOW)), ['meal2', 2, 1, ['Jonas 3', 'Anna 2']]);
  assert.deepEqual(pick(glance(db, ['A'], NOW)), ['meal1', 1, 1, ['Anna 2', 'Jonas 2']]);
  assert.deepEqual(pick(glance(db, ['B'], at(day(10, '08:00')))), ['meal3', 0, 0, ['Jonas 1']], 'nothing yet today');
  assert.deepEqual(pick(glance(household([], []), ['A'], NOW)), [undefined, 0, 0, []]);
});

test('the week: its meals from Monday on, treats left out, and how many varieties they were', () => {
  const db = household(
    ['nass', 'trocken', snack],
    [
      ['nass', 'A', '10 07:10', ''],
      ['trocken', 'A', '09 18:00', ''],
      ['snack', 'A', '09 11:00', ''],
      ['nass', 'A', '08 07:00', ''], // Monday
      ['nass', 'A', '07 18:00', ''], // Sunday, the week before
    ],
  );
  assert.deepEqual(
    [glance(db, ['A'], NOW).week, glance(db, ['B'], NOW).week],
    [
      {meals: 3, sorts: 2},
      {meals: 0, sorts: 0},
    ],
  );
});

test('no rating reaches the overview: the glance is the same whatever the meals were rated', () => {
  const meals = [
    ['nass', 'A', '10 07:10', 'Anna', 'top'],
    ['nass', 'A', '09 07:10', 'Anna', 'schlecht'],
    ['trocken', 'A', '08 07:10', 'Anna', 'sosse'],
    ...[20, 21, 22, 23, 24].map(d => ['trocken', 'A', `${String(d - 19).padStart(2, '0')} 18:00`, 'Jonas', 'eager']),
  ];
  const rated = household(['nass', 'trocken'], meals),
    other = household(
      ['nass', 'trocken'],
      meals.map(m => [...m.slice(0, 4), m[4] === 'top' ? null : 'top']),
    );
  const seen = g => ({...g, last: g.last.id}); // the meal itself carries its ratings, the overview reads its time, variety and person
  assert.deepEqual(seen(glance(rated, ['A'], NOW)), seen(glance(other, ['A'], NOW)));
});

test('streak: days in a row up to today, or up to yesterday while nothing has been served today', () => {
  const meals = ['05', '06', '07', '08', '09'].map(d => ['nass', 'A', `${d} 08:00`, '']);
  const streak = (list, now = NOW) => glance(household(['nass'], list), ['A'], now).streak;
  assert.deepEqual(
    [
      streak(meals),
      streak([...meals, ['nass', 'A', '10 08:00', '']]),
      streak([...meals, ['nass', 'A', '10 08:00', ''], ['nass', 'A', '10 09:00', '']]),
      streak(meals.filter(m => m[2] !== '07 08:00')),
      streak(meals.slice(0, 3)),
      streak([]),
    ],
    [5, 6, 6, 2, 0, 0],
  );
});

test('premiere: a variety served today for the first time; an idea: a regular not served for 10 days', () => {
  const today = at(day(10, '00:00')),
    may = (d, time = '18:00') => at(`2026-05-${d}T${time}`);
  const db = household(
    ['alt', {id: 'neu', createdAt: today + 36e5}, {id: 'wieder', createdAt: today + 36e5}, 'selten', 'nie', 'weg'],
    [
      ['neu', 'A', '10 08:00', ''],
      ['wieder', 'A', '10 09:00', ''],
      ['wieder', 'A', '02 09:00', ''], // served before: no premiere, whatever its record says
      ...['20', '21', '22', '23'].map(d => ['weg', 'A', may(d), '']), // four times, the last 18 days ago
      ...['01', '02', '03'].map(d => ['nie', 'A', may(d), '']), // three times, the last 38 days ago
      ...['25', '26', '27'].map(d => ['alt', 'A', may(d), '']), // three times, the last 14 days ago
      ['selten', 'A', may('20', '12:00'), ''],
      ['selten', 'A', may('21', '12:00'), ''], // twice only
    ],
  );
  const g = glance(db, ['A'], NOW);
  assert.deepEqual([g.premiere, g.idea], ['neu', {id: 'weg', days: 18}], 'the most served one first');
  assert.deepEqual(
    glance(db, ['A'], NOW, new Set(['weg'])).idea,
    {id: 'nie', days: 38},
    'none nobody buys, and between two as often served the one gone longest',
  );
  assert.deepEqual(glance(db, ['B'], NOW).premiere, null, 'the pets shown only');
});

test('the next usual meal: later today, due while nothing has been served for it, tomorrow once today is over', () => {
  const week = [3, 4, 5, 6, 7, 8, 9].flatMap(d => [
    ['nass', 'A', `${String(d).padStart(2, '0')} 07:15`, ''],
    ['nass', 'A', `${String(d).padStart(2, '0')} 18:30`, ''],
  ]);
  const next = (extra, time, pets) =>
    nextMeal(household(['nass', snack], [...week, ...extra]), at(day(10, time)), pets);
  const morning = [['nass', 'A', '10 07:20', '']];
  assert.deepEqual(
    [
      next([], '06:00'),
      next([], '07:30'),
      next([], '09:10'),
      next(morning, '12:00'),
      next(morning, '18:40'),
      next([...morning, ['snack', 'A', '10 18:35', '']], '18:40'),
      next([...morning, ['nass', 'A', '10 18:00', '']], '18:40'),
      next(morning, '12:00', ['B']),
    ],
    [
      {at: 435},
      {at: 435, due: true},
      {at: 1110},
      {at: 1110},
      {at: 1110, due: true},
      {at: 1110, due: true},
      {at: 435, tomorrow: true},
      null,
    ],
  );
});

test('the next milestone: the meals left to it, none past the last one', () => {
  const meals = n => ({
    servings: Array.from({length: n}, (_, i) => ({id: 'm' + i})),
  });
  assert.deepEqual(
    [nextMilestone(meals(47)), nextMilestone(meals(50)), nextMilestone(meals(1000))],
    [{n: 50, left: 3}, {n: 100, left: 50}, null],
  );
});
