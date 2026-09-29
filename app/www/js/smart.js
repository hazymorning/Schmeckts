/* Evaluation: analyze() returns the model everything that evaluates reads from. Pure functions; caching happens in
   derive.js. The rules are in PROJECT.md, section "Evaluation". */
import {flavoursOf, guessTexture, RATINGS, textureOf, TYPES, typeOf} from './config.js';
import {addDays, dayKey, dayStart} from './dates.js';

const DAY = 864e5;
const HALF_LIFE = 90 * DAY;
const WEIGHT_ZERO = Date.UTC(2026, 0, 1); // reference time of the weights, irrelevant to the score
export const GOOD = 70; // from this many points a rating, a variety or a share counts as going down well
export const NO = 40; // under this many a rating counts as left, and a variety as not going down well
export const MIN_RATED = 3; // from this many ratings in its span a ring of „Verlauf“ shows a share
export const WINDOW = 8; // the newest ratings per variety and pet the verdict rests on
export const VERDICT_SPAN = 180 * DAY; // ratings older than this do not count for the verdict; they still weigh in the score
const APPETITE = {recent: 72 * 36e5, usual: 30 * DAY, minRecent: 3, minUsual: 8, minSorts: 2, drop: 30, below: 50};
export const VERDICTS = {
  nachkaufen: 'Nachkaufen',
  gemischt: 'Gemischt',
  geht: 'Geht so',
  neu: 'Noch zu wenig bewertet',
  nicht: 'Nicht mehr kaufen',
};
const HINTS = ['appetit', 'stop', 'sosse', 'liebling']; // by precedence
const MILESTONES = {meals: [50, 100, 250, 500, 1000], sorts: [10, 25, 50]};
export const rOf = x => (RATINGS[x?.r] ? x.r : null); // unknown values from other devices do not count
/* Colour of a score and of a level, as the tone (good, mid, sauce, bad) and as its class. The level follows its
   points: from 70 --good, from 40 --mid, below that --sauce, at 0 --bad */
const toneOf = v => (v >= GOOD ? 'good' : v >= NO ? 'mid' : 'bad');
export const rateTone = r => (RATINGS[r].score > 0 && RATINGS[r].score < NO ? 'sauce' : toneOf(RATINGS[r].score));
export const scoreCls = v => 'r-' + toneOf(v);
export const rateCls = r => 'r-' + rateTone(r);
export const hintKey = h => (h.kind === 'appetit' ? `appetit:${h.pet}:${h.day}` : `${h.kind}:${h.id}`);

/* Sum over ratings. All weights shrink at the same rate, so points / weights does not depend on when it is
   computed: a sum holds until one of its meals changes. list: the ratings themselves, the newest first as the meals
   are kept, in the sums per variety and pet only. */
const emptySum = () => ({n: 0, points: 0, weights: 0, list: []});
function addRating(sum, x) {
  const w = Math.pow(2, (x.t - WEIGHT_ZERO) / HALF_LIFE);
  sum.n++;
  sum.points += w * RATINGS[x.r].score;
  sum.weights += w;
  sum.list.push(x);
}
function addSum(sum, other) {
  sum.n += other.n;
  sum.points += other.points;
  sum.weights += other.weights;
  return sum;
}
const scoreOf = sum => (sum.n ? +(sum.points / sum.weights).toFixed(6) : 0);
/* The ratings a verdict rests on: the newest WINDOW of a pet's ratings of a variety (the list holds them newest
   first), and of those only the ones younger than VERDICT_SPAN as of now. What a pet did months ago must not
   outweigh what it does now. */
const windowOf = (list, now) => list.slice(0, WINDOW).filter(x => x.t > now - VERDICT_SPAN);
const countsOf = list => {
  const counts = {}; // only levels that actually occur
  for (const x of list) counts[x.r] = (counts[x.r] || 0) + 1;
  return counts;
};
/* The ratings a strip shows for some varieties within the filter (strip() in views/parts.js): with a pet the window
   its verdicts rest on, with „Alle“ the windows of every pet; keys, the rating keys oldest first, and more, whether
   ratings lie beyond the windows, which the strip says with a „+“. Sorted only when asked for, since only the rows on
   screen need it. */
