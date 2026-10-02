// The overview's glance at the day (js/glance.js) and the next usual meal (js/smart.js). Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {glance, takeTurn, TURNS} from '../app/www/js/glance.js';
import {nextMeal, nextMilestone, VERDICTS} from '../app/www/js/smart.js';
import {RATINGS} from '../app/www/js/config.js';
import {addDays} from '../app/www/js/dates.js';
import {FACTS, factsOn, fill, GENERAL, lastSunday, LEADS, LINES, nthSaturday} from '../app/www/js/views/facts.js';

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

const pad = n => String(n).padStart(2, '0');
const meal = (when, by = '') => ['nass', 'A', when, by];
/* A meal at 08:00 on every day of June from `from` to `to` */
const daily = (from, to, by = '') => Array.from({length: to - from + 1}, (_, i) => meal(`${pad(from + i)} 08:00`, by));

test('the first meal: when, how many days ago and how many meals since; the varieties tried over the whole diary', () => {
  const old = at('2025-01-01T08:00'); // beyond the 400 days the glance looks at day by day
  const db = household(
    ['nass', 'alt', 'trocken'],
    [
      meal('10 08:00'),
      meal('09 08:00'),
      ['alt', 'A', old, ''],
      ['trocken', 'B', '08 08:00', ''],
      ['weg', 'A', '07 08:00', ''],
    ],
  );
  const g = glance(db, ['A'], NOW);
  assert.deepEqual([g.first, g.sorts], [{at: old, days: 525, meals: 4}, 2], 'a variety no longer there does not count');
  assert.deepEqual(
    [glance(db, ['B'], NOW).first, glance(household([], []), ['A'], NOW).first],
    [{at: at(day(8, '08:00')), days: 2, meals: 1}, null],
  );
});

test('anniversary: the first meal exactly 1, 3, 6 or 12 months back, on the last day of a month where that month has no such day', () => {
  const since = (first, now = NOW) => glance(household(['nass'], [meal(first), meal(now)]), ['A'], now).anniversary;
  assert.deepEqual(
    [
      '2026-05-10',
      '2026-03-10',
      '2025-12-10',
      '2025-06-10',
      '2026-05-11',
      '2026-05-09',
      '2026-04-10',
      '2026-06-10',
    ].map(d => since(at(d + 'T08:00'))),
    [1, 3, 6, 12, null, null, null, null],
    'to the day: a day off, two months and today itself are none',
  );
  const jan31 = at('2026-01-31T08:00');
  assert.deepEqual(
    [since(jan31, at('2026-02-28T12:00')), since(jan31, at('2026-03-03T12:00')), since(jan31, at('2026-03-31T12:00'))],
    [1, null, null],
    'January 31 has its month on February 28, not on March 3',
  );
});

test('records: today the most meals of any day from 3 on, the streak longer than any before from 7 days on', () => {
  const rec = list => glance(household(['nass', snack], list), ['A'], NOW).record;
  const today3 = ['10 06:00', '10 08:00', '10 10:00'].map(t => meal(t)); // up to noon, which is now
  assert.deepEqual(rec([...today3, meal('09 07:00'), meal('09 18:00')]), {meals: 3, streak: 0});
  assert.deepEqual(
    rec([...today3, meal('09 07:00'), meal('09 12:00'), meal('09 18:00')]),
    {meals: 0, streak: 0},
    'a day with as many is no record',
  );
  assert.deepEqual(
    rec([...today3.slice(0, 2), ['snack', 'A', '10 19:00', ''], meal('09 07:00')]),
    {meals: 0, streak: 0},
    'two meals and a treat are not three meals',
  );
  assert.deepEqual(
    [rec(daily(4, 10)).streak, rec(daily(5, 10)).streak, rec(daily(3, 9)).streak],
    [7, 0, 0],
    'seven days up to today; six, or seven up to yesterday, are none',
  );
  const may = Array.from({length: 7}, (_, i) => meal(at(`2026-05-${pad(20 + i)}T08:00`))); // seven days once before
  assert.deepEqual(
    [rec([...may, ...daily(4, 10)]).streak, rec([...may, ...daily(3, 10)]).streak],
    [0, 8],
    'longer than any run before, not as long',
  );
});

