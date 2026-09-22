/* Evaluation: analyze() returns the model everything that evaluates reads from. Pure functions; caching happens in
   derive.js. The rules are in PROJECT.md, section "Evaluation". */
import {FLAVORS, guessTexture, RATINGS, textureOf, TYPES, typeOf} from './config.js';
import {addDays, dayKey, dayStart, weekStart} from './dates.js';

const DAY = 864e5;
const HALF_LIFE = 90 * DAY;
const WEIGHT_ZERO = Date.UTC(2026, 0, 1); // reference time of the weights, irrelevant to the score
const YES = 70,
  NO = 40;
export const MIN_RATED = 3; // from this many ratings within the filter there are insights and an evaluation
const APPETITE = {recent: 72 * 36e5, usual: 30 * DAY, minRecent: 3, minUsual: 8, minSorts: 2, drop: 30, below: 50};
const TASTE_SPAN = 180 * DAY;
export const VERDICTS = {
  nachkaufen: 'Nachkaufen',
  gemischt: 'Gemischt',
  beobachten: 'Beobachten',
  nicht: 'Nicht mehr kaufen',
};
const HINTS = ['appetit', 'stop', 'sosse', 'liebling']; // by precedence
const MILESTONES = {meals: [50, 100, 250, 500, 1000], sorts: [10, 25, 50]};
export const rOf = x => (RATINGS[x?.r] ? x.r : null); // unknown values from other devices do not count
/* Colour class of a score and of a level. The level follows its points: from 70 --good, from 40 --mid, below that --sauce, at 0 --bad */
export const scoreCls = v => (v >= YES ? 'r-good' : v >= NO ? 'r-mid' : 'r-bad');
export const rateCls = r => {
  const v = RATINGS[r].score;
  return v > 0 && v < NO ? 'r-sauce' : scoreCls(v);
};
export const hintKey = h => (h.kind === 'appetit' ? `appetit:${h.pet}:${h.day}` : `${h.kind}:${h.id}`);
const keywordOf = (list, text) => (list.find(([, re]) => re.test(text || '')) || [])[0];

/* Sum over ratings. All weights shrink at the same rate, so points / weights does not depend on when it is
   computed: a sum holds until one of its meals changes. */
const emptySum = () => ({n: 0, points: 0, weights: 0, counts: {}, last: null}); // counts: only levels that actually occur
function addRating(sum, x) {
  const w = Math.pow(2, (x.t - WEIGHT_ZERO) / HALF_LIFE);
  sum.n++;
  sum.points += w * RATINGS[x.r].score;
  sum.weights += w;
  sum.counts[x.r] = (sum.counts[x.r] || 0) + 1;
  if (!sum.last || x.t > sum.last.t) sum.last = x;
}
function addSum(sum, other) {
  sum.n += other.n;
  sum.points += other.points;
  sum.weights += other.weights;
  for (const r in other.counts) sum.counts[r] = (sum.counts[r] || 0) + other.counts[r];
  if (other.last && (!sum.last || other.last.t > sum.last.t)) sum.last = other.last;
  return sum;
}
function statOf(sum) {
  const score = sum.n ? +(sum.points / sum.weights).toFixed(6) : 0,
    pct = Math.round(score); // rounded against the noise of the weights
  return {
    n: sum.n,
    score,
    pct,
    counts: sum.counts,
    last: sum.last,
    verdict: sum.n >= 3 && pct >= YES ? 'nachkaufen' : sum.n >= 2 && pct < NO ? 'nicht' : 'beobachten',
  };
}

/* Ratings by known pets: {pid, r, t, id} where id is the variety or null */
function* ratingsOf(db, servings) {
  const known = new Set(db.pets.map(p => p.id));
  for (const s of servings)
    for (const [pid, x] of Object.entries(s.pets || {})) {
      const r = rOf(x);
      if (r && known.has(pid)) yield {pid, r, t: s.servedAt, id: s.productId || null};
    }
}

/* Sums per variety and pet from the meals up to now: {bySort: Map variety → {[petId]: sum}, next}. With only, just
   those varieties are recomputed. next is the first meal after now: from then on it is missing from the sums. */
