// Reading packaging text (js/ocr.js) without a device: known varieties, brands, variety, type, species,
// consistency. Usage: node --test tests/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {BRANDS} from '../app/www/js/config.js';
import {
  cleanText,
  focusOf,
  joinReadings,
  MAX_VARIETY,
  PACK_LINES,
  packLines,
  readPack,
  SECOND_PASS,
} from '../app/www/js/ocr.js';
import {jpegSize, readingOf} from '../app/www/js/reading.js';
import {norm} from '../app/www/js/text.js';
import {VOCAB_BRANDS, VOCAB_WORDS} from '../app/www/js/vocab.js';

const VARIETIES = [
  {brand: 'Sheba', variety: 'Lachs in Soße', type: 'Nassfutter', animal: 'Katze', texture: 'sosse'},
  {brand: 'Dreamies', variety: 'Käse', type: 'Snack', animal: 'Katze'},
];

test('packaging text: our own varieties win, insensitive to case, hyphens and spaces', () => {
  const samples = ['SHEBA\nLACHS IN SOSSE\n85 g', 'sheba lachs-in-soße', 'Sheba\nLachsinSosse\nNEU'];
  for (const text of samples) {
    assert.deepEqual(
      readPack(text, VARIETIES),
      {brand: 'Sheba', variety: 'Lachs in Soße', type: 'Nassfutter', animal: 'Katze', texture: 'sosse'},
      text,
    );
  }
  assert.equal(readPack('Dreamies\nmit Käse', VARIETIES).variety, 'Käse');
});

test('packaging text: a brand from the list, nothing invented otherwise', () => {
  assert.ok(
    BRANDS.length > 50 && BRANDS.includes('Whiskas') && BRANDS.includes('Coshida'),
    'common brands including retail brands',
  );
  assert.equal(readPack('ANIMONDA\nCarny Adult\nRind & Huhn\n400 g').brand, 'Animonda');
  assert.equal(readPack('K-CLASSIC\nHuhn in Gelee').brand, 'K-Classic');
  assert.equal(
    readPack('Hofmeister\nHuhn in Gelee').brand,
    '',
    'an unknown brand stays empty, the variety is there all the same',
  );
  assert.equal(readPack('Hofmeister\nHuhn in Gelee').variety, 'Huhn in Gelee');
});

test('packaging text: the variety without quantities, advertising, ingredients and bare numbers, at most 40 characters', () => {
  const text =
    'Sheba\nNEU\n100 % natürlich\nSelection in Sauce\nmit Lachs\n4 x 85 g\n4008429087455\nZutaten: Fleisch und tierische Nebenerzeugnisse 40 %';
  const got = readPack(text);
  assert.equal(got.variety, 'Selection in Sauce mit Lachs');
  assert.ok(got.variety.length <= MAX_VARIETY);
  assert.equal(
    readPack('Whiskas\n1+ Adult Thunfisch in Gelee für ausgewachsene Katzen jeden Alters').variety.length <=
      MAX_VARIETY,
    true,
  );
});

test('packaging text: type, consistency and species from the keywords', () => {
  const wet = readPack('Miamor\nFeine Filets\nHuhn in Gelee\nfür Katzen');
  assert.deepEqual([wet.type, wet.texture, wet.animal], ['Nassfutter', 'gelee', 'Katze']);
  const treat = readPack('Vitakraft\nKnusper-Sticks mit Lachs\nSnack für Katzen');
  assert.deepEqual([treat.type, treat.texture, treat.animal], ['Snack', 'knusprig', 'Katze']);
  const dry = readPack('Josera\nTrockenfutter\nHuhn für Welpen');
  assert.deepEqual([dry.type, dry.texture, dry.animal], ['Trockenfutter', undefined, 'Hund']);
});

test('packaging text: with nothing usable everything stays empty', () => {
  for (const text of ['', '   ', '12345\n4008429087455\n850 g', 'NEU\n100 % natürlich']) {
    assert.deepEqual(readPack(text, VARIETIES), {brand: '', variety: '', type: '', animal: ''}, JSON.stringify(text));
  }
});

