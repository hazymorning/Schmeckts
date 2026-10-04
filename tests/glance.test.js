// The overview card (js/glance.js, views/overview.js) and the cat calendar (views/facts.js). Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {glance} from '../app/www/js/glance.js';
import {nextMeal} from '../app/www/js/smart.js';
import {addDays, dayNumber} from '../app/www/js/dates.js';
import {datedOn, FACTS, factOn, fill, POOLS, sharesWord} from '../app/www/js/views/facts.js';

// views/overview.js reaches for the page as it loads; in Node a stub answers every such call
const stub = new Proxy(function () {}, {
  get: (_, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub),
  apply: () => stub,
});
Object.assign(globalThis, {window: globalThis, document: stub, matchMedia: stub, addEventListener: () => {}});
const {replaceDb} = await import('../app/www/js/store.js');
const {headOf, poolOf, sentenceOf, valuesOf} = await import('../app/www/js/views/overview.js');

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

test('the glance: the newest serving of the pets shown up to now, left when one of them left it, a treat never', () => {
  const db = household(
    ['nass', snack],
    [
      ['nass', 'A', '10 07:10', 'Anna', 'schlecht'],
      ['nass', ['A', 'B'], '10 09:00', 'Jonas', 'top'],
      ['snack', 'A', '10 11:00', 'Jonas', 'unberuehrt'],
      ['nass', 'A', '10 12:30', 'Anna', 'schlecht'], // after now
    ],
  );
  db.servings.find(s => s.id === 'meal1').pets.B.r = 'schlecht';
  const seen = (pets, time) => (g => [g.last?.id ?? null, g.left])(glance(db, pets, at(day(10, time))));
  assert.deepEqual(
    [seen(['A'], '12:00'), seen(['A'], '10:00'), seen(['B'], '10:00'), seen(['A', 'B'], '10:00'), seen(['A'], '07:00')],
    [
      ['meal2', false],
      ['meal1', false],
      ['meal1', true],
      ['meal1', true],
      [null, false],
    ],
  );
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

const meal = (when, by = '') => ['nass', 'A', when, by];

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

test('a heading and a sentence share a word when a content word or a name comes back in any ending; small words, numbers and markup do not count', () => {
  const same = [
    ['Heute ist noch nichts eingetragen.', 'Heute stand zum ersten Mal Sheba im Napf.'],
    ['Seit 3 Stunden ist Ruhe am Napf.', 'Ein zerkratzter Napf merkt sich jeden Geruch.'],
    ['Der erste Napf des Tages ist überfällig.', 'Seit 12 Tagen schreibst du hier mit.'],
    ['Mit dem ersten Napf beginnt das Tagebuch.', 'Die erste Mahlzeit stand im Tagebuch.'],
    ['Neues von Minka', 'Morgen ist Geburtstag, und <b>Minka</b> ahnt noch nichts.'],
  ];
  const apart = [
    ['Seit 3 Stunden ist Ruhe.', 'Noch <b>3×</b> füttern, dann ist das 100. Mal erreicht.'],
    ['Die Katze ist satt und der Hund auch.', 'Das Futter ist da, und die Uhr tickt nach.'],
    ['Gestern gab’s <b>Rind</b>.', 'Heute gab’s <b>Lachs</b>.'],
  ];
  for (const [a, b] of same) assert.ok(sharesWord(a, b) && sharesWord(b, a), `${a} | ${b}`);
  for (const [a, b] of apart) assert.ok(!sharesWord(a, b), `${a} | ${b}`);
});

const MINKA = 'minka00001';
const HOME = {
  version: 3,
  pets: [{id: MINKA, name: 'Minka', species: 'Katze', createdAt: 1}],
  products: [
    {id: 'lachs00001', brand: 'Sheba', variety: 'Lachs', type: 'Nassfutter', codes: {}},
    {id: 'snack00001', brand: 'Dreamies', variety: 'Huhn', type: 'Snack', codes: {}},
  ],
  servings: [],
  observations: [],
};
const t = (when, days = 0) => addDays(at(`2026-06-09T${when}`), days); // a Tuesday
const served = (when, days = 0, productId = 'lachs00001') => ({
  id: 'last',
  productId,
  servedAt: t(when, days),
  pets: {[MINKA]: {r: null}},
});
// a glance and a time for every pool
const STATES = {
  due: [{last: served('07:20'), next: {at: 1110, due: true}}, t('18:40')],
  dueFirst: [{last: served('18:00', -1), next: {at: 435, due: true}}, t('07:30')],
  fresh: [{last: served('11:40'), next: {at: 1110}}, t('12:00')],
  freshTreat: [{last: served('11:40', 0, 'snack00001'), next: {at: 1110}}, t('12:00')],
  later: [{last: served('07:20'), next: {at: 1110}}, t('12:00')],
  morning: [{last: served('18:00', -1), next: {at: 435}}, t('06:00')],
  done: [{last: served('18:30'), next: {at: 435, tomorrow: true}}, t('21:00')],
  night: [{last: served('18:00', -1), next: {at: 435}}, t('02:00')],
  today: [{last: served('07:20'), next: null}, t('12:00')],
  yesterday: [{last: served('18:00', -1), next: null}, t('12:00')],
  lastNight: [{last: served('18:00', -1), next: null}, t('02:00')],
  older: [{last: served('18:00', -3), next: {at: 435}}, t('12:00')],
  none: [{last: null, next: {at: 435}}, t('12:00')],
};
for (const [pool, moment] of Object.entries({leftDue: 'due', leftLater: 'later', leftDone: 'done', leftToday: 'today'}))
  STATES[pool] = [{...STATES[moment][0], left: true}, STATES[moment][1]];
STATES.birthdayToday = [{...STATES.later[0], birthday: {pet: MINKA, today: true, age: 6}}, t('12:00')];
STATES.birthdayTomorrow = [{...STATES.later[0], birthday: {pet: MINKA, days: 1}}, t('12:00')];

test('the overview pools: none empty, each one the card reaches, every sentence naming only what the card has then', () => {
  replaceDb(structuredClone(HOME));
  assert.deepEqual(Object.keys(STATES).sort(), Object.keys(POOLS).sort());
  for (const [pool, [g, now]] of Object.entries(STATES)) {
    assert.ok(POOLS[pool].length, `${pool}: not empty`);
    assert.equal(poolOf(g, now), pool);
    for (const said of POOLS[pool].map(x => fill(x, valuesOf(g, now))))
      assert.ok(!/[{}]/.test(said), `${pool}: ${said}`);
  }
});

test('the overview sentence: a meal left takes its own pool where there is one, a birthday goes before all but feeding time; the same all day, the next where it repeats a word of the heading', () => {
  replaceDb(structuredClone(HOME));
  const pool = (name, x) => poolOf({...STATES[name][0], ...x}, STATES[name][1]);
  assert.deepEqual(
    [
      pool('dueFirst', {left: true}),
      pool('morning', {left: true}),
      pool('fresh', {left: true}),
      pool('night', {left: true}),
      pool('due', {birthday: {pet: MINKA, today: true, age: 6}}),
      pool('dueFirst', {birthday: {pet: MINKA, days: 1}}),
      pool('night', {birthday: {pet: MINKA, days: 1}}),
      pool('later', {birthday: {pet: MINKA, days: 2}}),
      pool('done', {left: true, birthday: {pet: MINKA, today: true, age: null}}),
    ],
    ['leftDue', 'leftLater', 'fresh', 'night', 'due', 'dueFirst', 'birthdayTomorrow', 'later', 'birthdayToday'],
  );

  const [g, now] = STATES.dueFirst,
    head = 'Minkas Tag',
    list = POOLS.dueFirst.map(x => fill(x, valuesOf(g, now)));
  assert.ok(list.some(s => sharesWord(head, s)) && list.some(s => !sharesWord(head, s)));
  for (let i = 0; i < list.length; i++) {
    const on = addDays(now, i),
      from = dayNumber(on) % list.length,
      want = [...list.slice(from), ...list.slice(0, from)].find(s => !sharesWord(head, s));
    assert.equal(sentenceOf({...g, last: {...g.last, servedAt: addDays(g.last.servedAt, i)}}, on, head), want);
  }
  const [later, noon] = STATES.later;
  assert.equal(sentenceOf(later, t('09:00'), 'Minka heute'), sentenceOf(later, t('16:00'), 'Minka heute'));

  const party = age => ({...later, birthday: {pet: MINKA, today: true, age}}),
    week = [...Array(8).keys()].map(i => addDays(noon, i)),
    plain = POOLS.birthdayToday.filter(x => !x.includes('{age}'));
  assert.ok(
    week.some(d => !plain.includes(sentenceOf(party(6), d, 'Minkas Geburtstag'))) &&
      week.every(d => plain.includes(sentenceOf(party(null), d, 'Minkas Geburtstag'))),
    'the sentence with the age only with the age known',
  );
});

test('the overview heading: whose day it is, a wording a day, the birthday and the night their own', () => {
  const DAY = 864e5,
    T = at('2026-10-05T12:00'); // a Monday
  const pets = [
    {id: 'mau0000001', name: 'Mau', species: 'Katze', nicknames: ['Mausi']},
    {id: 'felix00001', name: 'Felix', species: 'Katze'},
    {id: 'kiwi000001', name: 'Kiwi', species: 'Vogel'},
  ];
  replaceDb({version: 3, pets, products: [], servings: [], observations: []});
  const week = [0, 1, 2, 3, 4, 5, 6].map(i => headOf([pets[0]], {}, T + i * DAY, 'later'));
  assert.ok(
    week.every(h => /Mau|Mausi/.test(h) && !/Maus /.test(h)) &&
      new Set(week).size >= 4 &&
      week.some(h => h.includes('Mausi')),
    `each day names the pet, by its nicknames too, never as Maus: ${week}`,
  );
  assert.equal(headOf([pets[0]], {}, T + 3 * 36e5, 'done'), week[0], 'the same all day');
  assert.ok(
    [0, 1, 2, 3].map(i => headOf([pets[1]], {}, T + i * DAY, 'later')).every(h => !h.includes('Felixs')),
    'Felix’, never Felixs',
  );
  assert.match(headOf([pets[0]], {birthday: {pet: 'mau0000001', today: true}}, T, 'later'), /Geburtstag/);
  assert.match(
    headOf(pets.slice(0, 2), {birthday: {pet: 'felix00001', today: true}}, T, 'later'),
    /^Felix’ Geburtstag$/,
  );
  assert.match(headOf([pets[0]], {}, T, 'night'), /Nacht/);
  assert.ok(
    [0, 1, 2, 3].map(i => headOf(pets.slice(0, 2), {}, T + i * DAY, 'later')).every(h => h.includes('Mau und Felix')),
    'two pets by their own names',
  );
  assert.ok(
    [0, 1, 2, 3].map(i => headOf(pets, {}, T + i * DAY, 'later')).every(h => !/Mau|Felix|Kiwi/.test(h)),
    'more than two: the bunch, no list of names',
  );
});

test('the cat calendar: its ids in order, every text once, the months in shape', () => {
  assert.deepEqual(
    FACTS.map(f => f.id),
    FACTS.map((_, i) => `k${String(i + 1).padStart(3, '0')}`),
  );
  assert.equal(new Set(FACTS.map(f => f.text)).size, FACTS.length);
  for (const f of FACTS) assert.ok(!f.months || f.months.every(m => Number.isInteger(m) && m >= 1 && m <= 12), f.id);
});

test('the cat calendar without a sheet torn off: no fact comes again before all others have had their turn, none out of its months, none bound to a day', () => {
  const every = FACTS.filter(f => !f.day && !f.months).map(f => f.id),
    last = new Map(),
    shown = [];
  for (let i = 0; i < 3 * 365; i++) {
    const d = new Date(2026, 9, 4 + i, 12),
      f = factOn(d);
    assert.ok(!f.day && (!f.months || f.months.includes(d.getMonth() + 1)), `${f.id} on ${d.toDateString()}`);
    if (last.has(f.id)) {
      const since = new Set(shown.slice(last.get(f.id) + 1));
      assert.ok(
        every.every(id => id === f.id || since.has(id)),
        `${f.id} again on ${d.toDateString()} before all others`,
      );
    }
    last.set(f.id, shown.length);
    shown.push(f.id);
  }
});

test('the cat calendar: a fact bound to a day comes on that day, the clocks changing on the last Sunday of March and October', () => {
  const on = (y, m, d) => datedOn(new Date(y, m - 1, d, 12))?.id ?? null;
  assert.deepEqual(
    [
      on(2026, 8, 8),
      on(2026, 2, 17),
      on(2026, 3, 29),
      on(2026, 10, 25),
      on(2027, 3, 28),
      on(2027, 10, 31),
      on(2026, 12, 31),
    ],
    ['k139', 'k140', 'k141', 'k141', 'k141', 'k141', 'k145'],
  );
  assert.deepEqual([on(2026, 8, 7), on(2026, 10, 24), on(2027, 3, 29), on(2026, 10, 4)], [null, null, null, null]);
});

test('the cat calendar: a sheet torn off shows the next fact in season, the one tomorrow brings; each in turn before any comes again', () => {
  const d = new Date(2026, 9, 14, 12),
    open = FACTS.filter(f => !f.day && (!f.months || f.months.includes(10)));
  assert.equal(factOn(d, 1), factOn(new Date(2026, 9, 15, 12)));
  assert.equal(new Set(open.map((_, n) => factOn(d, n))).size, open.length);
  assert.equal(factOn(d, open.length), factOn(d));
});
