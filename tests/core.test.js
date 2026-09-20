// Grundlagen ohne DOM: Barcodes, Datensätze als Felder, hybride Uhr, Aufbau der Module. Aufruf: node --test tests/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {normBarcode} from '../app/www/js/text.js';
import {guessTexture, TEXTURES, textureOf} from '../app/www/js/config.js';
import {fieldsOf, fromFields, setField, validId, valueOf} from '../app/www/js/fields.js';
import {clockState, measure, observe, rebase, stamp} from '../app/www/js/clock.js';

test('Barcodes: EAN-13, EAN-8 und UPC-A mit gültiger Prüfziffer', () => {
  const codes = ['4008429087455', '4008429087456', '036000291452', '96385074', '96385075', ' 4008429087455 ', '40084290874', 'abc', null];
  assert.deepEqual(codes.map(normBarcode), ['4008429087455', '', '0036000291452', '96385074', '', '4008429087455', '', '', '']);
});

test('Konsistenz und Snack-Art: Auswahl je Art, Stichwörter in Marke und Sorte', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(TEXTURES).map(([type, t]) => [type, [t.title, ...t.items.map(([k, label]) => `${k} ${label}`)]])), {
    Nassfutter: ['Konsistenz', 'sosse In Soße', 'gelee In Gelee', 'pastete Pastete', 'mousse Mousse', 'block Fester Block', 'suppe Suppe'],
    Snack: ['Snack-Art', 'knusprig Knusprig', 'weich Weich', 'creme Creme', 'milch Milch', 'stick Stick', 'kau Kauartikel']});
  const guess = (type, names) => names.map(variety => guessTexture({type, brand:'', variety}));
  assert.deepEqual(guess('Nassfutter', ['Lachs in Soße', 'Huhn in Sauce', 'Rind in Gelee', 'Tuna in Jelly', 'Feine Pastete', 'Pâté Ente', 'Terrine', 'Mousse Kalb', 'Loaf Huhn', 'Suppe', 'Soup', 'Brühe mit Huhn', 'Lachs']),
    ['sosse', 'sosse', 'gelee', 'gelee', 'pastete', 'pastete', 'pastete', 'mousse', 'block', 'suppe', 'suppe', 'suppe', undefined]);
  assert.deepEqual(guess('Snack', ['Knuspertaschen', 'Crunchy Bites', 'Soft Happen', 'Käse-Creme', 'Cream Snack', 'Malt Paste', 'Katzenmilch', 'Cat Milk', 'Drink', 'Sticks Lachs', 'Filetstreifen', 'Kauknochen', 'Chew Bone']),
    ['knusprig', 'knusprig', 'weich', 'creme', 'creme', 'creme', 'milch', 'milch', 'milch', 'stick', 'stick', 'kau', 'kau']);
  assert.deepEqual([guessTexture({type:'Trockenfutter', brand:'', variety:'Kroketten in Soße'}), guessTexture({type:'Snack', brand:'Crunchy', variety:'Huhn'}), guessTexture({brand:'', variety:'Huhn in Gelee'})],
    [undefined, 'knusprig', 'gelee']);
  assert.deepEqual([textureOf({type:'Snack'}, 'sosse'), textureOf({type:'Nassfutter'}, 'sosse')?.[1], textureOf({type:'Sonstiges'}, 'kau')], [undefined, 'In Soße', undefined]);
});

test('Felder: Karten zerfallen in Einträge, lokale Felder und null bleiben draußen', () => {
  const meal = {id:'meal0001', productId:'prod0001', servedAt:5, note:null, pets:{minka:{r:'gut'}, tiger:null}, photo:'data:…', status:'waiting', scanCode:'4008429087455'};
  assert.deepEqual(fieldsOf('servings', meal), {productId:'"prod0001"', servedAt:'5', 'pets.minka':'{"r":"gut"}'});
  assert.deepEqual(fieldsOf('products', {id:'prod0001', codes:{'4008429087455':true}}), {'codes.4008429087455':'true'});
  assert.equal(valueOf('servings', meal, 'pets.minka').r, 'gut');
  assert.equal(valueOf('servings', meal, 'pets.kiwi'), null);
});

test('Felder: Datensatz aus Feldwerten, null entfernt, id und _del sind keine Felder', () => {
  const pet = fromFields('pets', 'pet00001', {name:'Minka', 'photos.a1':'data:a', 'photos.b2':'data:b', _del:false});
  assert.deepEqual(pet, {id:'pet00001', photos:{a1:'data:a', b2:'data:b'}, name:'Minka'});
  setField('pets', pet, 'photos.a1', null); setField('pets', pet, 'name', null); setField('pets', pet, 'id', 'anders'); setField('pets', pet, 'name.x', 1);
  assert.deepEqual(pet, {id:'pet00001', photos:{b2:'data:b'}});
  assert.deepEqual(['abcd', 'abc', 'a b c d', undefined].map(validId), [true, false, false, false]);
});

test('Uhr: sortierbar, steigt immer, folgt fremden Uhren und der Serverzeit', () => {
  Object.assign(clockState, {device:'handy001', offset:0, ms:0, n:0});
  const a = stamp(), b = stamp();
  assert.match(a, /^\d{13}-\d{4}-handy001$/);
  assert.ok(b > a);
  const ahead = `${String(Date.now() + 60e3).padStart(13, '0')}-0007-anderes1`;
  observe(ahead);
  assert.ok(stamp() > ahead, 'nach einer fremden Uhr geht es darüber weiter');
  observe(`${String(Date.now() + 3600e3).padStart(13, '0')}-0000-anderes1`);
  assert.ok(clockState.ms < Date.now() + 61e3, 'Uhren weit in der Zukunft zählen nicht');
  measure(Date.now() - 3600e3, Date.now() - 100, Date.now());
  assert.ok(Math.abs(clockState.offset + 3600e3) < 1000, 'Abweichung zur Serverzeit gemessen');
  rebase();
  assert.ok(clockState.ms <= Date.now() + clockState.offset, 'nach „clock“ nicht in der Zukunft weiterzählen');
});

test('Module: keine Kreisabhängigkeiten', () => {
  const root = new URL('../app/www/js/', import.meta.url).pathname, deps = new Map();
  for (const file of readdirSync(root, {recursive:true}).filter(f => f.endsWith('.js')))
    deps.set(join(root, file), [...readFileSync(join(root, file), 'utf8').matchAll(/^import\s[^;]*?'(\.[^']+)'/gm)].map(m => join(root, dirname(file), m[1])));
  const visit = (file, path) => {
    assert.ok(!path.includes(file), `Kreis: ${[...path, file].join(' → ')}`);
    for (const dep of deps.get(file)) visit(dep, [...path, file]);
  };
  for (const file of deps.keys()) visit(file, []);
});