test('packaging text: the brands of our own varieties count as brands too', () => {
  const text = 'Katzenglück\nZarte Häppchen\nmit Huhn';
  assert.equal(readPack(text).brand, '', 'nothing of our own: the brand is not invented');
  const mine = readPack(text, [{brand: 'Katzenglück', variety: 'Rind pur', type: 'Nassfutter'}]);
  assert.deepEqual(
    [mine.brand, mine.variety],
    ['Katzenglück', 'Zarte Häppchen mit Huhn'],
    'one variety of that brand is enough, and it drops out of the variety',
  );
  assert.equal(
    readPack('Bio\nHuhn in Gelee', [{brand: 'Bio', variety: 'Rind pur'}]).brand,
    '',
    'too short to match on',
  );
  assert.equal(
    readPack('Katzenglück\nHuhn in Gelee', [{brand: 'Glück', variety: 'Rind pur'}]).brand,
    '',
    'whole words only, so no hit inside another one',
  );
  assert.equal(
    readPack('Sheba\nLachs pur', [{brand: 'sheba', variety: 'Rind'}]).brand,
    'Sheba',
    'a brand already on the list keeps its spelling and is not counted twice',
  );
});

test('packaging text: the readable lines, none of them twice and at most eight', () => {
  const text = 'Sheba\nNEU\nSelection in Sauce\nmit Lachs\nSELECTION IN SAUCE\n4 x 85 g\nZutaten: Fleisch 40 %';
  assert.deepEqual(packLines(text), ['Sheba', 'Selection in Sauce', 'mit Lachs'], 'in the order on the packaging');
  assert.deepEqual(packLines('Sheba\nSheba Lachs in Soße', 'sheba'), ['Lachs in Soße'], 'without the brand in front');
  const many = Array.from({length: 12}, (_, i) => `Zeile ${'abcdefghijkl'[i]}`).join('\n');
  assert.equal(packLines(many).length, PACK_LINES);
});

test('packaging text: a line that shouts is set in title case', () => {
  assert.deepEqual(packLines('TRULAHN & WILD aN SAUCE\nFEINE HÄPPCHEN'), [
    'Truthahn & Wild an Sauce',
    'Feine Häppchen',
  ]);
  assert.deepEqual(
    packLines('Selection in Sauce\nmit Lachs'),
    ['Selection in Sauce', 'mit Lachs'],
    'a line already written normally is left as it is',
  );
  assert.equal(readPack('SHEBA\nLACHS IN SOSSE').variety, 'Lachs in Sosse', 'and the variety with it');
});

test('packaging text: a line that says nothing of its own drops out', () => {
  assert.deepEqual(packLines('mit\nohne Soja ohne Zusatz von Zucker\nHuhn ohne Zucker\nund mit'), ['Huhn ohne Zucker']);
});

test('packaging text: a word the phone almost read is put right', () => {
  const mine = [{brand: 'Miamor', variety: 'Truthahn & Wild in Sauce', type: 'Nassfutter', texture: 'sosse'}];
  const read = 'MLAMOR\nTRULAHN & WILD aN SAUCE\nAURIN\n100 g';
  assert.equal(readPack(read).brand, 'Miamor', 'a brand from the list, one letter wrong');
  assert.deepEqual(packLines(read, '', mine).slice(0, 2), ['Miamor', 'Truthahn & Wild an Sauce']);
  assert.equal(
    readPack(read, mine).variety,
    'Truthahn & Wild an Sauce',
    'a word of our own varieties, two letters wrong',
  );
  assert.equal(packLines('Aurin\nLachs pur')[0], 'Aurin', 'a word close to nothing we know stays as it was');
  assert.equal(
    readPack('Sheba\nSelection in Sauce\nmit Lachs').variety,
    'Selection in Sauce mit Lachs',
    'and a text that was read properly is not touched',
  );
});

