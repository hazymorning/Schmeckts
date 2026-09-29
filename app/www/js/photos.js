/* The large packaging photo of a variety, on this phone only (PROJECT.md, „Data and sync protocol“): one file per
   variety in private storage, the first photo this phone took of it or fetched, or the one „Foto ändern“ put in its
   place. Written when a meal gets its variety or the photo is changed and never on saving, so db.json stays small;
   never synced and not in a backup or an exchange file. In a household the phone that took it hands it to the
   server as well (sharePhotos() in logic/products.js), and any other phone fetches a variety marked sharedPhoto
   from there the first time someone opens it, and again once the server's is newer than the one it holds
   (prefs.photoStamps). In the browser nothing is kept: only a meal that has no variety yet can show its photo
   large, or a variety the household server holds. */
import {Native} from './native.js';
import {report} from './report.js';
import {memPhotos} from './images.js';
import {request} from './api.js';
import {prefs, savePrefs} from './store.js';
import {isConnected} from './sync.js';

const FS = Native?.Filesystem,
  DIR = 'DATA',
  FOLDER = 'photos',
  file = id => `${FOLDER}/${id}.jpg`;
const kept = new Set(), // varieties whose photo lies on this phone
  writing = new Map(), // variety → its write or move, while it is still under way
  origin = new Map(); // variety → the meal its photo came from, for as long as the app runs

if (FS)
  try {
    for (const f of (await FS.readdir({path: FOLDER, directory: DIR})).files) {
      const m = /^(.+)\.jpg$/.exec(f.name);
      if (m) kept.add(m[1]);
    }
  } catch {
    // no folder yet: nothing has been kept so far
  }

/* Whether a large photo can be shown: the variety's file, the household server's while connected, or while a meal
   has no variety its own photo */
export const hasPhoto = (s, p) =>
  p ? kept.has(p.id) || (!!p.sharedPhoto && isConnected()) : !!s && (memPhotos.has(s.id) || !!s.photo);

/* The stamp of the photo the household server holds, where a phone replaced it (sharedPhoto a number, PROJECT.md,
   „Data and sync protocol“); 0 for the first photo a variety got, marked true */
const serverStamp = p => (typeof p.sharedPhoto === 'number' ? p.sharedPhoto : 0);
/* The photo as a data URL, or null when there is none (any more). One only the household server holds is fetched and
   kept on this phone from then on, and so is one the server holds newer than this phone's (prefs.photoStamps); a
   server that cannot be reached throws its ServerError, unless an older photo is here, which is shown then and
   `stale` told of the error. */
export async function photoSrc(s, p, stale = () => {}) {
  if (!p) {
    const b64 = s && memPhotos.get(s.id);
    return b64 ? 'data:image/jpeg;base64,' + b64 : s?.photo || null;
  }
  let b64 = await photoData(p.id);
  const stamp = serverStamp(p);
  if ((!b64 || stamp > (prefs.photoStamps[p.id] || 0)) && p.sharedPhoto && isConnected()) {
    let fresh = null;
    try {
      fresh = await request('GET', '/api/photo/' + p.id, {timeout: 10e3}).then(x => x.image || null);
    } catch (e) {
      if (e.status !== 404) {
        if (!b64) throw e;
        stale(e); // the old one stands in
      } // 404: the server has none
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

/* The photo this phone keeps of a variety, as base64, or null. A file that cannot be read goes. */
export async function photoData(pid) {
  if (!FS || !kept.has(pid)) return null;
  await writing.get(pid);
  try {
    return (await FS.readFile({path: file(pid), directory: DIR})).data;
  } catch (e) {
    report('reading the packaging photo', e);
    forgetPhoto(pid);
    return null;
  }
}
export const keptPhoto = pid => kept.has(pid);

/* Kept and origin change at once, the file follows: a view drawn right after already offers the photo, and
   photoSrc() waits for the file */
function track(pid, w) {
  const done = w.finally(() => {
    if (writing.get(pid) === done) writing.delete(pid);
  });
  writing.set(pid, done);
}

/* A meal (sid) gets its variety: its photo becomes the variety's, unless the variety has one already. b64 without
   the data URL prefix: the large photo from memory, the meal's smaller one after a restart, or the one fetched from
   the household server (without sid). */
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

/* A variety's photo written anew („Foto ändern“, or one newer from the household server): the file is replaced,
   kept from now on, and came from no meal */
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

/* The meal a variety's photo came from, if that happened since the app started */
export const photoFrom = pid => origin.get(pid);

/* The photo of one variety goes to another: two became one, or a meal was corrected. When the other has a photo
   already, this one goes. */
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

/* A variety's photo goes from this phone: it is gone, or its file could not be read */
export function forgetPhoto(pid) {
  if (!FS || !kept.has(pid)) return;
  kept.delete(pid);
  origin.delete(pid);
  FS.deleteFile({path: file(pid), directory: DIR}).catch(e => report('deleting the packaging photo', e));
}

/* Every photo whose variety is not in `keep` goes, and so does the stamp of the photo held for it */
export function sweepPhotos(keep) {
  for (const id of [...kept]) if (!keep.has(id)) forgetPhoto(id);
  const gone = Object.keys(prefs.photoStamps).filter(id => !keep.has(id));
  if (!gone.length) return;
  for (const id of gone) delete prefs.photoStamps[id];
  savePrefs();
}
