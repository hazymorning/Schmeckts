// Evaluation card and page. The analysis is in smart.js, this only words it
import {andList, cap, esc} from '../text.js';
import {DAY, when} from '../dates.js';
import {icon} from '../icons.js';
import {observationOf} from '../config.js';
import {db} from '../store.js';
import {calledNames, evaluationModel, getPet, getProduct, model, petNames, pname, rankingModel} from '../derive.js';
import {goodOf, poorOf, ratingsIn, shopGroups} from '../smart.js';
import {
  avatar,
  cardHead,
  evidenceOf,
  forWhom,
  head,
  lower,
  obsThumb,
  SIDE,
  shopRow,
  sign,
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
// a pet on its own goes by any of its names; beside others by its own, so they stay apart
const petName = (m, id, place) => (m.pets.length > 1 ? getPet(id).name : calledNames([id], place));
// all ratings when most agree with the row's side, otherwise only those of the pets that decide it
function saidOf(e, side) {
  const good = goodOf(e.counts),
    left = poorOf(e.counts),
    agree = side === 'top' ? good * 2 > e.n : left * 2 > e.n || (e.n - good - left) * 2 > e.n;
  return whyOf(e, agree);
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
// what: how the variety is named in the sentence
const needs = (t, several, what) =>
  `${several ? esc(getPet(t.pet).name) + ' ' : ''}noch ${t.need === 1 ? 'einmal' : 'zweimal'} ${what} füttern und bewerten, dann steht’s fest`;
// lists, with their empty sides, show once a side or a settled variety exists
const listed = r => r.top.length || r.flop.length || (r.settled && !r.stale);
// the variety an empty Tops side names, so „Als Nächstes“ leaves it out
const candidate = r => (r.top.length || r.stale ? null : r.trials[0]);
const toRate = (t, several) => `noch ${t.need}×${forPet(t, several)} bewerten`;
const onTheWay = (t, several) => `Auf gutem Weg: ${named(t.e)}, ${toRate(t, several)}`;
const noneYet = r => `Bisher kommt keine Sorte${r.split.length ? ' bei allen' : ''} richtig gut an.`;
function waiting(m, r) {
  if (r.stale)
    return 'Die letzten Bewertungen sind über ein halbes Jahr alt. Nach ein paar neuen steht hier wieder, was ankommt.';
  if (r.settled && !r.mid.length)
    return `${esc(petNames(m.pets.filter(pid => r.split.some(e => e.pets[pid]?.n))))} sind sich bisher bei keiner Sorte einig.`;
  if (r.settled) return 'Bisher ist keine Sorte ein klarer Treffer oder Reinfall.';
  return 'Noch steht keine Sorte fest.';
}

const PICKS = 2; // varieties a side shows on the card
const SIDES = {top: 'Tops', flop: 'Flops'};
/* A variety on the card, as in the history: its packaging, the best of a side marked, how it went down, its ratings.
   t: a candidate for the Tops, which says what it lacks instead. */
function sideRow(m, e, side, first, t = null) {
  const p = e.product,
    brand = brandOf(p),
    several = m.pets.length > 1,
    said = t ? toRate(t, several) : saidOf(e, side),
    [ic, tone] = SIDE[side],
    medal = first ? `<span class="medal ${tone}">${icon(ic)}</span>` : '',
    label = `${pname(p)}${brand ? ` von ${brand}` : ''}. ${cap(said)}.`;
  return `<li><button class="row" data-action="open-product" data-id="${e.id}" aria-label="${esc(label)}"><span class="ranked">${thumbOf(null, p)}${medal}</span>
    <span class="t-main"><b>${esc(pname(p))}</b><small>${esc(cap([brand, lower(said)].filter(Boolean).join(', ')))}</small></span>${strip(ratingsIn(m, [e.id]), t && !several ? t.need : 0)}</button></li>`;
}
// what goes down well and what is left, a side only where it has a variety; without a Top the closest one
function sideList(m, r, side) {
  const t = side === 'top' && candidate(r),
    rows = t ? [sideRow(m, t.e, side, false, t)] : r[side].slice(0, PICKS).map((e, i) => sideRow(m, e, side, !i));
  return rows.length
    ? `<h3 class="side ${SIDE[side][1]}">${SIDES[side]}</h3><ul class="picks">${rows.join('')}</ul>`
    : '';
}
const SHOP_SHOWN = 3;
const shopRows = (m, list) =>
  `<ul class="list shop">${list
    .slice(0, SHOP_SHOWN)
    .map(e => shopRow(m, e))
    .join('')}</ul>`;
// without a ranking, as for a pet on dry food only, the card shows what to buy again
export function evaluationCard(m) {
  const r = rankingModel(),
    buy = r.rated ? [] : shopGroups(m).nachkaufen;
  if (!r.rated && !buy.length) return '';
  let body;
  if (!r.rated) body = `<h3 class="label grp">Nachkaufen</h3>${shopRows(m, buy)}`;
  else if (r.top.length || r.flop.length) body = sideList(m, r, 'top') + sideList(m, r, 'flop');
  else {
    const t = r.stale ? null : r.trials[0],
      next = t
        ? `Am weitesten ist ${named(t.e)}: ${needs(t, m.pets.length > 1, 'damit')}.`
        : r.settled || r.stale
          ? ''
          : 'Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt und was stehen bleibt.';
    body = `<p class="say card-line">${waiting(m, r)}</p>${next ? `<p class="hint card-line">${next}</p>` : ''}`;
  }
  return `<section class="card" data-sec="evaluation" style="view-transition-name:sec-evaluation">${cardHead('Vorlieben', 'open-evaluation', 'Alle Vorlieben')}${body}</section>`;
}

// the lists below name the varieties, so this only says how many of all settled ones go down well; several pets
// can be told apart only by „Geschmackssache“, so only one pet is called picky or easy to please
function portraitHTML(m, r) {
  const ids = m.pets,
    several = ids.length > 1,
    pets = ids.map(getPet),
    who = esc(several ? '' : petName(m, ids[0], 'portrait')),
    k = r.top.length,
    n = r.settled,
    good = (few = '') =>
      `Von ${n} Sorten ${k > 1 ? 'kommen' : 'kommt'} ${k ? few + (k === 1 ? 'eine' : k) : 'keine'}${several ? ' bei allen' : ''} meist gut an.`,
    said = [];
  if (!k && !r.flop.length) said.push(waiting(m, r));
  else if (n < JUDGE) said.push(`Bisher ${n === 1 ? 'steht erst eine Sorte' : `stehen erst ${n} Sorten`} fest.`);
  else if (several) said.push(good());
  else if (k * 3 >= n * 2) said.push(`${who} frisst fast alles gern: ${good()}`);
  else if (k * 3 <= n) said.push(`${who} ist wählerisch: ${good('nur ')}`);
  else said.push(good());
  if (!k && !r.flop.length && !r.settled && !r.stale)
    said.push('Ab drei Bewertungen einer Sorte steht hier, was am besten ankommt und was stehen bleibt.');
  const pic = several
    ? pets
        .slice(0, 2)
        .map(p => avatar(p, 'l pair'))
        .join('')
    : avatar(pets[0], 'xxl');
  return `<section class="card portrait"><div class="ov-top"><span class="ov-pic">${pic}</span><div class="ov-text"><h2>${esc(petNames(ids))}</h2><p>${said.join(' ')}</p></div></div></section>`;
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
  const tops = card(
      SIDES.top,
      top.length
        ? (r.flat ? say('Die Sorten liegen noch so nah beieinander, dass die Reihenfolge Zufall sein kann.') : '') +
            places(m, x, top, 'top')
        : candidate(r)
          ? toldList([trialRow(m, candidate(r), true)])
          : say(noneYet(r)),
    ),
    flops = card(
      SIDES.flop,
      flop.length
        ? places(m, x, flop, 'flop')
        : say(
            r.settled < 3
              ? 'Dafür ist noch zu wenig bewertet.'
              : r.settled === r.top.length
                ? 'Alles, was feststeht, kommt gut an.'
                : 'Keine Sorte bleibt regelmäßig stehen.',
          ),
    );
  return tops + flops;
}

function petLine(m, t, several) {
  const pet = getPet(t.pet),
    who = `<b>${esc(petName(m, t.pet, 'trend'))}</b>`,
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
        `Bei ${lines.length > 1 ? petsOf(lines.map(t => t.pet)) : esc(petName(m, lines[0].pet, 'trend'))} läuft’s wie gehabt.`,
        weeks(sum('recent'), sum('before')),
      ),
    );
  } else rows.push(...lines.map(t => petLine(m, t, m.pets.length > 1)));
  // skip varieties whose move the pet's own change already explains
  const pet = dir => lines.some(t => t.cause === 'tier' && t.dir === dir),
    moved = [
      ...(pet(-1) ? [] : x.moves.cooled.map(v => [v, 'kommt nicht mehr so gut an wie vor einem Monat'])),
      ...(pet(1) ? [] : x.moves.warmed.map(v => [v, 'kommt inzwischen gut an'])),
    ].slice(0, MOVED);
  for (const [v, text] of moved)
    rows.push(
      toldBtn(
        v.id,
        `${named(m.byId.get(v.id))} ${text}.`,
        `Davor <b>${times(goodOf(v.before.counts), v.before.n)}</b> gut gefressen, seitdem ${lower(evidenceOf(v.since))}.`,
      ),
    );
  const few = lines.length ? m.pets.filter(pid => !lines.some(t => t.pet === pid)) : [];
  return rows.length
    ? card(
        'Wie läuft’s gerade?',
        toldList(rows) + (few.length ? hint(`Bei ${petsOf(few)} reicht es noch nicht für einen Vergleich.`) : ''),
      )
    : '';
}

