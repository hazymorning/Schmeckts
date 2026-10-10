// The evaluation model. Pure; caching is in derive.js.
import {flavoursOf, guessTexture, OBSERVATIONS, RATINGS, textureOf, TYPES, typeOf} from './config.js';
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
  return {
    pet,
    pets: pet ? [pet] : petIds,
    sorts,
    byId,
    rated: sorts.reduce((a, e) => a + e.n, 0),
    hints: hints(sorts, appetite(db, pet ? [pet] : petIds, now), pet, prefs),
  };
}

const sauceShare = x => (x.counts.sosse || 0) / x.n;

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

/* Erkenntnisse: what holds across varieties and meals and helps with buying and feeding, never one variety's verdict
   told again. Most set two sides against each other by how many of their meals went down well and count once both
   have INSIGHT.ratings, their shares lie INSIGHT.gap apart and the gap is INSIGHT.z pooled standard errors wide;
   INSIGHT.group for a group against the rest, since the one furthest off is picked from several. In simulated
   households whose cat likes everything alike that keeps insights to about one in twenty after two months
   (tests/personas.test.js). The widest gap comes first. */
const INSIGHT = {ratings: 4, gap: 0.3, z: 2.5, group: 2.75};
const SAUCE = {ratings: 5, share: 0.4}; // „Nur Soße“ among the ratings of the varieties in sauce
const NEW_SORTS = 5; // varieties served again after their first time
const DAY_BEGINS = 4; // a meal before this hour still belongs to the day before
const AFTER_SNACK = 3 * 36e5;
const TWO = 2; // varieties in a group, ratings of a variety
const zero = () => ({n: 0, good: 0});
function add(x, r) {
  x.n++;
  if (RATINGS[r].score >= GOOD) x.good++;
}
// gap: a's share ahead of b's, negative behind; one division, so exactly 0.3 counts
function insightOf(kind, a, b, z = INSIGHT.z) {
  if (a.n < INSIGHT.ratings || b.n < INSIGHT.ratings) return null;
  const gap = (a.good * b.n - b.good * a.n) / (a.n * b.n),
    p = (a.good + b.good) / (a.n + b.n);
  return Math.abs(gap) >= INSIGHT.gap && gap * gap >= z * z * p * (1 - p) * (1 / a.n + 1 / b.n)
    ? {kind, a, b, gap}
    : null;
}
const worse = x => (x?.gap < 0 ? x : null); // where only that way round helps
const textureKey = p => textureOf(p, p.texture)?.[0] || guessTexture(p) || '';
const GROUPS = {
  marke: p => [(p.brand || '').trim()],
  geschmack: p => flavoursOf(p.variety),
  konsistenz: p => [textureKey(p)],
};
const wetOf = m => m.sorts.filter(e => e.n && typeOf(e.product) === TYPES[0]);
const enough = list => list.filter(e => e.n >= TWO).length >= TWO; // so no single variety carries a side
const tallyOf = list => ({n: list.reduce((a, e) => a + e.n, 0), good: list.reduce((a, e) => a + goodOf(e.counts), 0)});
/* Wet food by group, the best share first. Every rating counts, but a group needs two varieties rated twice; a variety
   naming two flavours counts in both. */
function grouped(m, keysOf) {
  const by = new Map();
  for (const e of wetOf(m)) for (const k of keysOf(e.product)) if (k) by.set(k, [...(by.get(k) || []), e]);
  return [...by]
    .filter(([, l]) => enough(l))
    .map(([key, sorts]) => ({key, ...tallyOf(sorts), sorts}))
    .sort((a, b) => b.good / b.n - a.good / a.n || b.n - a.n || a.key.localeCompare(b.key, 'de'));
}
// the rest by its name where it is all one group
function restOf(kind, rest) {
  const keys = new Set(rest.map(e => GROUPS[kind](e.product)[0]));
  return {key: kind !== 'geschmack' && keys.size === 1 ? [...keys][0] || null : null, ...tallyOf(rest)};
}
/* A flavour only against varieties of the same brand and consistency, so it takes no blame for the sauce it came in:
   the counts are those of the lines holding both, the test Cochran-Mantel-Haenszel's, line by line. */
