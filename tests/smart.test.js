// The evaluation (js/smart.js) with made-up data. Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  basis,
  feedReminders,
  feedSlots,
  GOOD,
  hintKey,
  insights,
  likingOf,
  moves,
  nextUp,
  mealsBefore,
  observed,
  observedAfter,
  ranking,
  rateCls,
  ratingsIn,
  shopGroups,
  sideOf,
  slowStarters,
  trend,
} from '../app/www/js/smart.js';
import {flavoursOf, quickOf, RATINGS, scaleOf, SCALES} from '../app/www/js/config.js';

// views/evaluation.js words the insights and reaches for the page as it loads; in Node a stub answers every such call
const stub = new Proxy(function () {}, {
  get: (_, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub),
  apply: () => stub,
});
Object.assign(globalThis, {window: globalThis, document: stub, matchMedia: stub, addEventListener: () => {}});
globalThis.localStorage = {getItem: () => null, setItem: () => {}, removeItem: () => {}};
const {insightSaid} = await import('../app/www/js/views/evaluation.js');

const DAY = 864e5,
  NOW = Date.UTC(2026, 5, 3, 10);
const [T, G, M, S, X] = ['top', 'gut', 'mittel', 'sosse', 'schlecht'];
const at = text => new Date(text).getTime();

/* meals: [variety, {pet: rating}, days ago or 'YYYY-MM-DDThh:mm', person]; newest first, as the app keeps them */
function household(pets, products, meals) {
  return {
    pets: pets.map(id => ({id, name: id})),
    products: products
      .map(p => (typeof p === 'string' ? {id: p} : p))
      .map(p => ({brand: '', variety: '', codes: {}, ...p})),
    servings: meals
      .map(([productId, rated, when, by], i) => ({
        id: 'meal' + i,
        productId,
        by,
        servedAt: typeof when === 'string' ? at(when) : NOW - when * DAY,
        pets: Object.fromEntries(Object.entries(rated).map(([pet, r]) => [pet, {r}])),
      }))
      .sort((a, b) => b.servedAt - a.servedAt),
  };
}
const rate = (sort, pet, ratings, daysAgo = 0) => ratings.map(r => [sort, {[pet]: r}, daysAgo]);
const daily = (pet, pairs, start, step = 1) => pairs.map(([sort, r], i) => [sort, {[pet]: r}, start + i * step]);
const model = (db, prefs = {}, now = NOW) => analyze(db, {activePet: 'all', hiddenHints: [], ...prefs}, now);
const sorts = (m, pick) => Object.fromEntries(m.sorts.map(e => [e.id, pick(e)]));
const keys = m => m.hints.map(h => hintKey(h) + (h.kind === 'sosse' ? '@' + h.pet : ''));

test('score: the scale\u2019s points, unknown values do not count', () => {
  const m = model(household(['A'], ['p'], rate('p', 'A', [G, M, S, X, 'lecker'])));
  const e = m.byId.get('p');
  assert.deepEqual([e.n, e.pct, e.counts], [4, 40, {gut: 1, mittel: 1, sosse: 1, schlecht: 1}]);
});

test('scales: one per food type, every level with its own points, the colour follows the points', () => {
  const scale = type => scaleOf({type}).map(r => [r, RATINGS[r].score]);
  assert.deepEqual(scale('Nassfutter'), [
    ['top', 100],
    ['gut', 80],
    ['mittel', 50],
    ['eager', 40],
    ['sosse', 30],
    ['schlecht', 0],
  ]);
  assert.deepEqual(scale('Trockenfutter'), [
    ['gern', 100],
    ['normal', 80],
    ['wenig', 35],
    ['liegen', 0],
  ]);
  assert.deepEqual(scale('Snack'), [
    ['verputzt', 100],
    ['spaeter', 70],
    ['angeknabbert', 35],
    ['unberuehrt', 0],
  ]);
  assert.deepEqual(
    [scaleOf({type: 'Sonstiges'}), scaleOf({}), scaleOf(null)],
    [SCALES.bite, SCALES.portion, SCALES.portion],
  );
  assert.deepEqual(Object.values(SCALES).flat().sort(), Object.keys(RATINGS).sort()); // every level belongs to exactly one scale
  assert.deepEqual(['gut', 'spaeter', 'mittel', 'eager', 'wenig', 'sosse', 'liegen'].map(rateCls), [
    'r-good',
    'r-good',
    'r-mid',
    'r-sauce',
    'r-sauce',
    'r-sauce',
    'r-bad',
  ]);
});

test('mixed scales: verdicts and appetite work in points alone, the key counts and not the current type', () => {
  const db = household(
    ['A'],
    [
      {id: 'trocken', type: 'Trockenfutter'},
      {id: 'snack', type: 'Snack'},
      {id: 'gewechselt', type: 'Trockenfutter'},
    ],
    [
      ...rate('trocken', 'A', ['gern', 'normal', 'wenig'], 40),
      ...rate('snack', 'A', ['unberuehrt', 'spaeter'], 40),
      ...rate('gewechselt', 'A', [T, 'normal', S], 40),
    ],
  );
  assert.deepEqual(
    sorts(model(db), e => [e.pct, e.verdict]),
    {
      trocken: [72, 'nachkaufen'],
      gewechselt: [70, 'nachkaufen'],
      snack: [35, 'neu'],
    },
  );
  assert.deepEqual(model(db).byId.get('gewechselt').counts, {
    top: 1,
    normal: 1,
    sosse: 1,
  });
  const usual = daily('A', Array(8).fill(['trocken', 'normal']), 4),
    low = daily(
      'A',
      [
        ['trocken', 'wenig'],
        ['snack', 'angeknabbert'],
        ['p', M],
      ],
      0.4,
      0.8,
    );
  assert.deepEqual(appetite([...usual, ...low]), [['appetit:A:2026-06-03', 3, 40, 80]]);
});

test('verdicts count ratings: buy again from 3 with two thirds good, stop buying from 2 with more than half left', () => {
  const cases = {
    zwei: [T, T],
    drei: [T, T, T],
    zweiDrittel: [G, G, X],
    halb: [G, M, M, G],
    knapp: [T, M, M],
    eins: [X],
    halbLiegen: [M, X],
    nein2: [S, X],
    dreiViertel: [T, S, S, X],
    nein3: [M, S, S],
  };
  const db = household(
    ['A'],
    Object.keys(cases),
    Object.entries(cases).flatMap(([id, rs]) => rate(id, 'A', rs)),
  );
  assert.deepEqual(
    sorts(model(db), e => e.verdict),
    {
      zwei: 'neu',
      drei: 'nachkaufen',
      zweiDrittel: 'nachkaufen',
      halb: 'geht',
      knapp: 'geht',
      eins: 'neu',
      halbLiegen: 'neu',
      nein2: 'nicht',
      dreiViertel: 'nicht',
      nein3: 'nicht',
    },
  );
});

