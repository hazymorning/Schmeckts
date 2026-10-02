// Evaluation card and page. The analysis is in smart.js, this only words it
import {andList, cap, esc} from '../text.js';
import {DAY} from '../dates.js';
import {icon} from '../icons.js';
import {observationOf, TEXTURES} from '../config.js';
import {db} from '../store.js';
import {
  evaluationModel,
  getPet,
  getProduct,
  habitsModel,
  model,
  petNames,
  pname,
  profileModel,
  rankingModel,
} from '../derive.js';
import {GOOD, goodOf, poorOf, ratingsIn} from '../smart.js';
import {
  avatar,
  cardHead,
  evidenceOf,
  forWhom,
  habitRow,
  head,
  likesList,
  lower,
  obsThumb,
  SIDE,
  sideIcon,
  sign,
  since,
  strip,
  thumbOf,
  times,
  told,
  toldBtn,
  toldList,
  whyOf,
} from './parts.js';

const PLACES = 5;
const AWAY = 42 * DAY; // a top unserved this long shows since when
const JUDGE = 4; // settled varieties before the portrait calls a pet picky or easy to please
const brandOf = p => (p.variety ? p.brand : '');
// adds the brand where another variety has the same name
function nameOf(e) {
  const p = e.product,
    twins = db.products.filter(q => pname(q) === pname(p)).length > 1;
  return `${esc(pname(p))}${twins && p.brand ? ` von ${esc(p.brand)}` : ''}`;
}
const named = e => `<b>${nameOf(e)}</b>`;
const petsOf = ids => esc(petNames(ids)); // in a sentence that already has its bold
// all ratings when most agree with the row's side, otherwise only those of the pets that decide it
function saidOf(e, side) {
  const good = goodOf(e.counts),
    left = poorOf(e.counts),
    agree = side === 'top' ? good * 2 > e.n : left * 2 > e.n || (e.n - good - left) * 2 > e.n;
  return agree ? evidenceOf(e) : whyOf(e);
}
function lapse(at, now) {
  const days = Math.floor((now - at) / DAY);
  return days < 60
    ? `${Math.floor(days / 7)} Wochen`
    : days < 365
      ? `${Math.floor(days / 30)} Monaten`
      : days < 730
        ? 'über einem Jahr'
        : `${Math.floor(days / 365)} Jahren`;
}
const forPet = (t, several) => (several ? ` für ${esc(getPet(t.pet).name)}` : '');
const needs = (t, several) =>
  `noch ${t.need === 1 ? 'einmal' : 'zweimal'}${forPet(t, several)} servieren und bewerten, dann steht’s fest`;
// lists, with their empty sides, show once a side or a settled variety exists
const listed = r => r.top.length || r.flop.length || (r.settled && !r.stale);
// the variety an empty Leibgericht side names, so „Als Nächstes“ leaves it out
const candidate = r => (r.top.length || r.stale ? null : r.trials[0]);
const onTheWay = (t, several) => `Auf gutem Weg: ${named(t.e)}, noch ${t.need}×${forPet(t, several)} bewerten`;
const noneYet = r => `Bisher kommt keine Sorte${r.split.length ? ' bei allen' : ''} richtig gut an.`;
function waiting(m, r) {
  if (r.stale)
    return 'Die letzten Bewertungen sind über ein halbes Jahr alt. Nach ein paar neuen steht hier wieder, was ankommt.';
  if (r.settled && !r.mid.length)
    return `${esc(petNames(m.pets.filter(pid => r.split.some(e => e.pets[pid]?.n))))} sind sich bei allem, was feststeht, nicht einig.`;
  if (r.settled) return 'Was feststeht, kommt mal so, mal so an.';
  return 'Noch steht keine Sorte fest.';
}

