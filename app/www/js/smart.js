/* Evaluation: analyze() returns the model everything that evaluates reads from. Pure functions; caching happens in
   derive.js. The rules are in PROJECT.md, section "Evaluation". */
import {flavoursOf, guessTexture, OBSERVATIONS, RATINGS, textureOf, TYPES, typeOf} from './config.js';
import {addDays, dayKey, dayStart} from './dates.js';

const DAY = 864e5;
const HALF_LIFE = 90 * DAY;
const WEIGHT_ZERO = Date.UTC(2026, 0, 1); // reference time of the weights, irrelevant to the score
export const GOOD = 70; // from this many points a rating, a variety or a share counts as going down well
export const NO = 40; // under this many a rating counts as left, and a variety as not going down well
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
  let repeats = null; // worked out the first time it is asked for: only „Worauf es ankommt“ reads it
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

/* „Worauf es ankommt“: what holds across varieties, never one variety's verdict told again (that is „Einkaufen“).
   Comparisons by consistency, flavour and brand, each within one food type: a group counts with at least two
   varieties rated at least twice each, and groups are measured by how often they went down well. Then two habits,
   „nur die Soße geleckt“ and „nur ein bissl gefressen“, where at least two varieties show it at least half of the time, and
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

/* How varieties are eaten: „nur die Soße geleckt“ and „nur ein bissl gefressen“ where at least two varieties rated at least twice
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
        // what was noted about the pet in the same hours, which the hint names beside the ratings
        seen: [
          ...new Set(
            notesOf(db)
              .filter(o => o.at > cut && o.at <= now && o.pets?.[pid])
              .map(o => o.kind),
          ),
        ],
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

/* Groups for „Einkaufen“ and the shopping list: „Nachkaufen“ (with „Gemischt“), best first, „Nicht mehr kaufen“,
   the clearest first, both by likingOf() as on „Vorlieben“ and the verdict's own first, „Geht so“ and „Noch zu wenig
   bewertet“. The manual
   setting decides the group, and varieties without a rating in the filter only show up with one; a variety whose
   ratings are all older than the window stands under „Noch zu wenig bewertet“. */
export function shopGroups(m) {
  const g = {nachkaufen: [], nicht: [], geht: [], neu: []};
  for (const e of m.sorts)
    if (e.choice === 'nachkaufen' || e.choice === 'gemischt') g.nachkaufen.push(e);
    else if (e.choice === 'nicht') g.nicht.push(e);
    else if (e.total) g[e.choice].push(e);
  const like = new Map([...g.nachkaufen, ...g.nicht].map(e => [e, likingOf(e)])),
    own = verdict => e => (e.verdict === verdict ? 0 : 1); // the verdict's own before „Gemischt“ and a setting by hand
  g.nachkaufen.sort((a, b) => own('nachkaufen')(a) - own('nachkaufen')(b) || like.get(b) - like.get(a) || b.n - a.n);
  g.nicht.sort((a, b) => own('nicht')(a) - own('nicht')(b) || like.get(a) - like.get(b) || b.n - a.n);
  return g;
}

/* „Vorlieben“: what the ratings say about the meals, ranked and told in words, within the pet filter. Treats and dry
   food are left out everywhere on it: a treat is nearly always eaten, and dry food stands in the bowl all day, so
   neither says much beside a meal. */
export const UNRANKED = ['Snack', 'Trockenfutter'];
export const ranks = product => !UNRANKED.includes(typeOf(product));
const RANK = {prior: 2, middle: 50, flop: 50, flat: 1.3, flatSorts: 4, flatRatings: 24};
const pointsIn = counts => Object.entries(counts).reduce((a, [r, k]) => a + RATINGS[r].score * k, 0);
/* How well a variety goes down, to order it within its side: the mean points of the ratings its verdict rests on, as
   if two neutral ratings of 50 points stood beside them, so evidence beats luck (three times „sofort leer“ gives 80,
   eight times 90). Never shown. x: {n, counts} */
export const likingOf = x => (pointsIn(x.counts) + RANK.prior * RANK.middle) / (x.n + RANK.prior);
/* The side a variety stands on, from its verdict within the filter, so the page never contradicts „Einkaufen“ or a
   hint: „Nachkaufen“ is a top, „Nicht mehr kaufen“ a flop, „Gemischt“ splits the pets and „Noch zu wenig bewertet“ is
   thin. „Geht so“ is a top where more than half of its ratings went down well, a flop where fewer than half did and
   less than half the bowl was eaten on average, and in between otherwise. x: {verdict, n, counts} */
