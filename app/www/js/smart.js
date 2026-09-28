/* Evaluation: analyze() returns the model everything that evaluates reads from. Pure functions; caching happens in
   derive.js. The rules are in PROJECT.md, section "Evaluation". */
import {FLAVORS, guessTexture, RATINGS, textureOf, TYPES, typeOf} from './config.js';
import {addDays, dayKey, dayStart} from './dates.js';

const DAY = 864e5;
const HALF_LIFE = 90 * DAY;
const WEIGHT_ZERO = Date.UTC(2026, 0, 1); // reference time of the weights, irrelevant to the score
export const GOOD = 70; // from this many points a rating, a variety or a share counts as going down well
export const NO = 40; // under this many a rating counts as left, and a variety as not going down well
export const MIN_RATED = 3; // from this many ratings within the filter there are insights and an evaluation
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
/* How often ratings went down well (from GOOD points) and how often they were left (under NO) */
const countOf = (counts, on) => Object.entries(counts).reduce((a, [r, k]) => a + (on(RATINGS[r].score) ? k : 0), 0);
export const goodOf = counts => countOf(counts, v => v >= GOOD);
export const poorOf = counts => countOf(counts, v => v < NO);
/* The score orders varieties; the verdict counts ratings, as the words that explain it do (evidenceOf() in
   views/parts.js): „Nachkaufen“ from 3 ratings with at least two thirds of them good, „Nicht mehr kaufen“ from 2
   with more than half of them left, „Geht so“ from 3 otherwise, and below that „Noch zu wenig bewertet“. */
