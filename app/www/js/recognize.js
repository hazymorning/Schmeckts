// stages run cheapest first; any may be skipped, and an error moves on to the next
import {request} from './api.js';
import {TYPES} from './config.js';
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
import {reachable, status} from './sync.js';
import {getProduct, productsByCode} from './derive.js';
import {report} from './report.js';

const RETRY = new Set(['offline', 'busy', 'unavailable', 'server', 'auth', 'locked']);

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
    hint: 'Barcode wird nachgeschlagen …',
    when: o => !!o.code && !!prefs.lookup,
    run: o => lookupOnline(o.code).then(asDetails),
  },
  {
    name: 'server',
    hint: 'Sorte wird erkannt …',
    when: o => !!o.photo && photoByServer(),
    run: o => recognize(o.photo).then(asDetails),
  },
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
      // tidied like the fields, so a chip and its field agree; read places the thumbnail
      return hit && {...hit, read, lines: packLines(read, '', db.products), brands: packBrands(read, db.products)};
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

// a server out of reach or without a key leaves the photo to the phone
export const photoByServer = () => reachable() && prefs.serverPhoto && status.recognition !== false;

// meal → {lines, brands}, memory only
export const memLines = new Map();
// ms the naming sheet shows a skeleton before the empty fields
export const READ_PATIENCE = 2500;
export const readingSince = new Map(); // meal → when its recognition began

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
      texture: hit.texture,
    },
  };
}

async function recognize(b64) {
  try {
    return await request('POST', '/api/recognize', {body: {image: b64}, timeout: 70e3});
  } catch (e) {
    e.retry = RETRY.has(e.kind);
    throw e;
  }
}
