/* Contents of the sheets: meal, naming, feeding (with the choice after scanning), food, pet (with cropping of
   the profile picture) and evaluation. The settings are a page and live in views/settings.js; the pet editor is
   one of its pages as well, drawn by the same view. */
import {$, reduceMotion} from '../dom.js';
import {cap, esc, norm} from '../text.js';
import {addDays, toLocalInput, weekStart, when} from '../dates.js';
import {icon} from '../icons.js';
import {RATINGS, scaleOf, SPECIES, TEXTURES, TYPES, typeOf} from '../config.js';
import {db} from '../store.js';
import {
  getPet,
  getProduct,
  getServing,
  petNames,
  pname,
  productsByCode,
  quickProducts,
  reportModel,
  servingsInFilter,
  sortOf,
} from '../derive.js';
import {GOOD, MIN_RATED, rateCls, scoreCls, VERDICTS} from '../smart.js';
import {hasLine} from '../ocr.js';
import {memLines, photoByServer} from '../recognize.js';
import {hasPhoto} from '../photos.js';
import {setSheetView, sheet, sheetBody} from '../ui/sheet.js';
import {ZOOM_MAX, mountCrop} from '../ui/crop.js';
import {
  armBtn,
  avatar,
  calendarHTML,
  closeBtn,
  dayBlocks,
  dayGroups,
  head,
  nameBlock,
  photoThumb,
  rateRow,
  reasonOf,
  resultBadges,
  segmented,
  thumbOf,
  verdictLabel,
} from './parts.js';
import {paintHouse, viewSettings} from './settings.js';

/* The pieces of „Wie war’s?“: the variety as a card that leads to naming, one rating row per pet, and in a
   household the chips that say who was served. */
const servingCard = (s, p) => {
  const main = `<span class="t-main">${nameBlock(s, p, true)}</span><span class="edit">${icon('pencil')}</span>`;
  // With a large photo on this phone its thumbnail opens it, and the rest of the card leads to naming
  return hasPhoto(s, p)
    ? `<div class="prod-card">${photoThumb(s, p, 'lg')}<button class="prod-edit" data-action="edit-name" aria-label="Futter ändern">${main}</button></div>`
    : `<button class="prod-card" data-action="edit-name" aria-label="Futter ändern">${thumbOf(s, p, 'lg')}${main}</button>`;
};
const petRateRow = (s, pid, multi) =>
  `<div class="pet-rate">${multi ? `<div class="pet-label">${avatar(getPet(pid), 'xs')}${esc(getPet(pid).name)}</div>` : ''}
    ${rateRow(s, pid, true)}</div>`;
const servedForChips = s =>
  `<span class="label">Serviert für</span><div class="chips">${db.pets
    .map(
      pet =>
        `<button class="chip" aria-pressed="${!!s.pets[pet.id]}" data-action="toggle-serving-pet" data-id="${pet.id}">
          ${avatar(pet, 'xs')}${esc(pet.name)}</button>`,
    )
    .join('')}</div>`;

/* Deleting a meal, at the end of „Wie war’s?“ and of naming a meal that has no variety yet: one tap, undone from the
   toast, because arming is only for what cannot be undone */
const deleteMeal = `<button class="btn quiet" data-action="delete-serving">${icon('trash')}Eintrag löschen</button>`;

