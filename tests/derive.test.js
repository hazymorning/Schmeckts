// The shopping list to share (js/derive.js), from the store in memory. Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';

// The store asks the page for Capacitor and for localStorage as it loads; Node has neither, as a plain browser tab
// without storage has not, so it keeps everything in memory
globalThis.window = globalThis;
const {prefs, replaceDb} = await import('../app/www/js/store.js');
const derive = await import('../app/www/js/derive.js');
const {shoppingList} = derive;

const DAY = 864e5;
/* meals: [variety, {pet: rating}], one a day up to yesterday, newest first as the app keeps them */
function household(products, meals) {
  const now = Date.now();
  replaceDb({
    version: 3,
    pets: [
      {id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1},
      {id: 'tiger00001', name: 'Tiger', species: 'Katze', createdAt: 2},
    ],
    products: products.map(([id, brand, variety, type, kaufen]) => ({
      id,
      brand,
      variety,
      type,
      codes: {},
      createdAt: 1,
      ...(kaufen ? {kaufen} : {}),
    })),
    servings: meals.map(([productId, rated], i) => ({
      id: 'meal' + String(i).padStart(6, '0'),
      productId,
      servedAt: now - (i + 1) * DAY,
      note: '',
      pets: Object.fromEntries(Object.entries(rated).map(([pet, r]) => [pet + '00001', {r, at: now}])),
    })),
  });
}
const listFor = pet => {
  prefs.activePet = pet;
  return shoppingList();
};

test('the shopping list: only what to buy again, one block per food type, the best first', () => {
  household(
    [
      ['lachs', 'Sheba', 'Lachs in Soße', 'Nassfutter'],
      ['huhn', 'Felix', 'Huhn in Gelee', 'Nassfutter'],
      ['rind', 'Gourmet', 'Rind Pastete', 'Nassfutter'],
      ['trocken', 'Josera', 'Huhn', 'Trockenfutter'],
      ['kaese', 'Dreamies', 'Käse', 'Snack', 'immer'],
      ['stick', 'Vitakraft', 'Stick', 'Snack', 'nicht'],
      ['neu', 'Animonda', 'Pute', 'Nassfutter'],
    ],
    [
      ...['top', 'top', 'top'].map(r => ['lachs', {minka: r}]),
      ...['gut', 'gut', 'gut'].map(r => ['huhn', {minka: r, tiger: 'schlecht'}]),
      ...['schlecht', 'schlecht'].map(r => ['rind', {tiger: r}]),
      ...['gern', 'gern', 'normal'].map(r => ['trocken', {minka: r}]),
      ...['verputzt', 'verputzt', 'verputzt'].map(r => ['stick', {tiger: r}]),
      ['neu', {minka: 'top'}],
    ],
  );
  assert.deepEqual(listFor('all'), {
    title: 'Einkaufen für Minka und Tiger',
    text: [
      'Einkaufen für Minka und Tiger',
      'Nassfutter\n- Sheba Lachs in Soße\n- Felix Huhn in Gelee (nur für Minka)',
      'Trockenfutter\n- Josera Huhn',
      'Snack\n- Dreamies Käse',
    ].join('\n\n'),
  });
  assert.ok(
    !/Nicht|Rind|Stick|Pute/.test(listFor('all').text),
    'nothing that is not to be bought, and no block for it',
  );
  assert.equal(
    listFor('minka00001').text,
    'Einkaufen für Minka\n\nNassfutter\n- Sheba Lachs in Soße\n- Felix Huhn in Gelee\n\nTrockenfutter\n- Josera Huhn\n\nSnack\n- Dreamies Käse',
    'with a pet chosen, its own verdicts: Huhn is simply to be bought again',
  );
  assert.equal(
    listFor('tiger00001').text,
    'Einkaufen für Tiger\n\nSnack\n- Dreamies Käse',
    'what was set by hand holds for every pet, and a type with nothing to buy has no block',
  );
});

test('the shopping list with nothing to buy yet: the title alone', () => {
  household([['lachs', 'Sheba', 'Lachs in Soße', 'Nassfutter']], [['lachs', {minka: 'top'}]]);
  assert.deepEqual(listFor('all'), {title: 'Einkaufen für Minka und Tiger', text: 'Einkaufen für Minka und Tiger'});
});

test('nicknames: a pet on its own goes by each of its names in turn, the same in one place all day', () => {
  const {calledNames, callName, namesOf} = derive;
  replaceDb({
    version: 3,
    pets: [
      {
        id: 'minka00001',
        name: 'Minka',
        nicknames: ['Mimi', 'Schnurrli', 'Minka', 7, ''],
        species: 'Katze',
        createdAt: 1,
      },
      {id: 'tiger00001', name: 'Tiger', nicknames: 'Tigi', species: 'Katze', createdAt: 2},
    ],
    products: [],
    servings: [],
  });
  assert.deepEqual(namesOf(derive.getPet('minka00001')), ['Minka', 'Mimi', 'Schnurrli'], 'each name once');
  assert.deepEqual(
    namesOf(derive.getPet('tiger00001')),
    ['Tiger'],
    'what another phone sent that is no list is left out',
  );
  const noon = new Date('2026-10-02T12:00').getTime(),
    week = Array.from({length: 7}, (_, i) => calledNames(['minka00001'], 'line', noon + i * DAY));
  assert.ok(
    ['Mimi', 'Schnurrli'].every(n => week.includes(n)) && week.includes('Minka'),
    `each name in a week ${week}`,
  );
  assert.equal(calledNames(['minka00001'], 'line', noon + 3 * 36e5), week[0], 'the same later that day');
  assert.equal(callName(derive.getPet('minka00001'), 'meal0001'), callName(derive.getPet('minka00001'), 'meal0001'));
  assert.equal(
    calledNames(['minka00001', 'tiger00001'], 'line', noon),
    'Minka und Tiger',
    'several by their own names',
  );
});