test("off the usual time: today's last meal 30 to 180 minutes off its slot, earlier negative, or at yesterday's minute", () => {
  const week = [3, 4, 5, 6, 7, 8, 9].flatMap(d => [meal(`0${d} 07:15`), meal(`0${d} 18:30`)]);
  const g = (extra, now = NOW) => glance(household(['nass'], [...week, ...extra]), ['A'], now);
  assert.deepEqual(
    ['10 07:55', '10 06:35', '10 07:44', '10 10:15', '10 10:16'].map(t => g([meal(t)]).shift),
    [{at: 435, diff: 40}, {at: 435, diff: -40}, null, {at: 435, diff: 180}, null],
  );
  assert.deepEqual(
    [g([]).shift, g([meal('10 07:15'), meal('10 12:00')]).shift],
    [null, null],
    'nothing today, or the last meal beyond the span',
  );
  assert.deepEqual(
    [
      g([meal('10 07:15')]).sameMinute,
      g([meal('10 18:30')], at(day(10, '19:00'))).sameMinute,
      g([meal('10 07:16')]).sameMinute,
    ],
    [true, true, false],
  );
});

test("a weekday's own time: this weekday's meals in a slot over 8 weeks, from 3 on each side, at least 30 minutes off the other days; a meal at that time is not off", () => {
  const today = at(day(10, '00:00')); // a Wednesday
  const weeks = (wed, n = 8) =>
    Array.from({length: 7 * n}, (_, i) => {
      const d = addDays(today, -i),
        time = new Date(d).getDay() === 3 ? wed : '07:00';
      return time && meal(at(`2026-${pad(new Date(d).getMonth() + 1)}-${pad(new Date(d).getDate())}T${time}`));
    }).filter(Boolean);
  const g = list => glance(household(['nass'], list), ['A'], NOW);
  assert.deepEqual(g(weeks('08:00')).weekday, {at: 420, mine: 480, later: true, weekday: 3});
  assert.deepEqual(g(weeks('06:15')).weekday, {at: 420, mine: 375, later: false, weekday: 3});
  assert.deepEqual(
    [g(weeks('07:20')).weekday, g(weeks('08:00', 2)).weekday, g(weeks(null)).weekday],
    [null, null, null],
    '20 minutes are none, two Wednesdays are too few, none without a meal on the day',
  );
  assert.deepEqual(
    [g(weeks('08:00')).shift, g(weeks('07:20')).shift, g([...weeks('08:00').slice(1), meal('10 08:45')]).shift],
    [null, null, {at: 420, diff: 45}],
    "today's meal at the weekday's time is not off, one at the usual time neither; 45 minutes past the weekday's time is",
  );
});

test('a feeding run: a person feeding day after day up to the last day fed on, from 3 days, with another name where there is one', () => {
  const by = (d, who) => meal(`${pad(d)} 08:00`, who);
  const g = list => glance(household(['nass'], list), ['A'], NOW).feedRun;
  assert.deepEqual(g([by(10, 'Ben'), by(9, 'Ben'), by(8, 'Ben'), by(7, 'Jonas')]), {
    name: 'Ben',
    days: 3,
    other: 'Jonas',
  });
  assert.deepEqual(g([by(10, 'Ben'), by(9, 'Ben'), by(8, 'Jonas')]), null, 'two days are no run');
  assert.deepEqual(g([by(10, 'Ben'), by(9, 'Ben'), by(8, 'Ben')]), {name: 'Ben', days: 3, other: null}, 'nobody else');
  assert.deepEqual(
    g([by(9, 'Ben'), by(8, 'Ben'), by(7, 'Ben'), by(6, 'Anna')]),
    {name: 'Ben', days: 3, other: 'Anna'},
    'up to yesterday while nothing has been served today',
  );
  assert.deepEqual(
    g([by(10, 'Ben'), by(9, 'Ben'), by(8, 'Ben'), by(9, 'Jonas')]),
    {name: 'Ben', days: 3, other: 'Jonas'},
    'someone else feeding in between does not end it',
  );
});

test('a feeding run counts local days, also far east of UTC', () => {
  process.env.TZ = 'Pacific/Auckland';
  try {
    const by = (d, who) => meal(`${pad(d)} 08:00`, who);
    const run = glance(
      household(['nass'], [by(10, 'Ben'), by(9, 'Ben'), by(8, 'Ben'), by(7, 'Jonas')]),
      ['A'],
      at('2026-06-10T12:00'),
    ).feedRun;
    assert.deepEqual(run, {name: 'Ben', days: 3, other: 'Jonas'});
  } finally {
    process.env.TZ = 'Europe/Berlin';
  }
});

