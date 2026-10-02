/* Home page: pet bar and cards in a fixed order, the welcome page when there are no pets. Everything evaluated comes
   from model() in derive.js. */
import {$, reduceMotion} from '../dom.js';
import {settled, slideHeight} from '../motion.js';
import {andList, cap, esc} from '../text.js';
import {addDays, dayKey, weekStart} from '../dates.js';
import {icon, sketch} from '../icons.js';
import {observationOf, RATINGS} from '../config.js';
import {db, loadError, prefs, storageOK} from '../store.js';
import {isConnected} from '../sync.js';
import {diary, getPet, getProduct, model, observedPets, pendingServings, pname, servingPets} from '../derive.js';
import {hintKey, shopGroups} from '../smart.js';
import {hasPhoto} from '../photos.js';
import {anyOpen} from '../ui/sheet.js';
import {viewerOpen} from '../ui/viewer.js';
import {
  avatar,
  calendarHTML,
  dayBlocks,
  dayGroups,
  deleteMealBtn,
  evidenceOf,
  lower,
  nameBlock,
  photoThumb,
  rateSlider,
  shopRow,
  syncChip,
  thumbOf,
  times,
  whyOf,
} from './parts.js';
import {renderMood} from './mood.js';
import {observeChips, overviewHTML} from './overview.js';
import {evaluationCard} from './evaluation.js';

/* Redraw the home page, with a smooth view transition where possible */
export function update() {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    renderHome();
  };
  if (!document.startViewTransition || reduceMotion.matches || anyOpen() || viewerOpen()) return run();
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
// open: the overview unfolded, which lasts until the app restarts
// held: meals rated in „Wie war’s?“ that stay there a moment longer (logic/editing.js), each with the pets rated there
// observing: the overview's chips for an observation folded open
export const homeView = {fresh: null, open: {}, held: new Map(), observing: false};

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
/* The overview's whole text and back, with a tap on the card: without a redraw, only the class changes, and the
   height eases as the other cards' folds do */
export function toggleOverview() {
  const sec = $('#home .overview'),
    top = sec && $('.ov-top', sec),
    p = sec && $('p', sec);
  if (!p) return;
  const open = (homeView.open.overview = !homeView.open.overview),
    h0 = p.offsetHeight;
  sec.classList.toggle('open', open);
  top.setAttribute('aria-expanded', String(open));
  slideHeight(p, h0);
}
/* „Beobachtung notieren“: the chips fold open in the card above the button, which then says „Abbrechen“, and shut
   again; only that part is swapped and eases to its height, as a fold on a page does (foldPart() in views/sheets.js) */
