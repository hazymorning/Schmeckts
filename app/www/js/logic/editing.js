import {haptic} from '../native.js';
import {RATINGS} from '../config.js';
import {rateCls} from '../smart.js';
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

// a level the meal already holds stays as it is (a second tap, Enter twice)
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
    `${RATINGS[r].label}${db.pets.length > 1 && pet ? ' für ' + pet.name : ''}. ${RATINGS[r].cheer}`,
    undoRating(s.id, pid, prev),
    {ic: 'r_' + r, tone: rateCls(r)},
  );
  showRated(disc, s, pid);
}

const undoRating = (sid, pid, prev) => () => {
  const cur = getServing(sid);
  if (!cur || !cur.pets[pid]) return;
  cur.pets[pid] = prev;
  save();
  update();
  renderSheet();
};

// a fully rated meal stays put for a moment so it can be corrected; a finger still on a slider holds it longer
const HOLD = 1500; // ms
const holds = new Map(); // meal id → its newest hold, so an older one ending does nothing
let lastHold = 0;
const rated = s => Object.values(s.pets).every(x => x.r);
function showRated(disc, s, pid) {
  const inSheet = sheet?.kind === 'serving' && sheet.id === s.id;
  if (!inSheet) {
    // the row stays until the pop has run
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
  if (!s || !rated(s)) return; // undone meanwhile, or given another pet
  if (inSheet) {
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
  closeAll().then(() => serveProduct(p.id)); // the meal is rated on the home page
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
function backFromNaming() {
  sheet.step = null;
  renderSheet();
  update();
}
// the field is written, not redrawn, so the focus stays where it was
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
      renderSheet();
      // deleted while its photo was being read: that result was dropped, so read it again
      if (!s.productId && (s.status === 'reading' || s.status === 'recognizing')) retryNow(s.id);
    });
  });
}
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
