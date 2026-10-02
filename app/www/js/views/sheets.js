// Sheet and page contents; the settings page is in views/settings.js
import {$, reduceMotion} from '../dom.js';
import {slideHeight} from '../motion.js';
import {andList, cap, esc, norm} from '../text.js';
import {addDays, dayKey, toLocalInput, weekStart, when} from '../dates.js';
import {icon} from '../icons.js';
import {OBSERVATIONS, observationOf, RATINGS, scaleOf, SPECIES, TEXTURES, TYPES, typeOf} from '../config.js';
import {db} from '../store.js';
import {
  diary,
  getObservation,
  getPet,
  getProduct,
  getServing,
  observationsInFilter,
  habitsModel,
  model,
  profileModel,
  petNames,
  pname,
  productsByCode,
  quickProducts,
  servingsInFilter,
  sortOf,
  withLast,
} from '../derive.js';
import {mealsBefore, observedAfter, rateCls, ratingsIn, shopGroups, VERDICTS} from '../smart.js';
import {hasLine} from '../ocr.js';
import {memLines, photoByServer, READ_PATIENCE, readingSince} from '../recognize.js';
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
  deleteMealBtn,
  evidenceOf,
  forWhom,
  head,
  nameBlock,
  photoThumb,
  rateSlider,
  resultBadges,
  scaleEnds,
  segmented,
  shopRow,
  lower,
  since,
  strip,
  whoObserved,
  habitRow,
  likesList,
  toldList,
  thumbOf,
  verdictLabel,
} from './parts.js';
import {paintHouse, viewSettings} from './settings.js';
import {viewEvaluation} from './evaluation.js';

const servingCard = (s, p) => {
  const main = `<span class="t-main">${nameBlock(s, p, true)}</span><span class="edit">${icon('pencil')}</span>`;
  // with the full photo on this phone, the thumbnail opens it
  return hasPhoto(s, p)
    ? `<div class="box prod-card">${photoThumb(s, p, 'xl')}<button class="prod-edit" data-action="edit-name" aria-label="Futter ändern">${main}</button></div>`
    : `<button class="box prod-card" data-action="edit-name" aria-label="Futter ändern">${thumbOf(s, p, 'xl')}${main}</button>`;
};
const photoLink = p =>
  `<button class="link rephoto" data-action="product-photo" data-id="${p.id}">${icon('camera')}${hasPhoto(null, p) || p.thumb ? 'Foto ändern' : 'Foto hinzufügen'}</button>`;
const petRateRow = (s, pid, multi) =>
  `<div class="pet-rate">${multi ? `<div class="pet-label">${avatar(getPet(pid), 'xs')}${esc(getPet(pid).name)}</div>` : ''}
    ${rateSlider(s, pid)}</div>`;
const servedForChips = s =>
  `<span class="label">Serviert für</span><div class="chips">${db.pets
    .map(
      pet =>
        `<button class="chip" aria-pressed="${!!s.pets[pet.id]}" data-action="toggle-serving-pet" data-id="${pet.id}">
          ${avatar(pet, 'xs')}${esc(pet.name)}</button>`,
    )
    .join('')}</div>`;