export function tally(db, now, only, sums = {bySort: new Map()}) {
  if (only) for (const id of only) sums.bySort.delete(id);
  else sums.bySort.clear();
  sums.next = Infinity;
  const due = [];
  for (const s of db.servings) {
    if (s.servedAt > now) sums.next = Math.min(sums.next, s.servedAt);
    else if (s.productId && (!only || only.has(s.productId))) due.push(s);
  }
  for (const x of ratingsOf(db, due)) {
    if (!sums.bySort.has(x.id)) sums.bySort.set(x.id, {});
    addRating((sums.bySort.get(x.id)[x.pid] ||= emptySum()), x);
  }
  return sums;
}

function houseVerdict(pets) {
  const yes = pets.filter(([, x]) => x.verdict === 'nachkaufen').map(([id]) => id);
  const no = pets.filter(([, x]) => x.verdict === 'nicht').map(([id]) => id);
  return {yes, no, verdict: yes.length ? (no.length ? 'gemischt' : 'nachkaufen') : no.length ? 'nicht' : 'beobachten'};
}

/* Model  = {pet, sorts, byId, rated, overview, insights, hints, tastes, taste}
   Sort  = {id, product, kaufen, pets: {[petId]: Stat}, house: Stat with yes/no, sum, choice, plus the values within
            the filter: n, score, pct, verdict, counts, last, yes, no}
   Stat  = {n, score, pct, verdict, counts, last: {pid, r, t, id}} */
export function analyze(db, prefs, now, sums = tally(db, now)) {
  const petIds = db.pets.map(p => p.id);
  const pet = prefs.activePet && prefs.activePet !== 'all' && petIds.includes(prefs.activePet) ? prefs.activePet : null;
  const sorts = db.products
    .map(product => {
      const mine = sums.bySort.get(product.id) || {},
        pets = {};
      for (const pid of petIds) if (mine[pid]) pets[pid] = statOf(mine[pid]);
      const houseSum = petIds.reduce((sum, pid) => (mine[pid] ? addSum(sum, mine[pid]) : sum), emptySum());
      const house = Object.assign(statOf(houseSum), houseVerdict(Object.entries(pets)));
      const eff = pet ? pets[pet] || statOf(emptySum()) : house;
      const kaufen = product.kaufen === 'immer' || product.kaufen === 'nicht' ? product.kaufen : null;
      return {
        id: product.id,
        product,
        kaufen,
        pets,
        house,
        sum: pet ? mine[pet] || emptySum() : houseSum,
        n: eff.n,
        score: eff.score,
        pct: eff.pct,
        verdict: eff.verdict,
        counts: eff.counts,
        last: eff.last,
        yes: pet ? [] : house.yes,
        no: pet ? [] : house.no,
        choice: kaufen === 'immer' ? 'nachkaufen' : kaufen === 'nicht' ? 'nicht' : eff.verdict,
      };
    })
    .sort((a, b) => b.score - a.score || b.n - a.n);
  const byId = new Map(sorts.map(e => [e.id, e])),
    tastes = tastesOf(db, byId, now);
  const total = k => petIds.reduce((a, pid) => a + tastes[pid][k], 0);
  return {
    pet,
    sorts,
    byId,
    rated: sorts.reduce((a, e) => a + e.n, 0),
    overview: overviewOf(db, pet, sorts, now),
    insights: insights(sorts),
    hints: hints(sorts, appetite(db, pet ? [pet] : petIds, now), pet, prefs),
    tastes,
    taste: pet ? tastes[pet] : {known: total('known'), total: total('total')},
  };
}

/* Short overview within the filter: the last feeding up to now and, per pet, the favourite variety (verdict
   „Nachkaufen“, best score) and the weakest (verdict „Nicht mehr kaufen“, worst score): {last, pets: [{id, favorite, flop}]} */
function overviewOf(db, pet, sorts, now) {
  const ids = pet ? [pet] : db.pets.map(p => p.id);
  const pick = (id, verdict, sign) =>
    sorts
      .filter(e => e.pets[id]?.verdict === verdict)
      .sort((a, b) => sign * (b.pets[id].score - a.pets[id].score))[0] || null;
  return {
    last: db.servings.reduce(
      (a, s) => (s.servedAt <= now && (!a || s.servedAt > a.servedAt) && ids.some(id => s.pets?.[id]) ? s : a),
      null,
    ),
    pets: ids.map(id => ({id, favorite: pick(id, 'nachkaufen', 1), flop: pick(id, 'nicht', -1)})),
  };
}