const lineOf = p => `${(p.brand || '').trim()}|${textureKey(p)}`;
function sameLine(g, rest) {
  const lines = new Map();
  for (const [i, list] of [g.sorts, rest].entries())
    for (const e of list) {
      const key = lineOf(e.product);
      if (!lines.has(key)) lines.set(key, [[], []]);
      lines.get(key)[i].push(e);
    }
  const mine = [],
    theirs = [];
  let off = 0,
    vary = 0;
  for (const [a, b] of lines.values()) {
    if (!a.length || !b.length) continue;
    mine.push(...a);
    theirs.push(...b);
    const x = tallyOf(a),
      y = tallyOf(b),
      n = x.n + y.n,
      k = x.good + y.good;
    off += x.good - (x.n * k) / n;
    vary += (x.n * y.n * k * (n - k)) / (n * n * (n - 1));
  }
  if (!enough(mine) || !enough(theirs)) return null;
  const x = insightOf('geschmack', {key: g.key, ...tallyOf(mine)}, {key: null, ...tallyOf(theirs)}, 0);
  return x && off * x.gap > 0 && off * off >= INSIGHT.group ** 2 * vary ? x : null;
}
// each group against the rest of the wet food, the one furthest off; on a tie the better one
function byGroup(m, kind) {
  const wet = wetOf(m);
  let best = null;
  for (const g of grouped(m, GROUPS[kind])) {
    const rest = wet.filter(e => !g.sorts.includes(e));
    if (!enough(rest)) continue;
    const x =
      kind === 'geschmack'
        ? sameLine(g, rest)
        : insightOf(kind, {key: g.key, n: g.n, good: g.good}, restOf(kind, rest), INSIGHT.group);
    if (x && (!best || Math.abs(x.gap) > Math.abs(best.gap) || (Math.abs(x.gap) === Math.abs(best.gap) && x.gap > 0)))
      best = {...x, sorts: g.sorts, rest};
  }
  return best;
}
// a brand all on one side of a consistency's split says nothing of its own, and the consistency holds for every brand
const inside = (brand, texture) =>
  brand.sorts.every(e => (brand.gap * texture.gap > 0 ? texture.sorts : texture.rest).includes(e));
function byGroups(m) {
  const brand = byGroup(m, 'marke'),
    texture = byGroup(m, 'konsistenz');
  return [brand && texture && inside(brand, texture) ? null : brand, texture, byGroup(m, 'geschmack')];
}
/* Geschmacksprofil: how each brand, consistency and flavour goes down, best first, the TASTE most rated; a side with
   one group stays empty, as there is nothing to set it against */