export function sideOf(x) {
  if (!x.n || x.verdict === 'neu') return 'thin';
  if (x.verdict === 'gemischt') return 'split';
  if (x.verdict === 'nachkaufen') return 'top';
  if (x.verdict === 'nicht') return 'flop';
  const good = goodOf(x.counts) * 2;
  if (good > x.n) return 'top';
  return good < x.n && pointsIn(x.counts) < RANK.flop * x.n ? 'flop' : 'mid';
}
/* The order within a side: the verdict's own before „Geht so“, then by liking, the best first among tops and the
   worst first among flops, then the one with more ratings. like: each variety's liking, worked out once. */
const sided = (dir, like) => (a, b) =>
  (a.verdict === 'geht') - (b.verdict === 'geht') ||
  dir * (like.get(b) - like.get(a)) ||
  b.n - a.n ||
  (a.id < b.id ? -1 : 1);
/* The ranked varieties with a rating in their window, by side: {top, flop, mid, split, thin, settled, rated, stale,
   flat, trials}. split: the pets disagree, those furthest apart first. settled counts every variety with a verdict,
   rated every one with a rating within the filter, and stale says that all of their ratings lie beyond the window.
   flat: the varieties differ no more than chance would make them (flatOf()). trials: the thin varieties closest to a
   verdict (trialsOf()). */
export function ranking(m, now) {
  let flat, trials; // worked out the first time they are asked for: the card asks for neither while it has a side
  const like = new Map(),
    r = {
      top: [],
      flop: [],
      mid: [],
      split: [],
      thin: [],
      settled: 0,
      rated: 0,
      stale: false,
      get flat() {
        return (flat ??= flatOf([...r.top, ...r.mid, ...r.flop, ...r.split]));
      },
      get trials() {
        return (trials ??= trialsOf(m, now, r.thin, like));
      },
    };
  for (const e of m.sorts)
    if (e.total && ranks(e.product)) {
      r.rated++;
      if (e.n) r[sideOf(e)].push(e);
    }
  for (const e of [...r.top, ...r.flop, ...r.split, ...r.thin]) like.set(e, likingOf(e));
  r.top.sort(sided(1, like));
  r.flop.sort(sided(-1, like));
  // the pets furthest apart first
  const spread = e => {
    const l = m.pets.filter(pid => e.pets[pid]?.n).map(pid => likingOf(e.pets[pid]));
    return Math.max(...l) - Math.min(...l);
  };
  r.split.sort((a, b) => spread(b) - spread(a) || sided(1, like)(a, b));
  r.settled = r.top.length + r.flop.length + r.mid.length + r.split.length;
  r.stale = r.rated > 0 && !r.settled && !r.thin.length;
  return r;
}
/* Whether the varieties differ no more than coin flips would make them: the index of dispersion of their shares of
   good ratings, from RANK.flatSorts varieties and RANK.flatRatings ratings. Simulated, it says so for a cat that eats
   everything alike on most looks, and for real differences on hardly any. */
function flatOf(list) {
  const n = list.reduce((a, e) => a + e.n, 0),
    good = list.reduce((a, e) => a + goodOf(e.counts), 0);
  if (list.length < RANK.flatSorts || n < RANK.flatRatings || !good || good === n) return false;
  const p = good / n,
    chi = list.reduce((a, e) => a + (goodOf(e.counts) - e.n * p) ** 2 / (e.n * p * (1 - p)), 0);
  return chi / (list.length - 1) <= RANK.flat;
}
/* Varieties still being tried: thin, first rated within TRIAL.span, at least half of them good so far and not set to
   „nicht“. need: how many more ratings the pet closest to a verdict needs, which is exact, since from three every
   variety has one. The closest first, all good so far before the rest, then by liking. [{e, need, pet}] */