const TILE = {top: 'Leibgericht', flop: 'Ladenhüter'};
// the best and the worst variety, each on its tone's ground; an empty side keeps its kicker on a plain ground
function sideTile(m, r, e, side) {
  const [ic, tone] = SIDE[side],
    inner = (title, sub) =>
      `<span class="tile-ic">${icon(ic)}</span><span class="t-main"><small class="kicker">${TILE[side]}</small><b>${title}</b><small>${sub}</small></span>`;
  if (e) {
    const p = e.product,
      brand = brandOf(p),
      said = saidOf(e, side),
      label = `${TILE[side]}: ${pname(p)}${brand ? ` von ${brand}` : ''}. ${said}.`;
    return `<button class="tile ${tone}" data-action="open-product" data-id="${e.id}" aria-label="${esc(label)}">${inner(esc(pname(p)), esc(cap([brand, lower(said)].filter(Boolean).join(', '))))}</button>`;
  }
  const t = side === 'top' && candidate(r);
  if (t)
    return `<button class="tile empty ${tone}" data-action="open-product" data-id="${t.e.id}">${inner('Noch keins', onTheWay(t, m.pets.length > 1))}</button>`;
  const [title, why] =
    side === 'top'
      ? ['Noch keins', noneYet(r)]
      : r.settled < 3
        ? ['Noch keiner', 'Dafür ist noch zu wenig bewertet.']
        : r.settled === r.top.length
          ? ['Keiner', 'Alles, was feststeht, kommt gut an.']
          : ['Keiner', 'Keine Sorte bleibt meist stehen.'];
  return `<div class="tile empty ${tone}">${inner(title, why)}</div>`;
}
export function evaluationCard(m) {
  const r = rankingModel();
  if (!r.rated) return '';
  let body;
  if (r.top.length || r.flop.length) body = sideTile(m, r, r.top[0], 'top') + sideTile(m, r, r.flop[0], 'flop');
  else {
    const t = r.stale ? null : r.trials[0],
      next = t
        ? `Am weitesten ist ${named(t.e)}: ${needs(t, m.pets.length > 1)}.`
        : r.settled || r.stale
          ? ''
          : 'Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt und was stehen bleibt.';
    body = `<p class="say card-line">${waiting(m, r)}</p>${next ? `<p class="hint card-line">${next}</p>` : ''}`;
  }
  return `<section class="card" data-sec="evaluation" style="view-transition-name:sec-evaluation">${cardHead('Vorlieben', 'open-evaluation', 'Alle Vorlieben')}${body}</section>`;
}

// the lists below name the varieties, so this only says how many of all settled ones go down well
function portraitHTML(m, r) {
  const ids = m.pets,
    several = ids.length > 1,
    pets = ids.map(getPet),
    who = esc(petNames(ids)),
    k = r.top.length,
    n = r.settled,
    good = (few = '') =>
      `Von ${n} Sorten ${k > 1 ? 'kommen' : 'kommt'} ${k ? few + (k === 1 ? 'eine' : k) : 'keine'} meist gut an.`,
    said = [];
  if (!k && !r.flop.length) said.push(waiting(m, r));
  else if (n < JUDGE) said.push(`Bisher ${n === 1 ? 'steht erst eine Sorte' : `stehen erst ${n} Sorten`} fest.`);
  else if (k * 3 >= n * 2) said.push(`${who} ${several ? 'fressen' : 'frisst'} fast alles gern: ${good()}`);
  else if (k * 3 <= n) said.push(`${who} ${several ? 'sind' : 'ist'} wählerisch: ${good('nur ')}`);
  else said.push(good());
  if (!k && !r.flop.length && !r.settled && !r.stale)
    said.push('Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt und was stehen bleibt.');
  const pic = several
    ? pets
        .slice(0, 2)
        .map(p => avatar(p, 'l pair'))
        .join('')
    : avatar(pets[0], 'xxl');
  return `<section class="card portrait"><span class="ov-pic">${pic}</span><div class="portrait-text"><h2>${esc(petNames(ids))}</h2><p class="say">${said.join(' ')}</p></div></section>`;
}