test('a look back: the variety served exactly a year ago', () => {
  const g = list => glance(household(['nass', 'alt'], list), ['A'], NOW).lookback;
  assert.deepEqual(
    [
      g([meal('10 08:00'), ['alt', 'A', at('2025-06-10T19:00'), '']]),
      g([meal('10 08:00'), ['alt', 'A', at('2025-06-11T08:00'), '']]),
      g([meal('10 08:00'), ['weg', 'A', at('2025-06-10T08:00'), '']]),
    ],
    ['alt', null, null],
    'to the day, and only a variety still there',
  );
});

test('a birthday: today with the age, the days to the next one, the nearest with „Alle“; February 29 falls on the 28th', () => {
  const on = (birthdays, pets, now = NOW) => {
    const db = household(['nass'], [meal('10 08:00')]);
    db.pets = Object.entries(birthdays).map(([id, birthday]) => ({id, name: id, ...(birthday && {birthday})}));
    return glance(db, pets, now).birthday;
  };
  assert.deepEqual(
    [
      on({A: '2022-06-10'}, ['A']),
      on({A: '2026-06-10'}, ['A']),
      on({A: '2022-06-11'}, ['A']),
      on({A: '2022-06-13'}, ['A']),
      on({A: '2022-06-09'}, ['A']),
      on({A: null}, ['A']),
      on({A: '2022-06-13', B: '2020-06-12'}, ['A', 'B']),
      on({A: '2022-06-13', B: '2020-06-12'}, ['A']),
      on({A: 'gestern'}, ['A']),
    ],
    [
      {pet: 'A', today: true, age: 4},
      {pet: 'A', today: true, age: null},
      {pet: 'A', days: 1},
      {pet: 'A', days: 3},
      {pet: 'A', days: 364},
      null,
      {pet: 'B', days: 2},
      {pet: 'A', days: 3},
      null,
    ],
    'born today no age yet; yesterday is next year; the pet whose birthday comes first; nothing that is no date',
  );
  assert.deepEqual(
    [
      on({A: '2024-02-29'}, ['A'], at('2026-02-28T12:00')),
      on({A: '2024-02-29'}, ['A'], at('2026-02-27T12:00')),
      on({A: '2024-02-29'}, ['A'], at('2026-03-01T12:00')).days,
      on({A: '2024-02-29'}, ['A'], at('2028-02-29T12:00')),
      on({A: '2024-02-29'}, ['A'], at('2028-02-28T12:00')),
    ],
    [{pet: 'A', today: true, age: 2}, {pet: 'A', days: 1}, 364, {pet: 'A', today: true, age: 4}, {pet: 'A', days: 1}],
  );
});

