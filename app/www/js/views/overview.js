/* Top of the home page, on the ground above the cards: a greeting, then how it goes at the bowl, in facts: the last
   meal and how it went, then one more of the day. Never the schedule, never what the cards below show. */
import {andList, cap, esc} from '../text.js';
import {addDays, clockStr, DAY, dayNumber, dayStart} from '../dates.js';
import {flavoursOf, OBSERVATIONS, RATINGS, typeOf} from '../config.js';
import {icon} from '../icons.js';
import {db, prefs} from '../store.js';
import {calledNames, getObservation, getPet, getProduct, petNames, pname, rankingModel} from '../derive.js';
import {glance} from '../glance.js';
import {ANCHORS, FACTS, GREETINGS, NOTABLE, NOTED, WEEKEND} from '../content/pools.js';
import {fill, sharesWord} from './facts.js';
import {avatar} from './parts.js';

const FRESH = 60; // minutes a serving counts as news
const NIGHT = 5; // night lasts until this hour
const HOURS_FROM = 90; // minutes
const SPAN = 12 * 60; // minutes up to which the last meal is said as „vor 3 Stunden“
const TURN = 3; // hours a wording stays, unless something is served or noted
const AFTERNOON = 14; // from this hour no treat yet is said, where treats are usual
const STREAK = {good: 3, left: 2}; // meals in a row worth a word
const RATED = 5; // ratings in the week before it is told
const SORTS = 3;
const HALF = {1: 'eineinhalb', 2: 'zweieinhalb'};
const NUMBER = 'null eine zwei drei vier fünf sechs sieben acht neun zehn elf zwölf'.split(' ');
const NTH = ['', 'ersten', 'zweiten', 'dritten', 'vierten', 'fünften', 'sechsten', 'siebten', 'achten', 'neunten'];
const PRONOUN = {f: 'sie', m: 'er'};
const SLEEP = new Set(['night']);

const b = text => `<b>${text}</b>`;
const number = n => NUMBER[n] ?? String(n);
// a number and its unit stay on one line
function spanOf(min) {
  if (min < HOURS_FROM) return `${min}\u00a0Minuten`;
  const halves = Math.round(min / 30),
    hours = Math.floor(halves / 2);
  return `${halves % 2 && HALF[hours] ? HALF[hours] : Math.round(min / 60)}\u00a0Stunden`;
}
const daysBefore = (t, now) => Math.round((dayStart(now) - dayStart(t)) / DAY);
const dateOf = t => new Date(t).toLocaleDateString('de-DE', {day: 'numeric', month: 'long'}).replace(' ', '\u00a0');
// „vor 2 Stunden“, „heute um 7:10“, „gestern um 19:28“, „am 3. Oktober“, its time bold
function agoOf(t, now) {
  const min = Math.round((now - t) / 6e4),
    days = daysBefore(t, now);
  if (min < SPAN && days === 0) return `vor ${b(spanOf(min))}`;
  return days === 0 ? `heute um ${b(clockStr(t))}` : days === 1 ? `gestern um ${b(clockStr(t))}` : `am ${b(dateOf(t))}`;
}
// what a meal was, as in „es gab Huhn und Pute“; dry food by its kind, a variety without a flavour not at all
function whatOf(s) {
  const p = getProduct(s.productId);
  if (!p) return null;
  const flavours = typeOf(p) === 'Trockenfutter' ? ['Trockenfutter'] : flavoursOf(p.variety);
  return flavours.length ? andList(flavours) : null;
}

// the moment the card speaks of
export function momentOf(g, now) {
  if (!g.last) return 'none';
  if (g.last.servedAt < addDays(dayStart(now), -1)) return 'older';
  if ((now - g.last.servedAt) / 6e4 < FRESH)
    return typeOf(getProduct(g.last.productId)) === 'Snack' ? 'freshTreat' : 'fresh';
  if (new Date(now).getHours() < NIGHT) return 'night';
  return g.meal && g.meal.servedAt >= dayStart(now) ? 'today' : 'notYet';
}
const anchorOf = (moment, g) =>
  moment === 'fresh' && g.first
    ? 'firstFresh'
    : moment === 'night' || moment === 'today'
      ? g.first
        ? 'firstLast'
        : 'last'
      : moment;

