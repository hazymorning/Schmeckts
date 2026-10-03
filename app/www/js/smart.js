// The evaluation model. Pure; caching is in derive.js.
import {flavoursOf, guessTexture, OBSERVATIONS, RATINGS, scaleOf, textureOf, TYPES, typeOf} from './config.js';
import {DAY, addDays, dayKey, dayStart} from './dates.js';

const HALF_LIFE = 90 * DAY;
const WEIGHT_ZERO = Date.UTC(2026, 0, 1); // arbitrary, the score does not depend on it
export const GOOD = 70; // points from which something counts as going down well
export const NO = 40; // points under which a rating counts as left
const WINDOW = 8; // newest ratings per variety and pet that the verdict uses
const VERDICT_SPAN = 180 * DAY; // older ratings still weigh in the score, not in the verdict
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
const toneOf = v => (v >= GOOD ? 'good' : v >= NO ? 'mid' : 'bad');
export const rateTone = r => (RATINGS[r].score > 0 && RATINGS[r].score <= NO ? 'sauce' : toneOf(RATINGS[r].score));
export const scoreCls = v => 'r-' + toneOf(v);
export const rateCls = r => 'r-' + rateTone(r);
export const hintKey = h => (h.kind === 'appetit' ? `appetit:${h.pet}:${h.day}` : `${h.kind}:${h.id}`);

/* All weights shrink at the same rate, so points / weights does not depend on when it is computed and a sum holds
   until one of its meals changes. list is newest first, like the meals. */
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
const windowOf = (list, now) => list.slice(0, WINDOW).filter(x => x.t > now - VERDICT_SPAN);
const countsOf = list => {
  const counts = {}; // only levels that actually occur
  for (const x of list) counts[x.r] = (counts[x.r] || 0) + 1;
  return counts;
};
// keys oldest first; more is set when ratings lie beyond the windows
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
const countOf = (counts, on) => Object.entries(counts).reduce((a, [r, k]) => a + (on(RATINGS[r].score) ? k : 0), 0);
export const goodOf = counts => countOf(counts, v => v >= GOOD);
// how often a pet's newest ratings went otherwise than the time before, of how many times they could have
export function swings(e) {
  const out = {k: 0, n: 0};
  for (const {window: w} of Object.values(e.pets))
    for (let i = 1; i < w.length; i++) {
      out.n++;
      if (toneOf(RATINGS[w[i].r].score) !== toneOf(RATINGS[w[i - 1].r].score)) out.k++;
    }
  return out;
}
export const poorOf = counts => countOf(counts, v => v < NO);
// counts ratings instead of using the score, so it agrees with the wording in evidenceOf() (views/parts.js)
const verdictOf = (n, good, poor) =>
  n >= 3 && good * 3 >= n * 2 ? 'nachkaufen' : n >= 2 && poor * 2 > n ? 'nicht' : n >= 3 ? 'geht' : 'neu';
// score over every rating, the rest from the window; pct rounds off the noise of the weights
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

function* ratingsOf(db, servings) {
  const known = new Set(db.pets.map(p => p.id));
  for (const s of servings)
    for (const [pid, x] of Object.entries(s.pets || {})) {
      const r = rOf(x);
      if (r && known.has(pid)) yield {pid, r, t: s.servedAt, id: s.productId || null};
    }
}

// next is the first future meal; the sums are stale once it is reached
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

// total counts every rating in the filter, not only the window; list and window exist per pet only
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
  let repeats = null; // lazy, only one card reads it
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

// "Worauf es ankommt": what holds across varieties, never one variety's verdict told again
const shareOf = (x, r) => (x.counts[r] || 0) / x.n;
const sauceShare = x => shareOf(x, 'sosse');
const GAP = 0.3,
  TWO = 2; // varieties in a group, ratings of a variety
const DIMENSIONS = [
  ['konsistenz', p => [(textureOf(p, p.texture) || textureOf(p, guessTexture(p)))?.[1]]],
  ['geschmack', p => flavoursOf(p.variety)],
  ['marke', p => [p.brand]],
];
const HABITS = ['sosse', 'eager']; // levels that say how a variety is eaten

/* clear also needs every variety of the best group to beat every one of the weakest, so no single variety carries
   it. A variety with two flavours counts in both groups, and in the best and the weakest at once it blocks clear. */
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
function groupOf(key, l) {
  const n = l.reduce((a, e) => a + e.n, 0),
    good = l.reduce((a, e) => a + goodOf(e.counts), 0),
    shares = l.map(e => goodOf(e.counts) / e.n);
  return {key, ids: l.map(e => e.id), n, good, share: good / n, low: Math.min(...shares), high: Math.max(...shares)};
}

