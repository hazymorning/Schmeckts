/* Packaging text to the same {brand, variety, type, texture} the server returns. Input is readingOf() lines
   or plain text; plain text has no sizes, so no line is dropped for being small or slanted. */
import {cutName, norm, SMALL} from './text.js';
import {BRANDS, FLAVORS, PRODUCT_LINES, TEXTURES, TYPE_WORDS} from './config.js';
import {VOCAB_BRANDS, VOCAB_WORDS} from './vocab.js';

export const MAX_VARIETY = 40;
export const PACK_LINES = 8; // more chips than this are too many to scan
const MIN_BRAND = 4; // shorter brands are too general to match or correct to

// Starting values from how type is set; heights are the plugin line heights in pixels
// letters of one word stand closer than this; higher values ran words with descenders together
const GAP = 0.15;
// radians off the main direction; beyond it is a round badge or part of the picture
const TILT = 0.15;
// share of the median line height; ML Kit needs about 16 px a letter, which small print does not have
const SMALL_PRINT = 0.4;
// heights within this ratio count as alike; a larger ratio outweighs anything the length adds to a score
const LIKE = 1.25;
const HEIGHT_WEIGHT = 8 / Math.log(LIKE);
const NEAR = 1.5; // in main line heights: lines this close belong to the same label
// a nearby line this tall joins the name without a keyword, a smaller one only with a flavour or texture
const BESIDE = 0.5;
// score lost by a line in another language ("Poulet & Saumon" beside "Huhn & Lachs"); it stays a chip
const FOREIGN = 4;
const OURS = new Set(['', 'und', 'de', 'en']); // 'und' is the plugin's "undetermined"

// The area around the variety is cropped, enlarged and read again (recognize.js).
export const SECOND_PASS = true;
export const SECOND_PASS_MS = 2000; // skipped when the first reading took longer
export const CROP_WIDTH = 1600; // px, the crop is read at least this wide
const DOMINANT = 1.5; // main line height over the median from which a closer look pays
const MARGIN = 0.25; // added on each side, as a share of the crop's width and height
const OVERLAP = 0.6; // of the smaller box
const INSIDE = 0.9; // a line the crop cuts through keeps its first reading

// The thumbnail of a packaging photo is the square around its text (feeding.js).
export const CLOSEST = 0.5; // of the photo's short side; closer in, a thumbnail shows print instead of a packaging
const ROOM = 0.15; // added on each side, as a share of the text's longer edge
const SAME_SHAPE = 0.02; // aspect ratios further apart are another photo, or the same one turned

const EMPTY = {brand: '', variety: '', type: ''};
const QUANTITY =
  /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)?|\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|stk|stück)\b/gi;
const JUNK =
  /zutaten|zusammensetzung|analytische|bestandteile|inhaltsstoff|rohprotein|rohfett|rohasche|feuchtigkeit|vitamin|zusatzstoff|alleinfutter|ergänzungsfutter|haltbar|füllmenge|gmbh|www\.|@|\bean\b/i;
const AD_WORDS = 'neu new jetzt gratis aktion vorteilspack sparpack premium qualität natürlich frisch lecker'.split(
  ' ',
);
const ADS = new RegExp(`^(?:${AD_WORDS.join('|')}|jetzt neu|100\\s*%\\s*natürlich|ohne zucker)$|^\\d+\\s*%`, 'i');
const squeeze = s => norm(s).replace(/ /g, ''); // insensitive to case, hyphens and spaces
const has = (text, re) => re.test(text);

export function readPack(read, products = []) {
  const page = pageOf(read, products);
  const raw = page.lines.map(l => l.text).join('\n');
  if (!raw.trim()) return {...EMPTY};
  const tight = squeeze(raw);
  const known = products
    .filter(
      p =>
        squeeze(p.brand || '') && // an empty brand or variety would match any text
        squeeze(p.variety || '') &&
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
      texture: known.texture,
      ...(known.id ? {known: known.id} : {}), // recognize.js treats this like a barcode hit
    };

  const brand = pickBrand(page, raw, products);
  const type = foodType(raw);
  const variety = pickVariety(page, brand, products);
  if (!brand && !variety) return {...EMPTY};
  const texture = TEXTURES[type]?.items.find(([, , re]) => re.test(raw))?.[0];
  return {brand, variety, type, ...(texture ? {texture} : {})};
}

