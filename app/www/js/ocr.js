/* The packaging text (read off the photo in native.js) into the same answer the server gives: brand, variety,
   type, animal, texture. Pure functions, so they can be tested on their own.
   Order: put the misread words right, then our own varieties, then a brand (from the list or from one of our own
   varieties), then the most prominent line as the variety. */
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
  const raw = cleanText(text, products);
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
  const variety = pickVariety(raw, brand, products);
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
function pickVariety(raw, brand, products) {
  const bare = norm(brand);
  const scored = packLines(raw, bare, products)
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
export function packLines(text, bare = '', products = []) {
  const seen = new Set();
  return cleanText(text, products)
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
      if (!says(v)) return false;
      seen.add(norm(v));
      return true;
    })
    .slice(0, PACK_LINES);
}

/* A line has to say something of its own: words like „mit“ alone, and a line that is nothing but promises, are
   no help while naming and only make the chips longer. */
const SMALL = new Set(
  'und oder mit ohne in im am an auf aus bei fur von vor zu zum zur neu the and with for'.split(' '),
);
const CLAIMS =
  /ohne (?:zusatz von )?(?:zucker|soja|getreide|gluten|farbstoffe|konservierungsstoffe|k(?:ü|ue)nstliche[a-zäöüß]*)|(?:zucker|getreide|gluten)frei/gi;
const says = v =>
  !!v.replace(CLAIMS, ' ').trim() &&
  norm(v)
    .split(' ')
    .some(w => w.length >= 3 && !SMALL.has(w));

/* Packaging print often shouts („TRULAHN & WILD aN SAUCE“), and written out that way a variety shouts through the
   whole app. A line that is mostly capitals is set in title case, with the small words German keeps small; a line
   already written normally is left as it is. */
const LETTER = /[\p{L}]/gu;
const WORDS = /\p{L}[\p{L}'’]*/gu;
function unshout(line) {
  const letters = line.match(LETTER) || [];
  if (letters.length < 2 || letters.filter(c => c === c.toLocaleUpperCase('de')).length / letters.length < 0.6)
    return line;
  return line
    .toLocaleLowerCase('de')
    .replace(WORDS, (w, at) => (at && SMALL.has(norm(w)) ? w : w[0].toLocaleUpperCase('de') + w.slice(1)));
}

/* The text as it can be read: the shouting taken out of every line, then the words the phone almost read put
   right („MLAMOR“ becomes „Miamor“), so that a variety already in the household is found again although a letter
   came out wrong. Measured against the brands we know and the words of our own varieties, from MIN_FIX
   characters, one mistake up to seven characters and two from eight, and only when exactly one word is that
   close: anything that could be two things stays as it was. Running it twice changes nothing more. */
const MIN_FIX = 5;
const WORD = new RegExp(`\\p{L}{${MIN_FIX},}`, 'gu');
export function cleanText(text, products = []) {
  const raw = String(text || '')
    .split(/\r?\n/)
    .map(unshout)
    .join('\n');
  const vocabulary = new Map();
  for (const s of [...BRANDS, ...products.flatMap(p => [p?.brand, p?.variety])])
    for (const w of String(s || '').split(/[^\p{L}]+/u))
      if (w.length >= MIN_FIX && !vocabulary.has(norm(w))) vocabulary.set(norm(w), w);
  return raw.replace(WORD, word => {
    const w = norm(word);
    if (vocabulary.has(w)) return word;
    const hits = [...vocabulary].filter(([v]) => close(w, v));
    return hits.length === 1 ? hits[0][1] : word;
  });
}
const close = (a, b) => {
  const max = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  return Math.abs(a.length - b.length) <= max && distance(a, b, max) <= max;
};
/* Levenshtein, given up as soon as every way through costs more than max */
function distance(a, b, max) {
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
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