const TASTE = 5;
export function taste(m) {
  const side = keysOf => {
    const list = grouped(m, keysOf),
      most = new Set(list.toSorted((a, b) => b.n - a.n).slice(0, TASTE));
    return list.length >= TWO ? list.filter(x => most.has(x)).map(({key, n, good}) => ({key, n, good})) : [];
  };
  return {marke: side(GROUPS.marke), konsistenz: side(GROUPS.konsistenz), geschmack: side(GROUPS.geschmack)};
}
// instead: the texture eaten best otherwise, mostly well and better than the sauce, as advice; none, no advice
function inSauce(m) {
  const wet = m.sorts.filter(e => typeOf(e.product) === TYPES[0]),
    by = new Map();
  for (const e of wet) {
    const key = textureKey(e.product),
      x = by.get(key) || {key, ...zero(), sosse: 0};
    x.n += e.n;
    x.good += goodOf(e.counts);
    x.sosse += e.counts.sosse || 0;
    by.set(key, x);
  }
  const sauce = by.get('sosse');
  if (!sauce || sauce.n < SAUCE.ratings || sauce.sosse / sauce.n < SAUCE.share) return null;
  const instead = [...by.values()]
    .filter(
      x =>
        x.key && x.key !== 'sosse' && x.n >= INSIGHT.ratings && x.good * 2 > x.n && x.good * sauce.n > sauce.good * x.n,
    )
    .sort((a, b) => b.good / b.n - a.good / a.n || b.n - a.n)[0];
  return {kind: 'sosse', k: sauce.sosse, n: sauce.n, gap: sauce.sosse / sauce.n, instead};
}
// each pet's meals up to now, oldest first, without treats and dry food, unknown food as id null; and its treats
function mealsOf(db, pets, now) {
  const types = new Map(db.products.map(p => [p.id, typeOf(p)])),
    out = new Map(pets.map(pid => [pid, {meals: [], snacks: []}]));
  for (let i = db.servings.length - 1; i >= 0; i--) {
    const s = db.servings[i],
      type = types.get(s.productId);
    if (s.servedAt > now || type === 'Trockenfutter') continue;
    for (const pid in s.pets || {}) {
      const x = out.get(pid);
      if (type === 'Snack') x?.snacks.push(s.servedAt);
      else x?.meals.push({id: type ? s.productId : null, t: s.servedAt, r: rOf(s.pets[pid])});
    }
  }
  return [...out.values()];
}
// a meal of the same variety as the pet's meal before against one of another
function repeat(meals) {
  const same = zero(),
    other = zero();
  for (const {meals: l} of meals)
    l.forEach((x, i) => i && x.id && x.r && add(l[i - 1].id === x.id ? same : other, x.r));
  return worse(insightOf('wiederholung', same, other));
}
// a variety's first rating by a pet against its later ones, every rating however old, of the varieties served again
function newSorts(m, pets) {
  const first = zero(),
    later = zero(),
    sorts = new Set();
  for (const e of m.sorts)
    for (const pid of pets) {
      const l = e.pets[pid]?.list; // newest first
      if (!ranks(e.product) || !(l?.length >= TWO)) continue;
      sorts.add(e.id);
      l.forEach((x, i) => add(i === l.length - 1 ? first : later, x.r));
    }
  return sorts.size >= NEW_SORTS ? insightOf('neu', first, later) : null;
}
// pets that take to new food only after the first time, so one left then is worth a second try
export const slowStarters = m => m.pets.filter(pid => newSorts(m, [pid])?.gap < 0);
// a day's first meal against its last, on days with two or more, whenever they come: the first is breakfast at noon too
function daytime(meals) {
  const first = zero(),
    last = zero(),
    dayOf = x => dayKey(x.t - DAY_BEGINS * 36e5);
  for (const {meals: l} of meals)
    for (let i = 0, j = 0; i < l.length; i = ++j) {
      while (j + 1 < l.length && dayOf(l[j + 1]) === dayOf(l[i])) j++;
      if (j === i) continue;
      if (l[i].r) add(first, l[i].r);
      if (l[j].r) add(last, l[j].r);
    }
  return insightOf('tageszeit', first, last);
}
function afterSnacks(meals) {
  const after = zero(),
    rest = zero();
  for (const {meals: l, snacks} of meals) {
    let j = 0,
      last = -Infinity;
    for (const x of l) {
      while (j < snacks.length && snacks[j] < x.t) last = snacks[j++];
      if (x.r) add(x.t - last <= AFTER_SNACK ? after : rest, x.r);
    }
  }
  return worse(insightOf('snack', after, rest));
}
/* Who served: per variety the newest meals from each side, as many from one as from the other, so serving the
   better liked varieties more often cannot make a person look better. The person the pets eat best with. */
function feeder(db, m, now) {
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
    const mine = {key: name, ...zero()},
      theirs = {key: [...names].filter(x => x !== name), ...zero()};
    for (const list of per.values()) {
      const a = list.filter(x => x.by === name),
        b = list.filter(x => x.by !== name),
        k = Math.min(a.length, b.length);
      mine.n += k;
      theirs.n += k;
      mine.good += a.slice(0, k).filter(x => x.good).length;
      theirs.good += b.slice(0, k).filter(x => x.good).length;
    }
    const x = insightOf('feeder', mine, theirs);
    if (x?.gap > 0 && !(best?.gap >= x.gap)) best = x;
  }
  return best;
}
export function insights(db, m, now) {
  const meals = mealsOf(db, m.pets, now);
  return [
    ...byGroups(m),
    inSauce(m),
    repeat(meals),
    newSorts(m, m.pets),
    daytime(meals),
    afterSnacks(meals),
    feeder(db, m, now),
  ]
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
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
   a single poor rating by a pet that slowStarters() says needs a while with new food. */
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

// Observations never change a rating, a verdict or a place. Several pets on one means one of them or all.
const OBSERVED = {recent: 28 * DAY, before: 56 * DAY, span: 180 * DAY, meals: 4, hits: 2, gap: 30, z: 3.5, shown: 3};
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

/* A link also needs OBSERVED.z pooled standard errors, as in trend(), so a lucky run is no news; it is that high since
   every variety is weighed against the rest for every kind at once (tests/personas.test.js) */
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
