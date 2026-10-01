/* „Auswertung“: its card on the home page, the top and the biggest flop facing each other, and its page, what the
   ratings of the meals say, the conclusion first. Everything is found in smart.js (ranking(), moves(), trend(),
   nextUp(), patterns(), basis()), cached in derive.js; this only words it. On the page a variety is a row and a
   finding is one told sentence, and every variety opens its food sheet, where the buying and serving are. */
import {andList, cap, esc} from '../text.js';
import {icon, sketch} from '../icons.js';
import {evaluationModel, getPet, model, petNames, pname, rankingModel} from '../derive.js';
import {GOOD, goodOf, poorOf, ratingsIn} from '../smart.js';
import {
  avatar,
  evidenceOf,
  forWhom,
  head,
  lead,
  lower,
  strip,
  thumbOf,
  times,
  told,
  toldBtn,
  toldList,
  whyOf,
} from './parts.js';

const PLACES = 5; // the owner's „Top 5“ and „Flop 5“
const DAY = 864e5;
const AWAY = 42 * DAY; // a top not served for this long says so under its name
const NUMBERS = ['', 'eine', 'zwei', 'drei', 'vier', 'fünf'];
const named = e => `<b>${esc(pname(e.product))}</b>`;
const brandOf = p => (p.variety ? p.brand : '');
/* What a row's ratings say: those of every pet in the filter, as its strip shows them, where most of them lie on the
   row's side, good for a top and left or eaten in part for a flop; otherwise only the pets that decide it, named
   („Bei Minka 3 von 4 Mal nur die Soße geleckt“, whyOf()) */
function saidOf(e, side) {
  const good = goodOf(e.counts),
    left = poorOf(e.counts),
    agree = side === 'top' ? good * 2 > e.n : left * 2 > e.n || (e.n - good - left) * 2 > e.n;
  return agree ? evidenceOf(e) : whyOf(e);
}
/* How long ago, as people count it: „6 Wochen“, „3 Monaten“, „über einem Jahr“ */
function lapse(at, now) {
  const days = Math.floor((now - at) / DAY);
  return days < 60
    ? `${Math.floor(days / 7)} Wochen`
    : days < 365
      ? `${Math.floor(days / 30)} Monaten`
      : 'über einem Jahr';
}

/* The card: Top-Futter on the left, Größter Flop on the right, each the packaging, the name, the brand and the strip,
   and a tap opens the food sheet. A side without a variety keeps its word and says why. While no variety is on
   either side, a sentence says so and names the one closest to a verdict. No card while no ranked variety has a
   rating within the filter. */
const ROLE = {top: 'Top-Futter', flop: 'Größter Flop'};
function pole(m, r, e, side) {
  if (!e) {
    const [title, say] =
      side === 'top'
        ? ['Noch keins', 'Bisher kam keine Sorte meist gut an.']
        : r.settled >= 3
          ? ['Keiner', 'Keine Sorte bleibt meist stehen.']
          : ['Noch keiner', 'Dafür ist noch zu wenig bewertet.'];
    return `<div class="pole"><span class="pole-role">${ROLE[side]}</span>${sketch('empty', 'l')}<b>${title}</b><small>${say}</small></div>`;
  }
  const p = e.product,
    brand = brandOf(p),
    label = `${ROLE[side]}: ${pname(p)}${brand ? ` von ${brand}` : ''}. ${saidOf(e, side)}.`;
  return `<button class="pole" data-action="open-product" data-id="${e.id}" aria-label="${esc(label)}"><span class="pole-role">${ROLE[side]}</span>${thumbOf(null, p)}
    <b>${esc(pname(p))}</b>${brand ? `<small>${esc(brand)}</small>` : ''}${strip(ratingsIn(m, [e.id]))}</button>`;
}
/* The variety closest to a verdict, in words: „noch einmal servieren“, with several pets „noch einmal für Minka“ */
const needs = (t, several) =>
  `noch ${t.need === 1 ? 'einmal' : 'zweimal'}${several ? ` für ${esc(getPet(t.pet).name)}` : ''} servieren, dann steht’s fest`;