const TRIAL = {span: 60 * DAY, need: 3};
function trialsOf(m, now, thin, like) {
  const out = [];
  for (const e of thin) {
    if (e.kaufen === 'nicht' || goodOf(e.counts) * 2 < e.n) continue;
    const mine = m.pets.map(pid => [pid, e.pets[pid]]).filter(([, x]) => x?.n);
    if (!mine.length || Math.min(...mine.map(([, x]) => x.list.at(-1).t)) < now - TRIAL.span) continue;
    const [pet, x] = mine.reduce((a, b) => (b[1].n > a[1].n ? b : a));
    out.push({e, need: Math.max(1, TRIAL.need - x.n), pet});
  }
  const all = t => (goodOf(t.e.counts) === t.e.n ? 0 : 1); // all good so far before the rest
  return out.sort(
    (a, b) => a.need - b.need || all(a) - all(b) || like.get(b.e) - like.get(a.e) || (a.e.id < b.e.id ? -1 : 1),
  );
}

/* „Wie läuft’s gerade?“, per pet in the filter: its ratings of ranked food in the last 28 days against the 56 days
   before, from TREND.min on each side. Under TREND.calm points apart in the share of good ones it is the same
   („gleich“); a clear change („deutlich“) takes TREND.clear points and TREND.z pooled standard errors, so a run of
   chance is not news; anything else is „etwas“. For a clear change the cause: the varieties the pet had in both spans
   (from TREND.usual ratings on each side) moving the same way say it is the pet („tier“), holding within TREND.calm
   say it is the food („futter“), and then behind names up to TREND.behind varieties new in the last 28 days, rated
   at least twice, that went the way of the change, the most rated first.
   [{pet, kind, dir, recent: {n, good}, before: {n, good}, cause, behind: [id]}] */
const TREND = {recent: 28 * DAY, before: 56 * DAY, min: 10, calm: 10, clear: 20, z: 2, usual: 6, behind: 2};
const goodCount = list => ({n: list.length, good: list.filter(x => RATINGS[x.r].score >= GOOD).length});
/* How far apart two shares of good ratings lie, in points times both counts, so a threshold is met exactly: compare
   it with points * of. */
const shareGap = (a, b) => ({apart: 100 * (a.good * b.n - b.good * a.n), of: a.n * b.n});
export function trend(db, m, now) {
  const meal = new Set(db.products.filter(ranks).map(p => p.id)),
    cut = now - TREND.recent,
    from = cut - TREND.before,
    per = new Map(m.pets.map(pid => [pid, {recent: [], before: []}]));
  for (const s of db.servings) {
    if (s.servedAt <= from) break; // the meals are kept newest first
    if (s.servedAt > now || !meal.has(s.productId)) continue;
    for (const [pid, x] of per) {
      const r = rOf(s.pets?.[pid]);
      if (r) x[s.servedAt > cut ? 'recent' : 'before'].push({r, id: s.productId});
    }
  }
  const out = [];
  for (const [pet, {recent, before}] of per) {
    const now4 = goodCount(recent),
      then = goodCount(before);
    if (now4.n < TREND.min || then.n < TREND.min) continue;
    const {apart, of} = shareGap(now4, then),
      p = (now4.good + then.good) / (now4.n + then.n),
      se = 100 * Math.sqrt(p * (1 - p) * (1 / now4.n + 1 / then.n)),
      dir = apart < 0 ? -1 : 1,
      kind =
        Math.abs(apart) < TREND.calm * of
          ? 'gleich'
          : Math.abs(apart) >= TREND.clear * of && Math.abs(apart) >= TREND.z * se * of
            ? 'deutlich'
            : 'etwas';
    out.push({
      pet,
      kind,
      dir,
      recent: now4,
      before: then,
      ...(kind === 'deutlich' ? causeOf(recent, before, dir) : {}),
    });
  }
  return out;
}
function causeOf(recent, before, dir) {
  const old = new Set(before.map(x => x.id)),
    known = new Set(recent.map(x => x.id).filter(id => old.has(id))),
    a = goodCount(recent.filter(x => known.has(x.id))),
    b = goodCount(before.filter(x => known.has(x.id)));
  if (a.n < TREND.usual || b.n < TREND.usual) return {cause: null, behind: []};
  const {apart, of} = shareGap(a, b);
  if (apart * dir >= TREND.clear * of) return {cause: 'tier', behind: []};
  if (Math.abs(apart) >= TREND.calm * of) return {cause: null, behind: []};
  const fresh = new Map();
  for (const x of recent) if (!old.has(x.id)) fresh.set(x.id, [...(fresh.get(x.id) || []), x]);
  const behind = [...fresh]
    .map(([id, l]) => ({id, ...goodCount(l)}))
    .filter(x => x.n >= 2 && (dir < 0 ? x.good * 2 < x.n : x.good * 2 > x.n))
    .sort((x, y) => y.n - x.n || (x.id < y.id ? -1 : 1))
    .slice(0, TREND.behind)
    .map(x => x.id);
  return {cause: 'futter', behind};
}

