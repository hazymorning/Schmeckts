/* Rating, naming and deleting meals and food varieties, and removing a variety's barcodes. */
import {haptic} from '../native.js';
import {RATINGS} from '../config.js';
import {db, save} from '../store.js';
import {byMe, findProduct, getPet, getProduct, getServing, pname} from '../derive.js';
import {toast} from '../ui/toast.js';
import {closeSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';
import {applyProduct, applyTexture, linkProduct, mergeProducts, newProduct} from './products.js';
import {refinePets, serveProduct} from './feeding.js';

export function rate(el){
  const s = getServing(el.dataset.s), pid = el.dataset.p, r = el.dataset.r;
  if (!s || !s.pets[pid] || !RATINGS[r]) return;
  const prev = {...s.pets[pid]};
  s.pets[pid] = {r, at:Date.now(), ...byMe()};
  save(); haptic('select');
  el.classList.add('picked');
  const pet = getPet(pid);
  const msg = `${RATINGS[r].label} gespeichert${db.pets.length > 1 && pet ? ' für ' + pet.name : ''}`;
  const undo = () => {
    const cur = getServing(s.id); if (!cur || !cur.pets[pid]) return;
    cur.pets[pid] = prev; save(); update();
    if (sheet?.kind === 'serving' && sheet.id === s.id) renderSheet();
  };
  if (sheet?.kind === 'serving') {
    if (Object.values(s.pets).every(x => x.r)) setTimeout(() => closeSheet().then(() => { update(); toast(msg, undo); }), 260);
    else { setTimeout(() => { renderSheet(); update(); }, 220); toast(msg, undo); }
  } else {
    // on the home page: everything rated, and the card closes quietly
    const li = el.closest('.pend'), gone = li && !Object.values(s.pets).some(x => !x.r);
    if (gone) li.classList.add('leaving');
    setTimeout(() => { update(); toast(msg, undo); }, gone ? 440 : 220);
  }
}

export function saveName(){
  const s = sheet;
  const brand = (s.brand || '').trim(), variety = (s.variety || '').trim();
  if (!brand && !variety) { toast('Bitte Marke oder Sorte eintragen.'); return; }
  const details = {brand, variety, type:s.type, texture:s.texture, userType:true};
  haptic('success');
  if (s.kind === 'serving') {
    const sv = getServing(s.id); if (!sv) return;
    refinePets(sv, findProduct(brand, variety), null);
    applyProduct(sv, details); save();
    sheet.step = null; renderSheet(); update();
  } else if (s.kind === 'new') {
    const p = findProduct(brand, variety) || newProduct(details);
    p.type = s.type; applyTexture(p, details); save();
    closeSheet().then(() => serveProduct(p.id));
  } else if (s.kind === 'product') {
    const p = getProduct(s.id); if (!p) return;
    const other = findProduct(brand, variety);
    if (other && other.id !== p.id) { mergeProducts(p, other); sheet.id = other.id; toast('Mit vorhandenem Futter zusammengeführt'); }
    else { Object.assign(p, {brand, variety, type:s.type}); applyTexture(p, details); }
    save(); sheet.step = null; renderSheet(); update();
  }
}
export function useProduct(pid){
  const p = getProduct(pid); if (!p || !sheet) return;
  haptic('select');
  if (sheet.kind === 'serving') {
    const sv = getServing(sheet.id); if (!sv) return;
    refinePets(sv, p, null);
    linkProduct(sv, p); save(); sheet.step = null; renderSheet(); update();
  } else if (sheet.kind === 'new') closeSheet().then(() => serveProduct(p.id));
  else if (sheet.kind === 'product') {
    const cur = getProduct(sheet.id);
    if (cur && cur.id !== p.id) { mergeProducts(cur, p); save(); sheet.id = p.id; sheet.step = null; renderSheet(); update(); toast('Mit vorhandenem Futter zusammengeführt'); }
  }
}
export function deleteServing(id){
  const idx = db.servings.findIndex(s => s.id === id); if (idx < 0) return;
  const [s] = db.servings.splice(idx, 1);
  let removed = null;
  const p = getProduct(s.productId);
  if (p && !db.servings.some(x => x.productId === p.id)) { removed = p; db.products = db.products.filter(x => x !== p); }
  save(); haptic('strong');
  closeSheet().then(() => { update(); toast('Eintrag gelöscht', () => {
    if (removed && !getProduct(removed.id)) db.products.push(removed);
    db.servings.push(s); db.servings.sort((a, b) => b.servedAt - a.servedAt);
    save(); update();
  }); });
}
/* Remove a barcode from the food sheet, for instance when it is stuck on the wrong variety. Undo puts it back. */
export function removeCode(code){
  const p = getProduct(sheet?.id); if (!p?.codes?.[code]) return;
  delete p.codes[code];
  save(); haptic('strong'); renderSheet();
  toast('Barcode entfernt', () => {
    const cur = getProduct(p.id); if (!cur) return;
    (cur.codes ||= {})[code] = true; save();
    if (sheet?.kind === 'product' && sheet.id === cur.id) renderSheet();
  });
}
export function deleteProduct(){
  const id = sheet.id, p = getProduct(id); if (!p) return;
  db.products = db.products.filter(x => x.id !== id);
  db.servings = db.servings.filter(s => s.productId !== id);
  save(); haptic('strong');
  closeSheet().then(() => { update(); toast(`${pname(p)} gelöscht`); });
}