const OFTEN = 'ein zwei drei vier fünf sechs sieben acht neun zehn elf zwölf'.split(' ');
const often = n => (OFTEN[n - 1] ? OFTEN[n - 1] + 'mal' : `${n} Mal`);
function observedCard(x) {
  const {kinds, links} = x.observed;
  if (!kinds.length && !links.length) return '';
  const rows = [
    ...kinds.map(k => {
      const o = observationOf(k.kind);
      return told(
        obsThumb(k.kind),
        `${o.label}, <b>${often(k.n)}</b> in den letzten vier Wochen.`,
        `Zuletzt ${when(k.last)}${k.before ? `, in den acht Wochen davor ${often(k.before)}` : ''}.`,
      );
    }),
    ...links.map(l => {
      const o = observationOf(l.kind);
      return toldBtn(
        l.id,
        `Nach <b>${esc(pname(getProduct(l.id)))}</b> öfter notiert: ${o.label}.`,
        `Nach <b>${l.after.hit} von ${l.after.n}</b> Mahlzeiten ${o.after}, bei anderen Sorten nach ${l.other.hit} von ${l.other.n}.`,
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

/* Erkenntnisse, each a sentence on what helps when buying and feeding and below it the counts it rests on; the
   strongest on the card, all of them on its page */
const INSIGHTS = 3;
const TEXTURE_SAID = {
  pastete: 'Pastete',
  sosse: 'Stückchen in Soße',
  gelee: 'Stückchen in Gelee',
  mousse: 'Mousse',
  block: 'fester Block',
  suppe: 'Suppe',
};
const ofN = x => `${x.good} von ${x.n}`;
function compared(ic, {kind, a, b}) {
  const [A, B] = [a.key, b.key].map(key => esc(kind === 'konsistenz' ? TEXTURE_SAID[key] : key));
  return [
    ic,
    `Bisher kommt <b>${A}</b> besser an als ${B}.`,
    `${cap(A)} <b>${ofN(a)} Mal</b> gut gefressen, ${B} ${ofN(b)} Mal.`,
  ];
}
// [icon, the sentence, the counts], as HTML
const INSIGHT = {
  marke: x => compared('tag', x),
  geschmack: x => compared('fish', x),
  konsistenz: x => compared('layers', x),
  sosse: ({k, n, instead}) => [
    'drop',
    'Bei Stückchen in Soße wird oft nur die Soße geleckt.',
    `<b>${k} von ${n} Mal</b> nur die Soße.${instead ? ` ${cap(TEXTURE_SAID[instead.key])} dagegen ${ofN(instead)} Mal gut gefressen.` : ''}`,
  ],
  wiederholung: ({a, b}) => [
    'repeat',
    'Zweimal hintereinander dieselbe Sorte kommt schlechter an.',
    `Beim zweiten Mal <b>${ofN(a)} Mal</b> gut gefressen, sonst ${ofN(b)} Mal.`,
  ],
  neu: ({a, b, gap}) => [
    'sparkle',
    gap > 0
      ? 'Neue Sorten kommen beim ersten Mal besser an als danach.'
      : 'Neue Sorten brauchen eine Weile, danach läuft es besser.',
    `Beim ersten Mal <b>${ofN(a)}</b>, danach ${ofN(b)} Mal gut gefressen.`,
  ],
  tageszeit: ({a, b, gap}) => [
    gap > 0 ? 'sun' : 'moon',
    gap > 0 ? 'Morgens wird besser gefressen als abends.' : 'Abends wird besser gefressen als morgens.',
    `Morgens <b>${ofN(a)} Mal</b> gut gefressen, abends ${ofN(b)} Mal.`,
  ],
  snack: ({a, b}) => [
    'r_verputzt',
    'Nach einem Snack bleibt beim nächsten Napf öfter etwas stehen.',
    `Nach Snacks <b>${ofN(a)} Mal</b> gut gefressen, sonst ${ofN(b)} Mal.`,
  ],
  feeder: ({a, b}) => {
    const [A, B] = [esc(a.key), esc(andList(b.key))];
    return [
      'person',
      `Bei <b>${A}</b> kommen dieselben Sorten besser an als bei ${B}.`,
      `Bei ${A} <b>${ofN(a)} Mal</b> gut gefressen, bei ${B} ${ofN(b)} Mal.`,
    ];
  },
};
export const insightSaid = x => INSIGHT[x.kind](x);
const insightRows = list =>
  toldList(
    list.map(x => {
      const [ic, ...said] = insightSaid(x);
      return told(sign(ic), ...said);
    }),
  );
function insightsCard(x) {
  const list = x.insights;
  if (!list.length) return '';
  const title = 'Erkenntnisse';
  return `<section class="card">${list.length > INSIGHTS ? cardHead(title, 'open-level', 'Alle Erkenntnisse', 'Mehr', 'insights') : `<h2>${title}</h2>`}${insightRows(list.slice(0, INSIGHTS))}</section>`;
}
const BUYING = new Set(['marke', 'geschmack', 'konsistenz', 'sosse']);
export function viewInsights() {
  const list = evaluationModel().insights,
    part = (title, buying) => {
      const rows = list.filter(x => BUYING.has(x.kind) === buying);
      return rows.length ? card(title, insightRows(rows)) : '';
    };
  return `${head('Erkenntnisse')}${part('Beim Kaufen', true)}${part('Beim Füttern', false)}`;
}

const TRIALS = 3;
// a variety still in its trial, with the ratings it has and the ones it lacks; best: the one closest to the Tops
function trialRow(m, t, best = false) {
  const several = m.pets.length > 1;
  return toldBtn(
    t.e.id,
    `${best ? onTheWay(t, several) : cap(needs(t, several, `mit ${named(t.e)}`))}.`,
    esc(`Bisher ${lower(whyOf(t.e, true))}.`),
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
        `${named(m.byId.get(v.id))} blieb beim ersten Mal stehen.`,
        `${esc(petName(m, v.pet, 'next'))} braucht bei Neuem oft Anlauf, ein zweiter Versuch kann sich lohnen.`,
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
      `Tops und Flops beruhen auf <b>${b.n} Bewertungen</b> seit dem ${date}, pro Sorte${m.pets.length > 1 ? ' und Katze' : ''} auf den neuesten acht aus dem letzten halben Jahr.`,
    );
  }
  if (b.left.length)
    parts.push(
      `${andList(b.left.map(t => LEFT[t]))} ${b.left.length > 1 || b.left[0] === 'Snack' ? 'zählen' : 'zählt'} dabei nicht mit.`,
    );
  return parts.length ? `<p class="hint foot">${parts.join(' ')}</p>` : '';
}

const shopBtn = `<button class="icon-btn" data-action="open-level" data-v="shop" aria-label="Einkaufen">${icon('cart')}</button>`;

export function viewEvaluation() {
  const m = model(),
    r = rankingModel(),
    x = evaluationModel();
  return `${head('Vorlieben' + forWhom(m.pet), 'settings-back', shopBtn)}${r.rated ? portraitHTML(m, r) : ''}${listsHTML(m, r, x)}${trendCard(m, x)}${observedCard(x)}${splitCard(m, r)}${insightsCard(x)}${nextCard(m, r, x)}${footHTML(m, x.basis)}`;
}