test('packaging text: the words of Open Pet Food Facts put misread words right as well', () => {
  assert.ok(
    VOCAB_WORDS.includes('Ragout') && VOCAB_WORDS.includes('Häppchen') && VOCAB_WORDS.includes('Trockenfutter'),
  );
  assert.equal(cleanText('Ragoul Royal'), 'Ragout Royal');
  assert.equal(cleanText('HÄPPCHEM IN GELEE'), 'Häppchen in Gelee');
  assert.equal(cleanText('Trockenfuttcr'), 'Trockenfutter');
  assert.equal(readPack('Sheba\nRagoul mit Huhn').variety, 'Ragout mit Huhn', 'and the variety with them');
});

test('packaging text: how many mistakes a word may carry depends on its length', () => {
  assert.equal(cleanText('Hubn'), 'Huhn', 'three or four letters: one, where exactly one word is that close');
  assert.equal(cleanText('Lamn'), 'Lamn', 'not where two are („Lamm“, „Lamb“)');
  assert.equal(cleanText('Kitlen'), 'Kitten', 'five to seven letters: one');
  assert.equal(cleanText('Kiflen'), 'Kiflen', 'not two');
  assert.equal(cleanText('Katzcnmlch'), 'Katzenmilch', 'from eight letters two');
  assert.equal(cleanText('Katzcnmlcb'), 'Katzcnmlcb', 'not three');
});

test('packaging text: small words, and a word we know with another ending, stay as they are', () => {
  assert.equal(cleanText('Das ist ein Menü'), 'Das ist ein Menü', 'not „Dan“ or „Dein“');
  assert.equal(cleanText('sind'), 'sind', 'not „Rind“');
  assert.equal(cleanText('Sorte'), 'Sorte', 'not „Sorten“');
  assert.equal(cleanText('zart'), 'zart', 'not „Zarte“');
  assert.equal(cleanText('Frisch & lecker'), 'Frisch & lecker', 'nor a word of advertising: not „Fisch“');
  assert.equal(
    cleanText('Dah'),
    'Dah',
    'a brand counts from four letters, and its words too: not „Dan“ of „Marly & Dan“',
  );
});

test('packaging text: the brands of Open Pet Food Facts count as brands too, after ours', () => {
  assert.ok(VOCAB_BRANDS.includes('Carnilove') && !BRANDS.includes('Carnilove'));
  assert.equal(readPack('Carnilove\nLamm in Sauce').brand, 'Carnilove');
  assert.equal(
    cleanText('Swedish Natural Quality'),
    'Swedish Natural Quality',
    'matched whole, their names are nothing to put words right to („Qualité & Prix“)',
  );
  assert.ok(VOCAB_BRANDS.includes('Mjamjam') && BRANDS.includes('MjAMjAM'));
  assert.equal(readPack('MJAMJAN\nHuhn in Gelee').brand, 'MjAMjAM', 'in the spelling of the list');
  assert.equal(readPack('Pro Plan\nCarnilove\nLamm').brand, 'Pro Plan', 'a brand of the list first, though shorter');
  assert.equal(readPack('Katzenfutter mit Lachs').brand, '', 'one that only names the animal or the food is none');
  assert.equal(readPack('Dia\nHuhn in Gelee').brand, '', 'nor one under four letters');
});

test('packaging text: „&“, „+“ and „/“ between two words stand between spaces, in plain text too', () => {
  assert.deepEqual(packLines('HUHN &LACHS\nRind/Lamm\nEnte+Pute\nAdult 1+'), [
    'Huhn & Lachs',
    'Rind / Lamm',
    'Ente + Pute',
    'Adult 1+',
  ]);
  assert.equal(cleanText('Huhn & Lachs'), 'Huhn & Lachs', 'spaced already: left as it is');
});

test('packaging text: a shouting line is set in title case whatever stands between its words', () => {
  assert.equal(cleanText('HUHN & LACHS 1+'), 'Huhn & Lachs 1+', '„&“ and figures are no letters');
  assert.equal(cleanText('RIND 100 %'), 'Rind 100 %');
});

