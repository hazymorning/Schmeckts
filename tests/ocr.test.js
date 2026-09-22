// Reading packaging text (js/ocr.js) without a device: known varieties, brands, variety, type, species,
// consistency. Usage: node --test tests/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {BRANDS} from '../app/www/js/config.js';
import {MAX_VARIETY, PACK_LINES, packLines, readPack} from '../app/www/js/ocr.js';

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
