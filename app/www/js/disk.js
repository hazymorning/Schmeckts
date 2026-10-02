// private app files on the phone (Android keeps them when space runs low), localStorage in the browser
import {Native} from './native.js';
import {report} from './report.js';

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
      } catch {
        // e.g. a file:// page in some browsers
        return false;
      }
    })();
export const diskHooks = {failed() {}};

async function readText(path) {
  try {
    return (await FS.readFile({path, directory: DIR, encoding: 'utf8'})).data;
  } catch (e) {
    const exists = await FS.stat({path, directory: DIR}).then(
      () => true,
      () => false,
    );
    if (exists) throw e; // never carry on with an empty state
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
      report(`${KEYS[name]} is corrupted`, e);
      return null;
    }
  }
  let path = name + '.json',
    text = await readText(path);
  if (text == null) {
    path += '.tmp'; // a crash between delete and rename
    text = await readText(path);
  }
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    const aside = `${name}.corrupt-${Date.now()}.json`;
    await FS.rename({from: path, to: aside, directory: DIR, toDirectory: DIR}).catch(e =>
      report('setting the corrupted file aside', e),
    );
    report(`${path} is corrupted and now sits alongside as ${aside}`);
    return null;
  }
}

// true when unsure, so nothing is tidied away
export async function setAside() {
  if (!FS) return false;
  try {
    return (await FS.readdir({path: '', directory: DIR})).files.some(f => /\.corrupt-\d+\.json$/.test(f.name));
  } catch (e) {
    report('looking for set-aside data', e);
    return true;
  }
}

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
  } catch {
    // rename may not overwrite; the target may be missing, and after a crash here read() takes the .tmp
    await FS.deleteFile({path, directory: DIR}).catch(() => {});
    await FS.rename({from: tmp, to: path, directory: DIR, toDirectory: DIR});
  }
}

const pending = new Map(); // name → {produce, done}
let busy = false,
  fails = 0,
  retryTimer = null;
const idle = [];

// produce() runs at write time so the newest state is written; done(ctx) runs after that write
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
      if (!pending.has(name)) pending.set(name, job); // everything behind it waits
      busy = false;
      if (!fails++) diskHooks.failed(e);
      report(`saving ${name} failed`, e);
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

export const flush = () => (busy || pending.size ? new Promise(resolve => idle.push(resolve)) : Promise.resolve());