export function evaluationCard(m) {
  const r = rankingModel();
  if (!r.settled && !r.thin.length) return '';
  let body;
  if (r.top.length || r.flop.length)
    body = `<div class="poles">${pole(m, r, r.top[0], 'top')}${pole(m, r, r.flop[0], 'flop')}</div>`;
  else {
    const t = r.trials[0];
    body = `<p class="say card-line">${r.settled ? 'Noch ist keine Sorte klar vorn oder klar hinten.' : 'Noch steht keine Sorte fest.'}</p>
      <p class="hint card-line">${t ? `Am weitesten ist ${named(t.e)}: ${needs(t, m.pets.length > 1)}.` : 'Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt und was stehen bleibt.'}</p>`;
  }
  return `<section class="card" data-sec="evaluation" style="view-transition-name:sec-evaluation"><h2>Auswertung</h2>${body}
    <button class="card-btn" data-action="open-evaluation">Ganze Auswertung${icon('chevron')}</button></section>`;
}

/* A place in Top 5 or Flop 5: the figure, „neu“ under it where the variety came onto its side within the last 30 days,
   the name, under it the brand and what its ratings say, for a top not served for a while since when, and the strip */
function placeRow(m, x, e, i, side) {
  const p = e.product,
    brand = brandOf(p),
    said = saidOf(e, side),
    fresh = x.moves.fresh.has(e.id),
    now = Date.now(),
    at = side === 'top' ? x.last.get(e.id) : 0,
    away = at && now - at >= AWAY ? `zuletzt vor ${lapse(at, now)}` : '',
    label = `Platz ${i + 1}: ${pname(p)}${brand ? ` von ${brand}` : ''}. ${said}.${fresh ? ' Neu dabei.' : ''}${away ? ` ${cap(away)}.` : ''}`;
  return `<li><button class="row" data-action="open-product" data-id="${e.id}" aria-label="${esc(label)}"><span class="place">${i + 1}${fresh ? '<small>neu</small>' : ''}</span>
    <span class="t-main"><b>${esc(pname(p))}</b><small>${esc(cap([brand, lower(said), away].filter(Boolean).join(', ')))}</small></span>${strip(ratingsIn(m, [e.id]))}</button></li>`;
}
const card = (title, inner) => `<section class="card"><h2>${title}</h2>${inner}</section>`;
const say = text => `<p class="say card-line">${text}</p>`;
const places = (m, x, list, side) =>
  `<ol class="list ranks">${list.map((e, i) => placeRow(m, x, e, i, side)).join('')}</ol>`;
/* Top 5 and Flop 5: never padded with a variety that does not belong there, so the heading says how many there are.
   Over the tops, where the varieties differ no more than chance would make them, that they may be chance; over fewer
   than five flops, that the rest goes down better. */
function listsHTML(m, r, x) {
  if (!r.settled)
    return card(
      'Top und Flop',
      say(
        'Noch steht keine Sorte fest. Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt und was stehen bleibt.',
      ),
    );
  const top = r.top.slice(0, PLACES),
    flop = r.flop.slice(0, PLACES),
    rest = r.top.length + r.mid.length;
  const tops = top.length
    ? card(
        top.length > 1 ? `Top ${top.length}` : 'Top-Futter',
        (r.flat ? say('Die Abstände sind noch so klein, dass sie Zufall sein können.') : '') + places(m, x, top, 'top'),
      )
    : card('Top', say('Bisher kam keine Sorte meist gut an.'));
  const flops = flop.length
    ? card(
        flop.length > 1 ? `Flop ${flop.length}` : 'Ein Flop',
        (flop.length < PLACES && rest
          ? say(
              `Nur ${flop.length === 1 ? 'diese eine fällt' : `diese ${NUMBERS[flop.length]} fallen`} ab, alle anderen kommen besser an.`,
            )
          : '') + places(m, x, flop, 'flop'),
      )
    : r.settled >= 3
      ? card('Kein Flop', say('Keine Sorte bleibt meist stehen.'))
      : card('Noch kein Flop', say('Dafür ist noch zu wenig bewertet.'));
  return tops + flops;
}

/* „Wie läuft’s gerade?“: per pet the last four weeks against the eight before, one line for all of them where nothing
   changed; then the varieties that went down or up within the month, unless the pet's own line already explains
   them */
