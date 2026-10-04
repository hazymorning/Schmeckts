import {$, reduceMotion} from '../dom.js';
import {settled} from '../motion.js';
import {andList, cap, esc} from '../text.js';
import {addDays, dayKey, dayStart} from '../dates.js';
import {haptic} from '../native.js';
import {icon, sketch} from '../icons.js';
import {DEMO, NEWS, observationOf, RATINGS} from '../config.js';
import {db, hideHint, loadError, prefs, savePrefs, storageOK, usedNews} from '../store.js';
import {isConnected} from '../sync.js';
import {
  calledNames,
  diary,
  getPet,
  getProduct,
  model,
  observedPets,
  pendingServings,
  pname,
  servingPets,
} from '../derive.js';
import {hintKey} from '../smart.js';
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
  sideIcon,
  cardHead,
  syncChip,
  thumbOf,
  times,
  whyOf,
} from './parts.js';
import {renderMood} from './mood.js';
import {overviewHTML} from './overview.js';
import {evaluationCard} from './evaluation.js';
import {catOf, sheetOn, sheetText} from './facts.js';

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
          /* already finished; run() below draws anyway */
        }
        run();
      }
    }, 400); // in case the transition never calls run()
  } catch {
    // draw without the animation
    run();
  }
}
export function scrollTop() {
  window.scrollTo({top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth'});
}

/* fresh: entry to slide in on the next draw; held: rated meals kept in the card a moment longer, with their pets;
   turned: the Stimmt’s? sheet showing its back */
export const homeView = {fresh: null, held: new Map(), turned: null};

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
let fills = 0; // a second serving restarts the bowl, so the first run's end must not clear it
export function fabFill() {
  const fab = $('#fab'),
    run = ++fills;
  fab.classList.remove('filled');
  void fab.offsetWidth;
  fab.classList.add('filled');
  settled(fab, true).then(() => run === fills && fab.classList.remove('filled'));
}

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
  const rail = $('#home .obs')?.scrollLeft; // a redraw keeps the chip you just tapped in view
  $('#home').innerHTML = homeHTML();
  if (rail) $('#home .obs').scrollLeft = rail;
  $('#fab').classList.toggle('due', !!$('#home .overview[data-due]')); // a soft nudge at feeding time
  homeView.fresh = null;
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
  let html = banner + (m ? overviewHTML(m, homeView.fresh) + calsheetHTML() : '');
  if (pend.length) html += pendingHTML(pend);
  if (!m) html += stepsHTML();
  else
    html +=
      newsHTML() +
      hintHTML(m) +
      `<section class="card" data-sec="hist" style="view-transition-name:sec-hist">${cardHead('Verlauf', 'open-report', 'Alle Einträge')}${historyHTML()}</section>` +
      evaluationCard(m);
  return html;
}

const welcomeHTML = () => `<div class="welcome">
  <div class="hero"><img class="logo light" src="img/schmeckts-mark.svg" alt=""><img class="logo dark" src="img/schmeckts-mark-dark.svg" alt=""></div>
  <h2>Was schmeckt deinem Tier?</h2>
  <p>Fotografier beim Füttern die Packung und sag später mit einem Tipp, wie viel dein Tier gefressen hat. So siehst du bald, was wirklich ankommt.</p>
  <div class="btn-col"><button class="btn primary" data-action="add-pet">${icon('plus')}Tier anlegen</button>
    ${isConnected() ? '' : `<button class="btn soft" data-action="demo">${icon('sparkle')}Beispieldaten ansehen</button>`}
  </div></div>`;

const stepsHTML = () => `<section class="card" style="view-transition-name:sec-steps"><h2>So geht’s</h2>
  <div class="steps-hero">${sketch('camera', 'xxl')}</div><ol class="list steps">
  <li class="row"><span class="n">1</span><p class="hint"><b>Zur Futterzeit</b> auf „Füttern“ tippen und die Packung fotografieren. Marke und Sorte liest die App von der Packung.</p></li>
  <li class="row"><span class="n">2</span><p class="hint"><b>Wenn der Napf leer ist</b>, oder eben nicht, hier mit einem Tipp bewerten.</p></li>
  <li class="row"><span class="n">3</span><p class="hint"><b>Nach ein paar Tagen</b> siehst du unter „Vorlieben“, was dein Tier mag und was stehen bleibt.</p></li></ol></section>`;

// a pet rated here keeps its row while the meal stays in the card
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

const HINT_TITLES = {
  appetit: 'Appetit',
  stop: `${sideIcon('flop')}Nicht mehr kaufen?`,
  sosse: 'Frisst meist nur die Soße',
  liebling: `${sideIcon('top')}Nachkaufen?`,
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
      `${esc(calledNames([pet.id], 'hint'))} frisst seit ein paar Tagen schlechter als sonst.`,
      `Zuletzt ${times(h.good, h.n)} gut gefressen, in den 30 Tagen davor ${times(h.goodBefore, h.before)}.` +
        (h.seen?.length ? ` Dazu notiert: ${andList(h.seen.map(k => `„${observationOf(k).label}“`))}.` : ''),
      hide,
    ];
  } else if (h.kind === 'sosse') {
    const x = e.pets[h.pet];
    [say, why, btns] = [
      `${esc(calledNames([pet.id], 'hint'))} frisst bei ${name} meist nur die Soße.`,
      cap(`${times(x.counts.sosse, x.n)} ${RATINGS.sosse.said}`),
      hide,
    ];
  } else {
    why = pet ? `${pet.name}: ${lower(evidenceOf(e))}` : whyOf(e);
    [say, btns] =
      h.kind === 'stop'
        ? [`${name} kommt nicht gut an.`, set('nicht', 'Nicht mehr kaufen') + hide]
        : [`${name} kommt gut an.`, set('immer', 'Nachkaufen') + hide];
  }
  return `<section class="card" data-sec="hint" style="view-transition-name:sec-hint"><h2>${HINT_TITLES[h.kind]}</h2>
    <p class="say">${say}</p><p class="hint why">${esc(why)}</p><div class="btn-row">${btns}</div></section>`;
}

