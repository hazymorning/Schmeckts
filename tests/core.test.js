// Foundations without a DOM: barcodes, records as fields, the hybrid clock, module layering. Usage: node --test tests/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {normBarcode} from '../app/www/js/text.js';
import {guessTexture, TEXTURES, textureOf} from '../app/www/js/config.js';
import {fieldsOf, fromFields, setField, validId, valueOf} from '../app/www/js/fields.js';
import {clockState, measure, observe, rebase, stamp} from '../app/www/js/clock.js';

test('barcodes: EAN-13, EAN-8 and UPC-A with a valid check digit', () => {
  const codes = [
    '4008429087455',
    '4008429087456',
    '036000291452',
    '96385074',
    '96385075',
    ' 4008429087455 ',
    '40084290874',
    'abc',
    null,
  ];
  assert.deepEqual(codes.map(normBarcode), [
    '4008429087455',
    '',
    '0036000291452',
    '96385074',
    '',
    '4008429087455',
    '',
    '',
    '',
  ]);
});

test('consistency and treat type: the choice per type, keywords in brand and variety', () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(TEXTURES).map(([type, t]) => [type, [t.title, ...t.items.map(([k, label]) => `${k} ${label}`)]]),
    ),
    {
      Nassfutter: [
        'Konsistenz',
        'sosse In Soße',
        'gelee In Gelee',
        'pastete Pastete',
        'mousse Mousse',
        'block Fester Block',
        'suppe Suppe',
      ],
      Snack: [
        'Snack-Art',
        'knusprig Knusprig',
        'weich Weich',
        'creme Creme',
        'milch Milch',
        'stick Stick',
        'kau Kauartikel',
      ],
    },
  );
  const guess = (type, names) => names.map(variety => guessTexture({type, brand: '', variety}));
  assert.deepEqual(
    guess('Nassfutter', [
      'Lachs in Soße',
      'Huhn in Sauce',
      'Rind in Gelee',
      'Tuna in Jelly',
      'Feine Pastete',
      'Pâté Ente',
      'Terrine',
      'Mousse Kalb',
      'Loaf Huhn',
      'Suppe',
      'Soup',
      'Brühe mit Huhn',
      'Lachs',
    ]),
    [
      'sosse',
      'sosse',
      'gelee',
      'gelee',
      'pastete',
      'pastete',
      'pastete',
      'mousse',
      'block',
      'suppe',
      'suppe',
      'suppe',
      undefined,
    ],
  );
  assert.deepEqual(
    guess('Snack', [
      'Knuspertaschen',
      'Crunchy Bites',
      'Soft Happen',
      'Käse-Creme',
      'Cream Snack',
      'Malt Paste',
      'Katzenmilch',
      'Cat Milk',
      'Drink',
      'Sticks Lachs',
      'Filetstreifen',
      'Kauknochen',
      'Chew Bone',
    ]),
    [
      'knusprig',
      'knusprig',
      'weich',
      'creme',
      'creme',
      'creme',
      'milch',
      'milch',
      'milch',
      'stick',
      'stick',
      'kau',
      'kau',
    ],
  );
  assert.deepEqual(
    [
      guessTexture({type: 'Trockenfutter', brand: '', variety: 'Kroketten in Soße'}),
      guessTexture({type: 'Snack', brand: 'Crunchy', variety: 'Huhn'}),
      guessTexture({brand: '', variety: 'Huhn in Gelee'}),
    ],
    [undefined, 'knusprig', 'gelee'],
  );
  assert.deepEqual(
    [
      textureOf({type: 'Snack'}, 'sosse'),
      textureOf({type: 'Nassfutter'}, 'sosse')?.[1],
      textureOf({type: 'Sonstiges'}, 'kau'),
    ],
    [undefined, 'In Soße', undefined],
  );
});

test('fields: maps break down into entries, local fields and null stay out', () => {
  const meal = {
    id: 'meal0001',
    productId: 'prod0001',
    servedAt: 5,
    note: null,
    pets: {minka: {r: 'gut'}, tiger: null},
    photo: 'data:…',
    status: 'waiting',
    scanCode: '4008429087455',
  };
  assert.deepEqual(fieldsOf('servings', meal), {productId: '"prod0001"', servedAt: '5', 'pets.minka': '{"r":"gut"}'});
  assert.deepEqual(fieldsOf('products', {id: 'prod0001', codes: {4008429087455: true}}), {
    'codes.4008429087455': 'true',
  });
  assert.equal(valueOf('servings', meal, 'pets.minka').r, 'gut');
  assert.equal(valueOf('servings', meal, 'pets.kiwi'), null);
});

test('fields: a record from field values, null removes, id and _del are not fields', () => {
  const prod = fromFields('products', 'prod0001', {
    brand: 'Sheba',
    'codes.4008429087455': true,
    'codes.96385074': true,
    _del: false,
  });
  assert.deepEqual(prod, {id: 'prod0001', codes: {4008429087455: true, 96385074: true}, brand: 'Sheba'});
  setField('products', prod, 'codes.4008429087455', null);
  setField('products', prod, 'brand', null);
  setField('products', prod, 'id', 'anders');
  setField('products', prod, 'brand.x', 1);
  assert.deepEqual(prod, {id: 'prod0001', codes: {96385074: true}});
  assert.equal(setField('pets', {id: 'pet00001'}, 'photos.a1', 'data:a'), false); // a map this version does not know stays out
  assert.deepEqual(['abcd', 'abc', 'a b c d', undefined].map(validId), [true, false, false, false]);
});

test('clock: sortable, always rising, follows foreign clocks and server time', () => {
  Object.assign(clockState, {device: 'handy001', offset: 0, ms: 0, n: 0});
  const a = stamp(),
    b = stamp();
  assert.match(a, /^\d{13}-\d{4}-handy001$/);
  assert.ok(b > a);
  const ahead = `${String(Date.now() + 60e3).padStart(13, '0')}-0007-anderes1`;
  observe(ahead);
  assert.ok(stamp() > ahead, 'after a foreign clock it carries on above it');
  observe(`${String(Date.now() + 3600e3).padStart(13, '0')}-0000-anderes1`);
  assert.ok(clockState.ms < Date.now() + 61e3, 'clocks far in the future do not count');
  measure(Date.now() - 3600e3, Date.now() - 100, Date.now());
  assert.ok(Math.abs(clockState.offset + 3600e3) < 1000, 'offset to server time measured');
  rebase();
  assert.ok(
    clockState.ms <= Date.now() + clockState.offset,
    'after a "clock" rejection do not keep counting in the future',
  );
});

test('modules: no circular dependencies', () => {
  const root = new URL('../app/www/js/', import.meta.url).pathname,
    deps = new Map();
  for (const file of readdirSync(root, {recursive: true}).filter(f => f.endsWith('.js')))
    deps.set(
      join(root, file),
      [...readFileSync(join(root, file), 'utf8').matchAll(/^import\s[^;]*?'(\.[^']+)'/gm)].map(m =>
        join(root, dirname(file), m[1]),
      ),
    );
  const visit = (file, path) => {
    assert.ok(!path.includes(file), `cycle: ${[...path, file].join(' → ')}`);
    for (const dep of deps.get(file)) visit(dep, [...path, file]);
  };
  for (const file of deps.keys()) visit(file, []);
});