test('packaging text: promises glued together come apart, and a line of nothing but promises drops out', () => {
  assert.deepEqual(packLines('ohne Sojaohne Zusaon Zucker\nohneSoja\nohne künstliche Farbstoffe\nHuhn ohne Zucker'), [
    'Huhn ohne Zucker',
  ]);
  const bean = packLines('Lamm mit Bohne ohne Zucker');
  assert.ok(bean.length === 1 && !/\bB ohne/.test(bean[0]), `„Bohne“ is no glued promise: ${bean}`);
});

test('packaging text: a brand read off a logo in small letters is written as on the list', () => {
  assert.equal(readPack('miamor\nHuhn in Gelee').brand, 'Miamor');
  assert.deepEqual(
    packLines('miamor\nmjamjam\nHuhn in Gelee'),
    ['Miamor', 'MjAMjAM', 'Huhn in Gelee'],
    'the chips too',
  );
  assert.deepEqual(packLines('dein Bestes Rind'), ['dein Bestes Rind'], 'a brand of several words is also just words');
});

test('packaging text: words run together are taken apart, and „Mt“ is „mit“', () => {
  assert.equal(cleanText('ohne Zusatz vonZucker'), 'ohne Zusatz von Zucker', 'a small word glued to the next');
  assert.deepEqual(
    packLines('ohne Soja ohne Zusatz vonZucker\nHuhn in Sauce'),
    ['Huhn in Sauce'],
    'so the promise goes',
  );
  assert.equal(
    cleanText('CHICKEN & TURKEYHuhy'),
    'Chicken & Turkey Huhn',
    'a shouted word glued to the next, then put right',
  );
  assert.equal(cleanText('Mt Thunfisch'), 'Mit Thunfisch');
  assert.equal(cleanText('mt THUNFISCH & HUHN'), 'Mit Thunfisch & Huhn');
  assert.equal(
    cleanText('GimCat MjAMjAM PetBalance Inaba'),
    'GimCat MjAMjAM PetBalance Inaba',
    'brands written so stay',
  );
});

test('packaging text: a long variety is cut where the next language begins, or after a whole word', () => {
  assert.equal(
    readPack('Bozita\nChicken & Turkey Huhn & Pute / Kyckling & Kalkon').variety,
    'Chicken & Turkey Huhn & Pute',
  );
  assert.equal(
    readPack('Zarte Häppchen mit Huhn und Truthahn in feiner Sauce').variety,
    'Zarte Häppchen mit Huhn und Truthahn',
    'not in the middle of a word, and not with „in“ at the end',
  );
});

test('packaging text: a small word opening a later line of the variety is written small', () => {
  assert.equal(readPack('Sheba\nMIT THUNFISCH & HUHN\nIN SAUCE').variety, 'Mit Thunfisch & Huhn in Sauce');
});

/* The plugin's answer for a few lines, one block each: [text, height, top, options]. The words stand side by side
   with a word space (a third of the height), or as given in words: [text, {gap, size}], a smaller word sitting on
   the line. tilt in radians, lang as the plugin names it. */
function plugin(rows, width = 800, height = 1000) {
  const lines = rows.map(([text, h, top, {left = 40, tilt = 0, lang = 'de', words} = {}]) => {
    const u = [Math.cos(tilt), Math.sin(tilt)];
    const at = (s, d) => ({x: Math.round(left + s * u[0] - d * u[1]), y: Math.round(top + s * u[1] + d * u[0])});
    const shape = (s0, s1, d0, d1) => {
      const cornerPoints = [at(s0, d0), at(s1, d0), at(s1, d1), at(s0, d1)],
        xs = cornerPoints.map(c => c.x),
        ys = cornerPoints.map(c => c.y);
      const boundingBox = {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
      };
      return {boundingBox, cornerPoints, recognizedLanguage: lang};
    };
    let end = 0;
    const elements = (words || text.split(' ').map(w => [w])).map(([w, {gap = h / 3, size = h} = {}], i) => {
      const from = i ? end + gap : 0;
      end = from + w.length * size * 0.6;
      return {text: w, ...shape(from, end, h - size, h)};
    });
    return {text, ...shape(0, end, 0, h), elements};
  });
  return readingOf(
    {text: rows.map(r => r[0]).join('\n'), blocks: lines.map(l => ({text: l.text, lines: [l]}))},
    width,
    height,
  );
}