function petLine(m, t) {
  const pet = getPet(t.pet),
    who = `<b>${esc(pet.name)}</b>`,
    worse = t.dir < 0,
    behind = t.behind?.length ? ` Es liegt wohl an ${andList(t.behind.map(id => named(m.byId.get(id))))}.` : '';
  const text =
    t.kind === 'gleich'
      ? `Bei ${who} läuft’s wie gehabt.`
      : t.kind === 'etwas'
        ? worse
          ? `${who} frisst zuletzt etwas schlechter, aber noch im Rahmen.`
          : `${who} frisst zuletzt etwas besser.`
        : t.cause === 'tier'
          ? `${who} frisst ${worse ? 'seit ein paar Wochen deutlich schlechter' : 'gerade deutlich besser'}, auch bei den gewohnten Sorten.`
          : t.cause === 'futter'
            ? `${who} frisst zuletzt deutlich ${worse ? 'schlechter' : 'besser'}, bei den gewohnten Sorten aber wie vorher.${behind}`
            : `${who} frisst ${worse ? 'seit ein paar Wochen deutlich schlechter' : 'gerade deutlich besser'}.`;
  return told(avatar(pet, 's'), text, weeks(t.recent, t.before));
}
const weeks = (recent, before) =>
  `In den letzten vier Wochen <b>${times(recent.good, recent.n)}</b> gut gefressen, in den acht davor <b>${times(before.good, before.n)}</b>.`;
const MOVED = 2; // varieties told as gone down or up, at most
function trendCard(m, x) {
  const lines = x.trend,
    rows = [];
  if (lines.length > 1 && lines.every(t => t.kind === 'gleich')) {
    const sum = k => ({n: lines.reduce((a, t) => a + t[k].n, 0), good: lines.reduce((a, t) => a + t[k].good, 0)});
    rows.push(
      told(
        lead('paw'),
        `Bei ${andList(lines.map(t => `<b>${esc(getPet(t.pet).name)}</b>`))} läuft’s wie gehabt.`,
        weeks(sum('recent'), sum('before')),
      ),
    );
  } else rows.push(...lines.map(t => petLine(m, t)));
  // a pet that eats differently with the usual food too explains the varieties going the same way
  const pet = dir => lines.some(t => t.cause === 'tier' && t.dir === dir),
    moved = [
      ...(pet(-1) ? [] : x.moves.cooled.map(v => ['fall', v, 'kommt nicht mehr so gut an wie vor einem Monat'])),
      ...(pet(1) ? [] : x.moves.warmed.map(v => ['rise', v, 'kommt inzwischen gut an'])),
    ].slice(0, MOVED);
  for (const [ic, v, text] of moved)
    rows.push(
      toldBtn(
        v.id,
        lead(ic),
        `${named(m.byId.get(v.id))} ${text}.`,
        `Davor ${lower(evidenceOf(v.before))}, seitdem ${lower(evidenceOf(v.since))}.`,
      ),
    );
  return rows.length ? card('Wie läuft’s gerade?', toldList(rows)) : '';
}

/* „Geschmackssache“: with „Alle“, the varieties the pets disagree on, which is why they stand in neither list, each with
   what every pet's ratings say */
const SPLIT = 5;
function splitCard(m, r) {
  if (m.pet || !r.split.length) return '';
  const rows = r.split.slice(0, SPLIT).map(e => {
    const p = e.product,
      each = m.pets.filter(pid => e.pets[pid]?.n).map(pid => `${getPet(pid).name} ${lower(evidenceOf(e.pets[pid]))}`),
      sub = [brandOf(p), ...each].filter(Boolean).join(', ');
    return `<li><button class="row" data-action="open-product" data-id="${e.id}"><span class="t-main"><b>${esc(pname(p))}</b><small>${esc(sub)}</small></span>${strip(ratingsIn(m, [e.id]))}</button></li>`;
  });
  return card(
    'Geschmackssache',
    say(`Hier sind sich ${esc(petNames(m.pets))} nicht einig.`) + `<ul class="list ranks">${rows.join('')}</ul>`,
  );
}

/* „Worauf es ankommt“: the clearest comparisons of „Vorlieben“, each in one sentence with what it rests on, „deutlich“
   only where „Vorlieben“ says so too; and before them where to look for something new, only from those clear ones
   whose best group goes down well */
const DIM_ICON = {konsistenz: 'layers', geschmack: 'fish', marke: 'tag'};
const inText = key => key.replace(/^In /, 'in '); // „besser als in Soße“
const lookFor = d =>
  d.kind === 'konsistenz'
    ? /^In /.test(d.groups[0].key)
      ? inText(d.groups[0].key)
      : `als ${d.groups[0].key}`
    : `${d.kind === 'geschmack' ? 'mit' : 'von'} ${d.groups[0].key}`;
