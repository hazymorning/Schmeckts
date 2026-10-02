// stages run cheapest first; any may be skipped, and an error moves on to the next
import {ServerError, request} from './api.js';
import {SPECIES, TYPES} from './config.js';
import {readPhoto} from './native.js';
import {cropped, photoOf, readable} from './images.js';
import {
  CROP_WIDTH,
  focusOf,
  joinReadings,
  packBrands,
  packLines,
  readPack,
  SECOND_PASS,
  SECOND_PASS_MS,
} from './ocr.js';
import {lookupOnline} from './online.js';
import {db, prefs} from './store.js';
import {isConnected, serverCan, status} from './sync.js';
import {getProduct, productsByCode} from './derive.js';
import {report} from './report.js';

const RETRY = new Set(['offline', 'busy', 'unavailable', 'server', 'auth', 'locked']);
const LOOKING = 'Barcode wird nachgeschlagen …',
  READING = 'Sorte wird erkannt …';

// run() gives {products}, {details} or null
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
      const first = await readPhoto(o.sharp || o.photo);
      const second = await readAgain(o.sharp || o.photo, first);
      if (first.raw) last = {meal: o.meal, at: Date.now(), ...first, ...(second ? {second} : {})};
      if (timing.on && o.sharp) await measure(o, first);
      const read = second ? joinReadings(first, second.read, second) : first;
      const pack = readPack(read, db.products),
        // a known variety counts like a barcode hit, unless the server reads photos
        known = !photoByServer() && pack.known ? getProduct(pack.known) : null;
      const hit = known ? {products: [known]} : asDetails(pack);
      // tidied like the fields, so a chip and its field agree
      return hit && {...hit, lines: packLines(read, '', db.products), brands: packBrands(read, db.products)};
    },
  },
];

// only after a quick first reading with a line that stands out; a failure leaves the first reading as it is
async function readAgain(b64, first) {
  const crop = SECOND_PASS && first.raw && first.ms <= SECOND_PASS_MS ? focusOf(first, db.products) : null;
  if (!crop) return null;
  try {
    const part = await cropped(await photoOf(b64), crop, CROP_WIDTH);
    const read = await readPhoto(part.b64);
    return read.raw ? {...crop, scale: part.scale, read} : null;
  } catch (e) {
    report('reading the variety a second time', e);
    return null;
  }
}

export const photoByServer = () => isConnected() && prefs.serverPhoto;

// meal → {lines, brands}, memory only
export const memLines = new Map();
// ms the naming sheet shows a skeleton before the empty fields
export const READ_PATIENCE = 2500;
export const readingSince = new Map();

// for schmeckts://ocr-dump, which shares it as a test fixture
let last = null;
export const lastReading = () => last;

// switched on by schmeckts://ocr-measure for this run; ms: {px: [milliseconds]}
export const timing = {on: false, ms: {}};
async function measure(o, read) {
  const took = (px, ms) => {
    (timing.ms[px] ||= []).push(ms);
    console.info(`reading at ${px} px: ${ms} ms`);
  };
  const edge = Math.max(read.width, read.height),
    img = await photoOf(o.sharp);
  took(edge, read.ms);
  for (const px of [1100, 1800].filter(n => n < edge)) took(px, (await readPhoto(await readable(img, px))).ms);
}

// sharp: the same photo larger, for reading on the phone; returns {source, products|details} or {source: '', error}
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
      error = e; // the last error is what the interface explains
      report(`recognition (${step.name})`, e);
    }
  }
  note('');
  return {source: '', error};
}

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

// the photo setting holds back the photo only, the barcode always goes out
async function fromServer({code, photo}) {
  if (code && (await serverCan('barcode'))) {
    const hit = await lookupBarcode(code).catch(e => {
      report('barcode lookup', e);
      return null;
    });
    const found = hit?.found ? asDetails(hit) : null;
    if (found) return found;
  }
  return photo && prefs.serverPhoto ? asDetails(await recognize(photo)) : null;
}

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

// the server waits up to 5 s per database
export const lookupBarcode = code => request('GET', '/api/barcode/' + encodeURIComponent(code), {timeout: 15e3});