test('packaging photos: the lines with their size, place and direction', () => {
  const read = plugin([
    ['Huhn in Gelee', 60, 100, {left: 50}],
    ['Auri', 24, 400, {tilt: 0.35, lang: 'und'}],
  ]);
  assert.equal(read.lines.length, 2);
  const [level, slanted] = read.lines;
  assert.deepEqual(
    [level.text, level.h, level.cx, level.tilt, level.lang, level.elements.map(e => e.text)],
    ['Huhn in Gelee', 60, 50 + (11 * 36 + 2 * 20) / 2, 0, 'de', ['Huhn', 'in', 'Gelee']],
  );
  assert.ok(Math.abs(slanted.h - 24) < 1 && Math.abs(slanted.tilt - 0.35) < 0.02, 'a slanted line is as tall as it is');
  assert.ok(slanted.box.bottom - slanted.box.top > 40, 'while its box is taller');
  assert.deepEqual(readingOf({text: 'x', blocks: [{lines: [{text: 'ohne Box'}]}]}).lines, [], 'no box, no line');
});

test('packaging photos: a space where the words stand apart, none where they touch', () => {
  const read = plugin([
    ['HUHN &LACHS', 90, 100, {words: [['HUHN'], ['&'], ['LACHS']]}],
    ['Zusa tz', 30, 300, {words: [['Zusa'], ['tz', {gap: 3}]]}],
  ]);
  assert.deepEqual(packLines(read), ['Huhn & Lachs', 'Zusatz']);
  const badges = plugin([
    ['Huhn in Gelee', 60, 100],
    ['ohne Sojaohne Zucker', 30, 300, {words: [['ohne'], ['Soja'], ['ohne', {gap: 60}], ['Zucker']]}],
  ]);
  assert.deepEqual(packLines(badges), ['Huhn in Gelee'], 'two badges read as one line come apart, and promises go');
});

test('packaging photos: a small scrap in front of large print is dropped unless it is a word', () => {
  const scrap = plugin([['A HUHN', 90, 100, {words: [['A', {size: 11}], ['HUHN']]}]]);
  assert.deepEqual(packLines(scrap), ['Huhn']);
  const word = plugin([['mit HUHN & LACHS', 90, 100, {words: [['mit', {size: 11}], ['HUHN'], ['&'], ['LACHS']]}]]);
  assert.deepEqual(packLines(word), ['Mit Huhn & Lachs'], 'the small „mit“, read right, stays');
  const line = plugin([
    ['Ragout', 40, 40],
    ['mlt', 30, 100],
    ['HUHN & LACHS', 90, 140],
    ['4URI', 30, 260],
    ['Sud', 30, 320],
  ]);
  assert.deepEqual(packLines(line), ['Ragout', 'Huhn & Lachs'], 'nor as a line of three letters or fewer of its own');
  const ours = [{brand: 'Almo Nature', variety: 'Thunfisch im Sud'}];
  assert.deepEqual(packLines(line, '', ours), ['Ragout', 'Huhn & Lachs', 'Sud'], 'unless it is a word we know');
});

test('packaging photos: badges, small print and scraps of the picture stay out, unless they name something known', () => {
  const read = plugin([
    ['Feine Filets', 60, 100],
    ['Huhn in Gelee', 60, 180],
    ['Auri', 24, 400, {tilt: 0.35}],
    ['mit Lachs', 20, 450, {tilt: 0.4}],
    ['Schonend gegart', 20, 500, {tilt: -0.3}],
    ['Hergestellt in Europa', 8, 900],
    ['Rind', 8, 950],
    ['Leckerer Genuss', 30, 700],
  ]);
  assert.deepEqual(packLines(read), ['Feine Filets', 'Huhn in Gelee', 'mit Lachs', 'Leckerer Genuss', 'Rind']);
  const turned = plugin([
    ['Huhn in Gelee', 60, 100, {tilt: Math.PI / 2, left: 400}],
    ['Feine Filets', 60, 100, {tilt: Math.PI / 2, left: 300}],
  ]);
  assert.deepEqual(packLines(turned).sort(), ['Feine Filets', 'Huhn in Gelee'], 'a photo taken sideways is no badge');
  assert.deepEqual(
    packLines('Auri\nHergestellt in Europa'),
    ['Auri', 'Hergestellt in Europa'],
    'plain text has no sizes, so nothing goes for being small',
  );
});

