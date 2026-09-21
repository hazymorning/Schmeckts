#!/usr/bin/env python3
"""Storage of the Android app: files in app storage, written atomically, a crash while saving, a corrupted file.
Usage: python3 tests/storage_test.py"""
import json
from common import SAVED, check, real_errors, run_tests, seeded, started, state


async def test_files(browser, url):
    print('storage: files, crash, corrupted file')
    ctx, pg, errors = await seeded(browser, url, {'db': SAVED, 'prefs': {'theme': 'dark', 'name': 'Anna', 'mode': 'lokal'}}, native=True)
    check(await state(pg, "db.servings.length + '|' + prefs.name + '|' + prefs.theme") == '3|Anna|dark', 'start: data and settings from the files')
    check(await state(pg, "Object.values(state.clocks.servings).every(c => c._del && c.productId && c['pets.lxpet00001'])"),
          'records without clocks get some, for the later sync')
    await pg.evaluate("import('./js/store.js').then(m => { m.db.pets[0].name = 'Minka I'; m.save(); return m.flush(); })")
    writes = [c for c in await pg.evaluate('window.__calls') if c[0] in ('writeFile', 'rename') and 'db.json' in json.dumps(c[1])]
    check(writes[-2:] == [['writeFile', {'path': 'db.json.tmp', 'directory': 'DATA'}], ['rename', {'from': 'db.json.tmp', 'to': 'db.json'}]],
          'written atomically: the temporary file first, then the rename')
    check(await pg.evaluate("localStorage.getItem('schmeckts-v3') === null"), 'in the app nothing sits in localStorage')
    sent = await pg.evaluate("""import('./js/store.js').then(m => { const t = String(Date.now()).padStart(13, '0') + '-0000-fremd';
      m.merge([{c: 'pets', r: 'lxpet00001', f: {'zukunft.k1': {v: 'x', t}}}]);
      m.db.pets[0].name = 'Minka II.'; m.save();
      return m.queue.filter(x => x.r === 'lxpet00001').flatMap(x => Object.keys(x.f)); })""")
    check(sent == ['name'], f'entries of a map this device does not know (a newer version) are not deleted household-wide by the next save ({sent})')
    await pg.evaluate("""localStorage.setItem('__fs:queue.json', JSON.stringify([{id: 'crashtest00000001', c: 'pets', r: 'lxpet00001',
      t: '9999999999998-0000-absturz', f: {name: 'Minka II'}}]))""")
    await pg.reload(); await started(pg)
    check(await state(pg, 'db.pets[0].name') == 'Minka II', 'a crash between queue and data: the next start replays the change')
    await pg.evaluate("import('./js/store.js').then(m => m.flush())")
    check(await pg.evaluate("JSON.parse(localStorage.getItem('__fs:db.json')).pets[0].name === 'Minka II' && localStorage.getItem('__fs:queue.json') === '[]'"),
          'afterwards it is in db.json, and without a server the queue is empty again')
    await pg.evaluate("localStorage.setItem('__fs:db.json', '{kaputt')")
    await pg.reload(); await started(pg)
    aside = await pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('__fs:db.corrupt-'))")
    check(len(aside) == 1 and await pg.evaluate(f"localStorage.getItem('{aside[0]}')") == '{kaputt', 'a corrupted db.json is set aside, nothing is overwritten')
    check(await state(pg, "Object.keys(state.clocks.pets).length === 0 && state.epoch === ''"), 'without data the clocks do not count either, and the next sync is a full one')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


run_tests({'files': test_files})