// x.moves.fresh: varieties that came onto their side within the last 30 days; place: 0 for the only one
function placeRow(m, x, e, place, side) {
  const p = e.product,
    brand = brandOf(p),
    said = saidOf(e, side),
    fresh = x.moves.fresh.has(e.id),
    now = Date.now(),
    at = side === 'top' ? x.last.get(e.id) : 0,
    away = at && now - at >= AWAY ? `zuletzt vor ${lapse(at, now)}` : '',
    label = `${place ? `Platz ${place}: ` : ''}${pname(p)}${brand ? ` von ${brand}` : ''}. ${said}.${away ? ` ${cap(away)}.` : ''}${fresh ? ' Neu dabei.' : ''}`;
  return `<li><button class="row" data-action="open-product" data-id="${e.id}" aria-label="${esc(label)}"><span class="ranked">${thumbOf(null, p)}${place ? `<span class="place ${SIDE[side][1]}">${place}</span>` : ''}</span>
    <span class="t-main"><span class="t-top"><b>${esc(pname(p))}</b>${fresh ? '<span class="badge">neu</span>' : ''}</span><small>${esc(cap([brand, lower(said), away].filter(Boolean).join(', ')))}</small></span>${strip(ratingsIn(m, [e.id]))}</button></li>`;
}
const card = (title, inner) => `<section class="card"><h2>${title}</h2>${inner}</section>`;
const listTitle = (side, title) => `${sideIcon(side)}${title}`;
const say = text => `<p class="say card-line">${text}</p>`;
const hint = text => `<p class="hint card-line">${text}</p>`;
// a place is only worth showing beside another
const places = (m, x, list, side) =>
  `<ol class="list ranks">${list.map((e, i) => placeRow(m, x, e, list.length > 1 ? i + 1 : 0, side)).join('')}</ol>`;
// never padded to five with varieties that do not belong there
function listsHTML(m, r, x) {
  if (!r.rated)
    return card(
      'Noch nichts bewertet',
      say('Bewerte ein paar Mahlzeiten, dann steht hier, was ankommt und was nicht.'),
    );
  if (!listed(r)) return ''; // the first card says why
  const top = r.top.slice(0, PLACES),
    flop = r.flop.slice(0, PLACES);
  const tops = top.length
    ? card(
        listTitle('top', top.length > 1 ? 'Leibgerichte' : 'Leibgericht'),
        (r.flat ? say('Die Sorten liegen noch so nah beieinander, dass die Reihenfolge Zufall sein kann.') : '') +
          places(m, x, top, 'top'),
      )
    : card(
        listTitle('top', 'Noch kein Leibgericht'),
        candidate(r) ? toldList([trialRow(m, candidate(r), true)]) : say(noneYet(r)),
      );
  const flops = flop.length
    ? card(listTitle('flop', 'Ladenhüter'), places(m, x, flop, 'flop'))
    : r.settled < 3
      ? card(listTitle('flop', 'Noch kein Ladenhüter'), say('Dafür ist noch zu wenig bewertet.'))
      : card(
          listTitle('flop', 'Kein Ladenhüter'),
          say(r.settled === r.top.length ? 'Alles, was feststeht, kommt gut an.' : 'Keine Sorte bleibt meist stehen.'),
        );
  return tops + flops;
}

function petLine(m, t, several) {
  const pet = getPet(t.pet),
    who = `<b>${esc(pet.name)}</b>`,
    worse = t.dir < 0,
    behind = t.behind?.length
      ? ` Das liegt wohl an <b>${andList(t.behind.map(id => nameOf(m.byId.get(id))))}</b>.`
      : '';
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
  const pic = several ? avatar(pet) : sign(t.kind === 'deutlich' ? (worse ? 'fall' : 'rise') : 'paw');
  return told(pic, text, weeks(t.recent, t.before));
}
const weeks = (recent, before) =>
  `In den letzten vier Wochen <b>${times(recent.good, recent.n)}</b> gut gefressen, in den acht davor ${times(before.good, before.n)}.`;