function viewServing() {
  const s = getServing(sheet.id);
  if (!s)
    return `<div class="sh-head"><h2>Eintrag</h2>${closeBtn}</div><p class="empty">Diesen Eintrag gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const p = getProduct(s.productId);
  const ids = Object.keys(s.pets).filter(id => getPet(id));
  const multi = db.pets.length > 1;
  return `<div class="sh-head"><h2>Wie war’s?</h2>${closeBtn}</div>
    ${servingCard(s, p)}
    ${ids.map(pid => petRateRow(s, pid, multi)).join('')}
    ${multi ? servedForChips(s) : ''}
    <label class="label" for="f-time">Serviert${s.by ? ' von ' + esc(s.by) : ''}</label>
    <span class="pick"><input id="f-time" class="field" type="datetime-local" data-time="${s.id}" value="${toLocalInput(s.servedAt)}" max="${toLocalInput(Date.now())}">${icon('chevron')}</span>
    <label class="label" for="f-note">Notiz</label>
    <input id="f-note" class="field" data-note="${s.id}" value="${esc(s.note || '')}" placeholder="Optional, z. B. neue Packung" autocomplete="off">
    <div class="mt">${deleteMeal}</div>`;
}

function viewName() {
  const s = sheet;
  const serving = s.kind === 'serving' ? getServing(s.id) : null;
  const title =
    s.kind === 'new'
      ? 'Neues Futter'
      : s.kind === 'product'
        ? 'Futter umbenennen'
        : serving?.productId
          ? 'Futter ändern'
          : 'Futter benennen';
  const photo = serving && (serving.photo || serving.thumb),
    large = serving && hasPhoto(serving, null);
  let note = '';
  const retry = label =>
    serving.photo && photoByServer() ? `<button class="link" data-action="retry">${label}</button>` : '';
  if (serving?.status === 'reading') note = `<p class="note"><span class="spin"></span>Packung wird gelesen …</p>`;
  else if (serving?.status === 'recognizing')
    note = `<p class="note"><span class="spin"></span>Sorte wird erkannt …</p>`;
  else if (serving?.status === 'waiting')
    note = `<p class="note">${esc(serving.error || 'Wird erkannt, sobald der Server erreichbar ist.')} ${retry('Jetzt versuchen')}</p>`;
  else if (serving?.status === 'failed')
    note = `<p class="note warn">${esc(serving.error || 'Nicht erkannt.')} ${retry('Nochmal versuchen')}</p>`;
  return `<div class="sh-head"><h2>${title}</h2>${closeBtn}</div>
    ${
      photo
        ? large
          ? `<button class="photo-btn" data-action="view-photo" data-s="${serving.id}" data-p="" aria-label="Foto vergrößern"><img class="name-photo" src="${esc(photo)}" alt="Foto der Packung"></button>`
          : `<img class="name-photo" src="${esc(photo)}" alt="Foto der Packung">`
        : ''
    }${note}
    <div class="suggest" id="suggest"></div>
    <label class="label" for="f-brand">Marke</label>
    <input id="f-brand" class="field" data-field="brand" value="${esc(s.brand)}" placeholder="z. B. Sheba" autocomplete="off" autocapitalize="words" enterkeyhint="next">
    <label class="label" for="f-variety">Sorte</label>
    <input id="f-variety" class="field" data-field="variety" value="${esc(s.variety)}" placeholder="z. B. Lachs in Soße" autocomplete="off" enterkeyhint="done">
    <span class="label">Art</span>
    <div class="chips">${TYPES.map(t => `<button class="chip" aria-pressed="${s.type === t}" data-action="set-type" data-v="${t}">${t}</button>`).join('')}</div>
    ${textureChips(s)}
    <div class="mt btn-col"><button class="btn primary" data-action="save-name">${icon('check')}${s.kind === 'new' ? 'Servieren' : 'Speichern'}</button>${serving && !serving.productId ? deleteMeal : ''}</div>`;
}
/* Consistency or treat type of variety x (the sheet itself while naming): single choice, for types that have one */
function textureChips(x, note = '') {
  const t = TEXTURES[typeOf(x)];
  return t
    ? `<div class="tex"><span class="label">${t.title}</span><div class="chips">${t.items.map(([k, label]) => `<button class="chip" aria-pressed="${x.texture === k}" data-action="set-texture" data-v="${k}">${label}</button>`).join('')}</div>${note}</div>`
    : '';
}
/* What the phone read off the packaging, as chips: only the phone's own reading has them (recognize.js), they live
   in memory only, and a tap puts a line into a field or takes it out again. */
const packChips = serving => {
  const lines = (serving && memLines.get(serving.id)) || [];
  if (!lines.length) return '';
  return `<span class="label">Auf der Packung gelesen</span><div class="chips">${lines
    .map(
      l =>
        `<button class="chip" aria-pressed="${hasLine(sheet.brand, l) || hasLine(sheet.variety, l)}" data-action="pack-line" data-v="${esc(l)}">${esc(l)}</button>`,
    )
    .join('')}</div>`;
};
export function renderSuggestions() {
  const box = $('#suggest');
  if (!box || !sheet) return;
  const serving = sheet.kind === 'serving' ? getServing(sheet.id) : null;
  const skip = sheet.kind === 'product' ? sheet.id : serving?.productId;
  const q = norm(`${sheet.brand || ''} ${sheet.variety || ''}`);
  let hits = [],
    title = 'Meinst du?';
  if (q.length >= 2) {
    const words = q.split(' ');
    hits = db.products
      .filter(p => p.id !== skip && words.every(w => norm(p.brand + ' ' + p.variety).includes(w)))
      .slice(0, 4);
  } else if (serving && !serving.productId) {
    hits = quickProducts(4);
    title = 'Schon mal gehabt?';
  } // one-tap suggestion
  box.innerHTML =
    (hits.length ? `<span class="label">${title}</span>` : '') +
    hits
      .map(
        p =>
          `<button class="sugg" data-action="use-product" data-id="${p.id}">${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(p.brand)}</small></span>${icon('chevron')}</button>`,
      )
      .join('') +
    packChips(serving);
}

/* Feeding: barcode and photo as equally wide buttons; „Füttern beginnt mit“ hides one of them and the other takes
   the full width. Below them the most recently fed varieties, at most SUGGEST; with more known varieties the search
   field follows, whose hits (at most HITS) take the place of the suggestions.
   sheet.busy: the notice while scanning,
   sheet.code: the scanned code currently in play (the choice, or the photo button takes it over) */
const SUGGEST = 3,
  HITS = 8;
const CTA = {
  barcode: `<button class="cta primary" data-action="scan">${icon('barcode')}<span><b>Barcode</b><small>scannen</small></span></button>`,
  foto: `<button class="cta soft" data-action="photo">${icon('camera')}<span><b>Foto</b><small>aufnehmen</small></span></button>`,
};
function serveRows(prods, code = '') {
  return prods
    .map(p => {
      const e = sortOf(p.id);
      const meta = [p.variety ? p.brand : '', e?.n ? `${e.pct} %` : 'noch nicht bewertet'].filter(Boolean).join(', ');
      return `<li><button class="row" data-action="serve" data-id="${p.id}"${code ? ` data-code="${esc(code)}"` : ''}>
        ${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(meta)}</small></span>
        <span class="serve-pill">Servieren</span></button></li>`;
    })
    .join('');
}
function viewFeed() {
  const pick = sheet.step === 'pick' ? productsByCode(sheet.code) : [];
  if (pick.length)
    return `<div class="sh-head"><h2>Welche Sorte?</h2>${closeBtn}</div>
    <p class="hint">Dieser Barcode gehört zu mehreren Sorten.</p>
    <ul class="plist">${serveRows(pick, sheet.code)}</ul>`;
  const prods = quickProducts();
  return `<div class="sh-head"><h2>Was gibt’s heute?</h2>${closeBtn}</div>
    <div class="cta-row">${CTA.barcode}${CTA.foto}</div>
    ${sheet.busy ? `<p class="note" role="status"><span class="spin"></span>${esc(sheet.busy)}</p>` : ''}
    <div class="serve">
      ${
        prods.length > SUGGEST
          ? `<div class="search">${icon('search')}
            <input class="field" type="search" data-search placeholder="Marke oder Sorte suchen" autocomplete="off"></div>`
          : ''
      }
      <div class="serve-list" id="serveList">${quickList(prods)}</div>
    </div>
    <button class="btn plain" data-action="new-product">Ohne Foto eintippen</button>`;
}
/* The varieties most recently served, at most SUGGEST of them */
const quickList = prods =>
  prods.length
    ? `<span class="label">Schon mal gehabt</span><ul class="plist">${serveRows(prods.slice(0, SUGGEST))}</ul>`
    : '';
/* Search in the feeding sheet: the hits take the place of the suggestions, at most HITS. Only this one box is
   rewritten, so the search field neither moves nor loses the focus; the distances above it hang on .serve. */
export function renderServeHits(text) {
  const box = $('#serveList');
  if (!box) return;
  const words = norm(text).split(' ').filter(Boolean);
  box.innerHTML = words.length ? hitList(text.trim(), words) : quickList(quickProducts());
}
function hitList(text, words) {
  const hits = quickProducts()
    .filter(p => words.every(w => norm(p.brand + ' ' + p.variety).includes(w)))
    .slice(0, HITS);
  if (hits.length) return `<ul class="plist">${serveRows(hits)}</ul>`;
  const q = esc(text);
  return `<p class="empty"><span>Keine Sorte passt zu „${q}“.</span></p>
    <button class="btn plain" data-action="new-product" data-v="${q}">„${q}“ als neues Futter eintippen</button>`;
}

/* Food sheet, section „Kaufen“: the manual setting (Automatisch, Immer kaufen, Nicht kaufen), below it the computed
   verdict with a short reason, and one line per pet where there are several */
const KAUFEN = [
  ['auto', 'Automatisch'],
  ['immer', 'Immer kaufen'],
  ['nicht', 'Nicht kaufen'],
];
const verdictPetRow = (pet, x) =>
  `<div class="verdict-pet">${avatar(pet, 'xs')}<span class="t-main"><b>${esc(pet.name)}: ${VERDICTS[x.verdict]}</b>
    <small>${esc(reasonOf(x))}</small></span></div>`;
function kaufenHTML(e) {
  const pets = db.pets.length > 1 ? db.pets.filter(pet => e.pets[pet.id]) : [];
  return `<span class="label">Kaufen</span>
    ${segmented('buy', KAUFEN, e.kaufen || 'auto')}
    <div class="verdict"><p><b>${esc(verdictLabel(e.house))}</b>${pets.length ? '' : `<span>${esc(reasonOf(e.house))}</span>`}</p>
    ${pets.map(pet => verdictPetRow(pet, e.pets[pet.id])).join('')}</div>`;
}

/* The pieces of the food sheet, each one a row or a block of its own */
const productCard = (p, served) =>
  `<div class="prod-card">${photoThumb(null, p, 'lg')}<span class="t-main"><b>${esc(p.brand || p.variety)}</b>
    <small>${esc([p.type, `${served}× serviert`].filter(Boolean).join(', '))}</small></span>
    <button class="icon-btn" data-action="rename-product" aria-label="Umbenennen">${icon('pencil')}</button></div>`;
/* One counter per level of the variety's scale, levels from another scale that still occur after them */
const countsRow = (levels, counts) =>
  `<div class="counts">${levels
    .map(
      r =>
        `<div class="cnt ${rateCls(r)}">${icon('r_' + r)}<b>${counts[r] || 0}</b>
          <span>${RATINGS[r].lines.join('<br>')}</span></div>`,
    )
    .join('')}</div>`;
const petBar = (pet, x) =>
  `<div class="pp ${scoreCls(x.score)}">${avatar(pet, 'sm')}<span class="pp-name">${esc(pet.name)}</span>
    <span class="bar"><i style="--w:${Math.max(4, x.pct)}%"></i></span><b>${x.pct} %</b></div>`;
const mealRow = s =>
  `<li><button class="row" data-action="open-serving" data-id="${s.id}"><span class="t-main">
    <b>${esc(cap(when(s.servedAt)))}</b><small>${esc(mealMeta(s))}</small></span>${resultBadges(s)}</button></li>`;
const mealMeta = s =>
  [petNames(Object.keys(s.pets).filter(getPet)), s.note ? '„' + s.note + '“' : ''].filter(Boolean).join(', ');
const barcodeRow = c =>
  `<li class="list-row"><span class="t-main"><b class="num">${esc(c)}</b></span>
    <button class="icon-btn" data-action="remove-code" data-code="${esc(c)}" aria-label="Barcode ${esc(c)} entfernen">
    ${icon('close')}</button></li>`;
const MEALS_SHOWN = 12; // the rest of the history is in „Verlauf“

function viewProduct() {
  const p = getProduct(sheet.id);
  if (!p)
    return `<div class="sh-head"><h2>Futter</h2>${closeBtn}</div><p class="empty">Dieses Futter gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const ss = db.servings.filter(s => s.productId === p.id),
    e = sortOf(p.id),
    counts = e.house.counts;
  const scale = scaleOf(p),
    levels = [...scale, ...Object.keys(counts).filter(r => !scale.includes(r))]; // other levels that occur come after them
  const perPet =
    db.pets.length > 1 ? db.pets.map(pet => (e.pets[pet.id] ? petBar(pet, e.pets[pet.id]) : '')).join('') : '';
  const codes = Object.keys(p.codes || {}).sort();
  const hist = ss.slice(0, MEALS_SHOWN).map(mealRow).join('');
  return `<div class="sh-head"><h2>${esc(pname(p))}</h2>${closeBtn}</div>
    ${productCard(p, ss.length)}
    ${textureChips(p, p.texture === 'block' ? '<p class="note">Vor dem Servieren zerkleinern</p>' : '')}
    ${e.house.n ? countsRow(levels, counts) : `<p class="empty">Noch nicht bewertet.</p>`}
    ${kaufenHTML(e)}
    ${perPet ? `<span class="label">Pro Tier</span>${perPet}` : ''}
    ${hist ? `<span class="label">Verlauf</span><ul class="plist">${hist}</ul>` : ''}
    ${codes.length ? `<span class="label">Barcodes</span><ul class="plist">${codes.map(barcodeRow).join('')}</ul>` : ''}
    <div class="mt btn-col"><button class="btn primary" data-action="serve" data-id="${p.id}">${icon('check')}Heute servieren</button>
    ${armBtn('delete-product', 'Futter löschen', 'Nochmal tippen: Futter und Einträge löschen')}</div>`;
}