// mid is the median line height, tilt the direction most lines run in, height the photo's
function pageOf(read, products) {
  const words = knownWords(products);
  const geo = typeof read === 'object' && read?.lines?.length > 0;
  const lines = geo
    ? read.lines.map(l => ({...l, text: spoken(l, words)}))
    : String((typeof read === 'object' ? read?.text : read) || '')
        .split(/\r?\n/)
        .map(text => ({text, h: 1}));
  const clean = cleanText(lines.map(l => l.text.replace(/[\r\n]+/g, ' ')).join('\n'), products).split('\n');
  lines.forEach((l, i) => (l.text = clean[i]));
  return {
    geo,
    lines: geo ? readingOrder(lines) : lines,
    mid: median(lines.map(l => l.h)) || 1,
    tilt: geo ? median(lines.map(l => l.tilt || 0)) : 0,
    height: (geo && read.height) || Math.max(0, ...lines.map(l => l.box?.bottom || 0)),
    words,
  };
}

/* Spacing comes from where the words stand, since the plugin's own is unreliable. A tiny unknown scrap at either
   end goes: a small "mit" in front of large print often reads as "A". */
function spoken(line, words) {
  const u = {x: Math.cos(line.tilt || 0), y: Math.sin(line.tilt || 0)};
  const parts = (line.elements || [])
    .map(e => {
      const at = e.cx * u.x + e.cy * u.y; // position along the line
      return {text: e.text, h: e.h, from: at - e.w / 2, to: at + e.w / 2};
    })
    .sort((a, b) => a.from - b.from);
  if (!parts.length) return String(line.text || '');
  const tallest = Math.max(...parts.map(p => p.h));
  const scrap = p => /^\p{L}{1,3}$/u.test(p.text) && p.h < SMALL_PRINT * tallest && !words.has(norm(p.text));
  while (parts.length > 1 && scrap(parts[0])) parts.shift();
  while (parts.length > 1 && scrap(parts.at(-1))) parts.pop();
  return parts.map((p, i) => (i && p.from - parts[i - 1].to >= GAP * line.h ? ' ' : '') + p.text).join('');
}

function readingOrder(lines) {
  const rows = [];
  for (const l of [...lines].sort((a, b) => a.cy - b.cy)) {
    const row = rows.at(-1);
    if (row && Math.abs(l.cy - row.cy) < Math.min(l.h, row.h) / 2) row.lines.push(l);
    else rows.push({cy: l.cy, h: l.h, lines: [l]});
  }
  return rows.flatMap(r => r.lines.sort((a, b) => a.box.left - b.box.left));
}

