/* Auswertung: analyze() liefert das Modell, aus dem alles liest, was auswertet. Reine Funktionen, zwischengespeichert
   wird in derive.js. Regeln: PROJEKT.md, Abschnitt „Auswertung“. */
import {FLAVORS, guessTexture, RATINGS, TEXTURES, textureOf, TYPES, typeOf} from './config.js';
import {addDays, dayKey, dayStart, weekStart} from './dates.js';

const DAY = 864e5;
const HALF_LIFE = 90 * DAY;
const WEIGHT_ZERO = Date.UTC(2026, 0, 1); // Bezugszeit der Gewichte, für die Wertung ohne Belang
const YES = 70, NO = 40;
export const MIN_RATED = 3;   // ab so vielen Bewertungen im Filter gibt es Erkenntnisse und eine Auswertung
const APPETITE = {recent:72 * 36e5, usual:30 * DAY, minRecent:3, minUsual:8, minSorts:2, drop:30, below:50};
const TASTE_SPAN = 180 * DAY;
export const VERDICTS = {nachkaufen:'Nachkaufen', gemischt:'Gemischt', beobachten:'Beobachten', nicht:'Nicht mehr kaufen'};
const HINTS = ['appetit', 'stop', 'sosse', 'liebling']; // nach Vorrang
const MILESTONES = {meals:[50, 100, 250, 500, 1000], sorts:[10, 25, 50]};
export const rOf = x => RATINGS[x?.r] ? x.r : null; // unbekannte Werte anderer Geräte zählen nicht
/* Farbklasse einer Wertung und einer Stufe. Die Stufe folgt ihren Punkten: ab 70 --good, ab 40 --mid, darunter --sauce, bei 0 --bad */
export const scoreCls = v => v >= YES ? 'r-good' : v >= NO ? 'r-mid' : 'r-bad';
export const rateCls = r => { const v = RATINGS[r].score; return v > 0 && v < NO ? 'r-sauce' : scoreCls(v); };
export const hintKey = h => h.kind === 'appetit' ? `appetit:${h.pet}:${h.day}` : `${h.kind}:${h.id}`;
const keywordOf = (list, text) => (list.find(([, re]) => re.test(text || '')) || [])[0];

/* Summe aus Bewertungen. Alle Gewichte schrumpfen gleich schnell, points / weights hängt deshalb nicht vom
   Zeitpunkt ab: Eine Summe gilt, bis sich eine ihrer Mahlzeiten ändert. */
const emptySum = () => ({n:0, points:0, weights:0, counts:{}, last:null}); // counts: nur Stufen, die vorkommen
function addRating(sum, x){
  const w = Math.pow(2, (x.t - WEIGHT_ZERO) / HALF_LIFE);
  sum.n++; sum.points += w * RATINGS[x.r].score; sum.weights += w; sum.counts[x.r] = (sum.counts[x.r] || 0) + 1;
  if (!sum.last || x.t > sum.last.t) sum.last = x;
}
function addSum(sum, other){
  sum.n += other.n; sum.points += other.points; sum.weights += other.weights;
  for (const r in other.counts) sum.counts[r] = (sum.counts[r] || 0) + other.counts[r];
  if (other.last && (!sum.last || other.last.t > sum.last.t)) sum.last = other.last;
  return sum;
}
function statOf(sum){
  const score = sum.n ? +(sum.points / sum.weights).toFixed(6) : 0, pct = Math.round(score); // gerundet gegen das Rauschen der Gewichte
  return {n:sum.n, score, pct, counts:sum.counts, last:sum.last,
    verdict: sum.n >= 3 && pct >= YES ? 'nachkaufen' : sum.n >= 2 && pct < NO ? 'nicht' : 'beobachten'};
}

