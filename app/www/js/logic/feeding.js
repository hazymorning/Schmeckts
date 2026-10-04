// the photo stays on this phone, only the preview is synced
import {$} from '../dom.js';
import {uid} from '../fields.js';
import {addSentence, esc} from '../text.js';
import {canTakePhoto, haptic, takePhoto} from '../native.js';
import {report} from '../report.js';
import {db, prefs, save, savePrefs} from '../store.js';
import {
  byMe,
  calledNames,
  defaultPets,
  findProduct,
  getPet,
  getProduct,
  getServing,
  petMap,
  petNames,
  pname,
  sortOf,
} from '../derive.js';
import {cropSquare, fileToImage, memPhotos, photoOf, readable, resize} from '../images.js';
import {textSquare} from '../ocr.js';
import {keepPhoto} from '../photos.js';
import {milestones} from '../smart.js';
import {identify, memLines, photoByServer, READ_PATIENCE, readingSince} from '../recognize.js';
import {toast} from '../ui/toast.js';
import {closeAll, closeSheet, isClosing, openSheet, renderSheet, sheet, topBody} from '../ui/sheet.js';
import {openCamera} from '../ui/camera.js';
import {fabFill, homeView, scrollTop, update} from '../views/home.js';
import {lower, record} from '../views/parts.js';
import {applyProduct, cleanupProduct, linkProduct, replaceProductPhoto} from './products.js';
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
  prefs.lastPets = ids;
  save();
  savePrefs();
  served(s.id);
  const msg = `${pname(p)} serviert. ${onRecord(p) || `Guten Appetit, ${calledNames(ids, s.id)}!`}`;
  update();
  scrollTop();
  toast(withMilestone(msg), () => undoServe(s.id), {ic: 'bowl'});
}
// a variety that goes down badly, or that nobody buys any more, shows its record as it is served
function onRecord(p) {
  const past = record(sortOf(p.id));
  return past ? `Zuletzt ${lower(past)}.` : '';
}
// each milestone is announced once per device
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
  return notes.length ? addSentence(msg, notes.join(' ')) : msg;
}
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
  memLines.delete(id);
  tries.delete(id);
  if (s.productId) cleanupProduct(s.productId);
  if (sheet?.kind === 'serving' && sheet.id === id) closeSheet();
  save();
  update();
}

// null on cancel, or when the file input took over (its photo arrives through actions.js)
async function packagingPhoto(hint, input, scanCode = '') {
  try {
    return await openCamera(hint || 'Packung fotografieren');
  } catch (e) {
    report('our own camera', e);
    if (!canTakePhoto()) {
      if (scanCode) toast(hint);
      document.getElementById(input).click();
      return null;
    }
    try {
      return await takePhoto(hint);
    } catch (err) {
      if (!/cancelled/.test(String(err?.message)))
        toast('Die Kamera ließ sich nicht öffnen. Ist sie für Schmeckt’s in den Android-Einstellungen erlaubt?');
      return null;
    }
  }
}
export async function shootPhoto(hint, scanCode = '') {
  const blob = await packagingPhoto(hint, 'camInputSheet', scanCode);
  if (blob) await servePhoto(blob, scanCode);
  return !!blob;
}
let shooting = null; // the variety the browser's file input is for
export async function reshootProduct(pid) {
  if (!getProduct(pid)) return;
  shooting = pid;
  const blob = await packagingPhoto('', 'camInputProduct');
  if (blob) await productPhotoFile(blob);
}
export async function productPhotoFile(file, pid = shooting) {
  if (!getProduct(pid) || !file) return;
  let img;
  try {
    img = await fileToImage(file);
  } catch {
    toast('Das Foto ließ sich nicht lesen.');
    return;
  }
  replaceProductPhoto(pid, img);
  renderSheet();
  update();
}
export async function rephoto() {
  const id = sheet?.kind === 'serving' && sheet.step === 'name' ? sheet.id : null;
  if (!id) return;
  const blob = await packagingPhoto('', 'camInputName');
  if (blob) await replacePhoto(id, blob);
}

// scanCode: an unknown barcode, attached to the variety once it is known
export async function servePhoto(file, scanCode = '') {
  if (!file || !db.pets.length) return;
  let img;
  try {
    img = await fileToImage(file);
  } catch {
    toast('Das Foto ließ sich nicht lesen.');
    return;
  }
  const full = resize(img, 1100, 0.82),
    local = !photoByServer();
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
  await closeAll();
  update();
  scrollTop();
  if (local) openSheet({kind: 'serving', id: s.id, step: 'name', brand: '', variety: '', type: 'Nassfutter'});
  toast(
    withMilestone(
      `Serviert${db.pets.length > 1 ? ' für ' + petNames(ids) : ''}${local ? '' : '. Sorte wird erkannt …'}`,
    ),
    () => undoServe(s.id),
    {ic: 'bowl'},
  );
  // the large copy for reading is made only once the meal is on screen
  (local ? readable(img) : Promise.resolve(''))
    .catch(e => {
      report('the photo for reading', e);
      return ''; // read the 1100 px copy instead
    })
    .then(sharp => recognizeServing(s.id, sharp));
}

