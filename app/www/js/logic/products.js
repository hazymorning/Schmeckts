/* Creating, filling, merging and tidying up food varieties. Barcodes only reach a variety in linkProduct, and there
   they reach every variety a scanned meal (scanCode) is given: that is how a multipack grows, and a wrongly
   recognised variety disappears together with its code. */
import {uid} from '../fields.js';
import {guessTexture, SPECIES, textureOf, TYPES, typeOf} from '../config.js';
import {db, dbFound, loadError, save} from '../store.js';
import {setAside} from '../disk.js';
import {shareText} from '../native.js';
import {findProduct, getProduct, shoppingList} from '../derive.js';
import {memPhotos} from '../images.js';
import {keepPhoto, keptPhoto, passPhoto, photoData, photoFrom, sweepPhotos} from '../photos.js';
import {request} from '../api.js';
import {serverCan} from '../sync.js';
import {report} from '../report.js';
import {memLines} from '../recognize.js';
import {toast} from '../ui/toast.js';

/* The manual buying setting, which holds household-wide and takes precedence over the computed verdict:
   'immer', 'nicht' or anything else for „Automatisch“ (the field is dropped and null is synced) */
export function setKaufen(id, v) {
  const p = getProduct(id);
  if (!p) return;
  if (v === 'immer' || v === 'nicht') p.kaufen = v;
  else delete p.kaufen;
  save();
}

/* Passing on the shopping list, matching the pet filter: through the share menu, or the clipboard without one */
export async function shareShopping() {
  const {title, text} = shoppingList();
  try {
    if ((await shareText(title, text)) === 'copied') toast('Liste kopiert');
  } catch {
    // shareText() swallows a cancel itself, so anything left here is a real failure of the share menu
    toast('Die Liste konnte nicht geteilt werden.');
  }
}

export function cleanupProduct(pid) {
  if (!db.servings.some(s => s.productId === pid)) db.products = db.products.filter(p => p.id !== pid);
}
/* Consistency or treat type after recognition, a barcode hit, naming and choosing. The human's choice wins
   (userType, null = none). Otherwise an existing value stays; an empty field is filled from the server's value, then
   from the keywords in brand and variety. Anything that does not fit the type is dropped (null is synced). */
export function applyTexture(p, details = {}) {
  const fits = v => (textureOf(p, v) ? v : null);
  const v =
    details.userType && details.texture !== undefined
      ? fits(details.texture)
      : fits(p.texture) || fits(details.texture) || guessTexture(p);
  if (v) p.texture = v;
  else delete p.texture;
}
export function toggleTexture(id, v) {
  // the choice in the food sheet; a second tap clears it
  const p = getProduct(id);
  if (!p) return;
  applyTexture(p, {texture: p.texture === v ? null : v, userType: true});
  save();
}
export function newProduct(details, id = uid()) {
  const p = {
    id,
    brand: details.brand || '',
    variety: details.variety || '',
    type: typeOf(details),
    animal: SPECIES.some(x => x.k === details.animal) ? details.animal : null,
    thumb: details.thumb || null,
    lastPets: [],
    codes: {},
    createdAt: Date.now(),
  };
  applyTexture(p, details);
  db.products.push(p);
  return p;
}
export function applyProduct(s, details) {
  let p = findProduct(details.brand, details.variety);
  if (!p) p = newProduct({...details, thumb: s.thumb});
  else {
    if (details.userType && TYPES.includes(details.type)) p.type = details.type;
    applyTexture(p, details);
  }
  linkProduct(s, p);
  return p;
}
export function linkProduct(s, p) {
  const prev = s.productId;
  if (!p.thumb && s.thumb) p.thumb = s.thumb;
  s.productId = p.id;
  p.lastPets = Object.keys(s.pets);
  if (s.scanCode) (p.codes ||= {})[s.scanCode] = true;
  keepPhoto(p.id, memPhotos.get(s.id) || s.photo?.split(',')[1], s.id); // the meal's photo becomes the variety's
  delete s.photo;
  delete s.thumb;
  delete s.status;
  delete s.error;
  delete s.autoPets;
  delete s.guess;
  memPhotos.delete(s.id);
  memLines.delete(s.id);
  if (prev && prev !== p.id) {
    // Corrected: the photo goes along when it came from this meal or its variety is left without a meal, and so
    // does the thumbnail in the second case
    const last = !db.servings.some(x => x.productId === prev),
      was = getProduct(prev);
    if (last && !p.thumb && was?.thumb) p.thumb = was.thumb;
    if (last || photoFrom(prev) === s.id) passPhoto(prev, p.id);
    cleanupProduct(prev);
  }
}
export function mergeProducts(from, into) {
  passPhoto(from.id, into.id);
  db.servings.forEach(s => {
    if (s.productId === from.id) s.productId = into.id;
  });
  if (!into.thumb && from.thumb) into.thumb = from.thumb;
  Object.assign((into.codes ||= {}), from.codes); // the barcodes come along
  applyTexture(into, {texture: from.texture});
  db.products = db.products.filter(p => p.id !== from.id);
}

/* A change from another phone moved meals from a variety that is gone to another one (merged or corrected there):
   the photo follows them, since the next start would otherwise tidy it away with the old variety. Run at start,
   after every save here and after every change from elsewhere, so it always knows the step before. */
let owners = new Map(); // meal → its variety, as of the last look
export function followPhotos() {
  for (const s of db.servings) {
    const was = owners.get(s.id);
    if (was && s.productId && was !== s.productId && !getProduct(was)) passPhoto(was, s.productId);
  }
  owners = new Map(db.servings.map(s => [s.id, s.productId]));
}

/* In a household every variety whose large photo lies on this phone and not yet on the server goes there, one after
   the other, whenever the server has just been reached. The mark on the variety then tells the other phones they can
   fetch it. A server that cannot keep photos (before 1.3.0) is left alone, and one it refused is not sent again while
   the app runs. */
let sharing = false;
const refused = new Set();
export async function sharePhotos() {
  if (sharing || !(await serverCan('photo'))) return;
  sharing = true;
  try {
    for (const {id} of db.products.filter(x => !x.sharedPhoto && keptPhoto(x.id) && !refused.has(x.id))) {
      const image = await photoData(id);
      if (!image) continue;
      try {
        await request('POST', '/api/photo/' + id, {body: {image}, timeout: 60e3});
      } catch (e) {
        if (e.kind !== 'bad') throw e;
        refused.add(id); // no JPEG, too large, or a variety the server does not know
        continue;
      }
      const p = getProduct(id);
      if (p && !p.sharedPhoto) {
        p.sharedPhoto = true;
        save();
      }
    }
  } catch (e) {
    if (e.kind !== 'offline') report('handing a photo to the server', e); // offline: the next time the server is reached
  } finally {
    sharing = false;
  }
}
/* The household server has no photo for a variety marked as having one: the mark goes, so no phone offers it any
   more, and a phone that still holds the photo hands it over anew */
export function unsharePhoto(p) {
  if (!p.sharedPhoto) return;
  delete p.sharedPhoto;
  save();
}

/* At start: the photos of varieties that are gone (deleted here or elsewhere) go too. Not while the stored data
   could not be read, nor while a data file that could not be read lies set aside: until it is restored, the
   varieties it holds may come back, so a broken db.json never takes the photos with it. */
export async function tidyPhotos() {
  if (loadError || !dbFound || (await setAside())) return;
  sweepPhotos(new Set([...db.products.map(p => p.id), ...db.servings.map(s => s.productId).filter(Boolean)]));
}