test('the verdict rests on the newest eight ratings of the last 180 days, the score still weighs every rating', () => {
  const stat = (meals, prefs) => {
    const e = model(household(['A', 'B'], ['p'], meals), prefs).byId.get('p');
    return [e.n, e.verdict];
  };
  assert.deepEqual(
    stat([...rate('p', 'A', [T, T, T], 200), ...rate('p', 'A', [X, X, X], 2)]),
    [3, 'nicht'],
    'three good ones 200 days ago and three left this week: only this week counts',
  );
  const year = daily('A', Array(10).fill(['p', T]), 40, 30); // ten good ones, one a month
  assert.deepEqual(
    stat([...year, ...daily('A', Array(5).fill(['p', X]), 1)]),
    [8, 'nicht'],
    'ten good over the year, then five left in a row: five of the newest eight',
  );
  assert.deepEqual(
    stat([...year, ...daily('A', Array(2).fill(['p', X]), 1)]),
    [7, 'nachkaufen'],
    'ten good and two left: two of the seven within the window',
  );
  assert.deepEqual(
    stat(rate('p', 'A', [T, T, T, T], 181)),
    [0, 'neu'],
    'ratings older than 180 days alone: too few again',
  );
  const old = model(household(['A'], ['p'], rate('p', 'A', [T, T, T, T], 181))).byId.get('p');
  assert.ok(
    old.score > 0 && old.total === 4 && old.house.n === 0,
    'the score and the total still hold the old ratings',
  );
  // The household: each pet its own window, the household's counts their sum
  const house = household(
    ['A', 'B'],
    ['p'],
    [
      ...daily('A', Array(9).fill(['p', T]), 1),
      ...daily('B', [...Array(8).fill(['p', X]), ...Array(4).fill(['p', T])], 1),
    ],
  );
  const both = model(house),
    e = both.byId.get('p');
  assert.deepEqual(
    [e.pets.A.n, e.pets.A.verdict, e.pets.B.n, e.pets.B.verdict, e.house.n, e.house.counts, e.verdict, e.total],
    [8, 'nachkaufen', 8, 'nicht', 16, {top: 8, schlecht: 8}, 'gemischt', 21],
  );
  assert.deepEqual(
    [ratingsIn(both, ['p']).keys.length, ratingsIn(both, ['p']).more, ratingsIn(model(house, {activePet: 'B'}), ['p'])],
    [16, true, {keys: Array(8).fill(X), more: true}],
    'a strip shows the windows, and says that older ratings lie beyond',
  );
});

test('the weight halves every 90 days', () => {
  const db = household(
    ['A'],
    ['alt', 'halb'],
    [...rate('alt', 'A', [X], 180), ...rate('alt', 'A', [T]), ...rate('halb', 'A', [T], 90), ...rate('halb', 'A', [X])],
  );
  assert.deepEqual(
    sorts(model(db), e => e.pct),
    {alt: 80, halb: 33},
  );
});

test('the score does not depend on when it is computed, as long as no rating is added', () => {
  const db = household(['A'], ['p'], [...rate('p', 'A', [X], 200), ...rate('p', 'A', [T, G], 20)]);
  assert.equal(
    model(db, {}, NOW + 400 * DAY)
      .byId.get('p')
      .score.toFixed(6),
    model(db).byId.get('p').score.toFixed(6),
  );
});

test('only meals up to now count', () => {
  const db = household(['A'], ['p'], [...rate('p', 'A', [X, X], 5), ...rate('p', 'A', [T, T, T], -3)]);
  const e = t => {
    const x = model(db, {}, t).byId.get('p');
    return [x.n, x.verdict];
  };
  assert.deepEqual(
    [e(NOW), e(NOW + 6 * DAY)],
    [
      [2, 'nicht'],
      [5, 'geht'],
    ],
  );
});

test('household, mixed verdict, the manual setting and the pet filter', () => {
  const db = household(
    ['Minka', 'Tiger'],
    ['gemischt', 'ja', 'nein', 'offen', {id: 'immer', kaufen: 'immer'}, {id: 'nie', kaufen: 'nicht'}],
    [
      ...rate('gemischt', 'Minka', [G, G, G]),
      ...rate('gemischt', 'Tiger', [X, X]),
      ...rate('ja', 'Minka', [G, G, G]),
      ...rate('ja', 'Tiger', [X]),
      ...rate('nein', 'Minka', [X, S]),
      ...rate('nein', 'Tiger', [G]),
      ...rate('offen', 'Minka', [G, G]),
      ...rate('immer', 'Minka', [X, X]),
      ...rate('nie', 'Tiger', [G, G, G]),
    ],
  );
  const m = model(db);
  assert.deepEqual(
    sorts(m, e => [e.house.verdict, e.yes, e.no]),
    {
      gemischt: ['gemischt', ['Minka'], ['Tiger']],
      ja: ['nachkaufen', ['Minka'], []],
      nein: ['nicht', [], ['Minka']],
      offen: ['neu', [], []],
      immer: ['nicht', [], ['Minka']],
      nie: ['nachkaufen', ['Tiger'], []],
    },
  );
  assert.deepEqual(
    [m.byId.get('immer').choice, m.byId.get('nie').choice, m.byId.get('gemischt').choice],
    ['nachkaufen', 'nicht', 'gemischt'],
  );
  assert.ok(!keys(m).some(k => /:(immer|nie)/.test(k)), 'Sorten mit eigener Einstellung bekommen keine Hinweise');
  const tiger = model(db, {activePet: 'Tiger'});
  assert.deepEqual([tiger.byId.get('gemischt').verdict, tiger.byId.get('gemischt').n, tiger.rated], ['nicht', 2, 7]);
});

test('hints by precedence, hidden per type and variety', () => {
  const db = household(
    ['A', 'B'],
    ['stop1', 'stop2', 'sauce', 'lieb1', 'lieb2', 'wenig', 'selten'],
    [
      ...rate('stop1', 'A', [X, X, X]),
      ...rate('stop2', 'A', [S, X]),
      ...rate('sauce', 'A', [G, G, G]),
      ...rate('sauce', 'B', [S, S, G]),
      ...rate('lieb1', 'A', [G, G, M]),
      ...rate('lieb2', 'A', [G, G, G]),
      ...rate('wenig', 'B', [S, S, G, G, M]),
      ...rate('selten', 'A', [S, S]),
    ],
  );
  assert.deepEqual(keys(model(db)), [
    'stop:stop1',
    'stop:stop2',
    'stop:selten',
    'sosse:sauce@B',
    'liebling:lieb2',
    'liebling:lieb1',
  ]);
  assert.deepEqual(keys(model(db, {hiddenHints: ['stop:stop1', 'liebling:lieb2']})), [
    'stop:stop2',
    'stop:selten',
    'sosse:sauce@B',
    'liebling:lieb1',
  ]);
  assert.equal(
    model(db).byId.get('sauce').verdict,
    'gemischt',
    'A buys it again, B leaves it: no stop hint, the sauce one',
  );
});

test('feeding times: from 14 days, treats excluded, from 4 days on; reminder 45 minutes later, only when nothing has been served', () => {
  const day = (d, time) => `2026-06-${String(d).padStart(2, '0')}T${time}`,
    now = at(day(10, '12:00'));
  const meals = [
    ...[3, 4, 5, 6, 7, 8, 9].flatMap(d => [
      ['nass', {A: G}, day(d, d % 2 ? '07:10' : '07:40')],
      ['nass', {A: G}, day(d, '18:30')],
    ]),
    ...[7, 8, 9].map(d => ['nass', {A: G}, day(d, '12:30')]),
    ...[5, 6, 7, 8, 9].map(d => ['snack', {A: 'verputzt'}, day(d, '15:00')]),
    ['nass', {A: G}, day(10, '07:20')],
  ];
  const db = household(
    ['A'],
    [
      {id: 'nass', type: 'Nassfutter'},
      {id: 'snack', type: 'Snack'},
    ],
    meals,
  );
  const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  assert.deepEqual(
    feedSlots(db, now).map(x => [hhmm(x.from), hhmm(x.at), hhmm(x.remind)]),
    [
      ['07:10', '07:20', '08:05'],
      ['18:30', '18:30', '19:15'],
    ],
  );
  const due = (data, when) => feedReminders(data, when).map(x => [x.key, new Date(x.at).toLocaleString('sv')]);
  const days = (from, to) => Array.from({length: to - from + 1}, (_, i) => `2026-06-${from + i}`);
  assert.deepEqual(due(db, now), [
    ...days(11, 16).map(d => [`${d}|440`, `${d} 08:05:00`]),
    ...days(10, 16).map(d => [`${d}|1110`, `${d} 19:15:00`]),
  ]);
  const fed = household(['A'], db.products, [...meals, ['snack', {A: 'verputzt'}, day(10, '17:50')]]),
    fedMeal = household(['A'], db.products, [...meals, ['nass', {A: null}, day(10, '17:45')]]);
  assert.deepEqual(
    [due(fed, at(day(10, '18:00'))).length, due(fedMeal, at(day(10, '18:00'))).map(x => x[0])],
    [13, [...days(11, 16).map(d => `${d}|440`), ...days(11, 16).map(d => `${d}|1110`)]],
  );
  assert.deepEqual(feedSlots(household(['A'], ['nass'], meals.slice(0, 6)), now), []);
});

