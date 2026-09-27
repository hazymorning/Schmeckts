/* The overview card at the top of the home page: the pet in the filter, the household under „Alle“, with picture,
   name and a glance at the day (glance.js). First what they had today and when, from whom in a household, then what
   it was, when the next meal usually comes, and one line more that changes from day to day: a first time, a
   milestone close by, the week's feeding duel, a streak, an idea for a change, the treats or something about the
   animal. Never how a meal went: that is what the cards below it are for. */
import {esc} from '../text.js';
import {addDays, ago, dayStart, timeStr} from '../dates.js';
import {typeOf} from '../config.js';
import {db} from '../store.js';
import {isConnected} from '../sync.js';
import {getPet, getProduct, petNames, pname, servingPets} from '../derive.js';
import {glance} from '../glance.js';
import {avatar} from './parts.js';

/* Something about the animal, one a day. Only what holds for most of them; "Andere" and mixed households take the
   general ones. */
export const FACTS = {
  Katze: [
    'Katzen schmecken nichts Süßes. Ihnen fehlt der Rezeptor dafür.',
    'Katzen haben nur einige Hundert Geschmacksknospen, Menschen mehrere Tausend.',
    'Katzen fressen mit der Nase: Zimmerwarm riecht Futter stärker als kühlschrankkalt.',
    'Mit Schnupfen fressen viele Katzen schlecht, weil sie ihr Futter kaum riechen.',
    'Frei lebende Katzen fressen viele kleine Mahlzeiten über den Tag verteilt.',
    'Viele Katzen trinken lieber, wenn das Wasser nicht direkt neben dem Futter steht.',
    'Katzen verschlafen den größten Teil des Tages. Viel Zeit, von der nächsten Mahlzeit zu träumen.',
  ],
  Hund: [
    'Hunde haben rund 1700 Geschmacksknospen, Menschen etwa fünfmal so viele.',
    'Anders als Katzen schmecken Hunde auch Süßes.',
    'Beim Futter zählt für Hunde vor allem, wie es riecht.',
    'Hunde kennen ihre Fütterzeiten meist besser als jede Uhr.',
  ],
  Kaninchen: [
    'Kaninchen fressen am meisten in der Dämmerung, morgens und abends.',
    'Heu sollte immer da sein. Das Kauen hält die Zähne der Kaninchen kurz.',
  ],
  Vogel: ['Vögel haben nur wenige Hundert Geschmacksknospen.'],
  Nager: ['Bei Nagern wachsen die Schneidezähne ein Leben lang nach.'],
};
export const GENERAL = [
  'Frisches Wasser gehört zu jeder Mahlzeit.',
  'Neues Futter am besten nach und nach unter das gewohnte mischen.',
];
const STREAK = 5; // from this many days in a row the streak is worth a line
const MILESTONE_NEAR = 5; // and a milestone from this many meals before it
const SNACKS = 3; // and the treats of the day from this many on

const b = text => `<b>${text}</b>`;
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sortName = id => esc(pname(getProduct(id)));
/* When the last meal was: „gerade eben“, „vor 40 Min.“, „gestern um 19:30“, „vorgestern“, „vor 3 Tagen“, „am 3. Juni“ */
function since(t, now) {
  if (t >= dayStart(now)) return ago(t);
  if (t >= addDays(dayStart(now), -1)) return `gestern um ${timeStr(t)}`;
  const text = ago(t);
  return /^\d/.test(text) ? 'am ' + text : text;
}
/* A usual time as people say it, to the quarter hour: „18 Uhr“, „7:15 Uhr“ */
function clock(min) {
  const m = Math.round(min / 15) * 15,
    h = Math.floor(m / 60) % 24;
  return m % 60 ? `${h}:${String(m % 60).padStart(2, '0')} Uhr` : `${h} Uhr`;
}