test('the turn: the same choice all day, then the kinds in their order, none of the last three days, and a fact every day, none of the last 60 days; with nothing left the block falls', () => {
  const on = i => NOW + i * 864e5,
    three = ['f1', 'f2', 'f3'];
  let m = null;
  const turns = (kinds, facts, n, from = 0) =>
    Array.from({length: n}, (_, i) => {
      const r = takeTurn(kinds, facts, m, on(from + i));
      m = r.memory;
      return [r.kind, r.fact];
    });
  const all = turns(TURNS, three, 10);
  assert.deepEqual(
    all.map(t => t[0]),
    [...TURNS, 'duel'],
    'every kind gets its day, in the order of TURNS, then from the start again',
  );
  assert.deepEqual(
    [new Set(all.slice(0, 3).map(t => t[1])).size, all.every(t => three.includes(t[1]))],
    [3, true],
    'a fact every day, three different ones first',
  );
  assert.deepEqual(
    [m.kinds, m.facts.length],
    [['sorts', 'days', 'duel'], 10],
    'the memory keeps the last three kinds and every fact shown',
  );
  const again = takeTurn(TURNS, three, m, on(9));
  assert.ok(
    again.kind === 'duel' && again.fact === all[9][1] && again.memory === m,
    'the same day, the same choice, the memory untouched',
  );
  const changed = takeTurn(['streak', 'week'], three, m, on(9));
  assert.deepEqual(
    [changed.kind, changed.fact, changed.memory.kinds, changed.memory.facts.length],
    ['streak', all[9][1], ['sorts', 'days', 'streak'], 10],
    'a kind that no longer holds later the same day gives way to the next, the fact stays, and the choice of the morning blocks nothing',
  );
  m = null;
  const four = turns(['duel', 'streak', 'idea', 'week'], [], 8).map(t => t[0]);
  assert.deepEqual(four, ['duel', 'streak', 'idea', 'week', 'duel', 'streak', 'idea', 'week']);
  assert.ok(
    four.every((k, i) => !four.slice(Math.max(0, i - 3), i).includes(k)),
    'never a kind of the last three days',
  );
  m = null;
  assert.deepEqual(
    turns(['duel', 'streak'], [], 4).map(t => t[0]),
    ['duel', 'streak', 'duel', 'streak'],
    'with two the block on the kinds falls, and still no kind twice in a row',
  );
  m = null;
  assert.deepEqual(
    turns(['duel'], [], 2).map(t => t[0]),
    ['duel', 'duel'],
    'with one it comes every day',
  );
  m = null;
  const facts = turns([], ['a', 'b', 'c'], 4).map(t => t[1]);
  assert.deepEqual(
    [new Set(facts.slice(0, 3)).size, ['a', 'b', 'c'].includes(facts[3]), m.facts.length, m.kinds, m.kind],
    [3, true, 4, [], null],
    'three facts on three days, then the block on the facts falls; no kind where none holds',
  );
  m = {day: '2026-06-10', kind: null, fact: 'a', kinds: [], facts: [{id: 'a', day: '2026-06-10'}]};
  const soon = takeTurn([], ['a', 'b'], m, on(59)),
    later = takeTurn([], ['a', 'b'], m, on(60));
  assert.deepEqual(
    [soon.fact, soon.memory.facts.map(f => f.id)],
    ['b', ['a', 'b']],
    'a fact of 59 days ago is still held back',
  );
  assert.ok(
    ['a', 'b'].includes(later.fact) && later.memory.facts.every(f => f.day > '2026-06-10'),
    'after 60 days it is forgotten',
  );
  const none = takeTurn([], [], null, NOW);
  assert.deepEqual(
    none,
    {kind: null, fact: null, memory: {day: '2026-06-10', kind: null, fact: null, kinds: [], facts: []}},
    'nothing to say',
  );
  assert.equal(takeTurn([], [], none.memory, NOW).memory, none.memory, 'and nothing to remember anew');
});

/* How many sentences a text has, and whether one of them shouts twice */
const sentences = t => t.split(/(?<=[.!?])\s+/).filter(Boolean);
const LEAST = {Katze: 42, Hund: 30, Kaninchen: 20, Vogel: 18, Nager: 18};
const PER_MOMENT = {Katze: 6, Hund: 4, Kaninchen: 3, Vogel: 3, Nager: 3};
const MOMENTS = ['due', 'fresh', 'wait', 'evening', 'night'];
const SEASONAL = 6;
const ASIDE = 56; // characters: with a lead, three lines at 393px
const DAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