function viewServing() {
  const s = getServing(sheet.id);
  if (!s)
    return `<div class="sh-head"><h2>Eintrag</h2>${closeBtn}</div><p class="hint empty">Diesen Eintrag gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const p = getProduct(s.productId);
  const ids = Object.keys(s.pets).filter(id => getPet(id));
  const multi = db.pets.length > 1;
  return `<div class="sh-head"><h2>Wie war’s?</h2>${closeBtn}</div>
    ${servingCard(s, p)}${p ? photoLink(p) : ''}
    ${ids.map(pid => petRateRow(s, pid, multi)).join('')}
    ${multi ? servedForChips(s) : ''}
    <label class="label served" for="f-time"><span>Serviert</span>${s.by ? `<span class="hint">von ${esc(s.by)}</span>` : ''}</label>
    <span class="pick"><input id="f-time" class="field" type="datetime-local" data-time="${s.id}" value="${toLocalInput(s.servedAt)}" max="${toLocalInput(Date.now())}">${icon('chevron')}</span>
    <label class="label" for="f-note">Notiz</label>
    <input id="f-note" class="field" data-note="${s.id}" value="${esc(s.note || '')}" placeholder="Optional, z. B. neue Packung" autocomplete="off">
    <div class="mt">${deleteMealBtn(s.id)}</div>`;
}

function viewObservation() {
  const o = getObservation(sheet.id);
  if (!o)
    return `<div class="sh-head"><h2>Beobachtung</h2>${closeBtn}</div><p class="hint empty">Diesen Eintrag gibt es nicht mehr.</p>`;
  const kind = observationOf(o.kind),
    ids = Object.keys(o.pets).filter(id => getPet(id)),
    before = mealsBefore(db, o).map(s => getProduct(s.productId)),
    names = [...new Set(before.filter(Boolean).map(p => `<b>${esc(pname(p))}</b>`))],
    weighed =
      kind.about !== 'meal'
        ? ''
        : names.length
          ? `<p class="hint mt-s">${cap(kind.window)} davor gab es ${andList(names)}.</p>`
          : `<p class="hint mt-s">${cap(kind.window)} davor ist keine Mahlzeit eingetragen.</p>`;
  return `<div class="sh-head"><h2>${esc(kind.label)}</h2>${closeBtn}</div>
    <span class="label">Beobachtung</span>
    <div class="chips">${Object.entries(OBSERVATIONS)
      .map(
        ([k, x]) =>
          `<button class="chip" aria-pressed="${o.kind === k}" data-action="set-observation-kind" data-v="${k}">${icon(x.icon)}${x.chip}</button>`,
      )
      .join('')}</div>${weighed}
    ${
      db.pets.length > 1
        ? `<span class="label">Bemerkt bei</span><div class="chips">${db.pets
            .map(
              pet =>
                `<button class="chip" aria-pressed="${!!o.pets[pet.id]}" data-action="toggle-observation-pet" data-id="${pet.id}">${avatar(pet, 'xs')}${esc(pet.name)}</button>`,
            )
            .join(
              '',
            )}</div>${ids.length > 1 ? `<p class="hint mt-s">Bei ${esc(whoObserved(ids))}: offen, wer es war.</p>` : ''}`
        : ''
    }
    <label class="label served" for="f-obs-time"><span>Notiert</span>${o.by ? `<span class="hint">von ${esc(o.by)}</span>` : ''}</label>
    <span class="pick"><input id="f-obs-time" class="field" type="datetime-local" data-obs-time="${o.id}" value="${toLocalInput(o.at)}" max="${toLocalInput(Date.now())}">${icon('chevron')}</span>
    <div class="mt"><button class="btn quiet" data-action="delete-observation" data-id="${o.id}">${icon('trash')}Eintrag löschen</button></div>`;
}

function viewName() {
  const s = sheet;
  const serving = s.kind === 'serving' ? getServing(s.id) : null,
    product = s.kind === 'product' ? getProduct(s.id) : getProduct(serving?.productId);
  const title =
    s.kind === 'new'
      ? 'Neues Futter'
      : s.kind === 'product'
        ? 'Futter umbenennen'
        : product
          ? 'Futter ändern'
          : 'Futter benennen';
  const photo = product?.thumb || serving?.photo || serving?.thumb,
    large = hasPhoto(serving, product),
    reading = serving?.status === 'reading',
    // skeleton fields while reading, until READ_PATIENCE runs out
    patient = reading && Date.now() - (readingSince.get(serving.id) || 0) < READ_PATIENCE;
  let note = '';
  const retry = label =>
    serving.photo && photoByServer() ? `<button class="link" data-action="retry">${label}</button>` : '';
  if (reading)
    note = `<p class="hint note"><span class="spin"></span>Packung wird ${patient ? '' : 'noch '}gelesen …</p>`;
  else if (serving?.status === 'recognizing')
    note = `<p class="hint note"><span class="spin"></span>Sorte wird erkannt …</p>`;
  else if (serving?.status === 'waiting')
    note = `<p class="hint note">${esc(serving.error || 'Wird erkannt, sobald der Server erreichbar ist.')} ${retry('Jetzt versuchen')}</p>`;
  else if (serving?.status === 'failed')
    note = `<p class="hint note warn">${esc(serving.error || 'Nicht erkannt.')} ${retry('Nochmal versuchen')}</p>`;
  const top = `<div class="sh-head"><h2>${title}</h2>${closeBtn}</div>
    ${
      photo
        ? large
          ? `<button class="photo-btn" data-action="view-photo" data-s="${serving?.id || ''}" data-p="${product?.id || ''}" aria-label="Foto vergrößern"><img class="name-photo" src="${esc(photo)}" alt="Foto der Packung"></button>`
          : `<img class="name-photo" src="${esc(photo)}" alt="Foto der Packung">`
        : ''
    }${note}`;
  if (patient) return top + fieldSkeleton + fieldSkeleton; // same height as the fields, so nothing jumps
  const read = [serving?.guess?.brand, serving?.guess?.variety].filter(Boolean),
    said = read.length
      ? `<p class="say read-note">Gelesen: ${read.map(x => `<b>${esc(x)}</b>`).join(', ')}. Passt das?</p>`
      : serving?.status === 'noserver' && !product
        ? `<p class="hint read-note">Auf dem Foto war nichts zu lesen. Tipp Marke und Sorte ein oder mach ein neues Foto.</p>`
        : '',
    again =
      serving && !product && photo
        ? `<button class="link rephoto" data-action="rephoto">${icon('camera')}Neues Foto</button>`
        : product
          ? photoLink(product)
          : '';
  return `${top}${said}${again}
    <div class="suggest" id="suggest"></div>
    <label class="label" for="f-brand">Marke</label>
    <input id="f-brand" class="field" data-field="brand" value="${esc(s.brand)}" placeholder="z. B. Sheba" autocomplete="off" autocapitalize="words" enterkeyhint="next">
    <div class="suggest" id="brandChips"></div>
    <label class="label" for="f-variety">Sorte</label>
    <input id="f-variety" class="field" data-field="variety" value="${esc(s.variety)}" placeholder="z. B. Lachs in Soße" autocomplete="off" enterkeyhint="done">
    <div class="suggest" id="lineChips"></div>
    <span class="label">Art</span>
    <div class="chips">${TYPES.map(t => `<button class="chip" aria-pressed="${s.type === t}" data-action="set-type" data-v="${t}">${t}</button>`).join('')}</div>
    ${textureChips(s)}
    <div class="mt btn-col"><button class="btn primary" data-action="save-name">${icon('check')}${s.kind === 'new' ? 'Servieren' : read.length ? 'Passt so' : 'Speichern'}</button>${serving && !product ? deleteMealBtn(serving.id) : ''}</div>`;
}
const fieldSkeleton = `<span class="label"><span class="skel skel-text"></span></span><span class="skel skel-field"></span>`;
// x: a variety, or the sheet itself while naming
function textureChips(x, note = '') {
  const t = TEXTURES[typeOf(x)];
  return t
    ? `<div class="tex"><span class="label">${t.title}</span><div class="chips">${t.items.map(([k, label]) => `<button class="chip" aria-pressed="${x.texture === k}" data-action="set-texture" data-v="${k}">${label}</button>`).join('')}</div>${note}</div>`
    : '';
}
const chipsOf = (field, list, value) =>
  `<div class="chips">${list
    .map(
      l =>
        `<button class="chip" aria-pressed="${hasLine(value, l)}" data-action="pack-line" data-field="${field}" data-v="${esc(l)}" aria-label="${field === 'brand' ? 'Marke' : 'Sorte'}: ${esc(l)}">${esc(l)}</button>`,
    )
    .join('')}</div>`;
// each box is drawn on its own, so the fields keep their focus
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
    hits = quickProducts(4).map(x => x.product);
    title = 'Schon mal gehabt?';
  }
  box.innerHTML =
    (hits.length ? `<span class="label">${title}</span>` : '') +
    hits
      .map(
        p =>
          `<button class="box sugg" data-action="use-product" data-id="${p.id}">${thumbOf(null, p, 'm')}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(p.brand)}</small></span>${icon('chevron')}</button>`,
      )
      .join('');
  const read = (serving && memLines.get(serving.id)) || {lines: [], brands: []},
    brands = $('#brandChips'),
    lines = $('#lineChips');
  if (brands) brands.innerHTML = read.brands.length ? chipsOf('brand', read.brands, sheet.brand) : '';
  if (lines)
    lines.innerHTML = read.lines.length
      ? `<span class="label">Auf der Packung gelesen</span>${chipsOf('variety', read.lines, sheet.variety)}`
      : '';
}

// few suggestions, more would only distract from the two buttons
const SUGGEST = 3,
  HITS = 8;
const CTA = {
  barcode: `<button class="box cta primary" data-action="scan">${icon('barcode')}<span><b>Barcode</b><small>scannen</small></span></button>`,
  foto: `<button class="box cta soft" data-action="photo">${icon('camera')}<span><b>Foto</b><small>aufnehmen</small></span></button>`,
};
// entries: [{product, at}]
function serveRows(entries, code = '') {
  const now = Date.now(),
    m = model();
  return entries
    .map(({product: p, at}) => {
      const meta = [p.variety ? p.brand : '', at ? since(at, now) : 'noch nie serviert'].filter(Boolean).join(', ');
      return `<li><button class="row" data-action="serve" data-id="${p.id}"${code ? ` data-code="${esc(code)}"` : ''}>
        ${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(meta)}</small></span>${strip(ratingsIn(m, [p.id]))}</button></li>`;
    })
    .join('');
}
function viewFeed() {
  const pick = sheet.step === 'pick' ? productsByCode(sheet.code) : [];
  if (pick.length)
    return `<div class="sh-head"><h2>Welche Sorte?</h2>${closeBtn}</div>
    <p class="hint">Dieser Barcode gehört zu mehreren Sorten.</p>
    <ul class="list plist">${serveRows(withLast(pick), sheet.code)}</ul>`;
  const prods = quickProducts();
  return `<div class="sh-head"><h2>Was gibt’s heute?</h2>${closeBtn}</div>
    <div class="cta-row">${CTA.barcode}${CTA.foto}</div>
    ${sheet.busy ? `<p class="hint note" role="status"><span class="spin"></span>${esc(sheet.busy)}</p>` : ''}
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
const quickList = entries =>
  entries.length
    ? `<span class="label">Schon mal gehabt</span><ul class="list plist">${serveRows(entries.slice(0, SUGGEST))}</ul>`
    : '';
