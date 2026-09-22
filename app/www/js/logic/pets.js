/* Creating, editing and deleting pets. The profile picture is cropped (step „crop“) and taken over with
   „Speichern“. From the home page the editor is a sheet; from the settings it is one of their pages, with a
   history entry of its own, and saving or removing leads back to the overview. */
import {$} from '../dom.js';
import {uid} from '../fields.js';
import {haptic} from '../native.js';
import {db, prefs, save, savePrefs} from '../store.js';
import {getPet} from '../derive.js';
import {cropSquare, fileToImage} from '../images.js';
import {cropRect, cropStart} from '../ui/crop.js';
import {toast} from '../ui/toast.js';
import {backPage, closeSheet, openPage, openSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';

/* Everything the editor puts on the state. As a page these are exactly the keys the way back takes off again. */
export const petState = p => ({
  id: p?.id || null,
  name: p?.name || '',
  species: p?.species || 'Katze',
  photo: p?.photo || null,
  step: null,
  cropImg: null,
  crop: null,
});
export const editing = s => s?.kind === 'pet' || (s?.kind === 'settings' && s.page === 'pet');
export function openPet(id, inSettings = false) {
  const p = getPet(id);
  if (!p) return;
  if (inSettings) openPage('pet', petState(p));
  else openSheet({kind: 'pet', ...petState(p)});
}
/* Back to where the editor was opened from: in the settings one level up, otherwise out of the sheet. */
function leave(msg) {
  if (sheet.kind === 'settings') {
    backPage();
    update();
    toast(msg);
    return;
  }
  closeSheet().then(() => {
    update();
    toast(msg);
  });
}
/* Open the crop on a chosen file */
async function openCrop(load) {
  const s = sheet;
  if (!editing(s)) return;
  let img;
  try {
    img = await load();
  } catch {
    // An unreadable file leaves nothing to crop; the toast asks for another photo
    toast('Das Foto ließ sich nicht lesen.');
    return;
  }
  if (sheet !== s) return;
  Object.assign(s, {step: 'crop', cropImg: img, crop: cropStart(img)});
  renderSheet();
}
export const setPetPhoto = file => file && openCrop(() => fileToImage(file));
export function closeCrop(apply) {
  const s = sheet;
  if (s?.step !== 'crop') return;
  if (apply) {
    s.photo = cropSquare(s.cropImg, 320, 0.8, cropRect(s.crop));
    haptic('select');
  }
  Object.assign(s, {step: null, cropImg: null, crop: null});
  renderSheet();
}

export function savePet() {
  const s = sheet,
    name = (s.name || '').trim();
  if (!name) {
    toast('Wie heißt dein Tier?');
    $('#f-name')?.focus();
    return;
  }
  const isNew = !s.id;
  if (isNew) db.pets.push({id: uid(), name, species: s.species, photo: s.photo || null, createdAt: Date.now()});
  else Object.assign(getPet(s.id) || {}, {name, species: s.species, photo: s.photo || null});
  save();
  haptic('success');
  leave(!isNew ? 'Gespeichert' : db.pets.length === 1 ? `Willkommen, ${name}!` : `${name} ist dabei`);
}
export function deletePet() {
  const id = sheet.id,
    p = getPet(id);
  if (!p) return;
  db.pets = db.pets.filter(x => x.id !== id);
  db.servings.forEach(s => {
    delete s.pets[id];
  });
  db.servings = db.servings.filter(s => Object.keys(s.pets).length);
  db.products.forEach(pr => {
    pr.lastPets = (pr.lastPets || []).filter(x => x !== id);
  });
  db.products = db.products.filter(pr => db.servings.some(s => s.productId === pr.id));
  prefs.lastPets = (prefs.lastPets || []).filter(x => x !== id);
  if (prefs.activePet === id) prefs.activePet = 'all';
  save();
  savePrefs();
  haptic('strong');
  leave(`${p.name} entfernt`);
}