/* „Verlauf“: a page of two cards. „Die letzten 30 Tage“ holds the ring, the figures and the best and weakest
   variety; the card under it holds the calendar and every meal there has ever been.
   sheet.at: the id of the day it opens at, coming from a calendar */
export const reportState = at => ({kind: 'report', at});

const REPORT_DAYS = 30; // what is evaluated; the list itself always shows the whole history

/* The ring: how many of the ratings in the span were good ones (from 70 points, as everywhere else). 104px
   across, the arc a dashed circle whose gap shrinks to the share. Under MIN_RATED ratings it shows the bare
   track and says so instead of a number. */
const RING = 104,
  RING_STROKE = 10;
const RING_R = (RING - RING_STROKE) / 2;
const RING_LEN = 2 * Math.PI * RING_R;
function ring(m) {
  const enough = m.liked.rated >= MIN_RATED;
  const pct = m.liked.pct;
  const label = enough
    ? `${pct} Prozent der bewerteten Mahlzeiten kamen gut an.`
    : `Noch zu wenig bewertet: ${m.liked.rated} von ${MIN_RATED} Bewertungen.`;
  const arc = enough
    ? `<circle class="ring-fill ${scoreCls(pct)}" cx="${RING / 2}" cy="${RING / 2}" r="${RING_R}"
        style="--len:${RING_LEN.toFixed(1)};--part:${((RING_LEN * pct) / 100).toFixed(1)}"/>`
    : '';
  return `<div class="ring" role="img" aria-label="${esc(label)}">
    <svg viewBox="0 0 ${RING} ${RING}" aria-hidden="true">
      <circle class="ring-track" cx="${RING / 2}" cy="${RING / 2}" r="${RING_R}"/>${arc}</svg>
    <span class="ring-mid"><b class="pct">${enough ? `${pct}<small>%</small>` : '–'}</b>
      <span>${enough ? 'kam gut an' : 'Noch zu wenig bewertet'}</span></span></div>`;
}

