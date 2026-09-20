/* Servieren: bekannte Sorte oder Foto. Im Haushalt erkennt der Server das Foto im Hintergrund, im Modus „lokal“ wird die
   Sorte gleich eingetippt (Status noserver). Das Foto bleibt auf diesem Handy, abgeglichen wird nur die Vorschau. */
import {uid} from '../fields.js';
import {canTakePhoto, haptic, takePhoto} from '../native.js';
import {db, prefs, save, savePrefs} from '../store.js';
import {isConnected} from '../sync.js';
import {byMe, defaultPets, findProduct, getPet, getProduct, getServing, petMap, petNames, pname} from '../derive.js';
import {cropSquare, fileToImage, memPhotos, resize} from '../images.js';
import {milestones} from '../smart.js';
import {recognize} from '../recognize.js';
import {toast} from '../ui/toast.js';
import {closeSheet, dlg, openSheet, renderSheet, sheet, sheetBody} from '../ui/sheet.js';
import {openCamera} from '../ui/camera.js';
import {fabFill, homeView, scrollTop, update} from '../views/home.js';
import {applyProduct, cleanupProduct, linkProduct} from './products.js';
import {planReminder} from './reminders.js';

export function serveProduct(pid, scanCode = ''){
  const p = getProduct(pid); if (!p) return;
  const {ids} = defaultPets(p);
  const s = {id:uid(), productId:null, servedAt:Date.now(), pets:petMap(ids), note:'', ...byMe(), ...(scanCode ? {scanCode} : {})};
  db.servings.unshift(s);
  linkProduct(s, p); prefs.lastPets = ids; // setzt Sorte und zuletzt gefütterte Tiere, hängt einen gescannten Code an
  save(); savePrefs(); served(s.id);
  const msg = `${pname(p)} serviert${db.pets.length > 1 ? ' für ' + petNames(ids) : ''}`;
  update(); scrollTop(); toast(withMilestone(msg), () => undoServe(s.id));
}
/* Meilenstein im Toast der Aktion, die ihn erreicht: „… serviert. Die 100. Mahlzeit!“ oder „… 10 Sorten probiert!“. Jede Schwelle
   nur einmal pro Gerät (prefs.milestones). Was schon überschritten ist, etwa durch ein anderes Handy, gilt still als gesehen. */
function withMilestone(msg){
  const m = milestones(db), fresh = m.reached.filter(k => !prefs.milestones.includes(k));
  if (!fresh.length) return msg;
  prefs.milestones.push(...fresh); savePrefs();
  const notes = [fresh.includes(`meals:${m.meals}`) && `Zum ${m.meals}. Mal gefüttert!`, fresh.includes(`sorts:${m.sorts}`) && `${m.sorts} Sorten probiert!`].filter(Boolean);
  return notes.length ? `${msg}${/[.!?…]$/.test(msg) ? '' : '.'} ${notes.join(' ')}` : msg;
}
/* Befriedigende Rückmeldung: Vibration, der Napf im Füttern-Button füllt sich, der Eintrag gleitet in „Heute“;
   dazu die Erinnerung zum Bewerten, wenn sie eingeschaltet ist */
function served(id){ haptic('success'); homeView.fresh = id; fabFill(); planReminder(getServing(id)); }
function undoServe(id){
  const s = getServing(id); if (!s) return;
  db.servings = db.servings.filter(x => x.id !== id);
  memPhotos.delete(id); tries.delete(id);
  if (s.productId) cleanupProduct(s.productId);
  if (sheet?.kind === 'serving' && sheet.id === id) closeSheet(); // wird gerade benannt (Modus „lokal“)
  save(); update();
}

/* Packungsfoto aufnehmen und servieren. Ohne Kamera oder Kamerarecht geht es über die Kamera-App (Foto-Plugin), im
   Browser über das Datei-Eingabefeld. Liefert true, wenn serviert wurde; nach „Abbrechen“ bleibt das Füttern-Sheet offen. */
export async function shootPhoto(hint, scanCode = ''){
  let blob = null;
  try { blob = await openCamera(hint || 'Packung fotografieren'); }
  catch (e) {
    console.warn('Eigene Kamera:', e?.name || '', e?.message || e);
    if (!canTakePhoto()) { if (scanCode) toast(hint); document.getElementById('camInputSheet').click(); return false; } // Browser: der Foto-Knopf übernimmt einen gescannten Code
    try { blob = await takePhoto(hint); }
    catch (err) { if (!/abgebrochen/.test(String(err?.message))) toast('Die Kamera ließ sich nicht öffnen. Ist sie für Schmeckt’s in den Android-Einstellungen erlaubt?'); }
  }
  if (blob) await servePhoto(blob, scanCode);
  return !!blob;
}

/* Foto: sofort als serviert speichern, Erkennung läuft im Hintergrund – kein Warten.
   scanCode: gescannter, noch unbekannter Barcode, er kommt an die erkannte oder benannte Sorte. */
