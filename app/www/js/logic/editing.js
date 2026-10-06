import {haptic} from '../native.js';
import {$} from '../dom.js';
import {hasLine} from '../ocr.js';
import {db, save} from '../store.js';
import {findProduct, getProduct, getServing, pname} from '../derive.js';
import {toast} from '../ui/toast.js';
import {closeAll, closeSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';
import {renderSuggestions, showError} from '../views/sheets.js';
import {applyProduct, applyTexture, linkProduct, mergeProducts, newProduct} from './products.js';
import {refinePets, retryNow, serveProduct} from './feeding.js';

export function saveName() {
  const s = sheet;
  const brand = (s.brand || '').trim(),
    variety = (s.variety || '').trim();
  if (!brand && !variety) {
    showError('Bitte Marke oder Sorte eintragen.');
    $('#f-brand')?.focus();
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
// the other variety a rename would turn this one into, which merges the two
export function mergeTarget() {
  const s = sheet;
  if (s?.kind !== 'product' || s.step !== 'name') return null;
  const other = findProduct((s.brand || '').trim(), (s.variety || '').trim());
  return other && other.id !== s.id ? other : null;
}
function renameProduct(id, details) {
  const p = getProduct(id);
  if (!p) return;
  Object.assign(p, {brand: details.brand, variety: details.variety, type: details.type});
  applyTexture(p, details);
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
  if (sheet[field]) showError('');
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
      toast('Mit der vorhandenen Sorte zusammengeführt');
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
