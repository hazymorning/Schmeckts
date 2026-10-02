/* Everything derived from the data: lookups, open meals, suggestions while feeding and the evaluation model
   (model(), computed in smart.js). Read only. */
import {andList, norm} from './text.js';
import {PENDING_WINDOW, TYPES, typeOf} from './config.js';
import {
  analyze,
  basis,
  habits,
  moves,
  nextUp,
  novelty,
  observed,
  patterns,
  profile,
  ranking,
  shopGroups,
  tally,
  trend,
  variety as change,
} from './smart.js';
import {db, prefs, revision, takeStale} from './store.js';

export const getPet = id => db.pets.find(p => p.id === id);
export const getProduct = id => (id ? db.products.find(p => p.id === id) : null);
export const getServing = id => db.servings.find(s => s.id === id);
export const getObservation = id => db.observations.find(o => o.id === id);
export const pname = p => (p ? p.variety || p.brand || 'Unbekannt' : 'Unbekanntes Futter');
const inFilter = pid => prefs.activePet === 'all' || prefs.activePet === pid;
export const petMap = ids => Object.fromEntries(ids.map(id => [id, {r: null, at: null}]));
export const findProduct = (brand, variety) =>
  db.products.find(p => norm(p.brand) === norm(brand) && norm(p.variety) === norm(variety));
export const productsByCode = code => db.products.filter(p => p.codes?.[code]); // several for multipacks
export const openPets = s => Object.keys(s.pets).filter(pid => !s.pets[pid].r && inFilter(pid) && getPet(pid));
export const servingPets = s => Object.keys(s.pets).filter(pid => inFilter(pid) && getPet(pid));
// Every meal within the pet filter, newest first: what the list on the history page shows, whatever is evaluated
export const servingsInFilter = () => db.servings.filter(s => servingPets(s).length);
/* The pets an observation may concern, within the filter; with several it is not clear which of them it was */
export const observedPets = o => Object.keys(o.pets || {}).filter(pid => inFilter(pid) && getPet(pid));
export const observationsInFilter = () => db.observations.filter(o => observedPets(o).length);
/* The diary: meals and observations by time, newest first. Each keeps its own shape; timeOf() reads either. */
export const timeOf = x => x.servedAt ?? x.at;
export const isObservation = x => x.servedAt === undefined && typeof x.at === 'number';
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

/* The evaluation model, recomputed only when the data, the pet filter, the hidden hints or the hour change (windows
   such as the 72 hours for appetite). The sums per variety stay put while that happens and only varieties with
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
/* „Worauf es ankommt“ as the model stands: the groups per comparison, and apart from them the habits in the order its
   card on „Vorlieben“ shows the first two of: the sauce licked off, Abwechslung, Neuheit and eating only a little. The
   card asks for them only while there is nothing to compare, since Abwechslung reads every meal. */
export const profileModel = () => cached('profile', [prefs.activePet], () => profile(model()));
export const habitsModel = () =>
  cached('habits', [prefs.activePet], () => {
    const m = model(),
      eaten = habits(m),
      of = kind => eaten.filter(h => h.kind === kind);
    return [...of('sosse'), ...change(m), ...novelty(m), ...of('eager')];
  });
/* „Vorlieben“: the sides of the ranked varieties, for its card on the home page and the first cards of its page, and
   the rest of the page only when it opens: what moved, how it goes per pet, what it depends on, what to serve next,
   what it rests on, and when each variety was last served within the filter */
export const rankingModel = () => cached('ranking', [prefs.activePet], now => ranking(model(), now));
export const evaluationModel = () =>
  cached('evaluation', [prefs.activePet], now => {
    const m = model(),
      r = rankingModel(),
      last = lastServed(),
      slow = novelty(m)
        .filter(h => h.kind === 'anlauf')
        .map(h => h.pet);
    return {
      moves: moves(m, now, r),
      trend: trend(db, m, now),
      patterns: patterns(profileModel()),
      next: nextUp(m, now, r, last, slow),
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

/* Which pets a serving is for, picked without asking, in this order:
   active pet > only pet > whoever had this food last > matching species > last used > everyone */
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

/* When each variety was last served within the pet filter: variety → time, only for varieties served at all */
function lastServed() {
  const last = new Map(),
    pet = prefs.activePet !== 'all' && getPet(prefs.activePet) ? prefs.activePet : null; // as the model has it
  for (const s of db.servings) {
    if (!s.productId || last.has(s.productId)) continue;
    if (pet && !s.pets[pet]) continue;
    last.set(s.productId, s.servedAt);
  }
  return last;
}
/* Varieties with when each was last served within the filter, 0 for one never served: what a row of the quick picker
   says under the name. [{product, at}] */
export const withLast = (products, last = lastServed()) => products.map(p => ({product: p, at: last.get(p.id) || 0}));
/* Quick picker while feeding: most recently served varieties first, leaving out the ones no longer bought (model),
   each with when it was last served. [{product, at}] */
export function quickProducts(limit = Infinity) {
  const last = lastServed();
  const flop = new Set(
    model()
      .sorts.filter(e => e.choice === 'nicht')
      .map(e => e.id),
  );
  const pet = prefs.activePet !== 'all' ? getPet(prefs.activePet) : null;
  const products = db.products
    .filter(p => !flop.has(p.id))
    .filter(p => !pet || last.has(p.id) || !p.animal || p.animal === pet.species)
    .sort((a, b) => (last.get(b.id) || 0) - (last.get(a.id) || 0) || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
  return withLast(products, last);
}
/* The shopping list as shareable text, matching the pet filter: what to buy again („Nachkaufen“ including „Gemischt“
   with „nur für …“ and the manual `immer`), one block per food type with the type's name above it, the best first.
   Nothing that is not to be bought. */
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
