/* Rating, naming and deleting meals and food varieties, and removing a variety's barcodes. */
import {haptic} from '../native.js';
import {RATINGS} from '../config.js';
import {settled} from '../motion.js';
import {hasLine, withLine, withoutLine} from '../ocr.js';
import {db, save} from '../store.js';
import {byMe, findProduct, getPet, getProduct, getServing, pname} from '../derive.js';
import {toast} from '../ui/toast.js';
import {closeSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';
import {applyProduct, applyTexture, linkProduct, mergeProducts, newProduct} from './products.js';
import {refinePets, retryNow, serveProduct} from './feeding.js';

export function rate(el) {
  const s = getServing(el.dataset.s),
    pid = el.dataset.p,
    r = el.dataset.r;
  if (!s || !s.pets[pid] || !RATINGS[r]) return;
  const prev = {...s.pets[pid]};
  s.pets[pid] = {r, at: Date.now(), ...byMe()};
  save();
  haptic('select');
  el.classList.add('picked');
  const pet = getPet(pid);
  const msg = `${RATINGS[r].label} gespeichert${db.pets.length > 1 && pet ? ' für ' + pet.name : ''}`;
  showRated(el, s, pid, msg, undoRating(s.id, pid, prev));
}

/* Puts the rating that was there back, wherever the tap came from */
const undoRating = (sid, pid, prev) => () => {
  const cur = getServing(sid);
  if (!cur || !cur.pets[pid]) return;
  cur.pets[pid] = prev;
  save();
  update();
  if (sheet?.kind === 'serving' && sheet.id === sid) renderSheet();
};

/* The rating is stored and felt on the tap; the interface follows once the button's pop, or the card's fold, has
   run, so neither is cut off */
function showRated(el, s, pid, msg, undo) {
  const rated = () => Object.values(s.pets).every(x => x.r);
  if (sheet?.kind === 'serving') {
    // In the sheet: with the last open rating it closes, otherwise it shows the new state
    if (rated()) {
      settled(el)
        .then(() => closeSheet())
        .then(() => afterRating(msg, undo));
      return;
    }
    settled(el).then(() => {
      renderSheet();
      update();
    });
    toast(msg, undo);
    return;
  }
  // On the home page: with everything rated the card animates out first
  const li = el.closest('.pend'),
    gone = li && rated();
  if (gone) li.classList.add('leaving');
  settled(gone ? li : el).then(() => afterRating(msg, undo));
}
function afterRating(msg, undo) {
  update();
  toast(msg, undo);
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
  closeSheet().then(() => serveProduct(p.id));
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
/* A line read off the packaging, tapped: it goes into the field last touched, otherwise into „Marke“ while that is
   still empty and into „Sorte“ after that. A second tap takes it out again, wherever it ended up. */
export function togglePackLine(line) {
  if (!sheet) return;
  haptic('select');
  const here = ['brand', 'variety'].find(f => hasLine(sheet[f], line));
  if (here) sheet[here] = withoutLine(sheet[here], line);
  else {
    const f = sheet.lastField || (String(sheet.brand || '').trim() ? 'variety' : 'brand');
    sheet[f] = withLine(sheet[f], line);
  }
  renderSheet();
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
  } else if (sheet.kind === 'new') closeSheet().then(() => serveProduct(p.id));
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