// sizes as in servePhoto(); everything the old photo brought goes
export async function replacePhoto(id, file) {
  const s = getServing(id);
  if (!s || s.productId || !file) return;
  let img;
  try {
    img = await fileToImage(file);
  } catch {
    toast('Das Foto ließ sich nicht lesen.');
    return;
  }
  running.delete(id); // a run for the old photo no longer counts
  const full = resize(img, 1100, 0.82);
  s.photo = resize(img, 480, 0.74);
  s.thumb = cropSquare(img, 200, 0.76);
  s.status = photoByServer() ? 'recognizing' : 'noserver';
  delete s.guess;
  delete s.error;
  memPhotos.set(id, full.split(',')[1]);
  memLines.delete(id);
  tries.delete(id);
  if (sheet?.kind === 'serving' && sheet.id === id)
    Object.assign(sheet, {brand: '', variety: '', type: 'Nassfutter', texture: undefined});
  save();
  readable(img)
    .catch(e => {
      report('the photo for reading', e);
      return '';
    })
    .then(sharp => recognizeServing(id, sharp));
}

const running = new Map(); // meal → the photo being recognised, so a new photo supersedes the run
const tries = new Map(); // meal → {n, next}: attempts and the earliest next one
const PAUSE = [0, 30e3, 2 * 60e3, 10 * 60e3, 30 * 60e3]; // ms; no automatic attempt after the last
const BUSY_PAUSE = 90e3; // the server's cost brake lets one photo through per 90 s

export function retryNow(id) {
  tries.delete(id);
  recognizeServing(id);
}

async function recognizeServing(id, sharp = '') {
  const s = getServing(id);
  if (!s) return;
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
  if (running.get(id) === b64) return;
  running.set(id, b64);
  const house = photoByServer();
  s.status = house ? 'recognizing' : 'reading';
  delete s.error;
  readingSince.set(id, Date.now());
  if (!house)
    setTimeout(() => {
      if (getServing(id)?.status === 'reading') refreshServing(id);
    }, READ_PATIENCE);
  save();
  refreshServing(id);
  let found = {source: '', error: null};
  try {
    found = await identify({code: s.scanCode || '', photo: b64, sharp, meal: id});
  } catch (e) {
    report('recognition', e);
  }
  const thumb = found.read && (await textThumb(b64, found.read));
  if (running.get(id) !== b64) return; // superseded by a new photo
  running.delete(id);
  readingSince.delete(id);
  const cur = getServing(id);
  if (!cur) return;
  if (cur.productId)
    settle(cur); // named meanwhile, here or on another phone
  else {
    if (thumb) cur.thumb = thumb; // first, as linking hands the thumbnail on to the variety
    takeResult(cur, found, house);
  }
  save();
  refreshServing(id);
}

// the square around the packaging's text; null keeps the centre square
async function textThumb(b64, read) {
  try {
    const img = await photoOf(b64),
      square = textSquare(read, img.width, img.height);
    return square && cropSquare(img, 200, 0.76, square);
  } catch (e) {
    report('the thumbnail around the text', e);
    return null;
  }
}

function takeResult(s, found, house) {
  const err = found.error;
  if (found.lines?.length || found.brands?.length)
    memLines.set(s.id, {lines: found.lines || [], brands: found.brands || []});
  if (found.products?.length) {
    tries.delete(s.id);
    if (found.source === 'text') recognized(s, found.products[0]);
    else linkProduct(s, found.products[0]);
  } else if (found.details && found.source !== 'text') {
    tries.delete(s.id);
    refinePets(s, findProduct(found.details.brand, found.details.variety), found.details.animal);
    applyProduct(s, found.details);
    if (sheet?.kind === 'serving' && sheet.id === s.id && sheet.step === 'name' && !sheet.brand && !sheet.variety)
      sheet.step = null;
  } else if (found.details) {
    // read by the phone: a person confirms it while naming
    tries.delete(s.id);
    s.guess = found.details;
    s.status = 'noserver';
    delete s.error;
    fillName(s.id, found.details);
  } else if (!house) {
    s.status = 'noserver';
    delete s.error;
  } else if (err?.retry) {
    waitForAnotherTry(s, err);
  } else {
    s.status = 'failed';
    s.error = err ? err.message : 'Packung nicht erkannt.';
  }
}

