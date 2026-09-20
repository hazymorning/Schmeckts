/* Dauerhafter Speicher für queue, db, sync und prefs: in der App Dateien im privaten App-Speicher (den löscht Android
   auch bei Platzmangel nicht), im Browser localStorage. Geschrieben wird im Hintergrund, atomar und immer in der
   Reihenfolge von ORDER; warum das vor Datenverlust schützt, steht in store.js. */
import {Native} from './native.js';

const FS = Native?.Filesystem;
const DIR = 'DATA';
const KEYS = {db:'schmeckts-v3', prefs:'schmeckts-prefs', sync:'schmeckts-sync', queue:'schmeckts-queue'};
const ORDER = ['queue', 'db', 'sync', 'prefs'];

export const storageOK = FS ? true : (() => {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (e) { return false; }
})();
export const diskHooks = {failed(){}}; // meldet Schreibfehler (Speicher voll)

/* Lesen */
async function readText(path){
  try { return (await FS.readFile({path, directory:DIR, encoding:'utf8'})).data; }
  catch (e) {
    const exists = await FS.stat({path, directory:DIR}).then(() => true, () => false);
    if (exists) throw e; // vorhanden, aber nicht lesbar: auf keinen Fall mit leerem Stand weitermachen
    return null;
  }
}

export async function read(name){
  if (!FS) {
    if (!storageOK) return null;
    try { const t = localStorage.getItem(KEYS[name]); return t ? JSON.parse(t) : null; }
    catch (e) { console.warn(`${KEYS[name]} ist beschädigt`, e); return null; }
  }
  let path = name + '.json', text = await readText(path);
  if (text == null) { path += '.tmp'; text = await readText(path); } // Absturz zwischen Löschen und Umbenennen
  if (text == null) return null;
  try { return JSON.parse(text); }
  catch (e) { // beschädigt: beiseitelegen statt überschreiben
    const aside = `${name}.defekt-${Date.now()}.json`;
    await FS.rename({from:path, to:aside, directory:DIR, toDirectory:DIR}).catch(() => {});
    console.warn(`${path} ist beschädigt und liegt jetzt als ${aside} daneben`);
    return null;
  }
}

/* Schreiben */
async function writeNow(name, text){
  if (!FS) { if (storageOK) localStorage.setItem(KEYS[name], text); return; }
  const path = name + '.json', tmp = path + '.tmp';
  await FS.writeFile({path:tmp, data:text, directory:DIR, encoding:'utf8'});
  try { await FS.rename({from:tmp, to:path, directory:DIR, toDirectory:DIR}); }
  catch (e) { // ersetzt Umbenennen das Ziel nicht, erst löschen. Stürzt die App dazwischen ab, liest read() die .tmp
    await FS.deleteFile({path, directory:DIR}).catch(() => {});
    await FS.rename({from:tmp, to:path, directory:DIR, toDirectory:DIR});
  }
}

const pending = new Map(); // Name → {produce, done}
let busy = false, fails = 0, retryTimer = null, idle = [];

/* produce() liefert {text, ctx} erst beim Schreiben, so landet immer der neueste Stand auf der Platte.
   done(ctx) läuft, wenn genau dieser Stand geschrieben ist. */
export function schedule(name, produce, done){
  pending.set(name, {produce, done});
  if (!busy) loop();
}

async function loop(){
  busy = true;
  while (pending.size) {
    const name = ORDER.find(n => pending.has(n));
    const job = pending.get(name);
    pending.delete(name);
    const {text, ctx} = job.produce();
    try { await writeNow(name, text); }
    catch (e) {
      if (!pending.has(name)) pending.set(name, job); // später erneut, spätere Dokumente warten
      busy = false;
      if (!fails++) diskHooks.failed(e);
      console.warn('Speichern fehlgeschlagen:', name, e);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { if (!busy) loop(); }, Math.min(60e3, 5e3 * 2 ** fails));
      return;
    }
    fails = 0;
    job.done?.(ctx);
  }
  busy = false;
  idle.splice(0).forEach(resolve => resolve());
}

/* Wartet, bis alles geschrieben ist */
export const flush = () => busy || pending.size ? new Promise(resolve => idle.push(resolve)) : Promise.resolve();