export function habits(m) {
  const out = [],
    rated = m.sorts.filter(e => e.n >= TWO);
  for (const kind of HABITS) {
    const l = rated.filter(e => shareOf(e, kind) >= 0.5).sort((a, b) => shareOf(b, kind) - shareOf(a, kind));
    if (l.length >= TWO) out.push({kind, sorts: l.slice(0, 3).map(e => ({id: e.id, k: e.counts[kind], n: e.n}))});
  }
  return out;
}

// same: the pet had the variety within its last REPEAT.within meals; treats are skipped, unknown food takes a place
const REPEAT = {within: 3};
function repeatsOf(db, petIds, now) {
  const snack = new Set(),
    known = new Set(),
    out = {},
    before = {}; // per pet, newest last
  for (const p of db.products) (typeOf(p) === 'Snack' ? snack : known).add(p.id);
  for (const id of petIds) {
    out[id] = {same: {n: 0, good: 0}, other: {n: 0, good: 0}};
    before[id] = [];
  }
  for (let i = db.servings.length - 1; i >= 0; i--) {
    // oldest first, so a meal's predecessors are already in before
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
const VARIETY = {min: 6, gap: 25};
export function variety(m) {
  const out = [];
  for (const [pet, {same, other}] of Object.entries(m.repeats)) {
    if (same.n < VARIETY.min || other.n < VARIETY.min) continue;
    const apart = 100 * (same.good * other.n - other.good * same.n), // cross-multiplied to stay exact
      far = VARIETY.gap * same.n * other.n;
    if (apart <= -far) out.push({pet, kind: 'abwechslung', same, other});
    else if (apart >= far) out.push({pet, kind: 'gewohnheit', same, other});
  }
  return out;
}

// uses every rating, older than VERDICT_SPAN too, since this is about first encounters
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
    const apart = 100 * (first.good * later.n - later.good * first.n), // cross-multiplied to stay exact
      far = NOVELTY.gap * first.n * later.n;
    if (apart >= far) out.push({pet, kind: 'neugier', first, later});
    else if (apart <= -far) out.push({pet, kind: 'anlauf', first, later});
  }
  return out;
}

// has a pet been eating noticeably worse for a few days?
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
        // observations in the same hours, named beside the ratings
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

// sorted by likingOf() as on "Vorlieben"; a variety unrated in the filter shows only with a manual setting
export function shopGroups(m) {
  const g = {nachkaufen: [], nicht: [], geht: [], neu: []};
  for (const e of m.sorts)
    if (e.choice === 'nachkaufen' || e.choice === 'gemischt') g.nachkaufen.push(e);
    else if (e.choice === 'nicht') g.nicht.push(e);
    else if (e.total) g[e.choice].push(e);
  const like = new Map([...g.nachkaufen, ...g.nicht].map(e => [e, likingOf(e)])),
    own = verdict => e => (e.verdict === verdict ? 0 : 1); // own verdict before mixed or manual
  g.nachkaufen.sort((a, b) => own('nachkaufen')(a) - own('nachkaufen')(b) || like.get(b) - like.get(a) || b.n - a.n);
  g.nicht.sort((a, b) => own('nicht')(a) - own('nicht')(b) || like.get(a) - like.get(b) || b.n - a.n);
  return g;
}

// a treat is nearly always eaten and dry food stands in the bowl all day, so neither says much beside a meal
const UNRANKED = ['Snack', 'Trockenfutter'];
const ranks = product => !UNRANKED.includes(typeOf(product));
const RANK = {prior: 2, middle: 50, flop: 50, flat: 1.3, flatSorts: 4, flatRatings: 24};
const pointsIn = counts => Object.entries(counts).reduce((a, [r, k]) => a + RATINGS[r].score * k, 0);
// pulled toward RANK.middle by RANK.prior ratings, so evidence beats a lucky start; never shown
export const likingOf = x => (pointsIn(x.counts) + RANK.prior * RANK.middle) / (x.n + RANK.prior);
// follows the verdict, so "Vorlieben" never contradicts "Einkaufen" or a hint
export function sideOf(x) {
  if (!x.n || x.verdict === 'neu') return 'thin';
  if (x.verdict === 'gemischt') return 'split';
  if (x.verdict === 'nachkaufen') return 'top';
  if (x.verdict === 'nicht') return 'flop';
  const good = goodOf(x.counts) * 2;
  if (good > x.n) return 'top';
  return good < x.n && pointsIn(x.counts) < RANK.flop * x.n ? 'flop' : 'mid';
}
const sided = (dir, like) => (a, b) =>
  (a.verdict === 'geht') - (b.verdict === 'geht') ||
  dir * (like.get(b) - like.get(a)) ||
  b.n - a.n ||
  (a.id < b.id ? -1 : 1);