test('flavours: every group a name holds, matched at the start of a word, the general fish only without a particular one', () => {
  const cases = {
    'Seelachs in Soße': ['Fisch'],
    'Wildschwein mit Nachtkerzenöl': ['Wildschwein'],
    Hirschragout: ['Wild'],
    'Huhn & Thunfisch': ['Thunfisch', 'Huhn'],
    'Pferd mit Nachtkerzenöl': ['Pferd'],
    Rinderherz: ['Rind', 'Herz'],
    Elemente: [],
    Herzhaftes: [],
    'Lachs mit Fischöl': ['Lachs'],
    'Forelle & Lachs': ['Lachs', 'Fisch'],
    Hühnerleber: ['Huhn', 'Leber'],
  };
  for (const [text, want] of Object.entries(cases)) assert.deepEqual(flavoursOf(text), want, text);
});

/* Erkenntnisse as the page words them, strongest first: [kind, sentence, counts] without markup */
const learned = (db, prefs, now = NOW) =>
  insights(db, model(db, prefs, now), now).map(x => [
    x.kind,
    ...insightSaid(x)
      .slice(1)
      .map(t => t.replace(/<[^>]*>/g, '')),
  ]);
const learnedOf = (kind, db, prefs) =>
  learned(db, prefs)
    .filter(x => x[0] === kind)
    .map(x => x.slice(1));
const FOUR = [
  {id: 'a', brand: 'Sheba', variety: 'Lachs in Soße'},
  {id: 'b', brand: 'Sheba', variety: 'Huhn in Soße'},
  {id: 'c', brand: 'Felix', variety: 'Lachs in Gelee'},
  {id: 'd', brand: 'Felix', variety: 'Huhn in Gelee'},
];

test('Erkenntnisse by brand, animal and consistency: wet food, the best group against the weakest, two varieties rated twice a group', () => {
  const db = household(['A'], FOUR, [
    ...rate('a', 'A', [T, T]),
    ...rate('b', 'A', [T, G]),
    ...rate('c', 'A', [X, X]),
    ...rate('d', 'A', [S, X]),
  ]);
  assert.deepEqual(learned(db), [
    ['marke', 'Bisher kommt Sheba besser an als Felix.', 'Sheba 4 von 4 Mal gut gefressen, Felix 0 von 4 Mal.'],
    [
      'konsistenz',
      'Bisher kommt Stückchen in Soße besser an als Stückchen in Gelee.',
      'Stückchen in Soße 4 von 4 Mal gut gefressen, Stückchen in Gelee 0 von 4 Mal.',
    ],
  ]);
  assert.deepEqual(
    learned(household(['A'], [FOUR[0], FOUR[2]], [...rate('a', 'A', [T, T]), ...rate('c', 'A', [X, X])])),
    [],
    'one variety a group: that is a verdict, not an insight',
  );
  assert.deepEqual(
    learned(
      household(['A'], FOUR, [
        ...rate('a', 'A', [T]),
        ...rate('b', 'A', [T, G]),
        ...rate('c', 'A', [X, X]),
        ...rate('d', 'A', [S, X]),
      ]),
    ),
    [],
    'a variety rated once does not count, so every group it is in is too small',
  );
  const dry = FOUR.map(p => ({...p, type: 'Trockenfutter'}));
  assert.deepEqual(
    learned(
      household(['A'], dry, [
        ...rate('a', 'A', ['gern', 'gern']),
        ...rate('b', 'A', ['gern', 'gern']),
        ...rate('c', 'A', ['liegen', 'liegen']),
        ...rate('d', 'A', ['liegen', 'liegen']),
      ]),
    ),
    [],
    'dry food: no comparison',
  );
});

test('Erkenntnisse by animal: a variety naming two flavours counts in both groups', () => {
  const db = household(
    ['A'],
    [
      {id: 'a', variety: 'Huhn in Soße'},
      {id: 'b', variety: 'Thunfisch in Soße'},
      {id: 'ab', variety: 'Huhn & Thunfisch'},
    ],
    [...rate('a', 'A', [T, T]), ...rate('b', 'A', [X, X]), ...rate('ab', 'A', [T, X])],
  );
  assert.deepEqual(learnedOf('geschmack', db), [
    ['Bisher kommt Huhn besser an als Thunfisch.', 'Huhn 3 von 4 Mal gut gefressen, Thunfisch 1 von 4 Mal.'],
  ]);
});

test('Erkenntnisse by consistency: the texture field, the keywords only when it is missing', () => {
  const db = household(
    ['A'],
    [
      {id: 'n1', variety: 'Lachs in Soße', texture: 'gelee'},
      {id: 'n2', variety: 'Huhn in Gelee'},
      {id: 'n3', variety: 'Rind Pastete'},
      {id: 'n4', variety: 'Pute', texture: 'pastete'},
    ],
    [...rate('n1', 'A', [T, T]), ...rate('n2', 'A', [T, G]), ...rate('n3', 'A', [M, M]), ...rate('n4', 'A', [X, M])],
  );
  assert.deepEqual(learnedOf('konsistenz', db), [
    [
      'Bisher kommt Stückchen in Gelee besser an als Pastete.',
      'Stückchen in Gelee 4 von 4 Mal gut gefressen, Pastete 0 von 4 Mal.',
    ],
  ]);
});

test('Erkenntnisse on sauce: at least four in ten ratings of the varieties in sauce „Nur Soße“, from five ratings', () => {
  const sauce = meals =>
    learnedOf('sosse', household(['A'], ['x', ...FOUR, {id: 'p', variety: 'Rind Pastete'}], meals));
  const licked = [...rate('a', 'A', [S, S, T, T, T]), ...rate('b', 'A', [S, S, T, T, T])];
  assert.deepEqual(sauce(licked), [
    ['Bei Stückchen in Soße wird oft nur die Soße geleckt.', '4 von 10 Mal nur die Soße.'],
  ]);
  assert.deepEqual(
    sauce([...licked, ...rate('c', 'A', [T, T, X]), ...rate('d', 'A', [T, G]), ...rate('p', 'A', [X, X, X, X, T])]),
    [
      [
        'Bei Stückchen in Soße wird oft nur die Soße geleckt.',
        '4 von 10 Mal nur die Soße. Stückchen in Gelee dagegen 4 von 5 Mal gut gefressen.',
      ],
    ],
    'the texture that goes down well is named, not one that does not',
  );
  assert.deepEqual(sauce([...rate('a', 'A', [S, S, T]), ...rate('b', 'A', [S])]), [], 'four ratings are too few');
  assert.deepEqual(
    sauce([...rate('a', 'A', [S, T, T, T, T]), ...rate('b', 'A', [S, S, T, T, T]), ...rate('x', 'A', [S, S])]),
    [],
    'three in ten are not enough, and a variety not in sauce does not count',
  );
});

