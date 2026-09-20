// Auswertung (js/smart.js) mit erfundenen Daten. Aufruf: node --test tests/*.test.js
process.env.TZ = 'Europe/Berlin';
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze, feedReminders, feedSlots, hintKey, milestones, rateCls, review, week} from '../app/www/js/smart.js';
import {RATINGS, scaleOf, SCALES} from '../app/www/js/config.js';

const DAY = 864e5, NOW = Date.UTC(2026, 5, 3, 10);
const [T, G, M, S, X] = ['top', 'gut', 'mittel', 'sosse', 'schlecht'];
const at = text => new Date(text).getTime();

/* meals: [Sorte, {Tier: Bewertung}, vor Tagen oder 'JJJJ-MM-TTThh:mm', Person] */
function household(pets, products, meals){
  return {
    pets: pets.map(id => ({id, name:id})),
    products: products.map(p => typeof p === 'string' ? {id:p} : p).map(p => ({brand:'', variety:'', codes:{}, ...p})),
    servings: meals.map(([productId, rated, when, by], i) => ({id:'meal' + i, productId, by,
      servedAt: typeof when === 'string' ? at(when) : NOW - when * DAY,
      pets: Object.fromEntries(Object.entries(rated).map(([pet, r]) => [pet, {r}]))}))
  };
}
const rate = (sort, pet, ratings, daysAgo = 0) => ratings.map(r => [sort, {[pet]:r}, daysAgo]);
const daily = (pet, pairs, start, step = 1) => pairs.map(([sort, r], i) => [sort, {[pet]:r}, start + i * step]);
const model = (db, prefs = {}, now = NOW) => analyze(db, {activePet:'all', hiddenHints:[], ...prefs}, now);
const sorts = (m, pick) => Object.fromEntries(m.sorts.map(e => [e.id, pick(e)]));
const keys = m => m.hints.map(h => hintKey(h) + (h.kind === 'sosse' ? '@' + h.pet : ''));

test('Wertung: Punkte der Skala, unbekannte Werte zählen nicht', () => {
  const m = model(household(['A'], ['p'], rate('p', 'A', [G, M, S, X, 'lecker'])));
  const e = m.byId.get('p');
  assert.deepEqual([e.n, e.pct, e.counts], [4, 40, {gut:1, mittel:1, sosse:1, schlecht:1}]);
});

test('Skalen: je Futterart eine, jede Stufe mit eigenen Punkten, die Farbe folgt den Punkten', () => {
  const scale = type => scaleOf({type}).map(r => [r, RATINGS[r].score]);
  assert.deepEqual(scale('Nassfutter'), [['top', 100], ['gut', 80], ['mittel', 50], ['sosse', 30], ['schlecht', 0]]);
  assert.deepEqual(scale('Trockenfutter'), [['gern', 100], ['normal', 80], ['wenig', 35], ['liegen', 0]]);
  assert.deepEqual(scale('Snack'), [['verputzt', 100], ['spaeter', 70], ['angeknabbert', 35], ['unberuehrt', 0]]);
  assert.deepEqual([scaleOf({type:'Sonstiges'}), scaleOf({}), scaleOf(null)], [SCALES.bite, SCALES.portion, SCALES.portion]);
  assert.deepEqual(Object.values(SCALES).flat().sort(), Object.keys(RATINGS).sort()); // jede Stufe gehört zu genau einer Skala
  assert.deepEqual(['gut', 'spaeter', 'mittel', 'wenig', 'sosse', 'liegen'].map(rateCls), ['r-good', 'r-good', 'r-mid', 'r-sauce', 'r-sauce', 'r-bad']);
});

