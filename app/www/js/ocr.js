/* The packaging text (read off the photo in native.js) into the same answer the server gives: brand, variety,
   type, animal, texture. Pure functions, so they can be tested on their own.
   Order: our own varieties, then a brand (from the list or from one of our own varieties), then the most
   prominent line as the variety. */
import {norm} from './text.js';
import {ANIMAL_WORDS, BRANDS, FLAVORS, TEXTURES, TYPE_WORDS} from './config.js';

export const MAX_VARIETY = 40;
export const PACK_LINES = 8; // shown as chips while naming; beyond this there are too many to scan
const MIN_BRAND = 4; // our own brands count as brands too, and a shorter word is too general to match on
const EMPTY = {brand: '', variety: '', type: '', animal: ''};
const QUANTITY =
  /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)?|\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|stk|stück)\b/gi;
const JUNK =
  /zutaten|zusammensetzung|analytische|bestandteile|inhaltsstoff|rohprotein|rohfett|rohasche|feuchtigkeit|vitamin|zusatzstoff|alleinfutter|ergänzungsfutter|haltbar|füllmenge|gmbh|www\.|@|\bean\b/i;
const ADS =
  /^(?:neu|new|jetzt|jetzt neu|gratis|aktion|vorteilspack|sparpack|premium|qualität|natürlich|frisch|lecker|100\s*%\s*natürlich|ohne zucker)$|^\d+\s*%/i;
const squeeze = s => norm(s).replace(/ /g, ''); // insensitive to case, hyphens and spaces
const has = (text, re) => re.test(text);

/* text: the text that was read, products: our own varieties. With nothing usable everything stays empty. */
export function readPack(text, products = []) {
  const raw = String(text || '');
  if (!raw.trim()) return {...EMPTY};
  const tight = squeeze(raw);
  const known = products
    .filter(
      p =>
        squeeze(`${p.brand} ${p.variety}`).length >= 4 &&
        tight.includes(squeeze(p.brand)) &&
        tight.includes(squeeze(p.variety)),
    )
    .sort((a, b) => squeeze(`${b.brand} ${b.variety}`).length - squeeze(`${a.brand} ${a.variety}`).length)[0];
  if (known)
    return {
      brand: known.brand || '',
      variety: known.variety || '',
      type: known.type || '',
      animal: known.animal || '',
      texture: known.texture,
    };

  const flat = ` ${norm(raw)} `;
  const brand =
    brandsOf(products)
      .filter(b => flat.includes(` ${norm(b)} `))
      .sort((a, b) => norm(b).length - norm(a).length)[0] || '';
  const type = foodType(raw);
  const variety = pickVariety(raw, brand);
  if (!brand && !variety) return {...EMPTY};
  const texture = TEXTURES[type]?.items.find(([, , re]) => re.test(raw))?.[0];
  return {
    brand,
    variety,
    type,
    animal: ANIMAL_WORDS.find(([, re]) => re.test(raw))?.[0] || '',
    ...(texture ? {texture} : {}),
  };
}

/* Every brand that may be read off a packaging: the list, plus the brands of our own varieties; once each and
   only from MIN_BRAND characters on. The match is on whole words and the longest hit wins. */
function brandsOf(products) {
  const out = [...BRANDS],
    seen = new Set(BRANDS.map(norm));
  for (const p of products) {
    const b = String(p?.brand || '').trim();
    if (b.length < MIN_BRAND || seen.has(norm(b))) continue;
    seen.add(norm(b));
    out.push(b);
  }
  return out;
}

/* Type: the unambiguous keywords first, otherwise the consistency keywords (Soße, Pastete → Nassfutter; Stick, Kau → Snack) */
function foodType(raw) {
  const direct = TYPE_WORDS.find(([, re]) => re.test(raw));
  if (direct) return direct[0];
  return Object.entries(TEXTURES).find(([, t]) => t.items.some(([, , re]) => re.test(raw)))?.[0] || '';
}

/* Variety: the most prominent line, without quantities, advertising, ingredients and bare numbers. Where several
   fit, they are joined in the order they appear on the packaging, at most MAX_VARIETY characters. */
function pickVariety(raw, brand) {
  const bare = norm(brand);
  const scored = packLines(raw, bare)
    .map((v, i) => ({v, i, s: score(v) - Math.min(1, i * 0.2)}))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return '';
  const take = [scored[0]];
  for (const x of scored.slice(1)) {
    if (x.s < 1) break;
    const merged = [...take, x]
      .sort((a, b) => a.i - b.i)
      .map(y => y.v)
      .join(' ');
    if (merged.length > MAX_VARIETY) break;
    take.push(x);
  }
  return take
    .sort((a, b) => a.i - b.i)
    .map(x => x.v)
    .join(' ')
    .slice(0, MAX_VARIETY)
    .trim();
}
/* The usable lines of a packaging text: without quantities, advertising, ingredients and bare numbers, none of
   them twice, at most PACK_LINES, in the order they stand on the packaging. pickVariety picks the variety from
   these, and while naming they are offered as chips, so the filter exists only once. `bare` is the normalised
   brand, which is dropped from the front of a line („Sheba Lachs in Soße“ → „Lachs in Soße“). */
export function packLines(text, bare = '') {
  const seen = new Set();
  return String(text || '')
    .split(/\r?\n/)
    .map(l =>
      withoutBrand(l.replace(QUANTITY, ' ').replace(/\s+/g, ' ').trim(), bare).replace(
        /^[\s\-–,·|]+|[\s\-–,·|]+$/g,
        '',
      ),
    )
    .filter(v => {
      if (v.length < 3 || (v.match(/[A-Za-zÄÖÜäöüß]/g) || []).length < 3) return false;
      if (JUNK.test(v) || ADS.test(v) || norm(v) === bare || seen.has(norm(v))) return false;
      seen.add(norm(v));
      return true;
    })
    .slice(0, PACK_LINES);
}

/* A line read off the packaging inside one of the naming fields, whole and between spaces. That is how a second
   tap finds it again, and why a field that already says something gets the line appended rather than replaced. */
const tidy = s =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
export const hasLine = (value, line) => ` ${tidy(value)} `.includes(` ${tidy(line)} `);
export const withLine = (value, line) => (tidy(value) ? `${tidy(value)} ${tidy(line)}` : tidy(line));
export const withoutLine = (value, line) => tidy(` ${tidy(value)} `.replace(` ${tidy(line)} `, ' '));

function withoutBrand(v, bare) {
  // "Sheba Lachs in Soße" → "Lachs in Soße"
  if (!bare) return v;
  const words = v.split(' ');
  for (let n = 1; n <= words.length; n++) {
    const head = norm(words.slice(0, n).join(' '));
    if (head === bare) return words.slice(n).join(' ');
    if (!bare.startsWith(head)) break;
  }
  return v;
}
const score = v =>
  (FLAVORS.some(([, re]) => has(v, re)) ? 3 : 0) +
  (Object.values(TEXTURES).some(t => t.items.some(([, , re]) => has(v, re))) ? 2 : 0) +
  (TYPE_WORDS.some(([, re]) => has(v, re)) ? 1 : 0) +
  Math.min(2, v.length / 12);
