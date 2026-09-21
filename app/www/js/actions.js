/* Alle Klicks laufen über data-action und das Objekt ACTIONS. Dazu Eingaben, Tastatur, Dateiauswahl
   und die Deep Links schmeckts://fuettern, schmeckts://scan und schmeckts://foto. Meldet sich beim Laden selbst an. */
import {$, reduceMotion} from './dom.js';
import {when} from './dates.js';
import {haptic} from './native.js';
import {REMIND_MAX_H, textureOf} from './config.js';
import {db, prefs, save, savePrefs} from './store.js';
import {checkServer, disconnect, retrySync, startSession} from './sync.js';
import {getProduct, getServing} from './derive.js';
import {applyTheme} from './ui/theme.js';
import {hideToast, toast, toastUndo} from './ui/toast.js';
import {closeSheet, openSheet, renderSheet, sheet} from './ui/sheet.js';
import {expandCard, showOlderDays, timelineGroups, toggleOverview, update} from './views/home.js';
import {paintServerBox, renderServeHits, renderSuggestions} from './views/sheets.js';
import {guessOf, retryNow, servePhoto, serveProduct, shootPhoto} from './logic/feeding.js';
import {deleteProduct, deleteServing, rate, removeCode, saveName, useProduct} from './logic/editing.js';
import {setKaufen, shareShopping, toggleTexture} from './logic/products.js';
import {setFeedRemind, setRemind} from './logic/reminders.js';
import {scan} from './logic/scan.js';
import {addAlbumPhotos, albumToProfile, closeCrop, deletePet, openPet, removeAlbumPhoto, savePet, setPetPhoto} from './logic/pets.js';
import {exportData, importData, loadDemo, purgeDemo, wipe} from './logic/data.js';
import {receiveFile, receiveUri, shareChanges} from './logic/exchange.js';

/* Mit dem Haushalt verbinden: erst Adresse, Protokoll und Code prüfen, dann Beispieldaten entfernen und abgleichen */
async function connectServer(){
  if (sheet?.kind !== 'settings' || sheet.connecting) return;
  Object.assign(sheet, {connecting:true, connectError:''}); renderSheet();
  try {
    const found = await checkServer(sheet.code, sheet.server ?? prefs.server);
    purgeDemo();
    const first = startSession(found);
    haptic('success');
    if (sheet?.kind === 'settings') { Object.assign(sheet, {connecting:false, connectForm:false, code:'', editServer:false, server:undefined}); renderSheet(); }
    update();
    toast('Verbunden. Die Daten werden abgeglichen.');
    await first;
  } catch (e) {
    haptic('strong');
    if (sheet?.kind === 'settings') { Object.assign(sheet, {connecting:false, connectError:e.message}); renderSheet(); $('#f-code')?.focus(); }
  }
}
function disconnectServer(){ // wechselt zum Modus „lokal“
  disconnect(); renderSheet(); update();
  toast('Verbindung getrennt. Die Daten bleiben auf diesem Handy.');
}
function openConnect(){ // Felder für Adresse und Code, aus den Einstellungen oder von der Willkommensseite
  if (sheet?.kind === 'settings') { sheet.connectForm = true; renderSheet(); } else openSheet({kind:'settings', connectForm:true});
  requestAnimationFrame(() => { $('#server')?.scrollIntoView({block:'start'}); $(prefs.server ? '#f-code' : '#f-server')?.focus({preventScroll:true}); });
}
/* „Jetzt abgleichen“: Nur dieser von Hand gestartete Abgleich zeigt einen Fortschritt, und erst nach 600 ms */
async function syncByHand(){
  const s = sheet; if (s?.kind !== 'settings' || s.syncing) return;
  s.syncing = 'quiet';
  const timer = setTimeout(() => { if (sheet === s) { s.syncing = 'shown'; paintServerBox(); } }, 600);
  try { await retrySync(); }
  finally { clearTimeout(timer); s.syncing = ''; if (sheet === s) paintServerBox(); }
}