function statOf(sum) {
  const score = sum.n ? +(sum.points / sum.weights).toFixed(6) : 0,
    pct = Math.round(score), // rounded against the noise of the weights
    good = goodOf(sum.counts),
    poor = poorOf(sum.counts);
  return {
    n: sum.n,
    score,
    pct,
    counts: sum.counts,
    last: sum.last,
    verdict:
      sum.n >= 3 && good * 3 >= sum.n * 2
        ? 'nachkaufen'
        : sum.n >= 2 && poor * 2 > sum.n
          ? 'nicht'
          : sum.n >= 3
            ? 'geht'
            : 'neu',
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

/* Model  = {pet, sorts, byId, rated, insights, hints}
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
  const byId = new Map(sorts.map(e => [e.id, e]));
  return {
    pet,
    sorts,
    byId,
    rated: sorts.reduce((a, e) => a + e.n, 0),
    insights: insights(sorts),
    hints: hints(sorts, appetite(db, pet ? [pet] : petIds, now), pet, prefs),
  };
}

/* Insights: what holds across varieties, never one variety's verdict told again (that is „Einkaufen“).
   Comparisons by consistency, flavour and brand, each within one food type: a group counts with at least two
   varieties rated at least twice each, and groups are measured by how often they went down well. The best and the
   weakest group make an insight when that share is at least 30 points apart and every variety of the one did
   better than every variety of the other, so a single variety cannot carry it; two comparisons over the same
   varieties are one, consistency before flavour before brand. The strongest come first. Then two habits, „nur die
   Soße geleckt“ and „erst gierig“, where at least two varieties show it at least half of the time. */
const shareOf = (x, r) => (x.counts[r] || 0) / x.n;
const sauceShare = x => shareOf(x, 'sosse');
const GAP = 0.3,
  TWO = 2; // varieties in a group, ratings of a variety
const DIMENSIONS = [
  ['konsistenz', p => (textureOf(p, p.texture) || textureOf(p, guessTexture(p)))?.[1]], // the field, falling back to the keywords only when it is missing
  ['geschmack', p => keywordOf(FLAVORS, p.variety)],
  ['marke', p => p.brand],
];
const HABITS = ['sosse', 'eager']; // levels that say how a variety is eaten
function insights(sorts) {
  if (sorts.reduce((a, e) => a + e.n, 0) < MIN_RATED) return [];
  const out = [],
    seen = new Set(),
    rated = sorts.filter(e => e.n >= TWO);
  for (const type of TYPES) {
    const mine = rated.filter(e => typeOf(e.product) === type);
    for (const [kind, keyOf] of DIMENSIONS) {
      const groups = new Map();
      for (const e of mine) {
        const k = keyOf(e.product);
        if (k) groups.set(k, [...(groups.get(k) || []), e]);
      }
      const ranked = [...groups]
        .filter(([, l]) => l.length >= TWO)
        .map(([key, l]) => {
          const n = l.reduce((a, e) => a + e.n, 0),
            good = l.reduce((a, e) => a + goodOf(e.counts), 0),
            shares = l.map(e => goodOf(e.counts) / e.n);
          return {
            key,
            ids: l.map(e => e.id).sort(),
            n,
            good,
            share: good / n,
            low: Math.min(...shares),
            high: Math.max(...shares),
          };
        })
        .sort((a, b) => b.share - a.share);
      const best = ranked[0],
        worst = ranked.at(-1);
      if (ranked.length < 2 || best.share - worst.share < GAP || best.low <= worst.high) continue;
      const same = best.ids + '|' + worst.ids;
      if (seen.has(same)) continue;
      seen.add(same);
      out.push({kind, type, best, worst, gap: best.share - worst.share});
    }
  }
  out.sort((a, b) => b.gap - a.gap);
  for (const kind of HABITS) {
    const l = rated.filter(e => shareOf(e, kind) >= 0.5).sort((a, b) => shareOf(b, kind) - shareOf(a, kind));
    if (l.length >= TWO) out.push({kind, sorts: l.slice(0, 3).map(e => ({id: e.id, k: e.counts[kind], n: e.n}))});
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

/* Evaluation page (only computed when it opens), for the pet in the filter or for the whole household and for
   a span of the last `days` calendar days (0 = everything):
     meals            every meal within the filter and the span, newest first
     count            meals, varieties tried, days fed on and how many days the span holds
     liked            of the ratings in the span, how many went down well (from GOOD points), as a percentage
     best, worst      the variety that goes down best and the one that goes down worst, from MIN_TOP ratings
   best and worst need two different varieties, otherwise the same one would be both. `liked` counts the same
   ratings as everything else, so the ring on the page adds no separate figure. */
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
  const good = rated.filter(x => RATINGS[x.r].score >= GOOD).length;
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

/* Groups for „Einkaufen“ and the shopping list: „Nachkaufen“ (with „Gemischt“), best first, „Nicht mehr kaufen“,
   the clearest first, „Geht so“ and „Noch zu wenig bewertet“. The manual setting decides the group, and varieties
   without a rating in the filter only show up with one. */
export function shopGroups(m) {
  const g = {nachkaufen: [], nicht: [], geht: [], neu: []};
  for (const e of m.sorts)
    if (e.choice === 'nachkaufen' || e.choice === 'gemischt') g.nachkaufen.push(e);
    else if (e.choice === 'nicht') g.nicht.push(e);
    else if (e.n) g[e.choice].push(e);
  g.nicht.sort((a, b) => a.score - b.score || b.n - a.n);
  return g;
}

/* Calendar week from start (Monday 00:00 local time), within the pet filter, for „Verlauf“:
   list       its meals, newest first
   sorts      how many varieties were served
   n, good    how many ratings it holds, and how many of them went down well (from GOOD points)
   open       how many of its meals are not rated yet
   best       per pet the variety that went down best that week, from 2 ratings and only from GOOD points:
              {pet, id, n, pct, counts}
   favorites  varieties whose verdict is „Nachkaufen“ at the weekend and was not at the start
   feeders    feedings per person (field by), the most first: {name, n} */
export function week(db, prefs, start) {
  const end = addDays(start, 7),
    before = analyze(db, prefs, start - 1),
    after = analyze(db, prefs, end - 1),
    ids = after.pet ? [after.pet] : db.pets.map(p => p.id),
    mine = new Set(ids);
  const list = db.servings.filter(s => s.servedAt >= start && s.servedAt < end && ids.some(id => s.pets?.[id]));
  const ratings = [...ratingsOf(db, list)].filter(x => mine.has(x.pid));
  const sums = tally({pets: db.pets, servings: list.filter(s => after.byId.has(s.productId))}, end),
    best = [];
  for (const pid of ids) {
    const top = [...sums.bySort]
      .filter(([, x]) => x[pid])
      .map(([id, x]) => ({id, ...statOf(x[pid])}))
      .filter(x => x.n >= 2)
      .sort((a, b) => b.score - a.score || b.n - a.n || b.last.t - a.last.t)[0];
    if (top?.pct >= GOOD) best.push({pet: pid, id: top.id, n: top.n, pct: top.pct, counts: top.counts});
  }
  const fed = new Map();
  for (const s of list) {
    const name = (s.by || '').trim();
    if (name) fed.set(name, (fed.get(name) || 0) + 1);
  }
  return {
    start,
    end,
    list,
    sorts: new Set(list.map(s => s.productId).filter(id => after.byId.has(id))).size,
    n: ratings.length,
    good: ratings.filter(x => RATINGS[x.r].score >= GOOD).length,
    open: list.filter(s => !ids.some(id => rOf(s.pets[id]))).length,
    best,
    favorites: after.sorts
      .filter(e => e.verdict === 'nachkaufen' && before.byId.get(e.id)?.verdict !== 'nachkaufen')
      .map(e => e.id),
    feeders: [...fed].map(([name, n]) => ({name, n})).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de')),
  };
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