/* A pet's meals in the order they were served, the oldest first, one a day up to yesterday: [variety, rating] */
const inTurn = (pet, meals) => meals.map(([sort, r], i) => [sort, {[pet]: r}, meals.length - i]);
const SORTS = ['a', 'b', 'c', 'd', {id: 'snack', type: 'Snack'}];
// four times the same variety again right away, all left, against five after another one, all eaten well
const AGAIN = [
  ['a', T],
  ['a', X],
  ['b', T],
  ['b', X],
  ['c', T],
  ['c', X],
  ['d', T],
  ['d', X],
  ['a', T],
  ['b', T],
];

test('Erkenntnisse on serving the same twice: a meal of the variety the pet had just before against one of another', () => {
  const again = meals => learnedOf('wiederholung', household(['A'], SORTS, inTurn('A', meals)));
  assert.deepEqual(again(AGAIN), [
    [
      'Zweimal hintereinander dieselbe Sorte kommt schlechter an.',
      'Beim zweiten Mal 0 von 4 Mal gut gefressen, sonst 5 von 5 Mal.',
    ],
  ]);
  assert.deepEqual(again(AGAIN.slice(2)), [], 'three times again are too few');
  assert.deepEqual(
    again(AGAIN.map(([sort, r]) => [sort, r === T ? X : T])),
    [],
    'the same again going down better is no help when buying or feeding',
  );
  const around = [
    ['a', T],
    ['snack', 'verputzt'],
    ['a', X],
    [null, T],
    ['a', X],
  ];
  const db = household(['A'], SORTS, inTurn('A', [...around, ...AGAIN.slice(2)]));
  assert.deepEqual(
    insights(db, model(db), NOW)
      .filter(x => x.kind === 'wiederholung')
      .map(x => [x.a, x.b]),
    [
      [
        {n: 4, good: 0},
        {n: 6, good: 5},
      ],
    ],
    'a treat between two meals of the same variety leaves it a repeat, a meal of unknown food takes a place',
  );
});

/* First encounters: [variety, first rating, later ratings …] each, the first one the oldest, the later ones spread
   after it five days apart, all of it `start` days ago */
const met = (pet, list, start = 100) =>
  list.flatMap(([sort, ...rs], i) => rs.map((r, j) => [sort, {[pet]: r}, start - j * 5 - i]));
const NEW = ['s1', 's2', 's3', 's4', 's5', 's6', {id: 'snack', type: 'Snack'}];
const CURIOUS = [
  ['s1', T, X, X, X],
  ['s2', T, X, X],
  ['s3', T, T, X, X],
  ['s4', T, T, X],
  ['s5', T, T, T],
  ['s6', X, X, X, X],
];
const SLOW = [
  ['s1', X, T, T, T, T],
  ['s2', X, T, T, T],
  ['s3', X, T, T, X],
  ['s4', T, T, X, X],
  ['s5', X, T, T, X],
];

test('Erkenntnisse on new varieties: the first rating of each against the later ones, from five varieties served again', () => {
  const fresh = (meals, prefs, pets = ['A']) => learnedOf('neu', household(pets, NEW, meals), prefs);
  assert.deepEqual(fresh(met('A', CURIOUS)), [
    [
      'Neue Sorten kommen beim ersten Mal besser an als danach.',
      'Beim ersten Mal 5 von 6, danach 4 von 15 Mal gut gefressen.',
    ],
  ]);
  assert.deepEqual(
    fresh(met('A', SLOW, 400)),
    [
      [
        'Neue Sorten brauchen eine Weile, danach läuft es besser.',
        'Beim ersten Mal 1 von 5, danach 12 von 16 Mal gut gefressen.',
      ],
    ],
    'every rating counts, however old',
  );
  assert.deepEqual(fresh(met('A', SLOW.slice(0, 4))), [], 'four varieties are too few');
  assert.deepEqual(
    fresh(met('A', [...SLOW.slice(0, 4), ['s5', X], ['snack', 'unberuehrt', 'verputzt', 'verputzt']])),
    [],
    'a variety rated once and treats do not count',
  );
  const both = [...met('A', CURIOUS), ...met('B', SLOW, 300)];
  assert.deepEqual(
    [
      slowStarters(model(household(['A', 'B'], NEW, both))),
      slowStarters(model(household(['A', 'B'], NEW, both), {activePet: 'A'})),
    ],
    [['B'], []],
    'a pet that needs a while is told apart for a second try, in the filter',
  );
});

// meals at a time of day: [hour, rating] each on a day of its own, the oldest first
const atHours = (pet, list) =>
  list.map(([hour, r], i) => [
    i % 2 ? 'a' : 'b',
    {[pet]: r},
    `2026-05-${String(i + 1).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`,
  ]);

test('Erkenntnisse on the time of day: meals before 11 against those from 17, either way, exactly 0.3 apart is enough', () => {
  const daytime = (list, prefs, pets = ['A']) =>
    learnedOf('tageszeit', household(pets, ['a', 'b'], atHours('A', list)), prefs);
  const morning = r => [7, r],
    noon = r => [13, r],
    evening = r => [18, r];
  assert.deepEqual(daytime([...[T, T, T, T].map(morning), ...[T, X, X, X].map(evening), ...[X, X].map(noon)]), [
    ['Morgens wird besser gefressen als abends.', 'Morgens 4 von 4 Mal gut gefressen, abends 1 von 4 Mal.'],
  ]);
  assert.deepEqual(daytime([...[X, X, X, T].map(morning), ...[T, T, T, T].map(r => [17, r])]), [
    ['Abends wird besser gefressen als morgens.', 'Morgens 1 von 4 Mal gut gefressen, abends 4 von 4 Mal.'],
  ]);
  assert.deepEqual(
    daytime([...[T, T, T].map(r => [10, r]), ...[X, X, X, X].map(evening)]),
    [],
    'three in the morning are too few',
  );
  const ten = (good, r) => Array.from({length: 10}, (_, i) => [r, i < good ? T : X]);
  assert.deepEqual(daytime([...ten(7, 8), ...ten(4, 19)]).length, 1, '7 of 10 against 4 of 10: exactly 0.3');
  assert.deepEqual(daytime([...ten(7, 8), ...ten(5, 19)]), [], '7 of 10 against 5 of 10 are too close');
});

test('Erkenntnisse on treats: the meals up to three hours after one against all others, only where they go down worse', () => {
  const day = (d, time) => `2026-05-${String(d).padStart(2, '0')}T${time}`;
  const after = (d, r, gap = '16:00') => [
    ['snack', {A: 'verputzt'}, day(d, gap)],
    ['a', {A: r}, day(d, '18:00')],
  ];
  const plain = (d, r) => [['b', {A: r}, day(d, '18:00')]];
  const snacks = meals => learnedOf('snack', household(['A'], ['a', 'b', {id: 'snack', type: 'Snack'}], meals));
  const meals = [...[1, 2, 3, 4].flatMap(d => after(d, X)), ...[5, 6, 7, 8].flatMap(d => plain(d, T))];
  assert.deepEqual(snacks(meals), [
    [
      'Nach einem Snack bleibt beim nächsten Napf öfter etwas stehen.',
      'Nach Snacks 0 von 4 Mal gut gefressen, sonst 4 von 4 Mal.',
    ],
  ]);
  assert.deepEqual(
    snacks([...[1, 2, 3, 4].flatMap(d => after(d, X, '14:30')), ...[5, 6, 7, 8].flatMap(d => plain(d, T))]),
    [],
    'a treat three and a half hours before does not count',
  );
  assert.deepEqual(snacks(meals.slice(2)), [], 'three meals after a treat are too few');
  assert.deepEqual(
    snacks([...[1, 2, 3, 4].flatMap(d => after(d, T)), ...[5, 6, 7, 8].flatMap(d => plain(d, X))]),
    [],
    'meals after treats going down better is no help',
  );
});

