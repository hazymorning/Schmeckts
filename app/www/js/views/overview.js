/* Top of the home page, on the ground above the cards: whose day it is, then how it goes at the bowl, in facts: the
   last meal and how it went, then one more of the day. Never the schedule, never what the cards below show. */
import {andList, cap, esc} from '../text.js';
import {addDays, clockStr, DAY, dayNumber, dayStart} from '../dates.js';
import {flavoursOf, OBSERVATIONS, observationOf, RATINGS, typeOf} from '../config.js';
import {icon} from '../icons.js';
import {db} from '../store.js';
import {calledNames, getObservation, getPet, getProduct, pname, rankingModel} from '../derive.js';
import {glance} from '../glance.js';
import {ANCHORS, FACTS, NOTABLE} from '../content/pools.js';
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
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
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
  const {last, meal, sex, pets = 1} = g,
    what = meal && whatOf(meal),
    ago = meal && agoOf(meal.servedAt, now),
    p = meal && getProduct(meal.productId);
  return {
    ...(ago && {ago, Ago: cap(ago)}),
    ...(what && {what: esc(what)}),
    ...(g.rating && {said: RATINGS[g.rating].said}),
    ...(pets > 1 && g.outcome === 'good' && {all: `${pets === 2 ? 'beide' : 'alle'} haben gut gefressen`}),
    ...(pets > 1 && g.outcome === 'left' && {all: 'da blieb einiges stehen'}),
    ...(last && {days: `${daysBefore(last.servedAt, now)} Tage`, date: `am ${dateOf(last.servedAt)}`}),
    ...(g.treats >= 2 && NTH[g.treats] && {nthTreat: NTH[g.treats]}),
    ...(g.noted?.length && {noted: andList(g.noted.map(k => `„${observationOf(k).label}“`))}),
    ...(g.first && p && {variety: esc(pname(p))}),
    ...(g.streak?.n && {k: number(g.streak.n)}),
    ...(g.week?.n && {good: g.week.good, n: g.week.n}),
    ...(g.favourite && {fav: esc(g.favourite)}),
    ...(g.treats && {treats: g.treats === 1 ? 'einen Snack' : `${number(g.treats)} Snacks`}),
    ...(g.meals >= 2 && {count: number(g.meals)}),
    ...(g.week?.sorts && {sorts: number(g.week.sorts)}),
    ...(sex && (sex === 'f' ? {Sie: 'Sie', sie: 'sie', ihr: 'ihr'} : {Sie: 'Er', sie: 'er', ihr: 'sein'})),
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
const RICH = ['said', 'all', 'what', 'variety']; // what the last meal was and how it went
/* From turn on, the first wording the values fill that repeats no word of avoid: of those telling the most of the
   meal, else of those naming anything, else any. */
function pick(pool, values, turn, avoid) {
  const fits = pool.filter(t => keysOf(t).every(key => values[key] != null)),
    rich = t => keysOf(t).filter(key => RICH.includes(key)).length,
    most = Math.max(0, ...fits.map(rich)),
    list = most
      ? fits.filter(t => rich(t) === most)
      : fits.filter(t => keysOf(t).length).length
        ? fits.filter(t => keysOf(t).length)
        : fits,
    said = list.map((_, i) => fill(list[(turn + i) % list.length], values));
  return said.find(t => !sharesWord(avoid, t)) ?? said[0] ?? '';
}
const LONG = 120; // characters the two sentences keep below
/* The sentence on the last meal, then a fact of the day. A wording stays for TURN hours and until something is served
   or noted, which moves it on by one; each stretch of hours starts somewhere else. */
export function sentenceOf(g, now, head) {
  const moment = momentOf(g, now),
    values = valuesOf(g, now),
    stretch = dayNumber(now) * 8 + Math.floor(new Date(now).getHours() / TURN),
    turn = (Math.imul(stretch, 2654435761) >>> 8) + (g.meals || 0) + (g.treats || 0) + (g.noted?.length || 0),
    first = pick(ANCHORS[anchorOf(moment, g)], values, turn, head);
  if (moment === 'none' || moment === 'older') return first;
  const facts = factsOf(g, now, moment),
    room = LONG - plain(first).length;
  // two sentences in a row do not both start with the pronoun
  const lead = values.Sie && first.startsWith(values.Sie + ' ');
  // the notable ones in their order, the others in turn
  const from = NOTABLE.includes(facts[0]) ? 0 : turn;
  for (let i = 0; i < facts.length; i++) {
    const pool = FACTS[facts[(from + i) % facts.length]],
      said = pick(lead ? pool.filter(t => !t.startsWith('{Sie}')) : pool, values, turn, head);
    if (said && plain(said).length < room && !sharesWord(head, said)) return `${first} ${said}`;
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

// Mau’s, Felix’: with the apostrophe the name stays as it is, Mau never turns into Maus
const whose = name => (/(s|ß|x|z|ce)$/i.test(name) ? `${name}’` : `${name}’s`);
// whose day the card tells, in a wording that changes from day to day; more than two pets are the Bande
const HEADS = {
  one: {
    any: [
      '{whose} Tag',
      '{whose} {weekday}',
      '{name} heute',
      'Ein Tag mit {name}',
      '{whose} Speiseplan',
      'Neues von {name}',
      'Bei {name} zu Hause',
      '{whose} Revier',
    ],
    weekend: '{whose} Wochenende',
    night: ['{whose} Nacht', 'Nachtruhe bei {name}'],
  },
  two: {
    any: [
      'Der Tag von {names}',
      '{names} heute',
      'Ein Tag mit {names}',
      '{weekday} bei {names}',
      'Neues von {names}',
      'Bei {names} zu Hause',
      'Das Revier von {names}',
    ],
    weekend: 'Wochenende bei {names}',
    night: ['Die Nacht von {names}', 'Nachtruhe bei {names}'],
  },
  more: {
    any: [
      'Der Tag der Bande',
      'Die Bande heute',
      'Ein Tag mit der Bande',
      '{weekday} bei der Bande',
      'Neues von der Bande',
      'Bei der Bande zu Hause',
      'Das Revier der Bande',
    ],
    weekend: 'Wochenende bei der Bande',
    night: ['Die Nacht der Bande', 'Nachtruhe bei der Bande'],
  },
};
// a wording a day
export function headOf(pets, now, moment) {
  const heads = HEADS[pets.length === 1 ? 'one' : pets.length === 2 ? 'two' : 'more'],
    day = new Date(now).getDay(),
    list = SLEEP.has(moment) ? heads.night : [...heads.any, ...(day % 6 ? [] : [heads.weekend])],
    ids = pets.map(p => p.id),
    names = esc(calledNames(ids, 'head', now));
  return fill(list[dayNumber(now) % list.length], {whose: whose(names), name: names, names, weekday: WEEKDAYS[day]});
}
// noted: the entry just made, so the chip just tapped can answer
export function overviewHTML(m, noted = null) {
  const pets = m.pet ? [getPet(m.pet)] : db.pets,
    one = pets.length === 1 ? pets[0] : null,
    now = Date.now(),
    ids = pets.map(p => p.id);
  const fav = rankingModel().top[0]?.product,
    g = {...glance(db, ids, now), pets: ids.length, favourite: fav && pname(fav)},
    moment = momentOf(g, now),
    head = headOf(pets, now, moment);
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
    <div class="ov-top">${pic}<div class="ov-text"><h2>${head}</h2><p>${sentenceOf(g, now, head)}</p></div></div>
    ${observeRail(just)}</section>`;
}
