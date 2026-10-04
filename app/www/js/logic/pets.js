// from the settings the editor is a page with its own history entry, elsewhere a sheet
import {$} from '../dom.js';
import {uid} from '../fields.js';
import {dayKey} from '../dates.js';
import {norm} from '../text.js';
import {haptic} from '../native.js';
import {db, prefs, save, savePrefs, usedNews} from '../store.js';
import {getPet, namesOf} from '../derive.js';
import {cropSquare, fileToImage} from '../images.js';
import {cropRect, cropStart} from '../ui/crop.js';
import {toast} from '../ui/toast.js';
import {backPage, closeSheet, openPage, openSheet, renderSheet, sheet} from '../ui/sheet.js';
import {update} from '../views/home.js';
import {renderNicks} from '../views/sheets.js';

// as a page, exactly these keys are taken off again on the way back
export const petState = p => ({
  id: p?.id || null,
  name: p?.name || '',
  nicknames: namesOf(p).slice(1),
  nick: '', // typed, not yet added
  species: p?.species || 'Katze',
  sex: p?.sex || '',
  photo: p?.photo || null,
  birthday: p?.birthday || '',
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
async function openCrop(load) {
  const s = sheet;
  if (!editing(s)) return;
  let img;
  try {
    img = await load();
  } catch {
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

const NICKS = 6;
const sameName = (a, b) => norm(a) === norm(b);
// quiet: while saving, which takes a nickname typed but not added along
export function addNick(quiet = false) {
  const s = sheet,
    nick = (s.nick || '').trim().replace(/\s+/g, ' ');
  if (!nick) return;
  const known = [s.name, ...s.nicknames].some(n => sameName(n, nick));
  if (!known && s.nicknames.length >= NICKS) {
    if (!quiet) toast('Sechs Spitznamen sind genug.');
    return;
  }
  if (!known) s.nicknames.push(nick);
  s.nick = '';
  if (quiet) return;
  const field = $('#f-nick');
  if (field) field.value = '';
  haptic('select');
  renderNicks();
}
export function dropNick(nick) {
  sheet.nicknames = sheet.nicknames.filter(n => n !== nick);
  haptic('select');
  renderNicks();
}

export function savePet() {
  const s = sheet,
    name = (s.name || '').trim();
  if (!name) {
    toast('Wie heißt dein Tier?');
    $('#f-name')?.focus();
    return;
  }
  const birthday = (s.birthday || '').trim(); // YYYY-MM-DD, so text compares like dates
  if (birthday > dayKey(Date.now())) {
    toast('Das Geburtsdatum liegt in der Zukunft.');
    $('#f-birthday')?.focus();
    return;
  }
  const isNew = !s.id,
    p = isNew ? {id: uid(), createdAt: Date.now()} : getPet(s.id) || {};
  addNick(true);
  const nicknames = s.nicknames.filter(n => !sameName(n, name));
  Object.assign(p, {name, species: s.species, photo: s.photo || null});
  if (birthday) p.birthday = birthday;
  else delete p.birthday; // removed on the other phones too
  if (s.sex) {
    p.sex = s.sex;
    usedNews('sex');
  } else delete p.sex;
  if (nicknames.length) {
    p.nicknames = nicknames;
    usedNews('nicknames');
  } else delete p.nicknames;
  if (isNew) db.pets.push(p);
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
  db.observations.forEach(o => {
    delete o.pets[id];
  });
  db.observations = db.observations.filter(o => Object.keys(o.pets).length);
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
