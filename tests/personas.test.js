// Erkenntnisse and observations on simulated households: a cat that likes everything alike gets hardly any insight,
// a cat with a clear habit the one that names it; notes that come at random are hardly ever tied to a variety, a
// variety that upsets the stomach is. Seeded, so every run sees the same households. Usage: node --test tests/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze, insights, observed} from '../app/www/js/smart.js';

const DAY = 864e5,
  HOUR = 36e5,
  NOW = Date.UTC(2026, 9, 8, 20),
  HOUSES = 200,
  DAYS = 60;
const BRANDS = ['Sheba', 'Felix', 'Whiskas', 'Gourmet', 'Animonda'],
  FLAVOURS = ['Huhn', 'Rind', 'Lachs', 'Thunfisch', 'Pute'],
  TEXTURES = ['in Soße', 'in Gelee', 'Pastete'];

const random = seed => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
// good: the chance of „Alles“ or „Fast alles“; of the rest a share is „Nur Soße“
function rating(rnd, good, sauce) {
  if (rnd() < good) return rnd() < 0.6 ? 'top' : 'gut';
  return rnd() < sauce ? 'sosse' : ['mittel', 'eager', 'schlecht'][Math.floor(rnd() * 3)];
}
/* Two meals a day of ten wet varieties for DAYS days, now and then the same as the meal before, a treat on some
   days, two people feeding. habit gives the chance of a good rating and the sauce share for one meal. */
function household(seed, habit = {}) {
  const rnd = random(seed),
    good = habit.good || (() => 0.6),
    sauce = habit.sauce || (() => 0.25);
  const products = Array.from({length: 10}, (_, i) => ({
    id: 'p' + i,
    brand: BRANDS[Math.floor(rnd() * BRANDS.length)],
    variety: `${FLAVOURS[Math.floor(rnd() * FLAVOURS.length)]} ${TEXTURES[i % TEXTURES.length]}`,
    type: 'Nassfutter',
    codes: {},
    lastPets: [],
    createdAt: 1,
  }));
  products.push({
    id: 'snack',
    brand: 'Dreamies',
    variety: 'Käse',
    type: 'Snack',
    codes: {},
    lastPets: [],
    createdAt: 1,
  });
  const servings = [],
    seen = new Set();
  let before = null,
    snack = -Infinity;
  for (let d = DAYS; d >= 1; d--) {
    const day = NOW - d * DAY;
    if (rnd() < (habit.snacks ?? 0.3)) {
      snack = day - 6 * HOUR + Math.floor(rnd() * 8) * HOUR;
      servings.push({id: `x${d}`, productId: 'snack', servedAt: snack, by: 'Anna', pets: {cat: {r: 'verputzt'}}});
    }
    for (const [k, h] of [
      [0, -12.5],
      [1, -2],
    ]) {
      const t = day + h * HOUR,
        p = before && rnd() < 0.25 ? before : products[Math.floor(rnd() * 10)],
        meal = {
          p,
          again: before === p,
          first: !seen.has(p.id),
          morning: k === 0,
          afterSnack: t > snack && t - snack <= 3 * HOUR,
          by: rnd() < 0.5 ? 'Anna' : 'Jonas',
        };
      seen.add(p.id);
      const r = rating(rnd, good(meal), sauce(meal));
      servings.push({id: `s${d}${k}`, productId: p.id, servedAt: t, by: meal.by, pets: {cat: {r}}});
      before = p;
    }
  }
  servings.sort((a, b) => b.servedAt - a.servedAt);
  return {version: 3, pets: [{id: 'cat', name: 'Mau', createdAt: 1}], products, servings, observations: []};
}
// notes on random days and hours, as often as NOTES says per day; upset: vomiting after half the meals of p3
const NOTES = {happy: 2 / 7, stink: 1 / 7, hungry: 1 / 7, vomit: 1 / 14};
function noted(seed, upset = false) {
  const db = household(seed),
    rnd = random(seed + 1),
    note = (kind, at) => db.observations.push({id: 'o' + db.observations.length, kind, at, pets: {cat: true}});
  for (let d = DAYS; d >= 1; d--)
    for (const [kind, chance] of Object.entries(NOTES))
      if (rnd() < chance) note(kind, NOW - d * DAY + (8 + rnd() * 12) * HOUR);
  if (upset)
    for (const s of db.servings)
      if (s.productId === 'p3' && rnd() < 0.5) note('vomit', s.servedAt + (1 + rnd() * 4) * HOUR);
  db.observations.sort((a, b) => b.at - a.at);
  return db;
}
// per kind of insight, in how many of the households it shows
function shown(habit) {
  const out = {any: 0};
  for (let i = 1; i <= HOUSES; i++) {
    const db = household(i * 7919, habit),
      kinds = new Set(insights(db, analyze(db, {activePet: 'all', hiddenHints: []}, NOW), NOW).map(x => x.kind));
    if (kinds.size) out.any++;
    for (const k of kinds) out[k] = (out[k] || 0) + 1;
  }
  return out;
}
const share = (out, k) => (out[k] || 0) / HOUSES;

test('a cat that likes everything alike: after two months at most one household in sixteen sees an insight', () => {
  const out = shown();
  assert.ok(share(out, 'any') <= 1 / 16, JSON.stringify(out));
});

test('a cat with a clear habit: the insight that names it shows in most households after two months', () => {
  const habits = {
    konsistenz: {good: m => (m.p.variety.includes('Gelee') ? 0.85 : 0.45)},
    sosse: {
      sauce: m => (m.p.variety.includes('Soße') ? 0.8 : 0.15),
      good: m => (m.p.variety.includes('Soße') ? 0.35 : 0.65),
    },
    wiederholung: {good: m => (m.again ? 0.3 : 0.7)},
    neu: {good: m => (m.first ? 0.15 : 0.7)},
    tageszeit: {good: m => (m.morning ? 0.35 : 0.75)},
    snack: {good: m => (m.afterSnack ? 0.2 : 0.7), snacks: 0.6},
    feeder: {good: m => (m.by === 'Anna' ? 0.8 : 0.45)},
  };
  const least = {konsistenz: 0.55, feeder: 0.6};
  for (const [kind, habit] of Object.entries(habits)) {
    const out = shown(habit);
    assert.ok(share(out, kind) >= (least[kind] ?? 0.75), `${kind} ${JSON.stringify(out)}`);
  }
});

test('notes that come at random: after two months at most one household in ten sees one tied to a variety', () => {
  let tied = 0;
  for (let i = 1; i <= HOUSES; i++) if (observed(noted(i * 7919), ['cat'], NOW).links.length) tied++;
  assert.ok(tied / HOUSES <= 0.1, `${tied} of ${HOUSES}`);
});

test('a variety that upsets the stomach: after two months vomiting is tied to it in most households', () => {
  let found = 0;
  for (let i = 1; i <= HOUSES; i++) {
    const {links} = observed(noted(i * 7919, true), ['cat'], NOW);
    if (links.some(l => l.kind === 'vomit' && l.id === 'p3')) found++;
  }
  assert.ok(found / HOUSES >= 0.8, `${found} of ${HOUSES}`);
});