test('gemischte Skalen: Urteile und Appetit rechnen nur mit Punkten, der Schlüssel zählt, nicht die heutige Art', () => {
  const db = household(['A'], [{id:'trocken', type:'Trockenfutter'}, {id:'snack', type:'Snack'}, {id:'gewechselt', type:'Trockenfutter'}],
    [...rate('trocken', 'A', ['gern', 'normal', 'wenig'], 40), ...rate('snack', 'A', ['unberuehrt', 'spaeter'], 40), ...rate('gewechselt', 'A', [T, 'normal', S], 40)]);
  assert.deepEqual(sorts(model(db), e => [e.pct, e.verdict]), {trocken:[72, 'nachkaufen'], gewechselt:[70, 'nachkaufen'], snack:[35, 'nicht']});
  assert.deepEqual(model(db).byId.get('gewechselt').counts, {top:1, normal:1, sosse:1});
  const usual = daily('A', Array(8).fill(['trocken', 'normal']), 4), low = daily('A', [['trocken', 'wenig'], ['snack', 'angeknabbert'], ['p', M]], .4, .8);
  assert.deepEqual(appetite([...usual, ...low]), [['appetit:A:2026-06-03', 3, 40, 80]]);
});

test('Urteile an den Grenzen: Nachkaufen ab 3 und 70, Nicht mehr kaufen ab 2 und unter 40', () => {
  const cases = {zwei:[T, T], drei:[T, T, T], siebzig:[G, G, M], knapp:[T, M, M], eins:[X], nein2:[M, X], vierzig:[T, S, S, X], nein3:[M, S, S]};
  const db = household(['A'], Object.keys(cases), Object.entries(cases).flatMap(([id, rs]) => rate(id, 'A', rs)));
  assert.deepEqual(sorts(model(db), e => [e.pct, e.verdict]), {
    zwei:[100, 'beobachten'], drei:[100, 'nachkaufen'], siebzig:[70, 'nachkaufen'], knapp:[67, 'beobachten'],
    eins:[0, 'beobachten'], nein2:[25, 'nicht'], vierzig:[40, 'beobachten'], nein3:[37, 'nicht']});
});

test('das Gewicht halbiert sich alle 90 Tage', () => {
  const db = household(['A'], ['alt', 'halb'], [...rate('alt', 'A', [X], 180), ...rate('alt', 'A', [T]), ...rate('halb', 'A', [T], 90), ...rate('halb', 'A', [X])]);
  assert.deepEqual(sorts(model(db), e => e.pct), {alt:80, halb:33});
});

test('die Wertung hängt nicht vom Zeitpunkt ab, solange keine Bewertung dazukommt', () => {
  const db = household(['A'], ['p'], [...rate('p', 'A', [X], 200), ...rate('p', 'A', [T, G], 20)]);
  assert.equal(model(db, {}, NOW + 400 * DAY).byId.get('p').score.toFixed(6), model(db).byId.get('p').score.toFixed(6));
});

test('nur Mahlzeiten bis „jetzt“ zählen', () => {
  const db = household(['A'], ['p'], [...rate('p', 'A', [X, X], 5), ...rate('p', 'A', [T, T, T], -3)]);
  const e = t => { const x = model(db, {}, t).byId.get('p'); return [x.n, x.verdict]; };
  assert.deepEqual([e(NOW), e(NOW + 6 * DAY)], [[2, 'nicht'], [5, 'beobachten']]);
});

test('Haushalt, „Gemischt“, eigene Einstellung und Tier-Filter', () => {
  const db = household(['Minka', 'Tiger'], ['gemischt', 'ja', 'nein', 'offen', {id:'immer', kaufen:'immer'}, {id:'nie', kaufen:'nicht'}], [
    ...rate('gemischt', 'Minka', [G, G, G]), ...rate('gemischt', 'Tiger', [X, X]), ...rate('ja', 'Minka', [G, G, G]), ...rate('ja', 'Tiger', [X]),
    ...rate('nein', 'Minka', [X, M]), ...rate('nein', 'Tiger', [G]), ...rate('offen', 'Minka', [G, G]),
    ...rate('immer', 'Minka', [X, X]), ...rate('nie', 'Tiger', [G, G, G])]);
  const m = model(db);
  assert.deepEqual(sorts(m, e => [e.house.verdict, e.yes, e.no]), {
    gemischt:['gemischt', ['Minka'], ['Tiger']], ja:['nachkaufen', ['Minka'], []], nein:['nicht', [], ['Minka']],
    offen:['beobachten', [], []], immer:['nicht', [], ['Minka']], nie:['nachkaufen', ['Tiger'], []]});
  assert.deepEqual([m.byId.get('immer').choice, m.byId.get('nie').choice, m.byId.get('gemischt').choice], ['nachkaufen', 'nicht', 'gemischt']);
  assert.ok(!keys(m).some(k => /:(immer|nie)/.test(k)), 'Sorten mit eigener Einstellung bekommen keine Hinweise');
  const tiger = model(db, {activePet:'Tiger'});
  assert.deepEqual([tiger.byId.get('gemischt').verdict, tiger.byId.get('gemischt').n, tiger.rated], ['nicht', 2, 7]);
});