/* Beside the ring: meals, varieties and the days fed on, each with a small icon */
const figRow = (ic, text) => `<li>${icon(ic)}<span>${text}</span></li>`;
const figures = m =>
  `<ul class="figs">${figRow('bowl', `<b>${m.count.meals}</b> ${m.count.meals === 1 ? 'Mahlzeit' : 'Mahlzeiten'}`)}
    ${figRow('layers', `<b>${m.count.sorts}</b> ${m.count.sorts === 1 ? 'Sorte' : 'Sorten'}`)}
    ${figRow('calendar', `an <b>${m.count.days}</b> von ${m.count.span} ${m.count.span === 1 ? 'Tag' : 'Tagen'}`)}</ul>`;

/* Under the figures: the variety that goes down best, named only from GOOD points on, and the weakest one. The
   percentage is the plain figure here, so that the only colour in the card is the rating's icon. */
const rankRow = (x, r, text) =>
  `<div class="rank ${rateCls(r)}">${icon('r_' + r)}<span class="t-main"><b>${esc(pname(x.product))}</b><small>${esc(text)}</small></span><b class="share">${x.pct} %</b></div>`;
function glance(m) {
  const best = m.best && m.best.pct >= GOOD ? rankRow(m.best, 'top', 'kommt am besten an') : '';
  const worst = m.worst ? rankRow(m.worst, 'schlecht', 'bleibt am ehesten übrig') : '';
  return `<div class="glance">${ring(m)}${figures(m)}</div>
    ${best || worst ? `<div class="tops">${best}${worst}</div>` : ''}`;
}

