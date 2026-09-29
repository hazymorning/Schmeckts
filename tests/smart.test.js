// The evaluation (js/smart.js) with made-up data. Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  changes,
  feedReminders,
  feedSlots,
  habits,
  hintKey,
  milestones,
  novelty,
  profile,
  rateCls,
  ratingsIn,
  report,
  variety,
} from '../app/www/js/smart.js';
import {flavoursOf, RATINGS, scaleOf, SCALES} from '../app/www/js/config.js';

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
    'r-mid',
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
    {trocken: [72, 'nachkaufen'], gewechselt: [70, 'nachkaufen'], snack: [35, 'neu']},
  );
  assert.deepEqual(model(db).byId.get('gewechselt').counts, {top: 1, normal: 1, sosse: 1});
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
  assert.deepEqual(due(db, now), [
    ['2026-06-11|440', '2026-06-11 08:05:00'],
    ['2026-06-12|440', '2026-06-12 08:05:00'],
    ['2026-06-10|1110', '2026-06-10 19:15:00'],
    ['2026-06-11|1110', '2026-06-11 19:15:00'],
    ['2026-06-12|1110', '2026-06-12 19:15:00'],
  ]);
  const fed = household(['A'], db.products, [...meals, ['snack', {A: 'verputzt'}, day(10, '17:50')]]),
    fedMeal = household(['A'], db.products, [...meals, ['nass', {A: null}, day(10, '17:45')]]);
  assert.deepEqual(
    [due(fed, at(day(10, '18:00'))).length, due(fedMeal, at(day(10, '18:00'))).map(x => x[0])],
    [5, ['2026-06-11|440', '2026-06-12|440', '2026-06-11|1110', '2026-06-12|1110']],
  );
  assert.deepEqual(feedSlots(household(['A'], ['nass'], meals.slice(0, 6)), now), []);
});

/* The profile as [dimension, type, [[group, good, of], …] best first, clear] */
const profiled = (db, prefs) =>
  profile(model(db, prefs)).map(d => [d.kind, d.type, d.groups.map(g => [g.key, g.good, g.n]), d.clear]);
const FOUR = [
  {id: 'a', brand: 'Sheba', variety: 'Lachs in Soße'},
  {id: 'b', brand: 'Sheba', variety: 'Huhn in Soße'},
  {id: 'c', brand: 'Felix', variety: 'Lachs in Gelee'},
  {id: 'd', brand: 'Felix', variety: 'Huhn in Gelee'},
];

