/* Scannen beim Füttern. Bekannter Code: servieren, bei mehreren Sorten Auswahl. Unbekannt: den Server fragen, falls er
   die Barcode-Suche kann; ohne Treffer weiter mit dem Foto der Vorderseite. */
import {normBarcode} from '../text.js';
import {haptic, scanBarcode} from '../native.js';
import {serverCan} from '../sync.js';
import {findProduct, productsByCode} from '../derive.js';
import {lookupBarcode} from '../recognize.js';
import {toast} from '../ui/toast.js';
import {closeSheet, renderSheet, sheet} from '../ui/sheet.js';
import {serveProduct, shootPhoto} from './feeding.js';
import {applyTexture, newProduct} from './products.js';

const FRONT = 'Vorderseite fotografieren';
let running = false;

/* Startet im offenen Füttern-Sheet: Knopf „Scannen“, Kurzbefehl oder schmeckts://scan */
export async function scan(){
  const feed = sheet;
  if (running || feed?.kind !== 'feed') return;
  running = true;
  Object.assign(feed, {step:null, code:''});
  try { await run(feed); }
  finally { running = false; note(feed, ''); }
}

const open = feed => sheet === feed; // noch dasselbe Füttern-Sheet? Sonst wurde es inzwischen geschlossen
function note(feed, text){ // kurzer Hinweis mit Spinner im Füttern-Sheet
  if ((feed.busy || '') === text) return;
  feed.busy = text;
  if (open(feed)) renderSheet();
}

async function run(feed){
  let raw;
  try { raw = await scanBarcode(() => note(feed, 'Der Scanner wird eingerichtet …')); }
  catch (e) {
    console.warn('Scanner:', e?.message || e);
    return offerPhoto(feed, 'Scannen klappt auf diesem Handy gerade nicht. Mach stattdessen ein Foto.');
  }
  note(feed, '');
  if (!raw || !open(feed)) return; // abgebrochen: das Füttern-Sheet bleibt
  const code = normBarcode(raw);
  if (!code) { haptic('strong'); toast('Das ist kein gültiger Barcode.'); return; }
  const known = productsByCode(code);
  if (known.length === 1) return serve(known[0], code);
  if (known.length > 1) { haptic('select'); Object.assign(feed, {step:'pick', code}); renderSheet(); return; }
  const hit = await lookup(feed, code);
  if (!open(feed)) return;
  if (hit) { const p = findProduct(hit.brand, hit.variety); if (p) applyTexture(p, hit); return serve(p || newProduct(hit), code); }
  await photo(feed, code);
}

/* Unbekannter Code: nur fragen, wenn der Server die Barcode-Suche kann. null ohne Treffer oder ohne Verbindung */
async function lookup(feed, code){
  if (!await serverCan('barcode')) return null;
  note(feed, 'Barcode wird nachgeschlagen …');
  const hit = await lookupBarcode(code).catch(e => { console.warn('Barcode-Suche:', e.message); return null; });
  note(feed, '');
  const brand = String(hit?.brand || '').trim(), variety = String(hit?.variety || '').trim();
  return hit?.found && (brand || variety) ? {brand, variety, type:hit.type, animal:hit.animal, texture:hit.texture} : null;
}

async function serve(p, code){
  await closeSheet();
  serveProduct(p.id, code);
}

/* Kamera für die Vorderseite. Nach „Abbrechen“ bleibt das Füttern-Sheet, der Foto-Knopf übernimmt dann den Code. */
async function photo(feed, code){
  feed.code = code;
  await shootPhoto(FRONT, code);
}

function offerPhoto(feed, msg){ // Scannen ging nicht
  if (!open(feed)) return;
  haptic('strong');
  renderSheet(); toast(msg);
}