// rewrites only the list box, so the search field keeps its place and focus
export function renderServeHits(text) {
  const box = $('#serveList');
  if (!box) return;
  const words = norm(text).split(' ').filter(Boolean);
  box.innerHTML = words.length ? hitList(text.trim(), words) : quickList(quickProducts());
}
function hitList(text, words) {
  const hits = quickProducts()
    .filter(({product: p}) => words.every(w => norm(p.brand + ' ' + p.variety).includes(w)))
    .slice(0, HITS);
  if (hits.length) return `<ul class="list plist">${serveRows(hits)}</ul>`;
  const q = esc(text);
  return `<p class="hint empty"><span>Keine Sorte passt zu „${q}“.</span></p>
    <button class="btn plain" data-action="new-product" data-v="${q}">„${q}“ als neues Futter eintippen</button>`;
}

const KAUFEN = [
  ['auto', 'Automatisch'],
  ['immer', 'Immer kaufen'],
  ['nicht', 'Nicht kaufen'],
];
const verdictPetRow = (pet, x) =>
  `<div class="row verdict-pet">${avatar(pet, 'xs')}<span class="t-main"><b>${esc(pet.name)}: ${VERDICTS[x.verdict]}</b>
    <small>${esc(evidenceOf(x))}</small></span></div>`;