test('the facts: ids and texts unique, at most 56 characters and two sentences, the moments, months and days in shape, enough of every kind', () => {
  const all = [...Object.values(FACTS).flat(), ...GENERAL];
  assert.equal(new Set(all.map(f => f.id)).size, all.length, 'every id once');
  assert.equal(new Set(all.map(f => f.text)).size, all.length, 'every text once');
  for (const f of all) {
    assert.match(f.id, /^[a-z]+-[a-z0-9-]+$/, f.id);
    assert.ok(f.text.length <= ASIDE && sentences(f.text).length <= 2, `${f.id}: ${f.text}`);
    assert.ok(
      !f.when || (f.when.length && !f.day && f.when.every(m => MOMENTS.includes(m))),
      `${f.id}: the moments it fits, none for a dated one`,
    );
    assert.ok(!/übrigens|wusstest du|[\u2013\u2014]/i.test(f.text), `${f.id}: no lead-in and no long dash`);
    assert.ok(
      sentences(f.text).every(x => (x.match(/!/g) || []).length <= 1),
      `${f.id}: never two exclamation marks in one sentence`,
    );
    assert.ok(
      !f.months || (f.months.length && f.months.every(m => Number.isInteger(m) && m >= 1 && m <= 12)),
      `${f.id}: months`,
    );
    const on = typeof f.day === 'function' ? f.day(2026) : f.day;
    assert.ok(on === undefined || DAY_RE.test(on), `${f.id}: day ${on}`);
  }
  for (const [species, n] of Object.entries(LEAST)) {
    assert.ok(FACTS[species].length >= n, `${species}: at least ${n} facts`);
    for (const m of MOMENTS)
      assert.ok(
        FACTS[species].filter(f => f.when?.includes(m)).length >= PER_MOMENT[species],
        `${species}: at least ${PER_MOMENT[species]} for the moment ${m}`,
      );
    assert.ok(
      FACTS[species].filter(f => f.months).length >= SEASONAL,
      `${species}: at least ${SEASONAL} seasonal ones`,
    );
  }
  assert.ok(GENERAL.length >= 22, 'at least 22 general ones');
  for (const m of MOMENTS)
    assert.ok(GENERAL.filter(f => f.when?.includes(m)).length >= 3, `general ones: at least 3 for the moment ${m}`);
  assert.deepEqual(
    [lastSunday(2026, 3), lastSunday(2026, 10), nthSaturday(2026, 9, 4), nthSaturday(2025, 9, 4)],
    ['03-29', '10-25', '09-26', '09-27'],
    'the clocks change on the last Sunday of March and October, the rabbits have the fourth Saturday of September',
  );
  const ids = list => list.map(f => f.id);
  assert.deepEqual(
    ids(factsOn('Katze', new Date(2026, 7, 8), true)),
    ['katze-weltkatzentag'],
    'a dated fact on its day',
  );
  assert.deepEqual(
    ids(factsOn('Hund', new Date(2026, 9, 25), true)),
    ['allg-zeitumstellung-herbst'],
    'the general dated ones reach every species',
  );
  assert.deepEqual(ids(factsOn('Hund', new Date(2026, 9, 24), true)), [], 'and not the day before');
  const july = factsOn('Katze', new Date(2026, 6, 1)),
    january = factsOn('Katze', new Date(2026, 0, 1));
  assert.ok(
    july.every(f => !f.day && (!f.months || f.months.includes(7))) &&
      ids(july).includes('katze-hitze-1') &&
      !ids(january).includes('katze-hitze-1'),
    'the facts of the season, never a dated one among them',
  );
  assert.ok(
    ids(july).some(id => id.startsWith('allg-')),
    'the general facts stand beside the species\u2019',
  );
  assert.ok(
    ids(factsOn(null, new Date(2026, 6, 1))).every(id => id.startsWith('allg-')),
    'a mixed household takes the general ones only',
  );
  const atMoment = moment => factsOn('Katze', new Date(2026, 6, 1), false, moment),
    fresh = atMoment('fresh'),
    wait = atMoment('wait'),
    any = atMoment(null);
  assert.ok(
    fresh.length &&
      fresh.every(f => f.when?.includes('fresh')) &&
      wait.some(f => f.when) &&
      wait.some(f => !f.when) &&
      wait.every(f => !f.when || f.when.includes('wait')) &&
      any.length &&
      any.every(f => !f.when) &&
      [...fresh, ...wait, ...any].every(f => !f.id.startsWith('allg-') || f.when),
    'an aside for a short moment is made for it; between meals those for any moment come as well; without a moment only those; a species takes only the general ones made for a moment',
  );
});

test('the lines: at least three ways of saying every kind, two sentences at most, and no word of a rating or a verdict in any of them', () => {
  // With the aside, the card holds three lines at 393px: the lead takes half of it with a usual name and time
  const usual = {
    what: 'Lachs',
    at: '7:10',
    by: '',
    for: '',
    ago: 'vor 20 Minuten',
    Ago: 'Vor 20 Minuten',
    meal: 'Abendessen',
    time: '18:30',
    so: 'schon',
    both: 'zwei Mahlzeiten',
    Names: 'Minka',
    hat: 'hat',
    names: 'Minka',
    wartet: 'wartet',
    since: 'vor 3 Tagen',
    evening: 'Abend ',
  };
  for (const [kind, list] of Object.entries(LEADS))
    for (const t of list) assert.ok(fill(t, usual).length <= 44, `${kind}: ${fill(t, usual)}`);
  for (const [kind, list] of Object.entries(LINES))
    for (const t of list) assert.ok(t.replace(/\{\w+\}/g, 'Wort').length <= 52, `${kind}: ${t}`);
  const phrases = [...Object.values(RATINGS).flatMap(r => [r.label, r.said]), ...Object.values(VERDICTS)].map(w =>
    w.toLowerCase(),
  );
  const loose = /\bliebling|\bam liebsten\b|\bkommt\b|\bbewertet\b|\boffen\b|%/i; // what the overview never says either
  const texts = [
    ...Object.values(LEADS).flat(),
    ...Object.values(LINES).flat(),
    ...[...Object.values(FACTS).flat(), ...GENERAL].map(f => f.text),
  ];
  for (const [kind, list] of [...Object.entries(LEADS), ...Object.entries(LINES)])
    assert.ok(list.length >= 3, `${kind}: three ways at least`);
  for (const t of texts) {
    assert.ok(sentences(t).length <= 2 && sentences(t).every(x => (x.match(/!/g) || []).length <= 1), t);
    const low = t.toLowerCase();
    assert.ok(!phrases.some(w => low.includes(w)) && !loose.test(t), `nothing of a rating or a verdict: ${t}`);
  }
  assert.equal(
    fill('In {days} hat {pet} Geburtstag.', {days: '3 Tagen', pet: 'Mau'}),
    'In 3 Tagen hat Mau Geburtstag.',
  );
});

