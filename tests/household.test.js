// A real household's first three weeks (tests/fixtures/household/mau.json, names changed), replayed every three
// hours as the data stood then: what the evaluation says has to hold up against what happened at the bowl.
// Usage: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyze, insights, ranking, taste} from '../app/www/js/smart.js';

const diary = JSON.parse(readFileSync(new URL('./fixtures/household/mau.json', import.meta.url), 'utf8'));
const END = Math.max(...diary.servings.map(s => s.servedAt)) + 36e5;
const named = variety => diary.products.find(p => p.variety === variety).id;
const type = id => diary.products.find(p => p.id === id).type;

// the meals served by then, rated only once the rating was given
function asOf(t) {
  const servings = diary.servings
    .filter(s => s.servedAt <= t)
    .map(s => ({
      ...s,
      pets: Object.fromEntries(Object.entries(s.pets).map(([k, x]) => [k, x.at <= t ? x : {r: null}])),
    }))
    .sort((a, b) => b.servedAt - a.servedAt);
  return {
    version: 3,
    pets: diary.pets,
    products: diary.products.filter(p => p.createdAt <= t),
    servings,
    observations: diary.observations.filter(o => o.at <= t).sort((a, b) => b.at - a.at),
  };
}
const said = [];
for (let t = diary.servings[0].servedAt; t <= END; t += 3 * 36e5) {
  const db = asOf(t),
    m = analyze(db, {activePet: 'all', hiddenHints: []}, t);
  said.push({t, db, m, insights: insights(db, m, t)});
}
const last = said.at(-1);

test('four days of food in sauce she leaves are the food, not the cat: never an appetite alarm', () => {
  assert.deepEqual(
    said.filter(x => x.m.hints.some(h => h.kind === 'appetit')).map(x => new Date(x.t).toISOString()),
    [],
  );
});

test('the treats she always eats up are never put forward to buy again', () => {
  assert.ok(said.every(x => x.m.hints.every(h => h.kind !== 'liebling' || type(h.id) !== 'Snack')));
});

test('food in sauce goes down worse, and no flavour takes the blame for it', () => {
  const sauce = last.insights.find(x => x.kind === 'konsistenz');
  assert.ok(sauce?.a.key === 'sosse' && sauce.gap < 0, JSON.stringify(last.insights.map(x => x.kind)));
  assert.ok(said.every(x => x.insights.every(y => y.kind !== 'geschmack')));
});

test('what she eats and what she leaves, by variety and by brand', () => {
  const r = ranking(last.m, END),
    ids = list => list.map(e => e.id);
  assert.ok(ids(r.top).includes(named('Lamm mit Nachtkerzenöl')));
  for (const left of ['Huhn & Lachs in Sauce', 'Thunfisch & Huhn in Sauce'])
    assert.ok(ids(r.flop).includes(named(left)) && last.m.byId.get(named(left)).verdict === 'nicht', left);
  assert.deepEqual(
    taste(last.m).marke.map(x => x.key),
    ['Catz Finefood', 'Bozita', 'Miamor'],
  );
});
