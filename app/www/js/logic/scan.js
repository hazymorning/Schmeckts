/* Scanning while feeding. The recognition chain (recognize.js) says what the code is: serve a known variety, offer a
   choice where several match, otherwise look the product up on the internet or through the server. Without a hit the
   photo of the front follows. */
import {normBarcode} from '../text.js';
import {haptic, scanBarcode} from '../native.js';
import {findProduct} from '../derive.js';
import {identify} from '../recognize.js';
import {toast} from '../ui/toast.js';
import {closeSheet, renderSheet, sheet} from '../ui/sheet.js';
import {serveProduct, shootPhoto} from './feeding.js';
import {applyTexture, newProduct} from './products.js';

const FRONT = 'Vorderseite fotografieren';
let running = false;

/* Starts in the open feeding sheet: the „Scannen“ button, a shortcut or schmeckts://scan */
export async function scan() {
  const feed = sheet;
  if (running || feed?.kind !== 'feed') return;
  running = true;
  Object.assign(feed, {step: null, code: ''});
  try {
    await run(feed);
  } finally {
    running = false;
    note(feed, '');
  }
}

const open = feed => sheet === feed; // still the same feeding sheet? Otherwise it has been closed meanwhile
function note(feed, text) {
  // a short notice with a spinner in the feeding sheet
  if ((feed.busy || '') === text) return;
  feed.busy = text;
  if (open(feed)) renderSheet();
}

async function run(feed) {
  let raw;
  try {
    raw = await scanBarcode(() => note(feed, 'Der Scanner wird eingerichtet …'));
  } catch (e) {
    console.warn('Scanner:', e?.message || e);
    return offerPhoto(feed, 'Scannen klappt auf diesem Handy gerade nicht. Mach stattdessen ein Foto.');
  }
  note(feed, '');
  if (!raw || !open(feed)) return; // cancelled: the feeding sheet stays
  const code = normBarcode(raw);
  if (!code) {
    haptic('strong');
    toast('Das ist kein gültiger Barcode.');
    return;
  }
  const found = await identify({code, note: text => note(feed, text)});
  if (!open(feed)) return;
  const known = found.products || [];
  if (known.length === 1) return serve(known[0], code);
  if (known.length > 1) {
    haptic('select');
    Object.assign(feed, {step: 'pick', code});
    renderSheet();
    return;
  }
  if (found.details) {
    const hit = found.details,
      p = findProduct(hit.brand, hit.variety);
    if (p) applyTexture(p, hit);
    return serve(p || newProduct(hit), code);
  }
  await photo(feed, code);
}

async function serve(p, code) {
  await closeSheet();
  serveProduct(p.id, code);
}

/* Camera for the front. After „Abbrechen“ the feeding sheet stays and the photo button then takes over the code. */
async function photo(feed, code) {
  feed.code = code;
  await shootPhoto(FRONT, code);
}

function offerPhoto(feed, msg) {
  // scanning did not work
  if (!open(feed)) return;
  haptic('strong');
  renderSheet();
  toast(msg);
}