function viewReport() {
  const m = reportModel(REPORT_DAYS),
    all = servingsInFilter();
  const who = db.pets.length > 1 ? ` für ${m.pet ? esc(getPet(m.pet).name) : 'alle Tiere'}` : '';
  histDays = dayGroups(all);
  const upto = Math.max(HIST_PAGE, sheet.at ? histDays.findIndex(g => 'd-' + g.key === sheet.at) + 1 : 0); // the day it opens at has to be there
  return `${head('Verlauf' + who)}
    <section class="card"><h2>Die letzten ${REPORT_DAYS} Tage</h2>${glance(m)}</section>
    <section class="card days">${calendarHTML(all.filter(s => s.servedAt >= addDays(weekStart(Date.now()), -7)))}
    ${
      histDays.length
        ? `<div id="histBox">${histHTML(m, 0, upto)}</div>`
        : `<p class="empty"><span>Noch nichts serviert.</span></p>`
    }</section>`;
}
/* A day tapped in the calendar of this page: the list grows until that day is drawn and a page of days under it
   as well, because only then can the day reach the top of the screen. */
export function jumpToDay(key) {
  const at = histDays.findIndex(g => g.key === key);
  if (at < 0) return;
  const box = $('#histBox');
  if (box) {
    const m = reportModel(REPORT_DAYS);
    while (box.children.length < histDays.length && box.children.length <= at + HIST_PAGE)
      box.insertAdjacentHTML('beforeend', histHTML(m, box.children.length, box.children.length + HIST_PAGE));
    watchDays();
  }
  $('#d-' + key, sheetBody)?.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start'});
}