test('the overview card: the moment picks the first sentence, news of the day the second, else kinds and asides take turns', async () => {
  // views/overview.js reaches for the page as it loads; in Node a stub answers every such call
  const stub = new Proxy(function () {}, {
    get: (_, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub),
    apply: () => stub,
  });
  Object.assign(globalThis, {window: globalThis, document: stub, matchMedia: stub, addEventListener: () => {}});
  const {replaceDb} = await import('../app/www/js/store.js');
  const {momentOf, overviewLines} = await import('../app/www/js/views/overview.js');
  const {pick: byDay} = await import('../app/www/js/glance.js');
  const DAY = 864e5,
    T = at('2026-06-09T12:00'); // an odd day number: a kind's day, the next one an aside's
  const pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  replaceDb({
    version: 3,
    pets,
    products: ['Lachs', 'Rind'].map(v => ({
      id: v.toLowerCase() + '00001',
      brand: 'Sheba',
      variety: v,
      type: 'Nassfutter',
      codes: {},
    })),
    servings: [],
  });
  const say = (kind, values, days = 0) => fill(byDay(LINES[kind], T + days * DAY), values);
  const lead = (moment, values, days = 0) => fill(byDay(LEADS[moment], T + days * DAY), values);
  const lines = text =>
    text
      .split('<span class="ov-line">')
      .slice(1)
      .map(x => x.replace(/<\/span>\s*$/, '').replace(/<[^>]*>/g, ''));
  const last = {id: 'last', productId: 'lachs00001', by: 'Anna', servedAt: T - 3 * 36e5, pets: {minka00001: {r: null}}};
  const none = {
    premiere: null,
    idea: null,
    feeders: [],
    week: {meals: 0, sorts: 0},
    streak: 0,
    first: null,
    sorts: 0,
    anniversary: null,
    record: {meals: 0, streak: 0},
    shift: null,
    sameMinute: false,
    feedRun: null,
    weekday: null,
    lookback: null,
    milestone: {n: 100, left: 40},
    next: {at: 1110},
  };
  const g = {
    ...none,
    last,
    meals: 2,
    snacks: 1,
    feeders: [
      {name: 'Anna', n: 6},
      {name: 'Jonas', n: 4},
    ],
    week: {meals: 12, sorts: 4},
    streak: 12,
    idea: {id: 'rind00001', days: 12},
  };
  const one = (x, base = g) => lines(overviewLines({...base, ...x}, pets, T, null).text);

  let memory = null;
  const days = [];
  for (let i = 0; i < 5; i++) {
    const r = overviewLines({...g, last: {...last, servedAt: last.servedAt + i * DAY}}, pets, T + i * DAY, memory);
    memory = r.memory;
    days.push(lines(r.text));
  }
  const asides = i => factsOn('Katze', new Date(T + i * DAY), false, 'wait').map(f => f.text);
  days.forEach((d, i) =>
    assert.deepEqual(d[0], lead('later', {meal: 'Abendessen', time: '18:30', at: '9:00', by: ' von Anna'}, i)),
  );
  assert.deepEqual(
    [days[0][1], days[2][1], days[4][1]],
    [
      say('duel', {first: 'Anna', n: 6, m: 4, second: 'Jonas'}),
      say('streak', {since: '12 Tagen', days: '12 Tage'}, 2),
      say('idea', {sort: 'Rind', days: 12}, 4),
    ],
  );
  assert.ok(asides(1).includes(days[1][1]) && asides(3).includes(days[3][1]) && days[1][1] !== days[3][1]);
  assert.deepEqual(
    [memory.day, memory.kind, memory.fact, memory.kinds, memory.facts.map(f => f.day)],
    ['2026-06-13', 'idea', null, ['duel', 'streak', 'idea'], ['2026-06-10', '2026-06-12']],
  );

  const news = [
    [{premiere: 'lachs00001'}, say('premiereLast', {})],
    [{premiere: 'rind00001'}, say('premiere', {sort: 'Rind'})],
    [{milestone: {n: 100, left: 3}}, say('milestone', {n: '3×', m: '100. Mal'})],
    [{snacks: 4}, say('snacks', {n: '4 Snacks', grip: 'Minka hat euch im Griff.'})],
    [{anniversary: 1, first: {at: 0, days: 30, meals: 62}}, say('anniversary', {span: 'einem Monat', n: 62})],
    [{record: {meals: 0, streak: 23}}, say('recordStreak', {days: '23 Tage'})],
    [{record: {meals: 4, streak: 0}, meals: 4}, say('recordDay', {n: '4 Mahlzeiten'})],
    [{shift: {at: 435, diff: -40}}, say('earlier', {meal: 'Frühstück', span: '40 Minuten'})],
    [{shift: {at: 1110, diff: 95}}, say('later', {meal: 'Abendessen', span: 'eineinhalb Stunden'})],
    [{sameMinute: true}, say('sameMinute', {})],
  ];
  for (const [x, want] of news) assert.deepEqual(one(x), [days[0][0], want]);
  assert.deepEqual(one({next: {at: 1110, due: true}}), [
    lead('due', {what: 'Lachs', at: '9:00', by: ' von Anna', meal: 'Abendessen'}),
    say('waiting', {names: 'Minka', wartet: 'wartet', uebt: 'übt', hat: 'hat', sitzt: 'sitzt'}),
  ]);
  assert.deepEqual(one({next: {at: 435, tomorrow: true}}), [
    lead('done', {at: '9:00', by: ' von Anna', meal: 'Frühstück', time: '7:15'}),
    days[0][1],
  ]);

  const bare = {...g, ...none};
  const kinds = [
    [
      {feedRun: {name: 'Ben', days: 5, other: 'Jonas'}},
      say('feedRun', {name: 'Ben', days: '5 Tage', since: '5 Tagen', other: 'Jonas'}),
    ],
    [
      {weekday: {at: 435, mine: 525, later: true, weekday: 6}},
      say('weekday', {weekday: 'Samstags', day: 'Samstag', meal: 'Frühstück', shift: 'später', time: '8:45'}),
    ],
    [{lookback: 'lachs00001'}, say('lookback', {sort: 'Lachs'})],
    [{sorts: 14}, say('sorts', {n: '14 Sorten'})],
    [{first: {at: 0, days: 43, meals: 100}}, say('days', {since: '43 Tagen', days: '43 Tage', n: 43})],
    [
      {
        feeders: [
          {name: 'Anna', n: 5},
          {name: 'Jonas', n: 5},
        ],
      },
      say('duelTie', {score: '5 zu 5', first: 'Anna', second: 'Jonas'}),
    ],
  ];
  for (const [x, want] of kinds) assert.equal(one(x, bare)[1], want);

  const t = h => at(`2026-06-09T${h}`),
    fed = {servedAt: t('07:20')},
    before = {servedAt: t('07:20') - DAY};
  assert.deepEqual(
    [
      momentOf({last: null}, t('12:00')),
      momentOf({last: fed, next: {at: 1110, due: true}}, t('19:00')),
      momentOf({last: before, next: {at: 435, due: true}}, t('07:30')),
      momentOf({last: fed, next: {at: 1110}}, t('07:40')),
      momentOf({last: fed, next: {at: 1110}}, t('10:00')),
      momentOf({last: before, next: {at: 435}}, t('06:30')),
      momentOf({last: fed, next: {at: 435, tomorrow: true}}, t('21:00')),
      momentOf({last: before, next: {at: 435}}, t('02:00')),
      momentOf({last: fed, next: null}, t('12:00')),
      momentOf({last: before, next: null}, t('12:00')),
      momentOf({last: {servedAt: t('07:20') - 3 * DAY}, next: {at: 435}}, t('12:00')),
    ],
    ['none', 'due', 'dueFirst', 'fresh', 'later', 'morning', 'done', 'night', 'today', 'yesterday', 'older'],
  );
});