test('Hinweise nach Vorrang, ausgeblendet pro Art und Sorte', () => {
  const db = household(['A', 'B'], ['stop1', 'stop2', 'sauce', 'lieb1', 'lieb2', 'wenig', 'selten'], [
    ...rate('stop1', 'A', [X, X, X]), ...rate('stop2', 'A', [M, X]), ...rate('sauce', 'B', [S, S, G]), ...rate('lieb1', 'A', [G, G, M]),
    ...rate('lieb2', 'A', [G, G, G]), ...rate('wenig', 'B', [S, S, G, G, M]), ...rate('selten', 'A', [S, S])]);
  assert.deepEqual(keys(model(db)), ['stop:stop1', 'stop:stop2', 'stop:selten', 'sosse:sauce@B', 'liebling:lieb2', 'liebling:lieb1']);
  assert.deepEqual(keys(model(db, {hiddenHints:['stop:stop1', 'liebling:lieb2']})), ['stop:stop2', 'stop:selten', 'sosse:sauce@B', 'liebling:lieb1']);
});

test('Übersicht: letzte Fütterung bis jetzt, je Tier die liebste und die schwächste Sorte, alles im Filter', () => {
  const db = household(['A', 'B'], ['lieb', 'gut', 'flop', 'neu'], [...rate('lieb', 'A', [T, T, T], 5), ...rate('gut', 'A', [G, G, G], 5), ...rate('flop', 'A', [X, X], 4),
    ...rate('flop', 'B', [T, T, T], 4), ['neu', {B:null}, 1], ['neu', {A:G}, -1]]);
  const pick = m => [m.overview.last?.productId ?? null, ...m.overview.pets.map(x => [x.id, x.favorite?.id ?? null, x.flop?.id ?? null])];
  assert.deepEqual(pick(model(db)), ['neu', ['A', 'lieb', 'flop'], ['B', 'flop', null]]);
  assert.deepEqual([pick(model(db, {activePet:'A'})), pick(model(db, {activePet:'B'}))], [['flop', ['A', 'lieb', 'flop']], ['neu', ['B', 'flop', null]]]);
  assert.deepEqual(pick(model(household(['A'], [], []))), [null, ['A', null, null]]);
});

test('Fütterungszeiten: aus 14 Tagen, ohne Snacks, ab 4 Tagen; Erinnerung 45 Minuten später, nur wenn noch nichts serviert ist', () => {
  const day = (d, time) => `2026-06-${String(d).padStart(2, '0')}T${time}`, now = at(day(10, '12:00'));
  const meals = [...[3, 4, 5, 6, 7, 8, 9].flatMap(d => [['nass', {A:G}, day(d, d % 2 ? '07:10' : '07:40')], ['nass', {A:G}, day(d, '18:30')]]),
    ...[7, 8, 9].map(d => ['nass', {A:G}, day(d, '12:30')]), ...[5, 6, 7, 8, 9].map(d => ['snack', {A:'verputzt'}, day(d, '15:00')]), ['nass', {A:G}, day(10, '07:20')]];
  const db = household(['A'], [{id:'nass', type:'Nassfutter'}, {id:'snack', type:'Snack'}], meals);
  const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  assert.deepEqual(feedSlots(db, now).map(x => [hhmm(x.from), hhmm(x.at), hhmm(x.remind)]), [['07:10', '07:20', '08:05'], ['18:30', '18:30', '19:15']]);
  const due = (db, now) => feedReminders(db, now).map(x => [x.key, new Date(x.at).toLocaleString('sv')]);
  assert.deepEqual(due(db, now), [['2026-06-11|440', '2026-06-11 08:05:00'], ['2026-06-12|440', '2026-06-12 08:05:00'],
    ['2026-06-10|1110', '2026-06-10 19:15:00'], ['2026-06-11|1110', '2026-06-11 19:15:00'], ['2026-06-12|1110', '2026-06-12 19:15:00']]);
  const fed = household(['A'], db.products, [...meals, ['snack', {A:'verputzt'}, day(10, '17:50')]]), fedMeal = household(['A'], db.products, [...meals, ['nass', {A:null}, day(10, '17:45')]]);
  assert.deepEqual([due(fed, at(day(10, '18:00'))).length, due(fedMeal, at(day(10, '18:00'))).map(x => x[0])], [5, ['2026-06-11|440', '2026-06-12|440', '2026-06-11|1110', '2026-06-12|1110']]);
  assert.deepEqual(feedSlots(household(['A'], ['nass'], meals.slice(0, 6)), now), []);
});