function patternCard(x) {
  if (!x.patterns.length) return '';
  const rows = x.patterns.map(d => {
    const [a, z] = [d.groups[0], d.groups.at(-1)];
    return told(
      lead(DIM_ICON[d.kind]),
      d.clear
        ? `<b>${esc(a.key)}</b> kommt deutlich besser an als <b>${esc(inText(z.key))}</b>.`
        : `Bisher kam <b>${esc(inText(a.key))}</b> besser an als <b>${esc(inText(z.key))}</b>.`,
      `${esc(a.key)} <b>${times(a.good, a.n)}</b> gut gefressen, ${esc(inText(z.key))} <b>${times(z.good, z.n)}</b>.`,
    );
  });
  const tips = x.patterns.filter(d => d.clear && d.groups[0].share * 100 >= GOOD).map(d => `<b>${esc(lookFor(d))}</b>`);
  return card(
    'Worauf es ankommt',
    (tips.length ? say(`Neues am ehesten ${andList(tips)} probieren.`) : '') + toldList(rows),
  );
}

/* „Als Nächstes“: what to put in the bowl. Favourites not served for a while, varieties a rating or two short of a
   verdict with the dots still missing after their strip (with one pet in view, where the count is that pet's), and a
   second chance where the pet needs a while with new food. */
const TRIALS = 3;
function nextCard(m, r, x) {
  const now = Date.now(),
    several = m.pets.length > 1,
    rows = [];
  for (const v of x.next.missed)
    rows.push(
      toldBtn(
        v.id,
        lead('clock'),
        `${named(m.byId.get(v.id))} gab es seit ${lapse(v.at, now)} nicht mehr.`,
        `Davor ${lower(evidenceOf(v))}.`,
      ),
    );
  for (const t of r.trials.slice(0, TRIALS))
    rows.push(
      toldBtn(
        t.e.id,
        lead('repeat'),
        `${named(t.e)} ${needs(t, several)}.`,
        `Bisher ${lower(evidenceOf(t.e))}.`,
        strip(ratingsIn(m, [t.e.id]), several ? 0 : t.need),
      ),
    );
  for (const v of x.next.retry)
    rows.push(
      toldBtn(
        v.id,
        lead('sparkle'),
        `${named(m.byId.get(v.id))} blieb beim ersten Mal stehen.`,
        `${esc(getPet(v.pet).name)} braucht bei Neuem oft Anlauf, ein zweiter Versuch kann sich lohnen.`,
      ),
    );
  return rows.length ? card('Als Nächstes', toldList(rows)) : '';
}

/* What the page rests on, under its cards: how many ratings since when, how many of them count, and the types left out
   that have ratings */
const LEFT = {Snack: 'Snacks', Trockenfutter: 'Trockenfutter'};
function footHTML(m, b) {
  const parts = [];
  if (b.n) {
    const first = new Date(b.first),
      date = first.toLocaleDateString('de-DE', {
        day: 'numeric',
        month: 'long',
        ...(first.getFullYear() === new Date().getFullYear() ? {} : {year: 'numeric'}),
      });
    parts.push(
      b.n === 1 ? `Aus einer Bewertung vom ${date}.` : `Aus ${b.n} Bewertungen seit dem ${date}.`,
      `Je Sorte${m.pets.length > 1 ? ' und Tier' : ''} zählen die neuesten acht aus dem letzten halben Jahr.`,
    );
  }
  if (b.left.length)
    parts.push(
      `${andList(b.left.map(t => LEFT[t]))} ${b.left.length > 1 || b.left[0] === 'Snack' ? 'zählen' : 'zählt'} hier nicht mit.`,
    );
  return parts.length ? `<p class="hint foot">${parts.join(' ')}</p>` : '';
}

export function viewEvaluation() {
  const m = model(),
    r = rankingModel(),
    x = evaluationModel();
  return `${head('Auswertung' + forWhom(m.pet))}${listsHTML(m, r, x)}${trendCard(m, x)}${splitCard(m, r)}${patternCard(x)}${nextCard(m, r, x)}${footHTML(m, x.basis)}`;
}
