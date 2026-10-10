// Sheet and page contents; the settings page is in views/settings.js
import {$, reduceMotion} from '../dom.js';
import {slideHeight} from '../motion.js';
import {andList, cap, esc, norm} from '../text.js';
import {addDays, toLocalInput, weekStart, when} from '../dates.js';
import {icon} from '../icons.js';
import {OBSERVATIONS, observationOf, RATINGS, scaleOf, SEXES, TEXTURES, TYPES, typeOf} from '../config.js';
import {db} from '../store.js';
import {
  diary,
  getObservation,
  getPet,
  getProduct,
  getServing,
  observationsInFilter,
  model,
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
import {memLines, photoByAI, READ_PATIENCE, readingSince} from '../recognize.js';
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
  group,
  head,
  labelled,
  lead,
  main,
  nameBlock,
  obsThumb,
  photoThumb,
  pickRow,
  rateSlider,
  record,
  resultBadges,
  scaleEnds,
  segmented,
  shopRow,
  strip,
  thumbOf,
  told,
  toldList,
  verdictLabel,
  whoObserved,
} from './parts.js';
import {paintHouse, viewSettings} from './settings.js';
import {viewEvaluation, viewInsights} from './evaluation.js';

// the variety on top of a sheet; with the full photo on this phone, the thumbnail opens it
const prodRow = (s, p, inner, action, label) =>
  hasPhoto(s, p)
    ? `<div class="row set-row">${photoThumb(s, p, 'xl')}<button class="prod-edit" data-action="${action}" aria-label="${label}">${inner}${icon('pencil', 'chev')}</button></div>`
    : `<button class="row set-row" data-action="${action}" aria-label="${label}">${thumbOf(s, p, 'xl')}${inner}${icon('pencil', 'chev')}</button>`;
// removing sits well below the main button, so neither is taken for the other
const apart = btn => `<div class="apart">${btn}</div>`;
const photoLabel = p => (hasPhoto(null, p) || p.thumb ? 'Foto ändern' : 'Foto hinzufügen');
const photoLink = p =>
  `<button class="link rephoto" data-action="product-photo" data-id="${p.id}">${icon('camera')}${photoLabel(p)}</button>`;
const photoRow = p =>
  `<button class="row set-row act" data-action="product-photo" data-id="${p.id}">${lead('camera')}${main(photoLabel(p))}</button>`;
const prodGroup = (s, p, inner, action, label) =>
  group('', prodRow(s, p, inner, action, label) + (p ? photoRow(p) : ''), 'set-group prod');
const petChips = (action, on) =>
  `<div class="chips">${db.pets
    .map(
      pet =>
        `<button class="chip" aria-pressed="${!!on[pet.id]}" data-action="${action}" data-id="${pet.id}">${avatar(pet, 'xs')}${esc(pet.name)}</button>`,
    )
    .join('')}</div>`;
// the native field is invisible; the row shows its value and opens it
const timeRow = (title, by, t, field) =>
  pickRow(
    'clock',
    title,
    by ? 'von ' + esc(by) : '',
    esc(cap(when(t))),
    `<input class="pick-in" type="datetime-local" ${field} value="${toLocalInput(t)}" max="${toLocalInput(Date.now())}" aria-label="${title}">`,
  );

