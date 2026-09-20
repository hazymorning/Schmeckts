#!/usr/bin/env python3
"""Speicher der Android-App: Dateien im App-Speicher, atomar geschrieben, Absturz beim Speichern, beschädigte Datei.
Aufruf: python3 tests/storage_test.py"""
import json
from common import SAVED, check, real_errors, run_tests, seeded, started, state


async def test_files(browser, url):
    print('Speicher: Dateien, Absturz, beschädigte Datei')
    ctx, pg, errors = await seeded(browser, url, {'db': SAVED, 'prefs': {'theme': 'dark', 'name': 'Anna', 'mode': 'lokal'}}, native=True)
    check(await state(pg, "db.servings.length + '|' + prefs.name + '|' + prefs.theme") == '3|Anna|dark', 'Start: Daten und Einstellungen aus den Dateien')
    check(await state(pg, "Object.values(state.clocks.servings).every(c => c._del && c.productId && c['pets.lxpet00001'])"),
          'Datensätze ohne Uhren bekommen welche, für den späteren Abgleich')
    await pg.evaluate("import('./js/store.js').then(m => { m.db.pets[0].name = 'Minka I'; m.save(); return m.flush(); })")
    writes = [c for c in await pg.evaluate('window.__calls') if c[0] in ('writeFile', 'rename') and 'db.json' in json.dumps(c[1])]
    check(writes[-2:] == [['writeFile', {'path': 'db.json.tmp', 'directory': 'DATA'}], ['rename', {'from': 'db.json.tmp', 'to': 'db.json'}]],
          'atomar geschrieben: erst die temporäre Datei, dann umbenennen')
    check(await pg.evaluate("localStorage.getItem('schmeckts-v3') === null"), 'in der App liegt nichts in localStorage')
    sent = await pg.evaluate("""import('./js/store.js').then(m => { const t = String(Date.now()).padStart(13, '0') + '-0000-fremd';
      m.merge([{c: 'pets', r: 'lxpet00001', f: {'zukunft.k1': {v: 'x', t}}}]);
      m.db.pets[0].name = 'Minka II.'; m.save();
      return m.queue.filter(x => x.r === 'lxpet00001').flatMap(x => Object.keys(x.f)); })""")
    check(sent == ['name'], f'Einträge einer Karte, die dieses Gerät nicht kennt (neuere Version), löscht das nächste Speichern nicht im Haushalt ({sent})')
    await pg.evaluate("""localStorage.setItem('__fs:queue.json', JSON.stringify([{id: 'crashtest00000001', c: 'pets', r: 'lxpet00001',
      t: '9999999999998-0000-absturz', f: {name: 'Minka II'}}]))""")
    await pg.reload(); await started(pg)
    check(await state(pg, 'db.pets[0].name') == 'Minka II', 'Absturz zwischen Warteschlange und Daten: der Start spielt die Änderung nach')
    await pg.evaluate("import('./js/store.js').then(m => m.flush())")
    check(await pg.evaluate("JSON.parse(localStorage.getItem('__fs:db.json')).pets[0].name === 'Minka II' && localStorage.getItem('__fs:queue.json') === '[]'"),
          'danach steht sie in db.json, ohne Server ist die Warteschlange wieder leer')
    await pg.evaluate("localStorage.setItem('__fs:db.json', '{kaputt')")
    await pg.reload(); await started(pg)
    aside = await pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('__fs:db.defekt-'))")
    check(len(aside) == 1 and await pg.evaluate(f"localStorage.getItem('{aside[0]}')") == '{kaputt', 'beschädigte db.json liegt beiseite, nichts wird überschrieben')
    check(await state(pg, "Object.keys(state.clocks.pets).length === 0 && state.epoch === ''"), 'ohne Daten gelten auch die Uhren nicht, der nächste Abgleich ist vollständig')
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
    await ctx.close()


run_tests({'dateien': test_files})