/* Zweimal tippen statt Sicherheitsdialog */
const ARMED = {'delete-product':deleteProduct, 'delete-pet':deletePet, wipe, disconnect:disconnectServer};
let armTimer = null;
function arm(el){
  const key = el.dataset.then;
  if (sheet.armed === key) { sheet.armed = null; clearTimeout(armTimer); ARMED[key](); return; }
  sheet.armed = key; haptic('select'); renderSheet();
  clearTimeout(armTimer);
  armTimer = setTimeout(() => { if (sheet && sheet.armed === key) { sheet.armed = null; renderSheet(); } }, 3500);
}

const ACTIONS = {
  filter(el){
    const id = el.dataset.id;
    if (id !== 'all' && (db.pets.length === 1 || prefs.activePet === id)) return openPet(id); // erneut tippen = bearbeiten
    prefs.activePet = id;
    savePrefs(); haptic('select'); update();
  },
  'add-pet'(){ openSheet({kind:'pet', name:'', species:'Katze', photo:null, from:sheet?.kind === 'settings' ? 'settings' : null}); },
  'edit-pet'(el){ openPet(el.dataset.id, 'settings'); },
  'open-pet'(el){ openPet(el.dataset.id); }, // von der Übersicht
  'open-settings'(){ openSheet({kind:'settings'}); },
  'open-privacy'(){ openSheet({kind:'privacy'}); },
  'open-server'(){ openSheet({kind:'settings'}); requestAnimationFrame(() => $('#server')?.scrollIntoView({block:'start'})); },
  connect(){ connectServer(); },
  'connect-form'(){ haptic('select'); openConnect(); },
  'mode-local'(){ prefs.mode = 'lokal'; savePrefs(); haptic('select'); update(); }, // Willkommensseite: „Nur auf diesem Handy“
  'edit-server'(){ sheet.editServer = true; renderSheet(); $('#f-server')?.focus(); },
  'sync-now'(){ haptic('select'); syncByHand(); },
  close(){ closeSheet(); },
  feed(){ openSheet({kind:'feed'}); },
  serve(el){ const {id, code} = el.dataset; closeSheet().then(() => serveProduct(id, code)); }, // code: aus der Auswahl nach dem Scannen
  scan(){ scan(); },
  photo(){ shootPhoto('', sheet?.kind === 'feed' ? sheet.code : ''); }, // Code nach dem Scannen, falls der Foto-Knopf ihn übernimmt
  'new-product'(){ openSheet({kind:'new', brand:'', variety:'', type:'Nassfutter'}); },
  rate(el){ rate(el); },
  'open-serving'(el){
    const s = getServing(el.dataset.id); if (!s) return;
    const unknown = !s.productId && s.status !== 'recognizing';
    openSheet({kind:'serving', id:s.id, step:unknown ? 'name' : null, ...guessOf(s)}); // gelesene Marke und Sorte stehen schon da
  },
  'edit-name'(){
    const s = getServing(sheet.id), p = getProduct(s?.productId);
    Object.assign(sheet, {step:'name', ...(p ? {brand:p.brand, variety:p.variety, type:p.type || 'Nassfutter', texture:p.texture} : guessOf(s))}); renderSheet();
  },
  'save-name'(){ saveName(); },
  'use-product'(el){ useProduct(el.dataset.id); },
  'set-type'(el){ sheet.type = el.dataset.v; if (!textureOf(sheet, sheet.texture)) delete sheet.texture; renderSheet(); }, // passt nicht mehr: wieder offen
  'set-texture'(el){ // ein zweiter Tipp hebt auf (null = keine): im Futter-Sheet sofort, beim Benennen bis „Speichern“
    const v = el.dataset.v;
    if (sheet.kind === 'product' && sheet.step !== 'name') { toggleTexture(sheet.id, v); update(); } else sheet.texture = sheet.texture === v ? null : v;
    haptic('select'); renderSheet();
  },
  'toggle-serving-pet'(el){
    const s = getServing(sheet.id); if (!s) return;
    const id = el.dataset.id;
    if (s.pets[id]) {
      if (Object.keys(s.pets).length === 1) { toast('Mindestens ein Tier muss dabei sein.'); return; }
      delete s.pets[id];
    } else s.pets[id] = {r:null, at:null};
    delete s.autoPets;
    const p = getProduct(s.productId); if (p) p.lastPets = Object.keys(s.pets);
    prefs.lastPets = Object.keys(s.pets);
    save(); savePrefs(); haptic('select'); renderSheet(); update();
  },
  retry(){ if (sheet?.id) retryNow(sheet.id); },
  'delete-serving'(){ deleteServing(sheet.id); },
  'open-product'(el){ openSheet({kind:'product', id:el.dataset.id}); },
  'remove-code'(el){ removeCode(el.dataset.code); },
  kaufen(el){ setKaufen(sheet.id, el.dataset.v); haptic('select'); renderSheet(); update(); }, // Futter-Sheet, Abschnitt „Kaufen“
  'hint-kaufen'(el){ setKaufen(el.dataset.id, el.dataset.v); haptic('success'); update(); },  // Hinweis erledigt, auf allen Geräten
  'hide-hint'(el){ if (!prefs.hiddenHints.includes(el.dataset.v)) prefs.hiddenHints.push(el.dataset.v); savePrefs(); haptic('select'); update(); },
  'close-week'(el){ prefs.closedWeek = el.dataset.v; savePrefs(); haptic('select'); update(); },    // Wochenrückblick, pro Woche und Gerät
  'share-list'(){ shareShopping(); },
  'rename-product'(){
    const p = getProduct(sheet.id); if (!p) return;
    Object.assign(sheet, {step:'name', brand:p.brand, variety:p.variety, type:p.type || 'Nassfutter', texture:p.texture}); renderSheet();
  },
  arm(el){ arm(el); },
  'set-species'(el){ sheet.species = el.dataset.v; renderSheet(); },
  'save-pet'(){ savePet(); },
  'crop-apply'(){ closeCrop(true); },
  'crop-cancel'(){ closeCrop(false); },
  'album-select'(el){ sheet.albumSel = sheet.albumSel === el.dataset.key ? null : el.dataset.key; haptic('select'); renderSheet(); },
  'album-remove'(el){ removeAlbumPhoto(el.dataset.key); },
  'album-profile'(){ albumToProfile(); },
  backdrop(el){ prefs.backdrop = el.dataset.v === 'on'; savePrefs(); haptic('select'); renderSheet(); update(); }, // Tierfotos im Hintergrund
  lookup(el){ prefs.lookup = el.dataset.v === 'on'; savePrefs(); haptic('select'); renderSheet(); },                // Produktsuche im Internet, Standard aus
  'feed-start'(el){ prefs.feedStart = el.dataset.v; savePrefs(); haptic('select'); renderSheet(); },                // welcher Knopf im Füttern-Sheet steht
  'feed-remind'(el){ haptic('select'); setFeedRemind(el.dataset.v === 'on'); },                         // Erinnerung ans Füttern zu den üblichen Zeiten
  remind(el){ haptic('select'); sheet.ownRemind = false; setRemind(+el.dataset.v); },                 // Erinnerung zum Bewerten, fragt nach der Erlaubnis
  'remind-own'(){ // „Eigene“: Feld für ganze Stunden, beginnt mit dem geltenden Abstand, von „Aus“ mit 2 Stunden
    haptic('select'); sheet.ownRemind = true;
    setRemind(prefs.remind || 120).then(() => $('#f-remind')?.select());
  },
  theme(el){ prefs.theme = el.dataset.v; savePrefs(); applyTheme(); renderSheet(); haptic('select'); },
  'export'(){ exportData(); },
  'share-changes'(){ haptic('select'); shareChanges(); },                      // Austausch von Hand, Abschnitt „Haushalt“
  'send-answer'(){ haptic('select'); shareChanges(sheet?.exchange?.peer); },   // genau das, was dem anderen Gerät fehlt
  demo(){ loadDemo(); },
  expand(el){ haptic('select'); expandCard(el.dataset.v); },
  'toggle-overview'(){ haptic('select'); toggleOverview(); }, // der ganze Text der Übersicht und zurück
  'older-days'(){ // der Knopf verschwindet, der Fokus geht auf den ersten neuen Tag
    haptic('select');
    showOlderDays()?.querySelector('.tl-item')?.focus({preventScroll:true});
  },
  'jump-day'(el){
    const key = el.dataset.day;
    if (!timelineGroups().some(g => g.key === key)) return;
    if (!document.getElementById('d-' + key)) showOlderDays(); // Tag liegt vor vorgestern
    const target = document.getElementById('d-' + key); if (!target) return;
    target.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block:'start'});
    haptic('select');
  },
  undo(){ const u = toastUndo; hideToast(); if (u) { haptic('select'); u(); } }
};