export function ratingsIn(m, ids) {
  const stats = ids.flatMap(id => {
    const pets = m.byId.get(id)?.pets || {};
    return m.pet ? [pets[m.pet]].filter(Boolean) : Object.values(pets);
  });
  return {
    keys: stats
      .flatMap(x => x.window)
      .sort((a, b) => a.t - b.t)
      .map(x => x.r),
    more: stats.some(x => x.list.length > x.window.length),
  };
}
/* How often ratings went down well (from GOOD points) and how often they were left (under NO) */
const countOf = (counts, on) => Object.entries(counts).reduce((a, [r, k]) => a + (on(RATINGS[r].score) ? k : 0), 0);
export const goodOf = counts => countOf(counts, v => v >= GOOD);
export const poorOf = counts => countOf(counts, v => v < NO);
/* The score orders varieties; the verdict counts the ratings of the window, as the words that explain it do
   (evidenceOf() in views/parts.js): „Nachkaufen“ from 3 ratings with at least two thirds of them good, „Nicht mehr
   kaufen“ from 2 with more than half of them left, „Geht so“ from 3 otherwise, and below that „Noch zu wenig
   bewertet“. */
const verdictOf = (n, good, poor) =>
  n >= 3 && good * 3 >= n * 2 ? 'nachkaufen' : n >= 2 && poor * 2 > n ? 'nicht' : n >= 3 ? 'geht' : 'neu';
/* A pet's stat of a variety as of now: the score over every rating, weighted; n, counts and the verdict from the
   window. pct: rounded against the noise of the weights. */
function statOf(sum, now) {
  const window = windowOf(sum.list, now),
    counts = countsOf(window),
    score = scoreOf(sum);
  return {
    n: window.length,
    score,
    pct: Math.round(score),
    counts,
    list: sum.list,
    window,
    verdict: verdictOf(window.length, goodOf(counts), poorOf(counts)),
  };
}
/* The household's stat of a variety from its pets' raw sums and stats: the score over every rating of every pet,
   weighted, and n and counts as the sum of the pets' windows, which the words read; the verdict from the pets'
   (houseVerdict()) */