export async function servePhoto(file, scanCode = ''){
  if (!file || !db.pets.length) return;
  let img;
  try { img = await fileToImage(file); } catch (e) { toast('Das Foto ließ sich nicht lesen.'); return; }
  const full = resize(img, 1100, .82), local = !isConnected();
  const {ids, auto} = defaultPets(null);
  const s = {id:uid(), productId:null, servedAt:Date.now(), pets:petMap(ids), note:'', ...byMe(),
    photo:resize(img, 480, .74), thumb:cropSquare(img, 200, .76), status:local ? 'noserver' : 'recognizing', autoPets:auto, ...(scanCode ? {scanCode} : {})};
  db.servings.unshift(s);
  memPhotos.set(s.id, full.split(',')[1]);
  prefs.lastPets = ids;
  save(); savePrefs(); served(s.id);
  if (dlg.open) await closeSheet();
  update(); scrollTop();
  if (local) openSheet({kind:'serving', id:s.id, step:'name', brand:'', variety:'', type:'Nassfutter'}); // Sorte direkt eintippen
  toast(withMilestone(`Serviert${db.pets.length > 1 ? ' für ' + petNames(ids) : ''}${local ? '' : '. Sorte wird erkannt …'}`), () => undoServe(s.id));
  if (!local) recognizeServing(s.id);
}

const running = new Set();                    // laufende Erkennungen
const tries = new Map();                      // Mahlzeit → {n, next}: Versuche, frühester nächster Versuch
const PAUSE = [0, 30e3, 2 * 60e3, 10 * 60e3, 30 * 60e3]; // danach kein automatischer Versuch mehr

export function retryNow(id){ tries.delete(id); recognizeServing(id); }

async function recognizeServing(id){
  const s = getServing(id); if (!s || running.has(id)) return;
  const b64 = memPhotos.get(id) || (s.photo || '').split(',')[1];
  if (!b64) {
    if (!s.productId && s.status) { s.status = 'failed'; s.error = 'Das Foto ist nicht mehr da. Bitte die Sorte eintragen.'; save(); refreshServing(id); }
    return;
  }
  running.add(id);
  s.status = 'recognizing'; delete s.error; save(); refreshServing(id);
  let recognized = null, err = null;
  try { recognized = await recognize(b64); } catch (e) { err = e; console.warn('Erkennung fehlgeschlagen:', e.message); }
  running.delete(id);
  const cur = getServing(id); if (!cur) return;
  if (cur.productId) { settle(cur); save(); refreshServing(id); return; } // inzwischen benannt, hier oder auf einem anderen Handy
  const brand = String(recognized?.brand || '').trim(), variety = String(recognized?.variety || '').trim();
  if (brand || variety) {
    tries.delete(id);
    refinePets(cur, findProduct(brand, variety), recognized.animal);
    applyProduct(cur, {brand, variety, type:recognized.type, animal:recognized.animal, texture:recognized.texture});
    if (sheet?.kind === 'serving' && sheet.id === id && sheet.step === 'name' && !sheet.brand && !sheet.variety) sheet.step = null;
  } else if (err?.kind === 'none') {
    cur.status = 'noserver'; delete cur.error; // inzwischen getrennt: wie ein Foto im Modus „lokal“
  } else if (err?.retry) {
    const t = tries.get(id) || {n:0, next:0};
    if (err.kind !== 'offline' || err.timeout) t.n++; // Server nicht erreichbar kostet nichts und zählt nicht
    if (t.n < PAUSE.length) {
      t.next = Date.now() + (err.kind === 'busy' ? 90e3 : PAUSE[t.n]);
      tries.set(id, t);
      cur.status = 'waiting';
      cur.error = err.kind === 'offline' && !err.timeout ? 'Der Server ist gerade nicht erreichbar. Die Sorte wird erkannt, sobald er wieder da ist.'
        : `${err.message} Die App versucht es später automatisch noch einmal.`;
    } else { tries.delete(id); cur.status = 'failed'; cur.error = err.message; }
  } else {
    cur.status = 'failed'; cur.error = err ? err.message : 'Packung nicht erkannt.';
  }
  save(); refreshServing(id);
}

function settle(s){ // benannt, hier oder auf einem anderen Handy: Foto und Erkennungsstatus werden nicht mehr gebraucht
  const p = getProduct(s.productId);
  if (p) linkProduct(s, p); // räumt auf und hängt einen gescannten Code an
  else { delete s.photo; delete s.status; delete s.error; delete s.autoPets; memPhotos.delete(s.id); }
  tries.delete(s.id);
}

/* Server wieder erreichbar: wartende Fotos nacheinander erkennen */
let retrying = false;
export async function retryWaiting(){
  if (retrying || !isConnected()) return;
  retrying = true;
  try {
    for (const s of [...db.servings]) {
      if (s.productId) { if (s.status || s.photo) { settle(s); save(); refreshServing(s.id); } continue; }
      if (s.status !== 'waiting' && s.status !== 'noserver') continue;
      if ((tries.get(s.id)?.next || 0) > Date.now()) continue;
      await recognizeServing(s.id);
    }
  } finally { retrying = false; }
}

function refreshServing(id){
  update();
  if (sheet?.kind !== 'serving' || sheet.id !== id) return;
  const typing = document.activeElement && sheetBody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (sheet.step !== 'name' || !typing) renderSheet();
}

/* Tiere nachschärfen, solange sie nur geraten waren:
   wer bekam dieses Futter sonst? Sonst nach Tierart auf der Packung. */
export function refinePets(s, known, animalHint){
  if (!s.autoPets || db.pets.length < 2 || Object.values(s.pets).some(x => x.r)) return;
  let pref = (known?.lastPets || []).filter(pid => getPet(pid));
  if (!pref.length) { const animal = known?.animal || animalHint; pref = db.pets.filter(x => x.species === animal).map(x => x.id); }
  if (pref.length) s.pets = petMap(pref);
}
