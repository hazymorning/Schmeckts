/* Home page: pet bar and cards in a fixed order, the welcome page when there are no pets. Everything evaluated comes
   from model() in derive.js. */
import {$, reduceMotion} from '../dom.js';
import {settled} from '../motion.js';
import {andList, esc} from '../text.js';
import {addDays, ago, dayKey, weekStart} from '../dates.js';
import {icon, sketch} from '../icons.js';
import {RATINGS, TEXTURES, TYPES, typeOf} from '../config.js';
import {db, loadError, prefs, storageOK} from '../store.js';
import {isConnected} from '../sync.js';
import {
  getPet,
  getProduct,
  lastWeek,
  model,
  openPets,
  pendingServings,
  petNames,
  pname,
  servingPets,
} from '../derive.js';
import {hintKey, rOf, scoreCls, shopGroups} from '../smart.js';
import {hasPhoto} from '../photos.js';
import {dlg} from '../ui/sheet.js';
import {viewerOpen} from '../ui/viewer.js';
import {
  avatar,
  calendarHTML,
  dayBlocks,
  dayGroups,
  nameBlock,
  photoThumb,
  rateRow,
  reasonOf,
  syncChip,
  thumbOf,
} from './parts.js';
import {renderMood} from './mood.js';

/* Redraw the home page, with a smooth view transition where possible */
export function update() {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    renderHome();
  };
  if (!document.startViewTransition || reduceMotion.matches || dlg.open || viewerOpen()) return run();
  try {
    const t = document.startViewTransition(run);
    setTimeout(() => {
      if (!done) {
        try {
          t.skipTransition();
        } catch {
          /* the transition has already finished: run() right below draws in any case */
        }
        run();
      }
    }, 400); // safety net
  } catch {
    // startViewTransition failed: draw directly, the same page without the animation
    run();
  }
}
export function scrollTop() {
  window.scrollTo({top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth'});
}

// fresh: id of the meal just served, which slides in on the next draw
// open: unfolded cards, lasts until the app restarts
export const homeView = {fresh: null, open: {}};

/* Pet bar: the filter, from two pets on. With one pet there is nothing to filter, and pets are managed in the
   settings. */
function renderPets() {
  const el = $('#pets');
  if (db.pets.length < 2) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML =
    `<button class="pet" data-action="filter" data-id="all" aria-pressed="${prefs.activePet === 'all'}" style="view-transition-name:av-all"><span class="av xl all">${icon('paw')}</span><span>Alle</span></button>` +
    db.pets
      .map(
        p =>
          `<button class="pet" data-action="filter" data-id="${p.id}" aria-pressed="${prefs.activePet === p.id}" style="view-transition-name:av-${p.id}">${avatar(p, 'xl')}<span>${esc(p.name)}</span></button>`,
      )
      .join('') +
    `<button class="pet" data-action="add-pet" aria-label="Tier hinzufügen"><span class="av xl add">${icon('plus')}</span><span>Neu</span></button>`;
}

function renderFab() {
  const fab = $('#fab');
  fab.hidden = !db.pets.length;
  if (!fab.innerHTML) fab.innerHTML = icon('bowl') + 'Füttern';
}
/* On serving: the bowl in the button fills up briefly */
let fills = 0; // a second serving restarts the bowl: the first run's end must not clear it
export function fabFill() {
  const fab = $('#fab'),
    run = ++fills;
  fab.classList.remove('filled');
  void fab.offsetWidth;
  fab.classList.add('filled');
  settled(fab, true).then(() => run === fills && fab.classList.remove('filled'));
}

/* Notice at the top: only when changes are waiting or the sync is stuck */
export function renderSyncChip() {
  const el = $('#syncChip'),
    c = syncChip();
  el.hidden = !c;
  if (!c) return;
  el.classList.toggle('bad', c.bad);
  el.innerHTML = `<span class="badge">${icon(c.ic)}<span>${esc(c.label)}</span></span>`;
  el.setAttribute('aria-label', `${c.label}, Haushalt in den Einstellungen öffnen`);
}

export function renderHome() {
  renderPets();
  renderFab();
  renderSyncChip();
  renderMood();
  $('#home').innerHTML = homeHTML();
  homeView.fresh = null;
}
function homeHTML() {
  const banner = loadError
    ? `<p class="banner">Die gespeicherten Daten konnten nicht gelesen werden. Bitte starte die App neu. Bis dahin wird nichts gespeichert.</p>`
    : storageOK
      ? ''
      : `<p class="banner">In dieser Vorschau wird nichts dauerhaft gespeichert. Öffne die Datei lokal im Browser, dann bleiben deine Daten erhalten.</p>`;
  if (!db.pets.length) return banner + welcomeHTML();
  const pend = pendingServings(),
    m = db.servings.length ? model() : null;
  let html = banner + (m ? overviewHTML(m) : '');
  if (pend.length) html += pendingHTML(pend);
  if (!m) html += stepsHTML();
  else {
    const ins = insightCard(m);
    html +=
      hintHTML(m) +
      `<section class="card" data-sec="hist" style="view-transition-name:sec-hist"><h2>Verlauf</h2>${historyHTML()}</section>` +
      weekHTML(lastWeek()) +
      card('shop', 'Einkaufen', shopCard(m)) +
      (ins ? card('ins', 'Erkenntnisse', ins) : '');
  }
  return html;
}

/* Overview: the pet in the filter, the household under „Alle“, with picture, name and the essentials from the
   model. A tap on the picture opens the pet. Folded up it is two lines ending in „…“; a tap on the card shows
   the whole text and back again (the state lasts until restart, as with the other cards). */
function overviewHTML(m) {
  const pets = m.overview.pets.map(x => getPet(x.id)),
    one = pets.length === 1 ? pets[0] : null;
  const pic = one
    ? `<button class="ov-pic" data-action="open-pet" data-id="${one.id}" aria-label="${esc(one.name)} bearbeiten">${avatar(one, 'xxl')}</button>`
    : `<span class="ov-pic">${pets
        .slice(0, 2)
        .map(p => avatar(p, 'l pair'))
        .join('')}</span>`;
  const tap = m.overview.last ? ` data-action="toggle-overview" aria-expanded="${!!homeView.open.overview}"` : ''; // „Noch nichts serviert.“ is short
  return `<section class="card overview${homeView.open.overview ? ' open' : ''}" data-sec="overview"${tap} style="view-transition-name:sec-overview">${pic}<div class="ov-text"><h2>${esc(petNames(pets.map(p => p.id)))}</h2><p>${overviewText(m.overview)}</p></div></section>`;
}
/* The overview's sentences, the essentials in bold. One pet: „Bekam zuletzt vor 2 Std. einen Snack: Käse (Sofort
   verputzt). Am liebsten Lachs, Rind kommt nicht an.“ Several: who last had what, then the favourite variety per pet
   and what does not go down well. */
function overviewText({last, pets}) {
  if (!last) return 'Noch nichts serviert.';
  const many = pets.length > 1,
    sort = e => `<b>${esc(pname(e.product))}</b>`,
    pet = x => esc(getPet(x.id).name);
  const p = getProduct(last.productId),
    ids = servingPets(last),
    since = ago(last.servedAt),
    r = ids.length === 1 && rOf(last.pets[ids[0]]);
  const who = many ? `${esc(petNames(ids))} ${ids.length > 1 ? 'bekamen' : 'bekam'}` : 'Bekam';
  const what = p
    ? (typeOf(p) === 'Snack' ? 'einen Snack: ' : '') + sort({product: p})
    : 'Futter, das noch keinen Namen hat';
  const by = isConnected() && last.by ? `, serviert von <b>${esc(last.by)}</b>` : ''; // in a household it matters who fed
  const fed = `${who}${since === 'gerade eben' ? '' : ' zuletzt'} <b>${/^\d/.test(since) ? 'am ' : ''}${esc(since)}</b> ${what}${by}${ids.length > 1 ? '' : ` (${r ? RATINGS[r].label : 'noch offen'})`}.`;
  const favs = pets.filter(x => x.favorite),
    flops = pets.filter(x => x.flop);
  const taste =
    !favs.length && !flops.length
      ? ['Für einen Liebling fehlen noch Bewertungen.']
      : !many
        ? [
            favs.length && flops.length
              ? `Am liebsten ${sort(favs[0].favorite)}, ${sort(flops[0].flop)} kommt nicht an.`
              : favs.length
                ? `Am liebsten ${sort(favs[0].favorite)}.`
                : `${sort(flops[0].flop)} kommt nicht an.`,
          ]
        : [
            favs.length &&
              favs.map((x, i) => `${pet(x)}${i ? '' : ' mag am liebsten'} ${sort(x.favorite)}`).join(', ') + '.',
            flops.length && 'Nicht an kommt ' + flops.map(x => `bei ${pet(x)} ${sort(x.flop)}`).join(', ') + '.',
          ];
  return [fed, ...taste].filter(Boolean).join(' ');
}
/* Fold open or shut without a redraw: only the class changes, the text slides as on the other cards */
export function toggleOverview() {
  const sec = $('#home .overview'),
    p = sec && $('p', sec);
  if (!p) return;
  const open = (homeView.open.overview = !homeView.open.overview),
    h0 = p.offsetHeight;
  sec.classList.toggle('open', open);
  sec.setAttribute('aria-expanded', String(open));
  slideHeight(p, h0);
}

const welcomeHTML = () => `<div class="welcome">
  <div class="hero"><img class="logo light" src="img/schmeckts-mark.svg" alt=""><img class="logo dark" src="img/schmeckts-mark-dark.svg" alt=""></div>
  <h2>Was schmeckt deinem Tier?</h2>
  <p>Fotografier beim Füttern die Packung und sag später mit einem Tipp, wie der Napf aussah. So siehst du bald, was wirklich ankommt.</p>
  <div class="btn-col">${
    prefs.mode // exactly two buttons on the first start: the mode
      ? `<button class="btn primary" data-action="add-pet">${icon('plus')}Erstes Tier anlegen</button>
       ${isConnected() ? '' : `<button class="btn soft" data-action="demo">${icon('sparkle')}Mit Beispieldaten ansehen</button>`}`
      : `<button class="btn primary" data-action="mode-local">${icon('phone')}Nur auf diesem Handy</button>
       <button class="btn soft" data-action="connect-form">${icon('house')}Mit Haushalt verbinden</button>`
  }
  </div></div>`;

const stepsHTML = () => `<section class="card" style="view-transition-name:sec-steps"><h2>So geht’s</h2>
  <div class="steps-hero">${sketch('camera', 'xxl')}</div><ol class="list steps">
  <li class="row"><span class="n">1</span><p class="hint"><b>Beim Füttern</b> auf „Füttern“ tippen und die Packung fotografieren. ${isConnected() ? 'Marke und Sorte werden erkannt.' : 'Dann Marke und Sorte eintragen.'}</p></li>
  <li class="row"><span class="n">2</span><p class="hint"><b>Wenn der Napf leer ist</b>, oder eben nicht, hier mit einem Tipp bewerten.</p></li>
  <li class="row"><span class="n">3</span><p class="hint"><b>Nach ein paar Tagen</b> siehst du unter „Einkaufen“, was ankommt, und erste Erkenntnisse.</p></li></ol></section>`;

/* „Wie war’s?“: only while ratings are still open */
function pendingHTML(list) {
  const multiHouse = db.pets.length > 1;
  return (
    `<section class="card" style="view-transition-name:sec-pend"><h2>Wie war’s?</h2><ul class="list">` +
    list
      .map(s => {
        const p = getProduct(s.productId),
          ids = openPets(s),
          multi = ids.length > 1;
        const main = `<span class="t-main">${nameBlock(s, p)}</span>${multiHouse && !multi ? avatar(getPet(ids[0]), 's') : ''}`;
        // With a large photo on this phone its thumbnail is a button of its own, which opens it
        const head = hasPhoto(s, p)
          ? `<div class="pend-top">${photoThumb(s, p)}<button class="pend-head" data-action="open-serving" data-id="${s.id}">${main}</button></div>`
          : `<button class="pend-head" data-action="open-serving" data-id="${s.id}">${thumbOf(s, p)}${main}</button>`;
        const rows = ids
          .map(
            pid =>
              `<div class="pet-rate">${multi ? `<div class="pet-label">${avatar(getPet(pid), 'xs')}${esc(getPet(pid).name)}</div>` : ''}${rateRow(s, pid)}</div>`,
          )
          .join('');
        return `<li class="pend" data-id="${s.id}" style="view-transition-name:sv-${s.id};view-transition-class:${homeView.fresh === s.id ? 'fresh' : 'item'}">${head}${rows}</li>`;
      })
      .join('') +
    `</ul></section>`
  );
}

/* A card with „Alle anzeigen“: the essentials folded up, everything unfolded */
function card(key, title, {body, more, foot = ''}) {
  const open = !!homeView.open[key];
  return `<section class="card" data-sec="${key}" style="view-transition-name:sec-${key}"><h2>${title}</h2>
    <div class="card-body" id="sec-${key}">${body}</div>${
      more
        ? `<button class="card-btn" data-action="expand" data-v="${key}"
      aria-expanded="${open}" aria-controls="sec-${key}">${open ? 'Weniger anzeigen' : 'Alle anzeigen'}</button>`
        : ''
    }${foot}</section>`;
}
/* Folding open or shut: swap the content, and the card eases open or shut (--dur-step, --ease-out), instantly
   under reduced motion. Without redrawing the page, so the button stays put (focus when using the keyboard).
   Nothing is stored. */
export function expandCard(key) {
  if (!CARDS[key]) return;
  homeView.open[key] = !homeView.open[key];
  const sec = $(`[data-sec="${key}"]`),
    content = CARDS[key](model());
  if (!sec || !content) return update();
  const body = $('.card-body', sec),
    btn = $('[data-action=expand]', sec),
    h0 = body.offsetHeight;
  body.innerHTML = content.body;
  btn.textContent = homeView.open[key] ? 'Weniger anzeigen' : 'Alle anzeigen';
  btn.setAttribute('aria-expanded', String(homeView.open[key]));
  slideHeight(body, h0);
}
/* el eases from h0 to its new height (--dur-step, --ease-out), carrying "animating" while it does; instantly under
   reduced motion */
function slideHeight(el, h0) {
  const h1 = el.offsetHeight;
  if (reduceMotion.matches || h1 === h0) return;
  el.style.height = h0 + 'px';
  el.classList.add('animating'); // carries the height transition (app.css, Motion)
  void el.offsetHeight;
  el.style.height = h1 + 'px';
  settled(el).then(() => {
    el.style.height = '';
    el.classList.remove('animating');
  });
}

/* Hint: the one with the highest precedence (a sentence, a reason, the buttons) */
const HINT_TITLES = {
  appetit: 'Appetit',
  stop: 'Nicht mehr kaufen?',
  sosse: 'Frisst meist nur die Soße',
  liebling: 'Neuer Liebling',
};
const sortName = p => (p.variety && p.brand ? `${p.variety} von ${p.brand}` : pname(p));
function hintHTML(m) {
  const h = m.hints[0];
  if (!h) return '';
  const e = m.byId.get(h.id),
    name = e && esc(sortName(e.product)),
    pet = h.pet && getPet(h.pet);
  const hide = `<button class="btn soft" data-action="hide-hint" data-v="${esc(hintKey(h))}">Ausblenden</button>`;
  const set = (v, label) =>
    `<button class="btn primary" data-action="hint-buy" data-id="${e.id}" data-v="${v}">${label}</button>`;
  let say, why, btns;
  if (h.kind === 'appetit') {
    [say, why, btns] = [
      `${esc(pet.name)} frisst seit ein paar Tagen schlechter als sonst.`,
      `Die letzten ${h.n} Bewertungen im Schnitt ${h.recent} %, sonst ${h.usual} %.`,
      hide,
    ];
  } else if (h.kind === 'sosse') {
    const x = e.pets[h.pet];
    [say, why, btns] = [
      `${esc(pet.name)} frisst bei ${name} meist nur die Soße.`,
      `${x.counts.sosse} von ${x.n} Bewertungen „${RATINGS.sosse.label}“`,
      hide,
    ];
  } else {
    why = (pet ? pet.name + ': ' : '') + `${reasonOf(e)}, Wertung ${e.pct} %`;
    [say, btns] =
      h.kind === 'stop'
        ? [`${name} kommt nicht gut an.`, set('nicht', 'Nicht mehr kaufen') + hide]
        : [`${name} kommt richtig gut an.`, set('immer', 'Immer kaufen') + hide];
  }
  return `<section class="card" data-sec="hint" style="view-transition-name:sec-hint"><h2>${HINT_TITLES[h.kind]}</h2>
    <p class="say">${say}</p><p class="hint why">${esc(why)}</p><div class="btn-row">${btns}</div></section>`;
}

/* Letzte Woche: the previous week from review() in smart.js; the device remembers „Schließen“ */
function duelText(feeders) {
  // the most first; when several are level it reads „Gleichstand“
  const times = x => `${esc(x.name)} ${x.n}×`,
    lead = feeders.filter(x => x.n === feeders[0].n);
  if (lead.length < 2) return `Gefüttert: ${feeders.map(times).join(', ')}`;
  return [
    `Gleichstand: ${esc(andList(lead.map(x => x.name)))} je ${lead[0].n}×`,
    ...feeders.slice(lead.length).map(times),
  ].join(', ');
}
function weekHTML(w) {
  if (!w) return '';
  const sort = id => esc(pname(getProduct(id)));
  const lines = [
    `${w.meals}× gefüttert, ${w.rated} bewertet`,
    ...w.best.slice(0, 3).map(x => `${esc(getPet(x.pet).name)} mochte am liebsten ${sort(x.id)}`),
    ...w.favorites.slice(0, 2).map(id => `Neuer Liebling: ${sort(id)}`),
  ].map(t => `<p class="say">${t}</p>`);
  if (w.feeders.length > 1) lines.push(`<p class="say duel">${icon('trophy')}<span>${duelText(w.feeders)}</span></p>`);
  return `<section class="card" data-sec="week" style="view-transition-name:sec-week"><h2>Letzte Woche</h2>
    <div class="week">${lines.join('')}</div><button class="card-btn" data-action="close-week" data-v="${dayKey(w.start)}">Schließen</button></section>`;
}

/* Einkaufen: folded up, up to 3 varieties to buy again (including „Gemischt“, with „für …“) and up to 2 no
   longer bought; unfolded, every variety in three groups with score bars. A manual setting decides the group
   and shows the pin (groups: shopGroups() in smart.js). Footer „Geschmack bekannt“ from 3 varieties on, with
   „Als Liste teilen“ below it when unfolded. */
const SHOP = [
  ['nachkaufen', 'Nachkaufen', 3],
  ['beobachten', 'Beobachten', 0],
  ['nicht', 'Nicht mehr kaufen', 2],
];
const genitive = name => name + (/[sßxz]$/i.test(name) ? '’' : 's');
function tasteHTML(m) {
  const {known, total} = m.taste,
    pet = getPet(m.pet) || (db.pets.length === 1 ? db.pets[0] : null);
  if (total < 3) return '';
  return `<p class="hint taste">${pet ? esc(genitive(pet.name)) + ' Geschmack' : 'Geschmack eurer Tiere'}: ${known} von ${total} Sorten bekannt<span class="meter"><i style="--w:${Math.round((known / total) * 100)}%"></i></span></p>`;
}
function shopRow(e, bars) {
  const p = e.product,
    cls = scoreCls(e.score);
  const sub = [p.variety ? p.brand : '', !e.kaufen && e.choice === 'gemischt' ? `für ${petNames(e.yes)}` : '']
    .filter(Boolean)
    .join(', ');
  return `<li><button class="row" data-action="open-product" data-id="${e.id}">${thumbOf(null, p)}
    <span class="t-main"><b>${esc(pname(p))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${bars ? `<span class="meter bar ${cls}"><i style="--w:${Math.max(4, e.pct)}%"></i></span>` : ''}</span>
    ${e.kaufen ? `<span class="pin" title="Eigene Einstellung">${icon('pin')}</span>` : ''}${e.n ? `<span class="pct">${e.pct}<small>%</small></span>` : ''}</button></li>`;
}
function shopCard(m) {
  const g = shopGroups(m),
    open = !!homeView.open.shop;
  if (!g.nachkaufen.length && !g.nicht.length)
    return {
      body:
        '<p class="hint card-line">Noch zu wenig Bewertungen. Nach ein paar Mahlzeiten siehst du hier, was ankommt.</p>' +
        tasteHTML(m),
      more: false,
    };
  const body =
    SHOP.map(([k, title, max]) => {
      const list = open ? g[k] : g[k].slice(0, max);
      return list.length
        ? `<h3 class="label grp">${title}</h3><ul class="list shop">${list.map(e => shopRow(e, open)).join('')}</ul>`
        : '';
    }).join('') +
    tasteHTML(m) +
    (open ? '<button class="card-btn" data-action="share-list">Als Liste teilen</button>' : '');
  return {body, more: g.beobachten.length > 0 || g.nachkaufen.length > 3 || g.nicht.length > 2};
}

/* Erkenntnisse: the most important one folded up, all of them unfolded; no card without an insight. */
const INSIGHT = {
  marke: ['award', 'Marke'],
  konsistenz: ['layers', 'Konsistenz'],
  geschmack: ['fish', 'Geschmack'],
  sosse: ['drop'],
};
function insightHTML(i, m) {
  // one sentence, emphasis in <b>
  if (i.kind === 'sosse')
    return `Bei <b>${esc(pname(m.byId.get(i.id).product))}</b> wird meist nur die Soße geschleckt.`;
  const label =
    i.kind === 'konsistenz' ? TEXTURES[i.type].title : INSIGHT[i.kind][1] + (i.type === TYPES[0] ? '' : ` (${i.type})`); // „Snack-Art“ already names the type
  return `${label}: <b>${esc(i.best.key)}</b> kommt am besten an (${i.best.pct} %), <b>${esc(i.worst.key)}</b> am wenigsten (${i.worst.pct} %).`;
}
function insightCard(m) {
  if (!m.insights.length) return null;
  const list = homeView.open.ins ? m.insights : m.insights.slice(0, 1);
  return {
    body: `<ul class="list ins">${list.map(i => `<li class="row"><span class="lead">${icon(INSIGHT[i.kind][0])}</span><span>${insightHTML(i, m)}</span></li>`).join('')}</ul>`,
    more: m.insights.length > 1,
  };
}
const CARDS = {shop: shopCard, ins: insightCard};

/* Below the calendar only what is current (PROJECT.md, Cards, „History“): today's meals, or yesterday's while
   nothing has been served today, each day whole. One pass over the calendar's two weeks, newest first, which stops
   at its first day, so years of data cost nothing. The button leads to „Verlauf“, where the whole history is. */
function historyHTML() {
  const now = Date.now(),
    since = addDays(weekStart(now), -7), // the calendar's first day, always before yesterday
    today = dayKey(now),
    yesterday = dayKey(addDays(now, -1)),
    recent = [],
    days = {[today]: [], [yesterday]: []};
  for (const s of db.servings) {
    if (s.servedAt < since) break;
    if (!servingPets(s).length) continue;
    recent.push(s);
    days[dayKey(s.servedAt)]?.push(s);
  }
  const shown = days[today].length ? days[today] : days[yesterday],
    multiHouse = db.pets.length > 1 && prefs.activePet === 'all';
  return (
    calendarHTML(recent) +
    (shown.length
      ? dayBlocks(dayGroups(shown), {multiHouse, fresh: homeView.fresh})
      : recent.length || db.servings.some(s => servingPets(s).length)
        ? `<p class="hint empty"><span>Heute noch nichts serviert.</span></p>`
        : `<p class="hint empty">${sketch('empty', 'xl')}<span>Noch nichts serviert.</span></p>`) +
    // The only way to „Verlauf“, so it reads like the other cards' buttons and says where it leads
    `<button class="card-btn" data-action="open-report">Ganzer Verlauf${icon('chevron')}</button>`
  );
}