/* „Geschmack bekannt“ per pet: of the varieties from the last 180 days, those count as known that it has rated at
   least 3 times, or at least twice at a score below 40 */
function tastesOf(db, byId, now) {
  const out = Object.fromEntries(db.pets.map(p => [p.id, {known: 0, total: 0}])),
    seen = new Set();
  for (const s of db.servings) {
    if (s.servedAt > now || s.servedAt <= now - TASTE_SPAN) continue;
    const e = byId.get(s.productId);
    if (!e) continue;
    for (const pid of Object.keys(s.pets || {})) {
      const key = pid + '|' + e.id,
        x = e.pets[pid];
      if (!out[pid] || seen.has(key)) continue;
      seen.add(key);
      out[pid].total++;
      if (x && (x.n >= 3 || (x.n >= 2 && x.pct < NO))) out[pid].known++;
    }
  }
  return out;
}

/* Comparisons by brand, consistency and flavour, each within one food type only, plus „meist nur die Soße“.
   No statements about buying */
const sauceShare = x => (x.counts.sosse || 0) / x.n;
function insights(sorts) {
  if (sorts.reduce((a, e) => a + e.n, 0) < MIN_RATED) return [];
  const out = [];
  for (const type of TYPES) {
    const mine = sorts.filter(e => e.n && typeOf(e.product) === type);
    const compare = (kind, keyOf) => {
      const groups = new Map();
      for (const e of mine) {
        const k = keyOf(e.product);
        if (k) groups.set(k, addSum(groups.get(k) || emptySum(), e.sum));
      }
      const ranked = [...groups]
        .map(([key, sum]) => ({key, ...statOf(sum)}))
        .filter(x => x.n >= 2)
        .sort((a, b) => b.score - a.score);
      if (ranked.length >= 2) out.push({kind, type, best: ranked[0], worst: ranked.at(-1)});
    };
    compare('marke', p => p.brand);
    compare('konsistenz', p => (textureOf(p, p.texture) || textureOf(p, guessTexture(p)))?.[1]); // the field, falling back to the keywords only when it is missing
    compare('geschmack', p => keywordOf(FLAVORS, p.variety));
  }
  sorts
    .filter(e => e.n >= 2 && sauceShare(e) >= 0.5)
    .slice(0, 2)
    .forEach(e => out.push({kind: 'sosse', id: e.id}));
  return out;
}

/* Has a pet been eating noticeably worse for a few days? Reads only the 72 hours and the 30 days before them */
function appetite(db, petIds, now) {
  const A = APPETITE,
    cut = now - A.recent,
    out = [];
  const span = [
    ...ratingsOf(
      db,
      db.servings.filter(s => s.servedAt <= now && s.servedAt > cut - A.usual),
    ),
  ];
  const avg = l => Math.round(l.reduce((a, x) => a + RATINGS[x.r].score, 0) / l.length);
  for (const pid of petIds) {
    const mine = span.filter(x => x.pid === pid),
      win = mine.filter(x => x.t > cut),
      base = mine.filter(x => x.t <= cut);
    if (
      win.length < A.minRecent ||
      base.length < A.minUsual ||
      new Set(win.map(x => x.id).filter(Boolean)).size < A.minSorts
    )
      continue;
    const recent = avg(win),
      usual = avg(base);
    if (usual - recent >= A.drop && recent < A.below)
      out.push({
        kind: 'appetit',
        pet: pid,
        n: win.length,
        recent,
        usual,
        day: dayKey(Math.max(...win.map(x => x.t))),
        order: recent - usual,
      });
  }
  return out;
}

/* Hints by precedence, the most pronounced first. Except for „Appetit“, only for varieties without a manual setting */
function hints(sorts, appetites, pet, prefs) {
  const hidden = new Set(prefs.hiddenHints || []),
    out = [...appetites];
  for (const e of sorts) {
    if (e.kaufen) continue;
    if (e.verdict === 'nicht') out.push({kind: 'stop', id: e.id, pet, order: e.score});
    const sauce = Object.entries(e.pets)
      .filter(([pid, x]) => (!pet || pid === pet) && x.n >= 3 && sauceShare(x) >= 0.6)
      .sort(([, a], [, b]) => sauceShare(b) - sauceShare(a))[0];
    if (sauce) out.push({kind: 'sosse', id: e.id, pet: sauce[0], order: -sauceShare(sauce[1])});
    if (e.verdict === 'nachkaufen') out.push({kind: 'liebling', id: e.id, pet, order: -e.score});
  }
  return out
    .filter(h => !hidden.has(hintKey(h)))
    .sort((a, b) => HINTS.indexOf(a.kind) - HINTS.indexOf(b.kind) || a.order - b.order);
}