test('packaging photos: the flavour names the variety, size decides between equals, and what stands near joins', () => {
  const carny = plugin([
    ['animonda', 50, 40],
    ['Carny', 120, 120],
    ['Adult', 30, 260],
    ['Rind & Huhn', 40, 300],
    ['Mit Rind und Huhn schmeckt es jeder Katze', 40, 800],
  ]);
  assert.deepEqual(
    [readPack(carny).brand, readPack(carny).variety],
    ['Animonda', 'Carny Adult Rind & Huhn'],
    'the flavour, not the larger print, is the main line; what stands close above joins, the brand and a far line do not',
  );
  const logo = plugin([
    ['Catz eRoed', 120, 100],
    ['Rind & Ente', 80, 400],
  ]);
  assert.equal(readPack(logo).variety, 'Rind & Ente', 'a logo the brand was not read from is no variety');
  const taller = plugin([
    ['Feine Filets', 90, 100],
    ['Huhn in Gelee', 58, 700],
  ]);
  assert.equal(readPack(taller).variety, 'Huhn in Gelee', 'larger print without a flavour does not win');
  const two = plugin([
    ['Mit Rind und Huhn schmeckt es jeder Katze', 50, 100],
    ['Rind & Huhn', 90, 700],
  ]);
  assert.equal(readPack(two).variety, 'Rind & Huhn', 'between two with a flavour, one clearly larger wins');
  const first = plugin([
    ['Rind & Huhn', 42, 100],
    ['Mit Rind und Huhn schmeckt es jeder Katze', 40, 700],
  ]);
  assert.equal(readPack(first).variety, 'Rind & Huhn', 'about as large: the one standing first');
  const none = plugin([
    ['Senior Menü', 90, 100],
    ['Classic Adult', 40, 700],
  ]);
  assert.equal(readPack(none).variety, 'Senior Menü', 'without any keyword the largest');
  const block = plugin([
    ['Ragout Royal', 52, 170, {left: 200}],
    ['HUHN & LACHS', 90, 246],
    ['in Sauce', 36, 350, {left: 300}],
  ]);
  assert.equal(readPack(block).variety, 'Ragout Royal Huhn & Lachs in Sauce', 'in reading order');
  const long = plugin([
    ['Zarte Filetstreifen in feiner Sauce', 90, 100],
    ['Huhn, Lachs und Forelle mit Gemüse', 80, 200],
  ]);
  assert.equal(readPack(long).variety, 'Huhn, Lachs und Forelle mit Gemüse', 'nothing that would make it too long');
  const classic = plugin([
    ['Catz eRoed', 120, 100],
    ['CLASSIC ADULT', 30, 250],
    ['Rind & Ente', 80, 400],
  ]);
  assert.equal(readPack(classic).brand, '', 'a brand only Open Pet Food Facts knows counts only where the logo stands');
  const big = plugin([
    ['Carnilove', 120, 100],
    ['Lamm & Wildschwein', 60, 400],
  ]);
  assert.equal(readPack(big).brand, 'Carnilove', 'and there it does');
});

test('packaging photos: the brand where the logo stands wins over a longer one in small print', () => {
  const rows = [
    ['Sheba', 80, 40],
    ['Lachs in Soße', 50, 150],
    ['Ein Produkt wie Perfect Fit', 20, 900],
  ];
  assert.equal(readPack(plugin(rows)).brand, 'Sheba');
  assert.equal(readPack(rows.map(r => r[0]).join('\n')).brand, 'Perfect Fit', 'plain text: the longest');
});

