/* Serving: a known variety or a photo. In a household the server recognises the photo in the background; in mode
   `lokal` the variety is typed in right away (status noserver). The photo stays on this phone and only the preview
   is synced. */
import {uid} from '../fields.js';
import {canTakePhoto, haptic, takePhoto} from '../native.js';
import {db, prefs, save, savePrefs} from '../store.js';
import {isConnected} from '../sync.js';
import {byMe, defaultPets, findProduct, getPet, getProduct, getServing, petMap, petNames, pname} from '../derive.js';
import {cropSquare, fileToImage, memPhotos, resize} from '../images.js';
import {milestones} from '../smart.js';
import {identify} from '../recognize.js';
import {toast} from '../ui/toast.js';
import {closeSheet, dlg, openSheet, renderSheet, sheet, sheetBody} from '../ui/sheet.js';
import {openCamera} from '../ui/camera.js';
import {fabFill, homeView, scrollTop, update} from '../views/home.js';
import {applyProduct, cleanupProduct, linkProduct} from './products.js';
import {planReminder} from './reminders.js';

export function serveProduct(pid, scanCode = '') {
  const p = getProduct(pid);
  if (!p) return;
  const {ids} = defaultPets(p);
  const s = {
    id: uid(),
    productId: null,
    servedAt: Date.now(),
    pets: petMap(ids),
    note: '',
    ...byMe(),
    ...(scanCode ? {scanCode} : {}),
  };
  db.servings.unshift(s);
  linkProduct(s, p);
  prefs.lastPets = ids; // sets the variety and the pets fed last, and attaches a scanned code
  save();
  savePrefs();
  served(s.id);
  const msg = `${pname(p)} serviert${db.pets.length > 1 ? ' für ' + petNames(ids) : ''}`;
  update();
  scrollTop();
  toast(withMilestone(msg), () => undoServe(s.id));
}
/* A milestone in the toast of the action that reaches it: „… serviert. Die 100. Mahlzeit!“ or „… 10 Sorten
   probiert!“. Each threshold only once per device (prefs.milestones). Anything already passed, by another phone for
   instance, counts silently as seen. */
function withMilestone(msg) {
  const m = milestones(db),
    fresh = m.reached.filter(k => !prefs.milestones.includes(k));
  if (!fresh.length) return msg;
  prefs.milestones.push(...fresh);
  savePrefs();
  const notes = [
    fresh.includes(`meals:${m.meals}`) && `Zum ${m.meals}. Mal gefüttert!`,
    fresh.includes(`sorts:${m.sorts}`) && `${m.sorts} Sorten probiert!`,
  ].filter(Boolean);
  return notes.length ? `${msg}${/[.!?…]$/.test(msg) ? '' : '.'} ${notes.join(' ')}` : msg;
}
/* Satisfying feedback: haptics, the bowl in the feeding button fills up, the entry slides into „Heute“;
   plus the rating reminder, if it is switched on */
function served(id) {
  haptic('success');
  homeView.fresh = id;
  fabFill();
  planReminder(getServing(id));
}
function undoServe(id) {
  const s = getServing(id);
  if (!s) return;
  db.servings = db.servings.filter(x => x.id !== id);
  memPhotos.delete(id);
  tries.delete(id);
  if (s.productId) cleanupProduct(s.productId);
  if (sheet?.kind === 'serving' && sheet.id === id) closeSheet(); // is being named right now (mode `lokal`)
  save();
  update();
}

/* Take a photo of the packaging and serve. Without a camera or the camera permission it goes through the camera app
   (photo plugin), and through the file input in the browser. Returns true when something was served; after
   „Abbrechen“ the feeding sheet stays open. */