// with several pets the editor is reached through the settings
const goTo = ([where, label]) =>
  where === 'pet' && db.pets.length === 1
    ? `<button class="btn primary" data-action="open-pet" data-id="${db.pets[0].id}">${label}</button>`
    : `<button class="btn primary" data-action="${where === 'evaluation' ? 'open-evaluation' : 'open-settings'}">${label}</button>`;
// the newest news, never beside sample data
function newsHTML() {
  const n = NEWS[0],
    [setting, offWhy] = n?.off || [],
    off = setting && !prefs[setting];
  if (
    !n ||
    prefs.hiddenHints.includes('neu:' + n.v) ||
    db.pets.some(p => p.id.startsWith(DEMO)) ||
    (n.cat && !calendarOn())
  )
    return '';
  const go = off ? goTo(['settings', 'Einstellungen öffnen']) : n.go ? goTo(n.go) : '';
  return `<section class="card" data-sec="news" style="view-transition-name:sec-news"><h2>${n.title}</h2>
    <p class="say">${n.say}</p><p class="hint why">${off ? offWhy : n.why}</p><div class="btn-row">${go}<button class="btn soft" data-action="hide-hint" data-v="neu:${n.v}">Ausblenden</button></div></section>`;
}

// The cat calendar: a sheet bound to the day on top, under it the weekday's, moved on by every sheet torn off
export const hasCat = () => db.pets.some(p => p.species === 'Katze');
const calendarOn = () => prefs.calendar && hasCat();
const datedKey = now => 'blatt:' + dayKey(now); // in hiddenHints: the day's dated sheet is torn off
const short = (d, o) => d.toLocaleDateString('de-DE', o).replace('.', '');
// ask: a sheet with a back, a Stimmt’s?, still on its front, which the next tap turns over
function calendar(now) {
  const {sheet, format} = sheetOn(now, prefs.torn, prefs.hiddenHints.includes(datedKey(now))),
    back = !!sheet.back && homeView.turned === sheet.id,
    side = back ? 'Auflösung' : format,
    d = new Date(now);
  return {
    sheet,
    format,
    ask: !!sheet.back && !back,
    html: `<span class="cal-date">${short(d, {weekday: 'short'})} ${d.getDate()}. ${short(d, {month: 'short'})}${side ? ` · ${side}` : ''}</span>
      <p class="cal-text">${sheetText(sheet, catOf(db.pets), back)}</p>`,
  };
}
const label = c => (c.ask ? 'Auflösung zeigen' : 'Nächstes Kalenderblatt');
function calsheetHTML() {
  if (!calendarOn()) return '';
  const c = calendar(Date.now());
  return `<aside class="calsheet" role="button" tabindex="0" aria-label="${label(c)}" data-action="tear" style="view-transition-name:sec-cal">${c.html}</aside>`;
}
function paint(el, c) {
  el.innerHTML = c.html;
  el.setAttribute('aria-label', label(c));
}
// a Stimmt’s? turns over first; then the next sheet is in place at once, the one torn off rises from it and fades
export function tearSheet(el) {
  const now = Date.now(),
    c = calendar(now);
  if (c.ask) return turnSheet(el, c.sheet);
  const old = el.cloneNode(true),
    news = usedNews('calendar'); // its news card goes once the sheet is gone
  if (c.format) {
    prefs.torn[c.format] = (prefs.torn[c.format] || 0) + 1;
    savePrefs();
  } else hideHint(datedKey(now));
  haptic();
  el.classList.remove('turning', 'turned'); // a turn still running ends with this sheet
  paint(el, calendar(now));
  if (reduceMotion.matches) return news && update();
  for (const a of ['data-action', 'role', 'tabindex', 'aria-label', 'style']) old.removeAttribute(a);
  old.setAttribute('aria-hidden', 'true');
  old.classList.remove('turning', 'turned');
  old.classList.add('torn');
  old.style.width = el.offsetWidth + 'px';
  el.before(old);
  settled(old).then(() => {
    old.remove();
    if (news) update();
  });
}
// edge on, halfway through, the back takes the front's place
function turnSheet(el, sheet) {
  homeView.turned = sheet.id;
  haptic();
  if (reduceMotion.matches) return paint(el, calendar(Date.now()));
  el.classList.add('turning');
  settled(el)
    .then(() => {
      paint(el, calendar(Date.now()));
      el.classList.replace('turning', 'turned');
      return settled(el);
    })
    .then(() => el.classList.remove('turned'));
}

// Lists are newest first, so the loops stop at the calendar's first day and old data costs nothing
function historyHTML() {
  const now = Date.now(),
    since = addDays(dayStart(now), -6), // the calendar's first day, always before yesterday
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
    calendarHTML(recent, true) +
    (shown.length
      ? dayBlocks(dayGroups(shown), {multiHouse, fresh: homeView.fresh})
      : recent.length || db.servings.some(s => servingPets(s).length)
        ? `<p class="hint empty"><span>Heute noch nichts serviert, der Napf langweilt sich.</span></p>`
        : `<p class="hint empty">${sketch('empty', 'xl')}<span>Noch nichts serviert, der Napf wartet auf seine Premiere.</span></p>`)
  );
}