/* Bewertungen bekannter Tiere: {pid, r, t, id} mit id = Sorte oder null */
function* ratingsOf(db, servings){
  const known = new Set(db.pets.map(p => p.id));
  for (const s of servings)
    for (const [pid, x] of Object.entries(s.pets || {})) { const r = rOf(x); if (r && known.has(pid)) yield {pid, r, t:s.servedAt, id:s.productId || null}; }
}

/* Summen je Sorte und Tier aus den Mahlzeiten bis now: {bySort: Map Sorte → {[petId]: Summe}, next}. Mit only werden nur
   diese Sorten neu gerechnet. next ist die nächste Mahlzeit nach now: Ab dann fehlt sie in den Summen. */
export function tally(db, now, only, sums = {bySort:new Map()}){
  if (only) for (const id of only) sums.bySort.delete(id); else sums.bySort.clear();
  sums.next = Infinity;
  const due = [];
  for (const s of db.servings) {
    if (s.servedAt > now) sums.next = Math.min(sums.next, s.servedAt);
    else if (s.productId && (!only || only.has(s.productId))) due.push(s);
  }
  for (const x of ratingsOf(db, due)) {
    if (!sums.bySort.has(x.id)) sums.bySort.set(x.id, {});
    addRating(sums.bySort.get(x.id)[x.pid] ||= emptySum(), x);
  }
  return sums;
}

function houseVerdict(pets){
  const yes = pets.filter(([, x]) => x.verdict === 'nachkaufen').map(([id]) => id);
  const no = pets.filter(([, x]) => x.verdict === 'nicht').map(([id]) => id);
  return {yes, no, verdict: yes.length ? (no.length ? 'gemischt' : 'nachkaufen') : no.length ? 'nicht' : 'beobachten'};
}

/* Modell = {pet, sorts, byId, rated, overview, insights, hints, tastes, taste}
   Sorte  = {id, product, kaufen, pets: {[petId]: Stat}, house: Stat mit yes/no, sum, choice, dazu die Werte im Filter:
             n, score, pct, verdict, counts, last, yes, no}
   Stat   = {n, score, pct, verdict, counts, last: {pid, r, t, id}} */
export function analyze(db, prefs, now, sums = tally(db, now)){
  const petIds = db.pets.map(p => p.id);
  const pet = prefs.activePet && prefs.activePet !== 'all' && petIds.includes(prefs.activePet) ? prefs.activePet : null;
  const sorts = db.products.map(product => {
    const mine = sums.bySort.get(product.id) || {}, pets = {};
    for (const pid of petIds) if (mine[pid]) pets[pid] = statOf(mine[pid]);
    const houseSum = petIds.reduce((sum, pid) => mine[pid] ? addSum(sum, mine[pid]) : sum, emptySum());
    const house = Object.assign(statOf(houseSum), houseVerdict(Object.entries(pets)));
    const eff = pet ? pets[pet] || statOf(emptySum()) : house;
    const kaufen = product.kaufen === 'immer' || product.kaufen === 'nicht' ? product.kaufen : null;
    return {id:product.id, product, kaufen, pets, house, sum:pet ? mine[pet] || emptySum() : houseSum,
      n:eff.n, score:eff.score, pct:eff.pct, verdict:eff.verdict, counts:eff.counts, last:eff.last,
      yes:pet ? [] : house.yes, no:pet ? [] : house.no,
      choice: kaufen === 'immer' ? 'nachkaufen' : kaufen === 'nicht' ? 'nicht' : eff.verdict};
  }).sort((a, b) => b.score - a.score || b.n - a.n);
  const byId = new Map(sorts.map(e => [e.id, e])), tastes = tastesOf(db, byId, now);
  const total = k => petIds.reduce((a, pid) => a + tastes[pid][k], 0);
  return {pet, sorts, byId, rated:sorts.reduce((a, e) => a + e.n, 0), overview:overviewOf(db, pet, sorts, now), insights:insights(sorts),
    hints:hints(sorts, appetite(db, pet ? [pet] : petIds, now), pet, prefs),
    tastes, taste:pet ? tastes[pet] : {known:total('known'), total:total('total')}};
}