test('Erkenntnisse on who serves: the same varieties as often from each person, the one the pets eat best with', () => {
  // ten days: the same two varieties from both, a with Anna eaten well, with Jonas left
  const days = (ra, rj, n = 10, sort = ['a', 'b']) =>
    Array.from({length: n}, (_, i) => [
      [sort[i % 2], {A: ra(i)}, i + 0.5, 'Anna'],
      [sort[i % 2], {A: rj(i)}, i + 0.6, 'Jonas'],
    ]).flat();
  const feeder = meals => learnedOf('feeder', household(['A'], ['a', 'b', {id: 's', type: 'Snack'}], meals));
  assert.deepEqual(
    feeder(
      days(
        () => T,
        i => (i % 3 ? X : T),
      ),
    ),
    [
      [
        'Bei Anna kommen dieselben Sorten besser an als bei Jonas.',
        'Bei Anna 10 von 10 Mal gut gefressen, bei Jonas 4 von 10 Mal.',
      ],
    ],
  );
  assert.deepEqual(
    feeder(
      days(
        () => T,
        () => X,
        3,
      ),
    ),
    [],
    'three meals each are too few',
  );
  assert.deepEqual(
    feeder([
      ...Array.from({length: 12}, (_, i) => ['a', {A: T}, i + 0.5, 'Anna']),
      ...Array.from({length: 12}, (_, i) => ['b', {A: X}, i + 0.6, 'Anna']),
      ...Array.from({length: 12}, (_, i) => ['a', {A: T}, i + 0.7, 'Jonas']),
      ...Array.from({length: 2}, (_, i) => ['b', {A: X}, i + 0.8, 'Jonas']),
    ]),
    [],
    'Jonas serving the liked one more often does not make him better',
  );
  assert.deepEqual(
    feeder(
      days(
        () => T,
        () => X,
      ).map(m => (m[3] === 'Jonas' ? [...m.slice(0, 3), ''] : m)),
    ),
    [],
    'one person only',
  );
  assert.deepEqual(
    feeder(
      days(
        () => 'verputzt',
        () => 'unberuehrt',
        10,
        ['s', 's'],
      ),
    ),
    [],
    'treats do not count',
  );
});

test('Erkenntnisse: the widest gap first, and only the pet in the filter', () => {
  const day = (d, hour) => `2026-05-${String(d).padStart(2, '0')}T${hour}:00`;
  const db = household(['A', 'B'], FOUR, [
    ...rate('a', 'A', [T, T]),
    ...rate('b', 'A', [T, X]),
    ...rate('c', 'A', [X, X]),
    ...rate('d', 'A', [X, T]),
    ...[1, 2, 3, 4].map(d => ['a', {B: T}, day(d, '07')]),
    ...[5, 6, 7, 8].map(d => ['c', {B: d === 5 ? T : X}, day(d, '19')]),
  ]);
  const kinds = prefs => learned(db, prefs).map(([kind]) => kind);
  assert.deepEqual(
    [kinds(), kinds({activePet: 'A'}), kinds({activePet: 'B'})],
    [['tageszeit', 'marke', 'konsistenz'], ['marke', 'konsistenz'], ['tageszeit']],
    'morning against evening before brand and consistency, further apart; each pet on its own',
  );
});

/* „Vorlieben“ */
const ids = list => list.map(e => (e.e || e).id);
const sides = (db, prefs, now = NOW) => {
  const r = ranking(model(db, prefs, now), now);
  return {
    top: ids(r.top),
    flop: ids(r.flop),
    mid: ids(r.mid),
    split: ids(r.split),
    thin: ids(r.thin),
    settled: r.settled,
  };
};

test('Vorlieben: the side comes from the verdict, treats and dry food are left out, nothing is in both lists or padded', () => {
  const db = household(
    ['A'],
    [
      'favourite',
      'fresh',
      'mostly',
      'half',
      'little',
      'left',
      'new',
      {id: 'snack', type: 'Snack'},
      {id: 'dry', type: 'Trockenfutter'},
      {id: 'other', type: 'Sonstiges'},
    ],
    [
      ...rate('favourite', 'A', [T, T, T, T, T, T, T, G], 10),
      ...rate('fresh', 'A', [T, T, T], 10),
      ...rate('mostly', 'A', [T, T, M, M, T], 10),
      ...rate('half', 'A', [T, T, M, M], 10),
      ...rate('little', 'A', [S, S, 'eager', 'eager'], 10),
      ...rate('left', 'A', [X, X], 10),
      ...rate('new', 'A', [T], 10),
      ...rate('snack', 'A', ['verputzt', 'verputzt', 'verputzt'], 10),
      ...rate('dry', 'A', ['gern', 'gern', 'gern'], 10),
      ...rate('other', 'A', ['verputzt', 'verputzt', 'spaeter'], 10),
    ],
  );
  assert.deepEqual(sides(db), {
    top: ['favourite', 'fresh', 'other', 'mostly'],
    flop: ['left', 'little'],
    mid: ['half'],
    split: [],
    thin: ['new'],
    settled: 7,
  });
});

test('Vorlieben: a side from a verdict, „Geht so“ by its majority and on average less than half eaten', () => {
  const side = (counts, verdict) =>
    sideOf({
      n: Object.values(counts).reduce((a, k) => a + k, 0),
      counts,
      verdict,
    });
  assert.deepEqual(
    [
      side({top: 2, schlecht: 1}, 'nachkaufen'),
      side({schlecht: 2}, 'nicht'),
      side({top: 3, mittel: 2}, 'geht'),
      side({top: 2, mittel: 2}, 'geht'),
      side({sosse: 2, eager: 2}, 'geht'),
      side({mittel: 3}, 'geht'),
      side({top: 1, sosse: 1, mittel: 1}, 'geht'),
      side({top: 4, schlecht: 4}, 'gemischt'),
      side({top: 1}, 'neu'),
      side({}, 'neu'),
    ],
    ['top', 'flop', 'top', 'mid', 'flop', 'mid', 'mid', 'split', 'thin', 'thin'],
    'three times half eaten is no flop, and neither is one good, one sauce, one half',
  );
});

test('Vorlieben: evidence beats luck, the verdict’s own first, and the worst flop first', () => {
  assert.deepEqual(
    [likingOf({n: 3, counts: {top: 3}}), likingOf({n: 8, counts: {top: 8}}), likingOf({n: 2, counts: {schlecht: 2}})],
    [80, 90, 25],
  );
  const db = household(
    ['A'],
    ['long', 'lucky', 'decent', 'awful', 'poor'],
    [
      ...rate('long', 'A', [T, T, T, T, T, T, T, G], 10),
      ...rate('lucky', 'A', [T, T, T], 10),
      ...rate('decent', 'A', [T, T, T, M, M], 10),
      ...rate('awful', 'A', [X, X, X, X, X, X], 10),
      ...rate('poor', 'A', [X, X], 10),
    ],
  );
  const r = sides(db);
  assert.deepEqual(
    [r.top, r.flop],
    [
      ['long', 'lucky', 'decent'],
      ['awful', 'poor'],
    ],
  );
  assert.deepEqual(
    [shopGroups(model(db)).nachkaufen.map(e => e.id), shopGroups(model(db)).nicht.map(e => e.id)],
    [
      ['long', 'lucky'],
      ['awful', 'poor'],
    ],
    '„Einkaufen“ in the same order, so the two never put varieties in a different order',
  );
});

