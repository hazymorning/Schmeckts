import {normBarcode} from '../text.js';
import {haptic, scanBarcode} from '../native.js';
import {findProduct} from '../derive.js';
import {identify} from '../recognize.js';
import {toast} from '../ui/toast.js';
import {closeAll, renderSheet, sheet} from '../ui/sheet.js';
import {serveProduct, shootPhoto} from './feeding.js';
import {applyTexture, newProduct} from './products.js';

const FRONT = 'Vorderseite fotografieren';
let running = false;

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

const open = feed => sheet === feed;
function note(feed, text) {
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
  if (!raw || !open(feed)) return; // cancelled: the sheet stays open
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
  await closeAll();
  serveProduct(p.id, code);
}

// on cancel the sheet stays and its photo button takes the code over
async function photo(feed, code) {
  feed.code = code;
  await shootPhoto(FRONT, code);
}

function offerPhoto(feed, msg) {
  if (!open(feed)) return;
  haptic('strong');
  renderSheet();
  toast(msg);
}