/* Evaluation page (only computed when it opens), for the pet in the filter or for the whole household and for
   a span of the last `days` calendar days (0 = everything):
     meals            every meal within the filter and the span, newest first
     count            meals, varieties tried, days fed on and how many days the span holds
     liked            of the ratings in the span, how many went down well (from YES points), as a percentage
     best, worst      the variety that goes down best and the one that goes down worst, from MIN_TOP ratings
   best and worst need two different varieties, otherwise the same one would be both. `liked` counts the very
   ratings everything else is computed from, so the ring on the page says nothing of its own. */
const MIN_TOP = 2;
export function report(db, prefs, now = Date.now(), days = 0) {
  const petIds = db.pets.map(p => p.id);
  const pet = prefs.activePet && prefs.activePet !== 'all' && petIds.includes(prefs.activePet) ? prefs.activePet : null;
  const ids = pet ? [pet] : petIds,
    mine = new Set(ids),
    products = new Map(db.products.map(p => [p.id, p]));
  const from = days ? addDays(dayStart(now), 1 - days) : -Infinity;
  const meals = db.servings.filter(s => s.servedAt >= from && ids.some(id => s.pets?.[id]));
  const rated = [...ratingsOf(db, meals)].filter(x => mine.has(x.pid));
  const sums = new Map();
  for (const x of rated) {
    if (!products.has(x.id)) continue;
    if (!sums.has(x.id)) sums.set(x.id, emptySum());
    addRating(sums.get(x.id), x);
  }
  const ranked = [...sums]
    .map(([id, sum]) => ({product: products.get(id), ...statOf(sum)}))
    .filter(x => x.n >= MIN_TOP)
    .sort((a, b) => b.score - a.score || b.n - a.n);
  const good = rated.filter(x => RATINGS[x.r].score >= YES).length;
  return {
    pet,
    days,
    n: rated.length,
    meals,
    count: {
      meals: meals.length,
      sorts: new Set(meals.map(s => s.productId).filter(id => products.has(id))).size,
      days: new Set(meals.map(s => dayKey(s.servedAt))).size,
      span: spanDays(meals, now, days),
    },
    liked: {rated: rated.length, good, pct: rated.length ? Math.round((good / rated.length) * 100) : 0},
    best: ranked[0] || null,
    worst: ranked.length > 1 ? ranked.at(-1) : null,
  };
}

/* How many days the span holds: the days asked for, or (for „Alles“) from the first meal until today. */
function spanDays(meals, now, days) {
  if (days) return days;
  if (!meals.length) return 0;
  const first = meals.reduce((a, s) => Math.min(a, s.servedAt), Infinity);
  return Math.round((dayStart(now) - dayStart(first)) / DAY) + 1;
}

/* Groups for „Einkaufen“ and the shopping list: „Gemischt“ counts towards buying again, the manual setting decides
   the group, and varieties without a rating in the filter only show up with a manual setting */
export function shopGroups(m) {
  const g = {nachkaufen: [], beobachten: [], nicht: []};
  for (const e of m.sorts) if (e.n || e.kaufen) g[e.choice === 'gemischt' ? 'nachkaufen' : e.choice].push(e);
  return g;
}

/* Calendar week from start (Monday 00:00 local time), always for the whole household:
   best       per pet the variety with the best score that week, from 2 ratings: {pet, id, n, pct}
   favorites  varieties whose verdict is „Nachkaufen“ at the weekend and was not at the start
   feeders    feedings per person (field by), the most first: {name, n} */