export async function shootPhoto(hint, scanCode = '') {
  let blob = null;
  try {
    blob = await openCamera(hint || 'Packung fotografieren');
  } catch (e) {
    console.warn('Eigene Kamera:', e?.name || '', e?.message || e);
    if (!canTakePhoto()) {
      if (scanCode) toast(hint);
      document.getElementById('camInputSheet').click();
      return false;
    } // browser: the photo button takes over a scanned code
    try {
      blob = await takePhoto(hint);
    } catch (err) {
      if (!/cancelled/.test(String(err?.message)))
        toast('Die Kamera ließ sich nicht öffnen. Ist sie für Schmeckt’s in den Android-Einstellungen erlaubt?');
    }
  }
  if (blob) await servePhoto(blob, scanCode);
  return !!blob;
}

/* Photo: save it as served at once, with recognition running in the background — no waiting.
   scanCode: a scanned barcode still unknown; it goes onto the recognised or named variety. */
export async function servePhoto(file, scanCode = '') {
  if (!file || !db.pets.length) return;
  let img;
  try {
    img = await fileToImage(file);
  } catch (e) {
    toast('Das Foto ließ sich nicht lesen.');
    return;
  }
  const full = resize(img, 1100, 0.82),
    local = !isConnected();
  const {ids, auto} = defaultPets(null);
  const s = {
    id: uid(),
    productId: null,
    servedAt: Date.now(),
    pets: petMap(ids),
    note: '',
    ...byMe(),
    photo: resize(img, 480, 0.74),
    thumb: cropSquare(img, 200, 0.76),
    status: local ? 'noserver' : 'recognizing',
    autoPets: auto,
    ...(scanCode ? {scanCode} : {}),
  };
  db.servings.unshift(s);
  memPhotos.set(s.id, full.split(',')[1]);
  prefs.lastPets = ids;
  save();
  savePrefs();
  served(s.id);
  if (dlg.open) await closeSheet();
  update();
  scrollTop();
  if (local) openSheet({kind: 'serving', id: s.id, step: 'name', brand: '', variety: '', type: 'Nassfutter'}); // type the variety in directly
  toast(
    withMilestone(
      `Serviert${db.pets.length > 1 ? ' für ' + petNames(ids) : ''}${local ? '' : '. Sorte wird erkannt …'}`,
    ),
    () => undoServe(s.id),
  );
  recognizeServing(s.id); // the recognition chain decides what is possible — in mode `lokal` the phone reads the text
}

const running = new Set(); // recognitions in flight
const tries = new Map(); // meal → {n, next}: attempts, and the earliest next attempt
const PAUSE = [0, 30e3, 2 * 60e3, 10 * 60e3, 30 * 60e3]; // no automatic attempt after that

export function retryNow(id) {
  tries.delete(id);
  recognizeServing(id);
}

async function recognizeServing(id) {
  const s = getServing(id);
  if (!s || running.has(id)) return;
  const b64 = memPhotos.get(id) || (s.photo || '').split(',')[1];
  if (!b64) {
    if (!s.productId && s.status) {
      s.status = 'failed';
      s.error = 'Das Foto ist nicht mehr da. Bitte die Sorte eintragen.';
      save();
      refreshServing(id);
    }
    return;
  }
  running.add(id);
  const house = isConnected(); // in a household the server recognises, otherwise the phone reads the text on the photo
  s.status = house ? 'recognizing' : 'reading';
  delete s.error;
  save();
  refreshServing(id);
  let found = {source: '', error: null};
  try {
    found = await identify({code: s.scanCode || '', photo: b64});
  } catch (e) {
    console.warn('Erkennung:', e?.message || e);
  }
  running.delete(id);
  const cur = getServing(id);
  if (!cur) return;
  if (cur.productId) {
    settle(cur);
    save();
    refreshServing(id);
    return;
  } // named meanwhile, here or on another phone
  const err = found.error;
  if (found.products?.length) {
    // the barcode now belongs to a known variety
    tries.delete(id);
    linkProduct(cur, found.products[0]);
  } else if (found.details && found.source !== 'text') {
    tries.delete(id);
    refinePets(cur, findProduct(found.details.brand, found.details.variety), found.details.animal);
    applyProduct(cur, found.details);
    if (sheet?.kind === 'serving' && sheet.id === id && sheet.step === 'name' && !sheet.brand && !sheet.variety)
      sheet.step = null;
  } else if (found.details) {
    // read by the phone: a human confirms or changes it while naming
    tries.delete(id);
    cur.guess = found.details;
    cur.status = 'noserver';
    delete cur.error;
    fillName(id, found.details);
  } else if (!house || err?.kind === 'none') {
    cur.status = 'noserver';
    delete cur.error; // no server and no key: the variety gets typed in
  } else if (err?.retry) {
    const t = tries.get(id) || {n: 0, next: 0};
    if (err.kind !== 'offline' || err.timeout) t.n++; // an unreachable server costs nothing and does not count
    if (t.n < PAUSE.length) {
      t.next = Date.now() + (err.kind === 'busy' ? 90e3 : PAUSE[t.n]);
      tries.set(id, t);
      cur.status = 'waiting';
      cur.error =
        err.kind === 'offline' && !err.timeout
          ? 'Der Server ist gerade nicht erreichbar. Die Sorte wird erkannt, sobald er wieder da ist.'
          : `${err.message} Die App versucht es später automatisch noch einmal.`;
    } else {
      tries.delete(id);
      cur.status = 'failed';
      cur.error = err.message;
    }
  } else {
    cur.status = 'failed';
    cur.error = err ? err.message : 'Packung nicht erkannt.';
  }
  save();
  refreshServing(id);
}