// keeps what linking changes for as long as the toast offers to undo it
function recognized(s, p) {
  const was = {
    photo: s.photo,
    thumb: s.thumb,
    guess: {
      brand: p.brand || '',
      variety: p.variety || '',
      type: p.type || '',
      ...(p.texture ? {texture: p.texture} : {}),
    },
    mem: memPhotos.get(s.id),
    lines: memLines.get(s.id),
    product: {thumb: p.thumb, lastPets: p.lastPets, code: !s.scanCode || !!p.codes?.[s.scanCode]},
  };
  linkProduct(s, p);
  const naming = sheet?.kind === 'serving' && sheet.id === s.id,
    said = `<b>${esc(pname(p))}</b> erkannt und serviert`,
    past = onRecord(p);
  (naming ? closeSheet() : Promise.resolve()).then(() =>
    toast(past ? addSentence(said, esc(past)) : said, () => unrecognize(s.id, p.id, was), {
      ic: 'bowl',
      html: true,
    }),
  );
}
// undoes the recognition, not the meal; a photo keepPhoto() wrote stays, it shows the right packaging
function unrecognize(id, pid, was) {
  const s = getServing(id),
    p = getProduct(pid);
  if (!s || s.productId !== pid) return;
  s.productId = null;
  s.status = 'noserver';
  s.guess = was.guess;
  if (was.photo) s.photo = was.photo;
  if (was.thumb) s.thumb = was.thumb;
  if (was.mem) memPhotos.set(id, was.mem);
  if (was.lines) memLines.set(id, was.lines);
  if (p) {
    if (was.product.thumb) p.thumb = was.product.thumb;
    else delete p.thumb;
    if (was.product.lastPets) p.lastPets = was.product.lastPets;
    else delete p.lastPets;
    if (!was.product.code) delete p.codes[s.scanCode];
  }
  save();
  update();
  openSheet({kind: 'serving', id, step: 'name', ...guessOf(s)});
}

function waitForAnotherTry(s, err) {
  const t = tries.get(s.id) || {n: 0, next: 0};
  if (err.kind !== 'offline' || err.timeout) t.n++; // an unreachable server costs nothing, so it does not count
  if (t.n >= PAUSE.length) {
    tries.delete(s.id);
    s.status = 'failed';
    s.error = err.message;
    return;
  }
  t.next = Date.now() + (err.kind === 'busy' ? BUSY_PAUSE : PAUSE[t.n]);
  tries.set(s.id, t);
  s.status = 'waiting';
  s.error =
    err.kind === 'offline' && !err.timeout
      ? 'Der Server ist gerade nicht erreichbar. Die Sorte wird erkannt, sobald er wieder da ist.'
      : `${err.message} Die App versucht es später automatisch noch einmal.`;
}

// empty fields only, written straight into the input so typing in the other field keeps its place
function fillName(id, guess) {
  if (sheet?.kind !== 'serving' || sheet.id !== id || sheet.step !== 'name') return;
  const typed = ['brand', 'variety'].filter(f => String(sheet[f] || '').trim());
  for (const f of ['brand', 'variety']) {
    if (typed.includes(f) || !guess[f]) continue;
    sheet[f] = guess[f];
    const el = $('#f-' + f);
    if (el) el.value = guess[f];
  }
  if (!typed.length) Object.assign(sheet, {type: guess.type || sheet.type, texture: guess.texture});
}
export const guessOf = s => ({
  brand: s?.guess?.brand || '',
  variety: s?.guess?.variety || '',
  type: s?.guess?.type || 'Nassfutter',
  texture: s?.guess?.texture,
});

function settle(s) {
  const p = getProduct(s.productId);
  if (p) linkProduct(s, p);
  else {
    keepPhoto(s.productId, memPhotos.get(s.id) || s.photo?.split(',')[1], s.id); // the variety has not arrived here yet
    delete s.photo;
    delete s.status;
    delete s.error;
    delete s.autoPets;
    delete s.guess;
    memPhotos.delete(s.id);
    memLines.delete(s.id);
  }
  tries.delete(s.id);
}

// refresh false: the caller redraws everything anyway
export function settleNamed(refresh = true) {
  const named = db.servings.filter(s => s.productId && (s.status || s.photo));
  for (const s of named) settle(s);
  if (!named.length) return;
  save();
  if (refresh) for (const s of named) refreshServing(s.id);
}

let retrying = false;
export async function retryWaiting() {
  settleNamed();
  if (retrying || !photoByServer()) return;
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
      if (s.guess) continue; // a person confirms the phone's reading while naming
      if ((tries.get(s.id)?.next || 0) > Date.now()) continue;
      await recognizeServing(s.id);
    }
  } finally {
    retrying = false;
  }
}

function refreshServing(id) {
  update();
  if (isClosing() || sheet?.kind !== 'serving' || sheet.id !== id) return;
  const typing =
    document.activeElement && topBody().contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (sheet.step !== 'name' || !typing) renderSheet();
}

export function refinePets(s, known, animalHint) {
  if (!s.autoPets || db.pets.length < 2 || Object.values(s.pets).some(x => x.r)) return;
  let pref = (known?.lastPets || []).filter(pid => getPet(pid));
  if (!pref.length) {
    const animal = known?.animal || animalHint;
    pref = db.pets.filter(x => x.species === animal).map(x => x.id);
  }
  if (pref.length) s.pets = petMap(pref);
}
