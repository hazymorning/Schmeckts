/* Durable storage for queue, db, sync and prefs: files in private app storage in the app (Android does not clear
   those even when short on space), localStorage in the browser. Writing happens in the background, atomically and
   always in the order given by ORDER; why that guards against data loss is explained in store.js. */
import {Native} from './native.js';

const FS = Native?.Filesystem;
const DIR = 'DATA';
const KEYS = {db: 'schmeckts-v3', prefs: 'schmeckts-prefs', sync: 'schmeckts-sync', queue: 'schmeckts-queue'};
const ORDER = ['queue', 'db', 'sync', 'prefs'];

export const storageOK = FS
  ? true
  : (() => {
      try {
        localStorage.setItem('__t', '1');
        localStorage.removeItem('__t');
        return true;
      } catch (e) {
        return false;
      }
    })();
export const diskHooks = {failed() {}}; // reports write failures (storage full)

/* Reading */
async function readText(path) {
  try {
    return (await FS.readFile({path, directory: DIR, encoding: 'utf8'})).data;
  } catch (e) {
    const exists = await FS.stat({path, directory: DIR}).then(
      () => true,
      () => false,
    );
    if (exists) throw e; // there but unreadable: never carry on with an empty state
    return null;
  }
}

export async function read(name) {
  if (!FS) {
    if (!storageOK) return null;
    try {
      const t = localStorage.getItem(KEYS[name]);
      return t ? JSON.parse(t) : null;
    } catch (e) {
      console.warn(`${KEYS[name]} is corrupted`, e);
      return null;
    }
  }
  let path = name + '.json',
    text = await readText(path);
  if (text == null) {
    path += '.tmp';
    text = await readText(path);
  } // a crash between deleting and renaming
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    // corrupted: set it aside instead of overwriting
    const aside = `${name}.corrupt-${Date.now()}.json`;
    await FS.rename({from: path, to: aside, directory: DIR, toDirectory: DIR}).catch(() => {});
    console.warn(`${path} is corrupted and now sits alongside as ${aside}`);
    return null;
  }
}

/* Writing */
async function writeNow(name, text) {
  if (!FS) {
    if (storageOK) localStorage.setItem(KEYS[name], text);
    return;
  }
  const path = name + '.json',
    tmp = path + '.tmp';
  await FS.writeFile({path: tmp, data: text, directory: DIR, encoding: 'utf8'});
  try {
    await FS.rename({from: tmp, to: path, directory: DIR, toDirectory: DIR});
  } catch (e) {
    // if rename will not replace the target, delete first. If the app crashes in between, read() takes the .tmp
    await FS.deleteFile({path, directory: DIR}).catch(() => {});
    await FS.rename({from: tmp, to: path, directory: DIR, toDirectory: DIR});
  }
}

const pending = new Map(); // name → {produce, done}
let busy = false,
  fails = 0,
  retryTimer = null,
  idle = [];

/* produce() returns {text, ctx} only at write time, so the newest state always reaches the disk.
   done(ctx) runs once exactly that state has been written. */
export function schedule(name, produce, done) {
  pending.set(name, {produce, done});
  if (!busy) loop();
}

async function loop() {
  busy = true;
  while (pending.size) {
    const name = ORDER.find(n => pending.has(n));
    const job = pending.get(name);
    pending.delete(name);
    const {text, ctx} = job.produce();
    try {
      await writeNow(name, text);
    } catch (e) {
      if (!pending.has(name)) pending.set(name, job); // retry later; later documents wait
      busy = false;
      if (!fails++) diskHooks.failed(e);
      console.warn('saving failed:', name, e);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(
        () => {
          if (!busy) loop();
        },
        Math.min(60e3, 5e3 * 2 ** fails),
      );
      return;
    }
    fails = 0;
    job.done?.(ctx);
  }
  busy = false;
  idle.splice(0).forEach(resolve => resolve());
}

/* Waits until everything has been written */
export const flush = () => (busy || pending.size ? new Promise(resolve => idle.push(resolve)) : Promise.resolve());