/* Today: „Heute 2 Mahlzeiten und 1 Snack, zuletzt vor 40 Min.“, in a household with who fed last */
function todayLine({last, meals, snacks}, now) {
  const what = [meals && count(meals, 'Mahlzeit', 'Mahlzeiten'), snacks && count(snacks, 'Snack', 'Snacks')]
    .filter(Boolean)
    .map(b)
    .join(' und ');
  const when = since(last.servedAt, now),
    by = isConnected() && last.by ? ` von ${b(esc(last.by))}.` : when.endsWith('.') ? '' : '.'; // in a household it matters who fed
  return `${what ? 'Heute ' + what : 'Heute noch ' + b('nichts')}, zuletzt ${b(when)}${by}`;
}
/* What it was: „Es gab Lachs.“, with several pets who had it */
function lastLine({last}, pets) {
  const p = getProduct(last.productId),
    what = p ? (typeOf(p) === 'Snack' ? 'einen Snack: ' : '') + b(esc(pname(p))) : 'Futter, das noch keinen Namen hat',
    ids = servingPets(last);
  if (pets.length < 2) return `Es gab ${what}.`;
  return `${esc(petNames(ids))} ${ids.length > 1 ? 'bekamen' : 'bekam'} ${what}.`;
}
/* When the next meal usually comes (nextMeal() in smart.js) */
function nextLine(next) {
  if (!next) return '';
  if (next.due) return 'Um diese Zeit gibt es sonst Futter.';
  return `Die nächste Mahlzeit gibt es ${next.tomorrow ? 'morgen, ' : ''}meist gegen ${b(clock(next.at))}.`;
}
function duelLine([first, second]) {
  if (first.n > second.n)
    return `Beim Füttern liegt diese Woche ${b(esc(first.name))} vorn, ${first.n} zu ${second.n}.`;
  return `Beim Füttern steht es diese Woche ${b(`${first.n} zu ${second.n}`)} zwischen ${esc(first.name)} und ${esc(second.name)}.`;
}
/* One line more. What is only true today comes first, the rest takes turns by the day. */
function extraLine(g, pets, now) {
  if (g.premiere) return `Heute zum ersten Mal: ${b(sortName(g.premiere))}.`;
  if (g.milestone && g.milestone.left <= MILESTONE_NEAR)
    return `Noch ${b(g.milestone.left + '×')} füttern bis zum ${b(g.milestone.n + '. Mal')}.`;
  const day = Math.round(dayStart(now) / 864e5),
    kinds = new Set(pets.map(p => p.species)),
    facts = (kinds.size === 1 && FACTS[[...kinds][0]]) || GENERAL;
  const lines = [
    isConnected() && g.feeders.length > 1 && duelLine(g.feeders),
    g.streak >= STREAK && `Seit ${b(g.streak + ' Tagen')} jeden Tag eingetragen.`,
    g.idea && `Wie wär’s mal wieder mit ${b(sortName(g.idea.id))}? Das gab es seit ${g.idea.days} Tagen nicht.`,
    g.snacks >= SNACKS && `Schon ${b(g.snacks + ' Snacks')} heute. Wer kann da schon nein sagen?`,
    facts[day % facts.length],
  ].filter(Boolean);
  return lines[day % lines.length];
}
export function overviewText(g, pets, now = Date.now()) {
  if (!g.last) return 'Noch nichts serviert.';
  return [todayLine(g, now), lastLine(g, pets), nextLine(g.next), extraLine(g, pets, now)].filter(Boolean).join(' ');
}

/* The card. A tap on the picture opens the pet. Folded up the text is two lines ending in „…“; a tap on the card
   shows all of it and back again (toggleOverview() in views/home.js). open: unfolded. */
export function overviewHTML(m, open) {
  const pets = m.pet ? [getPet(m.pet)] : db.pets,
    one = pets.length === 1 ? pets[0] : null;
  const flops = new Set(m.sorts.filter(e => e.choice === 'nicht').map(e => e.id)), // no idea of a variety nobody buys
    g = glance(
      db,
      pets.map(p => p.id),
      Date.now(),
      flops,
    );
  const pic = one
    ? `<button class="ov-pic" data-action="open-pet" data-id="${one.id}" aria-label="${esc(one.name)} bearbeiten">${avatar(one, 'xxl')}</button>`
    : `<span class="ov-pic">${pets
        .slice(0, 2)
        .map(p => avatar(p, 'l pair'))
        .join('')}</span>`;
  const tap = g.last ? ` data-action="toggle-overview" aria-expanded="${!!open}"` : ''; // „Noch nichts serviert.“ is short
  return `<section class="card overview${open ? ' open' : ''}" data-sec="overview"${tap} style="view-transition-name:sec-overview">${pic}<div class="ov-text"><h2>${esc(petNames(pets.map(p => p.id)))}</h2><p>${overviewText(g, pets)}</p></div></section>`;
}
