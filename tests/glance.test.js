// The overview card (js/glance.js, views/overview.js) and the cat calendar (views/facts.js), their texts in content/.
// Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {glance} from '../app/www/js/glance.js';
import {nextMeal} from '../app/www/js/smart.js';
import {addDays, dayNumber} from '../app/www/js/dates.js';
import {catOf, factOn, fill, formatOn, hangingDay, sharesWord, sheetOn, sheetText} from '../app/www/js/views/facts.js';
import {FACTS} from '../app/www/js/content/facts.js';
import {POOLS} from '../app/www/js/content/pools.js';

// views/overview.js reaches for the page as it loads; in Node a stub answers every such call
const stub = new Proxy(function () {}, {
  get: (_, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub),
  apply: () => stub,
});
Object.assign(globalThis, {window: globalThis, document: stub, matchMedia: stub, addEventListener: () => {}});
// the settings as 0.28 left them, where the store finds them in a browser
const stored = {'schmeckts-prefs': JSON.stringify({torn: 3})};
globalThis.localStorage = {getItem: k => stored[k] ?? null, setItem: (k, v) => (stored[k] = v), removeItem: () => {}};
const {prefs, replaceDb} = await import('../app/www/js/store.js');
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

test('a heading and a sentence share a word when a content word or a name comes back in any ending; small words, numbers and markup do not count', () => {
  const same = [
    ['Heute ist noch nichts eingetragen.', 'Heute stand zum ersten Mal Sheba im Napf.'],
    ['Seit 3 Stunden ist Ruhe am Napf.', 'Ein zerkratzter Napf merkt sich jeden Geruch.'],
    ['Der erste Napf des Tages ist überfällig.', 'Seit 12 Tagen schreibst du hier mit.'],
    ['Mit dem ersten Napf beginnt das Tagebuch.', 'Die erste Mahlzeit stand im Tagebuch.'],
    ['Neues von Minka', 'Gegen <b>18 Uhr</b> gibt’s wieder was, <b>Minka</b> weiß das.'],
  ];
  const apart = [
    ['Seit 3 Stunden ist Ruhe.', 'Noch <b>3×</b> füttern, dann ist das 100. Mal erreicht.'],
    ['Die Katze ist satt und der Kater auch.', 'Das Futter ist da, und die Uhr tickt nach.'],
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

test('the overview pools: none empty, each one the card reaches, every sentence naming only what the card has then', () => {
  replaceDb(structuredClone(HOME));
  assert.deepEqual(Object.keys(STATES).sort(), Object.keys(POOLS).sort());
  for (const [pool, [g, now]] of Object.entries(STATES)) {
    assert.ok(POOLS[pool].length, `${pool}: not empty`);
    assert.equal(poolOf(g, now), pool);
    for (const said of POOLS[pool].map(x => fill(x, valuesOf({...g, sex: 'f'}, now))))
      assert.ok(!/[{}]/.test(said), `${pool}: ${said}`);
  }
});

test('the overview sentence: a meal left takes its own pool where there is one; the same all day, the next where it repeats a word of the heading', () => {
  replaceDb(structuredClone(HOME));
  const pool = (name, x) => poolOf({...STATES[name][0], ...x}, STATES[name][1]);
  assert.deepEqual(
    [
      pool('dueFirst', {left: true}),
      pool('morning', {left: true}),
      pool('fresh', {left: true}),
      pool('night', {left: true}),
      pool('done', {left: true}),
    ],
    ['leftDue', 'leftLater', 'fresh', 'night', 'leftDone'],
  );

  const [g, now] = STATES.dueFirst,
    head = 'Minkas Tag',
    list = POOLS.dueFirst.filter(x => !/\{sie\}|\[Katze\]/i.test(x)).map(x => fill(x, valuesOf(g, now)));
  assert.ok(list.some(s => sharesWord(head, s)) && list.some(s => !sharesWord(head, s)));
  for (let i = 0; i < list.length; i++) {
    const on = addDays(now, i),
      from = dayNumber(on) % list.length,
      want = [...list.slice(from), ...list.slice(0, from)].find(s => !sharesWord(head, s));
    assert.equal(sentenceOf({...g, last: {...g.last, servedAt: addDays(g.last.servedAt, i)}}, on, head), want);
  }
  const [later] = STATES.later;
  assert.equal(sentenceOf(later, t('09:00'), 'Minka heute'), sentenceOf(later, t('16:00'), 'Minka heute'));
});

test('the overview heading: whose day it is, a wording a day, the night its own', () => {
  const DAY = 864e5,
    T = at('2026-10-05T12:00'); // a Monday
  const pets = [
    {id: 'mau0000001', name: 'Mau', species: 'Katze', nicknames: ['Mausi']},
    {id: 'felix00001', name: 'Felix', species: 'Katze'},
    {id: 'kiwi000001', name: 'Kiwi', species: 'Katze'},
  ];
  replaceDb({version: 3, pets, products: [], servings: [], observations: []});
  const week = [0, 1, 2, 3, 4, 5, 6].map(i => headOf([pets[0]], T + i * DAY, 'later'));
  assert.ok(
    week.every(h => /Mau|Mausi/.test(h) && !/Maus /.test(h)) &&
      new Set(week).size >= 4 &&
      week.some(h => h.includes('Mausi')),
    `each day names the pet, by its nicknames too, never as Maus: ${week}`,
  );
  assert.equal(headOf([pets[0]], T + 3 * 36e5, 'done'), week[0], 'the same all day');
  assert.ok(
    [0, 1, 2, 3].map(i => headOf([pets[1]], T + i * DAY, 'later')).every(h => !h.includes('Felixs')),
    'Felix’, never Felixs',
  );
  assert.match(headOf([pets[0]], T, 'night'), /Nacht/);
  assert.ok(
    [0, 1, 2, 3].map(i => headOf(pets.slice(0, 2), T + i * DAY, 'later')).every(h => h.includes('Mau und Felix')),
    'two pets by their own names',
  );
  assert.ok(
    [0, 1, 2, 3].map(i => headOf(pets, T + i * DAY, 'later')).every(h => !/Mau|Felix|Kiwi/.test(h)),
    'more than two: the bunch, no list of names',
  );
  const days = [0, 1, 2, 3, 4, 5, 6, 7].map(i => headOf([pets[1]], T + i * 7 * DAY, 'later'));
  assert.equal(new Set(days).size, 8, 'on a weekday its eight wordings in turn');
});

test('a sentence with {Sie} or {sie} only for the one pet shown whose sex is known, she or he as it is', () => {
  replaceDb(structuredClone(HOME));
  const shown = (pets, ids) => glance({...household(['nass'], []), pets}, ids, NOW).sex,
    f = {id: 'A', sex: 'f'},
    m = {id: 'B', sex: 'm'};
  assert.deepEqual(
    [
      shown([f], ['A']),
      shown([m], ['B']),
      shown([{id: 'A'}], ['A']),
      shown([{id: 'A', sex: 'x'}], ['A']),
      shown([f, m], ['A', 'B']),
      shown([f, m], ['B']),
    ],
    ['f', 'm', null, null, null, 'm'],
  );
  for (const [pool, [g, now]] of Object.entries(STATES)) {
    const named = POOLS[pool].filter(x => /\{sie\}/i.test(x)),
      next = i => ({...g, last: g.last && {...g.last, servedAt: addDays(g.last.servedAt, i)}}),
      month = sex => [...Array(31).keys()].map(i => sentenceOf({...next(i), sex}, addDays(now, i), '')),
      as = (Sie, sie) => named.map(x => fill(x, {...valuesOf(g, now), Sie, sie}));
    assert.ok(!month(null).some(said => as('Sie', 'sie').includes(said) || as('Er', 'er').includes(said)), pool);
    assert.ok(!named.length || month('f').some(said => as('Sie', 'sie').includes(said)), `${pool}: she`);
    assert.ok(!named.length || month('m').some(said => as('Er', 'er').includes(said)), `${pool}: he`);
  }
});

test('a sentence in one piece', () => {
  for (const [pool, list] of Object.entries(POOLS)) for (const x of list) assert.match(x, /^[^|[\]]+$/, pool);
});

const cat = (sex, name = 'Schnurrsula') => ({id: 'cat' + name, name, species: 'Katze', ...(sex && {sex})});
const SHEETS = Object.values(FACTS).flat();

test('the cat calendar: a format for each weekday, its own id prefix, every text once, a verdict and a back only on Stimmt’s?, months only in Wissen', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map(i => formatOn(new Date(2026, 9, 4 + i, 12))), // from Sunday
    ['Wissen', 'Katzenlogik', 'Stimmt’s?', 'Kurios', 'Wissen', 'Flachwitz', 'Sprache'],
  );
  const prefixes = Object.values(FACTS).map(list => new Set(list.map(f => f.id.replace(/\d{3}$/, ''))));
  assert.ok(
    prefixes.every(p => p.size === 1) && new Set(prefixes.map(p => [...p][0])).size === prefixes.length,
    'one prefix a format',
  );
  assert.equal(new Set(SHEETS.map(f => f.id)).size, SHEETS.length);
  const texts = SHEETS.flatMap(f => [f.text, f.back, f.m, f.f].filter(Boolean));
  assert.equal(new Set(texts).size, texts.length);
  for (const [format, list] of Object.entries(FACTS))
    for (const f of list) {
      assert.ok(!!f.back === (format === 'Stimmt’s?') && !!f.verdict === !!f.back, f.id);
      assert.ok(!f.months || (format === 'Wissen' && f.months.every(m => Number.isInteger(m) && m >= 1 && m <= 12)));
    }
});

test('the cat calendar: on the days of a format its sheets in turn, the same all day, none again before all others, none out of its months', () => {
  const shown = {};
  for (let i = 0; i < 3 * 365; i++) {
    const d = new Date(2026, 9, 4 + i, 12),
      f = factOn(d);
    assert.ok(FACTS[formatOn(d)].includes(f), `${f.id} on ${d.toDateString()}`);
    assert.ok(!f.months || f.months.includes(d.getMonth() + 1), `${f.id} on ${d.toDateString()}`);
    (shown[formatOn(d)] ||= []).push(f.id);
  }
  assert.equal(factOn(new Date(2026, 9, 6, 0, 10)), factOn(new Date(2026, 9, 6, 23, 50)));
  for (const [format, ids] of Object.entries(shown)) {
    const every = FACTS[format].filter(f => !f.months).map(f => f.id),
      last = new Map();
    ids.forEach((id, n) => {
      const since = new Set(ids.slice(last.get(id) + 1, n));
      assert.ok(
        !last.has(id) || every.every(x => x === id || since.has(x)),
        `${format}: ${id} again before all others`,
      );
      last.set(id, n);
    });
  }
});

test('the cat calendar: a sheet a day; on a new day the last one seen hangs over today’s until torn off, none on first use', () => {
  const now = new Date(2026, 9, 6, 7, 30),
    yesterday = hangingDay('2026-10-05', now);
  assert.deepEqual(
    [hangingDay(null, now), hangingDay('2026-10-06', now), hangingDay('2026-10-07', now)],
    [null, null, null],
    'first use, torn off today, a day ahead: nothing hangs',
  );
  assert.deepEqual(
    [new Date(yesterday).toDateString(), sheetOn(yesterday)],
    [new Date(2026, 9, 5).toDateString(), sheetOn(new Date(2026, 9, 5, 21))],
    'yesterday’s sheet, as it was all yesterday',
  );
  assert.equal(new Date(hangingDay('2026-10-01', now)).getDate(), 1, 'away for days: the last one seen');
});

test('the cat calendar speaks of the cat only where the household has one cat of known sex: its variant, its name, „dein Kater“', () => {
  assert.deepEqual(
    [[cat('m')], [cat('f'), cat('m', 'Tiger')], [cat(null)], [cat('x')]].map(pets => catOf(pets)?.name ?? null),
    ['Schnurrsula', null, null, null],
  );
  const paws = SHEETS.find(f => f.m),
    nose = SHEETS.find(f => f.text.includes('{deine Katze}'));
  assert.deepEqual(
    [sheetText(paws, cat('m')), sheetText(paws, cat('f')), sheetText(paws, null)],
    [paws.m.replace('{name}', 'Schnurrsula'), paws.f.replace('{name}', 'Schnurrsula'), paws.text],
  );
  assert.ok(sheetText(paws, cat('m', '<i>Mo</i>')).includes('&lt;i&gt;Mo&lt;/i&gt;'), 'the name escaped');
  assert.deepEqual(
    [sheetText(nose, cat('m')), sheetText(nose, cat('f')), sheetText(nose, null)].map(
      text => text.match(/dein\w* \w+/)[0],
    ),
    ['dein Kater', 'deine Katze', 'deine Katze'],
  );
  assert.equal(sheetText({text: '{Deine Katze} weiß das.'}, cat('m')), 'Dein Kater weiß das.');
  for (const f of SHEETS)
    for (const c of [null, cat('f'), cat('m')])
      for (const back of f.back ? [false, true] : [false]) assert.ok(!/[{}]/.test(sheetText(f, c, back)), f.id);
});

test('the sheets torn off, which 0.28 counted, are forgotten', () => {
  assert.ok(!('torn' in prefs) && prefs.sheetDay === null);
});
