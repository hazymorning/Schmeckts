/* The packaging text (read off the photo in native.js) into the same answer the server gives: brand, variety,
   type, animal, texture. Pure functions, so they can be tested on their own.
   What was read comes as the plugin's lines with their place and size (readingOf() in reading.js), or as plain
   text, one line per line, the way the tests write it. Plain text has no sizes: every line counts the same, and
   none is left out for being small or slanted.
   Order: put the misread words right, then our own varieties, then a brand (from the list, from one of our own
   varieties or from Open Pet Food Facts), then the most prominent line, with what belongs to it, as the variety. */
import {norm} from './text.js';
import {ANIMAL_WORDS, BRANDS, FLAVORS, TEXTURES, TYPE_WORDS} from './config.js';
import {VOCAB_BRANDS, VOCAB_WORDS} from './vocab.js';

export const MAX_VARIETY = 40;
export const PACK_LINES = 8; // shown as chips while naming; beyond this there are too many to scan
const MIN_BRAND = 4; // letters and digits of a brand at least; a shorter one is too general to match on or correct to

/* What the size and the direction of a line say. Starting values from the way type is set, until readings of
   real packaging (tests/fixtures/ocr) say better. Heights are the plugin's line heights in pixels. */
// A space between two words from this share of the line height on. A word space measures 0.25 to 0.5 of the line
// height, the letters of one word stand at most 0.15 apart; at 0.25 two words in a line with descenders ran together.
const GAP = 0.15;
// Radians (9°) off the direction most lines run in: a round badge or a scrap of the picture, not the label.
const TILT = 0.15;
// Share of the middle line height. Below it is small print or noise: ML Kit wants 16 px a letter, and at 1100 px a
// photo's small print has less.
const SMALL_PRINT = 0.4;
// Heights within a quarter of each other count as alike: only among such lines do the keywords decide the variety.
const LIKE = 1.25;
const HEIGHT_WEIGHT = 8 / Math.log(LIKE); // a line LIKE times taller outweighs every keyword score() gives (8 at most)
// Lines at most this many heights of the main line away from the variety belong to the same label.
const NEAR = 1.5;
// A line near the variety and at least this share of the main line's height is part of the name, keyword or not
// (the product line above the flavour); a smaller one only with a flavour or a consistency („in Sauce“).
const BESIDE = 0.5;

/* The second reading (recognize.js): the part around the variety cut out, enlarged and read again, and its lines laid
   over the first reading's. Off here, and the fixtures measure without it. */
export const SECOND_PASS = true;
export const SECOND_PASS_MS = 2000; // only after a first reading that took at most this long
export const CROP_WIDTH = 1600; // the part is read at least this wide, in pixels
const DOMINANT = 1.5; // something to look at closer: the variety's main line this many middle line heights at least
const MARGIN = 0.25; // around the lines cut out, this share of their width and height
const OVERLAP = 0.6; // a line of the second reading replaces one of the first where one covers more of the other
const INSIDE = 0.9; // and only a line the part holds whole, so a line the cut goes through stays as first read

const EMPTY = {brand: '', variety: '', type: '', animal: ''};
const QUANTITY =
  /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)?|\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|stk|stück)\b/gi;
const JUNK =
  /zutaten|zusammensetzung|analytische|bestandteile|inhaltsstoff|rohprotein|rohfett|rohasche|feuchtigkeit|vitamin|zusatzstoff|alleinfutter|ergänzungsfutter|haltbar|füllmenge|gmbh|www\.|@|\bean\b/i;
const ADS =
  /^(?:neu|new|jetzt|jetzt neu|gratis|aktion|vorteilspack|sparpack|premium|qualität|natürlich|frisch|lecker|100\s*%\s*natürlich|ohne zucker)$|^\d+\s*%/i;
const squeeze = s => norm(s).replace(/ /g, ''); // insensitive to case, hyphens and spaces
const has = (text, re) => re.test(text);

/* read: what was read, as the plugin's lines (readingOf) or as plain text; products: our own varieties. With
   nothing usable everything stays empty. */
