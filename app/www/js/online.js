// barcode lookup straight from the phone, only when allowed in the settings; only the number is sent
import {prefs, savePrefs} from './store.js';

const BARCODE_URLS = ['https://world.openpetfoodfacts.org', 'https://world.openfoodfacts.org'];
const FIELDS = 'product_name,product_name_de,brands,categories_tags';
const KEEP_FOUND = 90 * 864e5,
  KEEP_MISS = 7 * 864e5,
  MAX_KEPT = 200,
  TIMEOUT = 5e3;
const QUANTITY = /\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)\b|\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)\b/gi;

export async function lookupOnline(code) {
  const kept = remembered(code);
  if (kept) return kept;
  let reached = false;
  for (const base of BARCODE_URLS) {
    let hit;
    try {
      hit = await fetchProduct(base, code);
    } catch {
      continue;
    }
    reached = true;
    if (hit.found) return remember(code, hit);
  }
  if (!reached) throw new Error('Keine Datenbank im Internet erreichbar.');
  return remember(code, {found: false});
}

async function fetchProduct(base, code) {
  const res = await fetch(`${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body?.status !== 1) return {found: false};
  const p = body.product || {};
  const brand = String(p.brands || '')
    .split(',')[0]
    .trim();
  const variety = cleanVariety(String(p.product_name_de || '').trim() || String(p.product_name || ''), brand);
  if (!brand && !variety) return {found: false};
  return {found: true, brand, variety, type: typeOfTags(Array.isArray(p.categories_tags) ? p.categories_tags : [])};
}

// "Sheba Fresh Choice Huhn in Sauce 4x50g" → "Fresh Choice Huhn in Sauce"
function cleanVariety(name, brand) {
  let v = String(name).replace(QUANTITY, ' ').replace(/\s+/g, ' ').trim();
  if (brand && v.toLowerCase().startsWith(brand.toLowerCase())) v = v.slice(brand.length);
  return v.replace(/^[\s\-–,·|]+|[\s\-–,·|]+$/g, '');
}

// unambiguous categories only
function typeOfTags(tags) {
  const has = (...words) => tags.some(t => words.some(w => String(t).includes(w)));
  const wet = has('wet'),
    dry = has('dry'),
    snack = has('treat', 'snack');
  return wet && !dry && !snack
    ? 'Nassfutter'
    : dry && !wet && !snack
      ? 'Trockenfutter'
      : snack && !wet && !dry
        ? 'Snack'
        : '';
}

// remembered so the same number does not go out again
function remembered(code) {
  const kept = prefs.codes?.[code];
  if (!kept || Date.now() - kept.at > (kept.found ? KEEP_FOUND : KEEP_MISS)) return null;
  const hit = {...kept};
  delete hit.at;
  return hit;
}
function remember(code, hit) {
  const codes = (prefs.codes ||= {});
  codes[code] = {...hit, at: Date.now()};
  const old = Object.entries(codes)
    .sort((a, b) => a[1].at - b[1].at)
    .slice(0, -MAX_KEPT);
  for (const [k] of old) delete codes[k];
  savePrefs();
  return hit;
}