test('packaging photos: more lines than chips, the largest stay, in the order they stand', () => {
  const rows = Array.from({length: 10}, (_, i) => [`Zeile ${'abcdefghij'[i]}`, i < 8 ? 30 : 60, 100 + i * 80]);
  assert.deepEqual(
    packLines(plugin(rows)),
    ['a', 'b', 'c', 'd', 'e', 'f', 'i', 'j'].map(c => `Zeile ${c}`),
  );
});

test('packaging photos: the part around the variety is read again, and laid over the first reading', () => {
  const f = JSON.parse(readFileSync(new URL('miamor-ragout-royal.json', FIXTURES), 'utf8'));
  const first = readingOf(f.result, f.width, f.height);
  const crop = focusOf(first);
  assert.deepEqual(crop, {left: 0, top: 113, right: 825, bottom: 443}, 'the three lines, a quarter more on every side');
  assert.equal(
    focusOf(
      plugin([
        ['Huhn in Gelee', 40, 100],
        ['Feine Filets', 40, 200],
      ]),
    ),
    null,
    'nothing stands out',
  );
  assert.equal(focusOf('Huhn in Gelee\nFeine Filets'), null, 'plain text has no places');
  // Read again at twice the size: the small „mit“ comes out right this time
  const second = plugin(
    [
      ['Ragout Royal', 104, 110, {left: 410, lang: 'fr'}],
      ['mit HUHN & LACHS', 180, 266, {left: 116, words: [['mit', {size: 22}], ['HUHN'], ['&'], ['LACHS']]}],
      ['in Sauce', 72, 478, {left: 600}],
    ],
    1650,
    660,
  );
  const joined = joinReadings(first, second, {...crop, scale: 2});
  assert.equal(readPack(joined).variety, 'Ragout Royal mit Huhn & Lachs in Sauce');
  assert.deepEqual(
    joined.lines.map(l => l.text).filter(t => /HUHN|Ragout|Sauce/.test(t)),
    ['Ragout Royal', 'mit HUHN & LACHS', 'in Sauce'],
    'each line once, as read the second time',
  );
  const moved = joined.lines.find(l => l.text === 'in Sauce');
  assert.deepEqual([moved.box.left, moved.box.top, moved.h], [300, 352, 36], 'moved back into the photo');
  // A line the cut goes through stays as first read, and the scrap of it read again does not come twice
  const cut = joinReadings(
    plugin([
      ['Huhn in Gelee', 60, 100],
      ['Zusammensetzung Fleisch', 20, 300],
    ]),
    plugin([
      ['Huhn in Gelee', 60, 50],
      ['Zusammense', 10, 250],
    ]),
    {left: 0, top: 50, right: 800, bottom: 310, scale: 1},
  );
  assert.deepEqual(cut.lines.map(l => l.text).sort(), ['Huhn in Gelee', 'Zusammensetzung Fleisch']);
});

test('packaging photos: a line in another language weighs less as the variety, and stays a chip', () => {
  const read = plugin([
    ['Pollo Rustico', 60, 100, {lang: 'it'}],
    ['Senior Menü', 60, 700, {lang: 'de-DE'}],
  ]);
  assert.equal(readPack(read).variety, 'Senior Menü');
  assert.equal(packLines(read).length, 2);
  const same = plugin([
    ['Pollo Rustico', 60, 100, {lang: 'und'}],
    ['Senior Menü', 60, 700, {lang: 'de'}],
  ]);
  assert.notEqual(readPack(same).variety, 'Senior Menü', '„und“, no language named: no weight taken');
});