export function toggleObserve() {
  const sec = $('#home .overview'),
    body = sec && $('#fold-observe', sec),
    btn = sec && $('[data-action=observe-open]', sec);
  if (!body || !btn) return;
  const open = (homeView.observing = !homeView.observing),
    h0 = body.offsetHeight;
  body.innerHTML = open ? observeChips() : '';
  btn.textContent = open ? 'Abbrechen' : 'Beobachtung notieren';
  btn.setAttribute('aria-expanded', String(open));
  slideHeight(body, h0);
}
function homeHTML() {
  const banner = loadError
    ? `<p class="banner">Die gespeicherten Daten konnten nicht gelesen werden. Bitte starte die App neu. Bis dahin wird nichts gespeichert.</p>`
    : storageOK
      ? ''
      : `<p class="banner">In dieser Vorschau wird nichts dauerhaft gespeichert. Öffne die Datei lokal im Browser, dann bleiben deine Daten erhalten.</p>`;
  if (!db.pets.length) return banner + welcomeHTML();
  const open = new Set(pendingServings()),
    pend = db.servings.filter(s => open.has(s) || (homeView.held.has(s.id) && rateRows(s).length)),
    m = db.servings.length ? model() : null;
  let html = banner + (m ? overviewHTML(m, homeView.open.overview, homeView.observing) : '');
  if (pend.length) html += pendingHTML(pend);
  if (!m) html += stepsHTML();
  else
    html +=
      hintHTML(m) +
      `<section class="card" data-sec="hist" style="view-transition-name:sec-hist"><h2>Verlauf</h2>${historyHTML()}</section>` +
      evaluationCard(m) +
      shopHTML(m);
  return html;
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
  <li class="row"><span class="n">3</span><p class="hint"><b>Nach ein paar Tagen</b> siehst du unter „Vorlieben“, was dein Tier mag und was stehen bleibt.</p></li></ol></section>`;

/* „Wie war’s?“: only while ratings are still open. A pet rated here keeps its row while the meal is in the card. A
   meal without a variety (a photo that missed) can be deleted right here, under its slider, as while naming it. */
const rateRows = s => servingPets(s).filter(pid => !s.pets[pid].r || homeView.held.get(s.id)?.has(pid));
function pendingHTML(list) {
  const multiHouse = db.pets.length > 1;
  return (
    `<section class="card" style="view-transition-name:sec-pend"><h2>Wie war’s?</h2><ul class="list">` +
    list
      .map(s => {
        const p = getProduct(s.productId),
          ids = rateRows(s),
          multi = ids.length > 1;
        const main = `<span class="t-main">${nameBlock(s, p)}</span>${multiHouse && !multi ? avatar(getPet(ids[0]), 's') : ''}`;
        // With a large photo on this phone its thumbnail is a button of its own, which opens it
        const head = hasPhoto(s, p)
          ? `<div class="pend-top">${photoThumb(s, p)}<button class="pend-head" data-action="open-serving" data-id="${s.id}">${main}</button></div>`
          : `<button class="pend-head" data-action="open-serving" data-id="${s.id}">${thumbOf(s, p)}${main}</button>`;
        const rows = ids
          .map(
            pid =>
              `<div class="pet-rate">${multi ? `<div class="pet-label">${avatar(getPet(pid), 'xs')}${esc(getPet(pid).name)}</div>` : ''}${rateSlider(s, pid)}</div>`,
          )
          .join('');
        return `<li class="pend" data-id="${s.id}" style="view-transition-name:sv-${s.id};view-transition-class:${homeView.fresh === s.id ? 'fresh' : 'item'}">${head}${rows}${p ? '' : deleteMealBtn(s.id)}</li>`;
      })
      .join('') +
    `</ul></section>`
  );
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
      `Zuletzt ${times(h.good, h.n)} gut gefressen, in den 30 Tagen davor ${times(h.goodBefore, h.before)}.` +
        (h.seen?.length ? ` Dazu notiert: ${andList(h.seen.map(k => lower(observationOf(k).label)))}.` : ''),
      hide,
    ];
  } else if (h.kind === 'sosse') {
    const x = e.pets[h.pet];
    [say, why, btns] = [
      `${esc(pet.name)} frisst bei ${name} meist nur die Soße.`,
      cap(`${times(x.counts.sosse, x.n)} ${RATINGS.sosse.said}`),
      hide,
    ];
  } else {
    why = pet ? `${pet.name}: ${lower(evidenceOf(e))}` : whyOf(e);
    [say, btns] =
      h.kind === 'stop'
        ? [`${name} kommt nicht gut an.`, set('nicht', 'Nicht mehr kaufen') + hide]
        : [`${name} kommt gut an.`, set('immer', 'Immer kaufen') + hide];
  }
  return `<section class="card" data-sec="hint" style="view-transition-name:sec-hint"><h2>${HINT_TITLES[h.kind]}</h2>
    <p class="say">${say}</p><p class="hint why">${esc(why)}</p><div class="btn-row">${btns}</div></section>`;
}

/* Einkaufen: the first three to buy again, the best first, each with its ratings as a strip, and the way to the whole
   list on its page (shopGroups() in smart.js). No card while nothing is to be bought again: a shopping list with
   nothing on it has no use on the home page. */
const SHOP_SHOWN = 3;
function shopHTML(m) {
  const g = shopGroups(m);
  if (!g.nachkaufen.length) return '';
  const rows = g.nachkaufen
    .slice(0, SHOP_SHOWN)
    .map(e => shopRow(m, e))
    .join('');
  return `<section class="card" data-sec="shop" style="view-transition-name:sec-shop"><h2>Einkaufen</h2><ul class="list shop">${rows}</ul>
    <button class="card-btn" data-action="open-shop">Einkaufsliste öffnen${icon('chevron')}</button></section>`;
}

/* Below the calendar only what is current (PROJECT.md, Cards, „History“): today's meals and observations, or
   yesterday's while nothing has been served or noted today, each day whole. One pass over the calendar's two weeks,
   newest first, which stops at its first day, so years of data cost nothing. The button leads to „Verlauf“, where the
   whole history is. */
function historyHTML() {
  const now = Date.now(),
    since = addDays(weekStart(now), -7), // the calendar's first day, always before yesterday
    today = dayKey(now),
    yesterday = dayKey(addDays(now, -1)),
    recent = [],
    days = {[today]: [], [yesterday]: []},
    seen = {[today]: [], [yesterday]: []};
  for (const s of db.servings) {
    if (s.servedAt < since) break;
    if (!servingPets(s).length) continue;
    recent.push(s);
    days[dayKey(s.servedAt)]?.push(s);
  }
  for (const o of db.observations) {
    if (o.at < since) break;
    if (observedPets(o).length) seen[dayKey(o.at)]?.push(o);
  }
  const day = days[today].length || seen[today].length ? today : yesterday,
    shown = diary(days[day], seen[day]),
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