export function ranking(m, now) {
  let flat, trials; // lazy, the card needs them only when it has no side to show
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
  const spread = e => {
    const l = m.pets.filter(pid => e.pets[pid]?.n).map(pid => likingOf(e.pets[pid]));
    return Math.max(...l) - Math.min(...l);
  };
  r.split.sort((a, b) => spread(b) - spread(a) || sided(1, like)(a, b));
  r.settled = r.top.length + r.flop.length + r.mid.length + r.split.length;
  r.stale = r.rated > 0 && !r.settled && !r.thin.length;
  return r;
}
/* Index of dispersion: do the varieties differ no more than coin flips would? In simulation it says so on most looks
   for a cat that eats everything alike, and on hardly any for real differences. */
function flatOf(list) {
  const n = list.reduce((a, e) => a + e.n, 0),
    good = list.reduce((a, e) => a + goodOf(e.counts), 0);
  if (list.length < RANK.flatSorts || n < RANK.flatRatings || !good || good === n) return false;
  const p = good / n,
    chi = list.reduce((a, e) => a + (goodOf(e.counts) - e.n * p) ** 2 / (e.n * p * (1 - p)), 0);
  return chi / (list.length - 1) <= RANK.flat;
}
// need is exact, since every variety has a verdict from TRIAL.need ratings on
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
  const all = t => (goodOf(t.e.counts) === t.e.n ? 0 : 1);
  return out.sort(
    (a, b) => a.need - b.need || all(a) - all(b) || like.get(b.e) - like.get(a.e) || (a.e.id < b.e.id ? -1 : 1),
  );
}

/* A clear change also needs TREND.z pooled standard errors, so a lucky run is no news. Its cause is the pet when the
   varieties eaten in both spans moved the same way, the food when they held. */
const TREND = {recent: 28 * DAY, before: 56 * DAY, min: 10, calm: 10, clear: 20, z: 2, usual: 6, behind: 2};
const goodCount = list => ({n: list.length, good: list.filter(x => RATINGS[x.r].score >= GOOD).length});
// cross-multiplied, so a threshold in points compares exactly: apart against points * of
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

/* Who served: per variety the newest meals from each side, as many from one as from the other, so serving the
   better liked varieties more often cannot make a person look better. A gap also needs FEEDER.z pooled standard
   errors, as in trend(). The person the pets eat best with, or null. */
const FEEDER = {min: 10, gap: 25, z: 2};
export function feederGap(db, m, now) {
  const meal = new Set(db.products.filter(ranks).map(p => p.id)),
    per = new Map(); // variety → [{by, good}], newest first
  for (const s of db.servings) {
    if (s.servedAt <= now - VERDICT_SPAN) break; // the meals are kept newest first
    const by = (s.by || '').trim();
    if (s.servedAt > now || !by || !meal.has(s.productId)) continue;
    for (const pid of m.pets) {
      const r = rOf(s.pets?.[pid]);
      if (r)
        (per.get(s.productId) || per.set(s.productId, []).get(s.productId)).push({by, good: RATINGS[r].score >= GOOD});
    }
  }
  const names = new Set([...per.values()].flatMap(l => l.map(x => x.by)));
  let best = null;
  for (const name of names) {
    let n = 0,
      good = 0,
      theirs = 0;
    for (const list of per.values()) {
      const mine = list.filter(x => x.by === name),
        other = list.filter(x => x.by !== name),
        k = Math.min(mine.length, other.length);
      n += k;
      good += mine.slice(0, k).filter(x => x.good).length;
      theirs += other.slice(0, k).filter(x => x.good).length;
    }
    const p = (good + theirs) / (2 * n),
      se = 100 * Math.sqrt((p * (1 - p) * 2) / n);
    if (n < FEEDER.min || 100 * (good - theirs) < Math.max(FEEDER.gap, FEEDER.z * se) * n) continue;
    if (!best || good - theirs > best.good - best.theirs)
      best = {name, others: [...names].filter(x => x !== name), n, good, theirs};
  }
  return best;
}

/* Sides as they stood MOVE.days ago, worked out the same way as now. A move needs a real change in the good share,
   since drifting across a line on the same ratings is no news; fresh needs MOVE.from settled varieties back then, or
   in a young diary everything would be new. */
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

/* missed reads the newest ratings however old, since a variety not served for long has an empty window. retry is
   a single poor rating by a pet that novelty() says needs a while with new food. */
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
    // skip what a pet rejects now, however it went once
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

