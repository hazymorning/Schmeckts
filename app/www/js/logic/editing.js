/* Rating, naming and deleting meals and food varieties, and removing a variety's barcodes. */
import {haptic} from '../native.js';
import {RATINGS} from '../config.js';
import {settled} from '../motion.js';
import {$} from '../dom.js';
import {hasLine} from '../ocr.js';
import {db, save} from '../store.js';
import {byMe, findProduct, getPet, getProduct, getServing, pname} from '../derive.js';
import {toast} from '../ui/toast.js';
import {closeAll, closeSheet, renderSheet, sheet, topDialog} from '../ui/sheet.js';
import {setLevel, untouched} from '../ui/slider.js';
import {viewerOpen} from '../ui/viewer.js';
import {homeView, update} from '../views/home.js';
import {renderSuggestions} from '../views/sheets.js';
import {applyProduct, applyTexture, linkProduct, mergeProducts, newProduct} from './products.js';
import {refinePets, retryNow, serveProduct} from './feeding.js';

/* Rates what a meal was for one pet, from a level's button on the rating slider, which then shows the level, pops
   and says it under the track. The toast confirms at once, with „Rückgängig“. A level the meal already holds stays
   as it is: a second tap, Enter twice. */
export function rate(el) {
  const s = getServing(el.dataset.s),
    pid = el.dataset.p,
    r = el.dataset.r;
  if (!s || !s.pets[pid] || !RATINGS[r] || s.pets[pid].r === r) return;
  const prev = {...s.pets[pid]};
  s.pets[pid] = {r, at: Date.now(), ...byMe()};
  save();
  haptic('success');
  const disc = setLevel(el.closest('.slider'), r),
    pet = getPet(pid);
  toast(
    `${RATINGS[r].label} gespeichert${db.pets.length > 1 && pet ? ' für ' + pet.name : ''}`,
    undoRating(s.id, pid, prev),
  );
  showRated(disc, s, pid);
}

/* Puts the rating that was there back, wherever the tap came from */
const undoRating = (sid, pid, prev) => () => {
  const cur = getServing(sid);
  if (!cur || !cur.pets[pid]) return;
  cur.pets[pid] = prev;
  save();
  update();
  renderSheet(); // the meal's sheet, or the page it was opened from once that sheet has gone
};

/* Once every pet of a meal is rated, the meal stays where it was rated for a moment, to be read and put right with
   another slide; then the card in „Wie war’s?“ folds away, or the sheet closes. Rated again, the moment starts over;
   a finger still on a slider holds it until it lifts. */
const HOLD = 1500; // ms
const holds = new Map(); // meal id → the number of its newest hold: an older one that ends leaves the meal alone
let lastHold = 0;
const rated = s => Object.values(s.pets).every(x => x.r);
function showRated(disc, s, pid) {
  const inSheet = sheet?.kind === 'serving' && sheet.id === s.id;
  if (!inSheet) {
    // the pet's row stays in „Wie war’s?“ while the meal does, the rest of the home page follows once the pop has run
    if (!homeView.held.has(s.id)) homeView.held.set(s.id, new Set());
    homeView.held.get(s.id).add(pid);
  }
  settled(disc)
    .then(untouched)
    .then(() => update());
  if (!rated(s)) {
    holds.delete(s.id);
    return;
  }
  const mine = ++lastHold;
  holds.set(s.id, mine);
  setTimeout(() => untouched().then(() => holds.get(s.id) === mine && finish(s.id, inSheet)), HOLD);
}
function finish(sid, inSheet) {
  holds.delete(sid);
  const s = getServing(sid);
  if (!s || !rated(s)) return; // undone in the meantime, or given another pet
  if (inSheet) {
    // not while something is typed there or the sheet has moved on
    const busy = document.activeElement?.matches('input, textarea') && topDialog()?.contains(document.activeElement);
    if (sheet?.kind === 'serving' && sheet.id === sid && !sheet.step && !busy && !viewerOpen()) closeSheet();
    return;
  }
  const li = document.querySelector(`.pend[data-id="${sid}"]`),
    gone = () => {
      homeView.held.delete(sid);
      update();
    };
  if (!li) return gone();
  li.classList.add('leaving');
  settled(li).then(gone);
}

/* „Speichern“ while naming, from three places: a meal gets its variety, „Neues Futter“ serves it straight
   away, and the food sheet renames an existing variety. */