test('Erkenntnisse: Vergleiche brauchen zwei Gruppen, „meist nur die Soße“ ab der Hälfte', () => {
  const db = household(['A'], [{id:'a', brand:'Sheba', variety:'Lachs in Soße'}, {id:'b', brand:'Felix', variety:'Huhn in Gelee'}],
    [...rate('a', 'A', [T, T]), ...rate('b', 'A', [S, S])]);
  const m = model(db);
  assert.deepEqual(m.insights.map(i => [i.kind, i.best?.key, i.worst?.key, i.id]), [
    ['marke', 'Sheba', 'Felix', undefined], ['konsistenz', 'In Soße', 'In Gelee', undefined], ['geschmack', 'Lachs', 'Huhn', undefined], ['sosse', undefined, undefined, 'b']]);
  assert.deepEqual(model(household(['A'], ['a'], rate('a', 'A', [T, T]))).insights, []);
});

test('Erkenntnisse: Vergleiche nur innerhalb einer Futterart, die Erkenntnis nennt sie', () => {
  const sort = (id, brand, type) => ({id, brand, variety:'Huhn', type});
  const mixed = household(['A'], [sort('nass', 'Sheba', 'Nassfutter'), sort('trocken', 'Felix', 'Trockenfutter')],
    [...rate('nass', 'A', [T, T]), ...rate('trocken', 'A', ['liegen', 'liegen'])]);
  assert.deepEqual(model(mixed).insights, []);
  const dry = household(['A'], [sort('nass', 'Sheba', 'Nassfutter'), sort('t1', 'Felix', 'Trockenfutter'), sort('t2', 'Josera', 'Trockenfutter')],
    [...rate('nass', 'A', [T, T]), ...rate('t1', 'A', ['liegen', 'wenig']), ...rate('t2', 'A', ['gern', 'gern'])]);
  assert.deepEqual(model(dry).insights.map(i => [i.kind, i.type, i.best.key, i.worst.key]), [['marke', 'Trockenfutter', 'Josera', 'Felix']]);
});

test('Erkenntnisse zur Konsistenz: das Feld texture, nur ohne Feld die Stichwörter, getrennt für Nassfutter und Snacks', () => {
  const db = household(['A'], [{id:'n1', variety:'Lachs in Soße', texture:'gelee'}, {id:'n2', variety:'Huhn Pastete'}, {id:'n3', variety:'Rind', texture:'knusprig'},
    {id:'s1', type:'Snack', variety:'Knusperkissen'}, {id:'s2', type:'Snack', variety:'Happen', texture:'creme'}, {id:'s3', type:'Snack', variety:'Snack in Soße'}],
    [...rate('n1', 'A', [T, T]), ...rate('n2', 'A', [M, M]), ...rate('n3', 'A', [X, X]), ...rate('s1', 'A', ['unberuehrt', 'unberuehrt']),
     ...rate('s2', 'A', ['verputzt', 'verputzt']), ...rate('s3', 'A', ['verputzt', 'verputzt'])]);
  assert.deepEqual(model(db).insights.filter(i => i.kind === 'konsistenz').map(i => [i.type, i.best.key, i.best.pct, i.worst.key, i.worst.pct]),
    [['Nassfutter', 'In Gelee', 100, 'Pastete', 50], ['Snack', 'Creme', 100, 'Knusprig', 0]]);
});

