/* Recognising a food packaging. The chain sits in one place (identify) and runs cheapest first:
   known barcode in the household → product lookup on the internet (if allowed) → server (barcode always, the photo
   only while „Fotos über den Server erkennen“ is on) → on-device text recognition → empty form.
   Every stage may be skipped, an error moves on to the next; note() tells the interface what is running.
   Errors from photo recognition through the server carry retry: true when another attempt is worth it. */
import {ServerError, request} from './api.js';
import {SPECIES, TYPES} from './config.js';
import {readPhoto} from './native.js';
import {photoOf, READ_MAX, readable} from './images.js';
import {packLines, readPack} from './ocr.js';
import {lookupOnline} from './online.js';
import {db, prefs} from './store.js';
import {isConnected, serverCan, status} from './sync.js';
import {productsByCode} from './derive.js';
import {report} from './report.js';

const RETRY = new Set(['offline', 'busy', 'unavailable', 'server', 'auth', 'locked']);
const LOOKING = 'Barcode wird nachgeschlagen …',
  READING = 'Sorte wird erkannt …';

/* One stage: name, its condition, the notice while it runs, what it does. Result {products}, {details} or null. */
const STEPS = [
  {
    name: 'codes',
    when: o => !!o.code,
    run: o => {
      const found = productsByCode(o.code);
      return found.length ? {products: found} : null;
    },
  },
  {
    name: 'online',
    hint: LOOKING,
    when: o => !!o.code && !!prefs.lookup,
    run: o => lookupOnline(o.code).then(asDetails),
  },
  {name: 'server', hint: o => (o.code ? LOOKING : READING), when: () => isConnected(), run: fromServer},
  {
    name: 'text',
    when: o => !!o.photo,
    run: async o => {
      const read = await readPhoto(o.sharp || o.photo);
      if (read.raw) last = {meal: o.meal, at: Date.now(), ...read};
      if (timing.on && o.sharp) await measure(o, read);
      const hit = asDetails(readPack(read, db.products));
      // the lines are offered as chips while naming, tidied the same way, so a chip and the field agree
      return hit && {...hit, lines: packLines(read, '', db.products)};
    },
  },
];

/* Whether the server recognises packaging photos: connected, and not switched off under „Scannen“. With the
   switch off the photo takes the same way as without a household, the phone reading the text itself. */
export const photoByServer = () => isConnected() && prefs.serverPhoto;

/* What the phone read off a packaging, per meal and in memory only, like the large photo: never stored and never
   synced. While naming, „Auf der Packung gelesen“ offers these lines as chips (views/sheets.js). */
export const memLines = new Map();

/* The phone's last reading of a packaging, in memory only like the lines: the plugin's whole answer, the size of the
   photo, how long it took and the meal it belongs to. schmeckts://ocr-dump shares it as a test fixture
   (exportReading() in logic/data.js); nothing else looks at it. */
let last = null;
export const lastReading = () => last;

/* How long the plugin takes by the size of the photo, for choosing READ_MAX (PROJECT.md): schmeckts://ocr-measure
   switches it on for as long as the app runs, and every photo is then read at 1100 and 1800 px as well. Written to
   the console and shared with schmeckts://ocr-dump, never stored. ms: {px: [milliseconds]} */
export const timing = {on: false, ms: {}};
async function measure(o, read) {
  const took = (px, ms) => {
    (timing.ms[px] ||= []).push(ms);
    console.info(`reading at ${px} px: ${ms} ms`); // the measurement is what this is for, so it goes to the console
  };
  took(Math.max(read.width, read.height), read.ms);
  const img = await photoOf(o.sharp);
  for (const px of [1100, 1800].filter(n => n < READ_MAX)) took(px, (await readPhoto(await readable(img, px))).ms);
}

/* code: the scanned barcode, photo: the photo as base64, sharp: the same photo larger for reading its text on the
   phone (images.js, READ_MAX), meal: the meal it is for, note: a short notice for the interface.
   Returns {source, products|details} or {source:'', error}; the form then stays empty. */
export async function identify({code = '', photo = '', sharp = '', meal = '', note = () => {}} = {}) {
  const o = {code, photo, sharp, meal};
  let error = null;
  for (const step of STEPS) {
    if (!step.when(o)) continue;
    try {
      note(typeof step.hint === 'function' ? step.hint(o) : step.hint || '');
      const hit = await step.run(o);
      if (hit) {
        note('');
        return {source: step.name, ...hit};
      }
    } catch (e) {
      error = e; // kept for the caller: the last error is what the interface explains
      report(`recognition (${step.name})`, e);
    }
  }
  note('');
  return {source: '', error};
}

/* Bring an answer into the server's shape: without a brand and a variety it does not count */
function asDetails(hit) {
  const brand = String(hit?.brand || '').trim(),
    variety = String(hit?.variety || '').trim();
  if (!brand && !variety) return null;
  return {
    details: {
      brand,
      variety,
      type: TYPES.includes(hit.type) ? hit.type : undefined,
      animal: SPECIES.some(s => s.k === hit.animal) ? hit.animal : undefined,
      texture: hit.texture,
    },
  };
}

/* Server: the lookup for a barcode (from server 1.1.0), AI recognition for a photo. The switch under „Scannen“
   holds back the photo only; the barcode goes out as it always did. */
async function fromServer({code, photo}) {
  if (code && (await serverCan('barcode'))) {
    const hit = await lookupBarcode(code).catch(e => {
      report('barcode lookup', e);
      return null; // the photo recognition below is the next stage
    });
    const found = hit?.found ? asDetails(hit) : null;
    if (found) return found;
  }
  return photo && prefs.serverPhoto ? asDetails(await recognize(photo)) : null;
}

/* Photo recognition through the household server: key, model and prompt are configured there. */
export async function recognize(b64) {
  if (!prefs.code) throw Object.assign(new ServerError('none', 'Kein Server verbunden.'), {retry: false});
  if (status.recognition === false) {
    throw Object.assign(
      new ServerError('unavailable', 'Auf dem Server ist die Foto-Erkennung noch nicht eingerichtet.'),
      {retry: true},
    );
  }
  try {
    return await request('POST', '/api/recognize', {body: {image: b64}, timeout: 70e3});
  } catch (e) {
    e.retry = RETRY.has(e.kind);
    throw e;
  }
}

/* Look up an unknown barcode through the server (Open Pet Food Facts and Open Food Facts).
   Response {found, brand, variety, type, animal}. The server waits at most 5 seconds per database. */
export const lookupBarcode = code => request('GET', '/api/barcode/' + encodeURIComponent(code), {timeout: 15e3});
