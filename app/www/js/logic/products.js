/* Creating, filling, merging and tidying up food varieties. Barcodes only reach a variety in linkProduct, and there
   they reach every variety a scanned meal (scanCode) is given: that is how a multipack grows, and a wrongly
   recognised variety disappears together with its code. */
import {uid} from '../fields.js';
import {guessTexture, SPECIES, textureOf, TYPES, typeOf} from '../config.js';
import {db, save} from '../store.js';
import {shareText} from '../native.js';
import {findProduct, getProduct, shoppingList} from '../derive.js';
import {memPhotos} from '../images.js';
import {toast} from '../ui/toast.js';

/* The manual buying setting, which holds household-wide and takes precedence over the computed verdict:
   'immer', 'nicht' or anything else for „Automatisch“ (the field is dropped and null is synced) */
export function setKaufen(id, v){
  const p = getProduct(id); if (!p) return;
  if (v === 'immer' || v === 'nicht') p.kaufen = v; else delete p.kaufen;
  save();
}

/* Passing on the shopping list, matching the pet filter: through the share menu, or the clipboard without one */
export async function shareShopping(){
  const {title, text} = shoppingList();
  try { if (await shareText(title, text) === 'copied') toast('Liste kopiert'); }
  catch (e) { toast('Die Liste konnte nicht geteilt werden.'); }
}

export function cleanupProduct(pid){
  if (!db.servings.some(s => s.productId === pid)) db.products = db.products.filter(p => p.id !== pid);
}
/* Consistency or treat type after recognition, a barcode hit, naming and choosing. The human's choice wins
   (userType, null = none). Otherwise an existing value stays; an empty field is filled from the server's value, then
   from the keywords in brand and variety. Anything that does not fit the type is dropped (null is synced). */
export function applyTexture(p, details = {}){
  const fits = v => textureOf(p, v) ? v : null;
  const v = details.userType && details.texture !== undefined ? fits(details.texture) : fits(p.texture) || fits(details.texture) || guessTexture(p);
  if (v) p.texture = v; else delete p.texture;
}
export function toggleTexture(id, v){ // the choice in the food sheet; a second tap clears it
  const p = getProduct(id); if (!p) return;
  applyTexture(p, {texture:p.texture === v ? null : v, userType:true}); save();
}
export function newProduct(details, id = uid()){
  const p = {id, brand:details.brand || '', variety:details.variety || '', type:typeOf(details),
    animal:SPECIES.some(x => x.k === details.animal) ? details.animal : null, thumb:details.thumb || null, lastPets:[], codes:{}, createdAt:Date.now()};
  applyTexture(p, details);
  db.products.push(p); return p;
}
export function applyProduct(s, details){
  let p = findProduct(details.brand, details.variety);
  if (!p) p = newProduct({...details, thumb:s.thumb});
  else { if (details.userType && TYPES.includes(details.type)) p.type = details.type; applyTexture(p, details); }
  linkProduct(s, p);
  return p;
}
export function linkProduct(s, p){
  const prev = s.productId;
  if (!p.thumb && s.thumb) p.thumb = s.thumb;
  s.productId = p.id;
  p.lastPets = Object.keys(s.pets);
  if (s.scanCode) (p.codes ||= {})[s.scanCode] = true;
  delete s.photo; delete s.thumb; delete s.status; delete s.error; delete s.autoPets; delete s.guess;
  memPhotos.delete(s.id);
  if (prev && prev !== p.id) cleanupProduct(prev);
}
export function mergeProducts(from, into){
  db.servings.forEach(s => { if (s.productId === from.id) s.productId = into.id; });
  if (!into.thumb && from.thumb) into.thumb = from.thumb;
  Object.assign(into.codes ||= {}, from.codes); // the barcodes come along
  applyTexture(into, {texture:from.texture});
  db.products = db.products.filter(p => p.id !== from.id);
}
