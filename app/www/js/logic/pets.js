/* Creating, editing and deleting pets. The profile picture is cropped (step „crop“ in the pet sheet) and taken over
   with „Speichern“. */
import {$} from '../dom.js';
import {uid} from '../fields.js';
import {haptic} from '../native.js';
import {db, prefs, save, savePrefs} from '../store.js';
import {getPet} from '../derive.js';
import {cropSquare, fileToImage} from '../images.js';
import {cropRect, cropStart} from '../ui/crop.js';
import {toast} from '../ui/toast.js';
import {closeSheet, openSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';

export function openPet(id, from = null){
  const p = getPet(id); if (!p) return;
  openSheet({kind:'pet', id:p.id, name:p.name, species:p.species, photo:p.photo || null, from});
}
/* Open the crop on a chosen file */
async function openCrop(load){
  const s = sheet; if (s?.kind !== 'pet') return;
  let img;
  try { img = await load(); } catch (e) { toast('Das Foto ließ sich nicht lesen.'); return; }
  if (sheet !== s) return;
  Object.assign(s, {step:'crop', cropImg:img, crop:cropStart(img)}); renderSheet();
}
export const setPetPhoto = file => file && openCrop(() => fileToImage(file));
export function closeCrop(apply){
  const s = sheet; if (s?.step !== 'crop') return;
  if (apply) { s.photo = cropSquare(s.cropImg, 320, .8, cropRect(s.crop)); haptic('select'); }
  Object.assign(s, {step:null, cropImg:null, crop:null}); renderSheet();
}

export function savePet(){
  const s = sheet, name = (s.name || '').trim();
  if (!name) { toast('Wie heißt dein Tier?'); $('#f-name')?.focus(); return; }
  const isNew = !s.id;
  if (isNew) db.pets.push({id:uid(), name, species:s.species, photo:s.photo || null, createdAt:Date.now()});
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