test('packaging photos: the size of a photo, straight from its header', () => {
  const segment = (marker, body) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  const jpeg = (...parts) => Buffer.from([0xff, 0xd8, ...parts.flat()]).toString('base64');
  const frame = segment(0xc0, [8, 0x04, 0x4c, 0x03, 0x39, 3]); // 1100 high, 825 wide
  const tables = segment(0xdb, Array(65).fill(1));
  assert.deepEqual(jpegSize(jpeg(segment(0xe0, Array(14).fill(0)), tables, frame)), {width: 825, height: 1100});
  assert.deepEqual(
    jpegSize(jpeg(segment(0xe1, Array(30000).fill(7)), frame)),
    {width: 825, height: 1100},
    'behind the large preview a camera puts in front',
  );
  assert.deepEqual(
    jpegSize(jpeg(segment(0xc4, Array(20).fill(0)), segment(0xc2, [8, 0, 10, 0, 20, 3]))),
    {width: 20, height: 10},
    'progressive, and the Huffman tables in between are no frame',
  );
  for (const bad of ['', 'kein Foto!', Buffer.from('GIF89a').toString('base64')])
    assert.deepEqual(jpegSize(bad), {width: 0, height: 0}, bad);
});

/* Readings of real packaging (tests/fixtures/ocr, how to collect them: PROJECT.md, „Text recognition“): the
   plugin's whole answer and what the packaging really said. Every one counts towards the hit rate, printed with
   the results; one marked `locked` has been read right once and has to stay right. */
const FIXTURES = new URL('./fixtures/ocr/', import.meta.url);
const fixtures = () =>
  readdirSync(FIXTURES)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => ({name, ...JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'))}));

/* A fixture's reading as the app has it: the first one, with the second laid over it where the fixture has one
   and `again` asks for it */
function readingIn(f, again) {
  const first = readingOf(f.result, f.width, f.height);
  if (!again || !f.second) return first;
  const {crop, scale, width, height, result} = f.second;
  return joinReadings(first, readingOf(result, width, height), {...crop, scale});
}

/* What the app makes of one fixture, and where that differs from what was expected: {field: what came out} */
function misses(f, again) {
  const products = f.products || [],
    read = readingIn(f, again);
  const got = readPack(read, products),
    chips = packLines(read, '', products),
    want = f.expected;
  const same = (value, expected) => [expected].flat().some(e => norm(e) === norm(value));
  const out = {};
  if (!same(got.brand, want.brand)) out.brand = got.brand;
  if (!same(got.variety, want.variety)) out.variety = got.variety;
  for (const k of ['type', 'animal', 'texture']) if (want[k] && got[k] !== want[k]) out[k] = got[k] ?? '';
  if (want.chips && JSON.stringify(chips) !== JSON.stringify(want.chips)) out.chips = chips;
  return out;
}

test('packaging photos: the fixtures from real readings, with the hit rate', t => {
  const all = fixtures();
  for (const f of all) {
    const ok = x => typeof x === 'string' || (Array.isArray(x) && x.length > 0);
    assert.ok(ok(f.expected?.brand) && ok(f.expected?.variety), `${f.name}: brand and variety are filled in`);
    assert.ok(f.width > 0 && f.height > 0 && Array.isArray(f.result?.blocks), `${f.name}: the size and the answer`);
  }
  const rate = again => {
    const rows = all.map(f => ({f, miss: misses(f, again)}));
    const count = pick => `${rows.filter(r => pick(r.miss)).length}/${rows.length}`;
    const brand = m => !('brand' in m),
      variety = m => !('variety' in m);
    return {rows, said: `brand ${count(brand)}, variety ${count(variety)}, both ${count(m => brand(m) && variety(m))}`};
  };
  const {rows, said} = rate(SECOND_PASS); // as the app reads now
  t.diagnostic(`OCR fixtures: ${said}`);
  if (all.some(f => f.second))
    t.diagnostic(`  ${SECOND_PASS ? 'without' : 'with'} the second reading: ${rate(!SECOND_PASS).said}`);
  for (const {f, miss} of rows)
    if (Object.keys(miss).length)
      t.diagnostic(`  ${f.name}${f.expected.locked ? ' (locked)' : ''}: ${JSON.stringify(miss)}`);
  const broken = rows.filter(r => r.f.expected.locked && Object.keys(r.miss).length).map(r => r.f.name);
  assert.deepEqual(broken, [], 'a fixture that was read right once stays right');
});
