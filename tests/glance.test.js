// The overview card (js/glance.js, views/overview.js) and the cat calendar (views/facts.js), their texts in content/.
// Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {glance} from '../app/www/js/glance.js';
import {nextMeal} from '../app/www/js/smart.js';
import {addDays, dayStart} from '../app/www/js/dates.js';
import {catOf, factOn, formatOn, hangingDay, sharesWord, sheetOn, sheetText} from '../app/www/js/views/facts.js';
import {FACTS} from '../app/www/js/content/facts.js';
import {ANCHORS, FACTS as DAY_FACTS, NOTABLE} from '../app/www/js/content/pools.js';

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
const {factsOf, headOf, momentOf, sentenceOf, valuesOf} = await import('../app/www/js/views/overview.js');

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

test('the glance: the newest serving and the newest meal of the pets shown up to now, left when one of them left that meal, today’s meals and treats', () => {
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
  const seen = (pets, time) =>
    (g => [g.last?.id ?? null, g.meal?.id ?? null, g.left, g.meals, g.treats])(glance(db, pets, at(day(10, time))));
  assert.deepEqual(
    [seen(['A'], '12:00'), seen(['A'], '10:00'), seen(['B'], '10:00'), seen(['A', 'B'], '10:00'), seen(['A'], '07:00')],
    [
      ['meal2', 'meal1', false, 2, 1],
      ['meal1', 'meal1', false, 2, 0],
      ['meal1', 'meal1', true, 1, 0],
      ['meal1', 'meal1', true, 2, 0],
      [null, null, false, 0, 0],
    ],
  );
  const usual = when =>
    glance(
      household(
        [snack],
        when.map(w => ['snack', 'A', w, '']),
        ['A'],
      ),
      ['A'],
      NOW,
    ).treatsUsual;
  const days = n => NOW - n * 864e5;
  assert.deepEqual(
    [
      usual([1, 3, 5, 7, 9].map(days)),
      usual([1, 3, 5, 7].map(days)),
      usual([1, 3, 5, 7, 13].map(days)),
      usual([1, 3, 5, 7, 14].map(days)),
      usual([1, 1.1, 3, 5, 7].map(days)),
    ],
    [true, false, true, false, false],
    'treats are usual on five days of the last fourteen, today one of them',
  );
});

