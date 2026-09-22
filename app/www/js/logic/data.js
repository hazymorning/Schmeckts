/* Exporting and importing a backup, sample data, deleting everything.
   With a server, import and delete apply to the whole household. Sample data exists only without a server. */
import {uid} from '../fields.js';
import {Native, haptic} from '../native.js';
import {report} from '../report.js';
import {DEMO, RATINGS} from '../config.js';
import {db, defaults, prefs, purge, replaceDb, save, savePrefs, tidy} from '../store.js';
import {isConnected} from '../sync.js';
import {petMap} from '../derive.js';
import {toast} from '../ui/toast.js';
import {closeSheet} from '../ui/sheet.js';
import {update} from '../views/home.js';
import {newProduct} from './products.js';

export function wipe() {
  const house = isConnected();
  replaceDb(defaults());
  prefs.lastPets = [];
  prefs.activePet = 'all';
  save();
  savePrefs();
  haptic('strong');
  closeSheet().then(() => {
    update();
    toast(house ? 'Alle Daten im Haushalt gelöscht' : 'Alle Daten gelöscht');
  });
}

/* A shared file (backup or exchange) stays in the cache until the receiving app has read it:
   gone on the next start and before the next export */
export async function clearExports() {
  if (!Native?.Filesystem) return;
  try {
    const {files} = await Native.Filesystem.readdir({path: '', directory: 'CACHE'});
    await Promise.all(
      files
        .filter(f => f.name.startsWith('schmeckts-'))
        .map(f => Native.Filesystem.deleteFile({path: f.name, directory: 'CACHE'})),
    );
  } catch (e) {
    report('old files in the cache', e);
  }
}
export async function exportData() {
  await clearExports();
  const json = JSON.stringify({...db, exportedAt: new Date().toISOString()}); // household data only, no device settings
  const name = `schmeckts-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (Native?.Filesystem && Native?.Share) {
    try {
      const {uri} = await Native.Filesystem.writeFile({path: name, data: json, directory: 'CACHE', encoding: 'utf8'});
      await Native.Share.share({title: 'Schmeckt’s-Backup', files: [uri], dialogTitle: 'Backup sichern oder senden'});
    } catch (e) {
      if (!/cancel/i.test(String(e?.message))) toast('Das Backup konnte nicht geteilt werden.');
    }
    return;
  }
  const blob = new Blob([json], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup gespeichert');
}
export async function importData(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (![d.servings, d.pets, d.products].every(Array.isArray)) throw new Error('Format');
    const prev = db;
    replaceDb(tidy(d));
    save();
    const msg = isConnected() ? 'Backup in den Haushalt importiert' : 'Backup importiert';
    closeSheet().then(() => {
      update();
      toast(msg, () => {
        replaceDb(prev);
        save();
        update();
      });
    });
  } catch {
    // One message for every broken file; picking another one is all a person can do here
    toast('Diese Datei ist kein gültiges Backup.');
  }
}
const demoId = () => DEMO + uid();
/* One sample pet with six varieties and their ratings, two people, and the usual feeding times. The data is made
   up, but it has to look like a phone in use so that the evaluation and the insights are not empty. */
const DEMO_PLAN = [
  ['Sheba', 'Lachs in Soße', 'Nassfutter', ['top', 'top', 'gut', 'mittel']],
  ['Felix', 'Huhn in Gelee', 'Nassfutter', ['top', 'gut', 'gut']],
  ['Whiskas', 'Thunfisch in Soße', 'Nassfutter', ['sosse', 'sosse', 'mittel']],
  ['Gourmet', 'Rind Pastete', 'Nassfutter', ['schlecht', 'schlecht', 'mittel']],
  ['Animonda Carny', 'Pute Pastete', 'Nassfutter', ['mittel', 'gut']],
  ['Dreamies', 'Käse', 'Snack', ['verputzt', 'verputzt']],
];
const DEMO_PEOPLE = ['Anna', 'Jonas'];
const DEMO_SLOTS = [7.25, 18.1, 12.5, 19.4]; // typical feeding times, as hours of the day
const DEMO_CALM = 6; // the newest meals without weak ratings, so the sample never reports „frisst schlechter“
const DEMO_RATED_AFTER = 2 * 3600e3; // rated two hours after the meal
const DEMO_OPEN_AGO = 2 * 3600e3; // the one meal still open was served two hours ago
const DAY = 864e5;

export function loadDemo() {
  if (isConnected()) return;
  const pet = {id: demoId(), name: 'Mau', species: 'Katze', photo: null, createdAt: Date.now()};
  db.pets.push(pet);
  const made = demoMeals(pet);
  db.servings.push(...made);
  db.servings.sort((a, b) => b.servedAt - a.servedAt);
  save();
  closeSheet().then(() => {
    update();
    toast('Beispieldaten geladen');
  });
}

/* The varieties with their ratings, spread over the days backwards from today */
function demoMeals(pet) {
  const made = [],
    byBrand = {};
  for (const [brand, variety, type, ratings] of DEMO_PLAN) {
    const p = newProduct({brand, variety, type, animal: 'Katze'}, demoId());
    p.lastPets = [pet.id];
    byBrand[brand] = p;
    for (const r of ratings)
      made.push({id: demoId(), productId: p.id, servedAt: 0, pets: {[pet.id]: {r, at: null}}, note: ''});
  }
  spreadOverDays(made, pet);
  made[3].note = 'Neue Packung';
  // One meal from two hours ago, still without a rating, so „Wie war’s?“ is not empty
  made.push({
    id: demoId(),
    productId: byBrand.Felix.id,
    servedAt: Date.now() - DEMO_OPEN_AGO,
    pets: petMap([pet.id]),
    note: '',
    by: 'Anna',
  });
  return made;
}

/* Two meals a day backwards from yesterday, at the usual times and alternating between the two people.
   The order is random, except that the newest days carry no weak rating. */
function spreadOverDays(made, pet) {
  const now = Date.now();
  made.sort(() => Math.random() - 0.5);
  const calm = made.filter(s => RATINGS[s.pets[pet.id].r].score >= 50).slice(0, DEMO_CALM);
  made.sort((a, b) => calm.includes(b) - calm.includes(a));
  made.forEach((s, i) => {
    const d = new Date(now - (Math.floor(i / 2) + 1) * DAY);
    const h = DEMO_SLOTS[(i * 3) % DEMO_SLOTS.length] + Math.random() * 0.6;
    d.setHours(Math.floor(h), Math.floor((h % 1) * 60), 0, 0);
    s.servedAt = d.getTime();
    s.by = DEMO_PEOPLE[i % 2];
    for (const x of Object.values(s.pets)) x.at = s.servedAt + DEMO_RATED_AFTER;
  });
}

/* Before connecting: remove the sample data so that none of it reaches the household. That includes meals
   served only for the sample pet, and food that no other meal uses. */
export function purgeDemo() {
  const demo = id => id.startsWith(DEMO);
  const pets = new Set(db.pets.filter(p => demo(p.id)).map(p => p.id));
  const onlyDemo = s => {
    const ids = Object.keys(s.pets);
    return ids.length > 0 && ids.every(id => pets.has(id));
  };
  const servings = new Set(db.servings.filter(s => demo(s.id) || onlyDemo(s)).map(s => s.id));
  const used = new Set(db.servings.filter(s => !servings.has(s.id)).map(s => s.productId));
  const fromDemo = new Set(db.servings.filter(s => servings.has(s.id)).map(s => s.productId));
  const products = new Set(
    db.products.filter(p => !used.has(p.id) && (demo(p.id) || fromDemo.has(p.id))).map(p => p.id),
  );
  if (!pets.size && !servings.size && !products.size) return;
  purge({pets, products, servings});
  let touched = false; // keep mixed meals, only take the sample pet out of them
  for (const s of db.servings)
    for (const id of Object.keys(s.pets))
      if (pets.has(id)) {
        delete s.pets[id];
        touched = true;
      }
  prefs.lastPets = (prefs.lastPets || []).filter(id => !pets.has(id));
  savePrefs();
  if (touched) save();
}