/* Kurzübersicht im Filter: die letzte Fütterung bis now und je Tier die liebste Sorte (Urteil „Nachkaufen“, beste Wertung)
   und die schwächste (Urteil „Nicht mehr kaufen“, schlechteste Wertung): {last, pets: [{id, favorite, flop}]} */
function overviewOf(db, pet, sorts, now){
  const ids = pet ? [pet] : db.pets.map(p => p.id);
  const pick = (id, verdict, sign) => sorts.filter(e => e.pets[id]?.verdict === verdict).sort((a, b) => sign * (b.pets[id].score - a.pets[id].score))[0] || null;
  return {last:db.servings.reduce((a, s) => s.servedAt <= now && (!a || s.servedAt > a.servedAt) && ids.some(id => s.pets?.[id]) ? s : a, null),
    pets:ids.map(id => ({id, favorite:pick(id, 'nachkaufen', 1), flop:pick(id, 'nicht', -1)}))};
}

/* „Geschmack bekannt“ je Tier: von den Sorten der letzten 180 Tage sind die bekannt, die es mindestens 3× bewertet hat,
   oder mindestens 2× bei einer Wertung unter 40 */
function tastesOf(db, byId, now){
  const out = Object.fromEntries(db.pets.map(p => [p.id, {known:0, total:0}])), seen = new Set();
  for (const s of db.servings) {
    if (s.servedAt > now || s.servedAt <= now - TASTE_SPAN) continue;
    const e = byId.get(s.productId);
    if (!e) continue;
    for (const pid of Object.keys(s.pets || {})) {
      const key = pid + '|' + e.id, x = e.pets[pid];
      if (!out[pid] || seen.has(key)) continue;
      seen.add(key); out[pid].total++;
      if (x && (x.n >= 3 || x.n >= 2 && x.pct < NO)) out[pid].known++;
    }
  }
  return out;
}

/* Vergleiche nach Marke, Konsistenz und Geschmack, jeweils nur innerhalb einer Futterart, dazu „meist nur die Soße“.
   Ohne Aussagen zum Kaufen */
const sauceShare = x => (x.counts.sosse || 0) / x.n;
function insights(sorts){
  if (sorts.reduce((a, e) => a + e.n, 0) < MIN_RATED) return [];
  const out = [];
  for (const type of TYPES) {
    const mine = sorts.filter(e => e.n && typeOf(e.product) === type);
    const compare = (kind, keyOf) => {
      const groups = new Map();
      for (const e of mine) { const k = keyOf(e.product); if (k) groups.set(k, addSum(groups.get(k) || emptySum(), e.sum)); }
      const ranked = [...groups].map(([key, sum]) => ({key, ...statOf(sum)})).filter(x => x.n >= 2).sort((a, b) => b.score - a.score);
      if (ranked.length >= 2) out.push({kind, type, best:ranked[0], worst:ranked.at(-1)});
    };
    compare('marke', p => p.brand);
    compare('konsistenz', p => (textureOf(p, p.texture) || textureOf(p, guessTexture(p)))?.[1]); // das Feld, nur ohne Feld die Stichwörter
    compare('geschmack', p => keywordOf(FLAVORS, p.variety));
  }
  sorts.filter(e => e.n >= 2 && sauceShare(e) >= .5).slice(0, 2).forEach(e => out.push({kind:'sosse', id:e.id}));
  return out;
}

