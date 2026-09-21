/* Everything derived from the data: lookups, open meals, suggestions while feeding and the evaluation model
   (model(), computed in smart.js). Read only, never writes. */
import {andList, norm} from './text.js';
import {PENDING_WINDOW} from './config.js';
import {analyze, report, review, shopGroups, tally} from './smart.js';
import {db, prefs, revision, takeStale} from './store.js';

export const getPet = id => db.pets.find(p => p.id === id);
export const getProduct = id => id ? db.products.find(p => p.id === id) : null;
export const getServing = id => db.servings.find(s => s.id === id);
export const pname = p => p ? (p.variety || p.brand || 'Unbekannt') : 'Unbekanntes Futter';
const inFilter = pid => prefs.activePet === 'all' || prefs.activePet === pid;
export const petMap = ids => Object.fromEntries(ids.map(id => [id, {r:null, at:null}]));
export const findProduct = (brand, variety) => db.products.find(p => norm(p.brand) === norm(brand) && norm(p.variety) === norm(variety));
export const productsByCode = code => db.products.filter(p => p.codes?.[code]); // several for multipacks
export const openPets = s => Object.keys(s.pets).filter(pid => !s.pets[pid].r && inFilter(pid) && getPet(pid));
export const servingPets = s => Object.keys(s.pets).filter(pid => inFilter(pid) && getPet(pid));
export const petNames = ids => andList(ids.map(id => getPet(id)?.name).filter(Boolean));

/* The evaluation model and the weekly review, recomputed only when the data, the pet filter, the hidden hints, the
   closed week or the hour change (windows such as the 72 hours for appetite). The sums per variety stay put while
   that happens and only varieties with changed meals are recomputed; the week stands until a meal up to its end
   changes. */
const cache = {};
let sums = null, week = null;
function cached(name, parts, fn){
  const now = Date.now(), key = [revision, Math.floor(now / 36e5), ...parts].join('|');
  if (cache[name]?.key !== key) { refresh(now); cache[name] = {key, v:fn(now)}; }
  return cache[name].v;
}
function refresh(now){
  const stale = takeStale();
  if (!sums || !stale.sorts || now >= sums.next) sums = tally(db, now);
  else if (stale.sorts.size) tally(db, now, stale.sorts, sums);
  if (stale.since < week?.end) week = null;
}
export const model = () => cached('model', [prefs.activePet, prefs.hiddenHints.join()], now => analyze(db, prefs, now, sums));
export const lastWeek = () => cached('week', [prefs.closedWeek], now => week = review(db, prefs, now, week));
export const reportModel = span => cached('report', [prefs.activePet, span], now => report(db, prefs, now, span)); // only when the evaluation opens
export const sortOf = id => model().byId.get(id);
export function pendingServings(){
  const cut = Date.now() - PENDING_WINDOW;
  return db.servings.filter(s => s.servedAt > cut && openPets(s).length);
}

/* Who is being served? Without asking, but as right as possible:
   active pet > only pet > whoever had this food last > matching species > last used > everyone */
export function defaultPets(p){
  const valid = ids => (ids || []).filter(id => getPet(id));
  if (prefs.activePet !== 'all' && getPet(prefs.activePet)) return {ids:[prefs.activePet], auto:false};
  if (db.pets.length === 1) return {ids:[db.pets[0].id], auto:false};
  if (p) {
    const lp = valid(p.lastPets); if (lp.length) return {ids:lp, auto:false};
    if (p.animal) { const sp = db.pets.filter(x => x.species === p.animal).map(x => x.id); if (sp.length) return {ids:sp, auto:false}; }
  }
  const last = valid(prefs.lastPets); if (last.length) return {ids:last, auto:true};
  return {ids:db.pets.map(x => x.id), auto:true};
}

/* Quick picker while feeding: most recently served varieties first, leaving out the ones no longer bought (model) */
export function quickProducts(limit = Infinity){
  const last = new Map();
  for (const s of db.servings) {
    if (!s.productId || last.has(s.productId)) continue;
    if (prefs.activePet !== 'all' && !s.pets[prefs.activePet]) continue;
    last.set(s.productId, s.servedAt);
  }
  const flop = new Set(model().sorts.filter(e => e.choice === 'nicht').map(e => e.id));
  const pet = prefs.activePet !== 'all' ? getPet(prefs.activePet) : null;
  return db.products
    .filter(p => !flop.has(p.id))
    .filter(p => !pet || last.has(p.id) || !p.animal || p.animal === pet.species)
    .sort((a, b) => ((last.get(b.id) || 0) - (last.get(a.id) || 0)) || ((b.createdAt || 0) - (a.createdAt || 0)))
    .slice(0, limit);
}
/* The shopping list as shareable text, matching the pet filter: „Nachkaufen“ (including „Gemischt“ with „für …“ and
   the manual `immer`), „Nicht kaufen“ („Nicht mehr kaufen“ and the manual `nicht`). „Beobachten“ and empty groups are
   left out. */
export function shoppingList(){
  const m = model(), g = shopGroups(m), full = p => [p.brand, p.variety].filter(Boolean).join(' ') || pname(p);
  const line = e => `- ${full(e.product)}${!e.kaufen && e.choice === 'gemischt' ? ` (für ${petNames(e.yes)})` : ''}`;
  const part = (title, list) => list.length ? `\n\n${title}\n${list.map(line).join('\n')}` : '';
  const title = `Einkaufen für ${petNames(m.pet ? [m.pet] : db.pets.map(p => p.id))}`;
  return {title, text:title + part('Nachkaufen', g.nachkaufen) + part('Nicht kaufen', g.nicht)};
}
export const byMe = () => prefs.name ? {by:prefs.name} : {};