export function week(db, prefs, start) {
  const end = addDays(start, 7),
    house = {...prefs, activePet: 'all'};
  const before = analyze(db, house, start - 1),
    after = analyze(db, house, end - 1);
  const meals = db.servings.filter(s => s.servedAt >= start && s.servedAt < end),
    best = [];
  const sums = tally({pets: db.pets, servings: meals.filter(s => after.byId.has(s.productId))}, end);
  for (const pet of db.pets) {
    const top = [...sums.bySort]
      .filter(([, mine]) => mine[pet.id])
      .map(([id, mine]) => ({id, ...statOf(mine[pet.id])}))
      .filter(x => x.n >= 2)
      .sort((a, b) => b.score - a.score || b.n - a.n || b.last.t - a.last.t)[0];
    if (top) best.push({pet: pet.id, id: top.id, n: top.n, pct: top.pct});
  }
  const fed = new Map();
  for (const s of meals) {
    const name = (s.by || '').trim();
    if (name) fed.set(name, (fed.get(name) || 0) + 1);
  }
  return {
    start,
    end,
    meals: meals.length,
    rated: meals.filter(s => !ratingsOf(db, [s]).next().done).length,
    best,
    favorites: after.sorts
      .filter(e => e.house.verdict === 'nachkaufen' && before.byId.get(e.id)?.house.verdict !== 'nachkaufen')
      .map(e => e.id),
    feeders: [...fed].map(([name, n]) => ({name, n})).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de')),
  };
}

/* Weekly review: the previous week, visible from Monday 00:00 to Wednesday 23:59, from 5 meals and until it is
   closed. known: a week already computed, which holds as long as no meal up to its end changes */
export function review(db, prefs, now, known) {
  const monday = weekStart(now),
    start = addDays(monday, -7);
  if (now >= addDays(monday, 3) || prefs.closedWeek === dayKey(start)) return null;
  const w = known?.start === start ? known : week(db, prefs, start);
  return w.meals >= 5 ? w : null;
}

/* The household's usual feeding times from the meals (excluding treats) of the last 14 days: times at most 90
   minutes apart form one slot, which counts from 4 different days onwards. Minutes since midnight, local time:
   from the earliest, at the middle time, remind = at + 45 minutes. */
const FEED = {span: 14 * DAY, gap: 90, minDays: 4, delay: 45, lead: 60, ahead: 3};
function mealsIn(db, from, to) {
  const snack = new Set(db.products.filter(p => typeOf(p) === 'Snack').map(p => p.id));
  return db.servings.filter(s => s.servedAt > from && s.servedAt <= to && !snack.has(s.productId));
}
export function feedSlots(db, now) {
  const times = mealsIn(db, now - FEED.span, now)
      .map(s => {
        const d = new Date(s.servedAt);
        return {min: d.getHours() * 60 + d.getMinutes(), day: dayKey(s.servedAt)};
      })
      .sort((a, b) => a.min - b.min),
    groups = [];
  for (const x of times) {
    const g = groups.at(-1);
    if (g && x.min - g.at(-1).min <= FEED.gap) g.push(x);
    else groups.push([x]);
  }
  return groups
    .filter(g => new Set(g.map(x => x.day)).size >= FEED.minDays)
    .map(g => ({from: g[0].min, at: g[g.length >> 1].min, remind: g[g.length >> 1].min + FEED.delay}));
}
/* Feeding reminders for today and the two days after: one per usual time, unless a meal was already served that day
   from an hour before the earliest usual time. {key: 'day|time', at} */
export function feedReminders(db, now) {
  const out = [],
    atMinute = (i, min) => {
      const d = new Date(now);
      d.setHours(0, min, 0, 0);
      d.setDate(d.getDate() + i);
      return d.getTime();
    };
  for (const slot of feedSlots(db, now))
    for (let i = 0; i < FEED.ahead; i++) {
      const at = atMinute(i, slot.remind);
      if (at > now && !mealsIn(db, atMinute(i, slot.from - FEED.lead) - 1, at).length)
        out.push({key: `${dayKey(at)}|${slot.at}`, at});
    }
  return out;
}

export function milestones(db) {
  const ids = new Set(db.products.map(p => p.id));
  const count = {
    meals: db.servings.length,
    sorts: new Set(db.servings.map(s => s.productId).filter(id => ids.has(id))).size,
  };
  return {
    ...count,
    reached: Object.entries(MILESTONES).flatMap(([k, steps]) => steps.filter(n => count[k] >= n).map(n => `${k}:${n}`)),
  };
}