test('profile: every dimension with two groups of two varieties rated twice, ranked, and clear where far apart', () => {
  const db = household(['A'], FOUR, [
    ...rate('a', 'A', [T, T]),
    ...rate('b', 'A', [T, G]),
    ...rate('c', 'A', [X, X]),
    ...rate('d', 'A', [S, X]),
  ]);
  assert.deepEqual(
    profiled(db),
    [
      [
        'konsistenz',
        'Nassfutter',
        [
          ['In Soße', 4, 4],
          ['In Gelee', 0, 4],
        ],
        true,
      ],
      [
        'geschmack',
        'Nassfutter',
        [
          ['Huhn', 2, 4],
          ['Lachs', 2, 4],
        ],
        false,
      ],
      [
        'marke',
        'Nassfutter',
        [
          ['Sheba', 4, 4],
          ['Felix', 0, 4],
        ],
        true,
      ],
    ],
    'a fixed order of dimensions, each shown on its own; level groups are not clear, and they rank by name',
  );
  assert.deepEqual(
    profiled(household(['A'], [FOUR[0], FOUR[2]], [...rate('a', 'A', [T, T]), ...rate('c', 'A', [X, X])])),
    [],
    'one variety a group: that is a verdict, not a profile',
  );
  assert.deepEqual(
    profiled(
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
  const carried = profiled(
    household(['A'], FOUR, [
      ...rate('a', 'A', [T, T, T, T]),
      ...rate('b', 'A', [X, X]),
      ...rate('c', 'A', [X, X]),
      ...rate('d', 'A', [G, X]),
    ]),
  )[0];
  assert.deepEqual(
    carried,
    [
      'konsistenz',
      'Nassfutter',
      [
        ['In Soße', 4, 6],
        ['In Gelee', 1, 4],
      ],
      false,
    ],
    'far enough apart on the whole, but a sauce variety left behind a jelly one: ranked, and not clear',
  );
});

test('profile: within one food type, with the pet filter, and every group’s ratings oldest first', () => {
  const sort = (id, brand, type) => ({id, brand, variety: 'Huhn', type});
  const dry = household(
    ['A', 'B'],
    [
      sort('t1', 'Felix', 'Trockenfutter'),
      sort('t2', 'Felix', 'Trockenfutter'),
      sort('t3', 'Josera', 'Trockenfutter'),
      sort('t4', 'Josera', 'Trockenfutter'),
      sort('n1', 'Sheba', 'Nassfutter'),
    ],
    [
      ['t1', {A: 'liegen'}, 9],
      ['t1', {A: 'wenig'}, 8],
      ['t2', {A: 'liegen'}, 7],
      ['t2', {A: 'normal'}, 6],
      ['t3', {A: 'gern', B: 'liegen'}, 5],
      ['t3', {A: 'gern', B: 'liegen'}, 4],
      ['t4', {A: 'normal', B: 'liegen'}, 3],
      ['t4', {A: 'gern', B: 'wenig'}, 2],
      ['n1', {A: 'top'}, 1],
      ['n1', {A: 'top'}, 1],
    ],
  );
  assert.deepEqual(profiled(dry, {activePet: 'A'}), [
    [
      'marke',
      'Trockenfutter',
      [
        ['Josera', 4, 4],
        ['Felix', 1, 4],
      ],
      true,
    ],
  ]);
  assert.deepEqual(
    profiled(dry),
    [
      [
        'marke',
        'Trockenfutter',
        [
          ['Josera', 4, 8],
          ['Felix', 1, 4],
        ],
        false,
      ],
    ],
    'the whole household: Tiger left Josera, so it is no longer clear; the wet food variety stands alone',
  );
  const minka = model(dry, {activePet: 'A'});
  assert.deepEqual(
    profile(minka)[0].groups.map(g => ratingsIn(minka, g.ids)),
    [
      {keys: ['gern', 'gern', 'normal', 'gern'], more: false},
      {keys: ['liegen', 'wenig', 'liegen', 'normal'], more: false},
    ],
    'the ratings of a group oldest first, only those within the filter',
  );
});

test('profile: comparisons within one food type only', () => {
  const sort = (id, brand, type) => ({id, brand, variety: 'Huhn', type});
  const mixed = household(
    ['A'],
    [
      sort('n1', 'Sheba', 'Nassfutter'),
      sort('n2', 'Sheba', 'Nassfutter'),
      sort('t1', 'Felix', 'Trockenfutter'),
      sort('t2', 'Felix', 'Trockenfutter'),
    ],
    [
      ...rate('n1', 'A', [T, T]),
      ...rate('n2', 'A', [T, T]),
      ...rate('t1', 'A', ['liegen', 'liegen']),
      ...rate('t2', 'A', ['liegen', 'liegen']),
    ],
  );
  assert.deepEqual(profiled(mixed), [], 'a brand of wet food and one of dry food are no comparison');
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

test('profile by flavour: a variety naming two flavours counts in both groups, and the comparison is never clear through it', () => {
  const db = household(
    ['A'],
    [
      {id: 'a', variety: 'Huhn in Soße'},
      {id: 'b', variety: 'Thunfisch in Soße'},
      {id: 'ab', variety: 'Huhn & Thunfisch'},
    ],
    [...rate('a', 'A', [T, T]), ...rate('b', 'A', [X, X]), ...rate('ab', 'A', [T, X])],
  );
  assert.deepEqual(
    profiled(db),
    [
      [
        'geschmack',
        'Nassfutter',
        [
          ['Huhn', 3, 4],
          ['Thunfisch', 1, 4],
        ],
        false,
      ],
    ],
    'the mixed variety makes both groups, and standing in both it keeps them from being clearly apart',
  );
});

test('profile by consistency: the texture field, the keywords only when it is missing, apart for wet food and treats', () => {
  const db = household(
    ['A'],
    [
      {id: 'n1', variety: 'Lachs in Soße', texture: 'gelee'},
      {id: 'n2', variety: 'Huhn in Gelee'},
      {id: 'n3', variety: 'Rind Pastete'},
      {id: 'n4', variety: 'Pute', texture: 'pastete'},
      {id: 's1', type: 'Snack', variety: 'Knusperkissen'},
      {id: 's2', type: 'Snack', variety: 'Knusprige Taler'},
      {id: 's3', type: 'Snack', variety: 'Happen', texture: 'creme'},
      {id: 's4', type: 'Snack', variety: 'Snack in Soße', texture: 'creme'},
    ],
    [
      ...rate('n1', 'A', [T, T]),
      ...rate('n2', 'A', [T, G]),
      ...rate('n3', 'A', [M, M]),
      ...rate('n4', 'A', [X, M]),
      ...rate('s1', 'A', ['unberuehrt', 'unberuehrt']),
      ...rate('s2', 'A', ['angeknabbert', 'unberuehrt']),
      ...rate('s3', 'A', ['verputzt', 'verputzt']),
      ...rate('s4', 'A', ['verputzt', 'spaeter']),
    ],
  );
  assert.deepEqual(
    profiled(db).filter(d => d[0] === 'konsistenz'),
    [
      [
        'konsistenz',
        'Nassfutter',
        [
          ['In Gelee', 4, 4],
          ['Pastete', 0, 4],
        ],
        true,
      ],
      [
        'konsistenz',
        'Snack',
        [
          ['Creme', 4, 4],
          ['Knusprig', 0, 4],
        ],
        true,
      ],
    ],
  );
});

test('habits: „nur die Soße“ and „erst gierig“ from two varieties where it happened at least half of the time', () => {
  const E = 'eager';
  const db = household(
    ['A'],
    ['a', 'b', 'c', 'd'],
    [...rate('a', 'A', [S, S, T]), ...rate('b', 'A', [S, G]), ...rate('c', 'A', [S]), ...rate('d', 'A', [E, E, T])],
  );
  assert.deepEqual(
    habits(model(db)),
    [
      {
        kind: 'sosse',
        sorts: [
          {id: 'a', k: 2, n: 3},
          {id: 'b', k: 1, n: 2},
        ],
      },
    ],
    'c rated once does not count; „erst gierig“ with one variety is no habit',
  );
  const both = household(['A'], ['a', 'b'], [...rate('a', 'A', [E, S]), ...rate('b', 'A', [S, E])]);
  assert.deepEqual(
    habits(model(both)).map(x => x.kind),
    ['sosse', 'eager'],
  );
});

/* A pet's meals in the order they were served, the oldest first, one a day up to yesterday: [variety, rating] */
const inTurn = (pet, meals) => meals.map(([sort, r], i) => [sort, {[pet]: r}, meals.length - i]);
const FOUR_SORTS = ['a', 'b', 'c', 'd', {id: 'snack', type: 'Snack'}];
const tried = (meals, prefs, pets = ['A']) =>
  variety(model(household(pets, FOUR_SORTS, meals), prefs)).map(v => [
    v.pet,
    v.kind,
    v.same.good,
    v.same.n,
    v.other.good,
    v.other.n,
  ]);
/* Four varieties taking turns, so that a meal has three other varieties before it, and a variety served again right
   away, which comes shortly after the same one: 15 meals after other varieties, 12 of them good, against 8 shortly
   after the same one, 3 of them good */
const LIKES = inTurn('A', [
  ['a', T],
  ['a', X],
  ['b', T],
  ['b', X],
  ['c', T],
  ['c', T],
  ['d', T],
  ['d', X],
  ['a', X],
  ['a', T],
  ['b', T],
  ['b', X],
  ['c', T],
  ['c', T],
  ['d', T],
  ['d', X],
  ['a', T],
  ['b', T],
  ['c', T],
  ['d', X],
  ['a', T],
  ['b', T],
  ['c', X],
]);
/* The other way round: 8 after other varieties, 2 of them good, against 8 shortly after the same one, 7 of them good */
const HABIT = inTurn('A', [
  ['a', X],
  ['a', T],
  ['b', X],
  ['b', T],
  ['c', X],
  ['c', T],
  ['d', T],
  ['d', T],
  ['a', X],
  ['a', T],
  ['b', T],
  ['b', T],
  ['c', X],
  ['c', X],
  ['d', X],
  ['d', T],
]);
/* Pairs of a meal after other varieties and the same variety served again right away, the varieties taking turns;
   then, with `rest`, meals of the varieties taking turns on, each after three others */
const turns = (same, other, rest = []) =>
  inTurn('A', [
    ...same.flatMap((r, i) => [
      ['abcd'[i % 4], other[i]],
      ['abcd'[i % 4], r],
    ]),
    ...rest.map((r, i) => ['abcd'[(same.length + i) % 4], r]),
  ]);

test('Abwechslung: shortly after the same variety against the rest, 25 points apart, either way', () => {
  assert.deepEqual(tried(LIKES), [['A', 'abwechslung', 3, 8, 12, 15]]);
  assert.deepEqual(tried(HABIT), [['A', 'gewohnheit', 7, 8, 2, 8]]);
});

test('Abwechslung: the same variety within the three meals before counts as shortly after it', () => {
  const repeats = meals => model(household(['A'], FOUR_SORTS, meals)).repeats.A;
  assert.deepEqual(
    repeats(
      inTurn('A', [
        ['a', T],
        ['b', T],
        ['a', X],
      ]),
    ),
    {same: {n: 1, good: 0}, other: {n: 2, good: 2}},
    'two meals later it counts',
  );
  assert.deepEqual(
    repeats(
      inTurn('A', [
        ['a', T],
        ['b', T],
        ['c', T],
        ['a', X],
      ]),
    ),
    {same: {n: 1, good: 0}, other: {n: 3, good: 3}},
    'three meals later as well',
  );
  assert.deepEqual(
    repeats(
      inTurn('A', [
        ['a', T],
        ['b', T],
        ['c', T],
        ['d', T],
        ['a', X],
      ]),
    ),
    {same: {n: 0, good: 0}, other: {n: 5, good: 4}},
    'four meals later it does not',
  );
  const around = inTurn('A', [
    ['a', T],
    ['snack', 'verputzt'],
    ['a', X],
    [null, T],
    ['b', T],
    ['c', T],
    ['a', T],
  ]);
  assert.deepEqual(
    repeats(around),
    {same: {n: 1, good: 0}, other: {n: 4, good: 4}},
    'a treat between two meals of the same variety leaves it a repeat, a meal of unknown food takes one of the three places before',
  );
});

test('Abwechslung: at least 6 ratings on either side, exactly 25 points is enough', () => {
  assert.deepEqual(
    tried(turns([X, X, X, X, X], [T, T, T, T, T])),
    [],
    'five meals shortly after the same variety are too few',
  );
  assert.deepEqual(
    tried(turns([T, T, T, X, X, X], [T, T, T, T, T, T])),
    [['A', 'abwechslung', 3, 6, 6, 6]],
    'six on either side are enough',
  );
  assert.deepEqual(
    tried(turns([T, T, T, X, X, X], [T, T, T, T, T, T], [X, X])),
    [['A', 'abwechslung', 3, 6, 6, 8]],
    '3 of 6 against 6 of 8: exactly 25 points',
  );
  assert.deepEqual(
    tried(turns([T, T, T, T, X, X], [T, T, T, T, T, T], [T, T, T, X])),
    [],
    '4 of 6 against 9 of 10: 23 points',
  );
});

test('Abwechslung: one per pet, and only the pet in the filter', () => {
  const both = [...LIKES, ...LIKES.map(([sort, {A: r}, when]) => [sort, {B: r === T ? X : T}, when + 0.5])];
  assert.deepEqual(tried(both, {}, ['A', 'B']), [
    ['A', 'abwechslung', 3, 8, 12, 15],
    ['B', 'gewohnheit', 5, 8, 3, 15],
  ]);
  assert.deepEqual(tried(both, {activePet: 'B'}, ['A', 'B']), [['B', 'gewohnheit', 5, 8, 3, 15]]);
});

/* First encounters: [variety, first rating, later ratings …] each, the first one the oldest, the later ones spread
   after it five days apart, all of it `start` days ago */
const met = (pet, list, start = 100) =>
  list.flatMap(([sort, ...rs], i) => rs.map((r, j) => [sort, {[pet]: r}, start - j * 5 - i]));
const novel = (meals, prefs, pets = ['A']) =>
  novelty(model(household(pets, ['s1', 's2', 's3', 's4', 's5', 's6', {id: 'snack', type: 'Snack'}], meals), prefs)).map(
    v => [v.pet, v.kind, v.first.good, v.first.n, v.later.good, v.later.n],
  );
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

test('Neuheit: new food goes down well at first and wears off, or needs a while, 30 points apart either way', () => {
  assert.deepEqual(novel(met('A', CURIOUS)), [['A', 'neugier', 5, 6, 4, 15]]);
  assert.deepEqual(novel(met('A', SLOW)), [['A', 'anlauf', 1, 5, 12, 16]]);
  assert.deepEqual(novel(met('A', SLOW, 400)), [['A', 'anlauf', 1, 5, 12, 16]], 'every rating counts, however old');
  assert.deepEqual(
    novel(met('A', [...SLOW, ['snack', 'unberuehrt', 'verputzt', 'verputzt', 'verputzt', 'verputzt']])),
    [['A', 'anlauf', 1, 5, 12, 16]],
    'treats do not count',
  );
});

test('Neuheit at the thresholds: four varieties, eight later ratings, exactly 30 points', () => {
  assert.deepEqual(novel(met('A', CURIOUS.slice(0, 3))), [], 'three varieties are too few');
  const seven = [
    ['s1', T, X, X],
    ['s2', T, X, X],
    ['s3', T, X, X],
    ['s4', T, X],
  ];
  assert.deepEqual(novel(met('A', seven)), [], 'seven later ratings are too few');
  assert.deepEqual(
    novel(met('A', [...seven.slice(0, 3), ['s4', T, X, X]])),
    [['A', 'neugier', 4, 4, 0, 8]],
    'eight are enough',
  );
  assert.deepEqual(
    novel(
      met('A', [
        ['s1', T, T, T, T],
        ['s2', T, T, T, X],
        ['s3', T, T, X],
        ['s4', T, T, X],
      ]),
    ),
    [['A', 'neugier', 4, 4, 7, 10]],
    'all four the first time against 7 of 10 later: exactly 30 points',
  );
  assert.deepEqual(
    novel(
      met('A', [
        ['s1', T, T, T, T, T],
        ['s2', T, T, T, T, X],
        ['s3', T, T, T, X],
        ['s4', T, T, X, X],
      ]),
    ),
    [],
    'against 10 of 14 later: 29 points',
  );
});

test('Neuheit: one line per pet in the filter, none for a pet with too few varieties', () => {
  const few = met('B', SLOW.slice(0, 3));
  assert.deepEqual(novel([...met('A', CURIOUS), ...few], {}, ['A', 'B']), [['A', 'neugier', 5, 6, 4, 15]]);
  const both = [...met('A', CURIOUS), ...met('B', SLOW)];
  assert.deepEqual(novel(both, {}, ['A', 'B']), [
    ['A', 'neugier', 5, 6, 4, 15],
    ['B', 'anlauf', 1, 5, 12, 16],
  ]);
  assert.deepEqual(novel(both, {activePet: 'B'}, ['A', 'B']), [['B', 'anlauf', 1, 5, 12, 16]]);
});

test('changes: the varieties whose verdict became „Nachkaufen“ or „Nicht mehr kaufen“ within the span', () => {
  const db = household(
    ['Minka', 'Tiger'],
    ['lachs', 'neu', 'rind', 'huhn', 'spaet', 'pute'],
    [
      ...rate('lachs', 'Minka', [T, T, T], 20),
      ...rate('neu', 'Minka', [G], 20),
      ...rate('neu', 'Minka', [T, T], 2),
      ...rate('rind', 'Minka', [X], 20),
      ...rate('rind', 'Minka', [X], 3),
      ...rate('huhn', 'Minka', [X, X], 20),
      ...rate('spaet', 'Minka', [T, T, T], -1),
      ...rate('pute', 'Tiger', [S, X], 4),
    ],
  );
  assert.deepEqual(
    changes(db, {activePet: 'all'}, NOW, 7),
    {nachkaufen: ['neu'], nicht: ['rind', 'pute']},
    'not what held before the span or is still to come, the clearest first',
  );
  assert.deepEqual(changes(db, {activePet: 'Tiger'}, NOW, 7), {nachkaufen: [], nicht: ['pute']});
  assert.deepEqual(
    changes(db, {activePet: 'all'}, NOW, 30),
    {nachkaufen: ['lachs', 'neu'], nicht: ['rind', 'huhn', 'pute']},
    'a longer span reaches further back',
  );
});

test('changes: the window and its 180 days are measured from the day the span began', () => {
  const db = household(
    ['A'],
    ['weit', 'nah'],
    [
      ...rate('weit', 'A', [T, T, T], 250),
      ...rate('weit', 'A', [T, T, T], 10),
      ...rate('nah', 'A', [T, T, T], 200),
      ...rate('nah', 'A', [T, T, T], 10),
    ],
  );
  assert.deepEqual(
    changes(db, {activePet: 'all'}, NOW, 30),
    {nachkaufen: ['weit'], nicht: []},
    'thirty days ago the old ratings of „weit“ already lay beyond the window, those of „nah“ did not',
  );
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

const WEEK = household(
  ['Minka', 'Tiger'],
  ['lachs', 'huhn', 'rind', 'neu'],
  [
    ['lachs', {Minka: T}, '2026-05-10T08:00', 'Anna'],
    ['lachs', {Minka: T}, '2026-05-11T08:00', 'Anna'],
    ['lachs', {Minka: T}, '2026-05-12T08:00', 'Anna'],
    ['neu', {Minka: G}, '2026-05-20T08:00', 'Anna'],
    ['huhn', {Minka: G}, '2026-05-24T23:59', 'Anna'],
    ['neu', {Minka: T}, '2026-05-25T00:00', 'Anna'],
    ['neu', {Minka: T}, '2026-05-26T08:00', 'Anna'],
    ['huhn', {Minka: G, Tiger: X}, '2026-05-27T08:00', 'Jonas'],
    ['huhn', {Minka: G, Tiger: X}, '2026-05-28T08:00', 'Jonas'],
    ['rind', {Minka: T}, '2026-05-29T08:00', ''],
    ['lachs', {Tiger: S}, '2026-05-29T18:00', 'Anna'],
    ['lachs', {Tiger: S}, '2026-05-30T18:00', null],
    [null, {Minka: null}, '2026-05-31T23:59', ' Jonas '],
    ['rind', {Minka: T}, '2026-06-01T00:00', 'Jonas'],
    ['rind', {Minka: T}, '2026-06-01T09:00', 'Jonas'],
  ],
);

test('evaluation: the same ratings and scores as the model, every meal in the filter, and the facts', () => {
  const products = [
    {id: 'p1', brand: 'Sheba'},
    {id: 'p2', brand: 'Felix'},
    {id: 'p3', brand: 'Gourmet'},
  ];
  const db = household(['A', 'B'], products, [
    ...rate('p1', 'A', [T, G, M], 40),
    ...rate('p2', 'A', [G, X], 20),
    ...rate('p3', 'B', [T, T, S], 5),
    ...rate('p1', 'B', [M, S], 2),
  ]);
  for (const activePet of ['all', 'A']) {
    const prefs = {activePet, hiddenHints: []},
      m = model(db, prefs),
      r = report(db, prefs);
    assert.equal(r.n, m.rated);
    assert.equal(r.pet, activePet === 'all' ? null : activePet);
    assert.deepEqual(
      r.meals,
      db.servings.filter(s => activePet === 'all' || s.pets[activePet]),
      'every meal in the filter, no span',
    );
    assert.equal(r.count.meals, r.meals.length);
    assert.equal(r.count.sorts, new Set(r.meals.map(s => s.productId)).size);
    assert.ok(r.count.days > 0 && r.count.days <= r.count.meals, 'days fed on, never more than the meals');
  }
});

test('evaluation: the meals not rated yet and who fed how often, within the span and the filter', () => {
  const now = at('2026-06-01T12:00'),
    r = report(WEEK, {activePet: 'all'}, now, 7);
  assert.deepEqual([r.count.meals, r.open, r.count.span], [9, 1, 7]);
  assert.deepEqual(
    r.feeders,
    [
      {name: 'Jonas', n: 5},
      {name: 'Anna', n: 2},
    ],
    'the most first, a name counted without its spaces, a meal nobody signed not at all',
  );
  const tiger = report(WEEK, {activePet: 'Tiger'}, now, 7);
  assert.deepEqual(
    [tiger.count.meals, tiger.open, tiger.feeders],
    [
      4,
      0,
      [
        {name: 'Jonas', n: 2},
        {name: 'Anna', n: 1},
      ],
    ],
    'with a pet chosen, only its meals',
  );
});

test('a span across the daylight saving change starts at midnight local time', () => {
  const db = household(
    ['A'],
    ['p1'],
    [
      ['p1', {A: T}, '2026-03-23T23:30'],
      ['p1', {A: T}, '2026-03-24T00:00'],
    ],
  );
  const r = report(db, {activePet: 'all'}, at('2026-03-30T12:00'), 7);
  assert.deepEqual([r.count.meals, r.count.days, r.count.span], [1, 1, 7]);
});

test('milestones: total meals and varieties tried', () => {
  const products = Array.from({length: 10}, (_, i) => 'p' + i);
  const db = household(['A'], products, [
    ...Array.from({length: 48}, (_, i) => ['p' + (i % 10), {A: null}, i]),
    [null, {A: null}, 1],
    ['weg', {A: null}, 1],
  ]);
  assert.deepEqual(milestones(db), {meals: 50, sorts: 10, reached: ['meals:50', 'sorts:10']});
  db.servings.pop();
  assert.deepEqual(milestones(db).reached, ['sorts:10']);
});