// the profile's own comparisons, so the two pages never disagree
const PATTERNS = 2;
export function patterns(dims) {
  const seen = new Set();
  return dims
    .filter(d => !UNRANKED.includes(d.type) && d.gap >= GAP)
    .sort((a, b) => b.clear - a.clear || b.gap - a.gap)
    .filter(d => !seen.has(d.kind) && seen.add(d.kind))
    .slice(0, PATTERNS);
}

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

// gap, delay and lead in minutes; slot times are minutes since local midnight
const FEED = {span: 14 * DAY, gap: 90, minDays: 4, delay: 45, lead: 60, ahead: 7};
// wall-clock minute min of the day i days after now's, so a clock change shifts nothing
function atMinute(now, min, i = 0) {
  const d = new Date(now);
  d.setHours(0, min, 0, 0);
  d.setDate(d.getDate() + i);
  return d.getTime();
}
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
// since: from then on a meal served on another phone also makes the reminder unnecessary
// keyed by the slot's day, also where the reminder falls after midnight
export function feedReminders(db, now) {
  const out = [];
  for (const slot of feedSlots(db, now))
    for (let i = 0; i < FEED.ahead; i++) {
      const at = atMinute(now, slot.remind, i),
        since = atMinute(now, slot.from - FEED.lead, i);
      if (at > now && !mealsIn(db, since - 1, at).length)
        out.push({key: `${dayKey(atMinute(now, 0, i))}|${slot.at}`, at, since});
    }
  return out;
}

// keys of today's reminders that a meal has made unnecessary
export function fedToday(db, now) {
  return feedSlots(db, now)
    .filter(slot => mealsIn(db, atMinute(now, slot.from - FEED.lead) - 1, now).length)
    .map(slot => `${dayKey(now)}|${slot.at}`);
}

/* The buttons of a rating reminder: the two levels the pet gave this variety most often in its newest ratings,
   filled up from all its meals of the same scale; in the scale's order. */
const QUICK = 2;
export function quickRatings(db, s, pid) {
  const scale = scaleOf(db.products.find(p => p.id === s.productId)),
    often = same => {
      const n = new Map(); // newest first, so the newer level wins a tie
      let left = WINDOW;
      for (const x of db.servings) {
        const r = same(x) && rOf(x.pets[pid]);
        if (!r || !scale.includes(r)) continue;
        n.set(r, (n.get(r) || 0) + 1);
        if (!--left) break;
      }
      return [...n].sort((a, b) => b[1] - a[1]).map(([r]) => r);
    },
    own = s.productId ? often(x => x.productId === s.productId) : [];
  return [...new Set([...own, ...often(() => true)])]
    .slice(0, QUICK)
    .sort((a, b) => scale.indexOf(a) - scale.indexOf(b));
}

export function nextMeal(db, now, pets) {
  const slots = feedSlots(db, now, pets),
    d = new Date(now),
    minute = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60,
    meals = mealsIn(db, atMinute(now, -FEED.lead) - 1, now, pets); // before midnight, for a slot just after it
  for (const slot of slots) {
    if (meals.some(s => s.servedAt >= atMinute(now, slot.from - FEED.lead))) continue;
    if (minute < slot.from) return {at: slot.at};
    if (minute <= slot.remind + FEED.lead) return {at: slot.at, due: true};
  }
  return slots.length ? {at: slots[0].at, tomorrow: true} : null;
}

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

// Observations never change a rating, a verdict or a place. Several pets on one means one of them or all.
const OBSERVED = {recent: 28 * DAY, before: 56 * DAY, span: 180 * DAY, meals: 4, hits: 2, gap: 30, z: 2, shown: 3};
const HOUR = 36e5;
const concerns = (o, pets) => Object.keys(o.pets || {}).some(pid => pets.includes(pid));
const notesOf = db => db.observations || []; // older data has no observations

export function mealsBefore(db, o) {
  const kind = OBSERVATIONS[o.kind];
  if (kind?.about !== 'meal') return [];
  const from = o.at - kind.within * HOUR,
    pets = Object.keys(o.pets || {});
  return db.servings.filter(
    s => s.servedAt <= o.at && s.servedAt >= from && s.productId && pets.some(pid => s.pets?.[pid]),
  );
}

// only meals whose hours are over count; Map id → {n, hit}
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

// a link also needs OBSERVED.z pooled standard errors, as in trend(), so a lucky run is no news
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
      const apart = 100 * (after.hit * other.n - other.hit * after.n), // cross-multiplied to stay exact
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

export function observedAfter(db, pets, now, id) {
  return Object.keys(OBSERVATIONS)
    .filter(k => OBSERVATIONS[k].about === 'meal' && notesOf(db).some(o => o.kind === k))
    .map(kind => ({kind, ...(followed(db, pets, now, kind, id).get(id) || {n: 0, hit: 0})}))
    .filter(x => x.hit);
}