/* Write the brand and variety that were read into the open naming flow, as long as nothing has been typed there */
function fillName(id, guess) {
  if (sheet?.kind !== 'serving' || sheet.id !== id || sheet.step !== 'name' || sheet.brand || sheet.variety) return;
  Object.assign(sheet, {
    brand: guess.brand || '',
    variety: guess.variety || '',
    type: guess.type || sheet.type,
    texture: guess.texture,
  });
}
/* What the phone read prefills the form while naming (actions.js) */
export const guessOf = s => ({
  brand: s?.guess?.brand || '',
  variety: s?.guess?.variety || '',
  type: s?.guess?.type || 'Nassfutter',
  texture: s?.guess?.texture,
});

function settle(s) {
  // named, here or on another phone: photo and recognition status are no longer needed
  const p = getProduct(s.productId);
  if (p)
    linkProduct(s, p); // tidies up and attaches a scanned code
  else {
    delete s.photo;
    delete s.status;
    delete s.error;
    delete s.autoPets;
    delete s.guess;
    memPhotos.delete(s.id);
  }
  tries.delete(s.id);
}

/* Server reachable again: recognise the waiting photos one after another */
let retrying = false;
export async function retryWaiting() {
  if (retrying || !isConnected()) return;
  retrying = true;
  try {
    for (const s of [...db.servings]) {
      if (s.productId) {
        if (s.status || s.photo) {
          settle(s);
          save();
          refreshServing(s.id);
        }
        continue;
      }
      if (s.status !== 'waiting' && s.status !== 'noserver') continue;
      if (s.guess) continue; // the phone has already read the text, a human confirms it while naming
      if ((tries.get(s.id)?.next || 0) > Date.now()) continue;
      await recognizeServing(s.id);
    }
  } finally {
    retrying = false;
  }
}

function refreshServing(id) {
  update();
  if (sheet?.kind !== 'serving' || sheet.id !== id) return;
  const typing =
    document.activeElement && sheetBody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (sheet.step !== 'name' || !typing) renderSheet();
}

/* Sharpen up the pets while they were only guessed:
   who else had this food? Failing that, by the species on the packaging. */
export function refinePets(s, known, animalHint) {
  if (!s.autoPets || db.pets.length < 2 || Object.values(s.pets).some(x => x.r)) return;
  let pref = (known?.lastPets || []).filter(pid => getPet(pid));
  if (!pref.length) {
    const animal = known?.animal || animalHint;
    pref = db.pets.filter(x => x.species === animal).map(x => x.id);
  }
  if (pref.length) s.pets = petMap(pref);
}