test('Einkaufen: the verdict’s own before „Gemischt“ and a setting by hand, then by liking', () => {
  const db = household(
    ['Minka', 'Tiger'],
    ['split', 'both', {id: 'pinned', kaufen: 'immer'}],
    [
      ...rate('split', 'Minka', [T, T, T, T, T, T, T, T], 10),
      ...rate('split', 'Tiger', [X, X, X, X], 10),
      ...rate('both', 'Minka', [G, G, G], 10),
      ...rate('both', 'Tiger', [G, G, G], 10),
      ...rate('pinned', 'Minka', [T, T], 10),
    ],
  );
  assert.deepEqual(
    shopGroups(model(db)).nachkaufen.map(e => e.id),
    ['both', 'pinned', 'split'],
    'the top of the card comes first on „Einkaufen“ as well, though the others go down better',
  );
});

test('Vorlieben: the varieties rated at all, and whether all of their ratings lie beyond the window', () => {
  const r = list => {
    const x = ranking(model(household(['A'], ['p1', 'p2'], list)), NOW);
    return [x.rated, x.stale];
  };
  const old = rate('p1', 'A', [T, T, T], 200);
  assert.deepEqual(
    [r([]), r(old), r([...old, ...rate('p2', 'A', [T], 10)]), r([...old, ...rate('p2', 'A', [T, T, T], 10)])],
    [
      [0, false],
      [1, true],
      [2, false],
      [2, false],
    ],
  );
});

test('Vorlieben with two pets: „Gemischt“ stands apart, and a pet chosen decides on its own', () => {
  const db = household(
    ['Minka', 'Tiger'],
    ['both', 'split', 'minka'],
    [
      ...rate('both', 'Minka', [T, T, T], 10),
      ...rate('both', 'Tiger', [T, G, T], 10),
      ...rate('split', 'Minka', [T, T, T], 10),
      ...rate('split', 'Tiger', [X, X, X], 10),
      ...rate('minka', 'Minka', [X, X], 10),
    ],
  );
  assert.deepEqual(sides(db), {
    top: ['both'],
    flop: ['minka'],
    mid: [],
    split: ['split'],
    thin: [],
    settled: 3,
  });
  assert.deepEqual(sides(db, {activePet: 'Tiger'}), {
    top: ['both'],
    flop: ['split'],
    mid: [],
    split: [],
    thin: [],
    settled: 2,
  });
});

test('Vorlieben: flat where the varieties differ no more than chance would make them', () => {
  const flat = list => ranking(model(household(['A'], ['a', 'b', 'c', 'd'], list)), NOW).flat;
  const alike = ['a', 'b', 'c', 'd'].flatMap(id => rate(id, 'A', [T, M, T, M, T, M, T, M], 10)),
    apart = [
      ...rate('a', 'A', [T, T, T, T, T, T, T, T], 10),
      ...rate('b', 'A', [T, T, T, T, T, T, T, G], 10),
      ...rate('c', 'A', [X, X, X, X, X, X, S, S], 10),
      ...rate('d', 'A', [X, X, X, X, X, X, X, M], 10),
    ];
  assert.deepEqual([flat(alike), flat(apart), flat(alike.slice(0, 24))], [true, false, false]);
});

test('Vorlieben: varieties still tried, new within 60 days, mostly good so far, the closest to a verdict first', () => {
  const db = household(
    ['A'],
    ['one', 'two', 'left', 'old', {id: 'no', kaufen: 'nicht'}, 'settled'],
    [
      ...rate('one', 'A', [T], 5),
      ...rate('two', 'A', [T, G], 5),
      ...rate('left', 'A', [X], 5),
      ...rate('old', 'A', [T], 30),
      ...rate('old', 'A', [T], 90),
      ...rate('no', 'A', [T], 5),
      ...rate('settled', 'A', [T, T, T], 5),
    ],
  );
  const r = ranking(model(db), NOW);
  assert.deepEqual(
    r.trials.map(t => [t.e.id, t.need, t.pet]),
    [
      ['two', 1, 'A'],
      ['one', 2, 'A'],
    ],
  );
});

test('Wie läuft’s gerade: four weeks against the eight before, per pet, a clear change only beyond chance, and its cause', () => {
  const run = (recent, before, pets = ['A'], prefs = {}) => {
    const db = household(pets, ['p1', 'p2', 'p3', {id: 'snack', type: 'Snack'}], [...recent, ...before]);
    return trend(db, model(db, prefs), NOW).map(t => [t.pet, t.kind, t.dir, t.recent, t.before, t.cause, t.behind]);
  };
  const good = (sort, n, start, r = T) => daily('A', Array(n).fill([sort, r]), start);
  // the usual varieties go worse as well: the pet
  assert.deepEqual(
    run([...good('p1', 6, 1, X), ...good('p2', 6, 7, X)], [...good('p1', 6, 30), ...good('p2', 6, 40)]),
    [['A', 'deutlich', -1, {n: 12, good: 0}, {n: 12, good: 12}, 'tier', []]],
  );
  // the usual one holds and a new one stays in the bowl: the food, named
  assert.deepEqual(run([...good('p1', 6, 1), ...good('p3', 6, 7, X)], good('p1', 12, 30)), [
    ['A', 'deutlich', -1, {n: 12, good: 6}, {n: 12, good: 12}, 'futter', ['p3']],
  ]);
  // 11 of 23 against 20 of 30: under 20 points, so only „etwas“
  assert.deepEqual(
    run(
      [...good('p1', 11, 1), ...daily('A', Array(12).fill(['p2', M]), 1, 0.5)],
      [...good('p1', 20, 30, T), ...daily('A', Array(10).fill(['p2', M]), 31, 0.5)],
    ).map(t => t.slice(0, 3)),
    [['A', 'etwas', -1]],
  );
  // ten points or less is the same, and nine ratings on a side are too few; treats do not count
  assert.deepEqual(
    run([...good('p1', 10, 1), ...good('p2', 2, 11, M)], [...good('p1', 20, 30), ...good('p2', 4, 50, M)]).map(t =>
      t.slice(0, 2),
    ),
    [['A', 'gleich']],
  );
  assert.deepEqual(run([...good('p1', 9, 1), ...good('snack', 5, 10, 'verputzt')], good('p1', 12, 30)), []);
  // exactly ten points is no longer the same, whatever the counts
  const ten = (now, then) =>
    run(
      [...good('p1', now, 1), ...good('p2', 10 - now, 11, M)],
      [...good('p1', then, 30), ...good('p2', 10 - then, 40, M)],
    ).map(t => t.slice(0, 3))[0];
  assert.deepEqual(
    [ten(3, 2), ten(2, 1), ten(8, 7), ten(7, 8)],
    [
      ['A', 'etwas', 1],
      ['A', 'etwas', 1],
      ['A', 'etwas', 1],
      ['A', 'etwas', -1],
    ],
  );
  // with a pet chosen, only that pet
  const two = [...good('p1', 12, 1), ...daily('B', Array(12).fill(['p1', X]), 1)];
  const before = [...good('p1', 12, 30), ...daily('B', Array(12).fill(['p1', T]), 30)];
  assert.deepEqual(
    run(two, before, ['A', 'B']).map(t => t.slice(0, 2)),
    [
      ['A', 'gleich'],
      ['B', 'deutlich'],
    ],
  );
  assert.deepEqual(
    run(two, before, ['A', 'B'], {activePet: 'B'}).map(t => t.slice(0, 2)),
    [['B', 'deutlich']],
  );
});