/* Frisst ein Tier seit ein paar Tagen deutlich schlechter als sonst? Liest nur die 72 Stunden und die 30 Tage davor */
function appetite(db, petIds, now){
  const A = APPETITE, cut = now - A.recent, out = [];
  const span = [...ratingsOf(db, db.servings.filter(s => s.servedAt <= now && s.servedAt > cut - A.usual))];
  const avg = l => Math.round(l.reduce((a, x) => a + RATINGS[x.r].score, 0) / l.length);
  for (const pid of petIds) {
    const mine = span.filter(x => x.pid === pid), win = mine.filter(x => x.t > cut), base = mine.filter(x => x.t <= cut);
    if (win.length < A.minRecent || base.length < A.minUsual || new Set(win.map(x => x.id).filter(Boolean)).size < A.minSorts) continue;
    const recent = avg(win), usual = avg(base);
    if (usual - recent >= A.drop && recent < A.below)
      out.push({kind:'appetit', pet:pid, n:win.length, recent, usual, day:dayKey(Math.max(...win.map(x => x.t))), order:recent - usual});
  }
  return out;
}

/* Hinweise nach Vorrang, die deutlichsten zuerst. Außer „Appetit“ nur für Sorten ohne eigene Einstellung */
function hints(sorts, appetites, pet, prefs){
  const hidden = new Set(prefs.hiddenHints || []), out = [...appetites];
  for (const e of sorts) {
    if (e.kaufen) continue;
    if (e.verdict === 'nicht') out.push({kind:'stop', id:e.id, pet, order:e.score});
    const sauce = Object.entries(e.pets).filter(([pid, x]) => (!pet || pid === pet) && x.n >= 3 && sauceShare(x) >= .6)
      .sort(([, a], [, b]) => sauceShare(b) - sauceShare(a))[0];
    if (sauce) out.push({kind:'sosse', id:e.id, pet:sauce[0], order:-sauceShare(sauce[1])});
    if (e.verdict === 'nachkaufen') out.push({kind:'liebling', id:e.id, pet, order:-e.score});
  }
  return out.filter(h => !hidden.has(hintKey(h)))
    .sort((a, b) => HINTS.indexOf(a.kind) - HINTS.indexOf(b.kind) || a.order - b.order);
}

/* Auswertungs-Seite: alles für einen Zeitraum in einem Rutsch, aus denselben Bewertungen, Gewichten und Schwellen wie
   analyze(). span: Tage, 0 = alles. Gerechnet wird im Tier-Filter; rein, zwischengespeichert wird in derive.js.
     trend     je Tier eine Linie der gewichteten Wertung, bei 30 Tagen je Tag, sonst je Woche
     levels    Anzahl und Anteil je vorkommender Stufe, in der Reihenfolge von RATINGS
     brands    die TOP_BRANDS häufigsten Marken nach Wertung
     textures  Konsistenz und Snack-Art je Futterart, nur Gruppen ab MIN_GROUP Bewertungen
     feeding   Mahlzeiten je Wochentag (Montag zuerst) und je Person */