export function readPack(read, products = []) {
  const page = pageOf(read, products);
  const raw = page.lines.map(l => l.text).join('\n');
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

  const brand = pickBrand(page, raw, products);
  const type = foodType(raw);
  const variety = pickVariety(page, brand, products);
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

/* What was read as lines, each with its text and height and, from the plugin, its place:
   {geo, lines, mid, tilt, height, words}. A plugin's line gets its text from its words (spoken()), then everything
   is put straight like plain text (cleanText()); the lines stand in reading order. mid is the middle line height,
   tilt the direction most lines run in, height the photo's. An answer without lines (a plugin that only gave its
   text) is read as plain text. */
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

/* The text of a line from its words: a space where they stand apart, none where they touch, whatever the plugin
   made of it („&Lachs“, three badges run together). A scrap of one to three letters at either end that is far
   smaller than the rest and no word we know goes: the small „mit“ in front of large print, read as „A“. */
function spoken(line, words) {
  const u = {x: Math.cos(line.tilt || 0), y: Math.sin(line.tilt || 0)};
  const parts = (line.elements || [])
    .map(e => {
      const at = e.cx * u.x + e.cy * u.y; // where its middle stands along the line
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

/* Lines in the order a person reads them: top to bottom, left to right within a row. Two lines whose middles are
   less than half the smaller height apart share a row. */
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
/* How far apart two directions are, in radians from 0 to π */
const turn = (a, b) => Math.abs(((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
/* Small print, or slanted against the rest: a badge, the picture */
const noise = (l, page) => turn(l.tilt || 0, page.tilt) > TILT || l.h < SMALL_PRINT * page.mid;
/* The gap between two lines' boxes, the wider of across and down */
const apart = (a, b) =>
  Math.max(0, a.box.left - b.box.right, b.box.left - a.box.right, a.box.top - b.box.bottom, b.box.top - a.box.bottom);

/* Words we know: the small words, and every word of the brands on the list and of our own varieties */
const knownWords = products =>
  new Set([
    ...SMALL,
    ...[...BRANDS, ...products.flatMap(p => [p?.brand, p?.variety])].flatMap(s => norm(s).split(' ')).filter(Boolean),
  ]);
const flavourOrTexture = v =>
  FLAVORS.some(([, re]) => re.test(v)) || Object.values(TEXTURES).some(t => t.items.some(([, , re]) => re.test(v)));
/* A line holding something we know keeps its place however small or slanted it is: a flavour, a consistency, a
   brand, one of our own varieties */
const holdsKnown = (v, products) => {
  const flat = ` ${norm(v)} `;
  return (
    flavourOrTexture(v) ||
    brandsOf(products).some(b => flat.includes(` ${b.key} `)) ||
    products.some(p => squeeze(p?.variety).length >= 4 && squeeze(v).includes(squeeze(p.variety)))
  );
};

/* Brand: a hit from brandsOf() on whole words. From the plugin a hit in one of the two largest lines or in the top
   third of the photo comes first, where the logo stands. After that, and in plain text, a brand from the list or of
   our own varieties before one only Open Pet Food Facts knows (its list holds words like „Katzenfutter“ as well),
   then the longest. */
function pickBrand(page, raw, products) {
  const flat = ` ${norm(raw)} `;
  const hits = brandsOf(products).filter(b => flat.includes(` ${b.key} `));
  const order = (x, y) => x.vocab - y.vocab || y.key.length - x.key.length;
  if (hits.length < 2 || !page.geo) return hits.sort(order)[0]?.name || '';
  const big = [...page.lines].sort((a, b) => b.h - a.h).slice(0, 2);
  const rank = b => {
    const at = page.lines.filter(l => ` ${norm(l.text)} `.includes(` ${b.key} `));
    return (at.some(l => big.includes(l)) ? 2 : 0) + (at.some(l => l.cy < page.height / 3) ? 1 : 0);
  };
  return hits.map(b => ({...b, r: rank(b)})).sort((x, y) => y.r - x.r || order(x, y))[0].name;
}

/* Every brand that may be read off a packaging: the list, the brands of our own varieties, then those of Open Pet
   Food Facts (VOCAB_BRANDS in vocab.js); once each, in the spelling that comes first, so the list's wins, and only
   from MIN_BRAND letters and digits on. [{name, key, vocab}], key being the normalised name and vocab whether only
   Open Pet Food Facts has it. The match is on whole words. */
const brandEntry = (name, vocab = false) => ({name: String(name || '').trim(), key: norm(name), vocab});
/* A brand of Open Pet Food Facts that only names the animal or the food („Katzenfutter“, „Dog food“) is none */
const onlyFood = b =>
  b.key
    .split(' ')
    .every(w => /^(?:food|futter|nahrung)$/.test(w) || [...ANIMAL_WORDS, ...TYPE_WORDS].some(([, re]) => re.test(w)));
const LISTED_BRANDS = BRANDS.map(b => brandEntry(b)),
  VOCAB_BRAND_ENTRIES = VOCAB_BRANDS.map(b => brandEntry(b, true)).filter(b => !onlyFood(b));
function brandsOf(products) {
  const seen = new Set();
  return [...LISTED_BRANDS, ...products.map(p => brandEntry(p?.brand)), ...VOCAB_BRAND_ENTRIES].filter(
    b => b.key.replace(/ /g, '').length >= MIN_BRAND && !seen.has(b.key) && seen.add(b.key),
  );
}

/* Type: the unambiguous keywords first, otherwise the consistency keywords (Soße, Pastete → Nassfutter; Stick, Kau → Snack) */
function foodType(raw) {
  const direct = TYPE_WORDS.find(([, re]) => re.test(raw));
  if (direct) return direct[0];
  return Object.entries(TEXTURES).find(([, t]) => t.items.some(([, , re]) => re.test(raw)))?.[0] || '';
}

/* Variety: the most prominent line and what belongs to it, at most MAX_VARIETY characters, joined in the order
   they stand on the packaging. From the plugin prominent means large (the height against the middle line height),
   and the keywords only decide between lines of about the same height; lines near it that are large as well or
   carry a flavour or a consistency join it (the product line above the flavour, „in Sauce“ below it), and the
   brand does not. From plain text the keywords decide, and the other lines with one join. */
function pickVariety(page, brand, products) {
  const lines = scored(page, brand, products);
  const ranked = lines.filter(x => x.p > 0).sort((a, b) => b.p - a.p);
  if (!ranked.length) return '';
  const main = ranked[0],
    take = [main];
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
    for (const x of ranked.slice(1)) {
      if (x.s < 1 || !fits(x)) break;
      take.push(x);
    }
  return joined(take).slice(0, MAX_VARIETY).trim();
}
/* The usable lines with their keyword score (s) and prominence (p), and their place in reading order (i) */
const scored = (page, brand, products) =>
  usable(page, norm(brand), products).map((l, i) => {
    const s = score(l.text) - Math.min(1, i * 0.2);
    return {...l, i, s, p: s + HEIGHT_WEIGHT * Math.log(l.h / page.mid)};
  });
const joined = lines =>
  [...lines]
    .sort((a, b) => a.i - b.i)
    .map(l => l.text)
    .join(' ');

/* The usable lines of what was read: without quantities, advertising, ingredients and bare numbers, none of them
   twice, in the order they stand on the packaging, each with its size and place. From the plugin also without
   small print and slanted lines unless they hold something we know, and without a scrap of up to three letters
   that is no word right before the largest line. `bare` is the normalised brand, which is dropped from the front
   of a line („Sheba Lachs in Soße“ → „Lachs in Soße“). */
function usable(page, bare, products) {
  const seen = new Set(),
    out = [];
  const largest = page.geo && page.lines.reduce((a, b) => (b.h > a.h ? b : a));
  page.lines.forEach((l, i) => {
    const v = withoutBrand(l.text.replace(QUANTITY, ' ').replace(/\s+/g, ' ').trim(), bare).replace(
      /^[\s\-–,·|]+|[\s\-–,·|]+$/g,
      '',
    );
    if (v.length < 3 || (v.match(/[A-Za-zÄÖÜäöüß]/g) || []).length < 3) return;
    if (JUNK.test(v) || ADS.test(v) || norm(v) === bare || seen.has(norm(v))) return;
    if (!says(v)) return;
    if (page.geo && noise(l, page) && !holdsKnown(v, products)) return;
    if (page.geo && page.lines[i + 1] === largest && /^\p{L}{3}$/u.test(v) && !page.words.has(norm(v))) return;
    seen.add(norm(v));
    out.push({...l, text: v});
  });
  return out;
}

/* The lines of a packaging offered as chips while naming: the usable lines, so the filter the variety is picked
   with exists only once. At most PACK_LINES, the largest where there are more, in the order they stand on the
   packaging. */
export function packLines(read, bare = '', products = []) {
  const lines = usable(pageOf(read, products), bare, products);
  const keep = new Set([...lines].sort((a, b) => b.h - a.h).slice(0, PACK_LINES));
  return lines.filter(l => keep.has(l)).map(l => l.text);
}

/* Where to read a second time: around the variety's main line and the lines right above and below it, with MARGIN
   on every side, within the photo; {left, top, right, bottom} in its pixels. null when nothing stands out, that is
   when the main line is not DOMINANT times the middle line height, and for plain text. */
export function focusOf(read, products = []) {
  const page = pageOf(read, products);
  if (!page.geo) return null;
  const raw = page.lines.map(l => l.text).join('\n');
  const main = scored(page, pickBrand(page, raw, products), products)
    .filter(x => x.p > 0)
    .sort((a, b) => b.p - a.p)[0];
  if (!main || main.h < DOMINANT * page.mid) return null;
  const across = l => Math.min(l.box.right, main.box.right) > Math.max(l.box.left, main.box.left);
  const above = page.lines.filter(l => l.cy < main.box.top && across(l)).sort((a, b) => b.cy - a.cy)[0];
  const below = page.lines.filter(l => l.cy > main.box.bottom && across(l)).sort((a, b) => a.cy - b.cy)[0];
  const lines = [main, above, below].filter(Boolean);
  const box = {
    left: Math.min(...lines.map(l => l.box.left)),
    top: Math.min(...lines.map(l => l.box.top)),
    right: Math.max(...lines.map(l => l.box.right)),
    bottom: Math.max(...lines.map(l => l.box.bottom)),
  };
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

/* The second reading laid over the first: its lines, moved back into the photo (crop: the part, and the scale it was
   enlarged by), replace the first reading's lines they overlap by more than OVERLAP, as long as the part holds those
   whole; lines it read that are new join in (a „mit“, a „in Sauce“ too small the first time), lines already kept do
   not come twice. */
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
   right („MLAMOR“ becomes „Miamor“, „Ragoul“ „Ragout“), so that a variety already in the household is found again
   although a letter came out wrong. Measured against the words of the brands (brandsOf()), of our own varieties
   and of the product names of Open Pet Food Facts (VOCAB_WORDS), from MIN_FIX letters on: one mistake up to seven
   letters and two from eight, and only when exactly one word is that close, so anything that could be two things
   stays as it was. A word put right takes the list's spelling before ours and ours before that of Open Pet Food
   Facts. Running it twice changes nothing more.
   A word we know stays as it is, and so do the small words of COMMON and a word we know with another ending
   („Sorte“ beside „Sorten“): against more than a thousand words, those are what would otherwise be put wrong
   („das“ would become „Dan“, „sind“ „Rind“). */
const MIN_FIX = 3;
const WORD = new RegExp(`\\p{L}{${MIN_FIX},}`, 'gu');
const SPREAD = 2; // only words at most this many letters longer or shorter are measured at all
// Articles, pronouns, forms of „sein“ and „haben“, conjunctions and prepositions, German and English, normalised
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
  const raw = String(text || '')
    .split(/\r?\n/)
    .map(unshout)
    .join('\n');
  const [brands, varieties] = [products.map(p => p?.brand), products.map(p => p?.variety)];
  const fixed = fixedWords(),
    own = lexicon([...wordsOf(MIN_BRAND, brands), ...wordsOf(MIN_FIX, varieties)]);
  const spelling = w => fixed.listed.get(w) || own.spelling.get(w) || fixed.lexicon.spelling.get(w);
  return raw.replace(WORD, word => {
    const w = norm(word);
    if (!w || w.includes(' ') || SMALL.has(w) || COMMON.has(w) || spelling(w)) return word;
    if (fixedNear.size > 20000) fixedNear.clear();
    if (!fixedNear.has(w)) fixedNear.set(w, near(fixed.lexicon, w));
    const hits = new Set([...fixedNear.get(w), ...near(own, w)]);
    if ([...hits].some(v => v.startsWith(w) || w.startsWith(v))) return word;
    return hits.size === 1 ? spelling([...hits][0]) : word;
  });
}
/* The words that do not change with the household, made on first use: listed, the spelling of the words of the
   brands on the list, which comes first; lexicon, those with the words of the brands of Open Pet Food Facts and of
   its product names. A brand's words count from MIN_BRAND letters on, like the brands themselves. */
let fixedOnce = null;
function fixedWords() {
  if (fixedOnce) return fixedOnce;
  const brands = brandsOf([]).map(b => b.name);
  fixedOnce = {
    listed: lexicon(wordsOf(MIN_BRAND, BRANDS)).spelling,
    lexicon: lexicon([...wordsOf(MIN_BRAND, brands), ...wordsOf(MIN_FIX, VOCAB_WORDS)]),
  };
  return fixedOnce;
}
const fixedNear = new Map(); // what near() found among them, by word
/* The words of texts from `least` letters on */
const wordsOf = (least, texts) =>
  texts.flatMap(t => String(t || '').split(/[^\p{L}]+/u)).filter(w => norm(w).length >= least);
/* Words to measure against: {spelling: normalised → as first written, byLength: [[normalised]]} */
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
/* The words of a lexicon close to w (close()), looked for only among those at most SPREAD letters longer or
   shorter */
function near(lex, w) {
  const out = [];
  for (let n = Math.max(MIN_FIX, w.length - SPREAD); n <= w.length + SPREAD; n++)
    for (const v of lex.byLength[n] || []) if (close(w, v)) out.push(v);
  return out;
}
/* One mistake while both words have up to seven letters, two when one of them has eight or more */
const close = (a, b) => {
  const max = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  return Math.abs(a.length - b.length) <= max && distance(a, b, max) <= max;
};
/* Levenshtein, given up as soon as every way through costs more than max */
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