test('moves: what changed its side within 30 days, a real move only with ratings before and since that differ', () => {
  const db = household(
    ['A'],
    ['cooled', 'warmed', 'new', 'once', 'steady'],
    [
      ...rate('cooled', 'A', [T, T, T], 40),
      ...rate('cooled', 'A', [S, S, S, M], 5),
      ...rate('warmed', 'A', [X, X, M], 40),
      ...rate('warmed', 'A', [T, T, T, T, T], 5),
      ...rate('new', 'A', [T, T, T], 5),
      ...rate('once', 'A', [T, T, M], 40),
      ...rate('once', 'A', [X], 5),
      ...rate('steady', 'A', [X, X, X], 40),
    ],
  );
  const m = model(db),
    r = ranking(m, NOW),
    x = moves(m, NOW, r);
  assert.deepEqual(
    [[...x.fresh].sort(), x.cooled.map(v => [v.id, v.before, v.since]), x.warmed.map(v => v.id)],
    [['new', 'warmed'], [['cooled', {n: 3, counts: {top: 3}}, {n: 4, counts: {sosse: 3, mittel: 1}}]], ['warmed']],
    'one rating since is no move, and what stood still is not new',
  );
  const young = household(['A'], ['new'], rate('new', 'A', [T, T, T], 5)),
    my = model(young);
  assert.deepEqual([...moves(my, NOW, ranking(my, NOW)).fresh], [], 'in a young diary nothing is marked new');
});

test('moves: the window and its 180 days are measured from the day the 30 days began', () => {
  const db = household(
    ['A'],
    ['far', 'near', 'b', 'c', 'd'],
    [
      ...rate('far', 'A', [T, T, T], 250),
      ...rate('far', 'A', [T, T, T], 10),
      ...rate('near', 'A', [T, T, T], 200),
      ...rate('near', 'A', [T, T, T], 10),
      ...['b', 'c', 'd'].flatMap(id => rate(id, 'A', [T, T, T], 60)),
    ],
  );
  const m = model(db);
  assert.deepEqual(
    [...moves(m, NOW, ranking(m, NOW)).fresh],
    ['far'],
    'thirty days ago the old ratings of „far“ already lay beyond the window, those of „near“ did not',
  );
});

test('nextUp: favourites gone for six weeks from their newest ratings however old, a second chance only where it pays', () => {
  const db = household(
    ['A', 'B'],
    ['gone', 'recent', {id: 'no', kaufen: 'nicht'}, 'split', 'first', {id: 'treat', type: 'Snack'}],
    [
      ...rate('gone', 'A', [T, T, T], 300),
      ...rate('recent', 'A', [T, T, T], 50),
      ...rate('recent', 'A', [T], 3),
      ...rate('no', 'A', [T, T, T], 100),
      ...rate('split', 'A', [T, T, T], 100),
      ...rate('split', 'B', [X, X], 100),
      ...rate('first', 'A', [X], 10),
      ...rate('treat', 'A', ['verputzt', 'verputzt', 'verputzt'], 100),
    ],
  );
  const m = model(db),
    r = ranking(m, NOW),
    last = new Map();
  for (const s of db.servings) if (!last.has(s.productId)) last.set(s.productId, s.servedAt);
  const next = slow => nextUp(m, NOW, r, last, slow);
  assert.deepEqual(
    next(['A']).missed.map(v => [v.id, v.n, v.counts]),
    [['gone', 3, {top: 3}]],
  );
  assert.deepEqual(next(['A']).retry, [{id: 'first', pet: 'A'}]);
  assert.deepEqual(next(['B']).retry, [], 'only where slowStarters() says the pet needs a while');

  const turned = household(
    ['A', 'B'],
    ['flop', 'mixed'],
    [
      ...rate('flop', 'A', [T, T, T, T, T, T], 250),
      ...rate('flop', 'A', [X, X], 50),
      ...rate('mixed', 'A', [T, T, T], 100),
      ...rate('mixed', 'B', [T, T, T, T, T, T], 250),
      ...rate('mixed', 'B', [X, X], 50),
    ],
  );
  const mt = model(turned),
    rt = ranking(mt, NOW),
    lt = new Map();
  for (const s of turned.servings) if (!lt.has(s.productId)) lt.set(s.productId, s.servedAt);
  assert.deepEqual(
    [ids(rt.flop), ids(rt.split), nextUp(mt, NOW, rt, lt, []).missed],
    [['flop'], ['mixed'], []],
    'a favourite once whose window says „Nicht mehr kaufen“ now, for all or for one pet, is not served again',
  );
});

test('basis: the ratings the evaluation rests on, since when, and the types left out that have ratings', () => {
  const db = household(
    ['A'],
    ['p1', {id: 'snack', type: 'Snack'}, {id: 'dry', type: 'Trockenfutter'}],
    [
      ...rate('p1', 'A', [T, G], 3),
      ...rate('p1', 'A', [M], 40),
      ...rate('p1', 'A', [T], 400),
      ...rate('snack', 'A', ['verputzt'], 2),
    ],
  );
  const m = model(db);
  assert.deepEqual(basis(m, ranking(m, NOW)), {
    n: 3,
    first: NOW - 40 * DAY,
    left: ['Snack'],
  });
  const thin = household(['A'], ['p1', 'p2'], [...rate('p1', 'A', [T, T, T], 3), ...rate('p2', 'A', [T], 1)]),
    mt = model(thin);
  assert.equal(basis(mt, ranking(mt, NOW)).n, 3, 'only what the lists rest on, not a variety still being tried');
});

const USUAL = daily('A', Array(8).fill(['p1', G]), 4),
  LOW = daily(
    'A',
    [
      ['p1', M],
      ['p2', S],
      ['p1', M],
    ],
    0.4,
    0.8,
  );
const appetite = (meals, prefs, pets = ['A'], now = NOW) =>
  model(household(pets, ['p1', 'p2', 'mies'], meals), prefs, now)
    .hints.filter(h => h.kind === 'appetit')
    .map(h => [hintKey(h), h.n, h.recent, h.usual]);

test('appetite: 72 hours against the 30 days before, taking precedence over everything else', () => {
  const m = model(
    household(
      ['A'],
      ['p1', 'p2', 'mies'],
      [
        ...USUAL,
        ...LOW,
        ...daily(
          'A',
          [
            ['mies', X],
            ['mies', X],
          ],
          40,
        ),
      ],
    ),
  );
  assert.deepEqual(keys(m), ['appetit:A:2026-06-03', 'stop:mies', 'liebling:p1']);
  assert.deepEqual(appetite([...USUAL, ...LOW]), [['appetit:A:2026-06-03', 3, 43, 80]]);
});

