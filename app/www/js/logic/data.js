/* Exporting and importing a backup, sample data, deleting everything.
   With a server, import and delete apply to the whole household. Sample data exists only without a server. */
import {uid} from '../fields.js';
import {Native, haptic} from '../native.js';
import {DEMO, RATINGS} from '../config.js';
import {db, defaults, prefs, purge, replaceDb, save, savePrefs, tidy} from '../store.js';
import {isConnected} from '../sync.js';
import {petMap} from '../derive.js';
import {toast} from '../ui/toast.js';
import {closeSheet} from '../ui/sheet.js';
import {update} from '../views/home.js';
import {newProduct} from './products.js';

export function wipe(){
  const house = isConnected();
  replaceDb(defaults()); prefs.lastPets = []; prefs.activePet = 'all';
  save(); savePrefs(); haptic('strong');
  closeSheet().then(() => { update(); toast(house ? 'Alle Daten im Haushalt gelöscht' : 'Alle Daten gelöscht'); });
}

/* A shared file (backup or exchange) stays in the cache until the receiving app has read it:
   gone on the next start and before the next export */
export async function clearExports(){
  if (!Native?.Filesystem) return;
  try {
    const {files} = await Native.Filesystem.readdir({path:'', directory:'CACHE'});
    await Promise.all(files.filter(f => f.name.startsWith('schmeckts-')).map(f => Native.Filesystem.deleteFile({path:f.name, directory:'CACHE'})));
  } catch (e) { console.warn('Alte Dateien im Cache:', e.message); }
}
export async function exportData(){
  await clearExports();
  const json = JSON.stringify({...db, exportedAt:new Date().toISOString()}); // household data only, no device settings
  const name = `schmeckts-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (Native?.Filesystem && Native?.Share) {
    try {
      const {uri} = await Native.Filesystem.writeFile({path:name, data:json, directory:'CACHE', encoding:'utf8'});
      await Native.Share.share({title:'Schmeckt’s-Backup', files:[uri], dialogTitle:'Backup sichern oder senden'});
    } catch (e) { if (!/cancel/i.test(String(e?.message))) toast('Das Backup konnte nicht geteilt werden.'); }
    return;
  }
  const blob = new Blob([json], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup gespeichert');
}
export async function importData(file){
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (![d.servings, d.pets, d.products].every(Array.isArray)) throw new Error('Format');
    const prev = db;
    replaceDb(tidy(d)); save();
    const msg = isConnected() ? 'Backup in den Haushalt importiert' : 'Backup importiert';
    closeSheet().then(() => { update(); toast(msg, () => { replaceDb(prev); save(); update(); }); });
  } catch (e) { toast('Diese Datei ist kein gültiges Backup.'); }
}
const demoId = () => DEMO + uid();
export function loadDemo(){
  if (isConnected()) return;
  const day = 864e5, now = Date.now();
  const mau = {id:demoId(), name:'Mau', species:'Katze', photo:null, createdAt:now};
  db.pets.push(mau);
  const plan = [
    ['Sheba', 'Lachs in Soße', 'Nassfutter', ['top', 'top', 'gut', 'mittel']],
    ['Felix', 'Huhn in Gelee', 'Nassfutter', ['top', 'gut', 'gut']],
    ['Whiskas', 'Thunfisch in Soße', 'Nassfutter', ['sosse', 'sosse', 'mittel']],
    ['Gourmet', 'Rind Pastete', 'Nassfutter', ['schlecht', 'schlecht', 'mittel']],
    ['Animonda Carny', 'Pute Pastete', 'Nassfutter', ['mittel', 'gut']],
    ['Dreamies', 'Käse', 'Snack', ['verputzt', 'verputzt']]
  ];
  const made = [], byBrand = {};
  for (const [brand, variety, type, rs] of plan) {
    const p = newProduct({brand, variety, type, animal:'Katze'}, demoId());
    p.lastPets = [mau.id]; byBrand[brand] = p;
    rs.forEach(r => made.push({id:demoId(), productId:p.id, servedAt:0, pets:{[mau.id]:{r, at:null}}, note:''}));
  }
  const people = ['Anna', 'Jonas'], slots = [7.25, 18.1, 12.5, 19.4];   // typical feeding times
  // random order, but the last three days without weak ratings: the sample must not report „frisst schlechter“
  made.sort(() => Math.random() - .5);
  const calm = made.filter(s => RATINGS[s.pets[mau.id].r].score >= 50).slice(0, 6);
  made.sort((a, b) => calm.includes(b) - calm.includes(a));
  made.forEach((s, i) => {
    const d = new Date(now - (Math.floor(i / 2) + 1) * day);
    const h = slots[(i * 3) % slots.length] + Math.random() * .6;
    d.setHours(Math.floor(h), Math.floor((h % 1) * 60), 0, 0);
    s.servedAt = d.getTime(); s.by = people[i % 2];
    Object.values(s.pets).forEach(x => { x.at = s.servedAt + 2 * 3600e3; });
  });
  made[3].note = 'Neue Packung';
  made.push({id:demoId(), productId:byBrand.Felix.id, servedAt:now - 2 * 3600e3, pets:petMap([mau.id]), note:'', by:'Anna'});
  db.servings.push(...made);
  db.servings.sort((a, b) => b.servedAt - a.servedAt);
  save();
  closeSheet().then(() => { update(); toast('Beispieldaten geladen'); });
}

/* Before connecting: remove the sample data without a trace, it has no business in the household.
   That includes whatever was served only for the sample pet, and food that hung only on it. */
export function purgeDemo(){
  const demo = id => id.startsWith(DEMO);
  const pets = new Set(db.pets.filter(p => demo(p.id)).map(p => p.id));
  const onlyDemo = s => { const ids = Object.keys(s.pets); return ids.length > 0 && ids.every(id => pets.has(id)); };
  const servings = new Set(db.servings.filter(s => demo(s.id) || onlyDemo(s)).map(s => s.id));
  const used = new Set(db.servings.filter(s => !servings.has(s.id)).map(s => s.productId));
  const fromDemo = new Set(db.servings.filter(s => servings.has(s.id)).map(s => s.productId));
  const products = new Set(db.products.filter(p => !used.has(p.id) && (demo(p.id) || fromDemo.has(p.id))).map(p => p.id));
  if (!pets.size && !servings.size && !products.size) return;
  purge({pets, products, servings});
  let touched = false; // keep mixed meals, only take the sample pet out of them
  for (const s of db.servings) for (const id of Object.keys(s.pets)) if (pets.has(id)) { delete s.pets[id]; touched = true; }
  prefs.lastPets = (prefs.lastPets || []).filter(id => !pets.has(id));
  savePrefs();
  if (touched) save();
}
