/* Contents of the bottom sheets: meal, naming, feeding (with the choice after scanning), food, pet (with cropping of
   the profile picture), settings and evaluation. */
import {$} from '../dom.js';
import {andList, cap, esc, norm} from '../text.js';
import {toLocalInput, when} from '../dates.js';
import {appInfo} from '../native.js';
import {icon} from '../icons.js';
import {FEED_START, RATINGS, REMIND, REMIND_MAX_H, scaleOf, SPECIES, TEXTURES, TYPES, typeOf} from '../config.js';
import {db, loadError, prefs, queue, storageOK} from '../store.js';
import {isConnected, status} from '../sync.js';
import {getPet, getProduct, getServing, petNames, pname, productsByCode, quickProducts, reportModel, sortOf} from '../derive.js';
import {feedSlots, MIN_RATED, rateCls, scoreCls, VERDICTS} from '../smart.js';
import {renderSheet, setSheetView, sheet, sheetBody} from '../ui/sheet.js';
import {ZOOM_MAX, mountCrop} from '../ui/crop.js';
import {armBtn, avatar, closeBtn, dayBlocks, dayGroups, nameBlock, rateRow, reasonOf, resultBadges, syncInfo, thumbOf, verdictLabel} from './parts.js';

function viewServing(){
  const s = getServing(sheet.id);
  if (!s) return `<div class="sh-head"><h2>Eintrag</h2>${closeBtn}</div><p class="empty">Diesen Eintrag gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const p = getProduct(s.productId);
  const ids = Object.keys(s.pets).filter(id => getPet(id));
  const multi = db.pets.length > 1;
  return `<div class="sh-head"><h2>Wie war’s?</h2>${closeBtn}</div>
    <button class="prod-card" data-action="edit-name" aria-label="Futter ändern">${thumbOf(s, p, 'lg')}<span class="t-main">${nameBlock(s, p, true)}</span><span class="edit">${icon('pencil')}</span></button>
    ${ids.map(pid => { const pet = getPet(pid); return `<div class="pet-rate">${multi ? `<div class="pet-label">${avatar(pet, 'xs')}${esc(pet.name)}</div>` : ''}${rateRow(s, pid, true)}</div>`; }).join('')}
    ${multi ? `<span class="label">Serviert für</span><div class="chips">${db.pets.map(pet => `<button class="chip" aria-pressed="${!!s.pets[pet.id]}" data-action="toggle-serving-pet" data-id="${pet.id}">${avatar(pet, 'xs')}${esc(pet.name)}</button>`).join('')}</div>` : ''}
    <label class="label" for="f-time">Serviert${s.by ? ' von ' + esc(s.by) : ''}</label>
    <span class="pick"><input id="f-time" class="field" type="datetime-local" data-time="${s.id}" value="${toLocalInput(s.servedAt)}" max="${toLocalInput(Date.now())}">${icon('chevron')}</span>
    <label class="label" for="f-note">Notiz</label>
    <input id="f-note" class="field" data-note="${s.id}" value="${esc(s.note || '')}" placeholder="Optional, z. B. neue Packung" autocomplete="off">
    <div class="mt"><button class="btn quiet" data-action="delete-serving">${icon('trash')}Eintrag löschen</button></div>`;
}

function viewName(){
  const s = sheet;
  const serving = s.kind === 'serving' ? getServing(s.id) : null;
  const title = s.kind === 'new' ? 'Neues Futter' : s.kind === 'product' ? 'Futter umbenennen' : (serving?.productId ? 'Futter ändern' : 'Futter benennen');
  const photo = serving && (serving.photo || serving.thumb);
  let note = '';
  const retry = label => serving.photo && isConnected() ? `<button class="link" data-action="retry">${label}</button>` : '';
  if (serving?.status === 'reading') note = `<p class="note"><span class="spin"></span>Packung wird gelesen …</p>`;
  else if (serving?.status === 'recognizing') note = `<p class="note"><span class="spin"></span>Sorte wird erkannt …</p>`;
  else if (serving?.status === 'waiting') note = `<p class="note">${esc(serving.error || 'Wird erkannt, sobald der Server erreichbar ist.')} ${retry('Jetzt versuchen')}</p>`;
  else if (serving?.status === 'failed') note = `<p class="note warn">${esc(serving.error || 'Nicht erkannt.')} ${retry('Nochmal versuchen')}</p>`;
  return `<div class="sh-head"><h2>${title}</h2>${closeBtn}</div>
    ${photo ? `<img class="name-photo" src="${esc(photo)}" alt="Foto der Packung">` : ''}${note}
    <div class="suggest" id="suggest"></div>
    <label class="label" for="f-brand">Marke</label>
    <input id="f-brand" class="field" data-field="brand" value="${esc(s.brand)}" placeholder="z. B. Sheba" autocomplete="off" autocapitalize="words" enterkeyhint="next">
    <label class="label" for="f-variety">Sorte</label>
    <input id="f-variety" class="field" data-field="variety" value="${esc(s.variety)}" placeholder="z. B. Lachs in Soße" autocomplete="off" enterkeyhint="done">
    <span class="label">Art</span>
    <div class="chips">${TYPES.map(t => `<button class="chip" aria-pressed="${s.type === t}" data-action="set-type" data-v="${t}">${t}</button>`).join('')}</div>
    ${textureChips(s)}
    <div class="mt"><button class="btn primary" data-action="save-name">${icon('check')}${s.kind === 'new' ? 'Servieren' : 'Speichern'}</button></div>`;
}
/* Consistency or treat type of variety x (the sheet itself while naming): single choice, only for types that have one */
function textureChips(x, note = ''){
  const t = TEXTURES[typeOf(x)];
  return t ? `<div class="tex"><span class="label">${t.title}</span><div class="chips">${t.items.map(([k, label]) => `<button class="chip" aria-pressed="${x.texture === k}" data-action="set-texture" data-v="${k}">${label}</button>`).join('')}</div>${note}</div>` : '';
}
export function renderSuggestions(){
  const box = $('#suggest'); if (!box || !sheet) return;
  const serving = sheet.kind === 'serving' ? getServing(sheet.id) : null;
  const skip = sheet.kind === 'product' ? sheet.id : serving?.productId;
  const q = norm(`${sheet.brand || ''} ${sheet.variety || ''}`);
  let hits = [], title = 'Meinst du?';
  if (q.length >= 2) {
    const words = q.split(' ');
    hits = db.products.filter(p => p.id !== skip && words.every(w => norm(p.brand + ' ' + p.variety).includes(w))).slice(0, 4);
  } else if (serving && !serving.productId) { hits = quickProducts(4); title = 'Schon mal gehabt?'; } // one-tap suggestion
  box.innerHTML = (hits.length ? `<span class="label">${title}</span>` : '') + hits.map(p => `<button class="sugg" data-action="use-product" data-id="${p.id}">${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(p.brand)}</small></span>${icon('chevron')}</button>`).join('');
}

/* Feeding: barcode and photo as equally wide buttons; „Füttern beginnt mit“ hides one of them and the other takes
   the full width. Below them the most recently fed varieties, at most SUGGEST; with more known varieties the search
   field follows, whose hits (at most HITS) take the place of the suggestions.
   sheet.busy: the notice while scanning,
   sheet.code: the scanned code currently in play (the choice, or the photo button takes it over) */
const SUGGEST = 3, HITS = 8;
const CTA = {
  barcode: `<button class="cta primary" data-action="scan">${icon('barcode')}<span><b>Barcode</b><small>scannen</small></span></button>`,
  foto: `<button class="cta soft" data-action="photo">${icon('camera')}<span><b>Foto</b><small>aufnehmen</small></span></button>`
};
function serveRows(prods, code = ''){
  return prods.map(p => {
    const e = sortOf(p.id);
    const meta = [p.variety ? p.brand : '', e?.n ? `${e.pct} %` : 'noch nicht bewertet'].filter(Boolean).join(', ');
    return `<li><button class="row" data-action="serve" data-id="${p.id}"${code ? ` data-code="${esc(code)}"` : ''}>${thumbOf(null, p)}<span class="t-main"><b>${esc(pname(p))}</b><small>${esc(meta)}</small></span><span class="serve-pill">Servieren</span></button></li>`;
  }).join('');
}
function viewFeed(){
  const pick = sheet.step === 'pick' ? productsByCode(sheet.code) : [];
  if (pick.length) return `<div class="sh-head"><h2>Welche Sorte?</h2>${closeBtn}</div>
    <p class="hint">Dieser Barcode gehört zu mehreren Sorten.</p>
    <ul class="plist">${serveRows(pick, sheet.code)}</ul>`;
  const prods = quickProducts();
  return `<div class="sh-head"><h2>Was gibt’s heute?</h2>${closeBtn}</div>
    <div class="cta-row">${prefs.feedStart === 'beides' ? CTA.barcode + CTA.foto : CTA[prefs.feedStart]}</div>
    ${sheet.busy ? `<p class="note" role="status"><span class="spin"></span>${esc(sheet.busy)}</p>` : ''}
    ${prods.length ? `<div id="serveList"><span class="label">Schon mal gehabt</span><ul class="plist">${serveRows(prods.slice(0, SUGGEST))}</ul></div>
      ${prods.length > SUGGEST ? `<div class="search">${icon('search')}<input class="field" type="search" data-search placeholder="Marke oder Sorte suchen" autocomplete="off"></div>
        <ul class="plist" id="serveHits"></ul>` : ''}` : ''}
    <button class="btn plain" data-action="new-product">Ohne Foto eintippen</button>`;
}
/* Search in the feeding sheet: what is typed shows the matching varieties in place of the suggestions, at most HITS. */
export function renderServeHits(text){
  const list = $('#serveList'), hits = $('#serveHits');
  if (!list || !hits) return;
  const words = norm(text).split(' ').filter(Boolean);
  list.hidden = !!words.length;
  hits.innerHTML = words.length ? serveRows(quickProducts().filter(p => words.every(w => norm(p.brand + ' ' + p.variety).includes(w))).slice(0, HITS)) : '';
}

/* The notes under the reminders: they say what the chosen setting currently means.
   For feeding: the usual times from the history, nothing is asked */
export const remindHint = () => !prefs.remind ? 'Dieses Handy erinnert nicht ans Bewerten.'
  : `Dieses Handy erinnert ${prefs.remind === 60 ? '1 Stunde' : prefs.remind / 60 + ' Stunden'} nach dem Füttern ans Bewerten.`;
function feedHint(){
  const slots = feedSlots(db, Date.now()), hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, on = prefs.feedRemind;
  if (!slots.length) return 'Die üblichen Zeiten lernt die App aus dem Verlauf, sobald an vier Tagen etwa zur selben Zeit gefüttert wurde.' + (on ? ' Bis dahin kommt keine Erinnerung.' : '');
  return `Futter gibt es meist um ${andList(slots.map(x => hhmm(x.at)))} Uhr. `
    + (!on ? 'Dieses Handy erinnert nicht daran.' : `Ist ${slots[0].remind - slots[0].at} Minuten später nichts serviert, erinnert dieses Handy.`
      + (isConnected() ? ' Was andere inzwischen serviert haben, erfährt es erst, wenn die App offen war.' : ''));
}

/* Food sheet, section „Kaufen“: the manual setting (Automatisch, Immer kaufen, Nicht kaufen), below it the computed
   verdict with a short reason, and one line per pet where there are several */
const KAUFEN = [['auto', 'Automatisch'], ['immer', 'Immer kaufen'], ['nicht', 'Nicht kaufen']];
function kaufenHTML(e){
  const pets = db.pets.length > 1 ? db.pets.filter(pet => e.pets[pet.id]) : [];
  return `<span class="label">Kaufen</span>
    <div class="seg">${KAUFEN.map(([v, l]) => `<button aria-pressed="${(e.kaufen || 'auto') === v}" data-action="buy" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="verdict"><p><b>${esc(verdictLabel(e.house))}</b>${pets.length ? '' : `<span>${esc(reasonOf(e.house))}</span>`}</p>
    ${pets.map(pet => `<div class="verdict-pet">${avatar(pet, 'xs')}<span class="t-main"><b>${esc(pet.name)}: ${VERDICTS[e.pets[pet.id].verdict]}</b><small>${esc(reasonOf(e.pets[pet.id]))}</small></span></div>`).join('')}</div>`;
}

function viewProduct(){
  const p = getProduct(sheet.id);
  if (!p) return `<div class="sh-head"><h2>Futter</h2>${closeBtn}</div><p class="empty">Dieses Futter gibt es nicht mehr.</p>`;
  if (sheet.step === 'name') return viewName();
  const ss = db.servings.filter(s => s.productId === p.id), e = sortOf(p.id), counts = e.house.counts;
  const scale = scaleOf(p), levels = [...scale, ...Object.keys(counts).filter(r => !scale.includes(r))]; // other levels that occur come after them
  const perPet = db.pets.length > 1 ? db.pets.map(pet => {
    const x = e.pets[pet.id]; if (!x) return '';
    return `<div class="pp ${scoreCls(x.score)}">${avatar(pet, 'sm')}<span class="pp-name">${esc(pet.name)}</span><span class="bar"><i style="--w:${Math.max(4, x.pct)}%"></i></span><b>${x.pct} %</b></div>`;
  }).join('') : '';
  const codes = Object.keys(p.codes || {}).sort();
  const hist = ss.slice(0, 12).map(s => `<li><button class="row" data-action="open-serving" data-id="${s.id}"><span class="t-main"><b>${esc(cap(when(s.servedAt)))}</b><small>${esc([petNames(Object.keys(s.pets).filter(getPet)), s.note ? '„' + s.note + '“' : ''].filter(Boolean).join(', '))}</small></span>${resultBadges(s)}</button></li>`).join('');
  return `<div class="sh-head"><h2>${esc(pname(p))}</h2>${closeBtn}</div>
    <div class="prod-card">${thumbOf(null, p, 'lg')}<span class="t-main"><b>${esc(p.brand || p.variety)}</b><small>${esc([p.type, `${ss.length}× serviert`].filter(Boolean).join(', '))}</small></span><button class="icon-btn" data-action="rename-product" aria-label="Umbenennen">${icon('pencil')}</button></div>
    ${textureChips(p, p.texture === 'block' ? '<p class="note">Vor dem Servieren zerkleinern</p>' : '')}
    ${e.house.n ? `<div class="counts">${levels.map(r => `<div class="cnt ${rateCls(r)}">${icon('r_' + r)}<b>${counts[r] || 0}</b><span>${RATINGS[r].lines.join('<br>')}</span></div>`).join('')}</div>` : `<p class="empty">Noch nicht bewertet.</p>`}
    ${kaufenHTML(e)}
    ${perPet ? `<span class="label">Pro Tier</span>${perPet}` : ''}
    ${hist ? `<span class="label">Verlauf</span><ul class="plist">${hist}</ul>` : ''}
    ${codes.length ? `<span class="label">Barcodes</span><ul class="plist">${codes.map(c => `<li class="list-row"><span class="t-main"><b class="num">${esc(c)}</b></span><button class="icon-btn" data-action="remove-code" data-code="${esc(c)}" aria-label="Barcode ${esc(c)} entfernen">${icon('close')}</button></li>`).join('')}</ul>` : ''}
    <div class="mt btn-col"><button class="btn primary" data-action="serve" data-id="${p.id}">${icon('check')}Heute servieren</button>
    ${armBtn('delete-product', 'Futter löschen', 'Nochmal tippen: Futter und Einträge löschen')}</div>`;
}

/* Evaluation: the same building blocks as the settings, nothing to set. „Marken“ says what goes down best, below it
   the whole history. The computing happens in report() (smart.js). The bars carry their text description in
   aria-label, and no statement rests on colour alone. sheet.at: the id of the day it opens at */
export const reportState = at => ({kind:'report', at});

/* A horizontal bar with name, number and secondary number */
const barRow = (name, value, side, w) =>
  `<div class="lv"><span class="lv-top"><span class="lv-name">${esc(name)}</span><b class="lv-n">${value}</b><span class="lv-s">${side}</span></span>
    <span class="bar"><i style="--w:${Math.max(2, Math.round(w))}%"></i></span></div>`;

/* „Marken“: which brand goes down best. Only from two brands on, otherwise there is nothing to compare. */
function brandBlock(m){
  if (m.brands.length < 2) return '';
  const label = 'Marken nach Wertung: ' + m.brands.map(b => `${b.key} ${b.pct} Prozent aus ${b.n} Bewertungen`).join('; ') + '.';
  return `<h3 class="label">Marken</h3>
    <div class="bars" role="img" aria-label="${esc(label)}">${m.brands.map(b => barRow(b.key, `${b.pct} %`, `${b.n}×`, b.pct)).join('')}</div>
    <p class="why">${esc(m.brands[0].key)} kommt am besten an, ${esc(m.brands.at(-1).key)} am wenigsten.</p>`;
}

/* The evaluation: what goes down best, and the whole history. Nothing to set, nothing to unfold. */
function viewReport(){
  const m = reportModel();
  const who = db.pets.length > 1 ? ` für ${m.pet ? esc(getPet(m.pet).name) : 'alle Tiere'}` : '';
  return `<div class="sh-head"><h2>Auswertung${who}</h2>${closeBtn}</div>
    ${m.n < MIN_RATED ? `<p class="hint">Ab ${MIN_RATED} Bewertungen zeigt diese Seite, was ankommt.</p>` : brandBlock(m)}
    ${m.meals.length ? `<h3 class="label">Verlauf</h3>${dayBlocks(dayGroups(m.meals), {multiHouse:db.pets.length > 1 && !m.pet, anchors:true})}`
      : `<p class="empty">Noch nichts serviert.</p>`}`;
}

/* Cropping the profile picture: a square stage with a round cut-out like the profile picture, and a slider to zoom.
   mountCrop() hangs the image in after drawing. */
const viewCrop = () => `<div class="sh-head"><h2>Foto zuschneiden</h2>${closeBtn}</div>
    <div class="crop" id="cropStage" aria-label="Ausschnitt verschieben"></div>
    <label class="label" for="f-zoom">Zoom</label>
    <input id="f-zoom" class="zoom" type="range" min="1" max="${ZOOM_MAX}" step="0.01" value="1">
    <div class="btn-row"><button class="btn soft" data-action="crop-cancel">Abbrechen</button><button class="btn primary" data-action="crop-apply">${icon('check')}Übernehmen</button></div>`;

function viewPet(){
  if (sheet.step === 'crop') return viewCrop();
  const s = sheet, editing = !!s.id;
  const title = editing ? 'Tier bearbeiten' : (db.pets.length ? 'Neues Tier' : 'Wer wird gefüttert?');
  const av = avatar({photo:s.photo, species:s.species}, 'xl');
  return `<div class="sh-head"><h2>${title}</h2>${closeBtn}</div>
    <label class="pet-photo" for="petPhotoInput" aria-label="Foto wählen">${av}<span class="cam-badge">${icon('camera')}</span></label>
    <label class="photo-hint" for="petPhotoInput">${s.photo ? 'Foto ändern' : 'Foto hinzufügen'}</label>
    <label class="label" for="f-name">Name</label>
    <input id="f-name" class="field" data-field="name" value="${esc(s.name)}" placeholder="z. B. Minka" autocomplete="off" autocapitalize="words" enterkeyhint="done">
    <span class="label">Tierart</span>
    <div class="chips">${SPECIES.map(x => `<button class="chip" aria-pressed="${s.species === x.k}" data-action="set-species" data-v="${x.k}">${icon(x.i)}${x.k}</button>`).join('')}</div>
    <div class="mt btn-col"><button class="btn primary" data-action="save-pet">${icon('check')}${editing ? 'Speichern' : 'Tier anlegen'}</button>
    ${editing ? armBtn('delete-pet', 'Tier entfernen', 'Nochmal tippen: Tier und Bewertungen löschen') : ''}</div>`;
}

function viewSettings(){
  const st = prefs, house = isConnected(), own = st.remind > 0 && (!!sheet.ownRemind || !REMIND.includes(st.remind)); // „Eigene“: chosen, or a value outside the steps
  return `<div class="sh-head"><h2>Einstellungen</h2>${closeBtn}</div>
    ${loadError ? `<p class="banner">Die gespeicherten Daten konnten nicht gelesen werden. Bitte die App neu starten.</p>`
      : storageOK ? '' : `<p class="banner">In dieser Vorschau wird nichts dauerhaft gespeichert.</p>`}
    <span class="label">Darstellung</span>
    <div class="seg">${[['system', 'auto', 'System'], ['light', 'sun', 'Hell'], ['dark', 'moon', 'Dunkel']].map(([v, ic, l]) => `<button aria-pressed="${st.theme === v}" data-action="theme" data-v="${v}">${icon(ic)}${l}</button>`).join('')}</div>
    <span class="label">Profilbild im Hintergrund</span>
    <div class="seg">${[['on', 'An'], ['off', 'Aus']].map(([v, l]) => `<button aria-pressed="${st.backdrop === (v === 'on')}" data-action="backdrop" data-v="${v}">${l}</button>`).join('')}</div>
    <span class="label">Füttern beginnt mit</span>
    <div class="seg">${FEED_START.map(([v, l]) => `<button aria-pressed="${st.feedStart === v}" data-action="feed-start" data-v="${v}">${l}</button>`).join('')}</div>
    <span class="label">Ans Bewerten erinnern</span>
    <p class="hint" id="remind-hint">${remindHint()}</p>
    <div class="seg">${REMIND.map(m => `<button aria-pressed="${!own && st.remind === m}" data-action="remind" data-v="${m}">${m ? m / 60 + ' Std.' : 'Aus'}</button>`).join('')
      }<button aria-pressed="${own}" data-action="remind-own">Eigene</button></div>
    ${own ? `<label class="label" for="f-remind">Stunden nach dem Füttern</label>
      <input id="f-remind" class="field" type="number" inputmode="numeric" min="1" max="${REMIND_MAX_H}" step="1" value="${st.remind / 60}" data-remind enterkeyhint="done">` : ''}
    <span class="label">Ans Füttern erinnern</span>
    <p class="hint">${feedHint()}</p>
    <div class="seg">${[['on', 'An'], ['off', 'Aus']].map(([v, l]) => `<button aria-pressed="${st.feedRemind === (v === 'on')}" data-action="feed-remind" data-v="${v}">${l}</button>`).join('')}</div>
    <span class="label">Tiere</span>
    <div>${db.pets.map(p => `<button class="list-row" data-action="edit-pet" data-id="${p.id}">${avatar(p)}<span class="t-main"><b>${esc(p.name)}</b><small>${esc(p.species)}</small></span>${icon('chevron', 'chev')}</button>`).join('')}
      <button class="list-row" data-action="add-pet"><span class="av add">${icon('plus')}</span><span class="t-main"><b>Tier hinzufügen</b></span></button></div>
    <label class="label" for="f-me">Dein Name</label>
    <p class="hint">Erscheint im Verlauf, damit im Haushalt alle sehen, wer gefüttert hat.</p>
    <input id="f-me" class="field" data-setting="name" value="${esc(st.name)}" placeholder="z. B. Anna" autocomplete="off" autocapitalize="words">
    <span class="label" id="server">Haushalt</span>
    <div id="serverBox"></div>
    <span class="label">Daten</span>
    <div class="btn-col">
      <button class="btn soft" data-action="export">${icon('download')}Backup exportieren</button>
      <label class="btn soft" for="importInput">${icon('upload')}Backup importieren</label>
      ${house ? '' : `<button class="btn soft" data-action="demo">${icon('sparkle')}Beispieldaten laden</button>`}
      <button class="btn soft" data-action="open-privacy">${icon('shield')}Datenschutz</button>
      ${house ? armBtn('wipe', 'Alle Daten im Haushalt löschen', 'Nochmal tippen: für alle im Haushalt löschen')
              : armBtn('wipe', 'Alle Daten löschen', 'Nochmal tippen: wirklich alles löschen')}
    </div>
    <p class="foot">${house ? 'Die Daten werden im Haushalt geteilt.' : 'Alle Daten bleiben auf diesem Gerät.'}${appInfo.version ? `<br>Version ${esc(appInfo.version)}` : ''}</p>`;
}

/* Section „Haushalt“. Mode `lokal`: this phone's settings and the „Mit Haushalt verbinden“ button, which opens the
   fields for address and code. Connected: the state of the sync, „Jetzt abgleichen“ and „Verbindung trennen“, with the
   same settings below. Only the hand-started sync shows progress (sheet.syncing, see actions.js); syncs in the
   background stay invisible. */
function serverSection(notice = syncInfo()){
  const s = sheet || {};
  const codeRow = `<div class="connect mt-s">
      <input id="f-code" class="field code" data-field="code" value="${esc(s.code || '')}" placeholder="Haushaltscode" aria-label="Haushaltscode"
        autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="12">
      <button class="btn primary" data-action="connect"${s.connecting ? ' disabled' : ''}>${s.connecting ? '<span class="spin"></span>Verbinde …' : 'Verbinden'}</button></div>
      ${s.connectError ? `<p class="note warn" role="alert">${esc(s.connectError)}</p>` : ''}`;
  const addrField = `<label class="label" for="f-server">Adresse des Servers</label>
      <input id="f-server" class="field" data-field="server" value="${esc(s.server ?? prefs.server)}" placeholder="http://192.168.… oder https://…"
        autocomplete="off" inputmode="url" spellcheck="false" enterkeyhint="next">`;
  if (!isConnected()) return deviceSection() + (s.connectForm
    ? `<p class="hint">Verbunden sehen alle im Haushalt dieselben Tiere, Mahlzeiten und Bewertungen. Adresse und Code zeigt „Schmeckt’s-Server einrichten“ auf dem Mini-PC.</p>${addrField}${codeRow}`
    : `<button class="btn soft" data-action="connect-form">${icon('house')}Mit Haushalt verbinden</button>`);
  const needCode = status.kind === 'auth';
  return `<div class="srv ${notice.tone}" role="status"><span class="srv-ic">${icon(notice.tone === 'bad' ? 'alert' : 'house')}</span>
    <span class="t-main"><b>${esc(notice.title)}</b><small>${esc(notice.detail)}</small></span></div>
    ${!needCode ? `<p class="addr"><span>Server ${esc(prefs.server)}</span></p>`
      : codeRow + (s.editServer ? addrField : `<p class="addr"><span>Server ${esc(prefs.server)}</span><button class="link" data-action="edit-server">Ändern</button></p>`)}
    <div class="btn-col mt-s">
      ${needCode ? '' : s.syncing === 'shown' ? `<button class="btn soft" disabled><span class="spin"></span>Abgleich läuft …</button>`
        : status.state === 'ok' && !queue.length ? '' // all synced: nothing to do
        : `<button class="btn soft" data-action="sync-now">${icon('refresh')}Jetzt abgleichen</button>`}
      ${armBtn('disconnect', 'Verbindung trennen', 'Nochmal tippen: trennen, die Daten bleiben hier', {ic:'unplug', cls:'plain'})}</div>
    ${deviceSection()}`;
}

/* This phone's settings and routes: product lookup on the internet and the manual exchange.
   The notes say what goes out in each case. After receiving, the report sits here and, when the other device is
   missing something, „Antwort senden“ (sheet.exchange, see logic/exchange.js). */
function deviceSection(){
  const ex = sheet?.exchange;
  return `<span class="label">Produktsuche im Internet</span>
    <p class="hint">${prefs.lookup ? 'Bei unbekannten Barcodes fragt dieses Handy zwei freie Produktdatenbanken. Übertragen wird nur die Nummer.'
      : 'Unbekannte Barcodes führen gleich zum Foto. Es geht keine Nummer hinaus.'}</p>
    <div class="seg">${[['on', 'An'], ['off', 'Aus']].map(([v, l]) => `<button aria-pressed="${prefs.lookup === (v === 'on')}" data-action="lookup" data-v="${v}">${l}</button>`).join('')}</div>
    <span class="label">Austausch von Hand</span>
    <p class="hint">Änderungen als Datei an ein anderes Handy geben und von dort empfangen. Die Datei enthält nur Tiere, Futter und Mahlzeiten.</p>
    <div class="btn-col">
      <button class="btn soft" data-action="share-changes">${icon('phone')}Änderungen teilen</button>
      <label class="btn soft" for="exchangeInput">${icon('upload')}Austausch empfangen</label>
    </div>
    ${ex ? `<p class="note" role="status">${esc(ex.text)}</p>${ex.peer ? `<div class="btn-col"><button class="btn soft" data-action="send-answer">${icon('phone')}Antwort senden</button></div>` : ''}` : ''}`;
}
/* Drawing the server box. It is only rewritten when its visible content changes: status changes with no visible
   consequence (busy on every short sync) do nothing, and when only the line under the title changes, such as the
   „zuletzt abgeglichen“ timestamp, only its text is swapped. fresh: right after the sheet was drawn, when the box is
   still empty. */
let boxFrame = ''; // the box as last written, without the line under the title
export function paintServerBox(fresh = false){
  const box = $('#serverBox'); if (!box) return;
  const notice = syncInfo(), frame = serverSection({...notice, detail:''});
  if (fresh || frame !== boxFrame) {
    if (!fresh && document.activeElement?.tagName === 'INPUT' && box.contains(document.activeElement)) return; // do not interrupt while typing
    boxFrame = frame; box.innerHTML = serverSection(notice);
    return;
  }
  const line = $('.srv small', box);
  if (line && line.textContent !== notice.detail) line.textContent = notice.detail;
}

/* Datenschutz: explains both modes factually, without promises; opened from the settings, section „Daten“ */
const PRIVACY = ['Tiere, Futter und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.',
  'Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.',
  'Den Text auf einer Packung liest das Handy selbst, ohne Netz. Mehr kann eine Einstellung unter „Haushalt“, sie ist aus: Die Produktsuche im Internet fragt bei unbekannten Barcodes zwei freie Produktdatenbanken, übertragen wird nur die Nummer.',
  'Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Der schickt Packungsfotos zur Erkennung an Anthropic und unbekannte Barcodes, nur die Nummer, an freie Produktdatenbanken.',
  'Ein Backup und das Löschen aller Daten findest du in den Einstellungen unter „Daten“. „Änderungen teilen“ unter „Haushalt“ gibt eine Datei mit Tieren, Futter und Mahlzeiten an ein anderes Handy weiter, ohne Server.'];
const viewPrivacy = () => `<div class="sh-head"><h2>Datenschutz</h2>${closeBtn}</div><div class="privacy">${PRIVACY.map(t => `<p>${t}</p>`).join('')}</div>`;

const VIEWS = {serving:viewServing, feed:viewFeed, new:viewName, product:viewProduct, pet:viewPet, settings:viewSettings, report:viewReport, privacy:viewPrivacy};
/* An unchanged view is left alone: a change from the server redraws every open sheet, and rewriting it would throw
   away the decoded photos, the scroll position and the focus for nothing. Empty body: freshly opened, always draw.
   The boxes the views fill afterwards are drawn every time, because their contents are not part of this comparison. */
let drawn = '';
setSheetView(state => {
  const html = VIEWS[state.kind](), fresh = html !== drawn || !sheetBody.firstChild; // no children: closed in between
  if (fresh) {
    drawn = html;
    sheetBody.innerHTML = html;
    if (state.step === 'crop') mountCrop($('#cropStage'), state.cropImg, state.crop, $('#f-zoom')); // hangs listeners on: exactly once per drawing
  }
  if (state.kind === 'settings') paintServerBox(fresh);
  if (state.step === 'name' || state.kind === 'new') renderSuggestions();
  if (state.at) { const at = state.at; state.at = null; requestAnimationFrame(() => $('#' + at)?.scrollIntoView({block:'start'})); } // opened at a given day
});