const median = values => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : 0;
};
// angle between two directions, 0 to π
const turn = (a, b) => Math.abs(((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
const noise = (l, page) => turn(l.tilt || 0, page.tilt) > TILT || l.h < SMALL_PRINT * page.mid;
const apart = (a, b) =>
  Math.max(0, a.box.left - b.box.right, b.box.left - a.box.right, a.box.top - b.box.bottom, b.box.top - a.box.bottom);

const LINE_NAMES = PRODUCT_LINES.flatMap(([, lines]) => lines);
const knownWords = products =>
  new Set([
    ...SMALL,
    ...[...BRANDS, ...LINE_NAMES, ...products.flatMap(p => [p?.brand, p?.variety])]
      .flatMap(s => norm(s).split(' '))
      .filter(Boolean),
  ]);
const flavourOrTexture = v =>
  FLAVORS.some(([, re]) => re.test(v)) || Object.values(TEXTURES).some(t => t.items.some(([, , re]) => re.test(v)));
const holdsKnown = (v, products) => {
  const flat = ` ${norm(v)} `;
  return (
    flavourOrTexture(v) ||
    brandsOf(products).some(b => flat.includes(` ${b.key} `)) ||
    products.some(p => squeeze(p?.variety).length >= 4 && squeeze(v).includes(squeeze(p.variety)))
  );
};

/* Hits in the two largest lines or the top third, where the logo is, rank first. A brand only Open Pet Food Facts
   knows must be in the two largest lines, since that list holds ordinary words too ("Classic"). */
function brandHits(page, raw, products) {
  const flat = ` ${norm(raw)} `;
  const hits = brandsOf(products).filter(b => flat.includes(` ${b.key} `));
  const order = (x, y) => x.vocab - y.vocab || y.key.length - x.key.length;
  const big = [...page.lines].sort((a, b) => b.h - a.h).slice(0, 2);
  const rank = b => {
    const at = page.lines.filter(l => ` ${norm(l.text)} `.includes(` ${b.key} `));
    return (at.some(l => big.includes(l)) ? 2 : 0) + (at.some(l => l.cy < page.height / 3) ? 1 : 0);
  };
  const ranked = page.geo
    ? hits
        .map(b => ({...b, r: rank(b)}))
        .filter(b => !b.vocab || b.r >= 2)
        .sort((x, y) => y.r - x.r || order(x, y))
    : hits.sort(order);
  const seen = new Set();
  return [
    ...ranked.filter(b => !b.vocab),
    ...logoBrands(page, products, big),
    ...lineBrands(raw),
    ...ranked.filter(b => b.vocab),
  ].filter(b => !seen.has(b.key) && seen.add(b.key));
}
// a logo read only as its first word ("Catz" of "Catz Finefood"); an ordinary word like "Happy" does not count
function logoBrands(page, products, big) {
  const ordinary = w => VOCAB_WORD_SET.has(w) || COMMON.has(w) || SMALL.has(w) || KEPT.has(w),
    own = new Set(
      wordsOf(
        MIN_FIX,
        products.flatMap(p => [p?.brand, p?.variety]),
      ).map(norm),
    ),
    word = w => own.has(w) || !!fixedWords().lexicon.spelling.get(w);
  return page.lines
    .filter(l => !page.geo || big.includes(l) || l.cy < page.height / 3)
    .map(l => norm(l.text).split(' ').filter(Boolean))
    .filter(ws => ws.length && ws.length <= 2 && ws[0].length >= MIN_BRAND && !ordinary(ws[0]) && !word(ws[1] || ''))
    .flatMap(ws => LISTED_BRANDS.filter(b => b.key.includes(' ') && b.key.split(' ')[0] === ws[0]));
}
function lineBrands(raw) {
  const tight = squeeze(raw);
  return PRODUCT_LINES.filter(([, lines]) => lines.some(l => tight.includes(squeeze(l)))).map(([name]) =>
    brandEntry(name),
  );
}
const pickBrand = (page, raw, products) => brandHits(page, raw, products)[0]?.name || '';
export const PACK_BRANDS = 3;
export function packBrands(read, products = []) {
  const page = pageOf(read, products);
  return brandHits(page, page.lines.map(l => l.text).join('\n'), products)
    .slice(0, PACK_BRANDS)
    .map(b => b.name);
}

// vocab: only Open Pet Food Facts knows it
const brandEntry = (name, vocab = false) => ({name: String(name || '').trim(), key: norm(name), vocab});
// Open Pet Food Facts lists "Katzenfutter", "Dog food" and the like as brands
const FOOD = /^(?:food|futter|nahrung)$|katze|kitten|\bcat\b|hund|\bdog\b/;
const onlyFood = b => b.key.split(' ').every(w => FOOD.test(w) || TYPE_WORDS.some(([, re]) => re.test(w)));
const LISTED_BRANDS = BRANDS.map(b => brandEntry(b)),
  VOCAB_BRAND_ENTRIES = VOCAB_BRANDS.map(b => brandEntry(b, true)).filter(b => !onlyFood(b));
// the first spelling wins, so the list beats ours and ours beats Open Pet Food Facts
function brandsOf(products) {
  const seen = new Set();
  return [...LISTED_BRANDS, ...products.map(p => brandEntry(p?.brand)), ...VOCAB_BRAND_ENTRIES].filter(
    b => b.key.replace(/ /g, '').length >= MIN_BRAND && !seen.has(b.key) && seen.add(b.key),
  );
}

function foodType(raw) {
  const direct = TYPE_WORDS.find(([, re]) => re.test(raw));
  if (direct) return direct[0];
  return Object.entries(TEXTURES).find(([, t]) => t.items.some(([, , re]) => re.test(raw)))?.[0] || '';
}

function pickVariety(page, brand, products) {
  const lines = scored(page, brand, products);
  const main = mainOf(lines);
  if (!main) return '';
  const take = [main];
  const fits = x => joined([...take, x]).length <= MAX_VARIETY;
  if (page.geo) {
    const kin = lines.filter(x => x !== main && (x.h >= BESIDE * main.h || flavourOrTexture(x.text)));
    for (;;) {
      const next = kin
        .filter(x => !take.includes(x) && take.some(y => apart(x, y) <= NEAR * main.h) && fits(x))
        .sort((a, b) => Math.min(...take.map(y => apart(a, y))) - Math.min(...take.map(y => apart(b, y))))[0];
      if (!next) break;
      take.push(next);
    }
  } else
    for (const x of lines.filter(y => y !== main).sort((a, b) => b.s - a.s)) {
      if (x.s < 1 || !fits(x)) break;
      take.push(x);
    }
  return cutName(joined(take).replace(LEADING_SMALL, ''), MAX_VARIETY);
}
const LEADING_SMALL = /^(?:mit|with)\s+(?=\S)/iu;
/* Keywords decide before size, since the largest print is as often a logo or slogan as the flavour. Ties go to our
   languages, then a clearly taller line, then the first, as a name stands above what is said about it. */
function mainOf(lines) {
  let pool = lines.filter(x => x.k > 0);
  if (!pool.length) return lines.filter(x => x.p > 0).sort((a, b) => b.p - a.p)[0];
  const most = (xs, f) => xs.filter(x => f(x) === Math.max(...xs.map(f)));
  pool = most(
    most(pool, x => x.k),
    x => -x.foreign,
  );
  const tallest = Math.max(...pool.map(x => x.h));
  return pool.filter(x => x.h * LIKE >= tallest).sort((a, b) => a.i - b.i)[0];
}
// k keyword score, s with length, p prominence, i reading order
const scored = (page, brand, products) =>
  usable(page, norm(brand), products).map((l, i) => {
    const k = keywords(l.text),
      s = k + Math.min(2, l.text.length / 12) - Math.min(1, i * 0.2),
      foreign = OURS.has(String(l.lang || '').split('-')[0]) ? 0 : 1;
    return {...l, i, k, s, foreign, p: s + HEIGHT_WEIGHT * Math.log(l.h / page.mid) - FOREIGN * foreign};
  });
const joined = lines =>
  [...lines]
    .sort((a, b) => a.i - b.i)
    .map((l, n) => (n ? l.text.replace(/^\p{L}+/u, w => (SMALL.has(norm(w)) ? w.toLocaleLowerCase('de') : w)) : l.text))
    .join(' ');
// bare is the normalised brand, dropped from the front of a line
function usable(page, bare, products) {
  const seen = new Set(),
    out = [];
  page.lines.forEach(l => {
    const v = withoutBrand(l.text.replace(QUANTITY, ' ').replace(/\s+/g, ' ').trim(), bare).replace(
      /^[\s\-–,·|+]+|[\s\-–,·|]+$/g,
      '',
    );
    const letters = v.replace(/[^\p{L}]/gu, '');
    if (letters.length < 3 || (letters.length === 3 && !page.words.has(norm(letters)))) return;
    if (JUNK.test(v) || ADS.test(v) || norm(v) === bare || `${bare} `.startsWith(`${norm(v)} `) || seen.has(norm(v)))
      return;
    if (!says(v)) return;
    if (page.geo && noise(l, page) && !holdsKnown(v, products)) return;
    seen.add(norm(v));
    out.push({...l, text: v});
  });
  return out;
}

export function packLines(read, bare = '', products = []) {
  const lines = usable(pageOf(read, products), bare, products);
  const keep = new Set([...lines].sort((a, b) => b.h - a.h).slice(0, PACK_LINES));
  return lines.filter(l => keep.has(l)).map(l => l.text);
}

// crop box in photo pixels, null when the main line does not stand out
export function focusOf(read, products = []) {
  const page = pageOf(read, products);
  if (!page.geo) return null;
  const raw = page.lines.map(l => l.text).join('\n');
  const main = mainOf(scored(page, pickBrand(page, raw, products), products));
  if (!main || main.h < DOMINANT * page.mid) return null;
  const across = l => Math.min(l.box.right, main.box.right) > Math.max(l.box.left, main.box.left);
  const above = page.lines.filter(l => l.cy < main.box.top && across(l)).sort((a, b) => b.cy - a.cy)[0];
  const below = page.lines.filter(l => l.cy > main.box.bottom && across(l)).sort((a, b) => a.cy - b.cy)[0];
  const box = around([main, above, below].filter(Boolean));
  const [dx, dy] = [MARGIN * (box.right - box.left), MARGIN * (box.bottom - box.top)];
  const width = read.width || Math.max(...page.lines.map(l => l.box.right)),
    height = read.height || Math.max(...page.lines.map(l => l.box.bottom));
  return {
    left: Math.max(0, Math.floor(box.left - dx)),
    top: Math.max(0, Math.floor(box.top - dy)),
    right: Math.min(width, Math.ceil(box.right + dx)),
    bottom: Math.min(height, Math.ceil(box.bottom + dy)),
  };
}

/* {x, y, side} in the pixels of the same photo at width × height; null with too little text, or for a reading of
   the photo turned */
export function textSquare(read, width, height) {
  if (!read?.lines || !read.width || !read.height || !width || !height) return null;
  if (Math.abs((width * read.height) / (height * read.width) - 1) > SAME_SHAPE) return null;
  const page = {mid: median(read.lines.map(l => l.h)), tilt: median(read.lines.map(l => l.tilt || 0))};
  const text = read.lines.filter(l => /\p{L}{2}/u.test(l.text) && !noise(l, page));
  if (text.length < 2) return null;
  const s = width / read.width,
    all = around(text),
    short = Math.min(width, height),
    wanted = s * (1 + 2 * ROOM) * Math.max(all.right - all.left, all.bottom - all.top),
    side = Math.round(Math.min(short, Math.max(CLOSEST * short, wanted)));
  const tall = median(text.map(l => l.h)),
    large = around(text.filter(l => l.h >= tall));
  // centred on the text; when it cannot hold all of it, the larger print stays in
  const start = (from, to, keepFrom, keepTo, size) => {
    const mid = Math.min(Math.max((s * (from + to)) / 2, s * keepTo - side / 2), s * keepFrom + side / 2);
    return Math.round(Math.min(size - side, Math.max(0, mid - side / 2)));
  };
  return {
    x: start(all.left, all.right, large.left, large.right, width),
    y: start(all.top, all.bottom, large.top, large.bottom, height),
    side,
  };
}
const around = lines => ({
  left: Math.min(...lines.map(l => l.box.left)),
  top: Math.min(...lines.map(l => l.box.top)),
  right: Math.max(...lines.map(l => l.box.right)),
  bottom: Math.max(...lines.map(l => l.box.bottom)),
});

// crop: the area read again, in photo pixels, plus the scale it was enlarged by
export function joinReadings(first, second, crop) {
  const back = x => {
    const [sx, sy] = [v => crop.left + v / crop.scale, v => crop.top + v / crop.scale];
    const b = x.box;
    return {
      ...x,
      box: {left: sx(b.left), top: sy(b.top), right: sx(b.right), bottom: sy(b.bottom)},
      w: x.w / crop.scale,
      h: x.h / crop.scale,
      cx: sx(x.cx),
      cy: sy(x.cy),
    };
  };
  const moved = (second?.lines || []).map(l => ({...back(l), elements: (l.elements || []).map(back)}));
  const within = l => shared(l.box, crop) >= INSIDE * area(l.box);
  const kept = first.lines.filter(l => !(within(l) && moved.some(m => overlaps(l, m))));
  return {...first, lines: [...kept, ...moved.filter(m => !kept.some(l => overlaps(l, m)))]};
}
const area = b => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
const shared = (a, b) =>
  area({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });
const overlaps = (a, b) => shared(a.box, b.box) > OVERLAP * Math.min(area(a.box), area(b.box));

const LEFT_OUT =
  'zucker|soja|getreide|gluten|farbstoffe|konservierungsstoffe|zusatz(?:stoffe)?|k(?:ü|ue)nstliche[a-zäöüß]*';
const LEFT_OUT_WORDS = new Set(
  'zucker soja getreide gluten farbstoffe konservierungsstoffe zusatz zusatzstoffe kuenstliche kunstliche'.split(' '),
);
const UP_TO_TWO = '(?:(?!ohne\\b)[\\p{L}-]+ ){0,2}';
const CLAIMS = new RegExp(`ohne ${UP_TO_TWO}(?:${LEFT_OUT})|(?:zucker|getreide|gluten)frei`, 'giu');
// badges read as one line run together ("ohne Sojaohne Zucker"), so a glued "ohne" is split off first
const GLUED = new RegExp(`(\\p{L})(ohne ?${UP_TO_TWO}(?:${LEFT_OUT}))`, 'giu'),
  GLUED_AFTER = new RegExp(`\\bohne(?=${LEFT_OUT})`, 'giu');
const unglued = v => v.replace(GLUED, '$1 $2').replace(GLUED_AFTER, 'ohne ');
const EN_CLAIMS = /\bsuitable for(?: [\p{L}-]+){0,2}/giu; // „Suitable for sterilised cats“
// spelled as a chip would show them; also spelling targets, so "Aurin" becomes "Taurin" and drops out too
const MARKETING = (
  'Feinere Stückchen Taurin Omega Vitamin Vitamine Vitamins Mineral Mineralien Minerals Mineralstoffe Protein ' +
  'Proteine Proteins Energie Energy Adapted Swedish Sweden Schweden Natural Naturally Ingredients Ingredient ' +
  'Quality Qualität Grain Free Frei Suitable Complete Balanced Premium Recipe Recipes Rezeptur Made Hergestellt ' +
  'Europe Europa Deutschland Germany Animal Content Level Levels Nutrition Formula Health Healthy Prozent Percent'
).split(' ');
const MARKETING_WORDS = new Set(MARKETING.map(norm));
// a line of nothing but filler, promises ("ohne Zucker") or badge words only makes the chip list longer
const says = v =>
  norm(unglued(v).replace(CLAIMS, ' ').replace(EN_CLAIMS, ' '))
    .split(' ')
    .some(w => w.length >= 3 && !SMALL.has(w) && !LEFT_OUT_WORDS.has(w) && !MARKETING_WORDS.has(w) && !/^\d+$/.test(w));

// packaging print often shouts; a mostly capital line gets title case, with German small words kept small
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

/* Near misses are put right ("MLAMOR" to "Miamor") so a variety already in the household is found again. A word
   changes only when exactly one known word is that close. Known words, COMMON and KEPT stay, since against a
   thousand words they would be put wrong ("sind" to "Rind"). Running it twice changes nothing more. */
const MIN_FIX = 3;
const MIN_TWO_OFF = 5; // a lone word needs this many letters to match a brand two edits away
const WORD = new RegExp(`\\p{L}{${MIN_FIX},}`, 'gu');
const SPREAD = 2; // largest length difference worth measuring
const RUN_TOGETHER = 8; // shortest word that may be two run together
// ad and quantity words are searched for as they are: "frisch" must not become "Fisch"
const KEPT = new Set([...AD_WORDS, 'stück', 'stücke'].map(norm));
// German and English function words, normalised
const COMMON = new Set(
  (
    'der die das den dem des ein eine einer eines einem einen kein keine keiner keines keinem keinen ist sind war ' +
    'waren wird werden wurde hat haben kann darf muss soll will ich sie wir ihr uns euch sich mir dir ihm ihn mich ' +
    'dich bin bist ihre ihrer ihren sein seine seiner seinen mein meine dein deine unser unsere euer eure diese ' +
    'dieser dieses diesem diesen jede jeder jedes alle aller alles allen und oder aber auch als also wie wenn dann ' +
    'dass weil denn doch noch nur schon sehr mehr hier dort was wer wen wem warum weg gar ganz nicht nichts nie ' +
    'immer bis durch gegen ohne uber unter nach seit vom zum zur beim ins ans aufs fur mit bei von vor aus auf nein ' +
    'the and for with from this that these those are was were has have had not all any but our your their its his ' +
    'her who what when where why how can will may yes'
  ).split(' '),
);
export function cleanText(text, products = []) {
  const [brands, varieties] = [products.map(p => p?.brand), products.map(p => p?.variety)];
  const fixed = fixedWords(),
    own = lexicon([...wordsOf(MIN_BRAND, brands), ...wordsOf(MIN_FIX, varieties)]);
  const spelling = w => fixed.listed.get(w) || own.spelling.get(w) || fixed.lexicon.spelling.get(w);
  const ctx = {fixed, own, spelling, known: w => !!spelling(w) || SMALL.has(w) || COMMON.has(w) || KEPT.has(w)};
  return String(text || '')
    .split(/\r?\n/)
    .map(line => cleanLine(line, ctx))
    .join('\n');
}
function cleanLine(line, ctx) {
  const words = fixWords(unshout(spaced(line)), ctx);
  const lone = words.trim().match(/^\p{L}+$/u);
  const whole = unscrapped(brand(lone, ctx) || words, ctx.known),
    part = germanPart(whole);
  return (part === whole ? whole : unshout(part)).replace(/\s+/g, ' ').trim();
}
const brand = (lone, ctx) => lone && brandTwoOff(lone[0], ctx);
function fixWords(line, ctx) {
  const {fixed, own, spelling} = ctx;
  return line.replace(WORD, word => {
    const w = norm(word);
    if (ONE_WORD_BRANDS.has(w)) return ONE_WORD_BRANDS.get(w); // „miamor“ off a logo is „Miamor“
    if (!w || w.includes(' ') || SMALL.has(w) || COMMON.has(w) || KEPT.has(w) || spelling(w)) return word;
    if (fixedNear.size > 20000) fixedNear.clear();
    if (!fixedNear.has(w)) fixedNear.set(w, near(fixed.lexicon, w));
    const hits = new Set([...fixedNear.get(w), ...near(own, w)]);
    if ([...hits].some(v => (v.startsWith(w) || w.startsWith(v)) && Math.abs(v.length - w.length) <= 1)) return word;
    if (hits.size === 1) return spelling([...hits][0]);
    return (w.length >= RUN_TOGETHER && twoWords(w, spelling)) || word;
  });
}
function twoWords(w, spelling) {
  for (let at = MIN_FIX; at <= w.length - MIN_FIX; at++) {
    const [head, tail] = [w.slice(0, at), w.slice(at)];
    if (spelling(head) && spelling(tail) && (NAMED_WORDS.has(head) || NAMED_WORDS.has(tail)))
      return `${spelling(head)} ${spelling(tail)}`;
  }
  return null;
}
function brandTwoOff(word, ctx) {
  const w = norm(word);
  if (w.length < MIN_TWO_OFF || ctx.known(w)) return null;
  const hits = TWO_OFF_BRANDS.filter(k => Math.abs(k.length - w.length) <= 2 && distance(w, k, 2) <= 2);
  return hits.length === 1 ? ONE_WORD_BRANDS.get(hits[0]) : null;
}
// lower case with a capital inside ("eRoed" off a script logo) is a misread unless we know the word
const SCRAP = /^\p{Ll}+\p{Lu}\p{L}*$/u;
const unscrapped = (line, known) =>
  line
    .split(' ')
    .filter(t => !SCRAP.test(t) || known(norm(t)))
    .join(' ');
// of "Chicken / Huhn / Kyckling" the most German part stays; on a tie cutName() cuts at the " / " later
const GERMAN = new RegExp(
  '(?<!\\p{L})(?:huhn|h(?:ü|ue)hn\\p{L}*|h(?:ä|ae)hnchen|gefl(?:ü|ue)gel|pute|truthahn|rind|ente|lamm|kaninchen|wild|hirsch|reh|' +
    'kalb|schwein|lachs|thunfisch|forelle|fisch|garnele|k(?:ä|ae)se|leber|herz|sauce|so(?:ß|ss)e|gelee|pastete|h(?:ä|ae)ppchen|' +
    'st(?:ü|ue)ckchen|filets?|ragout|feines?|zartes?|mit|und|ohne|f(?:ü|ue)r|katzen?)(?!\\p{L})',
  'giu',
);
const ENGLISH = new RegExp(
  '(?<!\\p{L})(?:chicken|turkey|beef|duck|lamb|rabbit|venison|veal|pork|salmon|tuna|trout|fish|shrimp|cheese|liver|heart|with|and)(?!\\p{L})',
  'iu',
);
const GERMAN_ONE = new RegExp(GERMAN.source, 'iu');
function germanPart(line) {
  const parts = line.split(/\s*\/\s*/);
  if (parts.length < 2) return germanTail(line);
  const hits = parts.map(part => (part.match(GERMAN) || []).length),
    most = Math.max(...hits);
  return most > 0 && hits.filter(h => h === most).length === 1 ? germanTail(parts[hits.indexOf(most)]) : line;
}
function germanTail(part) {
  const first = part.search(GERMAN_ONE);
  if (first <= 0) return part;
  const head = part.slice(0, first);
  return ENGLISH.test(head) && !GERMAN_ONE.test(head) ? part.slice(first) : part;
}
// "Mt" is a small "mit" in script; a lone character opening a line or a figure ending it is a scrap of the picture
const AMP_FIGURE = /(?<=\p{L})\s*\d?\s*&\s*\d?\s*(?=\p{L})/gu;
const JOIN = /(\p{L})\s*([&+/])\s*(?=\p{L})/gu;
const GLUE = 'von mit und oder ohne in im am an auf aus bei für vor zu zum zur'.split(' ');
const GLUED_SMALL = new RegExp(
  `(?<!\\p{L})(${GLUE.map(w => `[${w[0]}${w[0].toUpperCase()}]${w.slice(1)}`).join('|')})(?=\\p{Lu}\\p{Ll})`,
  'gu',
);
const GLUED_CAPS = /(\p{Lu}{2,})(\p{Lu}\p{Ll})/gu;
const MT = /(?<![\p{L}\p{N}])(?:Mt|mt|MT)(?![\p{L}\p{N}])/gu;
const FIGURE_IN_WORD = /(?<=\p{L})[015](?=\p{L})/gu;
const AS_LETTER = {0: 'o', 1: 'i', 5: 's'};
const STRAY_FIRST = /^[\p{L}\p{N}]\s+(?=\S)/u,
  STRAY_LAST = /(?<=\S)\s+\p{N}$/u;
const spaced = line =>
  line
    .trim()
    .replace(AMP_FIGURE, ' & ')
    .replace(JOIN, '$1 $2 ')
    .replace(GLUED_SMALL, '$1 ')
    .replace(GLUED_CAPS, '$1 $2')
    .replace(MT, m => (m === 'MT' ? 'MIT' : m[0] === 'M' ? 'Mit' : 'mit'))
    .replace(FIGURE_IN_WORD, (d, at, all) => {
      const next = all[at + 1];
      return next === next.toLocaleUpperCase('de') ? AS_LETTER[d].toUpperCase() : AS_LETTER[d];
    })
    .replace(STRAY_FIRST, '')
    .replace(STRAY_LAST, '');
// only the list's: many Open Pet Food Facts brands are ordinary words ("Classic", "Good")
const ONE_WORD_BRANDS = new Map(BRANDS.filter(b => /^\p{L}+$/u.test(b)).map(b => [norm(b), b]));
const TWO_OFF_BRANDS = [...ONE_WORD_BRANDS.keys()].filter(k => k.length >= 6);
// listed spellings win over those from Open Pet Food Facts
let fixedOnce = null;
function fixedWords() {
  if (fixedOnce) return fixedOnce;
  const listed = [...wordsOf(MIN_BRAND, BRANDS), ...wordsOf(MIN_FIX, LINE_NAMES), ...MARKETING];
  fixedOnce = {listed: lexicon(listed).spelling, lexicon: lexicon([...listed, ...wordsOf(MIN_FIX, VOCAB_WORDS)])};
  return fixedOnce;
}
const VOCAB_WORD_SET = new Set(VOCAB_WORDS.map(norm));
const fixedNear = new Map(); // cache of near() over fixedWords()
const wordsOf = (least, texts) =>
  texts.flatMap(t => String(t || '').split(/[^\p{L}]+/u)).filter(w => norm(w).length >= least);
// a run-together word may only split at one of these
const NAMED_WORDS = new Set(wordsOf(MIN_FIX, [...BRANDS, ...LINE_NAMES, ...MARKETING]).map(norm));
// spelling: normalised → first spelling seen; byLength: normalised words by length
function lexicon(words) {
  const spelling = new Map(),
    byLength = [];
  for (const w of words) {
    const n = norm(w);
    if (n.includes(' ') || spelling.has(n)) continue;
    spelling.set(n, w);
    (byLength[n.length] ||= []).push(n);
  }
  return {spelling, byLength};
}
function near(lex, w) {
  const out = [];
  for (let n = Math.max(MIN_FIX, w.length - SPREAD); n <= w.length + SPREAD; n++)
    for (const v of lex.byLength[n] || []) if (close(w, v)) out.push(v);
  return out;
}
const close = (a, b) => {
  const max = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  return Math.abs(a.length - b.length) <= max && distance(a, b, max) <= max;
};
// Levenshtein, stopping once every path costs more than max
function distance(a, b, max) {
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let least = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      least = Math.min(least, row[j]);
    }
    if (least > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

// a field matching a chip's text shows that chip as pressed
export const hasLine = (value, line) => norm(value) === norm(line);

function withoutBrand(v, bare) {
  if (!bare) return v;
  const words = v.split(' ');
  for (let n = 1; n <= words.length; n++) {
    const head = norm(words.slice(0, n).join(' '));
    if (head === bare) return words.slice(n).join(' ');
    if (!bare.startsWith(head)) break;
  }
  return v;
}
const keywords = v =>
  (FLAVORS.some(([, re]) => has(v, re)) ? 3 : 0) +
  (Object.values(TEXTURES).some(t => t.items.some(([, , re]) => has(v, re))) ? 2 : 0) +
  (TYPE_WORDS.some(([, re]) => has(v, re)) ? 1 : 0);