const USUAL = daily('A', Array(8).fill(['p1', G]), 4), LOW = daily('A', [['p1', M], ['p2', S], ['p1', M]], .4, .8);
const appetite = (meals, prefs, pets = ['A'], now = NOW) =>
  model(household(pets, ['p1', 'p2', 'mies'], meals), prefs, now).hints.filter(h => h.kind === 'appetit').map(h => [hintKey(h), h.n, h.recent, h.usual]);

test('Appetit: 72 Stunden gegen die 30 Tage davor, Vorrang vor allem anderen', () => {
  const m = model(household(['A'], ['p1', 'p2', 'mies'], [...USUAL, ...LOW, ...daily('A', [['mies', X], ['mies', X]], 40)]));
  assert.deepEqual(keys(m), ['appetit:A:2026-06-03', 'stop:mies', 'liebling:p1']);
  assert.deepEqual(appetite([...USUAL, ...LOW]), [['appetit:A:2026-06-03', 3, 43, 80]]);
});

test('Appetit an den Grenzen', () => {
  const none = {
    'nur 2 Bewertungen im Fenster': [...USUAL, ...LOW.slice(0, 2)],
    'nur 7 im Vergleich': [...USUAL.slice(0, 7), ...LOW],
    'nur eine Sorte im Fenster': [...USUAL, ...daily('A', [['p1', M], ['p1', S], ['p1', M]], .4, .8)],
    'dritte Bewertung älter als 72 Stunden': [...USUAL.slice(0, 7), ...daily('A', [['p1', M], ['p2', S], ['p1', M]], .4, 1.31)],
    'nur 29 Punkte darunter': [...daily('A', [G, G, G, G, G, M, M, M].map(r => ['p1', r]), 4), ...daily('A', [['p1', M], ['p2', S], ['p1', M], ['p2', S]], .4, .6)],
    'Schnitt nicht unter 50': [...daily('A', Array(8).fill(['p1', T]), 4), ...daily('A', [['p1', M], ['p2', M], ['p1', M]], .4, .8)],
    'Vergleich älter als 30 Tage': [...daily('A', Array(8).fill(['p1', G]), 34), ...LOW]};
  for (const [name, meals] of Object.entries(none)) assert.deepEqual(appetite(meals), [], name);
  const edge = [...daily('A', [G, G, G, G, G, G, M, S].map(r => ['p1', r]), 4), ...daily('A', [['p1', M], ['p2', S], ['p1', M], ['p2', S]], .4, .6)];
  assert.deepEqual(appetite(edge), [['appetit:A:2026-06-03', 4, 40, 70]], 'genau 30 Punkte darunter genügt');
});

test('Appetit je Tier, ausgeblendet bis zur nächsten Bewertung', () => {
  const two = [...USUAL, ...LOW, ...daily('B', Array(8).fill(['p1', G]), 4), ...daily('B', [['p1', G], ['p2', T], ['p1', G]], .4, .8)];
  assert.deepEqual(['all', 'A', 'B'].map(p => appetite(two, {activePet:p}, ['A', 'B']).length), [1, 1, 0]);
  const hidden = {hiddenHints:['appetit:A:2026-06-03']};
  assert.deepEqual(appetite([...USUAL, ...LOW], hidden), []);
  const next = appetite([...USUAL, ...LOW, ['p2', {A:X}, -.9]], hidden, ['A'], NOW + DAY);
  assert.equal(next[0][0], 'appetit:A:2026-06-04');
});

test('„Geschmack bekannt“: Sorten der letzten 180 Tage, je Tier und als Summe', () => {
  const db = household(['A', 'B'], ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], [
    ...daily('A', [...Array(3).fill(['p1', G]), ...Array(2).fill(['p2', X]), ...Array(2).fill(['p3', G]), ['p4', null], ['p6', M], ['p6', S]], 1),
    ...daily('A', Array(3).fill(['p5', T]), 181), ...daily('B', [['p1', T]], 2), ['weg', {A:T}, 1], [null, {A:T}, 1]]);
  assert.deepEqual(['all', 'A', 'B'].map(p => model(db, {activePet:p}).taste), [{known:2, total:6}, {known:2, total:5}, {known:0, total:1}]);
  assert.deepEqual(model(db).tastes, {A:{known:2, total:5}, B:{known:0, total:1}});
});

