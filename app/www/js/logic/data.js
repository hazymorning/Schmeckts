// with a server, import and delete apply to the whole household
import {uid} from '../fields.js';
import {DAY} from '../dates.js';
import {Native, appInfo, haptic, shareFile, sharesFiles} from '../native.js';
import {report} from '../report.js';
import {DEMO, RATINGS} from '../config.js';
import {db, defaults, prefs, purge, replaceDb, save, savePrefs, tidy} from '../store.js';
import {isConnected} from '../sync.js';
import {getProduct, getServing, petMap} from '../derive.js';
import {sweepPhotos} from '../photos.js';
import {lastReading, timing} from '../recognize.js';
import {toast} from '../ui/toast.js';
import {closeSheet} from '../ui/sheet.js';
import {update} from '../views/home.js';
import {newProduct} from './products.js';

export function wipe() {
  const house = isConnected();
  replaceDb(defaults());
  sweepPhotos(new Set());
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

// a shared file has to stay in the cache until the receiving app has read it
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
  try {
    await shareFile(name, json, 'Schmeckt’s-Backup', 'Backup sichern oder senden');
    if (!sharesFiles()) toast('Backup gespeichert');
  } catch (e) {
    report('backup', e);
    toast('Das Backup konnte nicht geteilt werden.');
  }
}
// a fixture for tests/fixtures/ocr; a person checks it before it goes into the tests
export async function exportReading() {
  const r = lastReading();
  if (!r || !sharesFiles()) return toast('Noch kein Foto gelesen.');
  await clearExports();
  const p = getProduct(getServing(r.meal)?.productId);
  const fixture = {
    about: p ? [p.brand, p.variety].filter(Boolean).join(' ') : '',
    taken: new Date(r.at).toISOString(),
    app: appInfo.version,
    width: r.width,
    height: r.height,
    ms: r.ms,
    ...(timing.on ? {timings: timing.ms} : {}),
    expected: {
      brand: p ? p.brand || '' : null, // null: not named yet, filled in by hand
      variety: p ? p.variety || '' : null,
      type: p?.type || null,
      texture: p?.texture || null,
      locked: false,
    },
    result: r.raw,
    ...(r.second ? {second: secondOf(r.second)} : {}),
  };
  // one field per line, the expectations get edited by hand
  const json = `{\n${Object.entries(fixture)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(',\n')}\n}\n`;
  const name = `schmeckts-ocr-${fixture.taken.slice(0, 19).replace(/[T:]/g, '-')}.json`;
  try {
    await shareFile(name, json, name, 'Gelesenen Text teilen');
  } catch (e) {
    report('reading as a fixture', e);
    toast('Der gelesene Text konnte nicht geteilt werden.');
  }
}
const secondOf = ({left, top, right, bottom, scale, read}) => ({
  crop: {left, top, right, bottom},
  scale,
  width: read.width,
  height: read.height,
  ms: read.ms,
  result: read.raw,
});
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
    toast('Diese Datei ist kein gültiges Backup.');
  }
}
const demoId = () => DEMO + uid();
// made up, but it has to look like a phone in use so every evaluation has something to show
const DEMO_PLAN = [
  ['Sheba', 'Lachs in Soße', 'Nassfutter', ['top', 'top', 'gut', 'mittel']],
  ['Felix', 'Huhn in Gelee', 'Nassfutter', ['top', 'gut', 'gut', 'top', 'gut']],
  ['Felix', 'Rind in Gelee', 'Nassfutter', ['top', 'gut', 'top', 'top', 'gut']],
  ['Whiskas', 'Thunfisch in Soße', 'Nassfutter', ['sosse', 'sosse', 'mittel']],
  ['Kitekat', 'Geflügel in Soße', 'Nassfutter', ['sosse', 'gut', 'sosse']],
  ['Gourmet', 'Rind Pastete', 'Nassfutter', ['schlecht', 'schlecht', 'mittel', 'schlecht']],
  ['Animonda Carny', 'Pute Pastete', 'Nassfutter', ['mittel', 'gut']],
  ['Dreamies', 'Käse', 'Snack', ['verputzt', 'verputzt']],
];
const DEMO_PEOPLE = ['Anna', 'Jonas'];
const DEMO_SLOTS = [7.25, 18.1, 12.5, 19.4]; // hours of the day
const DEMO_CALM = 6; // newest meals without weak ratings, so the sample never reports a decline
const DEMO_RATED_AFTER = 2 * 3600e3;
const DEMO_OPEN_AGO = 2 * 3600e3;

export function loadDemo() {
  if (isConnected()) return;
  const pet = {id: demoId(), name: 'Mau', species: 'Katze', photo: null, createdAt: Date.now()};
  db.pets.push(pet);
  const made = demoMeals(pet);
  db.servings.push(...made);
  db.servings.sort((a, b) => b.servedAt - a.servedAt);
  db.observations.push(...demoObservations(pet, made));
  db.observations.sort((a, b) => b.at - a.at);
  save();
  closeSheet().then(() => {
    update();
    toast('Beispieldaten geladen');
  });
}

function demoMeals(pet) {
  const made = [],
    byBrand = {};
  for (const [brand, variety, type, ratings] of DEMO_PLAN) {
    const p = newProduct({brand, variety, type}, demoId());
    p.lastPets = [pet.id];
    byBrand[brand] ??= p;
    for (const r of ratings)
      made.push({id: demoId(), productId: p.id, servedAt: 0, pets: {[pet.id]: {r, at: null}}, note: ''});
  }
  spreadOverDays(made, pet);
  made[3].note = 'Neue Packung';
  // one unrated meal, so the rating prompt is not empty
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

// so the diary and the preferences have something to show
function demoObservations(pet, made) {
  const pastete = made.find(s => getProduct(s.productId)?.variety === 'Rind Pastete' && s.servedAt < Date.now() - DAY),
    tired = new Date(Date.now() - 3 * DAY);
  tired.setHours(15, 10, 0, 0);
  return [
    pastete && {id: demoId(), kind: 'stink', at: pastete.servedAt + 5 * 3600e3, pets: {[pet.id]: true}, by: 'Jonas'},
    {id: demoId(), kind: 'tired', at: tired.getTime(), pets: {[pet.id]: true}, by: 'Anna'},
  ].filter(Boolean);
}

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

// before connecting, so none of the sample reaches the household
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
  const observations = new Set(db.observations.filter(o => demo(o.id) || onlyDemo(o)).map(o => o.id));
  if (!pets.size && !servings.size && !products.size && !observations.size) return;
  purge({pets, products, servings, observations});
  let touched = false; // mixed records stay, minus the sample pet
  for (const s of [...db.servings, ...db.observations])
    for (const id of Object.keys(s.pets))
      if (pets.has(id)) {
        delete s.pets[id];
        touched = true;
      }
  prefs.lastPets = (prefs.lastPets || []).filter(id => !pets.has(id));
  savePrefs();
  if (touched) save();
}
