// One packaging photo file per variety, kept out of db.json, sync, backups and exchange files so those stay small.
// Other phones in the household fetch it from the server (sharedPhoto); the browser keeps none.
import {Native} from './native.js';
import {report} from './report.js';
import {memPhotos} from './images.js';
import {ServerError, request} from './api.js';
import {prefs, savePrefs} from './store.js';
import {isConnected, reachable} from './sync.js';

const FS = Native?.Filesystem,
  DIR = 'DATA',
  FOLDER = 'photos',
  file = id => `${FOLDER}/${id}.jpg`;
const kept = new Set(),
  writing = new Map(),
  origin = new Map(); // variety → the meal its photo came from, this run only

if (FS)
  try {
    for (const f of (await FS.readdir({path: FOLDER, directory: DIR})).files) {
      const m = /^(.+)\.jpg$/.exec(f.name);
      if (m) kept.add(m[1]);
    }
  } catch {
    // no folder yet
  }

export const hasPhoto = (s, p) =>
  p ? kept.has(p.id) || (!!p.sharedPhoto && isConnected()) : !!s && (memPhotos.has(s.id) || !!s.photo);

// sharedPhoto: true for a variety's first photo, a stamp once a phone replaced it
export const serverStamp = p => (typeof p.sharedPhoto === 'number' ? p.sharedPhoto : 0);
// throws if the server fails and no older photo is here; with one here, stale(e) is told and the old one shown
export async function photoSrc(s, p, stale) {
  if (!p) {
    const b64 = s && memPhotos.get(s.id);
    return b64 ? 'data:image/jpeg;base64,' + b64 : s?.photo || null;
  }
  let b64 = await photoData(p.id);
  const stamp = serverStamp(p);
  if ((!b64 || stamp > (prefs.photoStamps[p.id] || 0)) && p.sharedPhoto && isConnected()) {
    let fresh = null;
    try {
      if (!reachable()) throw new ServerError('offline', 'Der Server ist gerade nicht erreichbar.');
      fresh = await request('GET', '/api/photo/' + p.id, {timeout: 10e3}).then(x => x.image || null);
    } catch (e) {
      if (e.status !== 404) {
        if (!b64) throw e;
        stale(e);
      }
    }
    if (fresh) {
      if (b64) replacePhotoFile(p.id, fresh);
      else keepPhoto(p.id, fresh);
      b64 = fresh;
      if (stamp) {
        prefs.photoStamps[p.id] = stamp;
        savePrefs();
      }
    }
  }
  return b64 ? 'data:image/jpeg;base64,' + b64 : null;
}

export async function photoData(pid) {
  if (!FS || !kept.has(pid)) return null;
  await writing.get(pid);
  try {
    return (await FS.readFile({path: file(pid), directory: DIR})).data;
  } catch (e) {
    if (!/exist/i.test(e?.message)) throw e; // anything but a missing file keeps the photo
    forgetPhoto(pid);
    return null;
  }
}
export const keptPhoto = pid => kept.has(pid);

// kept and origin change at once so the next view offers the photo; readers wait for the file
function track(pid, w) {
  const done = w.finally(() => {
    if (writing.get(pid) === done) writing.delete(pid);
  });
  writing.set(pid, done);
}

// b64 without the data URL prefix; sid is the meal it came from, none when fetched from the server
export function keepPhoto(pid, b64, sid) {
  if (!FS || !pid || !b64 || kept.has(pid)) return;
  kept.add(pid);
  origin.set(pid, sid);
  track(
    pid,
    FS.writeFile({path: file(pid), data: b64, directory: DIR, recursive: true}).catch(e => {
      kept.delete(pid);
      report('keeping the packaging photo', e);
    }),
  );
}

export function replacePhotoFile(pid, b64) {
  if (!FS || !pid || !b64) return;
  kept.add(pid);
  origin.delete(pid);
  track(
    pid,
    Promise.resolve(writing.get(pid))
      .then(() => FS.writeFile({path: file(pid), data: b64, directory: DIR, recursive: true}))
      .catch(e => {
        kept.delete(pid);
        report('replacing the packaging photo', e);
      }),
  );
}

export const photoFrom = pid => origin.get(pid);

export function passPhoto(from, into) {
  if (!FS || !kept.has(from) || from === into) return;
  if (kept.has(into)) return forgetPhoto(from);
  kept.delete(from);
  kept.add(into);
  origin.set(into, origin.get(from));
  origin.delete(from);
  track(
    into,
    Promise.resolve(writing.get(from))
      .then(() => FS.rename({from: file(from), to: file(into), directory: DIR, toDirectory: DIR}))
      .catch(e => {
        kept.delete(into);
        report('moving the packaging photo', e);
      }),
  );
}

export function forgetPhoto(pid) {
  if (!FS || !kept.has(pid)) return;
  kept.delete(pid);
  origin.delete(pid);
  FS.deleteFile({path: file(pid), directory: DIR}).catch(e => report('deleting the packaging photo', e));
}

export function sweepPhotos(keep) {
  for (const id of [...kept]) if (!keep.has(id)) forgetPhoto(id);
  const gone = Object.keys(prefs.photoStamps).filter(id => !keep.has(id));
  if (!gone.length) return;
  for (const id of gone) delete prefs.photoStamps[id];
  savePrefs();
}