function kaufenHTML(e) {
  const pets = db.pets.length > 1 ? db.pets.filter(pet => e.pets[pet.id]) : [];
  return `<span class="label">Kaufen</span>
    ${segmented('buy', KAUFEN, e.kaufen || 'auto')}
    <div class="verdict"><p><b>${esc(verdictLabel(e.house))}</b>${pets.length ? '' : `<span>${esc(evidenceOf(e.house))}</span>`}</p>
    ${pets.map(pet => verdictPetRow(pet, e.pets[pet.id])).join('')}</div>`;
}

const productCard = (p, served) =>
  `<div class="box prod-card">${photoThumb(null, p, 'xl')}<span class="t-main"><b>${esc(p.brand || p.variety)}</b>
    <small>${esc([p.type, `${served}× serviert`].filter(Boolean).join(', '))}</small></span>
    <button class="icon-btn" data-action="rename-product" aria-label="Umbenennen">${icon('pencil')}</button></div>`;
const countsRow = (levels, counts) =>
  `<div class="tally"><div class="counts">${levels
    .map(
      r =>
        `<span class="cnt ${rateCls(r)}" role="img" aria-label="${RATINGS[r].label}: ${counts[r] || 0}">${icon('r_' + r)}<b>${counts[r] || 0}</b></span>`,
    )
    .join('')}</div>${scaleEnds(levels)}</div>`;
