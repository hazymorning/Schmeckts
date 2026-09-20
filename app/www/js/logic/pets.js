/* Tiere anlegen, bearbeiten und löschen. Das Profilbild wird zugeschnitten (Schritt „crop“ im Tier-Sheet) und mit
   „Speichern“ übernommen; das Album speichert Hinzufügen und Entfernen sofort. */
import {$} from '../dom.js';
import {uid} from '../fields.js';
import {ALBUM_MAX} from '../config.js';
import {haptic} from '../native.js';
import {db, prefs, save, savePrefs} from '../store.js';
import {getPet} from '../derive.js';
import {albumPhoto, cropSquare, fileToImage, urlToImage} from '../images.js';
import {cropRect, cropStart} from '../ui/crop.js';
import {toast} from '../ui/toast.js';
import {closeSheet, openSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';

export function openPet(id, from = null){
  const p = getPet(id); if (!p) return;
  openSheet({kind:'pet', id:p.id, name:p.name, species:p.species, photo:p.photo || null, from});
}
/* Zuschnitt öffnen: mit einer gewählten Datei oder einem Foto aus dem Album („Als Profilbild“) */
async function openCrop(load){
  const s = sheet; if (s?.kind !== 'pet') return;
  let img;
  try { img = await load(); } catch (e) { toast('Das Foto ließ sich nicht lesen.'); return; }
  if (sheet !== s) return;
  Object.assign(s, {step:'crop', cropImg:img, crop:cropStart(img)}); renderSheet();
}
export const setPetPhoto = file => file && openCrop(() => fileToImage(file));
export const albumToProfile = () => openCrop(() => urlToImage(getPet(sheet.id).photos[sheet.albumSel]));
export function closeCrop(apply){
  const s = sheet; if (s?.step !== 'crop') return;
  if (apply) { s.photo = cropSquare(s.cropImg, 320, .8, cropRect(s.crop)); haptic('select'); }
  Object.assign(s, {step:null, cropImg:null, crop:null}); renderSheet();
}

const albumKeys = p => Object.keys(p?.photos || {}).sort(); // Schlüssel beginnen mit der Zeit: älteste zuerst
export async function addAlbumPhotos(files){
  const s = sheet, p = getPet(s?.id); if (!p || !files.length) return;
  const free = ALBUM_MAX - albumKeys(p).length;
  let n = 0;
  for (const f of files.slice(0, free)) {
    try { const photo = albumPhoto(await fileToImage(f)); (p.photos ||= {})[uid()] = photo; n++; save(); } catch (e) {} // jedes Foto sofort: Wird die App dabei beendet, bleibt, was fertig war
  }
  if (n) { haptic('success'); update(); }
  if (sheet === s) renderSheet();
  toast(files.length > free ? `Höchstens ${ALBUM_MAX} Fotos. ${n} hinzugefügt.` : n < files.length ? 'Nicht jedes Foto ließ sich lesen.' : n === 1 ? 'Foto hinzugefügt' : `${n} Fotos hinzugefügt`);
}
export function removeAlbumPhoto(key){
  const s = sheet, p = getPet(s?.id), photo = p?.photos?.[key]; if (!photo) return;
  const put = v => { if (v) p.photos[key] = v; else delete p.photos[key]; save(); update(); if (sheet === s) renderSheet(); };
  if (s.albumSel === key) s.albumSel = null;
  haptic('strong'); put(null);
  toast('Foto entfernt', () => { if (getPet(p.id) && albumKeys(p).length < ALBUM_MAX) put(photo); });
}
export function savePet(){
  const s = sheet, name = (s.name || '').trim();
  if (!name) { toast('Wie heißt dein Tier?'); $('#f-name')?.focus(); return; }
  const isNew = !s.id;
  if (isNew) db.pets.push({id:uid(), name, species:s.species, photo:s.photo || null, photos:{}, createdAt:Date.now()});
  else Object.assign(getPet(s.id) || {}, {name, species:s.species, photo:s.photo || null});
  save(); haptic('success');
  const msg = !isNew ? 'Gespeichert' : db.pets.length === 1 ? `Willkommen, ${name}!` : `${name} ist dabei`;
  if (s.from === 'settings') { openSheet({kind:'settings'}); update(); toast(msg); return; }
  closeSheet().then(() => { update(); toast(msg); });
}
export function deletePet(){
  const id = sheet.id, p = getPet(id); if (!p) return;
  db.pets = db.pets.filter(x => x.id !== id);
  db.servings.forEach(s => { delete s.pets[id]; });
  db.servings = db.servings.filter(s => Object.keys(s.pets).length);
  db.products.forEach(pr => { pr.lastPets = (pr.lastPets || []).filter(x => x !== id); });
  db.products = db.products.filter(pr => db.servings.some(s => s.productId === pr.id));
  prefs.lastPets = (prefs.lastPets || []).filter(x => x !== id);
  if (prefs.activePet === id) prefs.activePet = 'all';
  save(); savePrefs(); haptic('strong');
  closeSheet().then(() => { update(); toast(`${p.name} entfernt`); });
}