function houseOf(sums, stats) {
  const all = Object.values(sums).reduce(addSum, emptySum()),
    score = scoreOf(all),
    window = Object.values(stats).flatMap(x => x.window);
  return {
    n: window.length,
    score,
    pct: Math.round(score),
    counts: countsOf(window),
    ...houseVerdict(Object.entries(stats)),
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
  const rest = pets.some(([, x]) => x.verdict === 'geht') ? 'geht' : 'neu';
  return {yes, no, verdict: yes.length ? (no.length ? 'gemischt' : 'nachkaufen') : no.length ? 'nicht' : rest};
}

/* Model  = {pet, pets: the pets in the filter, sorts, byId, rated, hints, repeats}
   Sort  = {id, product, kaufen, pets: {[petId]: Stat}, house: Stat with yes/no, choice, plus the values within the
            filter: n, score, pct, verdict, counts, yes, no, and total, every rating within the filter, the window aside}
   Stat  = {n, score, pct, verdict, counts, list: the ratings, window: those the verdict rests on, per pet only}
   repeats: per pet in the filter, how its meals went shortly after the same variety and otherwise (repeatsOf()) */
export function analyze(db, prefs, now, sums = tally(db, now)) {
  const petIds = db.pets.map(p => p.id);
  const pet = prefs.activePet && prefs.activePet !== 'all' && petIds.includes(prefs.activePet) ? prefs.activePet : null;
  const sorts = db.products
    .map(product => {
      const mine = sums.bySort.get(product.id) || {},
        pets = {};
      for (const pid of petIds) if (mine[pid]) pets[pid] = statOf(mine[pid], now);
      const house = houseOf(mine, pets);
      const eff = pet ? pets[pet] || statOf(emptySum(), now) : house;
      const kaufen = product.kaufen === 'immer' || product.kaufen === 'nicht' ? product.kaufen : null;
      return {
        id: product.id,
        product,
        kaufen,
        pets,
        house,
        total: pet ? mine[pet]?.n || 0 : petIds.reduce((a, pid) => a + (mine[pid]?.n || 0), 0),
        n: eff.n,
        score: eff.score,
        pct: eff.pct,
        verdict: eff.verdict,
        counts: eff.counts,
        yes: pet ? [] : house.yes,
        no: pet ? [] : house.no,
        choice: kaufen === 'immer' ? 'nachkaufen' : kaufen === 'nicht' ? 'nicht' : eff.verdict,
      };
    })
    .sort((a, b) => b.score - a.score || b.n - a.n);
  const byId = new Map(sorts.map(e => [e.id, e]));
  let repeats = null; // worked out the first time it is asked for: only „Vorlieben“ reads it
  return {
    pet,
    pets: pet ? [pet] : petIds,
    sorts,
    byId,
    rated: sorts.reduce((a, e) => a + e.n, 0),
    hints: hints(sorts, appetite(db, pet ? [pet] : petIds, now), pet, prefs),
    get repeats() {
      return (repeats ||= repeatsOf(db, pet ? [pet] : petIds, now));
    },
  };
}

/* „Vorlieben“: what holds across varieties, never one variety's verdict told again (that is „Einkaufen“).
   Comparisons by consistency, flavour and brand, each within one food type: a group counts with at least two
   varieties rated at least twice each, and groups are measured by how often they went down well. Then two habits,
   „nur die Soße geleckt“ and „erst gierig“, where at least two varieties show it at least half of the time, and
   whether a pet likes a change. */
const shareOf = (x, r) => (x.counts[r] || 0) / x.n;
const sauceShare = x => shareOf(x, 'sosse');
const GAP = 0.3,
  TWO = 2; // varieties in a group, ratings of a variety
/* The groups a variety belongs to in each dimension: its consistency (the field, falling back to the keywords only
   when it is missing), every flavour its name holds, and its brand */
const DIMENSIONS = [
  ['konsistenz', p => [(textureOf(p, p.texture) || textureOf(p, guessTexture(p)))?.[1]]],
  ['geschmack', p => flavoursOf(p.variety)],
  ['marke', p => [p.brand]],
];
const HABITS = ['sosse', 'eager']; // levels that say how a variety is eaten

/* The profile: per food type the dimensions in a fixed order (consistency or treat type, flavour, brand), each with
   its groups ranked by how often they went down well, the best first, from two groups on. A dimension is clear
   („deutlich“) where its best and its weakest group lie at least GAP apart and every variety of the one did better
   than every variety of the other, so no single variety can carry it. A variety naming two flavours („Huhn &
   Thunfisch“) counts in both groups; standing in the best and the weakest at once, it keeps that comparison from
   being clear, which is meant.
   [{kind, type, groups: [{key, ids, n, good, share, low, high}], gap, clear}] */
export function profile(m) {
  const out = [],
    rated = m.sorts.filter(e => e.n >= TWO);
  for (const type of TYPES) {
    const mine = rated.filter(e => typeOf(e.product) === type);
    for (const [kind, keysOf] of DIMENSIONS) {
      const groups = new Map();
      for (const e of mine) for (const k of keysOf(e.product)) if (k) groups.set(k, [...(groups.get(k) || []), e]);
      const ranked = [...groups]
        .filter(([, l]) => l.length >= TWO)
        .map(([key, l]) => groupOf(key, l))
        .sort((a, b) => b.share - a.share || b.n - a.n || a.key.localeCompare(b.key, 'de'));
      if (ranked.length < TWO) continue;
      const best = ranked[0],
        worst = ranked.at(-1),
        gap = best.share - worst.share;
      out.push({kind, type, groups: ranked, gap, clear: gap >= GAP && best.low > worst.high});
    }
  }
  return out;
}
/* A group of varieties: how many ratings, how many of them went down well, and the share of the weakest and the
   strongest variety in it */
function groupOf(key, l) {
  const n = l.reduce((a, e) => a + e.n, 0),
    good = l.reduce((a, e) => a + goodOf(e.counts), 0),
    shares = l.map(e => goodOf(e.counts) / e.n);
  return {key, ids: l.map(e => e.id), n, good, share: good / n, low: Math.min(...shares), high: Math.max(...shares)};
}

/* How varieties are eaten: „nur die Soße geleckt“ and „erst gierig“ where at least two varieties rated at least twice
   show it at least half of the time, naming up to three, the most pronounced first. [{kind, sorts: [{id, k, n}]}] */
export function habits(m) {
  const out = [],
    rated = m.sorts.filter(e => e.n >= TWO);
  for (const kind of HABITS) {
    const l = rated.filter(e => shareOf(e, kind) >= 0.5).sort((a, b) => shareOf(b, kind) - shareOf(a, kind));
    if (l.length >= TWO) out.push({kind, sorts: l.slice(0, 3).map(e => ({id: e.id, k: e.counts[kind], n: e.n}))});
  }
  return out;
}

/* Abwechslung, per pet: its rated meals that are not treats, split into those that came shortly after the same variety
   (the pet had it within its REPEAT.within meals before, treats left out, a meal of unknown food taking one of the
   places) and the rest. Only meals up to now, of varieties there are. {[petId]: {same: {n, good}, other: {n, good}}} */
const REPEAT = {within: 3};
function repeatsOf(db, petIds, now) {
  const snack = new Set(),
    known = new Set(), // the other varieties
    out = {},
    before = {}; // per pet the varieties of its last meals, the newest last
  for (const p of db.products) (typeOf(p) === 'Snack' ? snack : known).add(p.id);
  for (const id of petIds) {
    out[id] = {same: {n: 0, good: 0}, other: {n: 0, good: 0}};
    before[id] = [];
  }
  for (let i = db.servings.length - 1; i >= 0; i--) {
    // the oldest first, so the meals before a meal have been seen when it comes
    const s = db.servings[i];
    if (s.servedAt > now || snack.has(s.productId)) continue;
    for (const pid in s.pets) {
      if (!out[pid]) continue;
      const r = rOf(s.pets[pid]);
      if (r && known.has(s.productId)) {
        const side = out[pid][before[pid].includes(s.productId) ? 'same' : 'other'];
        side.n++;
        if (RATINGS[r].score >= GOOD) side.good++;
      }
      before[pid].push(s.productId || null);
      if (before[pid].length > REPEAT.within) before[pid].shift();
    }
  }
  return out;
}
/* Whether a pet likes a change: its meals shortly after the same variety against the rest, both from VARIETY.min
   ratings. Their shares of good ones VARIETY.gap points apart make a habit: lower after the same variety, it likes a
   change („abwechslung“); higher, it is a creature of habit („gewohnheit“). One per pet in the filter.
   [{pet, kind, same: {n, good}, other: {n, good}}] */
const VARIETY = {min: 6, gap: 25};
export function variety(m) {
  const out = [];
  for (const [pet, {same, other}] of Object.entries(m.repeats)) {
    if (same.n < VARIETY.min || other.n < VARIETY.min) continue;
    const apart = 100 * (same.good * other.n - other.good * same.n), // in points, times both counts: exact
      far = VARIETY.gap * same.n * other.n;
    if (apart <= -far) out.push({pet, kind: 'abwechslung', same, other});
    else if (apart >= far) out.push({pet, kind: 'gewohnheit', same, other});
  }
  return out;
}

/* Neuheit, per pet in the filter: whether new food goes down well at first and wears off, or needs a while. For every
   variety that is no treat and the pet rated at least twice, the oldest rating is the first time and the rest come
   after; over such varieties, how many went down well the first time (from GOOD) against how many of the later
   ratings did. Every rating counts, older ones than VERDICT_SPAN too: this is about first encounters. From
   NOVELTY.minSorts varieties and NOVELTY.minLater later ratings; the two shares NOVELTY.gap points apart make a
   habit: a higher first share is curiosity („neugier“), a lower one a slow start („anlauf“). Whole numbers, as
   variety() has it. [{pet, kind, first: {n, good}, later: {n, good}}] */
const NOVELTY = {minSorts: 4, minLater: 8, gap: 30};
export function novelty(m) {
  const out = [],
    good = r => RATINGS[r.r].score >= GOOD;
  for (const pet of m.pets) {
    const first = {n: 0, good: 0},
      later = {n: 0, good: 0};
    for (const e of m.sorts) {
      const x = e.pets[pet];
      if (!x || x.list.length < 2 || typeOf(e.product) === 'Snack') continue;
      const [head, ...rest] = [...x.list].sort((a, b) => a.t - b.t);
      first.n++;
      if (good(head)) first.good++;
      later.n += rest.length;
      later.good += rest.filter(good).length;
    }
    if (first.n < NOVELTY.minSorts || later.n < NOVELTY.minLater) continue;
    const apart = 100 * (first.good * later.n - later.good * first.n), // in points, times both counts: exact
      far = NOVELTY.gap * first.n * later.n;
    if (apart >= far) out.push({pet, kind: 'neugier', first, later});
    else if (apart <= -far) out.push({pet, kind: 'anlauf', first, later});
  }
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
  const avg = l => Math.round(l.reduce((a, x) => a + RATINGS[x.r].score, 0) / l.length),
    good = l => l.filter(x => RATINGS[x.r].score >= GOOD).length;
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
        good: good(win),
        before: base.length,
        goodBefore: good(base),
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

/* „Verlauf“ (only computed when it opens), for the pet in the filter or for the whole household and for a span of
   the last `days` calendar days (0 = everything):
     meals            every meal within the filter and the span, newest first
     count            meals, varieties tried, days fed on and how many days the span holds
     liked            of the ratings in the span, how many went down well (from GOOD points), as a percentage
     open             how many of its meals are not rated yet
     feeders          meals per person (field by), the most first: [{name, n}]; not counted without a name
   `liked` counts the same ratings as everything else, so the rings on the page add no separate figure. */
export function report(db, prefs, now = Date.now(), days = 0) {
  const petIds = db.pets.map(p => p.id);
  const pet = prefs.activePet && prefs.activePet !== 'all' && petIds.includes(prefs.activePet) ? prefs.activePet : null;
  const ids = pet ? [pet] : petIds,
    mine = new Set(ids),
    products = new Set(db.products.map(p => p.id));
  const from = days ? addDays(dayStart(now), 1 - days) : -Infinity;
  const meals = db.servings.filter(s => s.servedAt >= from && ids.some(id => s.pets?.[id]));
  const rated = [...ratingsOf(db, meals)].filter(x => mine.has(x.pid));
  const good = rated.filter(x => RATINGS[x.r].score >= GOOD).length,
    fed = new Map();
  for (const s of meals) {
    const name = (s.by || '').trim();
    if (name) fed.set(name, (fed.get(name) || 0) + 1);
  }
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
    open: meals.filter(s => !ids.some(id => rOf(s.pets[id]))).length,
    feeders: [...fed].map(([name, n]) => ({name, n})).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de')),
  };
}

/* What changed within the last `days` calendar days, within the pet filter: the varieties whose verdict became
   „Nachkaufen“ or „Nicht mehr kaufen“ in that span. The verdict as it stood when the span began comes from the ratings
   the model holds per pet, those before its first day, and counts like any other, its window and its span measured
   from that day. {nachkaufen: [id], nicht: [id]}, the best first and the clearest first. after: the model now, where
   the caller holds it already. */
export function changes(db, prefs, now, days, after = analyze(db, prefs, now)) {
  const start = addDays(dayStart(now), 1 - days);
  const earlier = e => {
    const pets = Object.entries(e.pets)
      .map(([pid, x]) => {
        const sum = emptySum();
        for (const r of x.list) if (r.t < start) addRating(sum, r);
        return [pid, statOf(sum, start)];
      })
      .filter(([, x]) => x.list.length);
    return after.pet ? (pets.find(([pid]) => pid === after.pet)?.[1].verdict ?? 'neu') : houseVerdict(pets).verdict;
  };
  const became = verdict => after.sorts.filter(e => e.verdict === verdict && earlier(e) !== verdict);
  return {
    nachkaufen: became('nachkaufen').map(e => e.id),
    nicht: became('nicht')
      .sort((a, b) => a.score - b.score || b.n - a.n)
      .map(e => e.id),
  };
}

/* How many days the span holds: the days asked for, or (for „Alles“) from the first meal until today. */
function spanDays(meals, now, days) {
  if (days) return days;
  if (!meals.length) return 0;
  const first = meals.reduce((a, s) => Math.min(a, s.servedAt), Infinity);
  return Math.round((dayStart(now) - dayStart(first)) / DAY) + 1;
}

/* Groups for „Einkaufen“ and the shopping list: „Nachkaufen“ (with „Gemischt“), best first, „Nicht mehr kaufen“,
   the clearest first, „Geht so“ and „Noch zu wenig bewertet“. The manual setting decides the group, and varieties
   without a rating in the filter only show up with one; a variety whose ratings are all older than the window stands
   under „Noch zu wenig bewertet“. */
export function shopGroups(m) {
  const g = {nachkaufen: [], nicht: [], geht: [], neu: []};
  for (const e of m.sorts)
    if (e.choice === 'nachkaufen' || e.choice === 'gemischt') g.nachkaufen.push(e);
    else if (e.choice === 'nicht') g.nicht.push(e);
    else if (e.total) g[e.choice].push(e);
  g.nicht.sort((a, b) => a.score - b.score || b.n - a.n);
  return g;
}

/* The household's usual feeding times from the meals (excluding treats) of the last 14 days: times at most 90
   minutes apart form one slot, which counts from 4 different days onwards. Minutes since midnight, local time:
   from the earliest, at the middle time, remind = at + 45 minutes. With pets, only their meals count. */
const FEED = {span: 14 * DAY, gap: 90, minDays: 4, delay: 45, lead: 60, ahead: 3};
function mealsIn(db, from, to, pets) {
  const snack = new Set(db.products.filter(p => typeOf(p) === 'Snack').map(p => p.id));
  return db.servings.filter(
    s =>
      s.servedAt > from &&
      s.servedAt <= to &&
      !snack.has(s.productId) &&
      (!pets || Object.keys(s.pets || {}).some(id => pets.includes(id))),
  );
}
export function feedSlots(db, now, pets) {
  const times = mealsIn(db, now - FEED.span, now, pets)
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
   from an hour before the earliest usual time. {key: 'day|time', at, since}: since is where that hour begins, from
   when a meal served on another phone makes the reminder unnecessary as well (logic/reminders.js). */
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
      const at = atMinute(i, slot.remind),
        since = atMinute(i, slot.from - FEED.lead);
      if (at > now && !mealsIn(db, since - 1, at).length) out.push({key: `${dayKey(at)}|${slot.at}`, at, since});
    }
  return out;
}