// what a sentence can name; what the day does not have is left out
export function valuesOf(g, now) {
  const {last, meal, pets = 1} = g,
    what = meal && whatOf(meal),
    ago = meal && agoOf(meal.servedAt, now),
    p = meal && getProduct(meal.productId);
  return {
    ...(ago && {ago, Ago: cap(ago)}),
    ...(what && {what: esc(what)}),
    ...(g.name && {name: esc(g.name)}),
    ...(g.rating && {said: RATINGS[g.rating].said}),
    ...(pets > 1 && g.outcome === 'good' && {All: `${pets === 2 ? 'Beide' : 'Alle'} haben gut gefressen`}),
    ...(pets > 1 && g.outcome === 'left' && {All: 'Da blieb einiges stehen'}),
    ...(last && {days: `${daysBefore(last.servedAt, now)} Tage`}),
    ...(meal && {date: `am ${dateOf(meal.servedAt)}`}),
    ...(g.treats >= 2 && NTH[g.treats] && {nthTreat: NTH[g.treats]}),
    ...(g.first && p && {variety: esc(pname(p))}),
    ...(g.streak?.n && {k: number(g.streak.n)}),
    ...(g.week?.n && {good: g.week.good, n: g.week.n}),
    ...(g.favourite && {fav: esc(g.favourite)}),
    ...(g.treats && {treats: g.treats === 1 ? 'einen Snack' : `${number(g.treats)} Snacks`}),
    ...(g.meals >= 2 && {count: number(g.meals)}),
    ...(g.week?.sorts && {sorts: number(g.week.sorts)}),
  };
}
const plain = html => html.replace(/<[^>]*>/g, '');
// the facts of the day there are, the notable ones alone where there are any
export function factsOf(g, now, moment) {
  const at = {
    noted: g.noted?.length > 0,
    streakLeft: g.streak?.kind === 'left' && g.streak.n >= STREAK.left,
    treatsNone: g.treatsUsual && !g.treats && new Date(now).getHours() >= AFTERNOON && moment !== 'night',
    streakGood: g.streak?.kind === 'good' && g.streak.n >= STREAK.good,
    week: g.week?.n >= RATED,
    favourite: !!g.favourite,
    treats: g.treats > 0 && moment !== 'freshTreat',
    count: g.meals >= 2,
    sorts: g.week?.sorts >= SORTS,
  };
  const there = Object.keys(FACTS).filter(k => at[k]),
    notable = there.filter(k => NOTABLE.includes(k));
  return notable.length ? notable : there;
}
const keysOf = t => [...t.matchAll(/\{(\w+)\}/g)].map(([, key]) => key);
const RICH = ['said', 'All', 'what', 'variety', 'nthTreat']; // what the last serving was and how it went
// from turn on, the first wording the values fill that repeats no word of avoid, of those telling the most
function pick(pool, values, turn, avoid) {
  const fits = pool.filter(t => keysOf(t).every(key => values[key] != null)),
    rich = t => keysOf(t).filter(key => RICH.includes(key)).length,
    most = Math.max(0, ...fits.map(rich)),
    list = fits.filter(t => rich(t) === most),
    turned = list.map((_, i) => list[(turn + i) % list.length]);
  return turned.find(t => !sharesWord(avoid, fill(t, values))) ?? turned[0] ?? '';
}
const LONG = 120; // characters the two sentences keep below
// the one cat in the second sentence: by its pronoun once the first has named it and its sex is known
function subjectOf(g, named, values) {
  if (!values.name) return {};
  const wer = (named && PRONOUN[g.sex]) || values.name;
  return {wer, Wer: cap(wer)};
}
// the first kind noted today, said of the cats it was noted for
function notedOf(g, Wer) {
  const n = Object.keys(NOTED)
    .map(kind => g.noted?.find(x => x.kind === kind))
    .find(Boolean);
  if (!n) return {};
  const several = g.pets > 1 && n.pets.length > 1;
  return {
    noted: fill(NOTED[n.kind], {
      Wer: g.pets > 1 ? esc(petNames(n.pets)) : Wer,
      ist: several ? 'sind' : 'ist',
      war: several ? 'waren' : 'war',
      hat: several ? 'haben' : 'hat',
    }),
  };
}
/* The sentence on the last meal, then a fact of the day. A wording stays for TURN hours and until something is served
   or noted, which moves it on by one; each stretch of hours starts somewhere else. */