function viewServing() {
  const s = getServing(sheet.id);
  if (!s)
    return `<div class="sh-head"><h2>Eintrag</h2>${closeBtn}</div><p class="hint empty">Diesen Eintrag gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const p = getProduct(s.productId);
  const ids = Object.keys(s.pets).filter(id => getPet(id));
  const multi = db.pets.length > 1;
  return `<div class="sh-head"><h2>Wie war’s?</h2>${closeBtn}</div>
    ${prodGroup(s, p, `<span class="t-main">${nameBlock(s, p, true)}</span>`, 'edit-name', 'Sorte ändern')}
    ${ids.map(pid => group(multi ? esc(getPet(pid).name) : '', rateSlider(s, pid))).join('')}
    ${multi ? group('Wer wurde gefüttert?', petChips('toggle-serving-pet', s.pets)) : ''}
    ${group(
      '',
      timeRow('Gefüttert', s.by, s.servedAt, `id="f-time" data-time="${s.id}"`) +
        `<div class="row set-row">${lead('note')}<input id="f-note" class="field bare" data-note="${s.id}" value="${esc(s.note || '')}" placeholder="Notiz, z. B. neue Packung" aria-label="Notiz" autocomplete="off"></div>`,
      'set-group',
    )}
    <div class="mt">${deleteMealBtn(s.id)}</div>`;
}

function viewObservation() {
  const o = getObservation(sheet.id);
  if (!o)
    return `<div class="sh-head"><h2>Beobachtung</h2>${closeBtn}</div><p class="hint empty">Diesen Eintrag gibt es nicht mehr.</p>`;
  const kind = observationOf(o.kind),
    ids = Object.keys(o.pets).filter(id => getPet(id)),
    before = mealsBefore(db, o).map(s => getProduct(s.productId)),
    names = [...new Set(before.filter(Boolean).map(p => esc(pname(p))))],
    weighed =
      kind.about !== 'meal'
        ? ''
        : names.length
          ? `<p class="hint mt-s">${cap(kind.window)} davor gab es <b>${andList(names)}</b>.</p>`
          : `<p class="hint mt-s">${cap(kind.window)} davor ist keine Mahlzeit eingetragen.</p>`;
  const kinds = `<div class="chips">${Object.entries(OBSERVATIONS)
    .map(
      ([k, x]) =>
        `<button class="chip toned o-${k}" aria-pressed="${o.kind === k}" data-action="set-observation-kind" data-v="${k}">${icon(x.icon)}${x.label}</button>`,
    )
    .join('')}</div>`;
  return `<div class="sh-head"><h2>${esc(kind.label)}</h2>${closeBtn}</div>
    ${group('', kinds + weighed)}
    ${
      db.pets.length > 1
        ? group(
            'Bemerkt bei',
            petChips('toggle-observation-pet', o.pets) +
              (ids.length > 1 ? `<p class="hint mt-s">Ob es ${esc(whoObserved(ids))} war, ist offen.</p>` : ''),
          )
        : ''
    }
    ${group('', timeRow('Notiert', o.by, o.at, `id="f-obs-time" data-obs-time="${o.id}"`), 'set-group')}
    <div class="mt"><button class="btn quiet" data-action="delete-observation" data-id="${o.id}">${icon('trash')}Eintrag löschen</button></div>`;
}

function viewName() {
  const s = sheet;
  const serving = s.kind === 'serving' ? getServing(s.id) : null,
    product = s.kind === 'product' ? getProduct(s.id) : getProduct(serving?.productId);
  const title =
    s.kind === 'new'
      ? 'Neue Sorte'
      : s.kind === 'product'
        ? 'Sorte umbenennen'
        : product
          ? 'Sorte ändern'
          : 'Sorte benennen';
  const photo = product?.thumb || serving?.photo || serving?.thumb,
    large = hasPhoto(serving, product),
    reading = serving?.status === 'reading',
    began = readingSince.get(serving?.id),
    at = began ? ` data-since="${began}"` : '',
    // skeleton fields while reading, until READ_PATIENCE runs out
    patient = reading && Date.now() - (began || 0) < READ_PATIENCE;
  let note = '';
  const retry = label =>
    serving.photo && photoByAI() ? `<button class="link" data-action="retry">${label}</button>` : '';
  if (reading)
    note = `<p class="hint note"${at}>${icon('wait', 'wait')}Packung wird ${patient ? '' : 'noch '}gelesen …</p>`;
  else if (serving?.status === 'recognizing')
    note = `<p class="hint note"${at}>${icon('wait', 'wait')}Sorte wird erkannt …</p>`;
  else if (serving?.status === 'waiting')
    note = `<p class="hint note">${esc(serving.error || 'Wird erkannt, sobald der Server erreichbar ist.')} ${retry('Jetzt versuchen')}</p>`;
  else if (serving?.status === 'failed')
    note = `<p class="hint note warn">${esc(serving.error || 'Nicht erkannt.')} ${retry('Nochmal versuchen')}</p>`;
  else if (serving?.status === 'noserver' && serving.error)
    note = `<p class="hint note">${esc(serving.error)} ${retry('Nochmal versuchen')}</p>`;
  const top = `<div class="sh-head"><h2>${title}</h2>${closeBtn}</div>
    ${
      photo
        ? large
          ? `<button class="photo-btn${reading ? ' reading' : ''}"${reading ? at : ''} data-action="view-photo" data-s="${serving?.id || ''}" data-p="${product?.id || ''}" aria-label="Foto vergrößern"><img class="name-photo" src="${esc(photo)}" alt="Foto der Packung"></button>`
          : `<img class="name-photo" src="${esc(photo)}" alt="Foto der Packung">`
        : ''
    }${note}`;
  if (patient) return top + fieldSkeleton + fieldSkeleton; // same height as the fields, so nothing jumps
  const read = [serving?.guess?.brand, serving?.guess?.variety].filter(Boolean),
    // read right, it takes one tap right under the reading; the fields below are for putting it right
    said = read.length
      ? `<p class="say read-note">Gelesen: <b>${esc(read.join(', '))}</b>. Passt das?</p>
        <div class="mt"><button class="btn primary" data-action="save-name">${icon('check')}Passt so</button></div>`
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
    ${errorSlot}
    <div class="suggest" id="brandChips"></div>
    <label class="label" for="f-variety">Sorte</label>
    <input id="f-variety" class="field" data-field="variety" value="${esc(s.variety)}" placeholder="z. B. Lachs in Soße" autocomplete="off" enterkeyhint="done">
    <div class="suggest" id="lineChips"></div>
    ${labelled('Art', `<div class="chips">${TYPES.map(t => `<button class="chip" aria-pressed="${s.type === t}" data-action="set-type" data-v="${t}">${t}</button>`).join('')}</div>`)}
    ${textureChips(s, '', labelled)}
    <div class="mt">${
      s.armed?.startsWith('merge:')
        ? `<button class="btn armed" data-action="save-name">${icon('check')}Nochmal tippen: zusammenführen</button>`
        : `<button class="btn ${read.length ? 'soft' : 'primary'}" data-action="save-name">${icon('check')}${s.kind === 'new' ? 'Füttern' : 'Speichern'}</button>`
    }</div>
    ${serving && !product ? apart(deleteMealBtn(serving.id)) : ''}`;
}
/* What a form still needs, under its field until that is filled in. The slot is filled after drawing, so an unchanged
   view stays as it was drawn. */
