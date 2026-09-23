/* The large packaging photo of a variety, on this phone only (PROJECT.md, „Data and sync protocol“): one file per
   variety in private storage, the first photo this phone took of it. Written once when a meal gets its variety and
   never on saving, so db.json stays small; never synced and not in a backup or an exchange file. In the browser
   nothing is kept, and only a meal that has no variety yet can show its photo large. */
import {Native} from './native.js';
import {report} from './report.js';
import {memPhotos} from './images.js';

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

/* Whether a large photo can be shown: the variety's file, or while a meal has no variety its own photo */
export const hasPhoto = (s, p) => (p ? kept.has(p.id) : !!s && (memPhotos.has(s.id) || !!s.photo));

/* The photo as a data URL, or null when there is none (any more) */
export async function photoSrc(s, p) {
  if (!p) {
    const b64 = s && memPhotos.get(s.id);
    return b64 ? 'data:image/jpeg;base64,' + b64 : s?.photo || null;
  }
  if (!FS || !kept.has(p.id)) return null;
  await writing.get(p.id);
  try {
    return 'data:image/jpeg;base64,' + (await FS.readFile({path: file(p.id), directory: DIR})).data;
  } catch (e) {
    kept.delete(p.id);
    report('reading the packaging photo', e);
    return null;
  }
}

/* Kept and origin change at once, the file follows: a view drawn right after already offers the photo, and
   photoSrc() waits for the file */
function track(pid, w) {
  const done = w.finally(() => {
    if (writing.get(pid) === done) writing.delete(pid);
  });
  writing.set(pid, done);
}

/* A meal (sid) gets its variety: its photo becomes the variety's, unless the variety has one already. b64 without
   the data URL prefix: the large photo from memory, or the meal's smaller one after a restart. */
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

/* A variety's photo goes: it is gone, or its file could not be read */
export function forgetPhoto(pid) {
  if (!FS) return;
  kept.delete(pid);
  origin.delete(pid);
  FS.deleteFile({path: file(pid), directory: DIR}).catch(e => report('deleting the packaging photo', e));
}

/* Every photo whose variety is not in `keep` goes */
export function sweepPhotos(keep) {
  for (const id of [...kept]) if (!keep.has(id)) forgetPhoto(id);
}
