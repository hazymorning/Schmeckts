// Read-only lookups and cached models over the data.
import {andList, norm} from './text.js';
import {dayKey} from './dates.js';
import {PENDING_WINDOW, TYPES, typeOf} from './config.js';
import {
  analyze,
  basis,
  insights,
  moves,
  nextUp,
  observed,
  ranking,
  shopGroups,
  slowStarters,
  tally,
  trend,
} from './smart.js';
import {db, prefs, revision, takeStale} from './store.js';

export const getPet = id => db.pets.find(p => p.id === id);
export const getProduct = id => (id ? db.products.find(p => p.id === id) : null);
export const getServing = id => db.servings.find(s => s.id === id);
export const getObservation = id => db.observations.find(o => o.id === id);
export const pname = p => (p ? p.variety || p.brand || 'Unbekannt' : 'Unbekannte Sorte');
export const inFilter = pid => prefs.activePet === 'all' || prefs.activePet === pid;
export const petMap = ids => Object.fromEntries(ids.map(id => [id, {r: null, at: null}]));
export const findProduct = (brand, variety) =>
  db.products.find(p => norm(p.brand) === norm(brand) && norm(p.variety) === norm(variety));
export const productsByCode = code => db.products.filter(p => p.codes?.[code]); // several for multipacks
const openPets = s => Object.keys(s.pets).filter(pid => !s.pets[pid].r && inFilter(pid) && getPet(pid));
export const servingPets = s => Object.keys(s.pets).filter(pid => inFilter(pid) && getPet(pid));
export const servingsInFilter = () => db.servings.filter(s => servingPets(s).length);
export const observedPets = o => Object.keys(o.pets || {}).filter(pid => inFilter(pid) && getPet(pid));
export const observationsInFilter = () => db.observations.filter(o => observedPets(o).length);
export const timeOf = x => x.servedAt ?? x.at;
export const isObservation = x => x.servedAt === undefined && typeof x.at === 'number';
// both lists come in newest first
export function diary(servings, observations) {
  const out = [];
  let i = 0,
    j = 0;
  while (i < servings.length || j < observations.length)
    out.push(
      j >= observations.length || (i < servings.length && servings[i].servedAt >= observations[j].at)
        ? servings[i++]
        : observations[j++],
    );
  return out;
}
export const petNames = ids => andList(ids.map(id => getPet(id)?.name).filter(Boolean));
// its own name first; data from another phone may hold anything
export const namesOf = pet => [
  ...new Set(
    [pet?.name, ...(Array.isArray(pet?.nicknames) ? pet.nicknames : [])].filter(n => typeof n === 'string' && n.trim()),
  ),
];
const hashOf = text => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7);
// a pet goes by its name or a nickname, always the same for one seed
export function callName(pet, seed) {
  const names = namesOf(pet);
  return names.length ? names[hashOf(String(seed)) % names.length] : '';
}
/* One pet by any of its names, the same in one place all day and likely another tomorrow. Several by their own
   names, so they stay apart. */
export const calledNames = (ids, place, now = Date.now()) =>
  ids.length === 1 ? callName(getPet(ids[0]), `${place}:${dayKey(now)}`) : petNames(ids);

/* The hour is in the key because some windows are time based. Per-variety sums are kept, and only varieties with
   changed meals are recomputed. */
const cache = {};
let sums = null;
function cached(name, parts, fn) {
  const now = Date.now(),
    key = [revision, Math.floor(now / 36e5), ...parts].join('|');
  if (cache[name]?.key !== key) {
    refresh(now);
    cache[name] = {key, v: fn(now)};
  }
  return cache[name].v;
}
function refresh(now) {
  const stale = takeStale();
  if (!sums || !stale.sorts || now >= sums.next) sums = tally(db, now);
  else if (stale.sorts.size) tally(db, now, stale.sorts, sums);
}
export const model = () =>
  cached('model', [prefs.activePet, prefs.hiddenHints.join()], now => analyze(db, prefs, now, sums));
// the home card needs only the ranking; the rest waits until the page opens
export const rankingModel = () => cached('ranking', [prefs.activePet], now => ranking(model(), now));
export const evaluationModel = () =>
  cached('evaluation', [prefs.activePet], now => {
    const m = model(),
      r = rankingModel(),
      last = lastServed();
    return {
      moves: moves(m, now, r),
      trend: trend(db, m, now),
      insights: insights(db, m, now),
      next: nextUp(m, now, r, last, slowStarters(m)),
      observed: observed(db, m.pets, now),
      basis: basis(m, r),
      last,
    };
  });
export const sortOf = id => model().byId.get(id);
export function pendingServings() {
  const cut = Date.now() - PENDING_WINDOW;
  return db.servings.filter(s => s.servedAt > cut && openPets(s).length);
}

export function defaultPets(p) {
  const valid = ids => (ids || []).filter(id => getPet(id));
  if (prefs.activePet !== 'all' && getPet(prefs.activePet)) return {ids: [prefs.activePet], auto: false};
  if (db.pets.length === 1) return {ids: [db.pets[0].id], auto: false};
  if (p) {
    const lp = valid(p.lastPets);
    if (lp.length) return {ids: lp, auto: false};
    if (p.animal) {
      const sp = db.pets.filter(x => x.species === p.animal).map(x => x.id);
      if (sp.length) return {ids: sp, auto: false};
    }
  }
  const last = valid(prefs.lastPets);
  if (last.length) return {ids: last, auto: true};
  return {ids: db.pets.map(x => x.id), auto: true};
}

function lastServed() {
  const last = new Map(),
    pet = prefs.activePet !== 'all' && getPet(prefs.activePet) ? prefs.activePet : null; // same pet rule as the model
  for (const s of db.servings) {
    if (!s.productId || last.has(s.productId)) continue;
    if (pet && !s.pets[pet]) continue;
    last.set(s.productId, s.servedAt);
  }
  return last;
}
export const withLast = (products, last = lastServed()) => products.map(p => ({product: p, at: last.get(p.id) || 0}));
// all: every variety, as a search must find each one or it gets made twice; flops and other animals' food last
export function quickProducts(limit = Infinity, all = false) {
  const last = lastServed();
  const flop = new Set(
    model()
      .sorts.filter(e => e.choice === 'nicht')
      .map(e => e.id),
  );
  const pet = prefs.activePet !== 'all' ? getPet(prefs.activePet) : null;
  const later = p => flop.has(p.id) || (!!pet && !last.has(p.id) && !!p.animal && p.animal !== pet.species);
  const products = db.products
    .filter(p => all || !later(p))
    .sort(
      (a, b) =>
        later(a) - later(b) || (last.get(b.id) || 0) - (last.get(a.id) || 0) || (b.createdAt || 0) - (a.createdAt || 0),
    )
    .slice(0, limit);
  return withLast(products, last);
}
export function shoppingList() {
  const m = model(),
    g = shopGroups(m),
    full = p => [p.brand, p.variety].filter(Boolean).join(' ') || pname(p);
  const line = e =>
    `- ${full(e.product)}${!e.kaufen && e.choice === 'gemischt' ? ` (nur für ${petNames(e.yes)})` : ''}`;
  const title = `Einkaufen für ${petNames(m.pet ? [m.pet] : db.pets.map(p => p.id))}`,
    blocks = TYPES.map(t => [t, g.nachkaufen.filter(e => typeOf(e.product) === t)])
      .filter(([, list]) => list.length)
      .map(([t, list]) => `${t}\n${list.map(line).join('\n')}`);
  return {title, text: [title, ...blocks].join('\n\n')};
}
export const byMe = () => (prefs.name ? {by: prefs.name} : {});