/* What moved within the last MOVE.days calendar days: each ranked variety's side as it stood when they began, from the
   ratings before that day with the window and its 180 days measured from then (with „Alle“ the pets' windows and
   their household verdict, as now). A move between top, middle and flop counts only where MOVE.before ratings came
   before, MOVE.since since, and their shares of good ones lie MOVE.gap points apart the way it moved: a variety drifting
   across the line of „Nachkaufen“ on the same ratings is no news. fresh: the tops and flops new on their side, from
   nothing, from thin, from split or by such a move, and only once MOVE.from varieties had settled back then, or in a
   young diary everything would be new. cooled: tops that went down, warmed: what became a top, each with the ratings
   before and since. {fresh: Set, cooled: [{id, before, since}], warmed: [...]} */
const MOVE = {days: 30, from: 3, before: 3, since: 2, gap: 30};
const LEVEL = {flop: 0, mid: 1, top: 2};
export function moves(m, now, r) {
  const start = addDays(dayStart(now), 1 - MOVE.days),
    side = new Map(['top', 'flop', 'mid', 'split', 'thin'].flatMap(k => r[k].map(e => [e.id, k]))),
    out = {fresh: new Set(), cooled: [], warmed: []},
    seen = [];
  let settled = 0;
  for (const e of m.sorts) {
    if (!side.has(e.id)) continue;
    const pets = m.pets
      .filter(pid => e.pets[pid])
      .map(pid => {
        const sum = emptySum();
        for (const x of e.pets[pid].list) if (x.t < start) addRating(sum, x);
        return [pid, statOf(sum, start)];
      })
      .filter(([, x]) => x.list.length);
    const window = pets.flatMap(([, x]) => x.window),
      before = {n: window.length, counts: countsOf(window)},
      was = pets.length
        ? sideOf({...before, verdict: m.pet ? pets[0][1].verdict : houseVerdict(pets).verdict})
        : 'thin';
    if (was !== 'thin') settled++;
    const since = m.pets.flatMap(pid => (e.pets[pid]?.list || []).filter(x => x.t >= start));
    seen.push({e, was, is: side.get(e.id), before, since: {n: since.length, counts: countsOf(since)}});
  }
  const moved = ({was, is, before, since}) =>
    was in LEVEL &&
    is in LEVEL &&
    before.n >= MOVE.before &&
    since.n >= MOVE.since &&
    100 * (goodOf(since.counts) * before.n - goodOf(before.counts) * since.n) * Math.sign(LEVEL[is] - LEVEL[was]) >=
      MOVE.gap * since.n * before.n;
  for (const x of seen) {
    if (x.was === x.is) continue;
    const real = moved(x);
    if ((x.is === 'top' || x.is === 'flop') && settled >= MOVE.from && (!(x.was in LEVEL) || real))
      out.fresh.add(x.e.id);
    if (real && x.was === 'top') out.cooled.push({id: x.e.id, before: x.before, since: x.since});
    if (real && x.is === 'top') out.warmed.push({id: x.e.id, before: x.before, since: x.since});
  }
  return out;
}

/* „Als Nächstes“: what to put in the bowl. missed: varieties whose newest NEXT.newest ratings per pet, however old,
   say „Nachkaufen“ for a pet and „Nicht mehr kaufen“ for none, not served within the filter for NEXT.away, neither
   set to „nicht“ nor a flop nor „Nicht mehr kaufen“ for a pet now, leaving out the tops shown, the best first, at
   most NEXT.missed; their window may have emptied meanwhile, which is why they are told here at all. by: the pets
   that say „Nachkaufen“, whose ratings n and counts are. retry: a variety left at its only rating, by the one pet that had it within NEXT.span,
   where novelty() says that pet needs a while with new food, at most NEXT.retry. {missed: [{id, at, by, n, counts}],
   retry: [{id, pet}]}. last: when each variety was last served within the filter; slow: the pets that need a while. */