const WEEK = household(['Minka', 'Tiger'], ['lachs', 'huhn', 'rind', 'neu'], [
  ['lachs', {Minka:T}, '2026-05-10T08:00', 'Anna'], ['lachs', {Minka:T}, '2026-05-11T08:00', 'Anna'], ['lachs', {Minka:T}, '2026-05-12T08:00', 'Anna'],
  ['neu', {Minka:G}, '2026-05-20T08:00', 'Anna'], ['huhn', {Minka:G}, '2026-05-24T23:59', 'Anna'],
  ['neu', {Minka:T}, '2026-05-25T00:00', 'Anna'], ['neu', {Minka:T}, '2026-05-26T08:00', 'Anna'],
  ['huhn', {Minka:G, Tiger:M}, '2026-05-27T08:00', 'Jonas'], ['huhn', {Minka:G, Tiger:X}, '2026-05-28T08:00', 'Jonas'],
  ['rind', {Minka:T}, '2026-05-29T08:00', ''], ['lachs', {Tiger:S}, '2026-05-29T18:00', 'Anna'], ['lachs', {Tiger:S}, '2026-05-30T18:00', null],
  [null, {Minka:null}, '2026-05-31T23:59', ' Jonas '],
  ['rind', {Minka:T}, '2026-06-01T00:00', 'Jonas'], ['rind', {Minka:T}, '2026-06-01T09:00', 'Jonas']]);

test('Woche: Montag 0:00 bis Sonntag 24:00, immer für den Haushalt', () => {
  const w = week(WEEK, {activePet:'Tiger'}, at('2026-05-25T00:00'));
  assert.deepEqual([w.meals, w.rated, w.end], [8, 7, at('2026-06-01T00:00')]);
  assert.deepEqual(w.best, [{pet:'Minka', id:'neu', n:2, pct:100}, {pet:'Tiger', id:'lachs', n:2, pct:30}]);
  assert.deepEqual(w.favorites, ['neu']);
  assert.deepEqual(w.feeders, [{name:'Anna', n:3}, {name:'Jonas', n:3}], 'ohne Namen nicht gezählt, Gleichstand nach Namen');
});

test('Woche über die Zeitumstellung endet am Montag 0:00 Ortszeit', () => {
  const db = household(['A'], ['p1'], [['p1', {A:T}, '2026-03-29T23:30'], ['p1', {A:T}, '2026-03-30T00:00']]);
  const w = week(db, {}, at('2026-03-23T00:00'));
  assert.deepEqual([w.meals, w.end, (w.end - w.start) / 36e5], [1, at('2026-03-30T00:00'), 167]);
});

test('Rückblick: Vorwoche von Montag bis Mittwoch, ab 5 Mahlzeiten, bis zum Schließen', () => {
  const shown = (when, prefs = {}) => review(WEEK, prefs, at(when))?.meals ?? null;
  assert.deepEqual(['2026-06-01T00:00', '2026-06-03T23:59', '2026-06-04T00:00', '2026-05-31T12:00'].map(t => shown(t)), [8, 8, null, null]);
  assert.equal(shown('2026-06-02T12:00', {closedWeek:'2026-05-25'}), null);
  assert.equal(shown('2026-06-02T12:00', {closedWeek:'2026-05-18'}), 8);
  assert.equal(review(WEEK, {}, at('2026-06-09T12:00')), null, 'nur 2 Mahlzeiten in der Vorwoche');
});

test('Meilensteine: alle Mahlzeiten und probierte Sorten', () => {
  const products = Array.from({length:10}, (_, i) => 'p' + i);
  const db = household(['A'], products, [...Array.from({length:48}, (_, i) => ['p' + i % 10, {A:null}, i]), [null, {A:null}, 1], ['weg', {A:null}, 1]]);
  assert.deepEqual(milestones(db), {meals:50, sorts:10, reached:['meals:50', 'sorts:10']});
  db.servings.pop();
  assert.deepEqual(milestones(db).reached, ['sorts:10']);
});
