import {$, reduceMotion} from '../dom.js';
import {settled} from '../motion.js';
import {andList, cap, esc} from '../text.js';
import {addDays, dayKey, dayStart} from '../dates.js';
import {canNotify, haptic} from '../native.js';
import {icon, sketch} from '../icons.js';
import {DEMO, NEWS, observationOf, RATINGS, REMIND_ASKED, REMIND_DEFAULT} from '../config.js';
import {db, loadError, prefs, savePrefs, storageOK} from '../store.js';
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
import {pressing, untouched} from '../ui/slider.js';
import {viewerOpen} from '../ui/viewer.js';
import {
  avatar,
  calendarHTML,
  dayBlocks,
  dayGroups,
  deleteMealBtn,
  lower,
  nameBlock,
  photoThumb,
  rateSlider,
  resultBadges,
  cardHead,
  syncChip,
  thumbOf,
  times,
  whyOf,
} from './parts.js';
import {renderMood} from './mood.js';
import {overviewHTML} from './overview.js';
import {evaluationCard} from './evaluation.js';
import {catOf, hangingDay, sheetOn, sheetText} from './facts.js';

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

let petsDrawn = ''; // an unchanged bar is left alone, so it keeps the focus
function renderPets() {
  const el = $('#pets');
  if (db.pets.length < 2) {
    el.innerHTML = petsDrawn = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const html =
    `<button class="pet" data-action="filter" data-id="all" aria-pressed="${prefs.activePet === 'all'}" style="view-transition-name:av-all"><span class="av xl all">${icon('paw')}</span><span>Alle</span></button>` +
    db.pets
      .map(
        p =>
          `<button class="pet" data-action="filter" data-id="${p.id}" aria-pressed="${prefs.activePet === p.id}" style="view-transition-name:av-${p.id}">${avatar(p, 'xl')}<span>${esc(p.name)}</span></button>`,
      )
      .join('') +
    `<button class="pet" data-action="add-pet" aria-label="Katze hinzufügen"><span class="av xl add">${icon('plus')}</span><span>Neu</span></button>`;
  if (html !== petsDrawn) el.innerHTML = petsDrawn = html;
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

/* changed false: a redraw nothing asked for, such as the minute tick, which leaves an unchanged page alone and so
   the focus where it is. Never under a finger on a slider, or the rating would go with it. */
let drawn = '';
export function renderHome(changed = true) {
  if (pressing()) return void untouched().then(() => renderHome(changed));
  renderPets();
  renderFab();
  renderSyncChip();
  renderMood();
  const html = homeHTML();
  if (!changed && html === drawn) return;
  drawn = html;
  const rail = $('#home .obs')?.scrollLeft; // a redraw keeps the chip you just tapped in view
  $('#home').innerHTML = html;
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
  let html = banner + (m ? overviewHTML(m, homeView.fresh) : '');
  if (pend.length) html += pendingHTML(pend);
  if (!m) html += stepsHTML();
  else
    html +=
      calsheetHTML() +
      (remindHTML() || newsHTML() || hintHTML(m)) + // one question at a time
      `<section class="card" data-sec="hist" style="view-transition-name:sec-hist">${cardHead('Verlauf', 'open-report', 'Alle Einträge')}${historyHTML()}</section>` +
      evaluationCard(m);
  return html;
}

const welcomeHTML = () => `<div class="welcome">
  <div class="hero"><img class="logo light" src="img/schmeckts-mark.svg" alt=""><img class="logo dark" src="img/schmeckts-mark-dark.svg" alt=""></div>
  <h2>Was schmeckt deiner Katze?</h2>
  <p>Fotografier beim Füttern die Packung und sag später mit einem Tipp, wie viel deine Katze gefressen hat. So siehst du bald, was wirklich ankommt.</p>
  <div class="btn-col"><button class="btn primary" data-action="add-pet">${icon('plus')}Katze anlegen</button>
    ${isConnected() ? '' : `<button class="btn soft" data-action="demo">${icon('sparkle')}Beispieldaten ansehen</button>`}
  </div></div>`;

const stepsHTML = () => `<section class="card" style="view-transition-name:sec-steps"><h2>So geht’s</h2>
  <div class="steps-hero">${sketch('camera', 'xxl')}</div><ol class="list steps">
  <li class="row"><span class="n">1</span><p class="hint"><b>Zur Futterzeit</b> auf „Füttern“ tippen und die Packung fotografieren. Marke und Sorte liest die App von der Packung.</p></li>
  <li class="row"><span class="n">2</span><p class="hint"><b>Wenn der Napf leer ist</b>, oder eben nicht, hier mit einem Tipp bewerten.</p></li>
  <li class="row"><span class="n">3</span><p class="hint"><b>Nach ein paar Tagen</b> siehst du unter „Vorlieben“, was deine Katze mag und was stehen bleibt.</p></li></ol></section>`;

// a pet rated here keeps its row while the meal stays in the card
const rateRows = s => servingPets(s).filter(pid => !s.pets[pid].r || homeView.held.get(s.id)?.has(pid));
// each pet rates its newest meal here; older ones open their sheet
function pendingHTML(list) {
  const multiHouse = db.pets.length > 1,
    newest = new Map();
  for (const s of list) for (const pid of rateRows(s)) if (!newest.has(pid)) newest.set(pid, s.id);
  return (
    `<section class="card" data-sec="pend" style="view-transition-name:sec-pend"><h2>Wie war’s?</h2><ul class="list">` +
    list
      .map(s => {
        const p = getProduct(s.productId),
          ids = rateRows(s).filter(pid => newest.get(pid) === s.id);
        const main = `<span class="t-main">${nameBlock(s, p)}</span>${ids.length || !multiHouse ? '' : resultBadges(s)}`;
        const head = hasPhoto(s, p)
          ? `<div class="pend-top">${photoThumb(s, p)}<button class="pend-head" data-action="open-serving" data-id="${s.id}">${main}</button></div>`
          : `<button class="pend-head" data-action="open-serving" data-id="${s.id}">${thumbOf(s, p)}${main}</button>`;
        const rows = ids
          .map(
            pid =>
              `<div class="pet-rate">${multiHouse ? `<div class="pet-label">${avatar(getPet(pid), 'xs')}${esc(getPet(pid).name)}</div>` : ''}${rateSlider(s, pid)}</div>`,
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
  stop: 'Nicht mehr kaufen?',
  sosse: 'Frisst meist nur die Soße',
  liebling: 'Nachkaufen?',
};
function hintHTML(m) {
  const h = m.hints[0];
  if (!h) return '';
  const e = m.byId.get(h.id),
    pet = h.pet && getPet(h.pet);
  const hide = `<button class="btn soft" data-action="hide-hint" data-v="${esc(hintKey(h))}">Ausblenden</button>`;
  const set = (v, label) =>
    `<button class="btn primary" data-action="hint-buy" data-id="${e.id}" data-v="${v}">${label}</button>`;
  const card = (body, btns) =>
    `<section class="card" data-sec="hint" style="view-transition-name:sec-hint"><h2>${HINT_TITLES[h.kind]}</h2>${body}<div class="btn-row">${btns}</div></section>`;
  if (h.kind === 'appetit')
    return card(
      `<p class="say">${esc(calledNames([pet.id], 'hint'))} frisst seit ein paar Tagen schlechter als sonst.</p>
      <p class="hint why">${esc(
        `Zuletzt ${times(h.good, h.n)} gut gefressen, in den 30 Tagen davor ${times(h.goodBefore, h.before)}.` +
          (h.seen?.length ? ` Dazu notiert: ${andList(h.seen.map(k => `„${observationOf(k).label}“`))}.` : ''),
      )}</p>`,
      hide,
    );
  // the variety with its packaging, as in the cards around it
  const p = e.product,
    x = h.kind === 'sosse' && e.pets[h.pet],
    why = x ? `${times(x.counts.sosse, x.n)} ${RATINGS.sosse.said}` : lower(whyOf(e)),
    sub = [p.variety ? p.brand : '', pet && db.pets.length > 1 ? `${pet.name}: ${why}` : why]
      .filter(Boolean)
      .join(', ');
  return card(
    `<ul class="list"><li><button class="row" data-action="open-product" data-id="${e.id}">${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(cap(sub))}</small></span></button></li></ul>`,
    h.kind === 'stop'
      ? set('nicht', 'Nicht mehr kaufen') + hide
      : h.kind === 'liebling'
        ? set('immer', 'Nachkaufen') + hide
        : hide,
  );
}

// asked once after the first meal: with the reminder on, a meal is rated right in the notification
function remindHTML() {
  if (
    prefs.remind ||
    prefs.hiddenHints.includes(REMIND_ASKED) ||
    !canNotify() ||
    db.pets.some(p => p.id.startsWith(DEMO))
  )
    return '';
  return `<section class="card" data-sec="remind" style="view-transition-name:sec-remind"><h2>Ans Bewerten erinnern?</h2>
    <p class="say">${REMIND_DEFAULT / 60} Stunden nach dem Füttern fragt die App, wie es geschmeckt hat.</p>
    <p class="hint why">Bewerten geht dann gleich in der Benachrichtigung.</p>
    <div class="btn-row"><button class="btn primary" data-action="remind-yes">Ja, erinnern</button><button class="btn soft" data-action="hide-hint" data-v="${REMIND_ASKED}">Nein danke</button></div></section>`;
}

// with several pets the editor is reached through the settings
const goTo = ([where, label]) =>
  where === 'pet' && db.pets.length === 1
    ? `<button class="btn primary" data-action="open-pet" data-id="${db.pets[0].id}">${label}</button>`
    : `<button class="btn primary" data-action="${where === 'evaluation' ? 'open-evaluation' : 'open-settings'}">${label}</button>`;
// the newest news for this household, never beside sample data
function newsHTML() {
  const n = NEWS[0],
    [setting, offWhy] = n?.off || [],
    off = setting && !prefs[setting];
  if (!n || prefs.hiddenHints.includes('neu:' + n.v) || db.pets.some(p => p.id.startsWith(DEMO))) return '';
  const go = off ? goTo(['settings', 'Einstellungen öffnen']) : n.go ? goTo(n.go) : '';
  return `<section class="card" data-sec="news" style="view-transition-name:sec-news"><h2>${n.title}</h2>
    <p class="say">${n.say}</p><p class="hint why">${off ? offWhy : n.why}</p><div class="btn-row">${go}<button class="btn soft" data-action="hide-hint" data-v="neu:${n.v}">Ausblenden</button></div></section>`;
}

// The cat calendar: a sheet a day. On a new day the last one seen still hangs over today's until it is torn off.
/* A day's sheet: the date as its heading, its format stamped beside it, then the fact. Today's Stimmt’s? turns over
   on a tap, its answer led by the verdict. */
function face(date, hanging = false) {
  const {sheet, format} = sheetOn(date),
    back = !hanging && !!sheet.back && homeView.turned === sheet.id,
    lead = back ? `<b class="cal-verdict">${sheet.verdict}.</b> ` : '',
    // the day and its month stay together when the date needs two lines
    day = new Date(date)
      .toLocaleDateString('de-DE', {weekday: 'long', day: 'numeric', month: 'long'})
      .replace(/\. /, '.\u00a0');
  return {
    label: hanging ? 'Gestriges Blatt abreißen' : sheet.back ? (back ? 'Behauptung zeigen' : 'Auflösung zeigen') : '',
    html: `<div class="cal-head"><p class="cal-date">${day}</p><span class="cal-stamp">${format}</span></div>
      <p class="cal-text">${lead}${sheetText(sheet, catOf(db.pets), back)}</p>${hanging ? `<p class="cal-foot">${icon('down')}Zum Abreißen tippen</p>` : ''}`,
  };
}
const tappable = (action, label) => ` role="button" tabindex="0" aria-label="${label}" data-action="${action}"`;
function calsheetHTML() {
  if (!prefs.calendar) return '';
  const now = Date.now(),
    today = dayKey(now);
  // first seen, or ahead after the clock was put back: nothing hangs today
  if (!prefs.sheetDay || prefs.sheetDay > today) {
    prefs.sheetDay = today;
    savePrefs();
  }
  const day = hangingDay(prefs.sheetDay, now),
    c = face(now),
    old = day && face(day, true);
  return `<div class="calpad" style="view-transition-name:sec-cal"><i class="cal-top" aria-hidden="true"></i><aside class="calsheet"${c.label ? tappable('turn', c.label) : ''}${old ? ' inert' : ''}>${c.html}</aside>${old ? `<aside class="calsheet"${tappable('tear', old.label)}>${old.html}</aside>` : ''}</div>`;
}
// the sheet left hanging comes off at the perforation and falls over what lies below; today's is already in place
export function tearSheet(el) {
  prefs.sheetDay = dayKey(Date.now());
  savePrefs();
  haptic();
  if (reduceMotion.matches) return update();
  el.removeAttribute('data-action');
  el.classList.add('torn');
  el.parentElement.classList.add('tearing');
  settled(el).then(update);
}
// today's Stimmt’s? turns over and back: edge on, halfway through, the other side takes its place
export function turnSheet(el) {
  if (el.matches('.turning, .turned')) return;
  const {sheet} = sheetOn(Date.now());
  homeView.turned = homeView.turned === sheet.id ? null : sheet.id;
  haptic();
  if (reduceMotion.matches) return paint(el);
  el.classList.add('turning');
  settled(el)
    .then(() => {
      paint(el);
      el.classList.replace('turning', 'turned');
      return settled(el, true);
    })
    .then(() => el.classList.remove('turned'));
}
function paint(el) {
  const c = face(Date.now());
  el.innerHTML = c.html;
  el.setAttribute('aria-label', c.label);
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
      ? dayBlocks(dayGroups(shown), {multiHouse, fresh: homeView.fresh, plain: true})
      : recent.length || db.servings.some(s => servingPets(s).length)
        ? `<p class="hint empty"><span>Heute noch nicht gefüttert, der Napf langweilt sich.</span></p>`
        : `<p class="hint empty">${sketch('empty', 'xl')}<span>Noch nichts eingetragen, der Napf wartet auf seine Premiere.</span></p>`)
  );
}