test('appetite at the thresholds', () => {
  const none = {
    'only 2 ratings in the window': [...USUAL, ...LOW.slice(0, 2)],
    'only 7 in the comparison': [...USUAL.slice(0, 7), ...LOW],
    'only one variety in the window': [
      ...USUAL,
      ...daily(
        'A',
        [
          ['p1', M],
          ['p1', S],
          ['p1', M],
        ],
        0.4,
        0.8,
      ),
    ],
    'third rating older than 72 hours': [
      ...USUAL.slice(0, 7),
      ...daily(
        'A',
        [
          ['p1', M],
          ['p2', S],
          ['p1', M],
        ],
        0.4,
        1.31,
      ),
    ],
    'only 29 points below': [
      ...daily(
        'A',
        [G, G, G, G, G, M, M, M].map(r => ['p1', r]),
        4,
      ),
      ...daily(
        'A',
        [
          ['p1', M],
          ['p2', S],
          ['p1', M],
          ['p2', S],
        ],
        0.4,
        0.6,
      ),
    ],
    'average not below 50': [
      ...daily('A', Array(8).fill(['p1', T]), 4),
      ...daily(
        'A',
        [
          ['p1', M],
          ['p2', M],
          ['p1', M],
        ],
        0.4,
        0.8,
      ),
    ],
    'comparison older than 30 days': [...daily('A', Array(8).fill(['p1', G]), 34), ...LOW],
  };
  for (const [name, meals] of Object.entries(none)) assert.deepEqual(appetite(meals), [], name);
  const edge = [
    ...daily(
      'A',
      [G, G, G, G, G, G, M, S].map(r => ['p1', r]),
      4,
    ),
    ...daily(
      'A',
      [
        ['p1', M],
        ['p2', S],
        ['p1', M],
        ['p2', S],
      ],
      0.4,
      0.6,
    ),
  ];
  assert.deepEqual(appetite(edge), [['appetit:A:2026-06-03', 4, 40, 70]], 'exactly 30 points below is enough');
});

test('appetite per pet, hidden until the next rating', () => {
  const two = [
    ...USUAL,
    ...LOW,
    ...daily('B', Array(8).fill(['p1', G]), 4),
    ...daily(
      'B',
      [
        ['p1', G],
        ['p2', T],
        ['p1', G],
      ],
      0.4,
      0.8,
    ),
  ];
  assert.deepEqual(
    ['all', 'A', 'B'].map(p => appetite(two, {activePet: p}, ['A', 'B']).length),
    [1, 1, 0],
  );
  const hidden = {hiddenHints: ['appetit:A:2026-06-03']};
  assert.deepEqual(appetite([...USUAL, ...LOW], hidden), []);
  const next = appetite([...USUAL, ...LOW, ['p2', {A: X}, -0.9]], hidden, ['A'], NOW + DAY);
  assert.equal(next[0][0], 'appetit:A:2026-06-04');
});

/* Observations: one meal a day at the same hour, so a stink five hours after one falls in that meal's day alone */
function noted(meals, notes) {
  const db = household(['A', 'B'], ['lachs', 'huhn', 'rind'], meals);
  db.observations = notes
    .map(([kind, daysAgo, pets, hours = 5], i) => ({
      id: 'obs' + i,
      kind,
      at: NOW - daysAgo * DAY + hours * 36e5,
      pets: Object.fromEntries(pets.map(p => [p, true])),
    }))
    .sort((a, b) => b.at - a.at);
  return db;
}
const LACHS_DAYS = [2, 6, 10, 14, 18, 22];
const OBS_MEALS = Array.from({length: 26}, (_, i) => i + 1).map(d => [
  LACHS_DAYS.includes(d) ? 'lachs' : d % 2 ? 'huhn' : 'rind',
  {A: G},
  d,
]);

test('observations: how often each kind was noted, and a variety a kind about meals came after clearly more often', () => {
  const db = noted(OBS_MEALS, [
    ...[2, 6, 10, 14].map(d => ['stink', d, ['A']]),
    ['stink', 3, ['A']],
    ['tired', 3, ['A'], 2],
    ['tired', 40, ['A']],
  ]);
  const o = observed(db, ['A'], NOW);
  assert.deepEqual(
    o.kinds.map(k => [k.kind, k.n, k.before]),
    [
      ['stink', 5, 0],
      ['tired', 1, 1],
    ],
  );
  assert.equal(o.kinds[0].last, NOW - 2 * DAY + 5 * 36e5);
  assert.deepEqual(o.links, [{kind: 'stink', id: 'lachs', after: {n: 6, hit: 4}, other: {n: 20, hit: 1}}]);
  assert.deepEqual(observedAfter(db, ['A'], NOW, 'lachs'), [{kind: 'stink', n: 6, hit: 4}]);
  assert.deepEqual(observedAfter(db, ['A'], NOW, 'huhn'), [{kind: 'stink', n: 13, hit: 1}]);
  assert.deepEqual(
    mealsBefore(
      db,
      db.observations.find(x => x.kind === 'stink'),
    ).map(s => s.productId),
    ['lachs'],
    'a stink is weighed against the meals of its pets within a day before it',
  );
  assert.deepEqual(
    mealsBefore(
      db,
      db.observations.find(x => x.kind === 'tired'),
    ),
    [],
    'a tired day against none',
  );
  // the ratings stay what they are
  assert.deepEqual(
    sorts(model(db), e => e.verdict),
    sorts(model({...db, observations: []}), e => e.verdict),
  );
});

test('observations: only what the data carry, within the pets asked for', () => {
  const stinks = days => days.map(d => ['stink', d, ['A']]);
  const links = (notes, meals = OBS_MEALS, pets = ['A']) =>
    observed(noted(meals, notes), pets, NOW).links.map(l => l.id);
  assert.deepEqual(links(stinks([2, 6, 10, 14])), ['lachs']);
  assert.deepEqual(links(stinks([2])), [], 'a single stink after it is chance');
  assert.deepEqual(links(stinks([2, 6, 3, 5, 7, 9])), [], 'as often after the others: nothing stands out');
  const few = OBS_MEALS.filter(([sort, , d]) => sort !== 'lachs' || d < 10);
  assert.deepEqual(links(stinks([2, 6]), few), [], 'two of only two meals of it: too few meals');
  assert.deepEqual(links(stinks([2, 6, 10, 14]), OBS_MEALS, ['B']), [], 'another pet: its meals and notes alone');
  assert.deepEqual(
    links([2, 6, 10, 14].map(d => ['stink', d, ['A', 'B']])),
    ['lachs'],
    'not clear which of two it was: it counts for both',
  );
  assert.ok(
    !links(stinks([2, 6, 10, 14]).map(([k, d, p]) => [k, d, p, 30])).includes('lachs'),
    'more than a day after it: not about that meal, but the next one',
  );
  assert.deepEqual(
    [5, 8].map(hours => links([2, 6, 10, 14].map(d => ['vomit', d, ['A'], hours]))),
    [['lachs'], []],
    'what comes back up counts within hours of the meal only',
  );
  assert.deepEqual(
    observed({...noted(OBS_MEALS, []), observations: undefined}, ['A'], NOW),
    {kinds: [], links: []},
    'data from before observations',
  );
});

test('appetite: what was noted about the pet in the same hours comes with the hint', () => {
  const db = household(['A'], ['p1', 'p2', 'mies'], [...USUAL, ...LOW]);
  db.observations = [
    {id: 'o1', kind: 'tired', at: NOW - 36e5, pets: {A: true}},
    {id: 'o2', kind: 'stink', at: NOW - 10 * DAY, pets: {A: true}},
  ];
  assert.deepEqual(model(db).hints[0].seen, ['tired']);
});

test('reminder buttons: the best and the worst level of each scale and one between, so any meal can be rated there', () => {
  for (const type of ['Nassfutter', 'Trockenfutter', 'Snack', undefined]) {
    const [best, between, worst] = quickOf({type}).map(r => scaleOf({type}).indexOf(r));
    assert.ok(best === 0 && between > 0 && worst > between && worst === scaleOf({type}).length - 1, type);
    assert.ok(RATINGS[scaleOf({type})[between]].score < GOOD, type);
  }
});
