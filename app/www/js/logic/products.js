// barcodes reach a variety only in linkProduct, so a multipack grows and a wrong variety takes its code with it
import {uid} from '../fields.js';
import {serverNow} from '../clock.js';
import {guessTexture, textureOf, TYPES, typeOf} from '../config.js';
import {db, dbFound, loadError, prefs, save, savePrefs} from '../store.js';
import {setAside} from '../disk.js';
import {shareText} from '../native.js';
import {findProduct, getProduct, shoppingList} from '../derive.js';
import {cropSquare, memPhotos, resize} from '../images.js';
import {
  keepPhoto,
  keptPhoto,
  passPhoto,
  photoData,
  photoFrom,
  replacePhotoFile,
  serverStamp,
  sweepPhotos,
} from '../photos.js';
import {ServerError, request} from '../api.js';
import {isConnected, serverCan, status} from '../sync.js';
import {report} from '../report.js';
import {memLines} from '../recognize.js';
import {toast} from '../ui/toast.js';

// overrides the computed verdict household-wide; any other value means automatic
export function setKaufen(id, v) {
  const p = getProduct(id);
  if (!p) return;
  if (v === 'immer' || v === 'nicht') p.kaufen = v;
  else delete p.kaufen;
  save();
}

export async function shareShopping() {
  const {title, text} = shoppingList();
  try {
    if ((await shareText(title, text)) === 'copied') toast('Liste kopiert');
  } catch {
    // shareText() already swallows a cancel
    toast('Die Liste konnte nicht geteilt werden.');
  }
}

export function cleanupProduct(pid) {
  if (!db.servings.some(s => s.productId === pid)) db.products = db.products.filter(p => p.id !== pid);
}
// the person's choice wins (userType, null = none), then an existing value, the server's, the keywords
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
  keepPhoto(p.id, memPhotos.get(s.id) || s.photo?.split(',')[1], s.id);
  delete s.photo;
  delete s.thumb;
  delete s.status;
  delete s.error;
  delete s.autoPets;
  delete s.guess;
  memPhotos.delete(s.id);
  memLines.delete(s.id);
  if (prev && prev !== p.id) {
    // corrected: the photo follows if it came from this meal or the old variety has no meal left
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
  Object.assign((into.codes ||= {}), from.codes);
  applyTexture(into, {texture: from.texture});
  db.products = db.products.filter(p => p.id !== from.id);
}

// meals moved off a variety that is gone: the photo follows, or the next start would sweep it away
let owners = new Map(); // meal → its variety at the last look
export function followPhotos() {
  for (const s of db.servings) {
    const was = owners.get(s.id);
    if (was && s.productId && was !== s.productId && !getProduct(was)) passPhoto(was, s.productId);
  }
  owners = new Map(db.servings.map(s => [s.id, s.productId]));
}

export function replaceProductPhoto(pid, img) {
  const p = getProduct(pid);
  if (!p) return;
  replacePhotoFile(pid, resize(img, 1100, 0.82).split(',')[1]);
  p.thumb = cropSquare(img, 200, 0.76);
  prefs.photoStamps[pid] = Math.max(serverNow(), serverStamp(p) + 1); // newer than the household's, whatever the clocks say
  save();
  savePrefs();
  if (isConnected()) sharePhotos();
}

// a photo replaced here waits until the server has it: this phone's stamp above the household's mark
const newerHere = () => db.products.filter(p => p.sharedPhoto && (prefs.photoStamps[p.id] || 0) > serverStamp(p));

// servers without the photo or replace feature keep what they have; a first upload never overwrites a numeric mark
let sharing = false,
  toldOld = false;
const refused = new Set();
// one photo to the server. A refused photo or an unreadable file is skipped from then on; anything else on the
// server's side ends the round, and the next contact tries again.
async function upload(id) {
  try {
    const image = await photoData(id);
    if (!image) return false;
    await request('POST', '/api/photo/' + id, {body: {image}, timeout: 60e3});
    return true;
  } catch (e) {
    if (e instanceof ServerError && e.kind !== 'bad') throw e;
    if (!(e instanceof ServerError)) report('reading a photo to share', e);
    refused.add(id);
    return false;
  }
}
export async function sharePhotos() {
  if (sharing) return;
  sharing = true;
  try {
    const replaced = newerHere().filter(p => !refused.has(p.id));
    if (replaced.length && !(await serverCan('replace'))) {
      if (status.features && !toldOld) toast('Der Server behält das alte Foto, bis er aktualisiert ist.');
      toldOld ||= !!status.features;
      if (!status.features) return; // out of reach: tried again on the next contact
    } else
      for (const p of replaced)
        if (await upload(p.id)) {
          p.sharedPhoto = prefs.photoStamps[p.id];
          save();
        }
    if (!(await serverCan('photo'))) return;
    for (const {id} of db.products.filter(x => !x.sharedPhoto && keptPhoto(x.id) && !refused.has(x.id))) {
      const p = getProduct(id);
      if ((await upload(id)) && p && !p.sharedPhoto) {
        p.sharedPhoto = prefs.photoStamps[id] || true;
        save();
      }
    }
  } catch (e) {
    if (e.kind !== 'offline') report('handing a photo to the server', e); // offline: retried on the next contact
  } finally {
    sharing = false;
  }
}
// the server has no photo for it: no phone offers it any more, and one still holding it uploads it again
export function unsharePhoto(p) {
  if (!p.sharedPhoto) return;
  delete p.sharedPhoto;
  save();
}

// not while a broken or set-aside db.json could still bring varieties back
export async function tidyPhotos() {
  if (loadError || !dbFound || (await setAside())) return;
  sweepPhotos(new Set([...db.products.map(p => p.id), ...db.servings.map(s => s.productId).filter(Boolean)]));
}