const errorSlot = '<p class="hint note warn field-error" id="f-error" role="alert"></p>';
export function showError(text) {
  if (!sheet) return;
  sheet.error = text;
  const el = $('#f-error');
  if (el) el.textContent = text;
}
const fieldSkeleton = `<span class="label"><span class="skel skel-text"></span></span><span class="skel skel-field"></span>`;
// x: a variety, or the sheet itself while naming
function textureChips(x, note = '', wrap = group) {
  const t = TEXTURES[typeOf(x)];
  return t
    ? wrap(
        t.title,
        `<div class="chips">${t.items.map(([k, label]) => `<button class="chip" aria-pressed="${x.texture === k}" data-action="set-texture" data-v="${k}">${label}</button>`).join('')}</div>${note}`,
      )
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
      .filter(p => p.id !== skip && words.every(w => norm(`${p.brand || ''} ${p.variety || ''}`).includes(w)))
      .slice(0, 4);
  } else if (serving && !serving.productId) {
    hits = quickProducts(4).map(x => x.product);
    title = 'Schon mal gehabt?';
  }
  // renaming a variety into another one merges the two, so that takes a second tap
  const merge = sheet.kind === 'product';
  box.innerHTML =
    (hits.length ? `<span class="label">${title}</span>` : '') +
    hits
      .map(p => {
        const armed = merge && sheet.armed === 'merge:' + p.id;
        return `<button class="box sugg" ${merge ? 'data-action="arm" data-then="merge"' : 'data-action="use-product"'} data-id="${p.id}">${thumbOf(null, p, 'm')}<span class="t-main"><b>${esc(pname(p))}</b><small${armed ? ' class="warn"' : ''}>${armed ? 'Nochmal tippen: zusammenführen' : esc(p.brand)}</small></span>${icon('chevron')}</button>`;
      })
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
  const m = model();
  return entries
    .map(({product: p, at}) => {
      const meta = [p.variety ? p.brand : '', at ? when(at) : 'noch nie gehabt'].filter(Boolean).join(', '),
        past = record(m.byId.get(p.id));
      return `<li><button class="row" data-action="serve" data-id="${p.id}"${code ? ` data-code="${esc(code)}"` : ''}>
        ${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(meta)}</small>${past ? `<small>${esc(past)}</small>` : ''}</span>${strip(ratingsIn(m, [p.id]))}</button></li>`;
    })
    .join('');
}
function viewFeed() {
  const pick = sheet.step === 'pick' ? productsByCode(sheet.code) : [];
  if (pick.length)
    return `<div class="sh-head"><h2>Welche Sorte?</h2>${closeBtn}</div>
    <p class="hint">Dieser Barcode gehört zu mehreren Sorten.</p>
    ${group('', `<ul class="list plist">${serveRows(withLast(pick), sheet.code)}</ul>`, '')}`;
  const prods = quickProducts();
  return `<div class="sh-head"><h2>Was gibt’s heute?</h2>${closeBtn}</div>
    <div class="cta-row">${CTA.barcode}${CTA.foto}</div>
    ${sheet.busy ? `<p class="hint note" role="status">${icon('wait', 'wait')}${esc(sheet.busy)}</p>` : ''}
    <div class="serve">
      ${
        prods.length > SUGGEST
          ? `<div class="search">${icon('search')}
            <input class="field" type="search" data-search placeholder="Marke oder Sorte suchen" autocomplete="off"></div>`
          : ''
      }
      <div class="serve-list" id="serveList">${quickList(prods)}</div>
    </div>
    <button class="btn plain" data-action="new-product">Eintippen</button>`;
}
const quickList = entries =>
  entries.length
    ? group('Schon mal gehabt', `<ul class="list plist">${serveRows(entries.slice(0, SUGGEST))}</ul>`, '')
    : '';
