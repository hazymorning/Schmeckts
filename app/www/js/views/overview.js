/* Top of the home page, on the ground above the cards: whose day it is, then one sentence on where the day stands for the bowl.
   Of how a meal went only a hint when the last one was left; never what the cards below already show. */
import {esc} from '../text.js';
import {addDays, dayNumber, dayStart, quarterStr} from '../dates.js';
import {OBSERVATIONS, typeOf} from '../config.js';
import {icon} from '../icons.js';
import {db} from '../store.js';
import {calledNames, getObservation, getPet, getProduct} from '../derive.js';
import {glance} from '../glance.js';
import {POOLS} from '../content/pools.js';
import {fill, sharesWord} from './facts.js';
import {avatar} from './parts.js';

const FRESH = 60; // minutes a meal counts as news
const NIGHT = 5; // night lasts until this hour
const HOURS_FROM = 90; // minutes
const HALF = {1: 'eineinhalb', 2: 'zweieinhalb'};
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
  DUE = new Set(['due', 'dueFirst']);

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
const mealAt = min =>
  min < 630 ? 'Frühstück' : min < 870 ? 'Mittagessen' : min >= 1020 && min < 1290 ? 'Abendessen' : 'Futter';
const fresh = (g, now) => g.last && (now - g.last.servedAt) / 6e4 < FRESH;

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
  const {last, next, sex} = g;
  return {
    ...(next && {meal: mealAt(next.at), time: b(clock(next.at))}),
    ...(last && {span: b(spanOf(Math.round((now - last.servedAt) / 6e4)))}),
    ...(sex && (sex === 'f' ? {Sie: 'Sie', sie: 'sie'} : {Sie: 'Er', sie: 'er'})),
  };
}
// the day's sentence, the same all day; the next in its pool where it repeats a word of the heading
export function sentenceOf(g, now, head) {
  const values = valuesOf(g, now),
    list = POOLS[poolOf(g, now)].filter(t => [...t.matchAll(/\{(\w+)\}/g)].every(([, key]) => values[key] != null)),
    day = dayNumber(now),
    said = list.map((_, i) => fill(list[(day + i) % list.length], values));
  return said.find(t => !sharesWord(head, t)) ?? said[0];
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
