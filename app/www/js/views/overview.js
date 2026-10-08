/* Top of the home page, on the ground above the cards: whose day it is, then where the day stands for the bowl, in
   facts. Of how a meal went only a hint when the last one was left; never what the cards below already show. */
import {andList, esc} from '../text.js';
import {addDays, clockStr, DAY, dayNumber, dayStart, quarterStr} from '../dates.js';
import {flavoursOf, OBSERVATIONS, typeOf} from '../config.js';
import {icon} from '../icons.js';
import {db} from '../store.js';
import {calledNames, getObservation, getPet, getProduct} from '../derive.js';
import {glance} from '../glance.js';
import {POOLS, TREAT_LINES} from '../content/pools.js';
import {fill, sharesWord} from './facts.js';
import {avatar} from './parts.js';

const FRESH = 60; // minutes a meal counts as news
const NIGHT = 5; // night lasts until this hour
const HOURS_FROM = 90; // minutes
const SPAN = 12 * 60; // minutes up to which the last meal is said as „vor 3 Stunden“
const TURN = 3; // hours a wording stays, unless something is served
const LONG = 110; // characters a sentence and its treat line keep below
const AFTERNOON = 14; // from this hour no treat yet is said, where treats are usual
const HALF = {1: 'eineinhalb', 2: 'zweieinhalb'};
const COUNT = ['', 'einmal', 'zweimal', 'dreimal', 'viermal', 'fünfmal', 'sechsmal', 'siebenmal', 'achtmal'];
const NTH = ['', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte', 'neunte'];
const NUMBER = ['', 'einen', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn'];
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
// the moments with a pool of their own for after a meal was left
const LEFT = {
  due: 'leftDue',
  dueFirst: 'leftDue',
  later: 'leftLater',
  morning: 'leftLater',
  done: 'leftDone',
  today: 'leftToday',
};
const SLEEP = new Set(['night', 'lastNight']),
  DUE = new Set(['due', 'dueFirst']),
  TREATS = new Set(['later', 'done', 'today']), // where today's treats may follow
  OPEN = new Set(['later', 'today']); // and where the day still runs, so none yet can be said

const b = text => `<b>${text}</b>`;
// min: minutes after midnight; a full hour as „19 Uhr“
function clock(min) {
  const at = quarterStr(min);
  return at.endsWith(':00') ? `${at.slice(0, -3)} Uhr` : at;
}
function spanOf(min) {
  if (min < HOURS_FROM) return `${min} Minuten`;
  const halves = Math.round(min / 30),
    hours = Math.floor(halves / 2);
  return halves % 2 && HALF[hours] ? `${HALF[hours]} Stunden` : `${Math.round(min / 60)} Stunden`;
}
// the first meal of a day is its breakfast up to noon, whenever it comes
const mealAt = (min, first) =>
  (first ? min < 720 : min < 630)
    ? 'Frühstück'
    : min < 870
      ? 'Mittagessen'
      : min >= 1020 && min < 1290
        ? 'Abendessen'
        : 'Futter';
const fresh = (g, now) => g.last && (now - g.last.servedAt) / 6e4 < FRESH;
const daysBefore = (t, now) => Math.round((dayStart(now) - dayStart(t)) / DAY);
const dateOf = t => new Date(t).toLocaleDateString('de-DE', {day: 'numeric', month: 'long'});
// „um 7:15“, „gestern um 19:28“, „am 3. Oktober um 18:00“
function whenOf(t, now) {
  const days = daysBefore(t, now);
  return `${days === 0 ? '' : days === 1 ? 'gestern ' : `am ${dateOf(t)} `}um ${clockStr(t)}`;
}
// what a meal was, as in „es gab Huhn und Pute“; dry food by its kind, a variety without a flavour not at all
function whatOf(s) {
  const p = getProduct(s.productId);
  if (!p) return null;
  const flavours = typeOf(p) === 'Trockenfutter' ? ['Trockenfutter'] : flavoursOf(p.variety);
  return flavours.length ? andList(flavours) : null;
}

// the moment the card speaks of, the key of a pool
export function momentOf(g, now) {
  if (!g.last) return 'none';
  const today = g.last.servedAt >= dayStart(now),
    yesterday = !today && g.last.servedAt >= addDays(dayStart(now), -1),
    night = new Date(now).getHours() < NIGHT;
  if (g.next?.due) return today ? 'due' : 'dueFirst';
  if (fresh(g, now)) return 'fresh';
  if (!today && !yesterday) return 'older';
  if (g.next && night) return 'night';
  if (g.next && !g.next.tomorrow) return today ? 'later' : 'morning';
  if (g.next && today) return 'done';
  return today ? 'today' : night ? 'lastNight' : 'yesterday';
}
// a meal left, then the moment
export function poolOf(g, now) {
  const moment = momentOf(g, now);
  if (g.left && LEFT[moment]) return LEFT[moment];
  return moment === 'fresh' && typeOf(getProduct(g.last.productId)) === 'Snack' ? 'freshTreat' : moment;
}
// what a sentence can name; what the moment does not have is left out
export function valuesOf(g, now) {
  const {last, meal, next, sex, meals = 0, treats = 0} = g,
    since = meal && Math.round((now - meal.servedAt) / 6e4),
    what = meal && whatOf(meal);
  return {
    ...(next && {meal: mealAt(next.at, !meals || next.tomorrow), time: b(clock(next.at))}),
    ...(meal && since < SPAN && {span: b(spanOf(since))}),
    ...(meal && {when: whenOf(meal.servedAt, now)}),
    ...(what && {what: esc(what)}),
    ...(meals >= 2 && {count: COUNT[meals] || `${meals}-mal`}),
    ...(meals && NTH[meals + 1] && {nth: NTH[meals + 1]}),
    ...(treats >= 2 && NTH[treats] && {nthTreat: NTH[treats] + 'n'}),
    ...(last && {days: `${daysBefore(last.servedAt, now)} Tage`, date: `am ${dateOf(last.servedAt)}`}),
    ...(sex && (sex === 'f' ? {Sie: 'Sie', sie: 'sie'} : {Sie: 'Er', sie: 'er'})),
  };
}
const keysOf = t => [...t.matchAll(/\{(\w+)\}/g)].map(([, key]) => key);
// from turn on, the first one the values fill that repeats no word of avoid; one naming nothing only if none can
function pick(pool, values, turn, avoid) {
  const fits = pool.filter(t => keysOf(t).every(key => values[key] != null)),
    named = fits.filter(t => keysOf(t).length),
    list = named.length ? named : fits,
    said = list.map((_, i) => fill(list[(turn + i) % list.length], values));
  return said.find(t => !sharesWord(avoid, t)) ?? said[0] ?? '';
}
const plain = html => html.replace(/<[^>]*>/g, '');
// today's treats, or none yet in an afternoon where treats are usual; only where the sentence leaves room
function treatLine(g, now, pool, turn, said, head) {
  const lines = g.treats
    ? TREAT_LINES.some
    : OPEN.has(pool) && g.treatsUsual && new Date(now).getHours() >= AFTERNOON
      ? TREAT_LINES.none
      : null;
  if (!lines) return '';
  const treats = g.treats === 1 ? 'einen Snack' : `${NUMBER[g.treats] || g.treats} Snacks`,
    line = pick(lines, {treats}, turn, `${head} ${said}`);
  return plain(said).length + line.length < LONG ? ' ' + line : '';
}
/* A wording stays for TURN hours and until the next serving, which moves the pool on by one; each stretch of hours
   starts somewhere else. The next where it repeats a word of the heading. */
export function sentenceOf(g, now, head) {
  const values = valuesOf(g, now),
    pool = poolOf(g, now),
    stretch = dayNumber(now) * 8 + Math.floor(new Date(now).getHours() / TURN),
    turn = (Math.imul(stretch, 2654435761) >>> 8) + (g.meals || 0) + (g.treats || 0),
    said = pick(POOLS[pool], values, turn, head);
  return TREATS.has(pool) ? said + treatLine(g, now, pool, turn, said, head) : said;
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
  const g = glance(db, ids, now),
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
  return `<section class="overview" data-sec="overview"${DUE.has(moment) ? ' data-due' : ''} style="view-transition-name:sec-overview">
    <div class="ov-top">${pic}<div class="ov-text"><h2>${head}</h2><p>${sentenceOf(g, now, head)}</p></div></div>
    ${observeRail(just)}</section>`;
}