/* Today's usual times a meal has been served for since, as the keys of their reminders: a reminder already shown for
   one of them can go */
export function fedToday(db, now) {
  const today = dayStart(now);
  return feedSlots(db, now)
    .filter(slot => mealsIn(db, today + (slot.from - FEED.lead) * 6e4 - 1, now).length)
    .map(slot => `${dayKey(now)}|${slot.at}`);
}

/* When the next meal of the pets usually comes, from their usual times: {at} later today, {at, tomorrow: true} when
   today's are over, {at, due: true} while one of them is on (from its earliest time to an hour after the reminder)
   and nothing has been served for it yet. A time counts as served like a reminder does, by a meal from an hour
   before it. null without usual times. at: minutes since midnight. */
export function nextMeal(db, now, pets) {
  const slots = feedSlots(db, now, pets),
    today = dayStart(now),
    minute = (now - today) / 6e4,
    meals = mealsIn(db, today - FEED.lead * 6e4 - 1, now, pets); // from an hour before midnight, for a time just after it
  for (const slot of slots) {
    if (meals.some(s => s.servedAt >= today + (slot.from - FEED.lead) * 6e4)) continue;
    if (minute < slot.from) return {at: slot.at};
    if (minute <= slot.remind + FEED.lead) return {at: slot.at, due: true};
  }
  return slots.length ? {at: slots[0].at, tomorrow: true} : null;
}

/* The next meal milestone and how many meals are left to it, null past the last one */
export function nextMilestone(db) {
  const n = MILESTONES.meals.find(x => x > db.servings.length);
  return n ? {n, left: n - db.servings.length} : null;
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