const NEXT = {newest: 8, away: 42 * DAY, missed: 2, span: 60 * DAY, retry: 2, shown: 5};
export function nextUp(m, now, r, last, slow) {
  const shown = new Set(r.top.slice(0, NEXT.shown).map(e => e.id)),
    flop = new Set(r.flop.map(e => e.id)),
    missed = [],
    retry = [];
  for (const e of m.sorts) {
    if (!ranks(e.product) || e.kaufen === 'nicht' || shown.has(e.id) || flop.has(e.id)) continue;
    const mine = m.pets.map(pid => [pid, e.pets[pid]]).filter(([, x]) => x?.list.length);
    if (!mine.length) continue;
    const at = last.get(e.id) || 0,
      newest = mine.map(([pid, x]) => {
        const l = x.list.slice(0, NEXT.newest),
          counts = countsOf(l);
        return {pid, l, verdict: verdictOf(l.length, goodOf(counts), poorOf(counts))};
      }),
      yes = newest.filter(x => x.verdict === 'nachkaufen');
    // not what is left in the bowl now, whatever it was once
    if (
      at &&
      at <= now - NEXT.away &&
      yes.length &&
      !mine.some(([, x]) => x.verdict === 'nicht') &&
      !newest.some(x => x.verdict === 'nicht')
    ) {
      const l = yes.flatMap(x => x.l);
      missed.push({id: e.id, at, by: yes.map(x => x.pid), n: l.length, counts: countsOf(l)});
    }
    const [pid, x] = mine[0];
    if (
      mine.length === 1 &&
      x.list.length === 1 &&
      slow.includes(pid) &&
      RATINGS[x.list[0].r].score < NO &&
      x.list[0].t > now - NEXT.span
    )
      retry.push({id: e.id, pet: pid, t: x.list[0].t});
  }
  return {
    missed: missed.sort((a, b) => likingOf(b) - likingOf(a) || a.at - b.at).slice(0, NEXT.missed),
    retry: retry
      .sort((a, b) => b.t - a.t)
      .slice(0, NEXT.retry)
      .map(({id, pet}) => ({id, pet})),
  };
}

/* „Worauf es ankommt“ on „Vorlieben“: the comparisons of its page (profile()) of the ranked types whose best and weakest group lie
   GAP apart, the clear ones first, then the widest, one per dimension, at most PATTERNS. Their words follow the same
   rule as there, so the two pages never disagree. */
const PATTERNS = 2;
export function patterns(dims) {
  const seen = new Set();
  return dims
    .filter(d => !UNRANKED.includes(d.type) && d.gap >= GAP)
    .sort((a, b) => b.clear - a.clear || b.gap - a.gap)
    .filter(d => !seen.has(d.kind) && seen.add(d.kind))
    .slice(0, PATTERNS);
}

/* What the lists of „Vorlieben“ rest on: the window's ratings of the settled varieties within the filter, the oldest
   of them, and the types left out that have ratings within it. {n, first, left: [type]} */