/* The history grows as you scroll instead of laying out years of meals in one go: HIST_PAGE days at a time,
   appended below. How many are already there is what the box says, so a redraw cannot get it out of step. */
const HIST_PAGE = 10;
let histDays = [];
const histHTML = (m, from, to) =>
  dayBlocks(histDays.slice(from, to), {multiHouse: db.pets.length > 1 && !m.pet, anchors: true});
/* Appends pages as long as less than a screen is left below: while scrolling, and once after drawing, in the frame
   after it so that the page is on screen first. */
function growHistory() {
  const box = $('#histBox');
  if (!box || sheet?.kind !== 'report' || box.children.length >= histDays.length) return;
  const m = reportModel(REPORT_DAYS);
  while (
    box.children.length < histDays.length &&
    sheetBody.scrollHeight - sheetBody.scrollTop - sheetBody.clientHeight < 800
  )
    box.insertAdjacentHTML('beforeend', histHTML(m, box.children.length, box.children.length + HIST_PAGE));
  watchDays();
}
sheetBody.addEventListener('scroll', growHistory, {passive: true});

/* The day line sticks under the bar while its meals scroll past, and carries the edge's line only while it does.
   CSS has no way to tell whether an element is stuck, so the observer works it out: a line that no longer sits
   fully inside the box below the bar, and pokes out at its top rather than its bottom, is parked there. The 0
   threshold also catches a jump straight into that place. Watched again whenever the history grows. */