const MOVED = 2; // max varieties told as moved
function trendCard(m, x) {
  const lines = x.trend,
    rows = [];
  if (lines.length && lines.every(t => t.kind === 'gleich')) {
    const sum = k => ({n: lines.reduce((a, t) => a + t[k].n, 0), good: lines.reduce((a, t) => a + t[k].good, 0)});
    rows.push(
      told(
        sign('paw'),
        `Bei ${petsOf(lines.map(t => t.pet))} läuft’s wie gehabt.`,
        weeks(sum('recent'), sum('before')),
      ),
    );
  } else rows.push(...lines.map(t => petLine(m, t, m.pets.length > 1)));
  // skip varieties whose move the pet's own change already explains
  const pet = dir => lines.some(t => t.cause === 'tier' && t.dir === dir),
    moved = [
      ...(pet(-1) ? [] : x.moves.cooled.map(v => ['fall', v, 'kommt nicht mehr so gut an wie vor einem Monat'])),
      ...(pet(1) ? [] : x.moves.warmed.map(v => ['rise', v, 'kommt inzwischen gut an'])),
    ].slice(0, MOVED);
  for (const [ic, v, text] of moved)
    rows.push(
      toldBtn(
        v.id,
        sign(ic),
        `${named(m.byId.get(v.id))} ${text}.`,
        `Davor <b>${times(goodOf(v.before.counts), v.before.n)}</b> gut gefressen, seitdem ${lower(evidenceOf(v.since))}.`,
      ),
    );
  const few = lines.length ? m.pets.filter(pid => !lines.some(t => t.pet === pid)) : [];
  return rows.length
    ? card(
        'Wie läuft’s gerade?',
        toldList(rows) + (few.length ? hint(`Für ${petsOf(few)} reicht es noch nicht für einen Vergleich.`) : ''),
      )
    : '';
}

const often = n => (n === 1 ? 'einmal' : `${n}×`);
function observedCard(x) {
  const {kinds, links} = x.observed,
    now = Date.now();
  if (!kinds.length && !links.length) return '';
  const rows = [
    ...kinds.map(k => {
      const o = observationOf(k.kind);
      return told(
        obsThumb(k.kind),
        `${o.label}, <b>${often(k.n)}</b> in den letzten vier Wochen.`,
        `Zuletzt ${since(k.last, now)}${k.before ? `, in den acht Wochen davor ${often(k.before)}` : ''}.`,
      );
    }),
    ...links.map(l => {
      const o = observationOf(l.kind);
      return toldBtn(
        l.id,
        obsThumb(l.kind),
        `${o.label} kam öfter nach <b>${esc(pname(getProduct(l.id)))}</b>.`,
        `${cap(o.after)} nach <b>${l.after.hit} von ${l.after.n}</b> Mahlzeiten, nach den anderen Sorten nach ${l.other.hit} von ${l.other.n}.`,
      );
    }),
  ];
  return card('Beobachtungen', toldList(rows));
}

const SPLIT = 5;
function splitCard(m, r) {
  if (m.pet || !r.split.length) return '';
  const rows = r.split
    .slice(0, SPLIT)
    .map(e =>
      toldBtn(
        e.id,
        avatar(getPet(e.yes[0])),
        `${petsOf(e.yes)} ${e.yes.length > 1 ? 'mögen' : 'mag'} ${named(e)}, ${petsOf(e.no)} nicht.`,
        esc(cap([...e.yes, ...e.no].map(pid => `${getPet(pid).name} ${lower(evidenceOf(e.pets[pid]))}`).join(', '))) +
          '.',
      ),
    );
  const more = r.split.length - SPLIT;
  return card(
    'Geschmackssache',
    toldList(rows) + (more > 0 ? hint(`Dazu ${more === 1 ? 'eine' : more} weitere.`) : ''),
  );
}