export const SPANS = [[30, '30 Tage'], [90, '90 Tage'], [0, 'Alles']];
const TOP_BRANDS = 6, MIN_GROUP = 3;
function groupSums(rated, products, keyOf){
  const m = new Map();
  for (const x of rated) {
    const p = products.get(x.id), k = p && keyOf(p);
    if (!k) continue;
    if (!m.has(k)) m.set(k, emptySum());
    addRating(m.get(k), x);
  }
  return [...m].map(([key, sum]) => ({key, ...statOf(sum)}));
}
function trendOf(rated, ids, step){
  const bucket = step === 'day' ? dayStart : weekStart, per = new Map();
  for (const x of rated) {
    if (!per.has(x.pid)) per.set(x.pid, {sum:emptySum(), buckets:new Map()});
    const mine = per.get(x.pid), b = bucket(x.t);
    if (!mine.buckets.has(b)) mine.buckets.set(b, emptySum());
    addRating(mine.buckets.get(b), x); addRating(mine.sum, x);
  }
  const pets = ids.filter(id => per.has(id)).map(id => ({id, ...statOf(per.get(id).sum),
    points:[...per.get(id).buckets].sort((a, b) => a[0] - b[0]).map(([t, sum]) => ({t, ...statOf(sum)}))}));
  const all = pets.flatMap(p => p.points.map(x => x.t));
  return {step, from:Math.min(...all, Infinity), to:Math.max(...all, -Infinity), pets};
}
export function report(db, prefs, now, span){
  const petIds = db.pets.map(p => p.id);
  const pet = prefs.activePet && prefs.activePet !== 'all' && petIds.includes(prefs.activePet) ? prefs.activePet : null;
  const ids = pet ? [pet] : petIds, mine = new Set(ids), products = new Map(db.products.map(p => [p.id, p]));
  const from = span ? now - span * DAY : -Infinity;
  const meals = db.servings.filter(s => s.servedAt > from && s.servedAt <= now && ids.some(id => s.pets?.[id]));
  const rated = [...ratingsOf(db, meals)].filter(x => mine.has(x.pid));
  const counts = {}, days = [0, 0, 0, 0, 0, 0, 0], fed = new Map();
  for (const x of rated) counts[x.r] = (counts[x.r] || 0) + 1;
  for (const s of meals) {
    days[(new Date(s.servedAt).getDay() + 6) % 7]++;
    const name = (s.by || '').trim();
    if (name) fed.set(name, (fed.get(name) || 0) + 1);
  }
  const textureKey = type => p => typeOf(p) === type ? (textureOf(p, p.texture) || textureOf(p, guessTexture(p)))?.[1] : '';
  return {span, pet, n:rated.length, meals, trend:trendOf(rated, ids, span === 30 ? 'day' : 'week'),
    levels:Object.keys(RATINGS).filter(r => counts[r]).map(r => ({r, n:counts[r], share:Math.round(counts[r] / rated.length * 100)})),
    brands:groupSums(rated, products, p => p.brand).sort((a, b) => b.n - a.n).slice(0, TOP_BRANDS).sort((a, b) => b.score - a.score),
    textures:Object.entries(TEXTURES).map(([type, t]) => ({type, title:t.title,
      groups:groupSums(rated, products, textureKey(type)).filter(g => g.n >= MIN_GROUP).sort((a, b) => b.score - a.score)}))
      .filter(x => x.groups.length >= 2),
    feeding:{days, people:[...fed].map(([name, n]) => ({name, n})).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de'))}};
}

/* Gruppen für „Einkaufen“ und die Einkaufsliste: „Gemischt“ zählt zu Nachkaufen, die eigene Einstellung ordnet ein,
   Sorten ohne Bewertung im Filter erscheinen nur mit eigener Einstellung */
export function shopGroups(m){
  const g = {nachkaufen:[], beobachten:[], nicht:[]};
  for (const e of m.sorts) if (e.n || e.kaufen) g[e.choice === 'gemischt' ? 'nachkaufen' : e.choice].push(e);
  return g;
}

/* Kalenderwoche ab start (Montag 0:00 Ortszeit), immer für den ganzen Haushalt:
   best       je Tier die Sorte mit der besten Wertung dieser Woche, ab 2 Bewertungen: {pet, id, n, pct}
   favorites  Sorten, deren Urteil am Wochenende „Nachkaufen“ ist und am Anfang nicht war
   feeders    Fütterungen je Person (Feld by), die meisten zuerst: {name, n} */
export function week(db, prefs, start){
  const end = addDays(start, 7), house = {...prefs, activePet:'all'};
  const before = analyze(db, house, start - 1), after = analyze(db, house, end - 1);
  const meals = db.servings.filter(s => s.servedAt >= start && s.servedAt < end), best = [];
  const sums = tally({pets:db.pets, servings:meals.filter(s => after.byId.has(s.productId))}, end);
  for (const pet of db.pets) {
    const top = [...sums.bySort].filter(([, mine]) => mine[pet.id]).map(([id, mine]) => ({id, ...statOf(mine[pet.id])}))
      .filter(x => x.n >= 2).sort((a, b) => b.score - a.score || b.n - a.n || b.last.t - a.last.t)[0];
    if (top) best.push({pet:pet.id, id:top.id, n:top.n, pct:top.pct});
  }
  const fed = new Map();
  for (const s of meals) { const name = (s.by || '').trim(); if (name) fed.set(name, (fed.get(name) || 0) + 1); }
  return {start, end, meals:meals.length, rated:meals.filter(s => !ratingsOf(db, [s]).next().done).length, best,
    favorites:after.sorts.filter(e => e.house.verdict === 'nachkaufen' && before.byId.get(e.id)?.house.verdict !== 'nachkaufen').map(e => e.id),
    feeders:[...fed].map(([name, n]) => ({name, n})).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de'))};
}

/* Wochenrückblick: die Vorwoche, sichtbar von Montag 0:00 bis Mittwoch 23:59, ab 5 Mahlzeiten und bis zum Schließen.
   known: eine schon berechnete Woche, sie gilt, solange sich keine Mahlzeit bis zu ihrem Ende ändert */
export function review(db, prefs, now, known){
  const monday = weekStart(now), start = addDays(monday, -7);
  if (now >= addDays(monday, 3) || prefs.closedWeek === dayKey(start)) return null;
  const w = known?.start === start ? known : week(db, prefs, start);
  return w.meals >= 5 ? w : null;
}

/* Übliche Fütterungszeiten des Haushalts aus den Mahlzeiten (ohne Snacks) der letzten 14 Tage: Uhrzeiten, die höchstens
   90 Minuten auseinanderliegen, bilden eine Zeit; sie gilt ab 4 verschiedenen Tagen. Minuten seit Mitternacht, Ortszeit:
   from früheste, at mittlere Uhrzeit, remind = at + 45 Minuten. */
const FEED = {span:14 * DAY, gap:90, minDays:4, delay:45, lead:60, ahead:3};
function mealsIn(db, from, to){
  const snack = new Set(db.products.filter(p => typeOf(p) === 'Snack').map(p => p.id));
  return db.servings.filter(s => s.servedAt > from && s.servedAt <= to && !snack.has(s.productId));
}
export function feedSlots(db, now){
  const times = mealsIn(db, now - FEED.span, now).map(s => { const d = new Date(s.servedAt); return {min:d.getHours() * 60 + d.getMinutes(), day:dayKey(s.servedAt)}; })
    .sort((a, b) => a.min - b.min), groups = [];
  for (const x of times) { const g = groups.at(-1); if (g && x.min - g.at(-1).min <= FEED.gap) g.push(x); else groups.push([x]); }
  return groups.filter(g => new Set(g.map(x => x.day)).size >= FEED.minDays).map(g => ({from:g[0].min, at:g[g.length >> 1].min, remind:g[g.length >> 1].min + FEED.delay}));
}
/* Erinnerungen ans Füttern für heute und die zwei Tage danach: je übliche Zeit eine, außer es gab an dem Tag ab einer
   Stunde vor der frühesten üblichen Uhrzeit schon eine Mahlzeit. {key: 'Tag|Zeit', at} */
export function feedReminders(db, now){
  const out = [], atMinute = (i, min) => { const d = new Date(now); d.setHours(0, min, 0, 0); d.setDate(d.getDate() + i); return d.getTime(); };
  for (const slot of feedSlots(db, now)) for (let i = 0; i < FEED.ahead; i++) {
    const at = atMinute(i, slot.remind);
    if (at > now && !mealsIn(db, atMinute(i, slot.from - FEED.lead) - 1, at).length) out.push({key:`${dayKey(at)}|${slot.at}`, at});
  }
  return out;
}

export function milestones(db){
  const ids = new Set(db.products.map(p => p.id));
  const count = {meals:db.servings.length, sorts:new Set(db.servings.map(s => s.productId).filter(id => ids.has(id))).size};
  return {...count, reached:Object.entries(MILESTONES).flatMap(([k, steps]) => steps.filter(n => count[k] >= n).map(n => `${k}:${n}`))};
}