/* Deep Links und App-Kurzbefehle: schmeckts://fuettern öffnet das Füttern-Sheet, schmeckts://scan startet darin
   den Scanner (logic/scan.js), schmeckts://foto die eigene Kamera (shootPhoto in logic/feeding.js). Nach „Abbrechen“
   bleibt das Füttern-Sheet offen. */
const LINKS = ['fuettern', 'scan', 'foto'];
export async function openLink(url){
  const raw = String(url || '');
  if (/^(content|file):/i.test(raw)) { await receiveUri(raw); return true; } // Austausch-Datei aus einer anderen App
  const path = raw.replace(/^schmeckts:\/*/i, '').replace(/[/?#].*$/, '').toLowerCase();
  if (!LINKS.includes(path)) return false;
  if (!db.pets.length) { openSheet({kind:'pet', name:'', species:'Katze', photo:null, from:null}); toast('Leg zuerst dein Tier an.'); return true; }
  await closeSheet();
  openSheet({kind:'feed'});
  if (path === 'foto') await shootPhoto();
  if (path === 'scan') await scan();
  return true;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el);
});
let noteTimer = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.field && sheet) {
    sheet[t.dataset.field] = t.value;
    if (t.dataset.field === 'brand' || t.dataset.field === 'variety') renderSuggestions();
  }
  if (t.dataset.note) {
    const s = getServing(t.dataset.note);
    if (s) { s.note = t.value; clearTimeout(noteTimer); noteTimer = setTimeout(save, 400); }
  }
  if (t.dataset.setting) { prefs[t.dataset.setting] = t.value.trim(); savePrefs(); }
  if (t.hasAttribute('data-remind')) { // eigene Stunden: gültige Werte gelten sofort, das Feld bleibt beim Tippen stehen
    const h = Number(t.value);
    if (Number.isInteger(h) && h >= 1 && h <= REMIND_MAX_H) setRemind(h * 60, false);
  }
  if (t.hasAttribute('data-search')) renderServeHits(t.value);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !sheet || e.target.tagName !== 'INPUT') return;
  if (e.target.id === 'f-server' && $('#f-code') && !$('#f-code').value) { e.preventDefault(); $('#f-code').focus(); }
  else if (e.target.id === 'f-code' || e.target.id === 'f-server') { e.preventDefault(); connectServer(); }
  else if (e.target.id === 'f-remind') { e.preventDefault(); e.target.blur(); }
  else if (sheet.kind === 'pet') { e.preventDefault(); savePet(); }
  else if (sheet.step === 'name' || sheet.kind === 'new') {
    e.preventDefault();
    if (e.target.id === 'f-brand') $('#f-variety')?.focus(); else saveName();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.hasAttribute('data-remind')) return renderSheet(); // Feld verlassen: zeigt wieder den geltenden Wert
  if (!t.dataset.time || !t.value) return;
  const s = getServing(t.dataset.time), ts = new Date(t.value).getTime();
  if (!s || isNaN(ts)) return;
  s.servedAt = Math.min(ts, Date.now());
  db.servings.sort((a, b) => b.servedAt - a.servedAt);
  save(); haptic(6); renderSheet(); update();
  toast(`Zeitpunkt: ${when(s.servedAt)}`);
});
const onFile = (id, fn) => $(id).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; fn(f); });
onFile('#camInputSheet', f => servePhoto(f, sheet?.kind === 'feed' ? sheet.code : '')); // Code nach dem Scannen, falls der Foto-Knopf ihn übernimmt
onFile('#petPhotoInput', setPetPhoto);
$('#albumInput').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; addAlbumPhotos(files); });
onFile('#importInput', importData);
onFile('#exchangeInput', receiveFile);