const DIM_ICON = {konsistenz: 'layers', geschmack: 'fish', marke: 'tag'};
const inText = (d, key) => (d.kind === 'konsistenz' ? key.replace(/^(In|Fester) /, w => w.toLowerCase()) : key);
const SHELF = {
  sosse: 'in Soße',
  gelee: 'in Gelee',
  pastete: 'als Pastete',
  mousse: 'als Mousse',
  block: 'am Stück',
  suppe: 'als Suppe',
};
const lookFor = d => {
  const key = d.groups[0].key;
  if (d.kind !== 'konsistenz') return `${d.kind === 'geschmack' ? 'mit' : 'von'} ${key}`;
  return SHELF[TEXTURES.Nassfutter.items.find(([, label]) => label === key)?.[0]] || key;
};
const HABITS = 2; // max habits shown without a comparison
function patternCard(m, x) {
  const dims = profileModel(),
    habits = dims.length ? [] : habitsModel();
  if (!dims.length && !habits.length) return '';
  const rows = x.patterns.map(d => {
    const [a, z] = [d.groups[0], d.groups.at(-1)];
    return told(
      sign(DIM_ICON[d.kind]),
      d.clear
        ? `<b>${esc(a.key)}</b> kommt deutlich besser an als ${esc(inText(d, z.key))}.`
        : `Bisher kommt <b>${esc(inText(d, a.key))}</b> besser an als ${esc(inText(d, z.key))}.`,
      `${d.type === 'Nassfutter' ? '' : `${esc(d.type)}: `}${esc(a.key)} <b>${times(a.good, a.n)}</b> gut gefressen, ${esc(inText(d, z.key))} ${times(z.good, z.n)}.`,
    );
  });
  const tips = x.patterns.filter(d => d.clear && d.groups[0].share * 100 >= GOOD).map(d => esc(lookFor(d))),
    first = [...dims].sort((a, b) => b.clear - a.clear || b.gap - a.gap)[0];
  const body = rows.length
    ? toldList(rows)
    : first
      ? likesList(m, {...first, groups: [first.groups[0], first.groups.at(-1)]})
      : toldList(habits.slice(0, HABITS).map(h => habitRow(h, db.pets.length > 1 && !m.pet)));
  return `<section class="card">${cardHead('Worauf es ankommt', 'open-level', 'Mehr dazu', 'Mehr', 'profile')}${tips.length ? say(`Neues am ehesten <b>${andList(tips)}</b> probieren.`) : ''}${body}</section>`;
}

const TRIALS = 3;
// a variety still in its trial, with the ratings it has and the ones it lacks; best: the one closest to Leibgericht
function trialRow(m, t, best = false) {
  const several = m.pets.length > 1;
  return toldBtn(
    t.e.id,
    sign('sparkle'),
    `${best ? onTheWay(t, several) : `${named(t.e)} ${needs(t, several)}`}.`,
    esc(`Bisher ${lower(evidenceOf(t.e))}.`),
    strip(ratingsIn(m, [t.e.id]), several ? 0 : t.need),
  );
}
function nextCard(m, r, x) {
  const now = Date.now(),
    several = m.pets.length > 1,
    rows = [];
  for (const v of x.next.missed) {
    const rated = m.pets.filter(pid => m.byId.get(v.id).pets[pid]?.list.length).length,
      by = several && v.by.length < rated ? `bei ${petNames(v.by)} ` : '';
    rows.push(
      toldBtn(
        v.id,
        sign('clock'),
        `${named(m.byId.get(v.id))} gab es seit ${lapse(v.at, now)} nicht mehr.`,
        esc(`Davor ${by}${lower(evidenceOf(v))}.`),
      ),
    );
  }
  const trials = r.trials.slice(listed(r) && candidate(r) ? 1 : 0);
  for (const t of trials.slice(0, TRIALS)) rows.push(trialRow(m, t));
  for (const v of x.next.retry)
    rows.push(
      toldBtn(
        v.id,
        sign('repeat'),
        `${named(m.byId.get(v.id))} blieb beim ersten Mal stehen.`,
        `${esc(getPet(v.pet).name)} braucht bei Neuem oft Anlauf, ein zweiter Versuch kann sich lohnen.`,
      ),
    );
  const more = trials.length - TRIALS;
  return rows.length
    ? card(
        'Als Nächstes',
        toldList(rows) +
          (more > 0
            ? hint(
                more === 1
                  ? 'Dazu eine weitere, die noch im Test ist.'
                  : `Dazu ${more} weitere, die noch im Test sind.`,
              )
            : ''),
      )
    : '';
}

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
      `Die Listen beruhen auf <b>${b.n} Bewertungen</b> seit dem ${date}, je Sorte${m.pets.length > 1 ? ' und Tier' : ''} auf den neuesten acht aus dem letzten halben Jahr.`,
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
  return `${head('Vorlieben' + forWhom(m.pet))}${r.rated ? portraitHTML(m, r) : ''}${listsHTML(m, r, x)}${trendCard(m, x)}${observedCard(x)}${splitCard(m, r)}${patternCard(m, x)}${nextCard(m, r, x)}${footHTML(m, x.basis)}`;
}