let stuck = null;
function watchDays() {
  const top = parseFloat(getComputedStyle(sheetBody).getPropertyValue('--stick')) || 0; // resolved while hidden too
  stuck?.disconnect();
  stuck = new IntersectionObserver(
    entries =>
      entries.forEach(e =>
        e.target.classList.toggle('stuck', e.intersectionRatio < 1 && e.boundingClientRect.top < e.rootBounds.top),
      ),
    {root: sheetBody, rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: [0, 1]},
  );
  for (const line of sheetBody.querySelectorAll('.tl-date')) stuck.observe(line);
}

/* Cropping the profile picture: a square stage with a round cut-out like the profile picture, and a slider to zoom.
   mountCrop() hangs the image in after drawing. */
const viewCrop = () => `${head('Foto zuschneiden', 'crop-cancel')}
    <div class="crop" id="cropStage" aria-label="Ausschnitt verschieben"></div>
    <label class="label" for="f-zoom">Zoom</label>
    <input id="f-zoom" class="zoom" type="range" min="1" max="${ZOOM_MAX}" step="0.01" value="1">
    <div class="btn-row"><button class="btn soft" data-action="crop-cancel">Abbrechen</button><button class="btn primary" data-action="crop-apply">${icon('check')}Übernehmen</button></div>`;

function viewPet() {
  if (sheet.step === 'crop') return viewCrop();
  const s = sheet,
    editing = !!s.id;
  const title = editing ? 'Tier bearbeiten' : db.pets.length ? 'Neues Tier' : 'Wer wird gefüttert?';
  const av = avatar({photo: s.photo, species: s.species}, 'xl');
  return `${head(title)}
    <label class="pet-photo" for="petPhotoInput" aria-label="Foto wählen">${av}<span class="cam-badge">${icon('camera')}</span></label>
    <label class="photo-hint" for="petPhotoInput">${s.photo ? 'Foto ändern' : 'Foto hinzufügen'}</label>
    <label class="label" for="f-name">Name</label>
    <input id="f-name" class="field" data-field="name" value="${esc(s.name)}" placeholder="z. B. Minka" autocomplete="off" autocapitalize="words" enterkeyhint="done">
    <span class="label">Tierart</span>
    <div class="chips">${SPECIES.map(x => `<button class="chip" aria-pressed="${s.species === x.k}" data-action="set-species" data-v="${x.k}">${icon(x.i)}${x.k}</button>`).join('')}</div>
    <div class="mt btn-col"><button class="btn primary" data-action="save-pet">${icon('check')}${editing ? 'Speichern' : 'Tier anlegen'}</button>
    ${editing ? armBtn('delete-pet', 'Tier entfernen', 'Nochmal tippen: Tier und Bewertungen löschen') : ''}</div>`;
}

const VIEWS = {
  serving: viewServing,
  feed: viewFeed,
  new: viewName,
  product: viewProduct,
  pet: viewPet,
  // The pet editor is a page of the settings when it is reached from there, and the same view serves it
  settings: () => (sheet.page === 'pet' ? viewPet() : viewSettings()),
  report: viewReport,
};
/* An unchanged view is left alone: a change from the server redraws every open sheet, and rewriting it would throw
   away the decoded photos, the scroll position and the focus for nothing. Empty body: freshly opened, always draw.
   The boxes the views fill afterwards are drawn every time, because their contents are not part of this comparison. */
let drawn = '';
setSheetView(state => {
  const html = VIEWS[state.kind](),
    fresh = html !== drawn || !sheetBody.firstChild; // no children: closed in between
  if (fresh) {
    drawn = html;
    sheetBody.innerHTML = html;
    if (state.step === 'crop') mountCrop($('#cropStage'), state.cropImg, state.crop, $('#f-zoom')); // hangs listeners on: exactly once per drawing
  }
  if (state.kind === 'settings') paintHouse(fresh);
  if (state.step === 'name' || state.kind === 'new') renderSuggestions();
  if (state.kind === 'report') {
    watchDays();
    requestAnimationFrame(growHistory);
  }
  if (state.at) {
    const at = state.at;
    state.at = null;
    // Only inside the page, which holds the day anchors
    requestAnimationFrame(() => $('#' + at, sheetBody)?.scrollIntoView({block: 'start'}));
  } // opened at a given day
});
