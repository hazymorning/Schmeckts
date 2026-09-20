// Packungstext auswerten (js/ocr.js), ohne Gerät: bekannte Sorten, Marken, Sorte, Art, Tierart, Konsistenz.
// Aufruf: node --test tests/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {BRANDS} from '../app/www/js/config.js';
import {MAX_VARIETY, readPack} from '../app/www/js/ocr.js';

const SORTEN = [{brand:'Sheba', variety:'Lachs in Soße', type:'Nassfutter', animal:'Katze', texture:'sosse'},
  {brand:'Dreamies', variety:'Käse', type:'Snack', animal:'Katze'}];

test('Packungstext: eigene Sorten gehen vor, unempfindlich gegen Groß/klein, Bindestriche und Leerzeichen', () => {
  const texte = ['SHEBA\nLACHS IN SOSSE\n85 g', 'sheba lachs-in-soße', 'Sheba\nLachsinSosse\nNEU'];
  for (const text of texte) {
    assert.deepEqual(readPack(text, SORTEN), {brand:'Sheba', variety:'Lachs in Soße', type:'Nassfutter', animal:'Katze', texture:'sosse'}, text);
  }
  assert.equal(readPack('Dreamies\nmit Käse', SORTEN).variety, 'Käse');
});

test('Packungstext: Marke aus der Liste, sonst nichts erfunden', () => {
  assert.ok(BRANDS.length > 50 && BRANDS.includes('Whiskas') && BRANDS.includes('Coshida'), 'gängige Marken samt Handelsmarken');
  assert.equal(readPack('ANIMONDA\nCarny Adult\nRind & Huhn\n400 g').brand, 'Animonda');
  assert.equal(readPack('K-CLASSIC\nHuhn in Gelee').brand, 'K-Classic');
  assert.equal(readPack('Hofmeister\nHuhn in Gelee').brand, '', 'unbekannte Marke bleibt leer, die Sorte steht trotzdem da');
  assert.equal(readPack('Hofmeister\nHuhn in Gelee').variety, 'Huhn in Gelee');
});

test('Packungstext: die Sorte ohne Mengen, Werbung, Zutaten und reine Zahlen, höchstens 40 Zeichen', () => {
  const text = 'Sheba\nNEU\n100 % natürlich\nSelection in Sauce\nmit Lachs\n4 x 85 g\n4008429087455\nZutaten: Fleisch und tierische Nebenerzeugnisse 40 %';
  const got = readPack(text);
  assert.equal(got.variety, 'Selection in Sauce mit Lachs');
  assert.ok(got.variety.length <= MAX_VARIETY);
  assert.equal(readPack('Whiskas\n1+ Adult Thunfisch in Gelee für ausgewachsene Katzen jeden Alters').variety.length <= MAX_VARIETY, true);
});

test('Packungstext: Art, Konsistenz und Tierart aus den Stichwörtern', () => {
  const nass = readPack('Miamor\nFeine Filets\nHuhn in Gelee\nfür Katzen');
  assert.deepEqual([nass.type, nass.texture, nass.animal], ['Nassfutter', 'gelee', 'Katze']);
  const snack = readPack('Vitakraft\nKnusper-Sticks mit Lachs\nSnack für Katzen');
  assert.deepEqual([snack.type, snack.texture, snack.animal], ['Snack', 'knusprig', 'Katze']);
  const trocken = readPack('Josera\nTrockenfutter\nHuhn für Welpen');
  assert.deepEqual([trocken.type, trocken.texture, trocken.animal], ['Trockenfutter', undefined, 'Hund']);
});

test('Packungstext: ohne Brauchbares bleibt alles leer', () => {
  for (const text of ['', '   ', '12345\n4008429087455\n850 g', 'NEU\n100 % natürlich']) {
    assert.deepEqual(readPack(text, SORTEN), {brand:'', variety:'', type:'', animal:''}, JSON.stringify(text));
  }
});