const mealRow = s =>
  `<li><button class="row" data-action="open-serving" data-id="${s.id}"><span class="t-main">
    <b>${esc(cap(when(s.servedAt)))}</b><small>${esc(mealMeta(s))}</small></span>${resultBadges(s)}</button></li>`;
const mealMeta = s =>
  [petNames(Object.keys(s.pets).filter(getPet)), s.note ? '„' + s.note + '“' : ''].filter(Boolean).join(', ');
const barcodeRow = c =>
  `<li class="row"><span class="t-main"><b class="num">${esc(c)}</b></span>
    <button class="icon-btn" data-action="remove-code" data-code="${esc(c)}" aria-label="Barcode ${esc(c)} entfernen">
    ${icon('close')}</button></li>`;
const MEALS_SHOWN = 12; // the rest is on the history page
// counts only; whether they stand out is for the evaluation
function noticed(p) {
  const after = observedAfter(
    db,
    db.pets.map(x => x.id),
    Date.now(),
    p.id,
  );
  return after.length
    ? `<p class="hint">Danach notiert: ${after.map(x => `${lower(observationOf(x.kind).label)} nach ${x.hit} von ${x.n} Mahlzeiten`).join(', ')}.</p>`
    : '';
}

function viewProduct() {
  const p = getProduct(sheet.id);
  if (!p)
    return `<div class="sh-head"><h2>Futter</h2>${closeBtn}</div><p class="hint empty">Dieses Futter gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const ss = db.servings.filter(s => s.productId === p.id),
    e = sortOf(p.id),
    counts = e.house.counts;
  const scale = scaleOf(p),
    levels = [...scale, ...Object.keys(counts).filter(r => !scale.includes(r))]; // levels from another scale that still occur
  const codes = Object.keys(p.codes || {}).sort();
  const hist = ss.slice(0, MEALS_SHOWN).map(mealRow).join('');
  return `<div class="sh-head"><h2>${esc(pname(p))}</h2>${closeBtn}</div>
    ${productCard(p, ss.length)}
    ${photoLink(p)}
    ${textureChips(p, p.texture === 'block' ? '<p class="hint note">Vor dem Servieren zerkleinern</p>' : '')}
    ${strip(ratingsIn(model(), [p.id]))}
    ${e.house.n ? countsRow(levels, counts) : `<p class="hint empty">Noch nicht bewertet.</p>`}
    ${kaufenHTML(e)}
    ${noticed(p)}
    ${hist ? `<span class="label">Verlauf</span><ul class="list plist">${hist}</ul>` : ''}
    ${codes.length ? `<span class="label">Barcodes</span><ul class="list plist">${codes.map(barcodeRow).join('')}</ul>` : ''}
    <div class="mt btn-col"><button class="btn primary" data-action="serve" data-id="${p.id}">${icon('check')}Heute servieren</button>
    ${armBtn('delete-product', 'Futter löschen', 'Nochmal tippen: Futter und Einträge löschen')}</div>`;
}

// at: id of the day to open at
export const reportState = at => ({kind: 'report', at});

const shopList = (m, list) =>
  list.length ? `<ul class="list shop">${list.map(e => shopRow(m, e)).join('')}</ul>` : '';
const unclear = g => [...g.geht, ...g.neu];
const FOLDS = {
  nicht: {label: 'Anzeigen', inner: () => shopList(model(), shopGroups(model()).nicht)},
  unklar: {label: 'Anzeigen', inner: () => shopList(model(), unclear(shopGroups(model())))},
};
function foldBox(key) {
  const inner = FOLDS[key].inner(),
    open = !!sheet.open?.[key];
  if (!inner) return '';
  return `<div class="card-body fold" id="fold-${key}">${open ? inner : ''}</div>
    <button class="card-btn" data-action="fold" data-v="${key}" aria-expanded="${open}" aria-controls="fold-${key}">${open ? 'Weniger' : FOLDS[key].label}</button>`;
}

function viewReport() {
  const pet = model().pet,
    all = servingsInFilter();
  histDays = dayGroups(diary(all, observationsInFilter()));
  // a redraw keeps the days already shown, and the day it opens at must be among them
  const shown = $('#histBox', sheetBody)?.children.length || 0,
    upto = Math.max(HIST_PAGE, shown, sheet.at ? histDays.findIndex(g => 'd-' + g.key === sheet.at) + 1 : 0);
  return `${head('Verlauf' + forWhom(pet))}
    <section class="days">${calendarHTML(all.filter(s => s.servedAt >= addDays(weekStart(Date.now()), -7)))}
    ${
      histDays.length
        ? `<div id="histBox">${histHTML(pet, 0, upto)}</div>`
        : `<p class="hint empty"><span>Noch nichts serviert.</span></p>`
    }</section>`;
}
// swaps only the fold, so the rest of the page and the button stay put
export function foldPart(key) {
  const f = FOLDS[key],
    body = $('#fold-' + key, sheetBody),
    btn = $(`[data-action=fold][data-v="${key}"]`, sheetBody);
  if (!f || !body || !btn) return;
  const open = !sheet.open?.[key],
    h0 = body.offsetHeight;
  sheet.open = {...sheet.open, [key]: open};
  body.innerHTML = open ? f.inner() : '';
  btn.textContent = open ? 'Weniger' : f.label;
  btn.setAttribute('aria-expanded', String(open));
  slideHeight(body, h0);
  drawn.set(sheetBody, VIEWS[sheet.kind]()); // so the next redraw sees nothing new
}
const sorts = (n, one, many) => (n === 1 ? `1 Sorte ${one}` : `${n} Sorten ${many}`);
function viewShop() {
  const m = model(),
    g = shopGroups(m),
    types = TYPES.map(t => [t, g.nachkaufen.filter(e => typeOf(e.product) === t)]).filter(([, l]) => l.length),
    open = unclear(g).length;
  const buy = types.length
    ? types.map(([t, l]) => `<h3 class="label grp">${t}</h3>${shopList(m, l)}`).join('') +
      `<div class="btn-row"><button class="btn primary" data-action="share-list">${icon('share')}Als Liste teilen</button></div>`
    : '<p class="hint card-line">Noch nichts zum Nachkaufen.</p>';
  return `${head('Einkaufen' + forWhom(m.pet))}
    <section class="card"><h2>Nachkaufen</h2>${buy}</section>${
      g.nicht.length
        ? `<section class="card"><h2>Lieber nicht</h2><p class="say card-line">${sorts(g.nicht.length, 'bleibt', 'bleiben')} meist stehen.</p>${foldBox('nicht')}</section>`
        : ''
    }${
      open
        ? `<section class="card"><h2>Noch unklar</h2><p class="say card-line">${sorts(open, 'ist', 'sind')} noch unklar.</p>${foldBox('unklar')}</section>`
        : ''
    }`;
}

function viewProfile() {
  const m = model(),
    dims = profileModel(),
    habits = habitsModel(),
    several = db.pets.length > 1 && !m.pet;
  return `${head('Worauf es ankommt')}
    <section class="card"><h2>Was ankommt</h2>${
      dims.length
        ? dims.map(d => likesList(m, d)).join('')
        : '<p class="hint card-line">Noch zu wenig bewertet. Nach ein paar Wochen steht hier, was dein Tier mag.</p>'
    }</section>${
      habits.length
        ? `<section class="card"><h2>Gewohnheiten</h2>${toldList(habits.map(h => habitRow(h, several)))}</section>`
        : ''
    }`;
}

// draws a page of days past the target, otherwise it cannot scroll to the top
export function jumpToDay(key) {
  const at = histDays.findIndex(g => g.key === key);
  if (at < 0) return;
  const box = $('#histBox');
  if (box) {
    const pet = model().pet;
    while (box.children.length < histDays.length && box.children.length <= at + HIST_PAGE)
      box.insertAdjacentHTML('beforeend', histHTML(pet, box.children.length, box.children.length + HIST_PAGE));
    watchDays();
  }
  $('#d-' + key, sheetBody)?.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start'});
}

// The history grows as you scroll. The box's child count is the state, so a redraw cannot get it out of step
const HIST_PAGE = 10;
let histDays = [];
const histHTML = (pet, from, to) =>
  dayBlocks(histDays.slice(from, to), {multiHouse: db.pets.length > 1 && !pet, anchors: true});
function growHistory() {
  const box = $('#histBox');
  if (!box || sheet?.kind !== 'report' || box.children.length >= histDays.length) return;
  const pet = model().pet;
  while (
    box.children.length < histDays.length &&
    sheetBody.scrollHeight - sheetBody.scrollTop - sheetBody.clientHeight < 800
  )
    box.insertAdjacentHTML('beforeend', histHTML(pet, box.children.length, box.children.length + HIST_PAGE));
  watchDays();
}
sheetBody.addEventListener('scroll', growHistory, {passive: true});

/* CSS cannot tell whether a sticky element is stuck, so this marks day lines poking out at the top of the box
   below the bar. The 0 threshold also catches a jump straight into place. */
let stuck = null;
function watchDays() {
  const top = parseFloat(getComputedStyle(sheetBody).getPropertyValue('--stick')) || 0; // resolves while hidden too
  stuck?.disconnect();
  stuck = new IntersectionObserver(
    entries =>
      entries.forEach(e =>
        e.target.classList.toggle('stuck', e.intersectionRatio < 1 && e.boundingClientRect.top < e.rootBounds.top),
      ),
    {root: sheetBody, rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: [0, 1]},
  );
  for (const line of sheetBody.querySelectorAll('.days .tl-date')) stuck.observe(line);
}

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
  const av = avatar({photo: s.photo, species: s.species}, 'xxxl');
  return `${head(title)}
    <label class="pet-photo" for="petPhotoInput" aria-label="Foto wählen">${av}<span class="cam-badge">${icon('camera')}</span></label>
    <label class="link photo-hint" for="petPhotoInput">${s.photo ? 'Foto ändern' : 'Foto hinzufügen'}</label>
    <label class="label" for="f-name">Name</label>
    <input id="f-name" class="field" data-field="name" value="${esc(s.name)}" placeholder="z. B. Minka" autocomplete="off" autocapitalize="words" enterkeyhint="done">
    <label class="label" for="f-birthday">Geburtstag</label>
    <span class="pick"><input id="f-birthday" class="field" type="date" data-field="birthday" value="${esc(s.birthday)}" max="${dayKey(Date.now())}">${icon('chevron')}</span>
    <span class="label">Tierart</span>
    <div class="chips">${SPECIES.map(x => `<button class="chip" aria-pressed="${s.species === x.k}" data-action="set-species" data-v="${x.k}">${icon(x.i)}${x.k}</button>`).join('')}</div>
    <div class="mt btn-col"><button class="btn primary" data-action="save-pet">${icon('check')}${editing ? 'Speichern' : 'Tier anlegen'}</button>
    ${editing ? armBtn('delete-pet', 'Tier entfernen', 'Nochmal tippen: Tier und Bewertungen löschen') : ''}</div>`;
}

const VIEWS = {
  serving: viewServing,
  observation: viewObservation,
  feed: viewFeed,
  new: viewName,
  product: viewProduct,
  pet: viewPet,
  settings: () => (sheet.page === 'pet' ? viewPet() : viewSettings()),
  report: viewReport,
  // the profile is a level of the evaluation, so back returns there
  evaluation: () => (sheet.page === 'profile' ? viewProfile() : viewEvaluation()),
  shop: viewShop,
};
/* An unchanged view is left alone: a sync redraws every open sheet, and rewriting would lose decoded photos, scroll
   position and focus. Kept per body, page and sheet. Boxes filled afterwards are not compared and always redrawn. */
const drawn = new Map();
setSheetView((state, body) => {
  const html = VIEWS[state.kind](),
    fresh = html !== drawn.get(body) || !body.firstChild; // no children: closed in between
  if (fresh) {
    const y = body.scrollTop;
    drawn.set(body, html);
    body.innerHTML = html;
    body.scrollTop = y;
    if (state.step === 'crop') mountCrop($('#cropStage'), state.cropImg, state.crop, $('#f-zoom')); // adds listeners, so once per drawing only
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
    // only the page holds the day anchors
    requestAnimationFrame(() => $('#' + at, sheetBody)?.scrollIntoView({block: 'start'}));
  }
});