// rewrites only the list box, so the search field keeps its place and focus
export function renderServeHits(text) {
  const box = $('#serveList');
  if (!box) return;
  const words = norm(text).split(' ').filter(Boolean);
  box.innerHTML = words.length ? hitList(text.trim(), words) : quickList(quickProducts());
}
function hitList(text, words) {
  const hits = quickProducts(Infinity, true)
    .filter(({product: p}) => words.every(w => norm(`${p.brand || ''} ${p.variety || ''}`).includes(w)))
    .slice(0, HITS);
  if (hits.length) return group('', `<ul class="list plist">${serveRows(hits)}</ul>`, '');
  const q = esc(text);
  return `<p class="hint empty"><span>Keine Sorte passt zu „${q}“.</span></p>
    <button class="btn plain" data-action="new-product" data-v="${q}">„${q}“ als neue Sorte eintippen</button>`;
}

const KAUFEN = [
  ['auto', 'Automatisch'],
  ['immer', 'Nachkaufen'],
  ['nicht', 'Nicht mehr kaufen'],
];
const verdictPetRow = (pet, x) =>
  `<div class="row verdict-pet">${avatar(pet, 'xs')}<span class="t-main"><b>${esc(pet.name)}: ${VERDICTS[x.verdict]}</b>
    <small>${esc(evidenceOf(x))}</small></span></div>`;
// the counts and the verdict only see the last 180 days
const OLD = 'Die letzten Bewertungen sind über ein halbes Jahr alt.';
function kaufenHTML(e) {
  const pets = db.pets.length > 1 ? db.pets.filter(pet => e.pets[pet.id]) : [];
  return group(
    'Kaufen',
    `${segmented('buy', KAUFEN, e.kaufen || 'auto')}
    <div class="verdict"><p><b>${esc(verdictLabel(e.house))}</b>${pets.length ? '' : `<span>${esc(e.house.n || !e.total ? evidenceOf(e.house) : OLD)}</span>`}</p>
    ${pets.map(pet => verdictPetRow(pet, e.pets[pet.id])).join('')}</div>`,
  );
}

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
// with a picture the packaging spans the card, without one the variety has the row a meal has
function packGroup(p) {
  const inner = `<span class="t-main"><b>${esc(p.brand || p.variety)}</b><small>${typeOf(p)}</small></span>`;
  if (!p.thumb) return prodGroup(null, p, inner, 'rename-product', 'Umbenennen');
  return group(
    '',
    `${photoThumb(null, p, 'pack')}<button class="row set-row" data-action="rename-product" aria-label="Umbenennen">${inner}${icon('pencil', 'chev')}</button>${photoRow(p)}`,
    'set-group pack-card',
  );
}
// counts only; whether they stand out is for the evaluation
function noticed(p) {
  const after = observedAfter(
    db,
    db.pets.map(x => x.id),
    Date.now(),
    p.id,
  );
  return after.length
    ? group(
        'Danach notiert',
        toldList(
          after.map(x =>
            told(
              obsThumb(x.kind),
              `${observationOf(x.kind).label} nach <b>${x.hit}&nbsp;von&nbsp;${x.n}</b>&nbsp;Mahlzeiten`,
            ),
          ),
        ),
        '',
      )
    : '';
}