export function basis(m, r) {
  let n = 0,
    first = Infinity;
  for (const e of [...r.top, ...r.flop, ...r.mid, ...r.split]) {
    n += e.n;
    for (const pid of m.pets) for (const x of e.pets[pid]?.window || []) first = Math.min(first, x.t);
  }
  const left = new Set(m.sorts.filter(e => e.total && !ranks(e.product)).map(e => typeOf(e.product)));
  return {n, first, left: UNRANKED.filter(t => left.has(t))};
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

/* Observations beside the ratings (OBSERVATIONS in config.js): they never change a rating, a verdict or a place, and
   nothing here is said beyond what they carry. An observation concerns the pets it names, several meaning one of them
   or all; one of a kind about meals comes after a meal where one of those pets was served it within the kind's hours
   before. */
const OBSERVED = {recent: 28 * DAY, before: 56 * DAY, span: 180 * DAY, meals: 4, hits: 2, gap: 30, z: 2, shown: 3};
const HOUR = 36e5;
const concerns = (o, pets) => Object.keys(o.pets || {}).some(pid => pets.includes(pid));
const notesOf = db => db.observations || []; // data from before observations has none

/* The meals an observation may be about: those of its pets within its kind's hours before it, newest first, and none
   for a kind about the day */
export function mealsBefore(db, o) {
  const kind = OBSERVATIONS[o.kind];
  if (kind?.about !== 'meal') return [];
  const from = o.at - kind.within * HOUR,
    pets = Object.keys(o.pets || {});
  return db.servings.filter(
    s => s.servedAt <= o.at && s.servedAt >= from && s.productId && pets.some(pid => s.pets?.[pid]),
  );
}

/* For one kind about meals: per variety its meals for these pets within OBSERVED.span whose hours are over, and how
   many of them that kind followed. Map id → {n, hit}. only: a single variety. */
function followed(db, pets, now, kind, only = null) {
  const win = OBSERVATIONS[kind].within * HOUR,
    from = now - OBSERVED.span,
    products = new Set(db.products.map(p => p.id)),
    notes = notesOf(db).filter(o => o.kind === kind && o.at <= now && o.at > from && concerns(o, pets)),
    out = new Map();
  for (const s of db.servings) {
    if (s.servedAt < from) break; // the meals are kept newest first
    if (s.servedAt + win > now || !products.has(s.productId) || (only && s.productId !== only)) continue;
    const mine = pets.filter(pid => s.pets?.[pid]);
    if (!mine.length) continue;
    const x = out.get(s.productId) || {n: 0, hit: 0};
    x.n++;
    if (notes.some(o => o.at > s.servedAt && o.at <= s.servedAt + win && concerns(o, mine))) x.hit++;
    out.set(s.productId, x);
  }
  return out;
}

/* What was noted within the pets asked for: per kind how often in the last four weeks and in the eight before, and
   when last ({kind, n, before, last}, the most first); and the varieties a kind about meals came after clearly more
   often than after every other variety: from OBSERVED.meals meals of it and OBSERVED.hits followed, against as many of
   the others at least, its share OBSERVED.gap points higher and two pooled standard errors apart, as the trend has it,
   so a run of chance is not news ({kind, id, after: {n, hit}, other: {n, hit}}, the widest gap first, at most
   OBSERVED.shown). Whole numbers, as variety() has it. {kinds, links} */
export function observed(db, pets, now) {
  const cut = now - OBSERVED.recent,
    back = cut - OBSERVED.before,
    per = new Map();
  for (const o of notesOf(db)) {
    if (o.at > now || o.at <= back || !concerns(o, pets)) continue;
    const x = per.get(o.kind) || {kind: o.kind, n: 0, before: 0, last: 0};
    if (o.at > cut) {
      x.n++;
      x.last = Math.max(x.last, o.at);
    } else x.before++;
    per.set(o.kind, x);
  }
  const kinds = [...per.values()].filter(x => x.n).sort((a, b) => b.n - a.n || b.last - a.last),
    links = [];
  for (const kind of Object.keys(OBSERVATIONS).filter(k => OBSERVATIONS[k].about === 'meal')) {
    if (!notesOf(db).some(o => o.kind === kind)) continue;
    const by = followed(db, pets, now, kind),
      all = [...by.values()].reduce((a, x) => ({n: a.n + x.n, hit: a.hit + x.hit}), {n: 0, hit: 0});
    for (const [id, after] of by) {
      const other = {n: all.n - after.n, hit: all.hit - after.hit};
      if (after.n < OBSERVED.meals || after.hit < OBSERVED.hits || other.n < OBSERVED.meals) continue;
      const apart = 100 * (after.hit * other.n - other.hit * after.n), // in points, times both counts: exact
        of = after.n * other.n,
        p = all.hit / all.n,
        se = 100 * Math.sqrt(p * (1 - p) * (1 / after.n + 1 / other.n));
      if (apart >= OBSERVED.gap * of && apart >= OBSERVED.z * se * of)
        links.push({kind, id, after, other, gap: apart / of});
    }
  }
  links.sort((a, b) => b.gap - a.gap || b.after.n - a.after.n);
  return {
    kinds,
    links: links.slice(0, OBSERVED.shown).map(x => ({kind: x.kind, id: x.id, after: x.after, other: x.other})),
  };
}

/* For the food sheet: per kind about meals, how many of the variety's meals it followed, of how many: [{kind, n, hit}],
   only kinds that did follow */
export function observedAfter(db, pets, now, id) {
  return Object.keys(OBSERVATIONS)
    .filter(k => OBSERVATIONS[k].about === 'meal' && notesOf(db).some(o => o.kind === k))
    .map(kind => ({kind, ...(followed(db, pets, now, kind, id).get(id) || {n: 0, hit: 0})}))
    .filter(x => x.hit);
}