test('the glance: how the last meal went, a variety’s first time, the rated meals in a row that went one way, the week, today’s notes', () => {
  const db = household(
    ['nass', 'neu', snack],
    [
      ['nass', 'A', '03 07:00', '', 'schlecht'],
      ['nass', 'A', '04 07:00', '', 'top'],
      ['nass', 'A', '05 07:00', '', 'gut'],
      ['nass', 'A', '06 07:00', '', 'schlecht'],
      ['nass', 'A', '07 07:00', '', 'top'],
      ['nass', 'A', '08 07:00', '', 'top'],
      ['nass', 'A', '09 07:00', '', 'gut'],
      ['snack', 'A', '10 06:00', '', 'verputzt'],
      ['neu', 'A', '10 07:00', ''],
    ],
    ['A'],
  );
  db.observations = [
    {id: 'o1', kind: 'happy', at: at(day(10, '08:00')), pets: {A: true}},
    {id: 'o2', kind: 'vomit', at: at(day(9, '08:00')), pets: {A: true}},
  ];
  const g = glance(db, ['A'], NOW);
  assert.deepEqual(
    [g.meal.productId, g.outcome, g.rating, g.first, g.streak, g.week, g.noted, g.meals, g.treats],
    ['neu', null, null, true, {kind: 'good', n: 3}, {n: 6, good: 5, sorts: 2}, ['happy'], 1, 1],
  );
  const rated = glance(db, ['A'], at(day(9, '12:00')));
  assert.deepEqual(
    [rated.meal.productId, rated.outcome, rated.rating, rated.first],
    ['nass', 'good', 'gut', false],
    'the day before: the last meal rated, a variety served before',
  );
  db.servings.find(s => s.productId === 'neu').pets.A.r = 'sosse';
  assert.deepEqual((x => [x.outcome, x.rating, x.left, x.streak])(glance(db, ['A'], NOW)), [
    'left',
    'sosse',
    true,
    {kind: 'left', n: 1},
  ]);
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

const MAU = 'mau0000001';
const PRODUCTS = [
  {id: 'lamm000001', brand: 'Catz', variety: 'Lamm mit Nachtkerzenöl', type: 'Nassfutter', codes: {}},
  {id: 'huhn000001', brand: 'Bozita', variety: 'Huhn & Pute in Soße', type: 'Nassfutter', codes: {}},
  {id: 'pferd00001', brand: 'Catz', variety: 'Pferd mit Nachtkerzenöl', type: 'Nassfutter', codes: {}},
  {id: 'paste00001', brand: 'Sheba', variety: 'Feine Pastete', type: 'Nassfutter', codes: {}},
  {id: 'snack00001', brand: 'Dreamies', variety: 'Käse', type: 'Snack', codes: {}},
];
const t = (when, days = 0) => addDays(at(`2026-06-09T${when}`), days); // a Tuesday
// two weeks of a meal at 7:15 and one at 18:30, rated, treats on two days of three
const WEEKS = Array.from({length: 14}, (_, i) => -14 + i).flatMap(d => [
  ['lamm000001', t('07:15', d), d % 4 ? 'top' : 'mittel'],
  ['huhn000001', t('18:30', d), 'gut'],
  ...(d % 3 ? [['snack00001', t('15:00', d), 'verputzt']] : []),
]);
/* the card for one cat or several: meals as [variety, time, rating], then the glance as overviewHTML() makes it */
function home(meals, now, {sex = null, cats = 1, notes = [], favourite = 'Rind in Gelee'} = {}) {
  const pets = Array.from({length: cats}, (_, i) => ({
      id: i ? `cat${i}000001` : MAU,
      name: i ? `Kater${i}` : 'Mau',
      createdAt: 1,
      ...(sex && !i && {sex}),
    })),
    ids = pets.map(p => p.id),
    db = {
      version: 3,
      pets,
      products: PRODUCTS,
      servings: meals
        .map(([productId, when, r = null], i) => ({
          id: 'serv' + String(i).padStart(5, '0'),
          productId,
          servedAt: when,
          pets: Object.fromEntries(ids.map(id => [id, {r}])),
        }))
        .sort((a, b) => b.servedAt - a.servedAt),
      observations: notes.map(([kind, when], i) => ({id: 'note' + i + '0000', kind, at: when, pets: {[MAU]: true}})),
    };
  replaceDb(db);
  return [{...glance(db, ids, now), pets: cats, favourite}, now];
}
const keys = text => [...text.matchAll(/\{(\w+)\}/g)].map(([, k]) => k);
const plain = html => html.replace(/<[^>]*>/g, '');
const heads = ['', 'Mau heute', 'Ein Tag mit Mau', 'Nachtruhe bei Mau'];
// a state for every anchor and fact, with and without a sex, one cat and two
const STATES = {
  none: home([], t('12:00')),
  older: home(WEEKS, t('12:00', 3)),
  fresh: home([...WEEKS, ['lamm000001', t('07:20')]], t('07:40'), {sex: 'f'}),
  firstFresh: home([...WEEKS, ['pferd00001', t('07:20')]], t('07:40'), {sex: 'm'}),
  freshTreat: home(
    [...WEEKS, ['lamm000001', t('07:20')], ['snack00001', t('11:30')], ['snack00001', t('11:50')]],
    t('12:00'),
    {sex: 'f'},
  ),
  notYet: home(WEEKS, t('09:00'), {sex: 'f'}),
  notYetPlain: home([...WEEKS, ['paste00001', t('18:40', -1)]], t('09:00')),
  last: home([...WEEKS, ['lamm000001', t('07:20'), 'gut']], t('15:30'), {sex: 'f'}),
  lastPlain: home([...WEEKS, ['paste00001', t('07:20')]], t('12:00')),
  lastBoth: home([...WEEKS, ['lamm000001', t('07:20'), 'top']], t('12:00'), {cats: 2}),
  lastLeft: home([...WEEKS, ['lamm000001', t('07:20'), 'sosse'], ['huhn000001', t('12:20'), 'schlecht']], t('16:00'), {
    cats: 2,
  }),
  firstLast: home([...WEEKS, ['pferd00001', t('07:20'), 'top']], t('12:00'), {sex: 'f'}),
  firstLastBoth: home([...WEEKS, ['pferd00001', t('07:20'), 'top']], t('12:00'), {cats: 2}),
  night: home(WEEKS, t('01:00'), {sex: 'm'}),
  noted: home([...WEEKS, ['lamm000001', t('07:20'), 'gut']], t('16:00'), {
    notes: [
      ['happy', t('09:00')],
      ['stink', t('10:00')],
    ],
  }),
  bare: home([['lamm000001', t('07:20'), 'gut']], t('12:00'), {favourite: null}),
};

test('the overview card: every anchor and every wording of it in use; only what the card knows is named, one bold a sentence, short', () => {
  const used = new Set();
  for (const [name, [g, now]] of Object.entries(STATES)) {
    const values = valuesOf(g, now);
    for (const [pool, list] of Object.entries(ANCHORS))
      for (const x of list) if (keys(x).every(k => values[k] != null)) used.add(`${pool}|${x}`);
    for (const head of heads) {
      const said = sentenceOf(g, now, head);
      assert.ok(said && !/[{}]|undefined|null/.test(said), `${name}: ${said}`);
      assert.ok(plain(said).length <= 120, `${name}: ${said}`);
      for (const sentence of said.split(/(?<=[.!?])\s/)) assert.ok((sentence.match(/<b>/g) || []).length <= 1, said);
    }
  }
  for (const [pool, list] of Object.entries(ANCHORS))
    for (const x of list) assert.ok(used.has(`${pool}|${x}`), `${pool}: ${x} is never said`);
  assert.deepEqual(
    Object.entries(STATES)
      .filter(([name]) => !/Plain|Both|Left|noted|bare/.test(name))
      .map(([name, [g, now]]) => [name, momentOf(g, now)]),
    [
      ['none', 'none'],
      ['older', 'older'],
      ['fresh', 'fresh'],
      ['firstFresh', 'fresh'],
      ['freshTreat', 'freshTreat'],
      ['notYet', 'notYet'],
      ['last', 'today'],
      ['firstLast', 'today'],
      ['night', 'night'],
    ],
  );
});

test('the overview card: the last meal with how it went, then one fact of the day, the notable ones first; never the schedule', () => {
  const said = name => plain(sentenceOf(...STATES[name], ''));
  assert.match(said('last'), /Lamm.*fast alles gefressen/);
  assert.match(said('lastBoth'), /Lamm.*beide haben gut gefressen/);
  assert.match(said('lastLeft'), /Huhn und Pute.*da blieb einiges stehen/);
  assert.match(said('firstFresh'), /zum ersten Mal Pferd mit Nachtkerzenöl/);
  assert.match(said('firstLast'), /zum ersten Mal Pferd mit Nachtkerzenöl.*alles gefressen/);
  assert.match(said('night'), /gestern um 18:30 Huhn und Pute/);
  assert.match(said('notYet'), /(nichts bekommen|keine Mahlzeit|nichts eingetragen).*gestern um 18:30 Huhn und Pute/);
  assert.match(said('noted'), /Heute (schon )?notiert: „Gut drauf“ und „Stunk“\./);
  assert.match(said('older'), /Der letzte Eintrag ist 3 Tage her|eingetragen war Huhn und Pute|keinen Eintrag/);
  assert.deepEqual(factsOf(...STATES.lastLeft, 'today'), ['streakLeft', 'treatsNone'], 'only the notable ones');
  assert.match(said('lastLeft'), /Die letzten zwei Mahlzeiten blieben fast stehen\./, 'two left in a row come first');
  assert.deepEqual(factsOf(...STATES.last, 'today'), ['treatsNone'], 'an afternoon without the usual treat');
  assert.deepEqual(factsOf(...STATES.bare, 'today'), [], 'a first day has no facts yet');
  const plenty = factsOf(...STATES.firstLast, 'today');
  assert.ok(
    ['streakGood', 'week', 'favourite', 'sorts'].every(k => plenty.includes(k)) &&
      !plenty.some(k => NOTABLE.includes(k)),
    `${plenty}`,
  );
  for (const [g, now] of Object.values(STATES))
    for (let h = 0; h < 24; h += 3)
      assert.ok(!/gegen|Uhr/.test(plain(sentenceOf(g, now + h * 36e5, ''))), 'no time to come');
  for (const [kind, list] of Object.entries(DAY_FACTS)) assert.ok(list.length, kind);
});

test('the overview card: a wording stays for three hours and until something is served or noted, the day sees several', () => {
  const [g, now] = STATES.firstLast,
    hour = h => addDays(dayStart(now), 0) + h * 36e5;
  const shape = h => plain(sentenceOf(g, hour(h), '')).replace(/\d+/g, '#');
  assert.equal(shape(12), shape(13.8), 'within the stretch only the hours go on');
  const allDay = [9, 12, 15, 18, 21].map(h => sentenceOf(g, hour(h), '')),
    fed = [0, 1, 2].map(n => sentenceOf({...g, meals: g.meals + n}, hour(12), ''));
  assert.ok(new Set(allDay).size >= 3, `the wordings of a day ${allDay}`);
  assert.ok(new Set(fed).size >= 2, `a new meal, a new wording ${fed}`);
});

test('the overview card speaks of the cat as she or he only where its sex is known, and never starts two sentences that way', () => {
  for (const [name, [g, now]] of Object.entries(STATES))
    for (let d = 0; d < 14; d++) {
      const said = plain(sentenceOf(g, addDays(now, d), '')),
        starts = said.split(/(?<=[.!?])\s/).map(x => x.split(' ')[0]);
      if (!g.sex) assert.ok(!/\b(Sie|Er|sie|er|ihr|sein)\b/.test(said), `${name}: ${said}`);
      assert.ok(starts.filter(w => w === 'Sie' || w === 'Er').length <= 1, `${name}: ${said}`);
    }
  const said = [...Array(14).keys()].map(d =>
    plain(sentenceOf(...STATES.last.map((x, i) => (i ? addDays(x, d) : x)), '')),
  );
  assert.ok(
    said.some(x => /\bSie\b|\bsie\b|\bihr\b/.test(x)),
    `she ${said}`,
  );
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

test('a wording in one piece', () => {
  for (const list of [...Object.values(ANCHORS), ...Object.values(DAY_FACTS)])
    for (const x of list) assert.match(x, /^[^|[\]]+$/);
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