export function saveName() {
  const s = sheet;
  const brand = (s.brand || '').trim(),
    variety = (s.variety || '').trim();
  if (!brand && !variety) {
    toast('Bitte Marke oder Sorte eintragen.');
    return;
  }
  const details = {brand, variety, type: s.type, texture: s.texture, userType: true};
  haptic('success');
  if (s.kind === 'serving') nameServing(s.id, details);
  else if (s.kind === 'new') serveNewProduct(details);
  else if (s.kind === 'product') renameProduct(s.id, details);
}
function nameServing(id, details) {
  const sv = getServing(id);
  if (!sv) return;
  refinePets(sv, findProduct(details.brand, details.variety), null);
  applyProduct(sv, details);
  save();
  backFromNaming();
}
function serveNewProduct(details) {
  const p = findProduct(details.brand, details.variety) || newProduct(details);
  p.type = details.type;
  applyTexture(p, details);
  save();
  closeAll().then(() => serveProduct(p.id)); // serving ends on the home page, where the meal is rated
}
function renameProduct(id, details) {
  const p = getProduct(id);
  if (!p) return;
  const other = findProduct(details.brand, details.variety);
  if (other && other.id !== p.id) {
    mergeProducts(p, other);
    sheet.id = other.id;
    toast('Mit vorhandenem Futter zusammengeführt');
  } else {
    Object.assign(p, {brand: details.brand, variety: details.variety, type: details.type});
    applyTexture(p, details);
  }
  save();
  backFromNaming();
}
/* Back from „Futter benennen“ to the sheet it was opened from */
function backFromNaming() {
  sheet.step = null;
  renderSheet();
  update();
}
/* A chip read off the packaging, tapped: its field takes the chip's text in place of what was there, and a tap on
   the pressed one, the one the field holds already, clears the field. The field on screen is written, not redrawn,
   and only the chips are drawn anew, so the focus stays where it was. */
export function setPackLine(field, line) {
  if (!sheet || !['brand', 'variety'].includes(field)) return;
  haptic('select');
  sheet[field] = hasLine(sheet[field], line) ? '' : line;
  const el = $('#f-' + field);
  if (el) el.value = sheet[field];
  renderSuggestions();
}

export function useProduct(pid) {
  const p = getProduct(pid);
  if (!p || !sheet) return;
  haptic('select');
  if (sheet.kind === 'serving') {
    const sv = getServing(sheet.id);
    if (!sv) return;
    refinePets(sv, p, null);
    linkProduct(sv, p);
    save();
    sheet.step = null;
    renderSheet();
    update();
  } else if (sheet.kind === 'new') closeAll().then(() => serveProduct(p.id));
  else if (sheet.kind === 'product') {
    const cur = getProduct(sheet.id);
    if (cur && cur.id !== p.id) {
      mergeProducts(cur, p);
      save();
      sheet.id = p.id;
      sheet.step = null;
      renderSheet();
      update();
      toast('Mit vorhandenem Futter zusammengeführt');
    }
  }
}
export function deleteServing(id) {
  const idx = db.servings.findIndex(s => s.id === id);
  if (idx < 0) return;
  const [s] = db.servings.splice(idx, 1);
  let removed = null;
  const p = getProduct(s.productId);
  if (p && !db.servings.some(x => x.productId === p.id)) {
    removed = p;
    db.products = db.products.filter(x => x !== p);
  }
  save();
  haptic('strong');
  closeSheet().then(() => {
    update();
    toast('Eintrag gelöscht', () => {
      if (removed && !getProduct(removed.id)) db.products.push(removed);
      db.servings.push(s);
      db.servings.sort((a, b) => b.servedAt - a.servedAt);
      save();
      update();
      renderSheet(); // the page it was deleted from, „Verlauf“
      // Deleted while the photo was being read: that result was dropped meanwhile, so it is read again
      if (!s.productId && (s.status === 'reading' || s.status === 'recognizing')) retryNow(s.id);
    });
  });
}
/* Remove a barcode from the food sheet, for instance when it is stuck on the wrong variety. Undo puts it back. */
export function removeCode(code) {
  const p = getProduct(sheet?.id);
  if (!p?.codes?.[code]) return;
  delete p.codes[code];
  save();
  haptic('strong');
  renderSheet();
  toast('Barcode entfernt', () => {
    const cur = getProduct(p.id);
    if (!cur) return;
    (cur.codes ||= {})[code] = true;
    save();
    if (sheet?.kind === 'product' && sheet.id === cur.id) renderSheet();
  });
}
export function deleteProduct() {
  const id = sheet.id,
    p = getProduct(id);
  if (!p) return;
  db.products = db.products.filter(x => x.id !== id);
  db.servings = db.servings.filter(s => s.productId !== id);
  save();
  haptic('strong');
  closeSheet().then(() => {
    update();
    toast(`${pname(p)} gelöscht`);
  });
}