export function sentenceOf(g, now) {
  const moment = momentOf(g, now),
    values = valuesOf(g, now),
    stretch = dayNumber(now) * 8 + Math.floor(new Date(now).getHours() / TURN),
    turn = (Math.imul(stretch, 2654435761) >>> 8) + (g.meals || 0) + (g.treats || 0) + (g.noted?.length || 0),
    anchor = pick(ANCHORS[anchorOf(moment, g)], values, turn, ''),
    first = fill(anchor, values);
  if (moment === 'none' || moment === 'older') return first;
  const who = subjectOf(g, anchor.includes('{name}'), values),
    more = {...values, ...who, ...notedOf(g, who.Wer)},
    facts = factsOf(g, now, moment),
    room = LONG - plain(first).length,
    from = NOTABLE.includes(facts[0]) ? 0 : turn; // the notable ones in their order, the others in turn
  // a fact that repeats no word of the first sentence, else any
  for (const strict of [true, false])
    for (let i = 0; i < facts.length; i++) {
      const said = fill(pick(FACTS[facts[(from + i) % facts.length]], more, turn, first), more);
      if (said && plain(said).length < room && !(strict && sharesWord(first, said))) return `${first} ${said}`;
    }
  return first;
}
// always at hand, so noting takes one tap; just: the kind just noted
const observeRail = just =>
  `<div class="rail obs" role="group" aria-label="Beobachtung notieren">${Object.entries(OBSERVATIONS)
    .map(
      ([k, o]) =>
        `<button class="chip toned o-${k}" data-action="observe" data-v="${k}" aria-label="${o.label} notieren"><i class="disc${k === just ? ' pop' : ''}">${icon(o.icon)}</i>${o.label}</button>`,
    )
    .join('')}</div>`;

// a greeting for the hour, by the name of whoever holds the phone where it is known
export function headOf(now, name) {
  const d = new Date(now),
    h = d.getHours(),
    hello = (h >= 11 && h < 18 && WEEKEND[d.getDay()]) || GREETINGS.findLast(([from]) => h >= from)[1];
  return name ? `${hello}, ${esc(name)}` : hello;
}
// noted: the entry just made, so the chip just tapped can answer
export function overviewHTML(m, noted = null) {
  const pets = m.pet ? [getPet(m.pet)] : db.pets,
    one = pets.length === 1 ? pets[0] : null,
    now = Date.now(),
    ids = pets.map(p => p.id);
  const fav = rankingModel().top[0]?.product,
    seen = glance(db, ids, now),
    g = {
      ...seen,
      pets: ids.length,
      name: one && calledNames([one.id], 'head', now),
      favourite: fav && fav.id !== seen.meal?.productId && pname(fav), // not the meal the card just told
    },
    moment = momentOf(g, now),
    head = headOf(now, prefs.name);
  // sleepy z's at night
  const mood = SLEEP.has(moment) ? ' sleepy' : '',
    pic = one
      ? `<button class="ov-pic xxxl${mood}" data-action="open-pet" data-id="${one.id}" aria-label="${esc(one.name)} bearbeiten">${avatar(one, 'xxxl')}</button>`
      : `<span class="ov-pic${mood}">${pets
          .slice(0, 2)
          .map(p => avatar(p, 'l pair'))
          .join('')}</span>`,
    just = noted && getObservation(noted)?.kind;
  return `<section class="overview" data-sec="overview"${g.next?.due ? ' data-due' : ''} style="view-transition-name:sec-overview">
    <div class="ov-top">${pic}<div class="ov-text"><h2>${head}</h2><p>${sentenceOf(g, now)}</p></div></div>
    ${observeRail(just)}</section>`;
}