function viewProduct() {
  const p = getProduct(sheet.id);
  if (!p)
    return `<div class="sh-head"><h2>Sorte</h2>${closeBtn}</div><p class="hint empty">Diese Sorte gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const ss = db.servings.filter(s => s.productId === p.id),
    e = sortOf(p.id),
    counts = e.house.counts;
  const scale = scaleOf(p),
    levels = [...scale, ...Object.keys(counts).filter(r => !scale.includes(r))]; // levels from another scale that still occur
  const codes = Object.keys(p.codes || {}).sort();
  const hist = ss.slice(0, MEALS_SHOWN).map(mealRow).join('');
  return `<div class="sh-head"><h2>${esc(pname(p))}</h2>${closeBtn}</div>
    ${packGroup(p)}
    ${textureChips(p, p.texture === 'block' ? '<p class="hint note">Vor dem Füttern zerkleinern</p>' : '')}
    ${group('Bewertungen', e.house.n ? countsRow(levels, counts) : `<p class="hint">${e.total ? OLD : 'Noch nicht bewertet.'}</p>`)}
    ${kaufenHTML(e)}
    ${noticed(p)}
    ${hist ? group('Verlauf', `<ul class="list plist">${hist}</ul>`, '') : ''}
    ${codes.length ? group('Barcodes', `<ul class="list plist">${codes.map(barcodeRow).join('')}</ul>`, '') : ''}
    <div class="mt"><button class="btn primary" data-action="serve" data-id="${p.id}">${icon('check')}Füttern</button></div>
    ${apart(armBtn('delete-product', 'Sorte löschen', 'Nochmal tippen: Sorte und Einträge löschen', {cls: 'quiet'}))}`;
}

// at: id of the day to open at
export const reportState = at => ({kind: 'report', at});

const shopList = (m, list) =>
  list.length ? `<ul class="list shop">${list.map(e => shopRow(m, e)).join('')}</ul>` : '';
const unclear = g => [...g.geht, ...g.neu];
const FOLDS = {nicht: g => g.nicht, unklar: unclear};
const FOLDED = 3; // rows a fold shows before the rest
const foldLabel = (list, open) => (open ? 'Weniger' : `Alle ${list.length} zeigen`);
function foldBox(key) {
  const m = model(),
    list = FOLDS[key](shopGroups(m)),
    open = !!sheet.open?.[key];
  if (list.length <= FOLDED) return shopList(m, list);
  return `${shopList(m, list.slice(0, FOLDED))}<div class="card-body fold" id="fold-${key}">${open ? shopList(m, list.slice(FOLDED)) : ''}</div>
    <button class="card-btn" data-action="fold" data-v="${key}" aria-expanded="${open}" aria-controls="fold-${key}">${foldLabel(list, open)}</button>`;
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
        : `<p class="hint empty"><span>Noch nichts eingetragen, der Napf wartet auf seine Premiere.</span></p>`
    }</section>`;
}
// swaps only the fold, so the rest of the page and the button stay put
export function foldPart(key) {
  const f = FOLDS[key],
    body = $('#fold-' + key, sheetBody),
    btn = $(`[data-action=fold][data-v="${key}"]`, sheetBody);
  if (!f || !body || !btn) return;
  const m = model(),
    list = f(shopGroups(m)),
    open = !sheet.open?.[key],
    h0 = body.offsetHeight;
  sheet.open = {...sheet.open, [key]: open};
  body.innerHTML = open ? shopList(m, list.slice(FOLDED)) : '';
  btn.textContent = foldLabel(list, open);
  btn.setAttribute('aria-expanded', String(open));
  slideHeight(body, h0);
  drawn.set(sheetBody, VIEWS[sheet.kind]()); // so the next redraw sees nothing new
}
function viewShop() {
  const m = model(),
    g = shopGroups(m),
    types = TYPES.map(t => [t, g.nachkaufen.filter(e => typeOf(e.product) === t)]).filter(([, l]) => l.length),
    share = types.length
      ? `<button class="icon-btn" data-action="share-list" aria-label="Liste teilen">${icon('share')}</button>`
      : '';
  const buy = types.length
    ? types.map(([t, l]) => `<h3 class="label grp">${t}</h3>${shopList(m, l)}`).join('')
    : '<p class="hint card-line">Noch nichts zum Nachkaufen, erst mal probieren.</p>';
  return `${head('Einkaufen' + forWhom(m.pet), 'settings-back', share)}
    <section class="card"><h2>Nachkaufen</h2>${buy}</section>${
      g.nicht.length ? `<section class="card"><h2>Nicht mehr kaufen</h2>${foldBox('nicht')}</section>` : ''
    }${unclear(g).length ? `<section class="card"><h2>Noch unklar</h2>${foldBox('unklar')}</section>` : ''}`;
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
  const title = editing ? 'Katze bearbeiten' : db.pets.length ? 'Neue Katze' : 'Wer wird gefüttert?';
  const av = avatar({photo: s.photo}, 'xxxl');
  return `${head(title)}
    <label class="pet-photo" for="petPhotoInput" aria-label="Foto wählen">${av}<span class="cam-badge">${icon('camera')}</span></label>
    <label class="link photo-hint" for="petPhotoInput">${s.photo ? 'Foto ändern' : 'Foto hinzufügen'}</label>
    ${group(
      '',
      `<div class="row set-row">${lead('paw')}<label class="t-main" for="f-name"><b>Name</b></label>
        <input id="f-name" class="field in-row" data-field="name" value="${esc(s.name)}" placeholder="z. B. Minka" autocomplete="off" autocapitalize="words" enterkeyhint="done"></div>` +
        errorSlot,
      'set-group',
    )}
    ${group(
      'Spitznamen',
      `<div class="chips nicks" id="nicks"></div>
      <div class="connect"><input id="f-nick" class="field" data-field="nick" value="${esc(s.nick)}" placeholder="z. B. Mausi" maxlength="24" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Spitzname">
        <button class="btn soft" data-action="add-nick" aria-label="Spitzname hinzufügen">${icon('plus')}</button></div>
      <p class="hint mt-s">Die App nennt deine Katze dann mal so, mal so.</p>`,
    )}
    ${group('Geschlecht', `<div class="chips">${[...SEXES, {k: '', label: 'Keine Angabe'}].map(x => `<button class="chip" aria-pressed="${s.sex === x.k}" data-action="set-sex" data-v="${x.k}">${x.label}</button>`).join('')}</div>`)}
    <div class="mt"><button class="btn primary" data-action="save-pet">${icon('check')}${editing ? 'Speichern' : 'Katze anlegen'}</button></div>
    ${editing ? apart(armBtn('delete-pet', 'Katze entfernen', 'Nochmal tippen: Katze und Bewertungen löschen', {cls: 'quiet'})) : ''}`;
}

// drawn on their own, so the field keeps its focus and keyboard while names are added
export function renderNicks() {
  const box = $('#nicks');
  if (!box || !sheet?.nicknames) return;
  box.innerHTML = sheet.nicknames
    .map(
      n =>
        `<button class="chip" data-action="drop-nick" data-v="${esc(n)}" aria-label="${esc(n)} entfernen">${esc(n)}${icon('close')}</button>`,
    )
    .join('');
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
  // insights and shopping list are levels of the evaluation, so back returns there
  evaluation: () =>
    sheet.page === 'insights' ? viewInsights() : sheet.page === 'shop' ? viewShop() : viewEvaluation(),
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
    // a loader drawn again goes on from when the wait began, so it neither hides again nor starts over
    for (const el of body.querySelectorAll('[data-since]'))
      for (const a of el.getAnimations({subtree: true}))
        a.startTime = document.timeline.currentTime - (Date.now() - el.dataset.since);
  }
  const error = $('#f-error', body);
  if (error) error.textContent = state.error || '';
  if (state.kind === 'settings') paintHouse(fresh);
  if (state.step === 'name' || state.kind === 'new') renderSuggestions();
  if (state.kind === 'pet' || state.page === 'pet') renderNicks();
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
