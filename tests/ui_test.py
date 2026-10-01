#!/usr/bin/env python3
"""Flows and interface of the app in Chromium, without a server, with simulated Android plugins.
Usage: python3 tests/ui_test.py [name …] [--shots]   (--shots leaves screenshots in dist/test/)"""

import asyncio
import base64
import json
import re
import time
import xml.etree.ElementTree as ET

from common import (
    BIG_TEXT,
    NATIVE,
    PACK,
    PACK_LARGE,
    ROOT,
    SAVED,
    SHEBA,
    UPC,
    check,
    contrast,
    debounced,
    fixed_clock,
    idle,
    make_pictures,
    open_page,
    phone,
    real_errors,
    run_tests,
    seeded,
    SHIFTS,
    shot,
    started,
    state,
    until,
)


async def settings(pg, page=None, wait=idle):
    """Opens the settings and, with `page`, its sub-page of that name."""
    await pg.click('[data-action=open-settings]')
    await wait(pg)
    if page:
        await settings_page(pg, page, wait)


async def settings_page(pg, page, wait=idle):
    await pg.click(f'#sheet [data-action=settings-page][data-v={page}]')
    await wait(pg)


async def settings_back(pg, wait=idle):
    """One level back. A page has no X, so on the overview the same arrow leads out to the home page."""
    await pg.click('#sheet [data-action=settings-back]')
    await wait(pg)


async def test_tour(browser, url, scheme='light'):
    print(f'tour ({scheme})')
    ctx = await phone(browser, scheme)
    pg, errors = await open_page(ctx, url)
    await shot(pg, f'{scheme}-welcome')
    await pg.click('[data-action=demo]')
    await idle(pg)
    check(await state(pg, 'db.servings.length') > 10, 'sample data loaded')
    check(await pg.locator('#syncChip').is_hidden(), 'without a server there is no sync notice at the top')
    await shot(pg, f'{scheme}-home')
    await pg.click('#fab')
    await idle(pg)
    await shot(pg, f'{scheme}-feeding')
    await pg.click('[data-action=scan]')
    await idle(pg)  # in the browser: a prompt, cancelled here
    check(
        await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta-row [data-action=scan]').count() == 1,
        'feeding sheet with „Barcode“ and „Foto“; cancelling stays in the sheet',
    )
    before = await state(pg, 'db.servings.length')
    await pg.click('.plist [data-action=serve]')
    await idle(pg)
    check(await state(pg, 'db.servings.length') == before + 1, 'a known variety served')
    await pg.click('.pend [data-action=rate][data-r=gut]', force=True)  # the level's button takes no pointer: the click lands on the track there
    await idle(pg)
    check(await state(pg, 'Object.values(db.servings[0].pets)[0].r') == 'gut', 'rated with one tap')
    heads = await pg.eval_on_selector_all('#home > section', 'l => l.map(s => s.classList.contains("card") ? s.querySelector("h2").innerText : "-")')
    hint = [h for h in heads if h in ('Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    check(
        heads == ['Mau', 'Wie war’s?'] + hint + ['Verlauf', 'Einkaufen', 'Vorlieben'] and len(hint) == 1,
        f'cards in a fixed order, the overview first: {heads}',
    )
    check(
        await pg.locator('.cal').count() == 1
        and await pg.locator('[data-sec=hist] .tl-day').count() >= 1
        and await pg.locator('[data-sec=shop] .shop li').count() == 3,
        'the history visible at once, three varieties to buy again',
    )
    await pg.click('[data-sec=shop] [data-action=open-shop]')
    await idle(pg)
    check(await pg.locator('#sheet .shop li').count() == 3, '„Einkaufsliste öffnen“: the page, with what stays in the bowl folded away')
    await shot(pg, f'{scheme}-shopping')
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    await pg.click('[data-sec=profile] [data-action=open-profile]')
    await idle(pg)
    check(await pg.locator('#sheet .likes li').count() >= 4, '„Alle Vorlieben“: the page with every comparison')
    await shot(pg, f'{scheme}-likes')
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    current = await pg.evaluate(CURRENT)
    shown = await pg.eval_on_selector_all('[data-sec=hist] .tl-item', 'l => l.map(b => b.dataset.id)')
    check(shown == current and len(shown) >= 1, f'the history shows the meals of the current day ({len(shown)})')
    await shot(pg, f'{scheme}-unfolded')
    await settings(pg)
    other = 'dark' if scheme == 'light' else 'light'
    await pg.click(f'[data-action=theme][data-v={other}]')
    await idle(pg)
    bg = await pg.evaluate('getComputedStyle(document.documentElement).backgroundColor')
    meta = await pg.eval_on_selector('meta[name=theme-color]', 'm => m.content')
    check(bg == meta and await pg.get_attribute('html', 'data-theme') == other, f'theme switched: the background and the browser bar follow ({meta})')
    await shot(pg, f'{scheme}-settings')
    await settings_page(pg, 'house')
    rows = await pg.eval_on_selector_all('#serverBox .btn, #serverBox input', 'l => l.map(e => e.innerText?.trim() || e.id)')
    check(
        rows == ['Mit Haushalt verbinden'] and await pg.locator('#f-code, #f-server').count() == 0,
        f'settings, page „Haushalt“ in mode `lokal`: nothing but the way into a household ({rows})',
    )
    await shot(pg, f'{scheme}-settings-house')
    await settings_back(pg)
    await settings_back(pg)
    await pg.click('[data-sec=shop] [data-action=open-product]')
    await idle(pg)
    check(await pg.locator('.prod-card, .sh-head').count() > 0, 'the food sheet opens')
    await pg.click('[data-action=close]')
    await idle(pg)
    await pg.click('.tl [data-action=open-serving]')
    await idle(pg)
    await pg.click('[data-action=close]')
    await idle(pg)
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_flow(browser, url):
    print('flows in the Android app (plugins simulated)')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=set-species][data-v=Hund]')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await settings(pg)  # with one pet there is no pet bar
    await pg.click('#sheet [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Tiger')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    check(await pg.inner_text('#sheet .page-title') == 'Einstellungen', 'saving a pet leads back to the overview')
    await settings_back(pg)
    check(await state(pg, 'db.pets.length') == 2, 'two pets created')
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await idle(pg)
    check(
        await state(pg, "db.servings[0].status + '|' + db.servings[0].error") == 'noserver|undefined'
        and await pg.locator('#sheet #f-brand').count() == 1,
        'a photo in mode `lokal`: saved, „Futter benennen“ opens straight away, no call to Anthropic',
    )
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs in Soße')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    rates = pg.locator('#sheet .pet-rate')
    await rates.nth(0).locator('[data-r=gut]').click(force=True)
    await idle(pg)
    await rates.nth(1).locator('[data-r=sosse]').click(force=True)
    await idle(pg)
    check(await state(pg, 'Object.values(db.servings[0].pets).map(x => x.r).join()') == 'gut,sosse', 'both pets rated')
    check(await state(pg, "!('photo' in db.servings[0]) && !('status' in db.servings[0])"), 'after naming: photo and status tidied up')
    await pg.click('.tl [data-action=open-serving]')
    await idle(pg)
    await pg.click('[data-action=delete-serving]')
    await idle(pg)
    check(await state(pg, 'db.servings.length') == 0, 'meal deleted')
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    check(await state(pg, "db.servings.length + '|' + db.products.length") == '1|1', 'undo brings it back')
    await pg.click('#fab')
    await idle(pg)
    await pg.evaluate('window.__back({canGoBack: true})')
    await idle(pg)
    check(not await pg.evaluate("document.getElementById('sheet').open"), 'the back button closes the sheet')
    await pg.evaluate('window.__back({canGoBack: false})')
    await idle(pg)
    check(['minimize', None] in await pg.evaluate('window.__calls'), 'back on the home page: the app goes to the background')
    await settings(pg)
    check('Version 9.9.9' in await pg.inner_text('.foot'), 'the version number from the app')
    await settings_page(pg, 'backup')
    await pg.click('[data-action=export]')
    await idle(pg)
    calls = await pg.evaluate('window.__calls')
    names = [c[0] for c in calls]
    check(any(c[0] == 'writeFile' and c[1]['directory'] == 'CACHE' for c in calls) and 'share' in names, 'backup through a file and the share menu')
    check('setStyle' in names, 'the status bar follows the theme')
    await pg.evaluate("import('./js/logic/products.js').then(m => m.shareShopping())")
    await idle(pg)
    listed = [c[1] for c in await pg.evaluate('window.__calls') if c[0] == 'share' and c[1].get('text')]
    check(
        len(listed) == 1
        and listed[0]['title'].startswith('Einkaufen für ')
        and listed[0]['text'].startswith(listed[0]['title'])
        and 'files' not in listed[0],
        f'the shopping list in the app through the share menu (Share plugin) as text ({listed[0]["title"] if listed else listed})',
    )
    styles = [c[1]['style'] for c in calls if c[0] == 'impact']
    check({'LIGHT', 'MEDIUM', 'HEAVY'} <= set(styles), f'haptics graded: selection, success, deletion ({sorted(set(styles))})')
    await settings_back(pg)
    await settings_back(pg)
    # Shortcuts and deep links while the app is running
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://feed'})")
    await pg.wait_for_selector('#sheet .cta.primary')  # the deep link closes the open sheet first, which takes a moment
    await idle(pg)
    check(
        await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta.primary').count() == 1,
        'schmeckts://feed opens the feeding sheet',
    )
    shots = await pg.evaluate("window.__calls.filter(c => c[0] === 'capture').length")
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})")
    await pg.wait_for_function(f"window.__calls.filter(c => c[0] === 'capture').length > {shots}")
    await idle(pg)
    shot_photo = [
        ['capture', None] in await pg.evaluate('window.__calls'),
        await pg.evaluate("document.getElementById('sheet').open"),
        await pg.locator('#sheet button.cta[data-action=photo]').count(),
    ]
    check(
        shot_photo == [True, True, 1],
        f'schmeckts://photo: the camera through the plugin; cancelling leaves the feeding sheet open ({shot_photo})',
    )
    await pg.evaluate(f'window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}')
    before = await state(pg, 'db.servings.length')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})")
    await until(pg, f'db.servings.length === {before + 1}')
    await idle(pg)
    check(
        await state(pg, 'db.servings.length') == before + 1
        and await state(pg, "db.servings[0].status === 'noserver' && !!db.servings[0].thumb")
        and await pg.locator('#sheet #f-brand').count() == 1,
        'schmeckts://photo with a photo: served and stored as an entry, and in mode `lokal` straight on to naming',
    )
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    check(
        await state(pg, 'db.servings.length') == before and not await pg.evaluate("document.getElementById('sheet').open"),
        'and gone again through undo, with the sheet closing',
    )
    # Storage: files in app storage, atomically (.tmp first, then rename), nothing left in localStorage
    await pg.evaluate("import('./js/store.js').then(m => m.flush())")
    await pg.reload()
    await started(pg)
    check(await state(pg, "db.pets.length + '|' + db.servings.length") == '2|1', 'restart: the data comes from the files')
    # A cold start through a deep link: Capacitor holds the event back until the listener registers
    await pg.evaluate("sessionStorage.setItem('__launchUrl', 'schmeckts://feed')")
    await pg.reload()
    await started(pg)
    check(
        await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta.primary').count() == 1,
        'a cold start with schmeckts://feed opens the feeding sheet straight away',
    )
    await pg.evaluate("sessionStorage.removeItem('__launchUrl'); window.__back({canGoBack: true})")
    await idle(pg)
    check(not await pg.evaluate("document.getElementById('sheet').open"), 'back closes it again')
    # A deletion from outside (as from the server): the filter jumps back
    await pg.evaluate("""import('./js/store.js').then(m => { m.prefs.activePet = m.db.pets[0].id;
      m.merge([{c: 'pets', r: m.db.pets[0].id, f: {_del: {v: true, t: '9999999999999-0000-anderes'}}}]); })""")
    await idle(pg)
    check(await state(pg, 'prefs.activePet') == 'all', 'the filter jumps to „Alle“ when the pet is deleted elsewhere')
    check(await state(pg, 'db.pets.length') == 1, 'a deletion from outside is taken over')
    await pg.evaluate("""import('./js/store.js').then(m => m.merge([{c: 'servings', r: m.db.servings[0].id,
      f: {['pets.' + m.db.pets[0].id]: {v: {r: 'super', at: 1}, t: '9999999999999-0001-anderes'}}}]))""")
    await idle(pg)
    await pg.evaluate("import('./js/views/home.js').then(m => m.renderHome())")
    check(not [e for e in errors if 'score' in e or 'label' in e], 'an unknown rating (a newer app version) does not crash anything')
    check(not real_errors(errors), 'no errors in the console' + (f': {errors}' if real_errors(errors) else ''))
    await ctx.close()


async def test_buying(browser, url):
    print('the manual „Kaufen“ setting in the food sheet, the pet filter, the quick picker')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await pg.evaluate("""import('./js/store.js').then(s => { const d = s.db, mau = d.pets[0], now = Date.now();
      d.pets.push({id: 'tigerpet01', name: 'Tiger', species: 'Katze', createdAt: now});
      const lachs = d.products.find(p => p.variety === 'Lachs in Soße');
      for (let i = 0; i < 2; i++) d.servings.unshift({id: 'tigerserv' + i, productId: lachs.id, servedAt: now - i * 36e5, pets: {tigerpet01: {r: 'schlecht', at: now}}});
      s.save(); return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    lachs = await state(pg, "db.products.find(p => p.variety === 'Lachs in Soße').id")
    held = f"""() => [...document.querySelectorAll('#sheet .sheet-body > .card')].map(c => [c.querySelector('h2').innerText,
      (b => b ? b.querySelector('.t-main small').innerText : null)(c.querySelector('[data-id="{lachs}"]'))]).filter(x => x[1] !== null)"""

    async def where():  # the card of „Einkaufen“ that holds Lachs, with what stands under its name, and the page's title
        # The page itself: with the Tiger filter nothing is to be bought, so the home page has no card leading there
        await pg.evaluate("import('./js/ui/sheet.js').then(m => m.openSheet({kind: 'shop'}))")
        await idle(pg)
        for key in ('nicht', 'unklar'):
            if await pg.locator(f'#sheet [data-action=fold][data-v={key}]').count():
                await pg.click(f'#sheet [data-action=fold][data-v={key}]')
                await idle(pg)
        out = [await pg.evaluate(held), await pg.inner_text('#sheet .page-title')]
        await pg.click('#sheet [data-action=settings-back]')
        await idle(pg)
        return out

    house = await where()
    await pg.click('[data-action=filter][data-id=tigerpet01]')
    await idle(pg)
    tiger = await where()
    await pg.click('[data-action=filter][data-id=all]')
    await idle(pg)
    check(
        house == [[['Nachkaufen', 'Sheba, nur für Mau']], 'Einkaufen für alle Tiere']
        and tiger == [[['Lieber nicht', 'Sheba']], 'Einkaufen für Tiger'],
        f'shopping: „Gemischt“ sits under „Nachkaufen“ with „nur für Mau“, and with the Tiger filter that pet\u2019s verdict applies ({house}, {tiger})',
    )
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{lachs}'}}))")
    await idle(pg)
    seg = await pg.eval_on_selector_all('#sheet .seg [data-action=buy]', 'l => l.map(b => [b.innerText.trim(), b.getAttribute("aria-pressed")])')
    lines = await pg.eval_on_selector(
        '#sheet .verdict',
        'v => [v.querySelector("p").innerText.replace(/\\s+/g, " ").trim(), ...[...v.querySelectorAll(".verdict-pet")].map(x => x.innerText.replace(/\\s+/g, " ").trim())]',
    )
    check(
        seg == [['Automatisch', 'true'], ['Immer kaufen', 'false'], ['Nicht kaufen', 'false']]
        and lines
        == ['Gemischt: Mau ja, Tiger nein', 'Mau: Nachkaufen 3 von 4 Mal gut gefressen', 'Tiger: Nicht mehr kaufen Beide Male kaum angerührt'],
        f'food sheet „Kaufen“: Automatisch · Immer kaufen · Nicht kaufen, the verdict below, one line per pet with its ratings in words ({lines})',
    )
    await shot(pg, 'food-buying')
    # Above the counters the variety's ratings as a strip, within the pet filter, the oldest on the left
    STRIP = f"""import('./js/store.js').then(async s => {{ const {{rateCls}} = await import('./js/smart.js'), el = document.querySelector('#sheet .strip');
      const want = s.db.servings.filter(x => x.productId === '{lachs}' && x.servedAt <= Date.now()).sort((a, b) => a.servedAt - b.servedAt)
        .flatMap(x => Object.entries(x.pets).filter(([pid, v]) => v.r && (s.prefs.activePet === 'all' || pid === s.prefs.activePet)).map(([, v]) => rateCls(v.r)));
      return [[...el.querySelectorAll('i')].map(i => i.className), want, el.nextElementSibling.classList.contains('tally'), el.getAttribute('aria-label')]; }})"""
    everyone = await pg.evaluate(STRIP)
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.click('[data-action=filter][data-id=tigerpet01]')
    await idle(pg)
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{lachs}'}}))")
    await idle(pg)
    tiger_strip = await pg.evaluate(STRIP)
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.click('[data-action=filter][data-id=all]')
    await idle(pg)
    check(
        everyone[0] == everyone[1]
        and len(everyone[0]) == 6
        and everyone[0][-2:] == ['r-bad', 'r-bad']
        and everyone[2:] == [True, 'Mal so, mal so: 3× gut gefressen, 2× kaum angerührt, 1× halb gegessen']
        and tiger_strip == [['r-bad', 'r-bad'], ['r-bad', 'r-bad'], True, 'Beide Male kaum angerührt'],
        f'food sheet: above the counters a strip of the ratings within the filter, the oldest on the left, and in words what they say ({everyone}, {tiger_strip})',
    )
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{lachs}'}}))")
    await idle(pg)
    await pg.click('#sheet [data-action=buy][data-v=nicht]')
    await idle(pg)
    check(
        await state(pg, f"db.products.find(p => p.id === '{lachs}').kaufen") == 'nicht'
        and await pg.get_attribute('#sheet [data-action=buy][data-v=nicht]', 'aria-pressed') == 'true',
        '„Nicht kaufen“: stored and selected',
    )
    await pg.click('[data-action=close]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    check(
        await pg.locator(f'#sheet .plist [data-action=serve][data-id="{lachs}"]').count() == 0,
        'feeding: varieties that are no longer bought are absent from the quick picker',
    )
    await pg.click('[data-action=close]')
    await idle(pg)
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{lachs}'}}))")
    await idle(pg)
    await pg.click('#sheet [data-action=buy][data-v=auto]')
    await idle(pg)
    check(await state(pg, f"!('kaufen' in db.products.find(p => p.id === '{lachs}'))"), '„Automatisch“: the field is dropped')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


# One pet and one variety with twelve ratings over the last twelve days, the oldest five left standing: the verdict
# rests on the newest eight, which is what the words and the strip say
def twelve_rated():
    now = int(time.time() * 1000)
    levels = ['schlecht'] * 5 + ['gut'] * 3 + ['top'] * 4
    return {
        'version': 3,
        'pets': [{'id': 'lxpet00001', 'name': 'Minka', 'species': 'Katze', 'photo': None, 'createdAt': 1}],
        'products': [{'id': 'lxprod0001', 'brand': 'Sheba', 'variety': 'Lachs', 'type': 'Nassfutter', 'codes': {}, 'createdAt': 1}],
        'servings': [
            {
                'id': f'lxserv00{i:02d}',
                'productId': 'lxprod0001',
                'servedAt': now - (12 - i) * 864e5,
                'note': '',
                'pets': {'lxpet00001': {'r': r, 'at': now}},
            }
            for i, r in enumerate(levels)
        ],
    }


async def test_window(browser, url):
    print('the verdict rests on the newest eight ratings: the words say „von 8 Mal“ and the strip shows those eight with a „+“')
    ctx, pg, errors = await seeded(browser, url, {'db': twelve_rated(), 'prefs': {'mode': 'lokal'}})
    hint = await pg.eval_on_selector(
        '[data-sec=hint]', 'c => [c.querySelector("h2").innerText, c.querySelector(".say").innerText, c.querySelector(".why").innerText]'
    )
    check(
        hint == ['Neuer Liebling', 'Lachs von Sheba kommt gut an.', '7 von 8 Mal gut gefressen'],
        f'home page: „Neuer Liebling“ on the newest eight, seven of them good, whatever the five older ones were ({hint})',
    )
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.openSheet({kind: 'product', id: 'lxprod0001'}))")
    await idle(pg)
    SHEET = """() => { const s = document.querySelector('#sheet .strip'), v = document.querySelector('#sheet .verdict p');
      return {plus: s.firstElementChild.tagName === 'B' && s.firstElementChild.innerText, dots: [...s.querySelectorAll('i')].map(i => i.className), label: s.getAttribute('aria-label'),
        verdict: v.innerText.replace(/\\s+/g, ' ').trim(), counts: [...document.querySelectorAll('#sheet .cnt')].map(c => [c.dataset.r || c.className.split(' ')[1], c.querySelector('b').innerText])}; }"""
    sheet = await pg.evaluate(SHEET)
    check(
        sheet['plus'] == '+'
        and sheet['dots'] == ['r-bad'] + ['r-good'] * 7
        and sheet['label'] == '7 von 8 Mal gut gefressen'
        and sheet['verdict'] == 'Nachkaufen 7 von 8 Mal gut gefressen'
        and [c[1] for c in sheet['counts']] == ['4', '3', '0', '0', '0', '1'],
        f'food sheet: the strip shows exactly the eight the verdict rests on, a „+“ says there are older ones, and the words and the counters read the same eight ({sheet})',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.click('[data-sec=shop] [data-action=open-shop]')
    await idle(pg)
    row = await pg.eval_on_selector(
        '#sheet .shop .row',
        'r => [r.querySelector(".strip b")?.innerText ?? null, r.querySelectorAll(".strip i").length, r.querySelector(".strip").getAttribute("aria-label")]',
    )
    check(row == ['+', 8, '7 von 8 Mal gut gefressen'], f'„Einkaufen“: the row\u2019s strip the same ({row})')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_cards(browser, url):
    print('home page: the hint, and the history always open')
    ctx = await phone(browser, touch=True, motion=True)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    # History: the calendar and the meals of the current day
    current = await pg.evaluate(CURRENT)
    shown = await pg.eval_on_selector_all('[data-sec=hist] .tl-item', 'l => l.map(b => b.dataset.id)')
    check(
        await pg.locator('[data-sec=hist] .cal').is_visible()
        and await pg.locator('[data-sec=hist] .tl-node').first.is_visible()
        and shown == current
        and await pg.locator('[data-sec=hist] .tl-day').count() == 1,
        f'history: the calendar and the meals of the current day ({len(shown)})',
    )
    # „Wie war’s?“: the label „Serviert“ over the time field, and who served at the right end of the same line, small
    # and muted, since the name is not for changing and the time is
    await pg.click('.tl [data-action=open-serving]')
    await idle(pg)
    label = await pg.eval_on_selector(
        '#sheet label[for=f-time]',
        """l => { const [a, b] = l.children, s = getComputedStyle(b), probe = document.createElement('i'); probe.style.color = 'var(--muted)'; l.append(probe);
          const muted = getComputedStyle(probe).color; probe.remove(), r = l.getBoundingClientRect();
          return [a.innerText, b.innerText, getComputedStyle(l).justifyContent, s.fontSize, s.fontWeight, s.color === muted, Math.round(r.right - b.getBoundingClientRect().right),
            l.nextElementSibling.querySelector('#f-time') !== null]; }""",
    )
    check(
        label[:2] == ['Serviert', 'von Anna'] and label[2:] == ['space-between', '14px', '400', True, 0, True],
        f'„Wie war’s?“: „Serviert“ over the time field, „von Anna“ small and muted at the right end of the label line ({label})',
    )
    await pg.click('[data-action=close]')
    await idle(pg)
    # Hint: at most one, with a sentence, a reason and its buttons. „Nicht mehr kaufen“ and „Immer kaufen“ set kaufen,
    # „Ausblenden“ is remembered per device.
    HINT = """c => ({title: c.querySelector('h2').innerText, btns: [...c.querySelectorAll('.btn-row button')].map(b => b.innerText),
      id: (c.querySelector('[data-action=hint-buy]') || {}).dataset?.id || c.querySelector('[data-action=hide-hint]').dataset.v.split(':')[1]})"""
    TITLES = {'stop': 'Nicht mehr kaufen?', 'sosse': 'Frisst meist nur die Soße', 'liebling': 'Neuer Liebling'}
    seen, ok = [], True
    for _ in range(12):
        first = await pg.evaluate("import('./js/derive.js').then(d => d.model().hints[0] || null)")
        if not first:
            break
        h = await pg.eval_on_selector('[data-sec=hint]', HINT)
        ok &= await pg.locator('[data-sec=hint]').count() == 1 and h['title'] == TITLES[first['kind']] and h['id'] == first['id']
        ok &= (
            h['btns']
            == {'stop': ['Nicht mehr kaufen', 'Ausblenden'], 'sosse': ['Ausblenden'], 'liebling': ['Immer kaufen', 'Ausblenden']}[first['kind']]
        )
        seen.append(first['kind'])
        if first['kind'] in ('stop', 'liebling') and seen.count(first['kind']) == 1:
            await pg.click('[data-sec=hint] [data-action=hint-buy]')
            await idle(pg)
            ok &= await state(pg, f"db.products.find(p => p.id === '{first['id']}').kaufen") == ('nicht' if first['kind'] == 'stop' else 'immer')
        else:
            await pg.click('[data-sec=hint] [data-action=hide-hint]')
            await idle(pg)
            ok &= await state(pg, f"prefs.hiddenHints.includes('{first['kind']}:{first['id']}')")
    check(
        ok
        and 'stop' in seen
        and 'liebling' in seen
        and seen == sorted(seen, key=['stop', 'sosse', 'liebling'].index)
        and await pg.locator('[data-sec=hint]').count() == 0,
        f'hint: always the one with the highest precedence, with its buttons; once settled or hidden the next one follows ({seen})',
    )
    # One rating: no „Vorlieben“ card while its page would be empty, no hint card without a hint
    await pg.evaluate("""import('./js/store.js').then(s => { s.db.servings.forEach(x => { for (const k in x.pets) x.pets[k].r = null; }); s.db.products.forEach(p => delete p.kaufen);
      s.db.servings[0].pets[Object.keys(s.db.servings[0].pets)[0]].r = 'gut'; s.save(); return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    check(await pg.locator('[data-sec=profile], [data-sec=hint]').count() == 0, 'one rating: nothing yet of what the pet likes, and no hint')
    # Calendar: a tap on a day before the day before yesterday shows the older days and jumps to them
    old = await pg.evaluate("""(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 2);
      const b = [...document.querySelectorAll('.cal .day.has')].find(x => new Date(x.dataset.day + 'T12:00').getTime() < d.getTime()); return b && b.dataset.day; })()""")
    await pg.click(f'.cal .day[data-day="{old}"]')
    await idle(pg)
    top = await pg.eval_on_selector(f'#d-{old}', 'd => [d.getBoundingClientRect().top, d.className, getComputedStyle(d).animationName, innerHeight]')
    check(
        0 <= top[0] < top[3] - 48 and top[1] == 'tl-day' and top[2] == 'none',
        f'a tap in the calendar on an older day: it appears in the history and is jumped to, without a glow ({old}, {top})',
    )
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


# „Einkaufen“ on the home page: the varieties in its rows, how many strips they carry, and its buttons as [text, action,
# class, with an icon, the last thing in the card]; None without the card
SHOP_HOME = """() => { const c = document.querySelector('[data-sec=shop]'); if (!c) return null;
  return {rows: [...c.querySelectorAll('.shop .row')].map(r => r.dataset.id), strips: c.querySelectorAll('.shop .row .strip').length,
    btns: [...c.querySelectorAll('button:not(.row)')].map(b => [b.innerText.trim(), b.dataset.action, b.className, !!b.querySelector('svg'), b === c.lastElementChild])}; }"""

# The „Einkaufen“ page, per card: its heading, its own line, the food types with the varieties under each, every row
# as [name, what stands under it, the dots of its strip, what the strip says, the pin], and its buttons as [text,
# action, expanded, with an icon]
SHOP_PAGE = """() => [...document.querySelectorAll('#sheet .sheet-body > .card')].map(c => { const text = e => (e ? e.innerText.replace(/\\s+/g, ' ').trim() : null);
  return {head: text(c.querySelector('h2')), say: text(c.querySelector('.say')), line: text(c.querySelector('.hint')),
    groups: [...c.querySelectorAll('.grp')].map(g => [g.innerText, [...g.nextElementSibling.querySelectorAll('.row')].map(r => r.dataset.id)]),
    rows: [...c.querySelectorAll('.shop .row')].map(r => [text(r.querySelector('.t-main b')), text(r.querySelector('.t-main small')),
      r.querySelectorAll('.strip i').length, r.querySelector('.strip')?.getAttribute('aria-label') ?? null, !!r.querySelector('.pin')]),
    btns: [...c.querySelectorAll('.btn, .card-btn')].map(b => [b.innerText.trim(), b.dataset.action, b.getAttribute('aria-expanded'), !!b.querySelector('svg')])}; })"""

# The varieties of the model by where they stand in „Einkaufen“
SHOP_GROUPS = """import('./js/derive.js').then(async d => { const s = await import('./js/smart.js'), m = d.model(), g = s.shopGroups(m), ids = l => l.map(e => e.id);
  return {ja: ids(g.nachkaufen), nein: ids(g.nicht), unklar: [...ids(g.geht), ...ids(g.neu)]}; })"""


async def test_shop(browser, url):
    print('„Einkaufen“: three rows on the home page, and the page with the food types, the folds and the list to share')
    ctx = await phone(browser, motion=True, permissions=['clipboard-read', 'clipboard-write'])
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    g = await pg.evaluate(SHOP_GROUPS)
    home = await pg.evaluate(SHOP_HOME)
    check(
        home['rows'] == g['ja'][:3]
        and home['strips'] == 3
        and home['btns'] == [['Einkaufsliste öffnen', 'open-shop', 'card-btn', True, True]]
        and await pg.locator('#home [data-action=share-list], #home [data-action=expand][data-v=shop]').count() == 0,
        f'home page: the first three to buy again, each with its strip, and „Einkaufsliste öffnen“ with the chevron; no fold and no sharing ({home})',
    )
    await pg.click('[data-sec=shop] [data-action=open-shop]')
    await idle(pg)
    page = await pg.evaluate(PAGE)
    cards = await pg.evaluate(SHOP_PAGE)
    names = {
        'Rind in Gelee': ['Felix', 3, 'Alle 3 Mal gut gefressen'],
        'Huhn in Gelee': ['Felix', 3, 'Alle 3 Mal gut gefressen'],
        'Lachs in Soße': ['Sheba', 4, '3 von 4 Mal gut gefressen'],
        'Rind Pastete': ['Gourmet', 3, '2 von 3 Mal kaum angerührt'],
        'Thunfisch in Soße': ['Whiskas', 3, '2 von 3 Mal nur die Soße geleckt'],
        'Geflügel in Soße': ['Kitekat', 3, '2 von 3 Mal nur die Soße geleckt'],
        'Käse': ['Dreamies', 2, 'Beide Male sofort verputzt'],
        'Pute Pastete': ['Animonda Carny', 2, 'Einmal fast leer, einmal halb gegessen'],
    }
    ids = await pg.evaluate('import("./js/store.js").then(s => Object.fromEntries(s.db.products.map(p => [p.id, p.variety])))')

    def rows(key):  # the rows of a group as SHOP_PAGE reads them, none set by hand
        return [[ids[i], *names[ids[i]], False] for i in g[key]]

    check(
        page[:3] == ['Einkaufen', True, True]
        and cards
        == [
            {
                'head': 'Nachkaufen',
                'say': None,
                'line': None,
                'groups': [['Nassfutter', g['ja']]],
                'rows': rows('ja'),
                'btns': [['Als Liste teilen', 'share-list', None, True]],
            },
            {
                'head': 'Lieber nicht',
                'say': '3 Sorten bleiben meist stehen.',
                'line': None,
                'groups': [],
                'rows': [],
                'btns': [['Anzeigen', 'fold', 'false', False]],
            },
            {
                'head': 'Noch unklar',
                'say': '2 Sorten sind noch unklar.',
                'line': None,
                'groups': [],
                'rows': [],
                'btns': [['Anzeigen', 'fold', 'false', False]],
            },
        ],
        f'a page of three cards: to buy again by food type, best first, each variety with its brand and its strip and „Als Liste teilen“ at the end; the rest folded to a line each ({page}, {cards})',
    )
    # Keyboard: Enter eases the fold open (--dur-step), the focus stays on the button, space folds it shut
    await pg.focus('#sheet [data-action=fold][data-v=nicht]')
    await pg.keyboard.press('Enter')
    anim = await pg.eval_on_selector(
        '#fold-nicht',
        'b => [b.classList.contains("animating"), getComputedStyle(b).transitionDuration, getComputedStyle(b).transitionTimingFunction]',
    )
    await idle(pg)
    open_ = (await pg.evaluate(SHOP_PAGE))[1]
    focus = await pg.evaluate('document.activeElement.dataset.v')
    check(
        anim == [True, '0.3s', 'cubic-bezier(0.22, 1, 0.36, 1)']
        and open_['rows'] == rows('nein')
        and open_['btns'] == [['Weniger', 'fold', 'true', False]]
        and focus == 'nicht',
        f'„Lieber nicht“ eases open: the clearest first, each with its strip, „Weniger“, and the focus stays ({anim}, {open_["rows"]}, {focus})',
    )
    await pg.keyboard.press(' ')
    await idle(pg)
    await pg.click('#sheet [data-action=fold][data-v=unklar]')
    await idle(pg)
    after = await pg.evaluate(SHOP_PAGE)
    check(
        after[1]['rows'] == [] and after[1]['btns'] == [['Anzeigen', 'fold', 'false', False]] and after[2]['rows'] == rows('unklar'),
        f'space folds it shut again, and „Noch unklar“ opens the same way ({after[2]["rows"]})',
    )
    # Sharing: only what to buy again, by food type
    await pg.click('#sheet [data-action=share-list]')
    await idle(pg)
    shared = await pg.evaluate('navigator.clipboard.readText()')
    want = 'Einkaufen für Mau\n\nNassfutter\n' + '\n'.join(f'- {names[ids[i]][0]} {ids[i]}' for i in g['ja'])
    check(
        shared == want and 'Liste kopiert' in await pg.inner_text('#toast') and 'Nicht' not in shared,
        f'„Als Liste teilen“: only what to buy again, under its food type; without a share menu to the clipboard ({shared!r})',
    )
    # Set by hand: a food type of its own, the pin, and one fewer to decide
    await pg.evaluate("""import('./js/store.js').then(async s => { s.db.products.find(p => p.variety === 'Käse').kaufen = 'immer'; s.save();
      (await import('./js/ui/sheet.js')).renderSheet(); })""")
    await idle(pg)
    kept = await pg.evaluate(SHOP_PAGE)
    kaese = next(i for i, v in ids.items() if v == 'Käse')
    check(
        kept[0]['groups'] == [['Nassfutter', g['ja']], ['Snack', [kaese]]]
        and kept[0]['rows'][-1] == ['Käse', 'Dreamies', 2, 'Beide Male sofort verputzt', True]
        and kept[2]['say'] == '1 Sorte ist noch unklar.'
        and kept[2]['rows'] == [['Pute Pastete', 'Animonda Carny', 2, 'Einmal fast leer, einmal halb gegessen', False]],
        f'„Immer kaufen“ set by hand: under its own food type with the pin, and the open fold stays open ({kept[0]["groups"]}, {kept[2]})',
    )
    await pg.click(f'#sheet [data-action=open-product][data-id="{kaese}"]')
    await idle(pg)
    check(
        await pg.evaluate("document.getElementById('sheet').dataset.kind") == 'product' and await pg.inner_text('#sheet .sh-head h2') == 'Käse',
        'a row opens the food sheet, which tells the ratings in words',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    # One rating: nothing to buy yet, so the home page has no card, while the page still says so; nothing rated: no
    # card either
    await pg.evaluate("""import('./js/store.js').then(s => { s.db.servings.forEach(x => { for (const k in x.pets) x.pets[k].r = null; }); s.db.products.forEach(p => delete p.kaufen);
      s.db.servings[0].pets[Object.keys(s.db.servings[0].pets)[0]].r = 'gut'; s.save(); return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    one = await pg.evaluate(SHOP_HOME)
    heads = await pg.eval_on_selector_all('#home > section.card', 'l => l.map(s => s.querySelector("h2").innerText)')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.openSheet({kind: 'shop'}))")
    await idle(pg)
    few = await pg.evaluate(SHOP_PAGE)
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    await pg.evaluate("""import('./js/store.js').then(s => { s.db.servings[0].pets[Object.keys(s.db.servings[0].pets)[0]].r = null; s.save();
      return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    none = await pg.evaluate(SHOP_HOME)
    check(
        one is None
        and 'Einkaufen' not in heads
        and 'Verlauf' in heads
        and [(c['head'], c['say'] or c['line']) for c in few]
        == [('Nachkaufen', 'Noch nichts zum Nachkaufen.'), ('Noch unklar', '1 Sorte ist noch unklar.')]
        and none is None,
        f'one rating: nothing to buy yet, so no „Einkaufen“ on the home page while the page says so; nothing rated: no card either ({heads}, {few}, {none})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


# The „Vorlieben“ page, per card: its heading, its one line, every comparison with its groups as [name, what stands
# under it, the dots of its strip, whether a „+“ leads them, what the strip says, „deutlich“], and the told lines as
# [what leads them, the sentence, what it rests on]
LIKES_PAGE = """() => [...document.querySelectorAll('#sheet .sheet-body > .card')].map(c => { const text = e => (e ? e.innerText.replace(/\\s+/g, ' ').trim() : null);
  return {head: text(c.querySelector('h2')), line: text(c.querySelector('.hint.card-line')),
    dims: [...c.querySelectorAll('.grp')].map(g => [g.innerText, [...g.nextElementSibling.querySelectorAll('.row')].map(r => [text(r.querySelector('.t-main b')),
      text(r.querySelector('.t-main small')), r.querySelectorAll('.strip i').length, !!r.querySelector('.strip b'), r.querySelector('.strip')?.getAttribute('aria-label') ?? null,
      text(r.querySelector('.badge'))])]),
    told: [...c.querySelectorAll('.told li')].map(li => { const why = li.querySelector('.why');
      return [li.firstElementChild.matches('.av') ? 'av' : li.querySelector('.lead svg') ? 'icon' : '?',
        [...why.parentElement.childNodes].filter(n => n !== why).map(n => n.textContent).join('').replace(/\\s+/g, ' ').trim(), text(why)]; })}; })"""

# „Vorlieben“ on the home page: its comparison's name, its rows as on the page, its told lines, its buttons
LIKES_HOME = """() => { const c = document.querySelector('[data-sec=profile]'); if (!c) return null; const text = e => e.innerText.replace(/\\s+/g, ' ').trim();
  return {label: [...c.querySelectorAll('.grp')].map(text), rows: [...c.querySelectorAll('.likes .row')].map(r => [text(r.querySelector('.t-main b')), text(r.querySelector('.t-main small')),
      r.querySelector('.badge') ? text(r.querySelector('.badge')) : null, r.querySelectorAll('.strip i').length]),
    told: [...c.querySelectorAll('.told li')].map(li => [li.firstElementChild.matches('.av') ? 'av' : 'icon', text(li.querySelector('span:last-child')).split('. ')[0]]),
    btns: [...c.querySelectorAll('button')].map(b => [text(b), b.dataset.action, b.className, !!b.querySelector('svg'), b === c.lastElementChild])}; }"""

# Two pets with a habit each and nothing to compare: the same brand and one variety per flavour. Their meals one a day,
# oldest first, as [variety, rating]: Minka leaves a variety served again shortly after, Tiger likes it better
LIKES_HOUSE = """([minka, tiger]) => import('./js/store.js').then(async s => { const d = s.defaults(), day = 864e5, now = Date.now();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}, {id: 'tiger00001', name: 'Tiger', species: 'Katze', createdAt: 2}];
  d.products = [['a', 'Lachs'], ['b', 'Huhn'], ['c', 'Rind'], ['d', 'Pute']].map(([id, variety]) => ({id: 'sorte' + id + '0001', brand: 'Sheba', variety, type: 'Nassfutter', codes: {}, createdAt: 1}));
  const meals = (pet, list, later) => list.map(([sort, r], i) => ({id: pet.slice(0, 5) + 'meal' + String(i).padStart(4, '0'), productId: 'sorte' + sort + '0001', note: '',
    servedAt: now - (list.length - i) * day + later, pets: {[pet]: {r, at: now}}}));
  d.servings = [...meals('minka00001', minka, 0), ...meals('tiger00001', tiger, 36e5)].sort((a, b) => b.servedAt - a.servedAt);
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


# One pet that met six varieties, the first rating of each the oldest and the later ones five days apart: new food goes
# down well at first and wears off. One variety per flavour and one brand, so there is nothing to compare.
NOVELTY_HOUSE = """() => import('./js/store.js').then(async s => { const d = s.defaults(), day = 864e5, hour = 36e5, now = Date.now(), T = 'top', X = 'schlecht';
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  const met = [['Lachs', [T, X, X, X]], ['Huhn', [T, X, X]], ['Rind', [T, T, X, X]], ['Pute', [T, T, X]], ['Ente', [T, T, T]], ['Lamm', [X, X, X, X]]];
  d.products = met.map(([variety], i) => ({id: 'sorte' + i + '00001', brand: 'Sheba', variety, type: 'Nassfutter', codes: {}, createdAt: 1}));
  d.servings = met.flatMap(([, rs], i) => rs.map((r, j) => ({id: 'meal' + i + j + '00001', productId: 'sorte' + i + '00001', note: '',
    servedAt: now - (100 - j * 5) * day - i * hour, pets: {minka00001: {r, at: now}}}))).sort((a, b) => b.servedAt - a.servedAt);
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


def turns(*meals):
    """Meals oldest first, as (variety, rating) each: four varieties taking turns, so that a meal has three others
    before it, and a variety served again right away, which is shortly after the same one"""
    return [[sort, r] for sort, r in meals]


async def test_profile(browser, url):
    print('„Vorlieben“: the clearest two rows on the home page, and the page with every comparison and the habits')
    ctx = await phone(browser, width=360, height=800)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    home = await pg.evaluate(LIKES_HOME)
    check(
        home
        == {
            'label': ['Konsistenz'],
            'rows': [['In Gelee', 'Alle 6 Mal gut gefressen', 'deutlich', 6], ['Pastete', '1 von 5 Mal gut gefressen', 'deutlich', 5]],
            'told': [],
            'btns': [['Alle Vorlieben', 'open-profile', 'card-btn', True, True]],
        },
        f'home page: the two ends of the clearest comparison under its name, both „deutlich“, and „Alle Vorlieben“ with the chevron ({home})',
    )
    await pg.click('[data-sec=profile] [data-action=open-profile]')
    await idle(pg)
    page, cards = await pg.evaluate(PAGE), await pg.evaluate(LIKES_PAGE)
    mixed = 'Mal so, mal so: '
    check(
        page[:3] == ['Vorlieben', True, True]
        and [c['head'] for c in cards] == ['Was ankommt', 'Gewohnheiten']
        and cards[0]['line'] is None
        and cards[0]['dims']
        == [
            [
                'Konsistenz',
                [
                    ['In Gelee', 'Alle 6 Mal gut gefressen', 6, False, 'Alle 6 Mal gut gefressen', 'deutlich'],
                    ['In Soße', '4 von 10 Mal gut gefressen', 8, True, mixed + '4× gut gefressen, 4× nur die Soße geleckt, 2× halb gegessen', None],
                    ['Pastete', '1 von 5 Mal gut gefressen', 5, False, mixed + '2× kaum angerührt, 2× halb gegessen, 1× fast leer', 'deutlich'],
                ],
            ],
            [
                'Geschmack',
                [
                    ['Huhn', '4 von 6 Mal gut gefressen', 6, False, '4 von 6 Mal gut gefressen', None],
                    ['Rind', '3 von 6 Mal gut gefressen', 6, False, mixed + '3× gut gefressen, 2× kaum angerührt, 1× halb gegessen', None],
                ],
            ],
        ],
        f'the page: each comparison under its name, its groups ranked with how often they went down well and the strip of their ratings, the ends of a clear one „deutlich“ ({page}, {cards[0]})',
    )
    check(
        cards[1]['told'][0]
        == [
            'icon',
            'Bei Geflügel in Soße und Thunfisch in Soße wird oft nur die Soße geleckt.',
            'Geflügel in Soße 2 von 3 Mal, Thunfisch in Soße 2 von 3 Mal',
        ]
        and all(t[1].startswith(('Mag Abwechslung', 'Gewohnheitstier', 'Neugierig', 'Braucht Anlauf')) for t in cards[1]['told'][1:]),
        f'„Gewohnheiten“: the sauce licked off, told as before ({cards[1]["told"]})',
    )
    check(
        await pg.locator('#sheet .likes button, #sheet .likes [data-action]').count() == 0,
        'the rows of a comparison are no buttons: there is nothing behind them yet',
    )
    newest = await pg.evaluate("""import('./js/derive.js').then(async d => { const s = await import('./js/smart.js'), m = d.model();
      const g = d.profileModel()[0].groups.find(x => x.key === 'In Soße'), all = s.ratingsIn(m, g.ids).keys.map(s.rateCls);
      const row = [...document.querySelectorAll('#sheet .likes .row')].find(r => r.querySelector('b').innerText === 'In Soße');
      return [all.length, [...row.querySelectorAll('.strip i')].map(i => i.className), all.slice(-8), row.querySelector('.strip').firstElementChild.innerText]; })""")
    check(
        newest[0] == 10 and newest[1] == newest[2] and newest[3] == '+',
        f'more than 8 ratings: a „+“ in front, then the newest 8, the newest on the right ({newest})',
    )
    await shot(pg, 'likes-360')
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)

    # Abwechslung, per pet with its picture under „Alle“, and nothing to compare: the home page shows the habits. Minka:
    # 15 meals after other varieties, 12 of them good, against 8 shortly after the same one, 3 of them good; and every
    # variety good the first time, 11 of the 19 later ratings. Tiger the other way round: 2 of 8 against 7 of 8, and
    # one variety of four good the first time, 8 of 12 later.
    T, X = 'top', 'schlecht'
    minka = turns(
        *[('a', T), ('a', X), ('b', T), ('b', X), ('c', T), ('c', T), ('d', T), ('d', X)],
        *[('a', X), ('a', T), ('b', T), ('b', X), ('c', T), ('c', T), ('d', T), ('d', X)],
        *[('a', T), ('b', T), ('c', T), ('d', X), ('a', T), ('b', T), ('c', X)],
    )
    tiger = turns(
        *[('a', X), ('a', T), ('b', X), ('b', T), ('c', X), ('c', T), ('d', T), ('d', T)],
        *[('a', X), ('a', T), ('b', T), ('b', T), ('c', X), ('c', X), ('d', X), ('d', T)],
    )
    await pg.evaluate(LIKES_HOUSE, [minka, tiger])
    await idle(pg)
    home = await pg.evaluate(LIKES_HOME)
    await pg.click('[data-sec=profile] [data-action=open-profile]')
    await idle(pg)
    both = await pg.evaluate(LIKES_PAGE)
    title = await pg.inner_text('#sheet .page-title')
    check(
        home['label'] == []
        and home['rows'] == []
        and home['told']
        == [
            ['av', 'Minka mag Abwechslung: kurz nach derselben Sorte bleibt öfter was übrig'],
            ['av', 'Tiger ist ein Gewohnheitstier: dieselbe Sorte kurz hintereinander kommt besser an'],
        ]
        and title == 'Vorlieben für alle Tiere'
        and both[0]
        == {'head': 'Was ankommt', 'line': 'Noch zu wenig bewertet. Nach ein paar Wochen steht hier, was dein Tier mag.', 'dims': [], 'told': []}
        and both[1]['told']
        == [
            [
                'av',
                'Minka mag Abwechslung: kurz nach derselben Sorte bleibt öfter was übrig.',
                'Kurz nach derselben Sorte 3 von 8 Mal gut gefressen, sonst 12 von 15.',
            ],
            [
                'av',
                'Tiger ist ein Gewohnheitstier: dieselbe Sorte kurz hintereinander kommt besser an.',
                'Kurz nach derselben Sorte 7 von 8 Mal gut gefressen, sonst 2 von 8.',
            ],
            [
                'av',
                'Minka ist neugierig: Neues kommt erst gut an, dann lässt es nach.',
                '4 von 4 Sorten beim ersten Mal gut gefressen, danach 11 von 19 Mal.',
            ],
            [
                'av',
                'Tiger braucht Anlauf: beim ersten Mal bleibt öfter was übrig als später.',
                '1 von 4 Sorten beim ersten Mal gut gefressen, danach 8 von 12 Mal.',
            ],
        ],
        f'Abwechslung and Neuheit: one line per pet with its picture, either way, in the order the home page shows the first two of; with nothing to compare, the home page shows the habits ({home}, {title}, {both})',
    )
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    await pg.click('[data-action=filter][data-id=tiger00001]')
    await idle(pg)
    await pg.click('[data-sec=profile] [data-action=open-profile]')
    await idle(pg)
    tiger_only = await pg.evaluate(LIKES_PAGE)
    title = await pg.inner_text('#sheet .page-title')
    check(
        title == 'Vorlieben für Tiger'
        and tiger_only[1]['told']
        == [
            [
                'icon',
                'Gewohnheitstier: dieselbe Sorte kurz hintereinander kommt besser an.',
                'Kurz nach derselben Sorte 7 von 8 Mal gut gefressen, sonst 2 von 8.',
            ],
            [
                'icon',
                'Braucht Anlauf: beim ersten Mal bleibt öfter was übrig als später.',
                '1 von 4 Sorten beim ersten Mal gut gefressen, danach 8 von 12 Mal.',
            ],
        ],
        f'with Tiger chosen: only Tiger, with the icon instead of a picture ({title}, {tiger_only[1]["told"]})',
    )
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    await pg.click('[data-action=filter][data-id=all]')
    await idle(pg)

    # Neuheit: a pet that finds new food great and lets it stand the next time
    await pg.evaluate(NOVELTY_HOUSE)
    await idle(pg)
    home = await pg.evaluate(LIKES_HOME)
    await pg.click('[data-sec=profile] [data-action=open-profile]')
    await idle(pg)
    novel = await pg.evaluate(LIKES_PAGE)
    check(
        home['told'] == [['icon', 'Neugierig: Neues kommt erst gut an, dann lässt es nach']]
        and novel[1]['told']
        == [['icon', 'Neugierig: Neues kommt erst gut an, dann lässt es nach.', '5 von 6 Sorten beim ersten Mal gut gefressen, danach 4 von 15 Mal.']]
        and await pg.eval_on_selector_all('#sheet .told .why b', 'l => l.map(b => b.innerText)') == ['5 von 6 Sorten', '4 von 15 Mal'],
        f'Neuheit: new food goes down well at first and wears off, told on the home page and on the page with the figures in bold ({home["told"]}, {novel[1]["told"]})',
    )
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)

    # Nothing rated: no card on the home page, and the page says so
    await pg.evaluate("""import('./js/store.js').then(s => { s.db.servings.forEach(x => { for (const k in x.pets) x.pets[k].r = null; }); s.save();
      return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    gone = await pg.evaluate(LIKES_HOME)
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.openSheet({kind: 'profile'}))")
    await idle(pg)
    empty = await pg.evaluate(LIKES_PAGE)
    check(
        gone is None
        and empty
        == [{'head': 'Was ankommt', 'line': 'Noch zu wenig bewertet. Nach ein paar Wochen steht hier, was dein Tier mag.', 'dims': [], 'told': []}],
        f'nothing rated: no card on the home page, and the page says what it will hold ({empty})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


# What does not fit on a page: every element of its cards (those given) whose content is wider than its box, unless it
# ends in „…“ by design, or that reaches past the right edge, as its class and text; and whether anything scrolls sideways
NARROW = """sel => { const body = document.getElementById('sheetBody');
  const wide = [...body.querySelectorAll(sel)].filter(e => e.getClientRects().length && !e.closest('svg') && getComputedStyle(e).display !== 'inline'
      && ((e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis') || e.getBoundingClientRect().right > innerWidth + 0.5))
    .map(e => `${e.className}: ${(e.innerText || '').slice(0, 30)}`);
  return {wide, sideways: document.documentElement.scrollWidth > innerWidth || body.scrollWidth > body.clientWidth}; }"""


async def test_narrow(browser, url):
    print('the new pages at 360 px, light and dark, at the usual and at a large system font')
    pages = (('report', ['details'], '.review *'), ('shop', ['nicht', 'unklar'], '.card *'), ('profile', [], '.card *'))
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme, width=360, height=760)
        pg, errors = await open_page(ctx, url, scheme)
        await pg.click('[data-action=demo]')
        await idle(pg)
        for scale in (1, 1.3):
            if scale != 1:
                await pg.evaluate(BIG_TEXT, scale)
                await idle(pg)
            seen = {}
            for kind, folds, sel in pages:
                await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: '{kind}'}}))")
                await idle(pg)
                for key in folds:
                    await pg.click(f'#sheet [data-action=fold][data-v={key}]')
                    await idle(pg)
                seen[kind] = await pg.evaluate(NARROW, sel)
                await shot(pg, f'narrow-{kind}-{scheme}-{int(scale * 100)}')
                await pg.click('#sheet [data-action=settings-back]')
                await idle(pg)
            home = await pg.evaluate(
                "[document.documentElement.scrollWidth > innerWidth, [...document.querySelectorAll('#home .card *')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).length]"
            )
            check(
                all(not x['wide'] and not x['sideways'] for x in seen.values()) and home == [False, 0],
                f'{scheme}, {int(scale * 100)} %: „Verlauf“, „Einkaufen“ and „Vorlieben“ unfolded, and the home page: nothing cut off, nothing scrolls sideways ({seen}, {home})',
            )
        check(not real_errors(errors), f'no errors in the console ({scheme}) {real_errors(errors)}')
        await ctx.close()


HOUSE = """([meals]) => import('./js/store.js').then(async s => { const at = t => new Date(t).getTime(), d = s.defaults();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}, {id: 'tiger00001', name: 'Tiger', species: 'Katze', createdAt: 2}];
  d.products = [['lachs', 'Sheba', 'Lachs in Soße'], ['huhn', 'Felix', 'Huhn in Gelee'], ['rind', 'Gourmet', 'Rind Pastete'], ['ente', 'Miamor', 'Ente', 'immer'], ['kaese', 'Dreamies', 'Käse', 'nicht'], ['pute', 'Animonda', 'Pute']]
    .map(([id, brand, variety, kaufen]) => ({id: id + '000001', brand, variety, type: 'Nassfutter', codes: {}, createdAt: 1, ...(kaufen ? {kaufen} : {})}));
  d.servings = meals.map(([pid, pets, when, by], i) => ({id: 'meal' + String(i).padStart(6, '0'), productId: pid && pid + '000001', servedAt: at(when), note: '', ...(by ? {by} : {}),
    pets: Object.fromEntries(Object.entries(pets).map(([k, r]) => [k === 'M' ? 'minka00001' : 'tiger00001', {r, at: r ? at(when) : null}]))}));
  d.servings.sort((a, b) => b.servedAt - a.servedAt);   // newest first, as the app keeps them
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


def house_meals():
    T, G, M, X = 'top', 'gut', 'mittel', 'schlecht'

    def day(d, h='08:00'):
        return f'2026-{d}T{h}'

    return (
        [['lachs', {'M': T}, day(f'05-{10 + i}'), 'Anna'] for i in range(3)]  # Lachs: Minka buys again
        + [['huhn', {'M': G, 'T': X}, day(f'05-{14 + i}'), 'Jonas'] for i in range(3)]  # Huhn: Minka yes, Tiger no = mixed
        + [['rind', {'T': X}, day(f'05-{18 + i}'), 'Anna'] for i in range(2)]  # Rind: stop buying
        + [['pute', {'M': G}, day('05-25'), 'Anna'], ['kaese', {'M': T}, day('05-26'), 'Anna']]
        + [
            ['pute', {'M': T}, day('06-01', '00:00'), 'Anna'],
            ['pute', {'M': T}, day('06-02'), 'Anna'],
            ['lachs', {'T': G}, day('06-03'), 'Jonas'],
            ['lachs', {'T': T}, day('06-04'), 'Jonas'],
            ['ente', {'M': M}, day('06-05'), 'Anna'],
            [None, {'M': None}, day('06-06'), 'Jonas'],
            ['huhn', {'M': G}, day('06-07', '23:59'), ''],
            ['lachs', {'M': T}, day('06-07', '12:00'), 'Anna'],
        ]
    )


# The rating slider as the page shows it: its stops (level, what a screen reader hears, centre from the track's start,
# size, pressed, the level's icon and its colour), the columns under them (the word, what the bowl looks like, centre,
# whether it is the one in colour, whether both texts fit the column), the track (width, height), the thumb (the stop
# it stands on, None without one, its size, whether it carries an icon and whether it is lifted), the height of the
# columns, the height of the whole and whether the page stays within the screen.
SLIDER = """slider => { const t = slider.querySelector('.slider-track').getBoundingClientRect(), thumb = slider.querySelector('.slider-thumb'),
    on = getComputedStyle(thumb).display !== 'none', names = slider.querySelector('.slider-names'), mid = r => Math.round((r.left + r.width / 2 - t.left) * 10) / 10;
  const stops = [...slider.querySelectorAll('.slider-track button')].map(e => { const r = e.getBoundingClientRect();
    return {r: e.dataset.r, label: e.getAttribute('aria-label'), x: mid(r), w: Math.round(r.width * 10) / 10, h: r.height, pressed: e.getAttribute('aria-pressed') === 'true',
      icon: !!e.querySelector('svg path'), colour: getComputedStyle(e).color}; });
  const words = [...slider.querySelectorAll('.slider-names > span')].map(e => { const r = e.getBoundingClientRect();
    return {text: e.querySelector('b').innerText, note: e.querySelector('small').innerText, x: mid(r), on: e.classList.contains('on'), colour: getComputedStyle(e).color,
      fits: [e, ...e.children].every(x => x.scrollWidth <= Math.ceil(r.width))}; });
  const d = thumb.getBoundingClientRect(), x = on && mid(d);
  return {stops, words, track: [Math.round(t.width), Math.round(t.height)],
    thumb: on ? stops.findIndex(s => Math.abs(s.x - x) < 1) : null, disc: on ? [d.width, !!thumb.querySelector('svg path')] : null,
    lifted: slider.classList.contains('pointing'), names: Math.round(names.getBoundingClientRect().height),
    height: Math.round(slider.getBoundingClientRect().height), page: document.documentElement.scrollWidth <= innerWidth}; }"""


def even(b):
    """The stops side by side on the track, as wide as each other and at least a small tap target, and every word
    centred under its stop, fitting its column"""
    stops, words = b['stops'], b['words']
    gaps = [y['x'] - x['x'] for x, y in zip(stops, stops[1:])]
    return (
        max(gaps) - min(gaps) < 0.6
        and min(x['w'] for x in stops) >= 44
        and all(x['h'] == 44 for x in stops)
        and len(words) == len(stops)
        and all(abs(w['x'] - x['x']) < 1 and w['fits'] for w, x in zip(words, stops))
    )


async def test_week(browser, url):
    print('home page: the rating slider, sharing the list, appetite')
    ctx = await phone(browser, motion=True, width=360, height=800, timezone_id='Europe/Berlin', permissions=['clipboard-read', 'clipboard-write'])
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-09T10:00:00+02:00')
    await pg.click('[data-action=demo]')
    await idle(pg)
    # The rating slider at 360 px, in the card and in the sheet: the six levels as buttons side by side on one track in
    # the scale's order, each with its icon in its colour and at least a small tap target, the level in one word
    # centred under each with what the bowl looks like under that, and for a screen reader its name and what the
    # bowl looks like; before a rating no thumb, so the slider is the track and the columns of words
    seconds = ['leer', 'leer', 'übrig', 'anfangs', 'Soße', 'nix']
    levels = [
        ['top', 'Sofort leer'],
        ['gut', 'Fast leer'],
        ['mittel', 'Halb gegessen'],
        ['eager', 'Nur anfangs'],
        ['sosse', 'Soße geleckt'],
        ['schlecht', 'Kaum angerührt'],
    ]
    for where, sel in (('card „Wie war’s?“', '.pend .slider'), ('sheet', '#sheet .slider')):
        if where == 'sheet':
            await pg.click('.pend-head')
            await idle(pg)
        b = await pg.eval_on_selector(sel, SLIDER)
        check(
            [[x['r'], x['label']] for x in b['stops']] == levels
            and [w['text'] for w in b['words']] == ['Alles', 'Fast', 'Hälfte', 'Nur', 'Nur', 'Fast']
            and [w['note'] for w in b['words']] == seconds
            and even(b)
            and all(x['icon'] and not x['pressed'] for x in b['stops'])
            and not any(w['on'] for w in b['words'])
            and b['track'][1] == 52
            and b['thumb'] is None
            and b['names'] > 15
            and b['height'] == 52 + 10 + b['names']
            and b['page'],
            f'{where}: six levels side by side on one track in the scale’s order, {b["stops"][0]["w"]} px each, a word and what the bowl looks like under each, no thumb yet, {b["height"]} px tall in all, nothing wider than 360 px',
        )
    await shot(pg, 'rating-360')
    await pg.click('[data-action=close]')
    await idle(pg)
    # A household: the home page keeps to what is current, with no card for the last week
    await pg.evaluate(HOUSE, [house_meals()])
    await idle(pg)
    heads = await pg.eval_on_selector_all('#home > section.card', 'l => l.map(s => s.querySelector("h2").innerText)')
    hint = [h for h in heads if h in ('Appetit', 'Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    check(
        len(hint) == 1 and heads[:4] == ['Minka und Tiger'] + hint + ['Verlauf', 'Einkaufen'],
        f'no card of its own for the last week on the home page ({heads})',
    )
    await pg.clock.set_fixed_time('2026-06-15T09:00:00+02:00')
    await pg.evaluate("""import('./js/store.js').then(async s => { for (let i = 0; i < 5; i++) s.db.servings.unshift({id: 'neuewoche' + i, productId: 'lachs000001', servedAt: new Date(2026, 5, 9 + i, 8).getTime(), note: '', by: 'Anna', pets: {minka00001: {r: 'top', at: 1}}});
      s.save(); (await import('./js/views/home.js')).renderHome(); })""")
    await idle(pg)
    # Sharing the shopping list: only on its page, what to buy again by food type, matching the pet filter
    await pg.click('[data-action=filter][data-id=all]')
    await idle(pg)
    check(await pg.locator('#home [data-action=share-list]').count() == 0, '„Als Liste teilen“ is not on the home page')
    await pg.click('[data-sec=shop] [data-action=open-shop]')
    await idle(pg)
    await shot(pg, 'shopping-share')
    await pg.click('#sheet [data-action=share-list]')
    await idle(pg)
    house = await pg.evaluate('navigator.clipboard.readText()')
    toast = await pg.inner_text('#toast')
    want = 'Einkaufen für Minka und Tiger\n\nNassfutter\n- Sheba Lachs in Soße\n- Animonda Pute\n- Miamor Ente\n- Felix Huhn in Gelee (nur für Minka)'
    check(
        house == want and 'Liste kopiert' in toast,
        f'the household list: what to buy again with „Gemischt“ (nur für …) and `immer` under its food type, nothing else; without a share menu it goes to the clipboard with a toast ({house!r})',
    )
    lists = await pg.evaluate("""import('./js/store.js').then(async s => { const d = await import('./js/derive.js'), out = [];
      for (const p of ['minka00001', 'tiger00001']) { s.prefs.activePet = p; out.push(d.shoppingList().text); } s.prefs.activePet = 'all'; return out; })""")
    check(
        lists
        == [
            'Einkaufen für Minka\n\nNassfutter\n- Sheba Lachs in Soße\n- Animonda Pute\n- Felix Huhn in Gelee\n- Miamor Ente',
            'Einkaufen für Tiger\n\nNassfutter\n- Miamor Ente',
        ],
        f'the list with a pet filter: that pet\u2019s verdicts ({lists})',
    )
    await pg.evaluate('navigator.share = o => { window.__shared = o; return Promise.resolve(); }')
    await pg.click('#sheet [data-action=share-list]')
    await idle(pg)
    shared = await pg.evaluate('window.__shared')
    check(
        shared and shared['text'] == want and shared['title'] == 'Einkaufen für Minka und Tiger',
        'in the browser with a share menu: navigator.share gets the title and the text',
    )
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    # The „Appetit“ hint in the hint card
    await pg.clock.set_fixed_time('2026-06-09T10:00:00+02:00')
    low = [['lachs', {'M': 'top'}, f'2026-05-{25 + i}T08:00', 'Anna'] for i in range(7)] + [
        ['lachs', {'M': 'top'}, '2026-06-01T08:00', 'Anna'],
        ['rind', {'M': 'mittel'}, '2026-06-07T18:00', 'Anna'],
        ['huhn', {'M': 'sosse'}, '2026-06-08T14:00', 'Anna'],
        ['rind', {'M': 'schlecht'}, '2026-06-09T07:00', 'Anna'],
    ]
    await pg.evaluate(HOUSE, [low])
    await idle(pg)
    HINT = """c => ({title: c.querySelector('h2').innerText, say: c.querySelector('.say').innerText, why: c.querySelector('.why').innerText, btns: [...c.querySelectorAll('.btn-row button')].map(b => [b.innerText, b.className, b.dataset.v])})"""
    h = await pg.eval_on_selector('[data-sec=hint]', HINT)
    check(
        await pg.locator('[data-sec=hint]').count() == 1
        and h
        == {
            'title': 'Appetit',
            'say': 'Minka frisst seit ein paar Tagen schlechter als sonst.',
            'why': 'Zuletzt 0 von 3 Mal gut gefressen, in den 30 Tagen davor alle 8 Mal.',
            'btns': [['Ausblenden', 'btn soft', 'appetit:minka00001:2026-06-09']],
        },
        f'the „Appetit“ hint has the highest precedence: a sentence, a reason, only „Ausblenden“ ({h})',
    )
    await shot(pg, 'hint-appetite')
    await pg.click('[data-sec=hint] [data-action=hide-hint]')
    await idle(pg)
    nxt = await pg.eval_on_selector('[data-sec=hint]', HINT)
    check(
        nxt['title'] != 'Appetit' and await state(pg, "prefs.hiddenHints.includes('appetit:minka00001:2026-06-09')"),
        f'the device remembers „Ausblenden“ and the next hint moves up ({nxt["title"]})',
    )
    check(not real_errors(errors), 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


SCALES_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now(), H = 36e5;
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['trocken', 'Josera', 'Trockenfutter'], ['snack', 'Dreamies', 'Snack']].map(([id, brand, type]) => ({id: id + '0001', brand, variety: '', type, codes: {}, createdAt: 1}));
  d.servings = [['trocken', null, 1], ['snack', null, 2], ['trocken', 'gut', 20], ['trocken', 'gern', 21], ['trocken', 'gern', 22], ['trocken', 'liegen', 23]]
    .map(([pid, r, ago], i) => ({id: 'meal00000' + i, productId: pid + '0001', servedAt: now - ago * H, note: '', pets: {minka00001: {r, at: r ? now - ago * H : null}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_scales(browser, url):
    print('rating per food type: the variety\u2019s scale, four levels at 360 px, a foreign level stays visible, counters in the food sheet')
    ctx = await phone(browser, width=360, height=800, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-10T23:30:00+02:00')  # all six meals on one day, so the home page shows them
    await pg.evaluate(SCALES_DB)
    await idle(pg)
    want = {
        'Trockenfutter': [
            ['gern', 'Gern gefressen'],
            ['normal', 'Normal gefressen'],
            ['wenig', 'Wenig gefressen'],
            ['liegen', 'Liegen gelassen'],
        ],
        'Snack': [
            ['verputzt', 'Sofort verputzt'],
            ['spaeter', 'Später gefressen'],
            ['angeknabbert', 'Nur angeknabbert'],
            ['unberuehrt', 'Nicht angerührt'],
        ],
    }
    words = {'Trockenfutter': ['Gern', 'Normal', 'Wenig', 'Liegen'], 'Snack': ['Sofort', 'Später', 'Nur', 'Nicht']}
    for i, (kind, levels) in enumerate(want.items()):
        b = await pg.locator('.pend .slider').nth(i).evaluate(SLIDER)
        check(
            [[x['r'], x['label']] for x in b['stops']] == levels and [w['text'] for w in b['words']] == words[kind] and even(b) and b['page'],
            f'{kind}: four levels of its own scale side by side, a word under each that fits its column, nothing clipped at 360 px ({[w["text"] for w in b["words"]]})',
        )
    await shot(pg, 'rating-scales-360')
    # A stored level from another scale: a badge above the slider with its own wording and icon, no thumb, none of the
    # four chosen; one tap replaces it
    await pg.click('.tl-item[data-id=meal000002]')
    await idle(pg)
    b = await pg.eval_on_selector('#sheet .slider', SLIDER)
    badge = await pg.evaluate(
        "[document.querySelector('#sheet .pet-rate > .badge')?.innerText.trim(), !!document.querySelector('#sheet .pet-rate > .badge svg')]"
    )
    old = [
        badge,
        len(b['stops']),
        [x['r'] for x in b['stops'] if x['pressed']],
        b['thumb'],
        [w['note'] for w in b['words']],
        [w['text'] for w in b['words'] if w['on']],
    ]
    check(
        old == [['Fast leer', True], 4, [], None, ['gefressen', 'gefressen', 'gefressen', 'gelassen'], []],
        f'a level outside the scale sits above the slider as a badge with its own wording and icon, without a thumb, none of the four is chosen, and every column ends in the second word of its level ({old})',
    )
    card = await pg.evaluate("[...document.querySelectorAll('#sheet .prod-card small, #sheet .prod-card b')].map(e => e.innerText)")
    check(
        card == ['Josera', 'Trockenfutter'],
        f'the sheet names the food type, which is what decides the scale, instead of the time that is in the field below ({card})',
    )
    # Counters in the food sheet: the scale's levels, other levels that occur after them
    await pg.click('[data-action=close]')
    await idle(pg)
    await pg.click('[data-action=open-product][data-id=trocken0001]')
    await idle(pg)
    cnt = await pg.eval_on_selector_all(
        '#sheet .cnt',
        "l => l.map(c => [c.getAttribute('aria-label').split(':')[0], +c.querySelector('b').innerText, c.getBoundingClientRect().right <= innerWidth])",
    )
    check(
        cnt
        == [
            ['Gern gefressen', 2, True],
            ['Normal gefressen', 0, True],
            ['Wenig gefressen', 0, True],
            ['Liegen gelassen', 1, True],
            ['Fast leer', 1, True],
        ],
        f'the food sheet counts the scale\u2019s levels, other levels that occur after them, each with its name for a screen reader ({cnt})',
    )
    await pg.click('[data-action=close]')
    await idle(pg)
    await pg.click('.tl-item[data-id=meal000002]')
    await idle(pg)
    await pg.click('#sheet [data-r=liegen]', force=True)
    await idle(pg)
    r = await state(pg, "db.servings.find(x => x.id === 'meal000002').pets.minka00001.r")
    b = await pg.eval_on_selector('#sheet .slider', SLIDER)
    now = [
        [x['r'] for x in b['stops'] if x['pressed']],
        b['thumb'],
        b['disc'],
        [[w['text'], w['note']] for w in b['words'] if w['on']],
        b['page'],
    ]
    check(
        r == 'liegen' and now == [['liegen'], 3, [44, True], [['Liegen', 'gelassen']], True],
        f'one tap on a level replaces the old one: the thumb on its stop at the end of the track, with the level\u2019s icon, its column in its colour, without pushing the page wider ({r}, {now})',
    )
    check(await until(pg, "!document.getElementById('sheet').open", 5), 'with every pet rated the sheet closes a moment later')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_slide(browser, url):
    print(
        'the rating slider under a finger: a resting finger or a slide lifts the thumb onto a level and says it under the track, letting go rates it, the meal stays a moment to be put right, scrolling rates nothing'
    )
    ctx = await phone(browser, touch=True, width=360, height=800)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    cdp = await ctx.new_cdp_session(pg)

    async def touch(kind, x=0, y=0):  # a real finger: the browser decides on scrolling and on a click itself
        await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind in ('touchEnd', 'touchCancel') else [{'x': x, 'y': y}]})

    # Every click that reaches a level (exactly one per rating) and every vibration (8 ms a tick, 16 ms a rating)
    await pg.evaluate(
        """() => { window.__rated = []; window.__buzz = []; Object.defineProperty(navigator, 'vibrate', {value: ms => window.__buzz.push(ms)});
      document.addEventListener('click', e => { const b = e.target.closest('.slider-track button'); if (b) window.__rated.push(b.dataset.r); }); }"""
    )
    STOPS = 'l => l.map(b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })'
    # What the slider in the card shows: the lit column's word and what the bowl looks like while a finger (or the
    # keyboard) is on it, whether the thumb shows, and the lit column while nothing is on it; None without the card
    SHOWN = """() => { const s = document.querySelector(`.pend[data-id="${window.__open}"] .slider`); if (!s) return null;
      const on = s.querySelector('.slider-names > .on'), words = on && [on.querySelector('b').innerText, on.querySelector('small').innerText], up = s.classList.contains('pointing');
      return [up ? words : null, getComputedStyle(s.querySelector('.slider-thumb')).display !== 'none', up ? null : words]; }"""
    # Under the finger the thumb carries the level's icon and floats, with the shadow of what floats, and the level's
    # word under the track is the one in colour
    ABOVE = """() => { const s = document.querySelector('.pend .slider'), thumb = s.querySelector('.slider-thumb');
      return [!!thumb.querySelector('svg path'), getComputedStyle(thumb.firstElementChild).boxShadow.includes('34px'),
        [...s.querySelectorAll('.slider-names > .on > b')].map(w => w.innerText)]; }"""
    ASKING = [None, False, None]
    RATED = '(() => { const s = db.servings.find(x => x.id === window.__open); return s && Object.values(s.pets)[0].r; })()'
    CARD = 'document.querySelectorAll(`.pend[data-id="${window.__open}"]`).length'
    clicks = '(() => { const r = [window.__rated, window.__buzz]; window.__rated = []; window.__buzz = []; return r; })()'

    async def stops():
        return await pg.eval_on_selector_all('.pend .slider-track button', STOPS)

    async def reopen():  # the meal open again, as it was before any rating
        await pg.evaluate(
            "import('./js/store.js').then(async s => { const x = s.db.servings.find(v => v.id === window.__open); for (const k in x.pets) x.pets[k] = {r: null, at: null}; s.save(); (await import('./js/views/home.js')).renderHome(); })"
        )
        await idle(pg)
        await pg.evaluate(clicks)

    async def gone():  # the meal has left „Wie war’s?“
        return await until(pg, f'{CARD} === 0', 5)

    await pg.evaluate("import('./js/derive.js').then(d => { window.__open = d.pendingServings()[0].id; })")
    # A finger that rests on the track: nothing at first, then after a moment the thumb lifts onto the level under it
    # and the words under the track name the level and say what the bowl looks like, with a light tick; letting go
    # rates it
    at = await stops()
    await touch('touchStart', *at[1])
    down = await pg.evaluate(SHOWN)
    await pg.wait_for_timeout(250)
    rest = [await pg.evaluate(SHOWN), await pg.evaluate(ABOVE), await state(pg, RATED)]
    await shot(pg, 'rating-rest-360')
    await touch('touchEnd')
    await idle(pg)
    tap = [await state(pg, RATED), await pg.evaluate(clicks), await pg.inner_text('#toast span'), await pg.evaluate(SHOWN)]
    check(
        down == ASKING and rest == [[['Fast', 'leer'], True, None], [True, True, ['Fast']], None],
        f'a finger resting on the track: nothing at first, then the thumb lifted under it and its column in colour, the word and what the bowl looks like, nothing rated yet ({down}, {rest})',
    )
    check(
        tap == ['gut', [['gut'], [8, 16]], 'Fast leer gespeichert', [None, True, ['Fast', 'leer']]],
        f'letting go rates that level once; the toast says so at once, and the card stays with the thumb set down and its column lit ({tap})',
    )
    await shot(pg, 'rating-rated-360')
    # Put right while the card stays: another slide rates again, and the moment starts over
    at = await stops()
    await touch('touchStart', *at[1])
    for i in range(1, 6):
        await touch('touchMove', at[1][0] + (at[0][0] - at[1][0]) * i / 5, at[1][1])
    await touch('touchEnd')
    await idle(pg)
    fixed = [await state(pg, RATED), (await pg.evaluate(clicks))[0], await pg.inner_text('#toast span'), await pg.evaluate(SHOWN)]
    await pg.wait_for_timeout(1000)
    fixed.append(await pg.evaluate(CARD))
    fixed.append(await gone())
    check(
        fixed == ['top', ['top'], 'Sofort leer gespeichert', [None, True, ['Alles', 'leer']], 1, True],
        f'while the card stays, a slide puts the rating right; the card waits a moment again and then folds away ({fixed})',
    )
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    undone = [await state(pg, RATED), await pg.evaluate(CARD)]
    check(undone == ['gut', 0], f'„Rückgängig“ brings back the level before the last one ({undone})')
    await reopen()
    # Sliding: sideways it shows each level it reaches with a tick, and letting go rates the last one
    at = await stops()
    (x0, y0), x3 = at[0], at[3][0]
    await touch('touchStart', x0, y0)
    for i in range(1, 11):
        await touch('touchMove', x0 + (x3 - x0) * i / 10, y0 + 2)
    moved = [await pg.evaluate(SHOWN), await pg.evaluate(ABOVE), await state(pg, RATED)]
    await shot(pg, 'rating-slide-360')
    await touch('touchEnd')
    await idle(pg)
    after = [await state(pg, RATED), await pg.evaluate(clicks), await pg.inner_text('#toast span')]
    check(
        moved == [[['Nur', 'anfangs'], True, None], [True, True, ['Nur']], None],
        f'sliding sideways puts the lifted thumb with the level\u2019s icon on the level and lights its column, and rates nothing yet ({moved})',
    )
    check(
        after == ['eager', [['eager'], [8, 8, 8, 8, 16]], 'Nur anfangs gespeichert'],
        f'letting go rates the level it stands on, once, after a light tick at each of the four levels on the way ({after})',
    )
    await reopen()
    # Up or down, even a little sideways, the page scrolls and the slider neither shows nor rates anything
    top = await pg.evaluate('scrollY')
    x, y = (await stops())[2]
    await touch('touchStart', x, y)
    for dy in range(10, 130, 10):
        await touch('touchMove', x + dy / 10, y - dy)
    await touch('touchEnd')
    await idle(pg)
    scrolled = [await pg.evaluate('scrollY') > top, await state(pg, RATED), await pg.evaluate(clicks), await pg.evaluate(SHOWN)]
    check(scrolled == [True, None, [[], []], ASKING], f'moving up scrolls the page and rates nothing ({scrolled})')
    # A touch while the page is still scrolling (a fling going on) only stops it; once the page rests, a tap rates
    x, y = (await stops())[4]
    await pg.evaluate('window.__fling = setInterval(() => scrollBy(0, 1), 16)')
    await pg.wait_for_timeout(100)
    await touch('touchStart', x, y)
    await touch('touchEnd')
    await pg.evaluate('clearInterval(window.__fling)')
    await idle(pg)
    stopped = [await state(pg, RATED), await pg.evaluate(clicks)]
    await pg.wait_for_timeout(300)
    await touch('touchStart', *(await stops())[4])
    await touch('touchEnd')
    stopped.append(await until(pg, f"{RATED} === 'sosse'", 3))
    check(stopped == [None, [[], []], True], f'a touch that stops the page scrolling rates nothing, the next one does ({stopped})')
    await reopen()
    # The system takes the touch away while it slides: back to what the meal holds, nothing rated
    at = await stops()
    await touch('touchStart', *at[1])
    for i in range(1, 6):
        await touch('touchMove', at[1][0] + (at[3][0] - at[1][0]) * i / 5, at[1][1])
    sliding = await pg.evaluate(SHOWN)
    await touch('touchCancel')
    await idle(pg)
    cancelled = [sliding, await pg.evaluate(SHOWN), await state(pg, RATED), (await pg.evaluate(clicks))[0]]
    check(
        cancelled == [[['Nur', 'anfangs'], True, None], ASKING, None, []],
        f'a cancelled slide takes the thumb and the lit column away again and rates nothing ({cancelled})',
    )
    # Redrawn under the finger (a change from another phone): nothing is rated
    await touch('touchStart', *(await stops())[1])
    await pg.evaluate("import('./js/views/home.js').then(h => h.renderHome())")
    await touch('touchEnd')
    await idle(pg)
    redrawn = [await state(pg, RATED), (await pg.evaluate(clicks))[0]]
    check(redrawn == [None, []], f'a slider drawn anew under the finger rates nothing ({redrawn})')
    # A finger on the card when its moment is over holds it until the finger lifts
    at = await stops()
    await touch('touchStart', *at[2])
    await touch('touchEnd')
    await idle(pg)
    await touch('touchStart', *at[2])
    await pg.wait_for_timeout(2500)
    held = [await state(pg, RATED), await pg.evaluate(SHOWN)]
    await touch('touchEnd')
    held += [(await pg.evaluate(clicks))[0], await gone()]
    check(
        held == ['mittel', [['Hälfte', 'übrig'], True, None], ['mittel'], True],
        f'a finger that stays on the card keeps it there past its moment, and it folds away once the finger lifts ({held})',
    )
    await reopen()
    # The mouse slides as soon as it is pressed
    at = await stops()
    await pg.mouse.move(*at[5])
    await pg.mouse.down()
    await pg.mouse.move(*at[4], steps=4)
    await pg.mouse.up()
    await idle(pg)
    mouse = [await state(pg, RATED), (await pg.evaluate(clicks))[0]]
    check(mouse == ['sosse', ['sosse']], f'with the mouse: pressed on one level, let go on the next, that one is rated ({mouse})')
    await reopen()
    # The keyboard: a level is a button like any other, and the one it is on lifts the thumb and shows its words
    await pg.focus('.pend .slider-bar [data-r=gut]')
    await pg.keyboard.press('Tab')
    focused = await pg.evaluate(SHOWN)
    await pg.keyboard.press('Enter')
    await idle(pg)
    keys = [focused, await state(pg, RATED), (await pg.evaluate(clicks))[0]]
    check(
        keys == [[['Hälfte', 'übrig'], True, None], 'mittel', ['mittel']],
        f'the level the keyboard is on lifts the thumb and shows its words, and Enter rates it ({keys})',
    )
    # In the sheet the rated meal holds its level: a tap on it changes nothing, a tap on another rates that one, and
    # the sheet closes a moment later
    sid = await pg.evaluate('window.__open')
    await gone()
    await pg.click(f'.tl-item[data-id={sid}]')
    await idle(pg)
    await pg.wait_for_timeout(200)  # the page has just scrolled to the meal, and a touch that soon would only stop it
    b = await pg.eval_on_selector('#sheet .slider', SLIDER)
    check(
        b['thumb'] == 2
        and b['disc'] == [44, True]
        and not b['lifted']
        and [[w['text'], w['note']] for w in b['words'] if w['on']] == [['Hälfte', 'übrig']],
        f'the level a meal holds: the thumb on its stop with the level\u2019s icon and its column in colour, the word and what the bowl looks like ({b["thumb"]}, {b["words"]})',
    )
    at = await pg.eval_on_selector_all('#sheet .slider-track button', STOPS)
    await touch('touchStart', *at[2])
    await touch('touchEnd')
    await idle(pg)
    sheet_open = "document.getElementById('sheet').open"
    held = [await pg.evaluate(sheet_open), (await pg.evaluate(clicks))[0]]
    await touch('touchStart', *at[0])
    await touch('touchEnd')
    await idle(pg)
    held += [await state(pg, RATED), (await pg.evaluate(clicks))[0], await pg.evaluate(sheet_open), await until(pg, f'!{sheet_open}', 5)]
    check(
        held == [True, [], 'top', ['top'], True, True],
        f'a tap on the level a meal holds changes nothing, one on another replaces it, and the sheet closes a moment later ({held})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


TEXTURE_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['nass', 'Sheba', 'Lachs', 'Nassfutter'], ['snack', 'Dreamies', 'Käse', 'Snack'], ['trocken', 'Josera', 'Huhn in Soße', 'Trockenfutter']]
    .map(([id, brand, variety, type]) => ({id: id + '0001', brand, variety, type, codes: {}, createdAt: 1}));
  d.servings = d.products.map((p, i) => ({id: 'meal00000' + i, productId: p.id, servedAt: now - (i + 30) * 36e5, note: '', pets: {minka00001: {r: 'top', at: now}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_texture(browser, url):
    print('consistency and treat type: the choice per type, the note on „Fester Block“, changing type, keywords, the server\u2019s value')
    ctx = await phone(browser, width=360, height=800)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(TEXTURE_DB)
    await idle(pg)
    CHIPS = """() => { const chips = [...document.querySelectorAll('#sheet [data-action=set-texture]')], label = chips[0]?.closest('.chips').previousElementSibling, box = label?.parentElement;
      return {title: label?.innerText, labels: chips.map(c => c.innerText), on: chips.filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.v),
        fits: chips.every(c => c.getBoundingClientRect().right <= innerWidth && c.getBoundingClientRect().height >= 44),
        under: box?.previousElementSibling?.className, note: document.querySelector('#sheet .note')?.innerText || ''}; }"""

    async def product(pid):
        await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}0001'}}))")
        await idle(pg)
        return await pg.evaluate(CHIPS)

    def tex(pid):
        return state(pg, f"(p => p.texture ?? null)(db.products.find(p => p.id === '{pid}0001'))")

    c = await product('nass')
    check(
        c
        == {
            'title': 'Konsistenz',
            'labels': ['In Soße', 'In Gelee', 'Pastete', 'Mousse', 'Fester Block', 'Suppe'],
            'on': [],
            'fits': True,
            'under': 'link rephoto',
            'note': '',
        },
        f'food sheet, wet food: „Konsistenz“ with six chips under the type and its photo link, never mandatory, nothing clipped at 360 px ({c})',
    )
    await pg.click('#sheet [data-action=set-texture][data-v=block]')
    await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(
        c['on'] == ['block'] and c['note'] == 'Vor dem Servieren zerkleinern' and await tex('nass') == 'block',
        f'„Fester Block“ chosen: stored, with a small note about breaking it up ({c["on"]}, {c["note"]})',
    )
    await shot(pg, 'food-consistency-360')
    await pg.click('#sheet [data-action=set-texture][data-v=block]')
    await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(
        c['on'] == [] and c['note'] == '' and await state(pg, "!('texture' in db.products.find(p => p.id === 'nass0001'))"),
        'a second tap clears the choice and the field is dropped',
    )
    await pg.click('#sheet [data-action=set-texture][data-v=gelee]')
    await pg.click('#sheet [data-action=set-texture][data-v=pastete]')
    await idle(pg)
    check((await pg.evaluate(CHIPS))['on'] == ['pastete'] and await tex('nass') == 'pastete', 'single choice: the new pick replaces the old one')
    await pg.click('[data-action=close]')
    await idle(pg)
    c = await product('snack')
    check(
        c['title'] == 'Snack-Art' and c['labels'] == ['Knusprig', 'Weich', 'Creme', 'Milch', 'Stick', 'Kauartikel'] and c['fits'],
        f'food sheet, treat: „Snack-Art“ with six chips ({c})',
    )
    await pg.click('[data-action=close]')
    await idle(pg)
    c = await product('trocken')
    check(c['labels'] == [] and await tex('trocken') is None, 'dry food: no choice at all')
    await pg.click('[data-action=close]')
    await idle(pg)
    # Naming: the chips under the type, and on a type change a value that no longer fits is dropped
    await product('nass')
    await pg.click('[data-action=rename-product]')
    await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(
        c['title'] == 'Konsistenz' and c['on'] == ['pastete'] and c['under'] == 'chips' and c['fits'],
        f'naming: the chip row sits under the type and shows the choice ({c})',
    )
    await pg.click('#sheet [data-action=set-type][data-v=Snack]')
    await idle(pg)
    c = await pg.evaluate(CHIPS)
    await pg.click('#sheet [data-action=set-type][data-v=Sonstiges]')
    await idle(pg)
    none = await pg.evaluate(CHIPS)
    check(
        c['title'] == 'Snack-Art' and c['on'] == [] and none['labels'] == [],
        'type changed: the new type\u2019s choice, with no value; under „Sonstiges“ no row at all',
    )
    await pg.click('[data-action=save-name]')
    await idle(pg)
    check(
        await state(pg, "(p => p.type === 'Sonstiges' && !('texture' in p))(db.products.find(p => p.id === 'nass0001'))"),
        'stored: with the type the consistency is gone too',
    )
    await pg.click('[data-action=close]')
    await idle(pg)

    # Keywords while naming: they only fill an empty field; a choice and a deliberate "none" both stand
    async def name_new(variety, pick=None, twice=False, kind='Nassfutter'):
        await pg.click('#fab')
        await idle(pg)
        await pg.click('[data-action=new-product]')
        await idle(pg)
        await pg.fill('#f-brand', 'Miamor')
        await pg.fill('#f-variety', variety)
        await pg.click(f'#sheet [data-action=set-type][data-v={kind}]')
        await idle(pg)
        for _ in range((pick is not None) + twice):
            await pg.click(f'#sheet [data-action=set-texture][data-v={pick}]')
            await idle(pg)
        await pg.click('[data-action=save-name]')
        await idle(pg)
        return await state(pg, f"(p => p.texture ?? null)(db.products.find(p => p.variety === '{variety}'))")

    got = [
        await name_new('Ragout in Gelee'),
        await name_new('Filet in Soße', 'mousse'),
        await name_new('Huhn in Jelly', 'gelee', twice=True),
        await name_new('Knusperkissen', kind='Snack'),
        await name_new('Kaninchen'),
    ]
    check(
        got == ['gelee', 'mousse', None, 'knusprig', None],
        f'naming: the keywords fill the empty field, while our own choice and a cleared field are kept ({got})',
    )
    # Recognition and barcode hits: the server's value beats the keywords, but only when it fits the type; an existing value stays
    got = await pg.evaluate("""import('./js/logic/products.js').then(m => { const make = (variety, texture, type = 'Nassfutter') => m.newProduct({brand: 'Test', variety, type, texture}).texture ?? null;
      const old = m.newProduct({brand: 'Test', variety: 'Pute', type: 'Nassfutter', texture: 'suppe'}); m.applyTexture(old, {texture: 'gelee'});
      return [make('Huhn in Soße', 'gelee'), make('Rind in Soße', 'knusprig'), make('Ente in Soße'), make('Sticks', 'weich', 'Snack'), make('Kroketten in Soße', 'sosse', 'Trockenfutter'), old.texture]; })""")
    check(
        got == ['gelee', 'sosse', 'sosse', 'weich', None, 'suppe'],
        f'the server\u2019s value beats the keywords when it fits the type; an existing value stays ({got})',
    )
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


# The overview's line about the animal on the page's today, from the lists in views/overview.js
# The overview card: its heading, picture, the sentences shown and every sentence there is (all), its lines; tight:
# the card as tall as its text or its picture
CARD = """() => Promise.all([import('./js/store.js'), import('./js/views/overview.js'), import('./js/glance.js'), import('./js/derive.js')]).then(([s, o, g, d]) => {
  const c = document.querySelector('#home > section'), h = c.querySelector('h2'), other = document.querySelector('[data-sec=hist] h2'), pic = c.querySelector('.ov-pic'), p = c.querySelector('p');
  const font = e => { const st = getComputedStyle(e); return [st.fontFamily, st.fontWeight, st.fontSize].join(); }, r = c.getBoundingClientRect(), a = pic.querySelector('.av').getBoundingClientRect(), ps = getComputedStyle(p);
  const text = c.querySelector('.ov-text').getBoundingClientRect().height, inner = Math.max(text, 72) + 18 + 10 + 8;
  const pets = s.prefs.activePet === 'all' ? s.db.pets : s.db.pets.filter(x => x.id === s.prefs.activePet), m = d.model();
  const full = o.overviewText(g.glance(s.db, pets.map(x => x.id), Date.now(), new Set(m.sorts.filter(e => e.choice === 'nicht').map(e => e.id))), pets, Date.now());
  const q = document.createElement('p'); q.innerHTML = full;
  return {first: c.classList.contains('overview'), height: Math.round(r.height), tight: Math.abs(r.height - inner) < 1, title: h.innerText, sameFont: font(h) === font(other),
    pic: [pic.tagName, pic.querySelectorAll('.av').length, a.width, a.left < h.getBoundingClientRect().left],
    text: p.innerText, bold: [...p.querySelectorAll('b')].map(b => b.innerText), lines: Math.round(p.clientHeight / parseFloat(ps.lineHeight) * 10) / 10, cut: p.scrollHeight > p.clientHeight + 1,
    sentences: [...p.querySelectorAll('.ov-line')].map(l => l.innerText), all: [...q.querySelectorAll('.ov-line')].map(l => l.innerText), clamp: ps.webkitLineClamp,
    tap: [c.tagName, c.dataset.action ?? null, c.getAttribute('aria-expanded'), !!c.closest('button')], wide: document.documentElement.scrollWidth > innerWidth}; })"""
# One pet, a household (the code only in memory) with usual times and a variety with a long name, served today as
# given ([hour, minute, variety]) by Ben, at the system font scale given. Returns the sentences shown against every
# sentence there is, the lines the text takes folded and unfolded, and whether the long name is in play.
LONG_DB = """([scale, today]) => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now(), o = await import('./js/views/overview.js'), g = await import('./js/glance.js'), h = await import('./js/views/home.js');
  const at = (days, hh, mm) => { const t = new Date(now); t.setDate(t.getDate() - days); t.setHours(hh, mm, 0, 0); return t.getTime(); };
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['wild', 'Catz Finefood', 'Wildschwein mit Nachtkerzenöl', 'Nassfutter'], ['lang', 'Catz Finefood', 'Wildschwein mit Nachtkerzenöl und Kürbis', 'Nassfutter'], ['snack', 'Dreamies', 'Käse', 'Snack']]
    .map(([id, brand, variety, type]) => ({id: id + '000001', brand, variety, type, codes: {}, createdAt: 1}));
  d.servings = [];
  for (let i = 1; i <= 8; i++) for (const [hh, mm] of [[7, 15], [18, 30]]) d.servings.push({id: 'meal' + i + hh + '0001', productId: 'wild000001', servedAt: at(i, hh, mm), note: '', by: 'Ben', pets: {minka00001: {r: 'top', at: now}}});
  today.forEach(([hh, mm, id], i) => d.servings.push({id: 'today' + i + '0001', productId: id + '000001', servedAt: at(0, hh, mm), note: '', by: 'Ben', pets: {minka00001: {r: 'top', at: now}}}));
  d.servings.sort((a, b) => b.servedAt - a.servedAt);
  s.replaceDb(d); s.save();
  if (!document.getElementById('bigtext')) { const st = document.createElement('style'); st.id = 'bigtext'; document.head.append(st); }
  document.getElementById('bigtext').textContent = scale === 1 ? '' : `.overview p{font-size:${(14 * scale).toFixed(2)}px !important}`;
  s.prefs.code = 'K7PM-3QXD'; h.renderHome();
  const p = document.querySelector('.overview p'), lh = parseFloat(getComputedStyle(p).lineHeight);
  const full = o.overviewText(g.glance(d, ['minka00001'], now, new Set()), d.pets, now), q = document.createElement('p'); q.innerHTML = full;
  const out = {shown: [...p.querySelectorAll('.ov-line')].map(l => l.innerText), all: [...q.querySelectorAll('.ov-line')].map(l => l.innerText),
    lines: Math.round(p.clientHeight / lh), full: Math.round(p.scrollHeight / lh), cut: p.scrollHeight > p.clientHeight + 1, long: today.at(-1)[2] === 'lang'};
  s.prefs.code = ''; return out; })"""
# The facts that may come on the day `days` from today for a species, as texts, and a kind of line worded as on that
# day with its places filled: what the overview must say, given the values
FACTS = """([species, days]) => import('./js/views/facts.js').then(f => f.factsOn(species, new Date(Date.now() + (days || 0) * 864e5)).map(x => x.text))"""
LINE = """([kind, values, days]) => Promise.all([import('./js/views/facts.js'), import('./js/glance.js')]).then(([f, g]) => f.fill(g.pick(f.LINES[kind], Date.now() + (days || 0) * 864e5), values))"""


async def told_facts(pg, species, days=0):
    """The facts that may come on the day `days` from today for a species, each with the lead-in of that day: what
    the overview's last sentence may be"""
    lead = await pg.evaluate(LINE, ['factLead', {'fact': '#'}, days])
    return [lead.replace('#', f) for f in await pg.evaluate(FACTS, [species, days])]


OVERVIEW_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now(), H = 36e5;
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['lachs', 'Lachs', 'Nassfutter'], ['rind', 'Rind', 'Nassfutter'], ['snack', 'Käse', 'Snack']].map(([id, variety, type]) => ({id: id + '00001', brand: 'Sheba', variety, type, codes: {}, createdAt: 1}));
  d.servings = [['snack', 'verputzt', 1], ['lachs', 'top', 2], ['lachs', 'top', 30], ['lachs', 'gut', 54], ['rind', 'schlecht', 60], ['rind', 'schlecht', 80]]
    .map(([pid, r, ago], i) => ({id: 'meal00000' + i, productId: pid + '00001', servedAt: now - ago * H, note: '', pets: {minka00001: {r, at: now}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_overview(browser, url):
    print('overview: a card with picture, name and a text about the day in two lines, unfolding with a tap, never a rating; counting in the history')
    ctx = await phone(browser, width=360, height=800, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-09T12:00:00+02:00')
    await pg.evaluate(OVERVIEW_DB)
    await idle(pg)

    async def line(kind, values, days=0):
        return await pg.evaluate(LINE, [kind, values, days])

    c = await pg.evaluate(CARD)
    status = await line(
        'today', {'so': 'schon', 'both': 'eine Mahlzeit und einen Snack', 'at': '11:00', 'what': 'Käse', 'by': '', 'names': 'Minka', 'hat': 'hat'}
    )
    cats = await told_facts(pg, 'Katze')
    check(
        [c['first'], c['title'], c['sameFont'], c['pic'], c['bold'][:4], c['clamp'], c['lines'], c['cut'], c['tap'], c['wide'], c['tight']]
        == [
            True,
            'Minka',
            True,
            ['BUTTON', 1, 72, True],
            ['eine Mahlzeit', 'einen Snack', '11:00', 'Käse'],
            '2',
            2,
            True,
            ['SECTION', 'toggle-overview', 'false', False],
            False,
            True,
        ]
        and c['all'] == [status, c['all'][1]] == c['sentences']
        and c['all'][1] in cats,
        f'the overview sits on top: the name in the heading typeface, the picture on the left at 72 px, one sentence with today\u2019s meals, the last one and what it was, the important parts in bold, then a fact about the animal with its lead-in; two lines ending in „…“, and the card is the tap target ({c})',
    )
    await shot(pg, 'overview-360')
    await pg.evaluate("window.__card = document.querySelector('.overview')")
    await pg.click('.overview p')
    await idle(pg)
    o = await pg.evaluate(CARD)
    await shot(pg, 'overview-open-360')
    await pg.click('.overview h2')
    await idle(pg)
    back = await pg.evaluate(CARD)
    check(
        [o['cut'], o['tap'], o['text'], o['lines'] > 2, o['height'] > c['height'], back == c]
        == [False, ['SECTION', 'toggle-overview', 'true', False], c['text'], True, True, True]
        and await pg.evaluate("window.__card === document.querySelector('.overview')"),
        f'a tap on the card shows the whole text, a second folds it away again, both without redrawing the page ({o["height"]} px, {o["lines"]} lines)',
    )
    day = await pg.evaluate("[document.querySelector('.tl-date span').innerText, document.querySelector('.day.today').getAttribute('aria-label')]")
    check(
        day == ['1 Mahlzeit, 1 Snack', 'Heute, 1 Mahlzeit, 1 Snack'],
        f'the history counts meals and treats separately, for screen readers in the calendar too ({day})',
    )
    gap = await pg.evaluate(
        "document.querySelector('.cal').getBoundingClientRect().top - document.querySelector('[data-sec=hist] h2').getBoundingClientRect().bottom"
    )
    check(gap == 14, f'14 px from „Verlauf“ to the calendar, 8 more than before ({gap})')
    await pg.click('.ov-pic')
    await idle(pg)
    check(await pg.input_value('#sheet #f-name') == 'Minka', 'a tap on the picture opens the pet, not the text')
    await pg.click('[data-action=close]')
    await idle(pg)
    # Several pets: today's meals of all of them, who had the last one, when the next one usually comes
    await pg.evaluate("""import('./js/store.js').then(async s => { const now = Date.now(), H = 36e5;
      s.db.pets.push({id: 'tiger00001', name: 'Tiger', species: 'Hund', createdAt: 2});
      s.db.products.push({id: 'pute000001', brand: 'Rinti', variety: 'Pute', type: 'Nassfutter', codes: {}, createdAt: 1});
      [26, 50, 74].forEach((ago, i) => s.db.servings.push({id: 'tigermeal' + i, productId: 'pute000001', servedAt: now - ago * H, note: '', pets: {tiger00001: {r: 'top', at: now}}}));
      s.db.servings.unshift({id: 'beide00001', productId: 'lachs00001', servedAt: now - 5 * 6e4, note: '', pets: {minka00001: {r: null, at: null}, tiger00001: {r: null, at: null}}});
      s.save(); (await import('./js/views/home.js')).renderHome(); })""")
    await idle(pg)
    house = await pg.evaluate(CARD)
    await pg.click('[data-action=filter][data-id=tiger00001]')
    await idle(pg)
    tiger = await pg.evaluate(CARD)
    await pg.evaluate(
        "import('./js/store.js').then(async s => { s.db.pets.push({id: 'kiwi000001', name: 'Kiwi', species: 'Vogel', createdAt: 3}); s.prefs.activePet = 'kiwi000001'; s.save(); (await import('./js/views/home.js')).renderHome(); })"
    )
    await idle(pg)
    kiwi = await pg.evaluate(CARD)
    dogs, birds = await told_facts(pg, 'Hund'), await told_facts(pg, 'Vogel')
    fed = {'when': 'vor 5 Minuten', 'what': 'Lachs', 'verb': 'bekommen'}
    both, one, late = (
        await line('fresh', {'names': 'Minka und Tiger', 'hat': 'haben', **fed}),
        await line('fresh', {'names': 'Tiger', 'hat': 'hat', **fed}),
        await line('later', {'meal': 'Frühstück', 'span': '2 Stunden'}),
    )
    digest = await line('digest', {'meal': 'Frühstück', 'when': 'morgen gegen 10 Uhr'})
    check(
        [house['title'], house['pic'][:2], house['all']] == ['Minka und Tiger', ['SPAN', 2], [both, digest, late]]
        and house['sentences'] == house['all']
        and house['bold'][:3] == ['5 Minuten', 'Lachs', '10 Uhr']
        and house['tight'],
        f'under „Alle“ with several pets: who had the last meal and what, when the next one usually comes, tomorrow once today\u2019s are served, and the message of the day, that meal came two hours after the usual time, with nothing after it ({house["text"]})',
    )
    check(
        [tiger['title'], tiger['pic'][:2], tiger['all'][:1], len(tiger['all'])] == ['Tiger', ['BUTTON', 1], [one], 2]
        and tiger['all'][1] in dogs
        and tiger['sentences'] == tiger['all']
        and [kiwi['all'][0], len(kiwi['all']), kiwi['tight']] == [await line('firstMeal', {'names': 'Kiwi', 'wartet': 'wartet'}), 2, True]
        and kiwi['all'][1] in birds,
        f'the overview follows the filter, with a fact about the dog for the dog; without a meal that it waits for the first one, and a fact about the bird ({tiger["text"]} / {kiwi["text"]})',
    )
    # Never a rating: none of the levels, no favourite, nothing that goes down well or not, no percentage
    words = await pg.evaluate("import('./js/config.js').then(c => Object.values(c.RATINGS).map(x => x.label))")
    rated = [
        t for t in (c['text'], house['text'], tiger['text']) for w in words + ['Liebling', 'am liebsten', 'kommt', 'bewertet', 'offen', '%'] if w in t
    ]
    check(not rated, f'the overview never says how a meal went ({rated})')
    # In a household it matters who fed. prefs.code only in memory: saving it would start a sync
    by = await pg.evaluate("""import('./js/store.js').then(async s => { const h = await import('./js/views/home.js');
      s.prefs.activePet = 'all'; s.db.servings[0].by = 'Anna';
      const text = () => document.querySelector('.overview p').innerText;
      h.renderHome(); const alone = text();
      s.prefs.code = 'K7PM-3QXD'; h.renderHome(); const house = text();
      s.prefs.code = ''; h.renderHome();
      return [alone, house]; })""")
    served = await line('freshHouse', {'server': 'Anna', 'names': 'Minka und Tiger', 'when': 'vor 5 Minuten', 'what': 'Lachs', 'verb': 'gegeben'})
    check(
        'Anna' not in by[0] and by[1].startswith(served + ' '),
        f'in a household the overview says who fed, on your own it does not ({by[1]})',
    )
    # The line more: what is only true today first; else on a day with an odd number one of the kinds taking turns
    # and on an even one a fact (9 June 2026 is day 20613 since 1970: a kind, the next day a fact), over five days
    # with the memory threaded through; every message, then every kind taking turns, each from a glance holding
    # only it, on a kind's day
    LINES = """import('./js/store.js').then(async s => { const o = await import('./js/views/overview.js'), now = Date.now(), pets = [s.db.pets[0]];
      const last = {...s.db.servings.find(x => x.pets.minka00001), servedAt: now - 3 * 36e5}, code = s.prefs.code;
      const none = {premiere: null, idea: null, feeders: [], week: {meals: 0, sorts: 0}, streak: 0, first: null, sorts: 0, anniversary: null, record: {meals: 0, streak: 0},
        shift: null, sameMinute: false, feedRun: null, weekday: null, lookback: null, milestone: {n: 100, left: 40}, next: {at: 1110}};
      const g = {...none, last, meals: 2, snacks: 1, feeders: [{name: 'Anna', n: 6}, {name: 'Jonas', n: 4}], week: {meals: 12, sorts: 4}, streak: 12, idea: {id: 'rind00001', days: 12}};
      const lines = t => [...new DOMParser().parseFromString(t, 'text/html').querySelectorAll('.ov-line')].map(x => x.textContent);
      s.prefs.code = 'K7PM-3QXD';
      let memory = null; const days = [];
      for (let i = 0; i < 5; i++) { const r = o.overviewLines({...g, last: {...last, servedAt: last.servedAt + i * 864e5}}, pets, now + i * 864e5, memory); memory = r.memory; days.push(lines(r.text)); }
      const one = (x, base = g) => lines(o.overviewLines({...base, ...x}, pets, now, null).text);
      const first = [{premiere: 'lachs00001'}, {premiere: 'rind00001'}, {milestone: {n: 100, left: 3}}, {snacks: 4}, {anniversary: 1, first: {at: 0, days: 30, meals: 62}},
        {record: {meals: 0, streak: 23}}, {record: {meals: 4, streak: 0}, meals: 4}, {shift: {at: 435, diff: -40}}, {shift: {at: 1110, diff: 95}}, {sameMinute: true},
        {next: {at: 1110, due: true}}, {next: {at: 435, tomorrow: true}}].map(x => one(x));
      const bare = {...g, ...none}; // nothing but one kind left to take a turn
      const kinds = [{feedRun: {name: 'Ben', days: 5, other: 'Jonas'}}, {feedRun: {name: 'Ben', days: 5, other: null}}, {weekday: {at: 435, mine: 525, later: true, weekday: 6}},
        {lookback: 'lachs00001'}, {sorts: 14}, {first: {at: 0, days: 43, meals: 100}}, {feeders: [{name: 'Anna', n: 5}, {name: 'Jonas', n: 5}]}].map(x => one(x, bare));
      s.prefs.code = code; return [days, first, kinds, memory]; })"""
    days, first, kinds, memory = await pg.evaluate(LINES)
    turns = [
        await line('duel', {'first': 'Anna', 'n': 6, 'm': 4, 'second': 'Jonas'}),
        await line('streak', {'since': '12 Tagen', 'days': '12 Tage', 'you': 'hättet eigentlich ihr'}, 2),
        await line('idea', {'sort': 'Rind', 'days': 12}, 4),
    ]
    told = [await told_facts(pg, 'Katze', i) for i in range(5)]
    daily = [
        [
            await line(
                'today',
                {
                    'so': 'schon',
                    'both': 'zwei Mahlzeiten und einen Snack',
                    'at': '9:00',
                    'what': 'Lachs',
                    'by': ' von Anna',
                    'names': 'Minka',
                    'hat': 'hat',
                },
                i,
            ),
            await line('usual', {'meal': 'Abendessen', 'when': 'gegen 18:30 Uhr'}, i),
        ]
        for i in range(5)
    ]
    check(
        all(len(d) == 3 and d[:2] == daily[i] for i, d in enumerate(days))
        and [days[i][2] for i in (0, 2, 4)] == turns
        and all(days[i][2] in told[i] for i in (1, 3))
        and days[1][2] != days[3][2]
        and [memory['day'], memory['kind'], memory['fact'], memory['kinds'], [f['day'] for f in memory['facts']]]
        == ['2026-06-13', 'idea', None, ['duel', 'streak', 'idea'], ['2026-06-10', '2026-06-12']],
        f'three sentences: today\u2019s meals with the last one and who served it, when the next meal usually is, and one line more; over five days the duel, a fact, the streak, another fact and an idea take turns, and the memory holds the last three kinds and every fact ({days}, {memory})',
    )
    messages = [
        await line('premiereLast', {}),
        await line('premiere', {'sort': 'Rind'}),
        await line('milestone', {'n': '3×', 'm': '100. Mal'}),
        await line('snacksCounted', {'grip': 'Minka hat euch ganz schön im Griff.'}),
        await line('anniversary', {'span': 'einem Monat', 'n': 62}),
        await line('recordStreak', {'days': '23 Tage'}),
        await line('recordDay', {'n': '4 Mahlzeiten'}),
        await line('earlier', {'meal': 'Frühstück', 'span': '40 Minuten'}),
        await line('later', {'meal': 'Abendessen', 'span': 'eineinhalb Stunden'}),
        await line('sameMinute', {}),
    ]
    check(
        [f[-1] for f in first[:10]] == messages
        and all(len(f) == 3 for f in first)
        and first[10][2] == first[11][2] == turns[0]
        and 'zwei Mahlzeiten und vier Snacks' in first[3][0]
        and 'vier Mahlzeiten' in first[6][0]
        and first[10][:2]
        == [
            await line('due', {'when': 'um 9:00', 'what': 'Lachs', 'by': ' von Anna'}),
            await line('waiting', {'names': 'Minka', 'wartet': 'wartet', 'uebt': 'übt', 'hat': 'hat', 'sitzt': 'sitzt'}),
        ]
        and first[11][1] == await line('doneToday', {'meal': 'Frühstück', 'when': 'gegen 7:15 Uhr'}),
        f'what is only true today is the line more, with nothing after it: a first time, a milestone close by, a lot of treats, an anniversary, a record, a meal off its usual time or at yesterday\u2019s minute; without one the duel takes its turn; at feeding time it says so, and once today\u2019s meals are served it says when tomorrow\u2019s first one is ({first})',
    )
    others = [
        await line('feedRun', {'name': 'Ben', 'days': '5 Tage', 'since': '5 Tagen', 'other': 'Jonas'}),
        await line('feedRunAlone', {'name': 'Ben', 'days': '5 Tage', 'since': '5 Tagen', 'other': ''}),
        await line('weekday', {'weekday': 'Samstags', 'day': 'Samstag', 'meal': 'Frühstück', 'shift': 'später', 'time': '8:45'}),
        await line('lookback', {'sort': 'Lachs'}),
        await line('sorts', {'n': '14 Sorten'}),
        await line('days', {'since': '43 Tagen', 'days': '43 Tage', 'n': 43}),
        await line('duelTie', {'score': '5 zu 5', 'first': 'Anna', 'second': 'Jonas'}),
    ]
    check(
        [k[-1] for k in kinds] == others and all(len(k) == 3 for k in kinds),
        f'the other kinds taking turns: a person\u2019s feeding run, with or without someone to tease, a weekday\u2019s own time, a look back a year, the varieties tried, the days in the diary and a tied duel ({kinds})',
    )
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()

    # A long name, a household and usual times, at the usual and at a large system font: nothing is dropped, the
    # first sentence stands whole with „von Ben“ and the variety\u2019s full name, the text is clamped to two lines,
    # and a tap unfolds all of it
    ctx = await phone(browser, width=360, height=800, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-09T15:00:00+02:00')
    long = [[7, 20, 'snack'], [12, 0, 'wild'], [13, 14, 'lang']]
    for scale, today in ((1, [[7, 20, 'wild']]), (1.3, long)):
        fit = await pg.evaluate(LONG_DB, [scale, today])
        await idle(pg)
        name = 'Wildschwein mit Nachtkerzenöl' + (' und Kürbis' if fit['long'] else '')
        record = await line('recordStreak', {'days': '9 Tage'})
        opened = await pg.evaluate(
            "import('./js/views/home.js').then(h => { h.toggleOverview(); const p = document.querySelector('.overview p'); return [p.scrollHeight > p.clientHeight + 1, getComputedStyle(p).display]; })"
        )
        await pg.evaluate("import('./js/views/home.js').then(h => h.toggleOverview())")
        check(
            fit['shown'] == fit['all']
            and len(fit['all']) == 3
            and fit['all'][0].endswith('von Ben.')
            and name in fit['all'][0]
            and fit['all'][2] == record
            and [fit['cut'], fit['lines'], fit['full'] > 2, opened] == [True, 2, True, [False, 'block']],
            f'{int(scale * 100)} %, {len(today)} today: „von Ben“ and the full name in a whole first sentence, the record streak of nine days as the message, {fit["full"]} lines clamped to two and all of them after a tap ({fit})',
        )
        await shot(pg, f'overview-long-{int(scale * 100)}-{len(today)}')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


# The pet editor with its birthday field: what it holds, whether the sheet is still open, which field has the focus
# and what the toast says
BIRTHDAY = """() => ({value: document.querySelector('#f-birthday')?.value ?? null, open: !!document.querySelector('#sheet #f-name'),
  focus: document.activeElement?.id, toast: document.querySelector('#toast')?.innerText.trim() ?? '', max: document.querySelector('#f-birthday')?.max,
  pick: !!document.querySelector('#f-birthday')?.closest('.pick')?.querySelector('.ic'), wide: document.documentElement.scrollWidth > innerWidth})"""
# The overview's sentences for the first pet with the birthday given, all of them, tags stripped
BIRTHDAY_LINES = """birthday => Promise.all([import('./js/store.js'), import('./js/views/overview.js'), import('./js/glance.js')]).then(([s, o, g]) => {
  const p = s.db.pets[0]; if (birthday) p.birthday = birthday; else delete p.birthday;
  const t = document.createElement('p'); t.innerHTML = o.overviewText(g.glance(s.db, [p.id], Date.now(), new Set()), [p], Date.now());
  return [...t.querySelectorAll('.ov-line')].map(l => l.innerText); })"""


async def test_birthday(browser, url):
    print('the pet\u2019s birthday: a date field in the editor, nothing in the future, and the overview announces the day')
    ctx = await phone(browser, width=360, height=800, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-09T12:00:00+02:00')
    await pg.evaluate(OVERVIEW_DB)
    await idle(pg)
    await settings(pg)
    await pg.click('#sheet [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Tiger')
    await pg.fill('#f-birthday', '2027-01-01')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    late = await pg.evaluate(BIRTHDAY)
    check(
        late
        == {
            'value': '2027-01-01',
            'open': True,
            'focus': 'f-birthday',
            'toast': 'Das Geburtsdatum liegt in der Zukunft.',
            'max': '2026-06-09',
            'pick': True,
            'wide': False,
        },
        f'a birthday in the future is refused on saving: the toast says so, the editor stays and the field keeps the focus; the field is a select field with its own arrow, the picker ends today ({late})',
    )
    await shot(pg, 'pet-birthday-360')
    await pg.fill('#f-birthday', '2022-06-12')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    saved = await state(pg, 'db.pets.map(p => [p.name, p.birthday ?? null])')
    check(saved == [['Minka', None], ['Tiger', '2022-06-12']], f'a date in the past is saved, a pet without one has no field ({saved})')
    await pg.click('#sheet [data-action=edit-pet]:nth-of-type(2)')
    await idle(pg)
    again = await pg.evaluate(BIRTHDAY)
    check(again['value'] == '2022-06-12' and again['open'], f'opened again the editor shows the birthday ({again})')
    await pg.fill('#f-birthday', '')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    cleared = await state(pg, "db.pets.map(p => 'birthday' in p)")
    check(cleared == [False, False], f'cleared, the field goes ({cleared})')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()

    # The editor as a page in the dark, with a large system font: the field in one piece
    ctx = await phone(browser, scheme='dark', width=360, height=800)
    pg, errors = await open_page(ctx, url, scheme='dark')
    await pg.evaluate(OVERVIEW_DB)
    await idle(pg)
    await pg.evaluate(BIG_TEXT, 1.3)
    await settings(pg)
    await pg.click('#sheet [data-action=add-pet]')
    await idle(pg)
    big = await pg.evaluate(BIRTHDAY)
    field = await pg.evaluate(
        """(() => { const f = document.querySelector('#f-birthday'), l = [...document.querySelectorAll('#sheet .label')].find(x => x.innerText === 'Geburtstag');
          const r = f.getBoundingClientRect(), n = document.querySelector('#f-name').getBoundingClientRect();
          return [!!l && l.getBoundingClientRect().bottom <= r.top, Math.round(r.height) >= 44, Math.round(r.width) === Math.round(n.width), r.top > n.bottom]; })()"""
    )
    check(
        big['pick'] and not big['wide'] and field == [True, True, True, True],
        f'in the dark with a large font: the label „Geburtstag“ above the field, the field as wide as the name field and under it, nothing wider than the screen ({field}, {big})',
    )
    await shot(pg, 'pet-birthday-dark-big')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()

    # The overview: today with the age, tomorrow, in three days, and nothing four days ahead
    ctx = await phone(browser, width=360, height=800, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-09T12:00:00+02:00')
    await pg.evaluate(OVERVIEW_DB)
    await idle(pg)
    lines = [await pg.evaluate(BIRTHDAY_LINES, d) for d in ('2022-06-09', '2026-06-09', '2022-06-10', '2022-06-12', '2022-06-13', None)]
    said = [x[-1] for x in lines]
    want = [
        await pg.evaluate(LINE, ['birthdayAge', {'pet': 'Minka', 'age': 4}]),
        await pg.evaluate(LINE, ['birthdayToday', {'pet': 'Minka'}]),
        await pg.evaluate(LINE, ['birthdayTomorrow', {'pet': 'Minka'}]),
        await pg.evaluate(LINE, ['birthdaySoon', {'pet': 'Minka', 'days': '3 Tagen'}]),
    ]
    cats = await told_facts(pg, 'Katze')
    check(
        said[:4] == want and said[4] in cats and said[5] in cats and [len(x) for x in lines] == [2] * 6,
        f'the overview: the birthday with the age, born this year without, tomorrow, in three days; four days ahead the line is something else ({said})',
    )
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_milestones(browser, url):
    print('milestones in the toast')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    FILL = """([n, sorts]) => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now();
      d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
      d.products = Array.from({length: sorts + 1}, (_, i) => ({id: 'sorte' + String(i).padStart(5, '0'), brand: 'Marke', variety: 'Sorte ' + i, type: 'Nassfutter', codes: {}, createdAt: 1}));
      d.servings = Array.from({length: n}, (_, i) => ({id: 'meal' + String(i).padStart(6, '0'), productId: d.products[i % sorts].id, servedAt: now - (i + 1) * 36e5, note: '', pets: {minka00001: {r: 'top', at: now}}}));
      s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""

    def serve(i):
        return pg.evaluate(f"import('./js/logic/feeding.js').then(f => f.serveProduct('sorte{i:05d}'))")

    def toast():
        return pg.eval_on_selector('#toast', 't => [t.querySelector("span").innerText, !!t.querySelector("[data-action=undo]")]')

    await pg.evaluate(FILL, [99, 9])
    await idle(pg)
    await serve(0)
    await idle(pg)
    t1 = await toast()
    check(
        t1 == ['Sorte 0 serviert. Zum 100. Mal gefüttert!', True],
        f'when serving reaches a threshold it appears in the toast, and „Rückgängig“ stays ({t1})',
    )
    await shot(pg, 'milestone')
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    await serve(0)
    await idle(pg)
    t2 = await toast()
    check(
        t2 == ['Sorte 0 serviert', True] and await state(pg, "prefs.milestones.includes('meals:100')"),
        f'every threshold only once per device, after „Rückgängig“ too ({t2})',
    )
    await serve(9)
    await idle(pg)
    t3 = await toast()
    check(t3 == ['Sorte 9 serviert. 10 Sorten probiert!', True], f'the tenth variety tried ({t3})')
    # Settings without milestones: what is already reached counts as seen
    await pg.evaluate(FILL, [250, 10])
    await idle(pg)
    await pg.evaluate("import('./js/store.js').then(s => { delete s.prefs.milestones; s.savePrefs(); })")
    await idle(pg)
    await pg.reload()
    await started(pg)
    first = await state(pg, 'prefs.milestones')
    await pg.evaluate("import('./js/store.js').then(s => { s.db.servings.pop(); s.save(); })")
    await serve(1)
    await idle(pg)
    t4 = await toast()
    check(
        first == ['meals:50', 'meals:100', 'meals:250', 'sorts:10'] and t4 == ['Sorte 1 serviert', True],
        f'without remembered milestones what is reached counts as seen ({first}, {t4})',
    )
    # Passed by another phone: silently seen, no wrong sentence
    await pg.evaluate(FILL, [520, 10])
    await idle(pg)
    await pg.evaluate("import('./js/store.js').then(s => { s.prefs.milestones = ['meals:50', 'sorts:10']; })")
    await serve(1)
    await idle(pg)
    t5 = await toast()
    check(
        t5 == ['Sorte 1 serviert', True] and await state(pg, "prefs.milestones.includes('meals:500')"),
        f'thresholds already passed count silently as seen ({t5})',
    )
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


# The rating reminder: the switch in its row, the line under the title, and the steps that stand under the row
# while it is on, each of them one row wide and not cut off.
REMIND_ROW = """() => { const row = [...document.querySelectorAll('#sheet .set-row')].find(r => r.querySelector('.t-main b')?.innerText === 'Ans Bewerten erinnern');
  const out = {on: row.getAttribute('aria-checked'), sub: row.querySelector('.t-main small').innerText, seg: []};
  const seg = row.nextElementSibling?.querySelector('.seg');
  if (!seg) return out;
  const lines = new Set([...seg.children].map(b => Math.round(b.getBoundingClientRect().top))).size, widths = [...seg.children].map(b => Math.round(b.getBoundingClientRect().width));
  out.seg = [...seg.querySelectorAll('button')].map(b => [b.innerText.trim(), b.getAttribute('aria-pressed'), b.dataset.action,
    lines === 1 && new Set(widths).size === 1 && b.scrollWidth <= b.clientWidth]);
  return out; }"""


async def test_reminders(browser, url):
    print('the rating reminder (plugin simulated)')
    ctx = await phone(browser)
    await fixed_clock(ctx)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=demo]')
    await debounced(pg)
    await pg.evaluate(
        """import('./js/store.js').then(async s => { s.db.pets.push({id: 'tigerpet01', name: 'Tiger', species: 'Katze', createdAt: Date.now()}); s.save(); (await import('./js/views/home.js')).renderHome(); })"""
    )

    def pending():
        return pg.evaluate('window.Capacitor.Plugins.LocalNotifications.getPending().then(r => r.notifications)')

    def calls(name):
        return pg.evaluate(f"window.__calls.filter(c => c[0] === '{name}').map(c => c[1])")

    await settings(pg, None, debounced)
    r = await pg.evaluate(REMIND_ROW)
    check(
        r == {'on': 'false', 'sub': 'Nach dem Füttern, auf diesem Handy', 'seg': []} and await state(pg, 'prefs.remind') == 0,
        f'settings: „Ans Bewerten erinnern“ is a switch, off, and while it is off there is no choice of hours ({r})',
    )
    await shot(pg, 'settings-reminder')
    await pg.click('#sheet [data-action=remind-on]')
    await debounced(pg)
    r = await pg.evaluate(REMIND_ROW)
    toast = await pg.inner_text('#toast')
    check(
        len(await calls('requestPermissions')) == 1
        and await state(pg, 'prefs.remind') == 0
        and r['on'] == 'false'
        and r['sub'] == 'Benachrichtigungen sind nicht erlaubt'
        and 'nicht erlaubt' in toast,
        f'switching it on asks for the permission; denied, the switch goes back and the row says why ({r["sub"]})',
    )
    await pg.evaluate("localStorage.removeItem('__notifyPermission'); localStorage.setItem('__notifyAnswer', 'granted')")
    await pg.click('#sheet [data-action=remind-on]')
    await debounced(pg)
    r = await pg.evaluate(REMIND_ROW)
    await pg.reload()
    await started(pg)
    check(
        r['on'] == 'true'
        and [x[0] for x in r['seg']] == ['1 Std.', '3 Std.', '6 Std.', 'Eigene']
        and all(x[3] for x in r['seg'])
        and r['seg'][1][1] == 'true'
        and await state(pg, 'prefs.remind') == 180,
        f'granted: the switch turns on with 3 Std., and the steps stand under it in one row ({[x[0] for x in r["seg"]]})',
    )
    # Serving schedules one, at an approximate time without an exact alarm
    await pg.click('#fab')
    await debounced(pg)
    await pg.click('.plist [data-action=serve]')
    await debounced(pg)
    s = await state(
        pg,
        '(s => ({id: s.id, at: s.servedAt, name: db.products.find(p => p.id === s.productId).variety, pets: Object.keys(s.pets).map(id => db.pets.find(p => p.id === id).name)}))(db.servings[0])',
    )
    notes = await pending()
    n = notes[0] if notes else {}
    due = await pg.evaluate('t => new Date(t).getTime()', n.get('schedule', {}).get('at'))
    check(
        len(notes) == 1
        and n['title'] == 'Wie war’s?'
        and n['body'] == f'{s["name"]} für {" und ".join(s["pets"])}'
        and due == s['at'] + 180 * 60000
        and n['extra']['serving'] == s['id']
        and n['isExactNotification'] is False
        and isinstance(n['id'], int)
        and 0 < n['id'] < 2**31,
        f'serving schedules the notification for the serving time plus the interval, title „Wie war’s?“, body „{n.get("body")}“, without an exact alarm',
    )
    # A tap opens the meal in the sheet
    await pg.evaluate("n => window.__tapNote({actionId: 'tap', notification: n})", n)
    await debounced(pg)
    opened = await pg.evaluate("import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.id])")
    check(
        opened == [True, 'serving', s['id']] and await pg.locator('#sheet .slider-track button').count() == 6 * len(s['pets']),
        f'a tap on the notification opens that meal\u2019s sheet for rating ({opened[1]})',
    )
    # Rating: only once every pet is rated is it cancelled
    if len(s['pets']) > 1:
        await pg.click('#sheet .pet-rate:nth-child(1 of .pet-rate) [data-r=top]', force=True)
        await debounced(pg)
        half = len(await pending())
        await pg.click('#sheet .pet-rate:nth-child(2 of .pet-rate) [data-r=gut]', force=True)
        await debounced(pg)
    else:
        half = 1
        await pg.click('#sheet [data-r=top]', force=True)
        await debounced(pg)
    check(
        half == 1 and await pending() == [] and any(c[0]['id'] == n['id'] for c in await calls('cancelNotes')),
        'fully rated: the reminder is cancelled, and not before',
    )
    # Unknown food, a meal that is too old, deleted, the time changed, the interval changed, switched off
    PLAN = """([id, ago, productId]) => import('./js/store.js').then(async s => { const t = Date.now() - ago * 60000;
      const x = {id, productId, servedAt: t, note: '', pets: {[s.db.pets[0].id]: {r: null, at: null}}}; s.db.servings.unshift(x); s.save();
      (await import('./js/logic/reminders.js')).planReminder(x); return t; })"""
    t0 = await pg.evaluate(PLAN, ['ohnesorte001', 2, None])
    await debounced(pg)
    await pg.evaluate(PLAN, ['zualt0000001', 11, None])
    await debounced(pg)
    notes = await pending()
    hhmm = await pg.evaluate("t => import('./js/dates.js').then(d => d.timeStr(t))", t0)
    check(
        [x['extra']['serving'] for x in notes] == ['ohnesorte001'] and notes[0]['body'] == f'Futter von {hhmm} für Mau',
        f'unknown food: „{notes[0]["body"] if notes else ""}“; meals older than 10 minutes get no reminder',
    )
    lachs = await state(pg, "db.products.find(p => p.variety === 'Lachs in Soße').id")
    await pg.evaluate(
        f"import('./js/store.js').then(s => {{ const x = s.db.servings.find(v => v.id === 'ohnesorte001'); x.productId = '{lachs}'; x.servedAt -= 5 * 60000; s.save(); }})"
    )
    await debounced(pg)
    notes = await pending()
    due = await pg.evaluate('t => new Date(t).getTime()', notes[0]['schedule']['at'])
    check(
        len(notes) == 1 and notes[0]['body'] == 'Lachs in Soße für Mau' and due == t0 - 5 * 60000 + 180 * 60000,
        'the variety recognised or the time changed: the reminder moves along',
    )
    await settings(pg, None, debounced)
    await pg.click('#sheet [data-action=remind][data-v="360"]')
    await debounced(pg)
    due60 = await pg.evaluate('t => new Date(t).getTime()', (await pending())[0]['schedule']['at'])
    await pg.click('#sheet [data-action=remind-on]')
    await debounced(pg)
    off = await pending()
    check(
        due60 == t0 - 5 * 60000 + 360 * 60000 and off == [] and await calls('requestPermissions') == [],
        'a different step reschedules and the switch cancels everything; once the permission is granted the app does not ask again',
    )
    await pg.click('#sheet [data-action=remind-on]')
    await debounced(pg)
    check(await state(pg, 'prefs.remind') == 360, 'switching it on again takes the step last chosen')
    await pg.click('#sheet [data-action=remind][data-v="60"]')
    await debounced(pg)
    await settings_back(pg, debounced)
    await pg.evaluate(PLAN, ['loeschen0001', 0, lachs])
    await debounced(pg)
    before = len(await pending())
    await pg.evaluate(
        "import('./js/logic/editing.js').then(async e => { (await import('./js/ui/sheet.js')).openSheet({kind: 'serving', id: 'loeschen0001'}); e.deleteServing('loeschen0001'); })"
    )
    await debounced(pg)
    check(before == 1 and await pending() == [], 'meal deleted: the reminder is cancelled')
    # Reconciling at start-up: anything scheduled without an open meal goes, what is open stays
    await pg.evaluate(PLAN, ['bleibt000001', 1, lachs])
    await debounced(pg)
    await pg.evaluate("""localStorage.setItem('__notes', JSON.stringify([...JSON.parse(localStorage.getItem('__notes')), {id: 4711, title: 'Wie war’s?', body: 'alt', extra: {serving: 'gibtsnicht01', at: 1}},
      {id: 4712, title: 'Wie war’s?', body: 'alt', extra: {serving: 'ohnesorte001', at: 1}}]))""")
    await pg.evaluate(
        "import('./js/store.js').then(s => { const x = s.db.servings.find(v => v.id === 'ohnesorte001'); x.pets[Object.keys(x.pets)[0]] = {r: 'top', at: Date.now()}; s.save(); })"
    )
    await pg.evaluate(
        "localStorage.setItem('__notes', JSON.stringify([...JSON.parse(localStorage.getItem('__notes')).filter(n => n.id !== 4712), {id: 4712, title: 'Wie war’s?', body: 'alt', extra: {serving: 'ohnesorte001', at: 1}}]))"
    )
    await debounced(pg)
    await pg.evaluate(
        "sessionStorage.setItem('__launchNote', JSON.stringify({actionId: 'tap', notification: {id: 1, extra: {serving: 'bleibt000001'}}}))"
    )
    await pg.reload()
    await started(pg)
    left = [x['extra']['serving'] for x in await pending()]
    opened = await pg.evaluate("import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.id])")
    check(left == ['bleibt000001'], f'at start-up the app reconciles: reminders without an open meal are cancelled and the open one stays ({left})')
    check(opened == [True, 'serving', 'bleibt000001'], f'a tap on a cold start opens the meal ({opened})')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_remind(browser, url):
    print('reminder: your own interval in hours')
    ctx = await phone(browser)
    await fixed_clock(ctx)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('[data-action=demo]')
    await debounced(pg)
    await settings(pg, None, debounced)
    check(await pg.locator('#f-remind').count() == 0, 'while the reminder is off there is no number field')
    await pg.click('[data-action=remind-on]')
    await debounced(pg)
    await pg.click('[data-action=remind][data-v="60"]')
    await debounced(pg)
    await pg.click('[data-action=remind-own]')
    await debounced(pg)
    f = await pg.eval_on_selector('#f-remind', 'f => [f.type, f.min, f.max, f.step, f.value, f.labels[0]?.innerText, f.className]')
    on = await pg.eval_on_selector_all('#sheet [data-action^=remind][aria-pressed=true]', 'l => l.map(b => b.innerText.trim())')
    check(
        f == ['number', '1', '24', '1', '1', 'Stunden nach dem Füttern', 'field'] and on == ['Eigene'] and await state(pg, 'prefs.remind') == 60,
        f'„Eigene“ shows a number field for whole hours from 1 to 24, starting at the step chosen; stored in minutes ({f})',
    )
    await shot(pg, 'reminder-own')
    await pg.evaluate("document.getElementById('f-remind').__same = true")
    await pg.fill('#f-remind', '5')
    await debounced(pg)
    same = await pg.evaluate("[document.getElementById('f-remind').__same === true, document.activeElement.id]")
    check(
        await state(pg, 'prefs.remind') == 300 and same == [True, 'f-remind'],
        f'5 typed in: 300 minutes take effect at once and the field stays put while typing ({same})',
    )
    for bad in ('30', '0', ''):
        await pg.fill('#f-remind', bad)
        await debounced(pg)
    check(await state(pg, 'prefs.remind') == 300, 'values outside 1 to 24 change nothing')
    await pg.press('#f-remind', 'Enter')
    await debounced(pg)
    check(await pg.input_value('#f-remind') == '5', 'leaving the field: it shows the current value again')
    await settings_back(pg, debounced)
    await pg.click('#fab')
    await debounced(pg)
    await pg.click('.plist [data-action=serve]')
    await debounced(pg)
    due = await pg.evaluate('window.Capacitor.Plugins.LocalNotifications.getPending().then(r => new Date(r.notifications[0].schedule.at).getTime())')
    check(due == await state(pg, 'db.servings[0].servedAt') + 5 * 3600e3, 'it is scheduled for the serving time plus 5 hours')
    await pg.reload()
    await started(pg)
    await settings(pg, None, debounced)
    on = await pg.eval_on_selector_all('#sheet [data-action^=remind][aria-pressed=true]', 'l => l.map(b => b.innerText.trim())')
    check(on == ['Eigene'] and await pg.input_value('#f-remind') == '5', f'after the restart: „Eigene“ with 5 hours ({on})')
    await pg.click('#sheet [data-action=remind][data-v="180"]')
    await debounced(pg)
    check(await pg.locator('#f-remind').count() == 0 and await state(pg, 'prefs.remind') == 180, 'a fixed step hides the field again')
    await pg.evaluate("localStorage.setItem('__notifyPermission', 'denied'); localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=remind-own]')
    await debounced(pg)
    r = await pg.evaluate(REMIND_ROW)
    check(
        r['on'] == 'false' and r['seg'] == [] and await pg.locator('#f-remind').count() == 0 and 'nicht erlaubt' in await pg.inner_text('#toast'),
        f'without the permission even „Eigene“ leaves the reminder off ({r})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


FEED_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), at = (day, time) => new Date(`2026-06-${String(day).padStart(2, '0')}T${time}`).getTime();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['nass', 'Lachs', 'Nassfutter'], ['snack', 'Käse', 'Snack']].map(([id, variety, type]) => ({id: id + '000001', brand: 'Sheba', variety, type, codes: {}, createdAt: 1}));
  d.servings = [3, 4, 5, 6, 7, 8, 9].flatMap(day => [[day, '07:15'], [day, '18:30']]).map(([day, time], i) => ({id: 'meal0000' + String(i).padStart(2, '0'), productId: 'nass000001', servedAt: at(day, time), note: '',
    pets: {minka00001: {r: 'gut', at: at(day, time)}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_feed_remind(browser, url):
    print('the feeding reminder: the usual times from the history, handed to our own plugin, which asks the household server first')
    ctx = await phone(browser, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url, native=True)
    await pg.clock.set_fixed_time('2026-06-10T12:00:00+02:00')
    SET = "JSON.parse(localStorage.getItem('__feed') || '{\"reminders\": []}')"
    PENDING = f"(() => {{ const t = x => new Date(x).toLocaleString('sv').slice(5, 16); return {SET}.reminders.map(r => [r.key, t(r.at), t(r.since), r.title, r.body, r.sure]).sort(); }})()"
    SECTION = """() => { const r = document.querySelector('#sheet [data-action=feed-remind]');
      return [r.querySelector('.t-main b').innerText, r.querySelector('.t-main small').innerText, r.getAttribute('aria-checked')]; }"""
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await settings(pg)
    empty = await pg.evaluate(SECTION)
    check(
        empty == ['Ans Füttern erinnern', 'Lernt die üblichen Zeiten aus dem Verlauf', 'false'],
        f'settings: below „Ans Bewerten erinnern“ comes „Ans Füttern erinnern“, a switch, off by default; without a history its line says where the times come from ({empty})',
    )
    await settings_back(pg)
    # A feeding reminder left over from 0.10, when LocalNotifications held them, goes on the next reconcile
    await pg.evaluate(
        "localStorage.setItem('__notes', JSON.stringify([{id: 99, title: 'Schon gefüttert?', body: 'alt', extra: {feed: '2026-06-10|1110', at: 1}}]))"
    )
    await pg.evaluate(FEED_DB)
    await idle(pg)
    await settings(pg)
    before = await pg.evaluate(SECTION)
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=feed-remind]')
    await debounced(pg)
    denied = [await state(pg, 'prefs.feedRemind'), 'nicht erlaubt' in await pg.inner_text('#toast'), await pg.evaluate(PENDING)]
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'granted'); localStorage.setItem('__notifyPermission', 'prompt')")
    await pg.click('[data-action=feed-remind]')
    await debounced(pg)
    sec, plan, handed = await pg.evaluate(SECTION), await pg.evaluate(PENDING), await pg.evaluate(SET)
    check(
        denied == [False, True, []]
        and before[1] == 'Meist um 07:15 und 18:30 Uhr'
        and sec[1:] == ['Meist um 07:15 und 18:30 Uhr', 'true']
        and await state(pg, 'prefs.feedRemind') is True,
        f'switching it on asks for the permission and stays off without it; the line names the learnt times ({before[1]} / {sec[1]})',
    )
    note = ['Schon gefüttert?', 'Um diese Zeit gibt es sonst Futter für Minka.']
    evening = note + ['Heute Abend ist noch nichts eingetragen. Um diese Zeit gibt es sonst Futter für Minka.']
    morning = note + ['Heute Morgen ist noch nichts eingetragen. Um diese Zeit gibt es sonst Futter für Minka.']
    check(
        plan
        == [
            ['2026-06-10|1110', '06-10 19:15', '06-10 17:30'] + evening,
            ['2026-06-11|1110', '06-11 19:15', '06-11 17:30'] + evening,
            ['2026-06-11|435', '06-11 08:00', '06-11 06:15'] + morning,
            ['2026-06-12|1110', '06-12 19:15', '06-12 17:30'] + evening,
            ['2026-06-12|435', '06-12 08:00', '06-12 06:15'] + morning,
        ]
        and 'server' not in handed
        and 'code' not in handed
        and await pg.evaluate("JSON.parse(localStorage.getItem('__notes') || '[]').filter(n => n.extra?.feed).length") == 0,
        f'one per usual time 45 minutes later for today and two days ahead, each with the hour before the usual time it asks about and the text for when nobody has entered anything; without a household no server goes along; this morning\u2019s time has passed; the old reminder is gone ({[x[:3] for x in plan]})',
    )
    await shot(pg, 'settings-feed-reminder')
    await settings_back(pg)
    # In a household the plugin gets the server and the code, so it can ask whether someone else has fed
    house = await pg.evaluate("""import('./js/store.js').then(async s => { const r = await import('./js/logic/reminders.js');
      s.prefs.code = 'K7PM-3QXD'; s.prefs.server = 'http://192.168.178.20:8486'; r.syncReminders();
      await new Promise(done => setTimeout(done, 400)); const set = JSON.parse(localStorage.getItem('__feed'));
      s.prefs.code = ''; s.prefs.server = ''; r.syncReminders(); await new Promise(done => setTimeout(done, 400));
      return [set.server, set.code, set.reminders.length, 'server' in JSON.parse(localStorage.getItem('__feed'))]; })""")
    check(
        house == ['http://192.168.178.20:8486', 'K7PM-3QXD', 5, False],
        f'connected, the server and the household code go along to the plugin, and go again on disconnecting ({house})',
    )
    await pg.clock.set_fixed_time('2026-06-10T18:00:00+02:00')
    await pg.evaluate("import('./js/logic/feeding.js').then(f => f.serveProduct('snack000001'))")
    await debounced(pg)
    snack = [len(await pg.evaluate(PENDING)), await pg.evaluate(f'{SET}.dismiss.length')]
    await pg.evaluate("import('./js/logic/feeding.js').then(f => f.serveProduct('nass000001'))")
    await debounced(pg)
    fed = [x[0] for x in await pg.evaluate(PENDING)]
    check(
        snack == [5, 0]
        and fed == ['2026-06-11|1110', '2026-06-11|435', '2026-06-12|1110', '2026-06-12|435']
        and await pg.evaluate(f'{SET}.dismiss.length') == 2,
        f'a treat changes nothing, while a meal at the usual time drops today\u2019s reminder, and takes back today\u2019s reminders should they already be shown ({snack}, {fed})',
    )
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://feed'})")
    await idle(pg)
    check(await pg.locator('#sheet [data-action=scan]').count() == 1, 'a tap on the reminder opens the feeding sheet through schmeckts://feed')
    await pg.click('[data-action=close]')
    await idle(pg)
    await settings(pg)
    await pg.click('[data-action=feed-remind]')
    await debounced(pg)
    check(await pg.evaluate(PENDING) == [] and await state(pg, 'prefs.feedRemind') is False, 'switched off: the plugin holds none')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_petbar(browser, url):
    print('home page: the order, and the pet bar only from two pets on')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await pg.evaluate("""import('./js/store.js').then(async s => { s.db.servings.unshift({id: 'offen0000001', productId: s.db.products[0].id, servedAt: Date.now() - 60000, note: '',
      pets: {[s.db.pets[0].id]: {r: null, at: null}}}); s.save(); (await import('./js/views/home.js')).renderHome(); })""")
    order = await pg.evaluate("""[...document.querySelectorAll('.app > *, #home > *')].filter(e => e.id !== 'home' && e.getClientRects().length)
      .map(e => e.matches('header') ? 'header' : e.id === 'pets' ? 'pets' : e.querySelector('h2')?.innerText ?? e.tagName)""")
    hint = [x for x in order if x in ('Appetit', 'Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    check(
        order == ['header', 'Mau', 'Wie war’s?'] + hint + ['Verlauf', 'Einkaufen', 'Vorlieben'] and len(hint) == 1,
        f'one pet: no pet bar; overview, „Wie war’s?“, hint, „Verlauf“, „Einkaufen“, „Vorlieben“ ({order})',
    )
    check(await pg.locator('#pets').is_hidden() and await pg.locator('#pets *').count() == 0, 'with one pet there is no filter')
    await shot(pg, 'home-one-pet')
    await settings(pg)
    await pg.click('#sheet [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Tiger')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await settings_back(pg)
    bar = await pg.eval_on_selector_all('#pets .pet', 'l => l.map(b => [b.innerText.trim(), b.getAttribute("aria-pressed")])')
    order = await pg.evaluate("[...document.querySelectorAll('.app > *')].filter(e => e.getClientRects().length).map(e => e.id || e.tagName)")
    check(
        bar == [['Alle', 'true'], ['Mau', 'false'], ['Tiger', 'false'], ['Neu', None]] and order == ['HEADER', 'pets', 'home'],
        f'a second pet created in the settings: the pet bar appears, right at the top ({[b[0] for b in bar]})',
    )
    await pg.click('#pets .pet:nth-child(2)')
    await idle(pg)
    check(await state(pg, 'prefs.activePet === db.pets[0].id'), 'the bar filters')
    await shot(pg, 'home-two-pets')
    await pg.evaluate(
        "import('./js/logic/pets.js').then(async p => { (await import('./js/ui/sheet.js')).openSheet({kind: 'pet', id: (await import('./js/store.js')).db.pets[1].id}); p.deletePet(); })"
    )
    await idle(pg)
    check(await pg.locator('#pets').is_hidden(), 'back to one pet: the bar disappears')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


SERVER_WORDS = re.compile(r'server|abgleich|abgeglichen|erkennung|erkannt|erkenn(en|t)\b')  # nowhere to be seen in mode `lokal`


PRIVACY = [
    'Tiere, Futter und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.',
    'Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.',
    'Den Text auf einer Packung liest das Handy selbst, ohne Netz. Mehr kann die Produktsuche im Internet unter „Scannen“, sie ist aus: Sie fragt bei unbekannten Barcodes zwei freie Produktdatenbanken, übertragen wird nur die Nummer.',
    'Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Dort liegen auch die Packungsfotos, damit jedes Handy sie groß zeigen kann. Zur Erkennung schickt der Server sie an Anthropic, unbekannte Barcodes, nur die Nummer, an freie Produktdatenbanken. Die Foto-Erkennung lässt sich unter „Scannen“ abschalten.',
    'Ein Backup und das Löschen aller Daten findest du unter „Daten“. „Austausch von Hand“ unter „Teilen“ gibt eine Datei mit Tieren, Futter und Mahlzeiten an ein anderes Handy weiter, ohne Server.',
    'Beim Lesen einer Packung berichtigt das Handy falsch gelesene Wörter mit einer Wortliste. Sie enthält Informationen aus Open Pet Food Facts, die hier unter der Open Database License (ODbL) verfügbar gemacht werden.',
]


async def texts(pg):
    """every visible text including placeholders and labels for screen readers"""
    return await pg.evaluate("""[document.body.innerText, ...[...document.querySelectorAll('[placeholder], [aria-label], [title]')]
      .map(e => [e.placeholder, e.getAttribute('aria-label'), e.title].join(' '))].join('\\n').toLowerCase()""")


async def test_modes(browser, url):
    print('modes: first start, existing installations, `lokal` without any trace of the server')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True, choose=False)
    btns = await pg.eval_on_selector_all('.welcome button, .welcome a, .welcome label', 'l => l.map(b => [b.innerText.trim(), b.dataset.action])')
    check(
        btns == [['Nur auf diesem Handy', 'mode-local'], ['Mit Haushalt verbinden', 'connect-form']]
        and await state(pg, 'prefs.mode') == ''
        and await pg.locator('#fab').is_hidden(),
        f'first start: the welcome page offers exactly two buttons ({[b[0] for b in btns]})',
    )
    await shot(pg, 'first-start')
    await pg.click('[data-action=connect-form]')
    await idle(pg)
    form = await pg.evaluate("""[document.getElementById('sheet').open, document.getElementById('f-server')?.value, document.getElementById('f-server')?.placeholder,
      !!document.getElementById('f-code'), document.activeElement.id]""")
    check(
        form == [True, '', 'http://192.168.… oder https://…', True, 'f-server'] and await state(pg, 'prefs.mode') == '',
        f'„Mit Haushalt verbinden“: address and code, with the address empty and a placeholder ({form})',
    )
    await shot(pg, 'connect-form')
    await pg.fill('#f-code', 'K7PM3QXD')
    await pg.click('[data-action=connect]')
    await idle(pg)
    check(
        'Adresse' in await pg.inner_text('#serverBox .note.warn') and await state(pg, "prefs.code === '' && prefs.mode === ''"),
        'without an address nothing connects: a clear message',
    )
    await settings_back(pg)
    await settings_back(pg)
    await pg.click('[data-action=mode-local]')
    await idle(pg)
    btns = await pg.eval_on_selector_all('.welcome button', 'l => l.map(b => b.dataset.action)')
    check(
        await state(pg, 'prefs.mode') == 'lokal' and btns == ['add-pet', 'demo'],
        f'„Nur auf diesem Handy“: mode `lokal`, on to the first pet ({btns})',
    )
    await pg.reload()
    await started(pg)
    check(
        await state(pg, 'prefs.mode') == 'lokal' and await pg.locator('[data-action=mode-local]').count() == 0,
        'the choice is stored and only asked once',
    )
    await ctx.close()

    # Without a stored mode: connected gives `haushalt`, a phone already in use gives `lokal`
    pet = {'id': 'lxpet00001', 'name': 'Minka', 'species': 'Katze', 'createdAt': 1}
    cases = [
        ('with data, not connected', {'db': {'version': 3, 'pets': [pet], 'products': [], 'servings': []}}, 'lokal'),
        ('settings only, not connected', {'prefs': {'theme': 'dark'}}, 'lokal'),
        (
            'connected',
            {'prefs': {'server': 'http://127.0.0.1:9', 'code': 'K7PM-3QXD'}, 'db': {'version': 3, 'pets': [pet], 'products': [], 'servings': []}},
            'haushalt',
        ),
        ('was connected, code missing', {'prefs': {'server': 'http://127.0.0.1:9', 'code': '', 'mode': 'haushalt'}}, 'lokal'),
    ]
    for name, files, want in cases:
        ctx, pg, errors = await seeded(browser, url, files)
        got = await state(pg, 'prefs.mode')
        check(got == want and await pg.locator('[data-action=mode-local]').count() == 0, f'{name}: mode `{got}`, nothing asked')
        await ctx.close()

    # Mode `lokal`: no server, sync or recognition anywhere; the photo is saved and the variety typed in directly
    ctx = await phone(browser)
    requests = []
    ctx.on('request', lambda r: requests.append(r.url))
    pg, errors = await open_page(ctx, url, native=True)
    seen = [await texts(pg)]
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    seen.append(await texts(pg))  # „So geht’s“ page
    await settings(pg)
    seen.append(await texts(pg))
    await settings_back(pg)
    await pg.click('#fab')
    await idle(pg)
    seen.append(await texts(pg))
    await pg.evaluate('window.__calls.length = 0')
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await idle(pg)  # the phone reads the text, with no result here
    seen.append(await texts(pg))
    view = await pg.evaluate("""import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.step, document.querySelector('#sheet h2')?.innerText,
      !!document.querySelector('#sheet .name-photo'), document.querySelectorAll('#sheet .note, #sheet .warn, #sheet .spin').length, document.getElementById('toast').innerText.trim()])""")
    s = await state(pg, '(s => [s.status, !!s.photo, !!s.thumb, s.error ?? null])(db.servings[0])')
    heavy = await pg.evaluate("window.__calls.filter(c => c[0] === 'impact' && c[1].style === 'HEAVY').length")
    check(
        view[:6] == [True, 'serving', 'name', 'Futter benennen', True, 0]
        and view[6].startswith('Serviert')
        and 'erkannt' not in view[6]
        and s == ['noserver', True, True, None]
        and heavy == 0,
        f'a photo in mode `lokal`: saved, „Futter benennen“ opens straight away, without a notice and without the error tone ({view}, {s})',
    )
    await shot(pg, 'local-photo-naming')
    await pg.click('[data-action=close]')
    await idle(pg)
    seen.append(await texts(pg))
    row = await pg.eval_on_selector('.pend-head .t-main', "e => [e.innerText.replace(/\\n/g, ' / '), !!e.querySelector('.warn')]")
    check(row == ['Unbekanntes Futter / Tippen zum Benennen', False], f'still without a variety: a neutral row without a warning colour ({row})')
    await pg.click('.pend-head')
    await idle(pg)
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    check(
        await state(pg, 'db.servings[0].productId === db.products[0].id && !db.servings[0].status && !db.servings[0].photo'),
        'variety typed in: named, and the photo stays as the thumbnail on the variety',
    )
    await pg.click('[data-action=close]')
    await idle(pg)
    # Barcodes: an unknown one leads to the photo, and is known afterwards
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = '{base64.b64encode(PACK.read_bytes()).decode()}'; window.__calls.length = 0")
    await pg.click('#fab')
    await idle(pg)
    await pg.click('[data-action=scan]')
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    seen.append(await texts(pg))
    cam = await pg.evaluate("window.__calls.filter(c => c[0] === 'capture').map(c => c[1])")
    view = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet?.kind, m.sheet?.step])")
    check(
        cam == [{'hint': 'Vorderseite fotografieren'}] and view == ['serving', 'name'] and await state(pg, f"db.servings[0].scanCode === '{SHEBA}'"),
        f'an unknown barcode: straight to the photo without asking, then type the variety in ({cam}, {view})',
    )
    await pg.click('#suggest [data-action=use-product]')
    await idle(pg)
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())")
    await idle(pg)
    check(await state(pg, f"!!db.products[0].codes?.['{SHEBA}']"), 'the code hangs on the chosen variety')
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab')
    await idle(pg)
    await pg.click('[data-action=scan]')
    await idle(pg)
    seen.append(await texts(pg))
    check(
        await state(pg, 'db.servings.length') == n + 1
        and await state(pg, 'db.servings[0].productId === db.products[0].id')
        and 'serviert' in (await pg.inner_text('#toast')).lower(),
        'a known barcode: served at once',
    )
    found = sorted({m.group(0) for t in seen for m in SERVER_WORDS.finditer(t)})
    check(
        not found,
        f'mode `lokal`: no trace of server, sync or recognition anywhere (welcome, „So geht’s“, settings, feeding, photo, scanning) {found}',
    )
    check(await pg.locator('#syncChip').is_hidden(), 'no sync notice in the header')
    foreign = [r for r in requests if not r.startswith((url.rsplit('/', 1)[0], 'data:', 'blob:'))]
    check(
        len(requests) > 20 and not foreign and await state(pg, '!prefs.lookup'),
        f'mode `lokal`: not a single network request except to the app itself, as long as the product lookup is off ({len(requests)} requests) {foreign[:3]}',
    )
    await settings(pg)
    data = await pg.evaluate(
        """(() => { const l = [...document.querySelectorAll('#sheet .label')].find(x => x.innerText === 'Daten');
          return [...l.nextElementSibling.querySelectorAll('.set-row')].map(b => b.innerText.trim()).concat(
            [...l.nextElementSibling.nextElementSibling.querySelectorAll('.btn')].map(b => b.innerText.trim())); })()"""
    )
    check(
        data
        == [
            'Backup\nSichern und wieder einlesen',
            'Beispieldaten laden',
            'Datenschutz',
            'Alle Daten löschen',
        ]
        and await pg.locator('#sheet .privacy').count() == 0,
        f'settings: the group „Daten“, and „Alle Daten löschen“ below it, set off ({data})',
    )
    await settings_page(pg, 'privacy')
    got = await pg.evaluate(
        "[document.querySelector('#sheet .page-title').innerText, ...[...document.querySelectorAll('#sheet .privacy p')].map(p => p.innerText)]"
    )
    check(got == ['Datenschutz'] + PRIVACY, f'a tap opens the „Datenschutz“ page with exactly the text laid down ({len(got) - 1} paragraphs)')
    await shot(pg, 'privacy')
    await settings_back(pg)
    await settings_page(pg, 'backup')
    await pg.click('[data-action=export]')
    await idle(pg)
    await pg.click('[data-action=export]')
    await idle(pg)
    gone = [
        c[1]['path']
        for c in await pg.evaluate('window.__calls')
        if c[0] == 'deleteFile' and c[1]['directory'] == 'CACHE' and c[1]['path'].startswith('schmeckts-backup-')
    ]
    check(
        len(gone) == 1 and gone[0].startswith('schmeckts-backup-'),
        f'a shared backup does not linger in the cache: deleted before the next export ({gone})',
    )
    await settings_back(pg)
    await settings_back(pg)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_network(browser, url):
    print('network rule: http on the home network only, https otherwise')
    ok = [
        'http://10.0.0.1:8486',
        '10.255.255.255',
        'http://172.16.0.1',
        'http://172.31.255.254:8486',
        '192.168.178.65:8486',
        'http://192.168.0.1/',
        'http://100.64.0.1',
        'http://100.127.255.255',
        'http://127.0.0.1:8486',
        'http://127.8.9.10',
        'http://localhost:8486',
        'LOCALHOST',
        'http://minipc.local:8486',
        'http://MiniPC.Local',
        'http://server.home.arpa',
        'http://a.b.home.arpa:8486',
        'http://[fc00::1]:8486',
        'http://[fd12:3456:789a::1]',
        'http://[fdff:ffff::1]',
        'http://[fe80::1]:8486',
        'http://[febf::1]',
        'http://3232235777',
        'https://example.com',
        'https://8.8.8.8:8486',
        'https://[2001:db8::1]',
        'https://172.32.0.1',
    ]
    bad = [
        'http://9.255.255.255',
        'http://11.0.0.1',
        'http://172.15.255.255:8486',
        'http://172.32.0.1:8486',
        'http://192.167.1.1',
        'http://192.169.1.1',
        'http://100.63.255.255',
        'http://100.128.0.1',
        'http://126.0.0.1',
        'http://128.0.0.1',
        'http://8.8.8.8',
        'example.com',
        'http://example.com:8486',
        'http://local',
        'http://notlocal',
        'http://evil-local',
        'http://home.arpa',
        'http://xhome.arpa',
        'http://minipc.local.example.com',
        'http://localhost.example.com',
        'http://[2001:db8::1]:8486',
        'http://[2a02:8109::1]',
        'http://[fbff::1]',
        'http://[fe00::1]',
        'http://[fec0::1]',
        'http://[::1]',
        'http://[::ffff:192.168.1.1]',
        'http://[fc]',
        'http://10.0.0.1.example.com',
    ]
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    got = await pg.evaluate(
        """([ok, bad]) => import('./js/api.js').then(a => { const run = v => { try { return a.normServer(v); } catch (e) { return e.kind + ': ' + e.message; } };
      return [ok.map(run), bad.map(run), run(''), run('  192.168.1.20:8486// ')]; })""",
        [ok, bad],
    )
    wrong = [ok[i] for i, v in enumerate(got[0]) if not v.startswith('http')]
    check(
        not wrong,
        f'allowed: http on the home network (10/8, 172.16/12, 192.168/16, 100.64/10, 127/8, fc00::/7, fe80::/10, localhost, *.local, *.home.arpa), https everywhere {wrong}',
    )
    msg = 'input: Außerhalb des Heimnetzes geht es nur mit https.'
    wrong = [bad[i] for i, v in enumerate(got[1]) if v not in (msg, 'input: Das ist keine gültige Adresse.')]
    check(
        not wrong and got[1][:3] == [msg] * 3,
        f'rejected: http outside, at the boundaries too (172.15.x, 172.32.x, 100.63.x, 100.128.x, public IPv6, similar names) {wrong}',
    )
    check(got[2:] == ['', 'http://192.168.1.20:8486'], f'empty stays empty, and http when none is given ({got[2:]})')
    # While connecting
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if '/api/' in r.url else None)
    await settings(pg, 'house')
    await pg.click('#serverBox [data-action=connect-form]')
    await idle(pg)
    await pg.fill('#f-server', 'http://schmeckts.example.com:8486')
    await pg.fill('#f-code', 'K7PM-3QXD')
    await pg.click('[data-action=connect]')
    await idle(pg)
    note = await pg.inner_text('#serverBox .note.warn')
    check(
        note.strip() == 'Außerhalb des Heimnetzes geht es nur mit https.'
        and not asked
        and await state(pg, "prefs.code === '' && prefs.mode === 'lokal'"),
        f'connecting to another http address: „{note.strip()}“, and no request goes out',
    )
    await shot(pg, 'connect-https-only')
    await ctx.close()
    # Every request: a stored address outside the home network is never asked
    ctx, pg, errors = await seeded(
        browser,
        url,
        {'prefs': {'server': 'http://93.184.216.34:8486', 'code': 'K7PM-3QXD'}, 'db': {'version': 3, 'pets': [], 'products': [], 'servings': []}},
        native=True,
    )
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if '/api/' in r.url else None)
    res = await pg.evaluate("""Promise.all([import('./js/api.js'), import('./js/recognize.js'), import('./js/sync.js')]).then(async ([a, r, s]) => { const out = [];
      for (const run of [() => a.request('GET', '/api/info'), () => a.request('POST', '/api/push', {body: {}}), () => r.lookupBarcode('4008429087455'), () => r.recognize('AAAA'), () => s.retrySync().then(() => { throw s.status; })])
        out.push(await run().then(() => 'sent', e => `${e.kind}: ${e.message}`));
      return out; })""")
    msg = 'Außerhalb des Heimnetzes geht es nur mit https.'
    check(
        all(msg in x for x in res) and not asked,
        f'holds for every request (info, send, barcode, recognition, sync): rejected, and nothing goes out ({res[0]}, {asked})',
    )
    await ctx.close()


async def test_shortcuts(browser, url):
    print('shortcuts and deep links in the Android files')
    A = '{http://schemas.android.com/apk/res/android}'
    root = ET.parse(ROOT / 'app/native/res/xml/shortcuts.xml').getroot()
    links = [s.find('intent').get(A + 'data') for s in root.findall('shortcut')]
    check(
        links == ['schmeckts://feed', 'schmeckts://scan', 'schmeckts://photo'],
        'the static shortcuts „Füttern“, „Scannen“ and „Packung fotografieren“',
    )
    ok = True
    for s in root.findall('shortcut'):
        icon = s.get(A + 'icon').split('/')[1]
        ok &= (ROOT / f'app/native/res/drawable/{icon}.xml').exists()
        for attr in ('shortcutShortLabel', 'shortcutLongLabel'):
            ok &= s.get(A + attr) in (
                '@string/' + n for n in re.findall(r'name="(\w+)"', (ROOT / 'app/native/res/values/strings_shortcuts.xml').read_text())
            )
        ok &= s.find('intent').get(A + 'targetClass') == 'de.schmeckts.app.MainActivity'
    check(ok, 'icons, labels and target of the shortcuts are present')
    prep = (ROOT / 'scripts/prepare.py').read_text()
    check(
        'android:scheme="schmeckts"' in prep
        and 'android.intent.category.BROWSABLE' in prep
        and '@xml/shortcuts' in prep
        and 'registerPlugin(PhotoPlugin.class)' in prep,
        'prepare.py adds the deep-link filter, the shortcuts and the photo plugin to the Android project',
    )
    photo = (ROOT / 'app/native/java/de/schmeckts/app/PhotoPlugin.java').read_text()
    check('ACTION_IMAGE_CAPTURE' in photo and 'hint' in photo, 'the photo plugin uses the system camera, with a hint above it')
    feed = ''.join((ROOT / f'app/native/java/de/schmeckts/app/{n}.java').read_text() for n in ('FeedReminderPlugin', 'FeedReceiver', 'FeedCheck'))
    check(
        'registerPlugin(FeedReminderPlugin.class)' in prep
        and 'android:name=".FeedReceiver" android:exported="false"' in prep
        and 'android.intent.action.BOOT_COMPLETED' in prep
        and 'setAndAllowWhileIdle' in feed
        and 'setExact' not in feed
        and '/api/fed?since=' in feed
        and 'schmeckts://feed' in feed,
        'the feeding reminder: its plugin and receiver registered, inexact alarms set again after a restart, the server asked through /api/fed, a tap opening schmeckts://feed',
    )
    check(
        'com.google.mlkit.vision.DEPENDENCIES' in prep and 'barcode_ui' in prep,
        'prepare.py declares Google\u2019s scanner module in the manifest (barcode_ui)',
    )
    check(
        'android:mimeType="application/json"' in prep and 'android.intent.action.SEND' in prep and 'EXTRA_STREAM' in prep and 'ACTION_VIEW' in prep,
        'prepare.py accepts shared exchange files: an intent filter on the file type, and SEND becomes VIEW',
    )
    check(
        'abiFilters "armeabi-v7a", "arm64-v8a"' in prep and 'x86' in (ROOT / 'scripts/build-apk.sh').read_text(),
        'phones only: prepare.py builds without x86, and build-apk.sh aborts if any end up in the APK',
    )
    build = (ROOT / 'scripts/build-apk.sh').read_text()
    check(
        re.search(r"grep -q '\"android\.permission\.CAMERA\"' <<<\"\$MANIFEST\" \|\| \{[^}]*exit 1", build)
        and '<uses-permission android:name="android.permission.CAMERA" />' in prep
        and 'android:name="android.hardware.camera" android:required="false"' in prep,
        'camera permission: prepare.py puts it in the manifest (no camera required) and build-apk.sh aborts when it is missing',
    )


async def test_scan(browser, url):
    print('scanning (plugins simulated, without a server)')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)

    def is_open():
        return pg.evaluate("document.getElementById('sheet').open")

    def impacts():
        return pg.evaluate("window.__calls.filter(c => c[0] === 'impact').map(c => c[1].style)")

    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    # Cancelling
    await pg.click('[data-action=scan]')
    await idle(pg)
    check(
        ['scan', {'formats': ['EAN_13', 'EAN_8', 'UPC_A']}] in await pg.evaluate('window.__calls'),
        'scanner: scan() only, formats EAN-13, EAN-8, UPC-A',
    )
    check(
        await is_open() and await pg.locator('#sheet [data-action=scan]').count() == 1 and await state(pg, 'db.servings.length') == 0,
        'scanning cancelled: back in the feeding sheet, nothing stored',
    )
    # An unknown code without a server: the camera for the front, and the code waits until the variety is named
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}")
    await pg.click('[data-action=scan]')
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    check(
        ['capture', {'hint': 'Vorderseite fotografieren'}] in await pg.evaluate('window.__calls'),
        'an unknown code without a server: straight to the camera, with the hint „Vorderseite fotografieren“',
    )
    check(
        await state(pg, f"db.servings.length === 1 && db.servings[0].scanCode === '{SHEBA}' && db.servings[0].status === 'noserver'")
        and await pg.locator('#sheet #f-brand').count() == 1,
        'the photo is served, the code sits on the meal, and the variety is typed in right away',
    )
    check(
        await pg.evaluate(
            "Promise.all([import('./js/fields.js'), import('./js/store.js')]).then(([f, m]) => !Object.keys(f.fieldsOf('servings', m.db.servings[0])).some(k => k.startsWith('scan')))"
        ),
        'scanCode stays on the phone and is never synced',
    )
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs in Soße')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    check(await state(pg, f"db.products.length === 1 && db.products[0].codes['{SHEBA}'] === true"), 'named: the code hangs on the named variety')
    await pg.click('[data-action=close]')
    await idle(pg)
    sheba = await state(pg, 'db.products[0].id')
    # A known code: served at once, without a server
    before = len(await impacts())
    await pg.click('#fab')
    await idle(pg)
    await pg.click('[data-action=scan]')
    await idle(pg)
    check(
        await state(pg, f"db.servings.length === 2 && db.servings[0].productId === '{sheba}' && db.servings[0].scanCode === '{SHEBA}'")
        and not await is_open(),
        'a known code: served at once, without a server',
    )
    check(
        'MEDIUM' in (await impacts())[before:]
        and 'Lachs in Soße serviert' in await pg.inner_text('#toast')
        and await pg.locator('#toast [data-action=undo]').count() == 1,
        'with haptics and a toast including undo',
    )
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    check(await state(pg, 'db.servings.length === 1 && db.products.length === 1'), 'undo takes the meal back and the variety stays')
    await shot(pg, 'scan-served')
    # Multipack: scanned, then changed to another variety, after which the code hangs on both
    await pg.click('#fab')
    await idle(pg)
    await pg.click('[data-action=scan]')
    await idle(pg)
    await pg.locator('.pend-head').first.click()
    await idle(pg)
    await pg.click('[data-action=edit-name]')
    await idle(pg)
    await pg.fill('#f-variety', 'Huhn in Gelee')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    check(
        await state(pg, f"db.products.length === 2 && db.products.every(p => p.codes['{SHEBA}'])"),
        'a scanned meal changed to another variety: the code hangs on both (a multipack)',
    )
    await pg.click('[data-action=close]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.click('[data-action=scan]')
    await idle(pg)
    check(
        await is_open()
        and 'Welche Sorte?' in await pg.inner_text('#sheet h2')
        and await pg.locator('#sheet .plist [data-action=serve]').count() == 2,
        'several hits: a short choice of those varieties',
    )
    await shot(pg, 'scan-choice')
    huhn = await state(pg, "db.products.find(p => p.variety === 'Huhn in Gelee').id")
    n = await state(pg, 'db.servings.length')
    await pg.click(f'#sheet [data-action=serve][data-id="{huhn}"]')
    await idle(pg)
    check(
        await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}' && db.servings[0].scanCode === '{SHEBA}'")
        and not await is_open(),
        'the chosen variety is served',
    )
    # Removing a code in the food sheet, with undo
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{sheba}'}}))")
    await idle(pg)
    check(
        await pg.locator(f'#sheet [data-action=remove-code][data-code="{SHEBA}"]').count() == 1 and SHEBA in await pg.inner_text('#sheet'),
        'the food sheet shows the variety\u2019s barcodes',
    )
    await shot(pg, 'scan-food')
    await pg.click('[data-action=remove-code]')
    await idle(pg)
    check(
        await state(pg, f"!db.products.find(p => p.id === '{sheba}').codes['{SHEBA}']")
        and await pg.locator('#sheet [data-action=remove-code]').count() == 0,
        'barcode removed',
    )
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    check(
        await state(pg, f"db.products.find(p => p.id === '{sheba}').codes['{SHEBA}'] === true")
        and await pg.locator('#sheet [data-action=remove-code]').count() == 1,
        'undo attaches it again',
    )
    await pg.click('[data-action=remove-code]')
    await idle(pg)
    await pg.click('[data-action=close]')
    await idle(pg)
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab')
    await idle(pg)
    await pg.click('[data-action=scan]')
    await idle(pg)
    check(
        await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}'") and not await is_open(),
        'after the removal: only one variety left, served at once',
    )
    # UPC-A becomes EAN-13 as on the server, here through the photo plugin without a photo (a cancel)
    await pg.evaluate(f"window.__barcode = '{UPC}'; window.__photo = null")
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab')
    await idle(pg)
    await pg.click('[data-action=scan]')
    await idle(pg)
    check(
        await is_open() and await state(pg, f'db.servings.length === {n}') and await pg.locator('#sheet [data-action=scan]').count() == 1,
        'camera cancelled: back in the feeding sheet',
    )
    # The scanner module is missing: it gets installed, with a short notice
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__scanModule = false")
    await pg.click('[data-action=scan]')
    await idle(pg)
    hint = await pg.inner_text('#sheet .note') if await pg.locator('#sheet .note').count() else ''
    await until(pg, f'db.servings.length === {n + 1}')
    await idle(pg)
    check(
        ['installModule', None] in await pg.evaluate('window.__calls')
        and 'Scanner wird eingerichtet' in hint
        and not await is_open()
        and await state(pg, f"db.servings[0].productId === '{huhn}'"),
        f'the scanner module is missing: installed, notice „{hint}“, then scanned',
    )
    # Scanning does not work (without Google Play services, say): a pointer to the photo, and the sheet stays
    await pg.evaluate("window.__scanError = 'Play-Dienste fehlen'")
    await pg.click('#fab')
    await idle(pg)
    before = len(await impacts())
    await pg.click('[data-action=scan]')
    await idle(pg)
    check(
        await pg.evaluate("document.getElementById('sheet').open")
        and 'Foto' in await pg.inner_text('#toast')
        and 'HEAVY' in (await impacts())[before:],
        'scanner unavailable: a pointer to the photo, and the sheet stays',
    )
    await pg.evaluate('window.__scanError = null')
    # The deep link schmeckts://scan while the app is running and on a cold start
    await pg.click('[data-action=close]')
    await idle(pg)
    n = await state(pg, 'db.servings.length')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})")
    await idle(pg)
    check(
        await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}'"),
        'schmeckts://scan while the app is running: scanned and served',
    )
    await pg.evaluate('window.__barcode = null')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})")
    await idle(pg)
    check(await is_open() and await pg.locator('#sheet [data-action=scan]').count() == 1, 'schmeckts://scan cancelled: the feeding sheet stays')
    await pg.evaluate(f"sessionStorage.setItem('__launchUrl', 'schmeckts://scan'); sessionStorage.setItem('__code', '{SHEBA}')")
    await pg.add_init_script("if (sessionStorage.getItem('__code')) window.__barcode = sessionStorage.getItem('__code');")
    await pg.reload()
    await started(pg)
    check(
        await state(pg, f"db.servings.length === {n + 2} && db.servings[0].productId === '{huhn}'"),
        'a cold start with schmeckts://scan: scanned and served',
    )
    await pg.evaluate('sessionStorage.clear()')
    check(not real_errors(errors), 'no errors in the console' + (f': {real_errors(errors)}' if real_errors(errors) else ''))
    await ctx.close()


SRV = 'http://192.168.99.9:8486'  # the server is only simulated, at a home-network address
OFF_HIT = {
    'status': 1,
    'product': {
        'product_name_de': 'Sheba Fresh Choice Huhn in Sauce 4x50g',
        'brands': 'Sheba, Mars',
        'categories_tags': ['en:cat-food', 'en:wet-cat-food'],
    },
}


# The buttons at the end of the sheet: their text, classes, action and where they stand
END_BUTTONS = """() => [...document.querySelectorAll('#sheet .mt > .btn')].map(b => [b.innerText.trim(), b.className, b.dataset.action,
  Math.round(b.getBoundingClientRect().top), Math.round(b.getBoundingClientRect().bottom)])"""


async def test_discard(browser, url):
    print('a meal broken off after the photo can be deleted while naming, with undo')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)

    async def photo():
        await pg.click('#fab')
        await idle(pg)
        await pg.set_input_files('#camInputSheet', str(PACK))
        await until(pg, "db.servings[0]?.status === 'noserver'")
        await idle(pg)

    await photo()
    ends = await pg.evaluate(END_BUTTONS)
    check(
        [e[:3] for e in ends] == [['Speichern', 'btn primary', 'save-name'], ['Eintrag löschen', 'btn quiet', 'delete-serving']]
        and ends[1][3] >= ends[0][4] + 8,
        f'naming a meal without a variety ends with „Speichern“ and „Eintrag löschen“ under it ({[e[:2] for e in ends]})',
    )
    await pg.evaluate('window.__calls.length = 0')
    await pg.click('#sheet [data-action=delete-serving]')
    await idle(pg)
    gone = [
        await pg.evaluate("document.getElementById('sheet').open"),
        await state(pg, 'db.servings.length'),
        await pg.locator('.pend').count(),
        (await pg.inner_text('#toast')).split('\n')[0],
        await pg.locator('#toast [data-action=undo]').count(),
        await pg.evaluate("window.__calls.filter(c => c[0] === 'impact').map(c => c[1].style)"),
    ]
    check(gone == [False, 0, 0, 'Eintrag gelöscht', 1, ['HEAVY']], f'one tap deletes it, the sheet closes, the toast offers undo ({gone})')
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    back = await state(pg, '(s => [db.servings.length, s.productId ?? null, s.status, !!s.photo, !!s.thumb])(db.servings[0])')
    await pg.click('.pend-head')
    await idle(pg)
    again = [e[0] for e in await pg.evaluate(END_BUTTONS)]
    check(
        back == [1, None, 'noserver', True, True] and again == ['Speichern', 'Eintrag löschen'],
        f'undo brings the meal back with its photo, still to be named ({back}, {again})',
    )

    # The same button under the slider in „Wie war’s?“ on the home page, for a meal without a variety only
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    CARD_BTN = """() => { const b = document.querySelector('.pend [data-action=delete-serving]'), s = document.querySelector('.pend .slider');
      return b && [b.innerText.trim(), b.className, b.dataset.id, s && b.getBoundingClientRect().top >= s.getBoundingClientRect().bottom + 8]; }"""
    card = await pg.evaluate(CARD_BTN)
    meal = await state(pg, 'db.servings[0].id')
    await pg.click('.pend [data-action=delete-serving]')
    await idle(pg)
    gone = [await state(pg, 'db.servings.length'), await pg.locator('.pend').count(), (await pg.inner_text('#toast')).split('\n')[0]]
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    returned = [await state(pg, 'db.servings.length'), await pg.locator('.pend .slider').count(), await pg.evaluate(CARD_BTN)]
    check(
        card == ['Eintrag löschen', 'btn quiet', meal, True] and gone == [0, 0, 'Eintrag gelöscht'] and returned == [1, 1, card],
        f'on the home page „Eintrag löschen“ stands under the slider of a meal without a variety, deletes it with the same toast, and undo brings it back with its slider ({card}, {gone}, {returned})',
    )
    await pg.click('.pend-head')
    await idle(pg)

    # Where there is nothing to delete, or the meal sheet ends with it anyway, naming does not offer it
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    named = await pg.locator('.pend [data-action=delete-serving]').count()
    await pg.click('.pend-head')
    await idle(pg)
    await pg.click('#sheet [data-action=edit-name]')
    await idle(pg)
    renamed = await pg.locator('#sheet [data-action=delete-serving]').count()
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.click('#sheet [data-action=new-product]')
    await idle(pg)
    typed = await pg.locator('#sheet [data-action=delete-serving]').count()
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.evaluate(
        "import('./js/store.js').then(async s => (await import('./js/ui/sheet.js')).openSheet({kind: 'product', id: s.db.products[0].id}))"
    )
    await idle(pg)
    await pg.click('#sheet [data-action=rename-product]')
    await idle(pg)
    product = await pg.locator('#sheet [data-action=delete-serving]').count()
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    check(
        [named, renamed, typed, product] == [0, 0, 0, 0],
        f'not in the card of a named meal, nor while changing it, typing a new one or renaming a variety ({[named, renamed, typed, product]})',
    )

    # The owner's way: an unknown barcode, the photo of the front, then broken off
    before = await state(pg, '[db.products.length, db.servings.length]')
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}")
    await pg.click('#fab')
    await idle(pg)
    await pg.click('#sheet [data-action=scan]')
    await until(pg, "db.servings[0]?.scanCode && db.servings[0].status === 'noserver'")
    await idle(pg)
    await pg.click('#sheet [data-action=delete-serving]')
    await idle(pg)
    after = await state(pg, f"[db.products.length, db.servings.length, db.products.some(p => p.codes?.['{SHEBA}'])]")
    check(after == before + [False], f'after the scanner too: the meal goes, and no variety got the code ({before}, {after})')

    # Deleted while the phone was still reading the photo: undo reads it again instead of hanging. The sheet holds
    # no button while it reads, so the meal goes from its card on the home page.
    await pg.evaluate('window.__ocrDelay = 1500; window.__ocrDone = 0')
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'reading'")
    reads = await pg.evaluate("window.__calls.filter(c => c[0] === 'processImage').length")
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    was = await pg.evaluate(  # read and tap in one go, so the reading cannot finish in between
        """import('./js/store.js').then(s => { const was = s.db.servings[0].status;
          document.querySelector('.pend [data-action=delete-serving]').click(); return was; })"""
    )
    await pg.wait_for_function('window.__ocrDone >= 1')
    await pg.click('#toast [data-action=undo]')
    settled = await until(pg, "db.servings[0]?.status === 'noserver'", timeout=4)
    again = await pg.evaluate("window.__calls.filter(c => c[0] === 'processImage').length")
    check(
        was == 'reading' and settled and again == reads + 1,
        f'undone while reading: the photo is read again and the meal does not hang ({was}, {settled}, {reads} then {again})',
    )
    await pg.evaluate('window.__ocrDelay = 0')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_recognize(browser, url):
    print('the recognition chain: known code, product lookup, server, text on the device')
    fail = {'online': False, 'server': False}  # so that each stage can be made to fail on purpose
    seen = {'online': 0}

    async def off_route(route, request):  # Open Pet Food Facts and Open Food Facts
        seen['online'] += 1
        if fail['online']:
            await route.fulfill(status=500, headers={'access-control-allow-origin': '*'}, body='')
            return
        found = 'openpetfoodfacts' in request.url and '4008429087455' in request.url
        await route.fulfill(
            status=200,
            content_type='application/json',
            headers={'access-control-allow-origin': '*'},
            body=json.dumps(OFF_HIT if found else {'status': 0}),
        )

    async def srv_route(route, request):  # the household server
        path, now = request.url.split(':8486')[1], int(time.time() * 1000)
        if fail['server'] and ('/api/barcode/' in path or '/api/recognize' in path):
            await route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': 'aus', 'now': now}))
            return
        if path.startswith('/api/info'):
            body = {'app': 'schmeckts', 'protocol': 1, 'recognition': True, 'features': ['barcode'], 'auth': True, 'now': now}
        elif '/api/barcode/' in path:
            body = {'found': True, 'brand': 'Felix', 'variety': 'Huhn in Gelee', 'type': 'Nassfutter', 'animal': 'Katze', 'now': now}
        elif path.startswith('/api/recognize'):
            body = {'brand': 'Gourmet', 'variety': 'Gold Pastete', 'type': 'Nassfutter', 'animal': 'Katze', 'now': now}
        elif path.startswith('/api/changes') and request.method == 'POST':
            body = {'ok': [c['id'] for c in json.loads(request.post_data or '{}').get('changes', [])], 'now': now}
        elif path.startswith('/api/changes'):
            body = {'epoch': 'test', 'seq': 0, 'records': [], 'now': now}
        else:
            body = {'epoch': 'test', 'seq': 0, 'sum': '', 'fields': 0, 'now': now}
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(body))

    ctx = await phone(browser)
    for pattern, handler in (
        ('https://world.openpetfoodfacts.org/**', off_route),
        ('https://world.openfoodfacts.org/**', off_route),
        (f'{SRV}/**', srv_route),
    ):
        await ctx.route(pattern, handler)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)

    async def ident(**kw):
        return await pg.evaluate("o => import('./js/recognize.js').then(r => r.identify(o))", kw)

    async def setp(**kw):
        await pg.evaluate("p => import('./js/store.js').then(m => { Object.assign(m.prefs, p); })", kw)

    async def dump():  # schmeckts://ocr-dump: the last reading as a fixture, through a file and the share menu
        before = len(await pg.evaluate('window.__calls'))
        await pg.evaluate("window.__urlOpen({url: 'schmeckts://ocr-dump'})")
        await idle(pg)
        shared = [c[1] for c in (await pg.evaluate('window.__calls'))[before:] if c[0] == 'share']
        name = shared[0]['files'][0].split('/')[-1] if shared else ''
        return name, json.loads(await pg.evaluate(f"localStorage.getItem('__fs:{name}')") or 'null')

    nothing = await dump()
    check(
        nothing == ('', None) and await pg.inner_text('#toast') == 'Noch kein Foto gelesen.',
        f'schmeckts://ocr-dump before the phone has read anything: nothing to share ({nothing})',
    )

    # On-device text recognition: in mode `lokal` the photo prefills „Futter benennen“
    await pg.evaluate("window.__ocrText = 'Sheba\\nNEU\\nSelection in Sauce\\nmit Lachs\\n4 x 85 g\\nZutaten: Fleisch 40 %'; window.__ocrDelay = 400")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await pg.wait_for_selector('#sheet .note .spin')
    reading = [
        await pg.inner_text('#sheet .note'),
        await pg.eval_on_selector('.tl-item .t-main b', 'e => e.textContent'),
        await pg.locator('#sheet .note.warn').count(),
    ]
    check(
        reading == ['Packung wird gelesen …', 'Wird gelesen …', 0],
        f'while the phone reads: a calm notice in the sheet and in the history, without a warning colour ({reading})',
    )
    await until(pg, '!!db.servings[0]?.guess')
    await idle(pg)
    await pg.evaluate('window.__ocrDelay = 0')
    filled = await pg.evaluate(
        "[document.getElementById('f-brand').value, document.getElementById('f-variety').value, document.querySelector('[data-action=set-type][aria-pressed=true]')?.innerText]"
    )
    read = [c[1]['path'] for c in await pg.evaluate('window.__calls') if c[0] == 'processImage']
    gone = [c[1]['path'] for c in await pg.evaluate('window.__calls') if c[0] == 'deleteFile' and c[1]['directory'] == 'CACHE']
    s = await state(pg, '(s => [s.status, s.error ?? null])(db.servings[0])')
    check(
        filled == ['Sheba', 'Selection in Sauce mit Lachs', 'Nassfutter']
        and len(read) == 1
        and gone == ['schmeckts-ocr.jpg']
        and s == ['noserver', None],
        f'a photo without a server: the phone reads the text and prefills brand, variety and type ({filled}, {s})',
    )
    await shot(pg, 'text-read')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    await pg.click('[data-action=close]')
    await idle(pg)
    p = await state(pg, '(p => [p.brand, p.variety, p.type, p.texture])(db.products[0])')
    check(
        p == ['Sheba', 'Selection in Sauce mit Lachs', 'Nassfutter', 'sosse'] and not await state(pg, 'db.servings[0].guess'),
        f'confirmed: the variety is created including its consistency, and the guess is gone ({p})',
    )
    name, fixture = await dump()
    want = {'brand': 'Sheba', 'variety': 'Selection in Sauce mit Lachs', 'type': 'Nassfutter', 'texture': 'sosse', 'locked': False}
    check(
        re.fullmatch(r'schmeckts-ocr-\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.json', name)
        and [fixture['width'], fixture['height']] == [480, 360]
        and fixture['result'] == {'text': 'Sheba\nNEU\nSelection in Sauce\nmit Lachs\n4 x 85 g\nZutaten: Fleisch 40 %', 'blocks': []}
        and {k: fixture['expected'].get(k) for k in want} == want
        and fixture['ms'] >= 0,
        f'schmeckts://ocr-dump: the last reading as a fixture, with the size of the photo and the variety it was named as ({name}, {fixture and fixture["expected"]})',
    )
    kept = await state(pg, 'JSON.stringify([db, prefs, queue])')
    check('Zutaten: Fleisch' not in kept, 'the reading itself lives in memory only: it is in neither the data, the settings nor the queue')

    # A camera's large photo: the phone reads the text at 2400 px, and keeps 1100 and 480 px as before. Another
    # packaging, because the one just named would now be served straight away, its photo kept for the variety.
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    before = await pg.evaluate("import('./js/recognize.js').then(r => r.lastReading().at)")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK_LARGE))
    for _ in range(100):  # the reading is in memory beside the data, so state() and until() do not see it
        if await pg.evaluate("import('./js/recognize.js').then(r => r.lastReading().at)") > before:
            break
        await asyncio.sleep(0.1)
    await idle(pg)
    sizes = await pg.evaluate(
        """Promise.all([import('./js/recognize.js'), import('./js/images.js'), import('./js/store.js'), import('./js/reading.js')])
          .then(([r, i, s, g]) => { const meal = s.db.servings[0], wh = x => [x.width, x.height];
            return [wh(r.lastReading()), wh(g.jpegSize(i.memPhotos.get(meal.id))), wh(g.jpegSize(meal.photo.split(',')[1]))]; })"""
    )
    check(
        sizes == [[2400, 1800], [1100, 825], [480, 360]],
        f'the text is read off the photo at 2400 px, what is kept stays at 1100 and 480 px ({sizes})',
    )
    await pg.click('[data-action=close]')
    await idle(pg)

    # schmeckts://ocr-measure: every photo read at 1100 and 1800 px as well, the times shared with the fixture
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://ocr-measure'})")
    await idle(pg)
    switched = await pg.inner_text('#toast')
    reads = await pg.evaluate("window.__calls.filter(c => c[0] === 'processImage').length")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK_LARGE))
    for _ in range(100):
        if await pg.evaluate("import('./js/recognize.js').then(r => (r.timing.ms[1800] || []).length)"):
            break
        await asyncio.sleep(0.1)
    await idle(pg)
    _, fixture = await dump()
    measured = {px: len(ms) for px, ms in (fixture or {}).get('timings', {}).items()}
    more = await pg.evaluate("window.__calls.filter(c => c[0] === 'processImage').length") - reads
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://ocr-measure'})")
    await idle(pg)
    check(
        switched == 'Lesezeiten werden gemessen.'
        and measured == {'1100': 1, '1800': 1, '2400': 1}
        and more == 3
        and await pg.inner_text('#toast') == 'Lesezeiten werden nicht mehr gemessen.',
        f'schmeckts://ocr-measure: the photo read at 1100, 1800 and 2400 px, the times in the fixture ({measured}, {more} readings)',
    )
    await pg.click('[data-action=close]')
    await idle(pg)
    # The same packaging again: our own variety is recognised, spelled differently too, and handed over as the
    # variety itself, the way a barcode hit is
    await pg.evaluate("window.__ocrText = 'SHEBA  selection-in-sauce mit LACHS 85g'")
    got = await ident(photo='AAA')
    check(
        got['source'] == 'text'
        and [p['variety'] for p in got.get('products', [])] == ['Selection in Sauce mit Lachs']
        and 'details' not in got
        and got['lines'] == ['Sheba selection-in-sauce mit LACHS'],
        f'a known variety recognised in the text: the variety itself, with the lines read ({got})',
    )
    await pg.evaluate("window.__ocrText = '12345\\n850 g'")
    got = await ident(photo='AAA')
    check(got['source'] == '' and not got.get('details'), f'without usable text everything stays empty ({got})')

    # Product lookup on the internet: off means no request
    await pg.evaluate("window.__ocrText = ''")
    got = await ident(code='4008429087455')
    check(got['source'] == '' and seen['online'] == 0, f'product lookup off: no request ({seen["online"]})')
    await setp(lookup=True)
    got = await ident(code='4008429087455')
    kept = await state(pg, "prefs.codes['4008429087455']")
    hit = got.get('details') or {}
    check(
        got['source'] == 'online'
        and [hit.get(k) for k in ('brand', 'variety', 'type', 'animal')] == ['Sheba', 'Fresh Choice Huhn in Sauce', 'Nassfutter', 'Katze']
        and kept['found'] is True,
        f'product lookup on: brand and variety cleaned up as on the server ({hit})',
    )
    before = seen['online']
    await ident(code='4008429087455')
    miss = await ident(code='96385074')
    kept = await state(pg, "prefs.codes['96385074']")
    check(
        seen['online'] == before + 2 and miss['source'] == '' and kept['found'] is False,
        f'hit and miss remembered: the same code does not go out again ({seen["online"] - before} requests for 2 codes)',
    )

    # Server: when connected it looks the code up and recognises the photo
    await setp(server=SRV, code='K7PM-3QXD', lookup=False)
    got = await ident(code='96385074')
    check(got['source'] == 'server' and got['details']['brand'] == 'Felix', f'connected: the server looks the barcode up ({got.get("details")})')
    got = await ident(photo='AAA')
    check(
        got['source'] == 'server' and got['details']['variety'] == 'Gold Pastete',
        f'connected: the server recognises the photo ({got.get("details")})',
    )

    # „Fotos über den Server erkennen“: there while connected and on by default; off, the phone reads the text
    await pg.click('[data-action=open-settings]')
    await idle(pg)
    scanning = await pg.evaluate(
        """() => { const g = [...document.querySelectorAll('#sheet .set-group')].find(x => x.previousElementSibling.innerText === 'Scannen');
          return [...g.querySelectorAll('.set-row')].map(r => [r.querySelector('.t-main b').innerText, r.getAttribute('aria-checked')]); }"""
    )
    await pg.click('#sheet [data-action=server-photo]')
    await idle(pg)
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    no_photo, by_code = await ident(photo='AAA'), await ident(code='96385074')
    check(
        scanning == [['Produktsuche im Internet', 'false'], ['Fotos über den Server erkennen', 'true']]
        and await state(pg, 'prefs.serverPhoto') is False
        and no_photo['source'] == 'text'
        and by_code['source'] == 'server',
        f'the photo switch off: the phone reads the text itself, the barcode still goes to the server ({scanning}, {no_photo["source"]}, {by_code["source"]})',
    )
    await setp(serverPhoto=True)

    # Every stage falls through cleanly to the next, cheapest first
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    await setp(lookup=True)
    chain = []
    fail.update(online=False, server=False)
    chain.append((await ident(code='4008429087455', photo='AAA'))['source'])  # product lookup before the server
    fail['online'] = True
    chain.append((await ident(code='96385074', photo='AAA'))['source'])  # product lookup broken → server
    fail['server'] = True
    chain.append((await ident(code='96385074', photo='AAA'))['source'])  # server broken → text on the device
    await pg.evaluate("window.__ocrText = ''")
    chain.append((await ident(code='96385074', photo='AAA'))['source'])  # nothing works → an empty form
    check(chain == ['online', 'server', 'text', ''], f'the chain: every stage works and every one falls through cleanly ({chain})')
    await pg.evaluate("p => import('./js/store.js').then(m => { m.db.products[0].codes = {'4008429087455': true}; })")
    first = await ident(code='4008429087455', photo='AAA')
    check(
        first['source'] == 'codes' and len(first['products']) == 1, f'a barcode already known in the household beats everything ({first["source"]})'
    )
    await setp(code='', server='', lookup=False)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)[:2]}')
    await ctx.close()


# The meal on top: variety, status, what it still carries, and its reading
MEAL = '(s => [s.productId ?? null, s.status ?? null, !!s.photo, !!s.thumb, s.guess ? [s.guess.brand, s.guess.variety] : null])(db.servings[0])'
# The sheet and the toast: open, kind and step, the fields, the toast's text and whether it offers undo
SHEET_TOAST = """import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind ?? null, m.sheet?.step ?? null,
  document.getElementById('f-brand')?.value ?? null, document.getElementById('f-variety')?.value ?? null,
  document.querySelector('#toast span')?.innerText ?? '', !!document.querySelector('#toast [data-action=undo]')])"""


# The naming sheet while the packaging is read: the notice, the skeleton, the fields and the buttons
READING = """() => { const q = s => document.querySelectorAll('#sheet ' + s).length;
  return {note: document.querySelector('#sheet .note')?.innerText.trim() ?? null, spin: q('.note .spin'), skel: [q('.skel-text'), q('.skel-field')],
    fields: [document.getElementById('f-brand')?.value ?? null, document.getElementById('f-variety')?.value ?? null],
    chips: q('.chip'), buttons: q('.btn, .link'), close: q('[data-action=close]'), focus: document.activeElement?.id ?? ''}; }"""


async def test_skeleton(browser, url):
    print('while the phone reads the packaging: a skeleton first, the fields once the reading is there or patience runs out')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)

    async def photo(delay):
        await pg.evaluate(f"window.__ocrText = 'Whiskas\\nRind in Gelee'; window.__ocrDelay = {delay}")
        await pg.click('#fab')
        await idle(pg)
        await pg.set_input_files('#camInputSheet', str(PACK))
        await pg.wait_for_selector('#sheet .skel-field')

    await photo(1200)
    skeleton = await pg.evaluate(READING)
    check(
        skeleton
        == {'note': 'Packung wird gelesen …', 'spin': 1, 'skel': [2, 2], 'fields': [None, None], 'chips': 0, 'buttons': 0, 'close': 1, 'focus': ''},
        f'the skeleton: the photo, the notice with its spinner, a placeholder per field, no field to type into, no chips, no button but the X ({skeleton})',
    )
    await shot(pg, 'naming-skeleton')
    await until(pg, '!!db.servings[0]?.guess')
    await idle(pg)
    read = await pg.evaluate(READING)
    check(
        read['skel'] == [0, 0] and read['fields'] == ['Whiskas', 'Rind in Gelee'] and read['note'] is None,
        f'the reading there: the fields carry it and the skeleton is gone ({read})',
    )
    await pg.click('[data-action=close]')
    await idle(pg)

    # A reading that takes longer than the patience: the empty fields come with a notice, what is typed meanwhile
    # stays, and the reading fills only the field still empty, without taking the focus
    await photo(3600)
    await pg.wait_for_selector('#sheet #f-brand', timeout=4000)
    waiting = await pg.evaluate(READING)
    await pg.fill('#f-brand', 'Animonda')
    await until(pg, '!!db.servings[0]?.guess')
    await idle(pg)
    filled = await pg.evaluate(READING)
    check(
        waiting['note'] == 'Packung wird noch gelesen …'
        and waiting['spin'] == 1
        and waiting['fields'] == ['', '']
        and waiting['skel'] == [0, 0]
        and filled['fields'] == ['Animonda', 'Rind in Gelee']
        and filled['focus'] == 'f-brand'
        and await state(pg, '(s => [s.status, s.guess.brand])(db.servings[0])') == ['noserver', 'Whiskas'],
        f'after 2.5 s the empty fields with „Packung wird noch gelesen …“; the brand typed meanwhile stays, the variety is filled in, the focus stays put ({waiting}, {filled})',
    )
    await pg.evaluate('window.__ocrDelay = 0')
    await pg.click('[data-action=close]')
    await idle(pg)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


# The card of the meal on top in „Wie war’s?“: its two lines, the name in bold in the second, whether that line warns, and
# whether the bold name is set as small as the line
CARD_SUB = """() => { const e = document.querySelector('.pend-head .t-main'), b = e.querySelector('small b'), st = x => getComputedStyle(x);
  return [e.innerText.replace(/\\n/g, ' / '), b?.innerText ?? null, !!e.querySelector('.warn'), !b || (st(b).fontSize === st(b.parentNode).fontSize && st(b).fontWeight === '600')]; }"""
# The naming sheet's sentence about the reading, its bold parts, the hint where nothing was read, and the main button
SAID = """() => { const say = document.querySelector('#sheet .say'), hint = document.querySelector('#sheet .hint.read-note'), btn = document.querySelector('#sheet [data-action=save-name]');
  return [say?.innerText ?? null, say ? [...say.querySelectorAll('b')].map(b => b.innerText) : null, hint?.innerText ?? null, btn.innerText.trim(), !!btn.querySelector('.ic')]; }"""


async def test_reading_said(browser, url):
    print('the reading stands as a sentence to confirm, and the main button confirms it')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)

    async def photo(text):
        await pg.evaluate(f'window.__ocrText = {json.dumps(text)}')
        await pg.click('#fab')
        await idle(pg)
        await pg.set_input_files('#camInputSheet', str(PACK))
        await until(pg, "db.servings[0]?.status === 'noserver'")
        await idle(pg)
        got = await pg.evaluate(SAID)
        await pg.click('#sheet [data-action=close]')
        await idle(pg)
        cards.append(await pg.evaluate(CARD_SUB))
        return got

    cards = []
    both = await photo('Sheba\nLachs in Soße\n85 g')
    await shot(pg, 'reading-said')
    brand = await photo('Whiskas\n85 g')
    variety = await photo('Huhn in Gelee')
    nothing = await photo('12345\n850 g')
    check(
        cards
        == [
            ['Unbekanntes Futter / Vermutlich Lachs in Soße, tippen zum Bestätigen', 'Lachs in Soße', False, True],
            ['Unbekanntes Futter / Vermutlich Whiskas, tippen zum Bestätigen', 'Whiskas', False, True],
            ['Unbekanntes Futter / Vermutlich Huhn in Gelee, tippen zum Bestätigen', 'Huhn in Gelee', False, True],
            ['Unbekanntes Futter / Tippen zum Benennen', None, False, True],
        ],
        f'the card in „Wie war’s?“ names the guess in bold, the variety or else the brand, in the usual colour and as small as its line; without one as before ({cards})',
    )
    await shot(pg, 'guess-card')
    check(
        both == ['Gelesen: Sheba, Lachs in Soße. Passt das?', ['Sheba', 'Lachs in Soße'], None, 'Passt so', True]
        and brand == ['Gelesen: Whiskas. Passt das?', ['Whiskas'], None, 'Passt so', True]
        and variety == ['Gelesen: Huhn in Gelee. Passt das?', ['Huhn in Gelee'], None, 'Passt so', True]
        and nothing == [None, None, 'Auf dem Foto war nichts zu lesen. Tipp Marke und Sorte ein oder mach ein neues Foto.', 'Speichern', True],
        f'brand and variety in bold, one alone without the comma, „Passt so“ while there is a reading; nothing read: a hint and „Speichern“ ({both}, {brand}, {variety}, {nothing})',
    )
    # Named, the sentence is gone and the button says „Speichern“ again
    await pg.click('.pend-head')
    await idle(pg)
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    await pg.click('#sheet [data-action=edit-name]')
    await idle(pg)
    named = await pg.evaluate(SAID)
    check(named == [None, None, None, 'Speichern', True], f'„Futter ändern“ for a named meal: no sentence, „Speichern“ ({named})')
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


# The meal on top while a new photo is taken: status, the reading, its thumbnail and photo (their tails as identity)
REPHOTO = """(s => [s.status ?? null, s.guess ? [s.guess.brand, s.guess.variety] : null, (s.thumb || '').slice(-32), (s.photo || '').slice(-32)])(db.servings[0])"""
REPHOTO_VIEW = """() => { const l = document.querySelector('#sheet .link.rephoto');
  return [l ? l.innerText.trim() : null, !!l?.querySelector('.ic'), document.querySelector('.pend .thumb')?.getAttribute('src')?.slice(-32) ?? null]; }"""


async def test_rephoto(browser, url):
    print('„Neues Foto“ while naming: the new photo replaces the old and is read anew, a late result of the old reading counts for nothing')
    recognized = []
    fail = {'server': False}

    async def srv_route(route, request):  # the household server: recognises the photo, unless told to fail
        path, now = request.url.split(':8486')[1], int(time.time() * 1000)
        if path.startswith('/api/recognize'):
            recognized.append(json.loads(request.post_data or '{}').get('image', '')[-32:])
            if fail['server']:
                await route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': 'aus', 'now': now}))
                return
            body = {'brand': 'Gourmet', 'variety': 'Gold Pastete', 'type': 'Nassfutter', 'animal': 'Katze', 'now': now}
        elif path.startswith('/api/info'):
            body = {'app': 'schmeckts', 'protocol': 1, 'recognition': True, 'features': [], 'auth': True, 'now': now}
        elif path.startswith('/api/changes') and request.method == 'POST':
            body = {'ok': [c['id'] for c in json.loads(request.post_data or '{}').get('changes', [])], 'now': now}
        elif path.startswith('/api/changes'):
            body = {'epoch': 'test', 'seq': 0, 'records': [], 'now': now}
        else:
            body = {'epoch': 'test', 'seq': 0, 'sum': '', 'fields': 0, 'now': now}
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(body))

    ctx = await phone(browser)
    await ctx.route(f'{SRV}/**', srv_route)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    small, big = base64.b64encode(PACK.read_bytes()).decode(), base64.b64encode(PACK_LARGE.read_bytes()).decode()

    async def snapshot():
        return [await state(pg, REPHOTO), await pg.evaluate(FIELDS), await pg.evaluate(CHIPS), await pg.evaluate(REPHOTO_VIEW)]

    async def again(text, photo, delay=0):
        """„Neues Foto“ with the camera app giving `photo` (None: „Abbrechen“) and the reading answering `text`"""
        await pg.evaluate(f'window.__ocrText = {json.dumps(text)}; window.__ocrDelay = {delay}; window.__photo = {json.dumps(photo)}')
        await pg.click('#sheet [data-action=rephoto]')

    # The first photo, read at once
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'; window.__ocrDelay = 0")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await idle(pg)
    first = await snapshot()
    await shot(pg, 'rephoto-link')
    await pg.evaluate('window.__calls.length = 0')
    await again('Sheba\nLachs in Soße', big)
    await until(pg, "db.servings[0]?.guess?.brand === 'Sheba'")
    await idle(pg)
    second = await snapshot()
    cam = await pg.evaluate("window.__calls.filter(c => c[0] === 'capture').map(c => c[1])")
    check(
        first[0][:2] == ['noserver', ['Whiskas', 'Rind in Gelee']]
        and first[1] == ['Whiskas', 'Rind in Gelee']
        and first[3][:2] == ['Neues Foto', True]
        and second[0][:2] == ['noserver', ['Sheba', 'Lachs in Soße']]
        and second[1] == ['Sheba', 'Lachs in Soße']
        and second[2] != first[2]
        and second[0][2:] != first[0][2:]
        and second[3][2] != first[3][2]
        and second[3][2] == second[0][2]
        and cam == [None],
        f'„Neues Foto“ under the photo: the camera as when feeding, and with the new photo the fields, the chips, the thumbnail on the meal and in its card and the photo itself change ({first}, {second}, {cam})',
    )
    await again('Animonda\nCarny', None)
    await idle(pg)
    check(await snapshot() == second, '„Abbrechen“ changes nothing')

    # A reading that takes long, then a new photo while it runs: the new reading answers, the old result is dropped
    done = await pg.evaluate('window.__ocrDone || 0')
    await again('Animonda\nCarny', small, 3000)
    await pg.wait_for_selector('#sheet .skel-field')
    await pg.wait_for_selector('#sheet #f-brand', timeout=4000)
    waiting = [await state(pg, 'db.servings[0].status'), await pg.locator('#sheet [data-action=rephoto]').count()]
    await again('Felix\nHuhn in Gelee', big)
    await until(pg, "db.servings[0]?.guess?.brand === 'Felix'")
    await pg.wait_for_function(f'(window.__ocrDone || 0) >= {done} + 2')
    await idle(pg)
    late = await snapshot()
    check(
        waiting == ['reading', 1] and late[0][:2] == ['noserver', ['Felix', 'Huhn in Gelee']] and late[1] == ['Felix', 'Huhn in Gelee'],
        f'the skeleton first, the empty fields with the link once patience runs out; the old reading arriving late changes nothing ({waiting}, {late})',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)

    # In a household the new photo goes to the server as a new recognition
    await pg.evaluate(
        f"import('./js/store.js').then(m => {{ m.prefs.server = '{SRV}'; m.prefs.code = 'K7PM-3QXD'; m.prefs.mode = 'haushalt'; m.savePrefs(); }})"
    )
    await pg.evaluate("import('./js/sync.js').then(m => m.startSync())")
    await until(pg, "status.state === 'ok'")
    fail['server'] = True
    await pg.evaluate("window.__ocrText = ''; window.__ocrDelay = 0")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'waiting'")
    await idle(pg)
    await pg.click('.pend-head')
    await idle(pg)
    link = await pg.evaluate(REPHOTO_VIEW)
    fail['server'] = False
    await again('', big)
    await until(pg, "db.servings[0]?.productId && db.products.some(p => p.variety === 'Gold Pastete')")
    await idle(pg)
    check(
        link[:2] == ['Neues Foto', True] and len(recognized) == 2 and recognized[0] != recognized[1],
        f'in a household: „Neues Foto“ while the server has not answered, and the new photo goes to the server as a recognition of its own ({link}, {len(recognized)} photos)',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


# The food sheet's photo link and the variety's photo: the link's text, its icon, the thumbnail's tail in the card and
# on the variety, and the tail of the large photo this phone keeps
PRODUCT_PHOTO = """pid => import('./js/store.js').then(s => { const l = document.querySelector('#sheet [data-action=product-photo]'), p = s.db.products.find(x => x.id === pid);
  return [l?.innerText.trim() ?? null, !!l?.querySelector('.ic'), document.querySelector('#sheet .prod-card .thumb')?.getAttribute('src')?.slice(-32) ?? null,
    (p.thumb || '').slice(-32), (localStorage.getItem('__fs:photos/' + pid + '.jpg') || '').slice(-32), p.sharedPhoto ?? null]; })"""


async def test_product_photo(browser, url):
    print(
        '„Foto ändern“ under the variety\u2019s card, in the food sheet and in the meal\u2019s, and under its photo while naming: a new photo and thumbnail, „Abbrechen“ changes nothing'
    )
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    # A variety with a photo: photographed and named
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'; window.__ocrDelay = 0")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await idle(pg)
    await pg.click('[data-action=save-name]')
    await idle(pg)
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    pid = await state(pg, 'db.products[0].id')

    async def food_sheet():
        await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))")
        await idle(pg)

    await food_sheet()
    before = await pg.evaluate(PRODUCT_PHOTO, pid)
    await pg.evaluate(f"window.__photo = '{base64.b64encode(PACK_LARGE.read_bytes()).decode()}'; window.__calls.length = 0")
    await pg.click('#sheet [data-action=product-photo]')
    for _ in range(50):  # the file is written after the camera answers
        after = await pg.evaluate(PRODUCT_PHOTO, pid)
        if after[4] != before[4]:
            break
        await asyncio.sleep(0.1)
    await idle(pg)
    after = await pg.evaluate(PRODUCT_PHOTO, pid)
    cam = await pg.evaluate("window.__calls.filter(c => c[0] === 'capture').map(c => c[1])")
    check(
        before[:2] == ['Foto ändern', True]
        and before[4]
        and after[:2] == ['Foto ändern', True]
        and after[2] == after[3] != before[3]
        and after[4] != before[4]
        and after[5] is None
        and cam == [None],
        f'„Foto ändern“ under the photo: the camera as when feeding; the thumbnail in the sheet and on the variety and the large photo on this phone change, and alone nothing is marked for a server ({before}, {after}, {cam})',
    )
    await shot(pg, 'product-photo')
    await pg.evaluate('window.__photo = null')
    await pg.click('#sheet [data-action=product-photo]')
    await idle(pg)
    check(await pg.evaluate(PRODUCT_PHOTO, pid) == after, '„Abbrechen“ changes nothing')
    # The large photo opens with the new one
    await pg.click('#sheet .prod-card [data-action=view-photo]')
    await pg.wait_for_selector('#viewer[open]')
    await idle(pg)
    large = await pg.evaluate("[document.querySelector('#viewer img').naturalWidth, document.querySelector('#viewer img').src.slice(-32)]")
    await pg.click('#viewer')
    await idle(pg)
    check(large == [1100, after[4]], f'the viewer shows the new photo at 1100 px ({large[0]})')
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    # A variety without a photo offers „Foto hinzufügen“
    await pg.evaluate(
        "import('./js/store.js').then(async s => { s.db.products.push({id: 'ohnefoto0001', brand: 'Felix', variety: 'Huhn', type: 'Nassfutter', codes: {}, createdAt: Date.now()}); s.save(); })"
    )
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.openSheet({kind: 'product', id: 'ohnefoto0001'}))")
    await idle(pg)
    none = await pg.evaluate(PRODUCT_PHOTO, 'ohnefoto0001')
    await pg.evaluate(f"window.__photo = '{base64.b64encode(PACK.read_bytes()).decode()}'")
    await pg.click('#sheet [data-action=product-photo]')
    await until(pg, "!!db.products.find(x => x.id === 'ohnefoto0001').thumb")
    await idle(pg)
    added = await pg.evaluate(PRODUCT_PHOTO, 'ohnefoto0001')
    check(
        none[:2] == ['Foto hinzufügen', True] and none[4] == '' and added[:2] == ['Foto ändern', True] and added[3] and added[4],
        f'without a photo the link says „Foto hinzufügen“, and afterwards the variety has one ({none}, {added})',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    # The meal's sheet has the same link right under its card, since that is where a meal is opened from the home
    # page; the photo it takes is the variety's
    sid = await state(pg, 'db.servings[0].id')
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'serving', id: '{sid}'}}))")
    await idle(pg)
    meal = await pg.evaluate(PRODUCT_PHOTO, pid)
    where = await pg.evaluate("""() => { const l = document.querySelector('#sheet [data-action=product-photo]');
      return [document.querySelector('#sheet .sh-head h2').innerText, l.dataset.id, l.previousElementSibling.className, l.nextElementSibling.className]; }""")
    await pg.evaluate(f"window.__photo = '{base64.b64encode(PACK.read_bytes()).decode()}'")
    await pg.click('#sheet [data-action=product-photo]')
    await until(pg, f"(localStorage.getItem('__fs:photos/{pid}.jpg') || '').slice(-32) !== '{after[4]}'")
    await idle(pg)
    changed = await pg.evaluate(PRODUCT_PHOTO, pid)
    check(
        meal[:2] == ['Foto ändern', True]
        and where == ['Wie war’s?', pid, 'box prod-card', 'pet-rate']
        and changed[2] == changed[3] != after[3]
        and changed[4] != after[4],
        f'in the meal\u2019s sheet the same link stands right under the card, and the photo it takes is the variety\u2019s ({meal}, {where}, {changed})',
    )
    await shot(pg, 'meal-photo-link')
    # While naming a meal with a variety and while renaming a variety, the sheet shows the variety's photo with the
    # same link under it; a new photo changes what the sheet shows, and the fields keep what was typed
    NAMING = """() => { const l = document.querySelector('#sheet [data-action=product-photo]'), img = document.querySelector('#sheet .name-photo');
      return [document.querySelector('#sheet .sh-head h2').innerText, l?.innerText.trim() ?? null, !!l?.querySelector('.ic'), img?.getAttribute('src')?.slice(-32) ?? null,
        img?.closest('[data-action=view-photo]')?.dataset.p ?? null, l?.dataset.id ?? null, document.querySelector('#f-brand')?.value ?? null]; }"""
    await pg.click('#sheet [data-action=edit-name]')
    await idle(pg)
    await pg.fill('#f-brand', 'Whiskas Neu')
    naming = await pg.evaluate(NAMING)
    await pg.evaluate(f"window.__photo = '{base64.b64encode(PACK_LARGE.read_bytes()).decode()}'")
    await pg.click('#sheet [data-action=product-photo]')
    await until(pg, f"(db.products.find(x => x.id === '{pid}').thumb || '').slice(-32) !== '{changed[3]}'")
    await idle(pg)
    renamed = await pg.evaluate(NAMING)
    thumb = await state(pg, f"db.products.find(x => x.id === '{pid}').thumb.slice(-32)")
    await shot(pg, 'naming-photo-link')
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await food_sheet()
    await pg.click('#sheet [data-action=rename-product]')
    await idle(pg)
    rename = await pg.evaluate(NAMING)
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.evaluate(
        "import('./js/store.js').then(async s => { s.db.products.push({id: 'ohnebild0001', brand: 'Felix', variety: 'Ente', type: 'Nassfutter', codes: {}, createdAt: Date.now()}); s.save(); })"
    )
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.openSheet({kind: 'product', id: 'ohnebild0001'}))")
    await idle(pg)
    await pg.click('#sheet [data-action=rename-product]')
    await idle(pg)
    bare = await pg.evaluate(NAMING)
    check(
        naming == ['Futter ändern', 'Foto ändern', True, changed[3], pid, pid, 'Whiskas Neu']
        and renamed == ['Futter ändern', 'Foto ändern', True, thumb, pid, pid, 'Whiskas Neu']
        and thumb != changed[3]
        and rename == ['Futter umbenennen', 'Foto ändern', True, thumb, pid, pid, 'Whiskas']
        and bare == ['Futter umbenennen', 'Foto hinzufügen', True, None, None, 'ohnebild0001', 'Felix'],
        f'while naming a meal with a variety and while renaming one, the variety\u2019s photo with „Foto ändern“ under it: a new photo changes it in place and the field keeps what was typed; without a photo „Foto hinzufügen“ ({naming}, {renamed}, {rename}, {bare})',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_known_photo(browser, url):
    print('a photo of a known variety: served without the sheet, and undo takes the recognition back, not the meal')

    async def srv_route(route, request):  # a household server whose photo recognition is switched off on this phone
        path, now = request.url.split(':8486')[1], int(time.time() * 1000)
        if path.startswith('/api/info'):
            body = {'app': 'schmeckts', 'protocol': 1, 'recognition': True, 'features': [], 'auth': True, 'now': now}
        elif path.startswith('/api/recognize'):
            body = {'brand': 'Gourmet', 'variety': 'Gold Pastete', 'type': 'Nassfutter', 'animal': 'Katze', 'now': now}
        elif path.startswith('/api/changes') and request.method == 'POST':
            body = {'ok': [c['id'] for c in json.loads(request.post_data or '{}').get('changes', [])], 'now': now}
        elif path.startswith('/api/changes'):
            body = {'epoch': 'test', 'seq': 0, 'records': [], 'now': now}
        else:
            body = {'epoch': 'test', 'seq': 0, 'sum': '', 'fields': 0, 'now': now}
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(body))

    ctx = await phone(browser)
    await ctx.route(f'{SRV}/**', srv_route)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    # A variety of our own, served once by hand
    await pg.evaluate("""import('./js/store.js').then(async s => { const now = Date.now();
      s.db.products.push({id: 'sheba000001', brand: 'Sheba', variety: 'Lachs in Soße', type: 'Nassfutter', codes: {}, createdAt: now});
      s.db.servings.unshift({id: 'first0000001', productId: 'sheba000001', servedAt: now - 864e5, note: '', pets: {[s.db.pets[0].id]: {r: 'top', at: now}}});
      s.save(); (await import('./js/views/home.js')).renderHome(); })""")

    async def photo(text):
        await pg.evaluate(f'window.__ocrText = {json.dumps(text)}')
        await pg.click('#fab')
        await idle(pg)
        await pg.set_input_files('#camInputSheet', str(PACK))
        await until(pg, "db.servings[0]?.productId === 'sheba000001' || db.servings[0]?.status === 'noserver'")
        await idle(pg)
        return await state(pg, MEAL), await pg.evaluate(SHEET_TOAST)

    meal, view = await photo('SHEBA\nLachs in Soße\n85 g')
    kept = await pg.evaluate("import('./js/photos.js').then(p => p.keptPhoto('sheba000001'))")
    check(
        meal == ['sheba000001', None, False, False, None]
        and view == [False, None, None, None, None, 'Lachs in Soße erkannt und serviert', True]
        and await pg.eval_on_selector('#toast span b', 'b => b.innerText') == 'Lachs in Soße'
        and kept,
        f'the packaging of a known variety: served with that variety, no sheet, the toast names it in bold with „Rückgängig“, and the photo is kept for the variety ({meal}, {view})',
    )
    await shot(pg, 'known-photo-toast')
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    meal, view = await state(pg, MEAL), await pg.evaluate(SHEET_TOAST)
    chips = await pg.evaluate(CHIPS)
    check(
        meal == [None, 'noserver', True, True, ['Sheba', 'Lachs in Soße']]
        and view[:5] == [True, 'serving', 'name', 'Sheba', 'Lachs in Soße']
        and chips == [['Sheba', 'false'], ['Lachs in Soße', 'true']]
        and await pg.evaluate(BRAND_CHIPS) == [['Sheba', 'true']]
        and await state(pg, 'db.products.length === 1 && db.servings.length === 2')
        and await pg.evaluate("import('./js/photos.js').then(p => p.keptPhoto('sheba000001'))"),
        f'undo takes the variety off the meal, not the meal: „Futter benennen“ opens with the reading in the fields and the lines read as chips; the variety keeps its photo ({meal}, {view}, {chips})',
    )
    await shot(pg, 'known-photo-undone')
    await pg.click('#sheet [data-action=delete-serving]')
    await idle(pg)
    check(
        await state(pg, 'db.servings.length === 1 && db.products.length === 1') and not await pg.evaluate("document.getElementById('sheet').open"),
        '„Eintrag löschen“ there deletes the meal, and the variety stays',
    )

    # In a household with „Fotos über den Server erkennen“ off the phone reads the packaging itself: the same
    await pg.evaluate(
        f"import('./js/store.js').then(m => {{ m.prefs.server = '{SRV}'; m.prefs.code = 'K7PM-3QXD'; m.prefs.mode = 'haushalt'; m.prefs.serverPhoto = false; m.savePrefs(); }})"
    )
    await pg.evaluate("import('./js/sync.js').then(m => m.startSync())")
    await until(pg, "status.state === 'ok'")
    meal, view = await photo('Sheba\nLachs in Soße')
    check(
        meal[:2] == ['sheba000001', None] and view == [False, None, None, None, None, 'Lachs in Soße erkannt und serviert', True],
        f'in a household with the server photo off: served straight away as well ({meal}, {view})',
    )
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    check(
        await state(pg, MEAL) == [None, 'noserver', True, True, ['Sheba', 'Lachs in Soße']]
        and (await pg.evaluate(SHEET_TOAST))[:3] == [True, 'serving', 'name'],
        'and undo opens the sheet with the reading there too',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


PACK_TEXT = 'Katzenglück\nZarte Häppchen\nmit Huhn\n4 x 85 g\nZutaten: Fleisch'
# The chips of the lines read under „Sorte“, after their label, and of the brands read under „Marke“: text and
# whether pressed; None without any
CHIPS = """() => { const box = document.getElementById('lineChips'), l = box?.querySelector('.label');
  return l && l.innerText === 'Auf der Packung gelesen' ? [...box.querySelectorAll('.chip')].map(c => [c.innerText, c.getAttribute('aria-pressed')]) : null; }"""
BRAND_CHIPS = """() => { const box = document.getElementById('brandChips');
  return box?.querySelector('.chip') ? [...box.querySelectorAll('.chip')].map(c => [c.innerText, c.getAttribute('aria-pressed')]) : null; }"""
FIELDS = "[document.getElementById('f-brand').value, document.getElementById('f-variety').value]"
# Where the chip boxes stand: the brand chips right under „Marke“, the line chips under „Sorte“, each above the next label
CHIP_PLACES = """() => { const r = s => document.querySelector('#sheet ' + s)?.getBoundingClientRect(), b = r('#brandChips'), l = r('#lineChips');
  const art = [...document.querySelectorAll('#sheet .label')].find(x => x.innerText === 'Art').getBoundingClientRect();
  return [b.height ? b.top >= r('#f-brand').bottom && b.bottom <= r('label[for=f-variety]').top : null, l.height ? l.top >= r('#f-variety').bottom && l.bottom <= art.top : null,
    [...document.querySelectorAll('#sheet [data-action=pack-line]')].map(c => c.getAttribute('aria-label'))]; }"""


async def test_pack_lines(browser, url):
    print('what the phone read off the packaging: chips while naming, in memory only')

    async def srv_route(route, request):  # a household server that recognises the photo itself
        path, now = request.url.split(':8486')[1], int(time.time() * 1000)
        if path.startswith('/api/info'):
            body = {'app': 'schmeckts', 'protocol': 1, 'recognition': True, 'features': [], 'auth': True, 'now': now}
        elif path.startswith('/api/recognize'):
            body = {'brand': 'Gourmet', 'variety': 'Gold Pastete', 'type': 'Nassfutter', 'animal': 'Katze', 'now': now}
        elif path.startswith('/api/changes') and request.method == 'POST':
            body = {'ok': [c['id'] for c in json.loads(request.post_data or '{}').get('changes', [])], 'now': now}
        elif path.startswith('/api/changes'):
            body = {'epoch': 'test', 'seq': 0, 'records': [], 'now': now}
        else:
            body = {'epoch': 'test', 'seq': 0, 'sum': '', 'fields': 0, 'now': now}
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(body))

    ctx = await phone(browser)
    await ctx.route(f'{SRV}/**', srv_route)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)

    # The phone reads the packaging: the lines it could use appear as chips under the suggestions
    await pg.evaluate(f'window.__ocrText = {json.dumps(PACK_TEXT)}')
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, '!!db.servings[0]?.guess')
    await idle(pg)
    chips, brands, places = await pg.evaluate(CHIPS), await pg.evaluate(BRAND_CHIPS), await pg.evaluate(CHIP_PLACES)
    check(
        chips == [['Katzenglück', 'false'], ['Zarte Häppchen', 'false'], ['mit Huhn', 'false']]
        and brands is None
        and places == [None, True, ['Sorte: Katzenglück', 'Sorte: Zarte Häppchen', 'Sorte: mit Huhn']]
        and await pg.evaluate(FIELDS) == ['', 'Huhn'],
        f'the lines read stand as chips under „Sorte“, each named for a screen reader, none pressed since the field holds the variety without its „mit“; no brand known, no chip under „Marke“ ({chips}, {brands}, {places})',
    )
    await shot(pg, 'pack-lines')

    # A tap sets „Sorte“ to the chip, another replaces it, a tap on the pressed one clears the field, typing
    # unpresses; the focus stays in the field being typed in all the while
    await pg.fill('#f-variety', 'Zart')
    await pg.click('#lineChips .chip:has-text("Zarte Häppchen")')
    await idle(pg)
    one = [await pg.evaluate(FIELDS), await pg.evaluate(CHIPS), await pg.evaluate('document.activeElement.id')]
    await pg.click('#lineChips .chip:has-text("mit Huhn")')
    await idle(pg)
    other = [await pg.evaluate(FIELDS), await pg.evaluate(CHIPS)]
    await pg.click('#lineChips .chip:has-text("mit Huhn")')
    await idle(pg)
    cleared = [await pg.evaluate(FIELDS), await pg.evaluate(CHIPS), await pg.evaluate('document.activeElement.id')]
    await pg.click('#lineChips .chip:has-text("Katzenglück")')
    await idle(pg)
    await pg.type('#f-variety', 'x')
    await idle(pg)
    typed = [await pg.evaluate(FIELDS), await pg.evaluate(CHIPS)]
    check(
        one == [['', 'Zarte Häppchen'], [['Katzenglück', 'false'], ['Zarte Häppchen', 'true'], ['mit Huhn', 'false']], 'f-variety']
        and other == [['', 'mit Huhn'], [['Katzenglück', 'false'], ['Zarte Häppchen', 'false'], ['mit Huhn', 'true']]]
        and cleared == [['', ''], [['Katzenglück', 'false'], ['Zarte Häppchen', 'false'], ['mit Huhn', 'false']], 'f-variety']
        and typed == [['', 'Katzenglückx'], [['Katzenglück', 'false'], ['Zarte Häppchen', 'false'], ['mit Huhn', 'false']]],
        f'a chip sets the field, the next replaces, the pressed one clears, a letter typed unpresses, and the focus stays in the field ({one}, {other}, {cleared}, {typed})',
    )
    await pg.click('[data-action=close]')
    await idle(pg)

    # Brands in the text: chips under „Marke“, at most three, in their own spelling, the one in the field pressed
    await pg.evaluate("window.__ocrText = 'SHEBA\\nFelix\\nWhiskas\\nAnimonda\\nLachs in Soße'")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, 'db.servings[0]?.guess && !db.servings[0].productId')
    await idle(pg)
    brands, fields, places = await pg.evaluate(BRAND_CHIPS), await pg.evaluate(FIELDS), await pg.evaluate(CHIP_PLACES)
    await pg.fill('#f-brand', 'Anim')
    await pg.click('#brandChips .chip:has-text("Whiskas")')
    await idle(pg)
    swapped = [await pg.evaluate(FIELDS), await pg.evaluate(BRAND_CHIPS), await pg.evaluate('document.activeElement.id')]
    labels = await pg.evaluate("[...document.querySelectorAll('#brandChips .chip')].map(c => c.getAttribute('aria-label'))")
    check(
        len(brands) == 3
        and brands[:2] == [['Animonda', 'true'], ['Whiskas', 'false']]
        and brands[2][0] in ('Sheba', 'Felix')
        and fields[0] == 'Animonda'
        and swapped[0][0] == 'Whiskas'
        and swapped[1][:2] == [['Animonda', 'false'], ['Whiskas', 'true']]
        and swapped[2] == 'f-brand'
        and labels[:2] == ['Marke: Animonda', 'Marke: Whiskas']
        and places[0] is True,
        f'the brands read stand as chips right under „Marke“, three at most, spelled as we know them, the one in the field pressed; a tap replaces the field ({brands}, {fields}, {swapped}, {labels}, {places})',
    )
    await shot(pg, 'pack-brands')
    await pg.click('[data-action=close]')
    await idle(pg)
    await pg.click('.pend-head')
    await idle(pg)

    # The lines are in memory only: they are in neither the data nor the queue, and a restart loses them
    kept = await state(pg, 'JSON.stringify([db, queue])')
    check(
        'Zarte Häppchen' not in kept and 'Katzenglück' not in kept,
        'nothing of the lines reaches the data or the queue: they live beside the meal in memory, like the photo',
    )
    await pg.reload()
    await started(pg)
    await pg.click('.pend-head')
    await idle(pg)
    check(await pg.evaluate(CHIPS) is None, 'after a restart the lines are gone, because they were never stored')
    await pg.click('[data-action=close]')
    await idle(pg)

    # The plugin's whole answer, with sizes and places: badges, a scrap of the picture and the small letter in front
    # of the large print stay out, and the product line above the flavour joins the variety. The part around the
    # variety is then cut out of the photo, enlarged to 1600 px and read a second time (here it finds nothing new).
    miamor = json.loads((ROOT / 'tests/fixtures/ocr/miamor-ragout-royal.json').read_text())
    meals = await state(pg, 'db.servings.length')
    await pg.evaluate('r => { window.__ocrQueue = [r, {text: "", blocks: []}]; window.__ocrPhotos = []; }', miamor['result'])
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK_LARGE))
    await until(pg, f'db.servings.length > {meals} && !!db.servings[0].guess')
    await idle(pg)
    chips, fields = await pg.evaluate(CHIPS), await pg.evaluate(FIELDS)
    check(
        [c[0] for c in chips] == ['Miamor', 'Ragout Royal', 'Huhn & Lachs', 'in Sauce']
        and fields == ['Miamor', 'Ragout Royal Huhn & Lachs in Sauce'],
        f'read by size and place: only the label as chips, and the variety from the largest line and what stands by it ({chips}, {fields})',
    )
    photos = await pg.evaluate("import('./js/reading.js').then(g => window.__ocrPhotos.map(b => g.jpegSize(b)).map(x => [x.width, x.height]))")
    again = await pg.evaluate(
        "import('./js/recognize.js').then(r => { const s = r.lastReading().second; return [s.left, s.top, s.right, s.bottom, s.scale]; })"
    )
    check(
        photos == [[2400, 1800], [1600, 543]] and again[:4] == [0, 113, 973, 443] and abs(again[4] - 1600 / 973) < 1e-9,
        f'read a second time: the lines around the largest one, a quarter more on every side, enlarged to 1600 px ({photos}, {again})',
    )
    before = len(await pg.evaluate('window.__calls'))
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://ocr-dump'})")
    await idle(pg)
    name = [c[1] for c in (await pg.evaluate('window.__calls'))[before:] if c[0] == 'share'][0]['files'][0].split('/')[-1]
    second = json.loads(await pg.evaluate(f"localStorage.getItem('__fs:{name}')"))['second']
    check(
        sorted(second) == ['crop', 'height', 'ms', 'result', 'scale', 'width']
        and second['crop'] == {'left': 0, 'top': 113, 'right': 973, 'bottom': 443}
        and [second['width'], second['height']] == [1600, 543]
        and second['result'] == {'text': '', 'blocks': []},
        f'and the fixture carries the second reading, as tests/ocr.test.js reads it ({sorted(second)})',
    )
    await pg.click('[data-action=close]')
    await idle(pg)

    # Recognised by the server instead: there is nothing the phone read, so there are no chips
    await pg.evaluate(
        f"import('./js/store.js').then(m => {{ m.prefs.server = '{SRV}'; m.prefs.code = 'K7PM-3QXD'; m.prefs.mode = 'haushalt'; m.savePrefs(); }})"
    )
    await pg.evaluate("import('./js/sync.js').then(m => m.startSync())")
    await until(pg, "status.state === 'ok'")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, 'db.servings[0]?.productId')
    await idle(pg)
    await pg.click('.tl [data-action=open-serving]')
    await idle(pg)
    await pg.click('#sheet [data-action=edit-name]')
    await idle(pg)
    named = await pg.evaluate(FIELDS)
    check(
        named == ['Gourmet', 'Gold Pastete'] and await pg.evaluate(CHIPS) is None,
        f'recognised by the server: the variety is there, and there are no chips, because the phone read nothing ({named})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_exchange(browser, url):
    print('manual exchange: share, receive, answer (two phones without a server)')

    async def open_exchange(pg):  # the page „Austausch von Hand“, wherever the phone currently stands
        while await pg.evaluate("document.getElementById('sheet').open"):
            await pg.click('#sheet [data-action=close], #sheet [data-action=settings-back]')
            await idle(pg)
        await settings(pg, 'exchange')

    async def shared_file(pg):  # the most recently shared exchange file from the cache
        return await pg.evaluate("""(() => { const k = Object.keys(localStorage).filter(n => n.includes('exchange')).sort();
          return localStorage.getItem(k[k.length - 1]); })()""")

    async def receive(pg, text):  # like „Austausch empfangen“ with this file
        await open_exchange(pg)
        await pg.set_input_files(
            '#exchangeInput', files=[{'name': 'schmeckts-exchange-2026-01-01.json', 'mimeType': 'application/json', 'buffer': text.encode()}]
        )
        await idle(pg)
        return await pg.inner_text('#sheet .note')

    async def data(pg):
        # Make the data comparable: keys sorted, and as in the protocol an empty field counts as a missing one
        return await state(
            pg,
            """JSON.stringify([db.pets, db.products, db.servings], (k, v) => v === null ? undefined
          : v && typeof v === 'object' && !Array.isArray(v) ? (Object.keys(v).length ? Object.fromEntries(Object.entries(v).sort()) : undefined) : v)""",
        )

    ctx_a, a, err_a = await seeded(browser, url, {'db': SAVED}, native=True)
    ctx_b = await phone(browser)
    b, err_b = await open_page(ctx_b, url, native=True)
    await a.evaluate("import('./js/store.js').then(m => { m.prefs.name = 'Geheimniskraemer'; m.savePrefs(); })")

    # First share: everything, with our own clocks, without any settings
    await open_exchange(a)
    await a.click('[data-action=share-changes]')
    await idle(a)
    text = await shared_file(a)
    file = json.loads(text)
    shared = ['share' == c[0] for c in await a.evaluate('window.__calls')]
    check(
        sorted(file) == ['app', 'at', 'clocks', 'device', 'kind', 'protocol', 'records']
        and file['app'] == 'schmeckts'
        and file['kind'] == 'exchange'
        and len(file['records']) == 5
        and len(file['clocks']['servings']) == 3
        and 'Geheimniskraemer' not in text
        and any(shared),
        f'first share: all {len(file["records"])} records including clocks, nothing from the settings',
    )
    await shot(a, 'exchange-share')

    # Receiving on the empty phone B
    note = await receive(b, text)
    da, dbb = await data(a), await data(b)
    check(
        note == '5 Änderungen übernommen. Beide Geräte sind gleich.' and dbb == da and await b.locator('[data-action=send-answer]').count() == 0,
        f'received: everything taken over, no answer needed („{note}“)',
    )
    await shot(b, 'exchange-receive')

    # Both change something different on the same record, and B deletes a meal on top
    await a.evaluate("import('./js/store.js').then(m => { m.db.products[0].variety = 'Lachs pur'; m.save(); })")
    await b.evaluate("""import('./js/store.js').then(m => { m.db.products[0].kaufen = 'immer';
      m.db.servings = m.db.servings.filter(s => s.id !== 'lxserv0001'); m.save(); })""")
    await idle(a)
    await idle(b)
    await open_exchange(b)
    await b.click('[data-action=share-changes]')
    await idle(b)
    second = json.loads(await shared_file(b))
    note = await receive(a, json.dumps(second))
    check(
        len(second['records']) == 2
        and note == '2 Änderungen übernommen. 1 Änderung fehlt auf dem anderen Gerät.'
        and await a.locator('#sheet [data-action=send-answer]').count() == 1,
        f'second share: only what is new, and something is missing over there → the „Antwort senden“ button („{note}“)',
    )
    check(
        await state(a, "db.products[0].kaufen === 'immer' && db.products[0].variety === 'Lachs pur' && db.servings.length === 2"),
        'merged per field: both changes are there, and the deleted meal stays deleted',
    )

    # The answer closes the gap: afterwards both are level
    await a.click('#sheet [data-action=send-answer]')
    await idle(a)
    answer = json.loads(await shared_file(a))
    note = await receive(b, json.dumps(answer))
    check(
        len(answer['records']) == 1
        and note == '1 Änderung übernommen. Beide Geräte sind gleich.'
        and await data(b) == await data(a)
        and await a.locator('[data-action=send-answer]').count() == 0,
        f'the answer sends exactly what was missing, after which both devices are level („{note}“)',
    )

    # Shared from another app: the app opens the receive flow by itself
    while await b.evaluate("document.getElementById('sheet').open"):
        await b.click('#sheet [data-action=close], #sheet [data-action=settings-back]')
        await idle(b)
    await b.evaluate("t => localStorage.setItem('__fs:schmeckts-exchange-shared.json', t)", json.dumps(answer))
    await b.evaluate("window.__urlOpen({url: 'content://media/external/file/schmeckts-exchange-shared.json'})")
    await idle(b)
    opened = await b.evaluate("[document.getElementById('sheet').open, document.querySelector('#sheet .page-title')?.innerText]")
    check(
        opened == [True, 'Austausch von Hand'] and 'Beide Geräte sind gleich' in await b.inner_text('#sheet .note'),
        f'shared from another app: „Austausch von Hand“ opens with the report ({opened})',
    )

    # Foreign and corrupted files
    foreign = [
        (json.dumps({'app': 'other', 'kind': 'exchange'}), 'Diese Datei ist kein Schmeckt’s-Austausch.'),
        ('kein json', 'Diese Datei ist kein Schmeckt’s-Austausch.'),
        (
            json.dumps({'version': 3, 'pets': [], 'products': [], 'servings': []}),
            'Das ist ein Backup. Es gehört unter „Daten“ zu „Backup importieren“.',
        ),
        (json.dumps({'app': 'schmeckts', 'kind': 'exchange', 'protocol': 1, 'device': 'x'}), 'Diese Austausch-Datei ist beschädigt.'),
        (
            json.dumps({'app': 'schmeckts', 'kind': 'exchange', 'protocol': 9, 'device': 'x', 'clocks': {}, 'records': []}),
            'Die Datei kommt von einer neueren App. Bitte diese App aktualisieren.',
        ),
    ]
    before = await data(b)
    notes = []
    for body, want in foreign:
        await open_exchange(b)
        await b.set_input_files('#exchangeInput', files=[{'name': 'foreign.json', 'mimeType': 'application/json', 'buffer': body.encode()}])
        await idle(b)
        notes.append((await b.inner_text('#toast')).split('\n')[0])
    check(
        notes == [w for _, w in foreign] and await data(b) == before,
        f'foreign or corrupted files: a message people understand, and nothing changed ({notes})',
    )
    check(not real_errors(err_a) and not real_errors(err_b), f'no errors in the console {real_errors(err_a)[:2]}{real_errors(err_b)[:2]}')
    await ctx_a.close()
    await ctx_b.close()


async def one_pet(browser, url, scheme='light', **kw):
    """A phone in mode `lokal` with the pet Minka, with her pet sheet open"""
    ctx = await phone(browser, scheme, **kw)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    return ctx, pg, errors


async def open_pet(pg, i=0):
    await pg.evaluate(f"import('./js/logic/pets.js').then(async p => p.openPet((await import('./js/store.js')).db.pets[{i}].id))")
    await idle(pg)


PIXEL = """([src, pts]) => new Promise(done => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); done({w: img.width, h: img.height, px: pts.map(([fx, fy]) => { const d = x.getImageData(Math.round(fx * (img.width - 1)), Math.round(fy * (img.height - 1)), 1, 1).data;
    return d[0] > 150 && d[1] < 100 ? 'red' : d[1] > 120 && d[0] < 100 ? 'green' : d[2] > 150 && d[0] < 100 ? 'blue' : d[0] > 180 && d[1] > 160 ? 'yellow' : [...d].join(); })}); }; img.src = src; })"""


CORNERS = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]


async def test_crop(browser, url):
    print('cropping the profile picture')
    make_pictures()
    ctx, pg, errors = await one_pet(browser, url)
    await open_pet(pg)
    await pg.set_input_files('#petPhotoInput', str(PACK.parent / 'quadrants.png'))
    await idle(pg)

    def crop():
        return pg.evaluate(
            "import('./js/ui/sheet.js').then(async m => { const c = (await import('./js/ui/crop.js')).cropRect(m.sheet.crop); return [Math.round(c.x), Math.round(c.y), Math.round(c.side), +m.sheet.crop.z.toFixed(2)]; })"
        )

    view = await pg.evaluate("""(() => { const st = document.getElementById('cropStage'), r = st.getBoundingClientRect(), hole = getComputedStyle(st, '::after'), z = document.getElementById('f-zoom');
      return {h2: document.querySelector('#sheet h2').innerText, square: Math.abs(r.width - r.height) < 1, round: hole.borderRadius, shade: hole.boxShadow !== 'none', touch: getComputedStyle(st).touchAction,
        zoom: [z.type, z.min, z.max, z.value], btns: [...document.querySelectorAll('#sheet .btn')].map(b => b.innerText.trim()), img: !!st.querySelector('img')}; })()""")
    check(
        view
        == {
            'h2': 'Foto zuschneiden',
            'square': True,
            'round': '50%',
            'shade': True,
            'touch': 'none',
            'zoom': ['range', '1', '4', '1'],
            'btns': ['Abbrechen', 'Übernehmen'],
            'img': True,
        },
        f'once a photo is picked the crop opens: a square stage, a round cut-out, a slider, „Abbrechen“ and „Übernehmen“ ({view["btns"]})',
    )
    check(await crop() == [200, 0, 400, 1], f'start: fully zoomed out, centre of the image ({await crop()})')
    await shot(pg, 'crop')
    box = await pg.locator('#cropStage').bounding_box()
    cx, cy, S = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, box['width']
    await pg.mouse.move(cx, cy)
    await pg.mouse.down()
    await pg.mouse.move(cx + S / 4, cy, steps=4)
    await pg.mouse.up()
    check(await crop() == [100, 0, 400, 1], f'dragged a quarter to the right with the mouse: the crop moves 100 pixels to the left ({await crop()})')
    await pg.mouse.move(cx, cy)
    await pg.mouse.down()
    await pg.mouse.move(cx + S, cy + 50, steps=4)
    await pg.mouse.up()
    check(await crop() == [0, 0, 400, 1], f'it only goes as far as the edge of the image ({await crop()})')
    await pg.evaluate("(() => { const z = document.getElementById('f-zoom'); z.value = 2; z.dispatchEvent(new Event('input', {bubbles: true})); })()")
    check(await crop() == [100, 100, 200, 2], f'slider at 2: half the edge length around the centre of the stage ({await crop()})')
    TOUCH = """(steps) => { const st = document.getElementById('cropStage'), r = st.getBoundingClientRect();
      for (const [type, id, fx, fy] of steps) st.dispatchEvent(new PointerEvent(type, {pointerId: id, pointerType: 'touch', clientX: r.left + fx * r.width, clientY: r.top + fy * r.height, bubbles: true})); }"""
    await pg.evaluate(TOUCH, [['pointerdown', 11, 0.5, 0.5], ['pointermove', 11, 0.5, 0.75], ['pointermove', 11, 0.5, 1], ['pointerup', 11, 0.5, 1]])
    check(await crop() == [100, 0, 200, 2], f'one finger pans: dragged half a stage down, the crop sits at the top ({await crop()})')
    await pg.evaluate(
        TOUCH,
        [
            ['pointerdown', 21, 0.4, 0.5],
            ['pointerdown', 22, 0.6, 0.5],
            ['pointermove', 21, 0.3, 0.5],
            ['pointermove', 22, 0.7, 0.5],
            ['pointerup', 21, 0.3, 0.5],
            ['pointerup', 22, 0.7, 0.5],
        ],
    )
    check(
        await crop() == [150, 50, 100, 4] and await pg.input_value('#f-zoom') == '4',
        f'two fingers zoom around their midpoint and the slider follows ({await crop()})',
    )
    await pg.evaluate(
        TOUCH,
        [
            ['pointerdown', 31, 0.4, 0.5],
            ['pointerdown', 32, 0.6, 0.5],
            ['pointermove', 31, 0.45, 0.5],
            ['pointermove', 32, 0.55, 0.5],
            ['pointerup', 31, 0.45, 0.5],
            ['pointerup', 32, 0.55, 0.5],
        ],
    )
    check(await crop() == [100, 0, 200, 2], f'pinching in zooms back out ({await crop()})')
    await pg.click('[data-action=crop-apply]')
    await idle(pg)
    got = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step ?? null, m.sheet.photo])")
    res = await pg.evaluate(PIXEL, [got[1], CORNERS])
    check(
        got[0] is None
        and got[1].startswith('data:image/jpeg')
        and res == {'w': 320, 'h': 320, 'px': ['red'] * 4}
        and await pg.locator('#sheet .pet-photo img').count() == 1,
        f'„Übernehmen“: square, 320 px, exactly the expected crop (the red quadrant only), in the sheet\u2019s photo field ({res})',
    )
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    check(await state(pg, 'db.pets[0].photo') == got[1], 'with „Speichern“ it sits on the pet')
    await open_pet(pg)
    await pg.set_input_files('#petPhotoInput', str(PACK))
    await idle(pg)
    await pg.click('[data-action=crop-cancel]')
    await idle(pg)
    back = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step ?? null, m.sheet.photo])")
    check(
        back == [None, got[1]] and await pg.locator('#f-name').count() == 1, '„Abbrechen“ leads back to the pet sheet and the profile picture stays'
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


SET_PETS = """pets => import('./js/store.js').then(async s => { const b64 = async u => { const r = await fetch(u), buf = new Uint8Array(await r.arrayBuffer()); let t = '';
    for (const x of buf) t += String.fromCharCode(x); return 'data:image/png;base64,' + btoa(t); };
  s.db.pets = [];
  for (const [name, url] of pets) s.db.pets.push({id: 'pet' + name.toLowerCase() + '001', name, species: 'Katze', photo: url ? await b64(url) : null, createdAt: 1});
  s.prefs.activePet = 'all'; s.save(); s.savePrefs(); (await import('./js/views/home.js')).renderHome(); })"""


MOOD = """() => { const m = document.getElementById('mood'), img = m.querySelector('img'), s = getComputedStyle(m), i = getComputedStyle(img);
  return {hidden: m.hidden || s.display === 'none', src: img.getAttribute('src') ? img.src.slice(-40) : null,
    n: m.querySelectorAll('img').length, opacity: +(+i.opacity).toFixed(2)}; }"""


RGB_OF = """(list => list.map(c => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); }))"""


async def test_sheet(browser, url):
    print('the sheet redraws only what has changed')
    ctx, pg, errors = await one_pet(browser, url)
    await settings(pg)
    await pg.evaluate("document.querySelector('#sheetBody .set-row').dataset.mark = 'x'")
    redraw = "import('./js/ui/sheet.js').then(m => m.renderSheet())"
    mark = "document.querySelector('#sheetBody .set-row')?.dataset.mark ?? null"
    await pg.evaluate(redraw)
    await idle(pg)
    kept = await pg.evaluate(mark)
    await pg.evaluate("import('./js/store.js').then(s => { s.db.pets[0].name = 'Mira'; })")
    await pg.evaluate(redraw)
    await idle(pg)
    gone = await pg.evaluate(mark)
    check(
        [kept, gone] == ['x', None] and 'Mira' in await pg.inner_text('#sheetBody'),
        f'a change from elsewhere redraws nothing that stayed the same, a changed name does ({kept}, {gone})',
    )
    await settings_page(pg, 'house')
    await pg.click('#serverBox [data-action=connect-form]')
    await idle(pg)
    check(await pg.locator('#f-code').count() == 1, 'the „Haushalt“ box is filled in afterwards, although its page is nothing but an empty box')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_mood(browser, url):
    print('the mood picture on the home page: the pet\u2019s profile picture')
    make_pictures()
    dist = url.rsplit('/', 1)[0]  # the test photos are not under www: served as a data URL through a route
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme, motion=True)
        await fixed_clock(ctx)

        async def pictures(route):
            await route.fulfill(path=str(PACK.parent / route.request.url.rsplit('/', 1)[1]), content_type='image/png')

        await ctx.route('**/testfoto/*', pictures)
        pg, errors = await open_page(ctx, url, native=True)

        def pic(n):
            return f'{dist}/testfoto/{n}'

        async def pick(who):
            await pg.evaluate(
                f"import('./js/store.js').then(async s => {{ s.prefs.activePet = '{who}'; (await import('./js/views/home.js')).renderHome(); }})"
            )
            await idle(pg)

        await pg.evaluate(SET_PETS, [['Minka', pic('quadrants.png')], ['Tiger', pic('photo0.jpg')], ['Kiwi', None]])
        await idle(pg)
        srcs = await state(pg, 'db.pets.map(p => p.photo && p.photo.slice(-40))')
        await pick('petminka001')
        css = await pg.evaluate("""() => { const m = document.getElementById('mood'), s = getComputedStyle(m), i = getComputedStyle(m.querySelector('img')), r = m.getBoundingClientRect(), b = document.querySelector('.brand').getBoundingClientRect();
          return {pos: s.position, box: [r.left, r.top, r.width === document.documentElement.clientWidth, r.height], ptr: s.pointerEvents, mask: (s.maskImage || s.webkitMaskImage).startsWith('linear-gradient') && /rgba\\(0, 0, 0, 0\\)\\)$/.test(s.maskImage || s.webkitMaskImage),
            fit: i.objectFit, opacity: +(+i.opacity).toFixed(2), filter: i.filter, trans: i.transitionProperty, front: document.elementFromPoint(b.left + 5, b.top + 10).className,
            card: getComputedStyle(document.querySelector('#home .card')).backgroundColor, first: document.body.firstElementChild.id, aria: m.getAttribute('aria-hidden')}; }""")
        want = {
            'pos': 'absolute',
            'box': [0, 0, True, 260],
            'ptr': 'none',
            'mask': True,
            'fit': 'cover',
            'opacity': 0.16 if scheme == 'light' else 0.26,
            'filter': 'saturate(0.85)',
            'trans': 'all',
            'front': 'brand',
            'first': 'mood',
            'aria': 'true',
        }
        check(
            {k: css[k] for k in want} == want and 'rgba' not in css['card'],
            f'layer ({scheme}): full width, 260 px, object-fit cover, opacity {want["opacity"]}, saturate(0.85), the mask fades right out at the bottom, and the cards sit in front unchanged ({css["box"]}, {css["opacity"]})',
        )
        await shot(pg, f'{scheme}-mood')
        # Contrast of the wordmark: in the worst case an all-black or all-white photo sits behind it
        col = await pg.evaluate(
            RGB_OF + "([getComputedStyle(document.querySelector('.brand')).color, getComputedStyle(document.body).backgroundColor])"
        )
        worst = min(contrast(col[0], [bg * (1 - css['opacity']) + px * css['opacity'] for bg in col[1]]) for px in (0, 255))
        check(worst >= 4.5, f'wordmark ({scheme}): at least 4.5:1 even in front of an all-black or all-white photo ({worst:.2f}:1)')
        if scheme == 'dark':
            await ctx.close()
            continue
        # Which picture the filter shows
        shows = {}
        for who in ('all', 'petminka001', 'pettiger001', 'petkiwi001'):
            await pick(who)
            m = await pg.evaluate(MOOD)
            shows[who] = [await pg.evaluate("import('./js/views/mood.js').then(m => m.moodPhoto().slice(-40))"), m['hidden'], m['n']]
        check(
            shows == {'all': ['', True, 1], 'petminka001': [srcs[0], False, 1], 'pettiger001': [srcs[1], False, 1], 'petkiwi001': ['', True, 1]},
            f'several pets: the chosen pet\u2019s profile picture, none under „Alle“ and none for a pet without a photo ({[v[1] for v in shows.values()]})',
        )
        await pg.evaluate(
            "import('./js/store.js').then(async s => { s.db.pets = s.db.pets.slice(0, 1); s.prefs.activePet = 'all'; s.save(); (await import('./js/views/home.js')).renderHome(); })"
        )
        await idle(pg)
        check(
            await pg.evaluate("import('./js/views/mood.js').then(m => m.moodPhoto().slice(-40))") == srcs[0]
            and await pg.locator('#pets').is_hidden(),
            'with only one pet, that pet\u2019s picture',
        )

        # The setting: a switch in its row, like every other on or off in the settings
        async def choose(on):
            await settings(pg)
            row = await pg.eval_on_selector(
                '[data-action=backdrop]',
                """r => [r.querySelector('.t-main b').innerText, r.querySelector('.t-main small').innerText,
                  Math.round(r.getBoundingClientRect().height) >= 60, r.getAttribute('role'), r.getAttribute('aria-checked')]""",
            )
            if (row[4] == 'true') != on:
                await pg.click('[data-action=backdrop]')
                await idle(pg)
            await pg.click('#sheet [data-action=settings-back]')
            await pg.clock.run_for(600)
            await idle(pg)  # the clock is stopped: closing takes 300 ms
            return row

        seg = await choose(False)
        off = [await state(pg, 'prefs.backdrop'), (await pg.evaluate(MOOD))['hidden']]
        await pg.reload()
        await started(pg)
        off.append((await pg.evaluate(MOOD))['hidden'])
        seg2 = await choose(True)
        on = [await state(pg, 'prefs.backdrop'), (await pg.evaluate(MOOD))['hidden']]
        check(
            seg == ['Profilbild im Hintergrund', 'Blass oben auf der Startseite', True, 'switch', 'true']
            and seg2[4] == 'false'
            and off == [False, True, True]
            and on == [True, False],
            f'settings: „Profilbild im Hintergrund“ as a switch, on by default; off means no layer, across a restart too ({seg}, {off}, {on})',
        )
        check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
        await ctx.close()
    old = []
    for v in ('card', 'off'):  # values from 1.1.0
        ctx, pg, errors = await seeded(browser, url, {'db': SAVED, 'prefs': {'mode': 'lokal', 'backdrop': v}})
        old.append(await state(pg, 'prefs.backdrop'))
        await ctx.close()
    check(old == [True, False], f'the 1.1.0 setting is carried over: „Übersicht“ becomes on and „Aus“ stays off ({old})')


# The status bar icons asked for, in order: DARK means light icons for a dark ground
BARS = "window.__calls.filter(c => c[0] === 'setStyle').map(c => c[1].style)"


async def test_camera(browser, url):
    print('our own camera (simulated device)')
    CAM = """() => { const d = document.getElementById('camera'), v = d.querySelector('video'), r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      return {open: d.open, box: r(d), video: [r(v), getComputedStyle(v).objectFit, v.videoWidth > 0, !!v.srcObject], hint: d.querySelector('.cam-hint').innerText, hintTop: r(d.querySelector('.cam-hint'))[1],
        shutter: r(d.querySelector('.shutter')), cancel: d.querySelector('[data-cam=cancel]').innerText, scheme: getComputedStyle(d).colorScheme, btns: d.querySelectorAll('button').length}; }"""
    LIVE = "navigator.mediaDevices.__streams.filter(s => s.getTracks().some(t => t.readyState === 'live')).length"
    SPY = """(() => { const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md); md.__streams = []; md.__asked = [];
      md.getUserMedia = c => { md.__asked.push(c); return window.__denyCamera ? Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) : orig(c).then(s => (md.__streams.push(s), s)); };
      const take = ImageCapture.prototype.takePhoto; window.__stills = [];   // the fake camera takes a still of 1920 x 1080 at most
      ImageCapture.prototype.takePhoto = function (o) { window.__stills.push(o ?? null);
        return window.__stillFails ? Promise.reject(new DOMException('Camera busy', 'UnknownError')) : take.call(this, o); }; })()"""
    ctx = await phone(browser, permissions=['camera'])
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate(SPY)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0")
    await idle(pg)
    cam = await pg.evaluate(CAM)
    asked = await pg.evaluate('navigator.mediaDevices.__asked[0]')
    check(
        cam['open']
        and cam['box'] == [0, 0, 400, 860]
        and cam['video'] == [[0, 0, 400, 860], 'cover', True, True]
        and cam['hint'] == 'Packung fotografieren'
        and cam['hintTop'] < 40
        and cam['shutter'][2] >= 72
        and cam['shutter'][1] > 700
        and abs(cam['shutter'][0] + cam['shutter'][2] / 2 - 200) <= 1
        and cam['cancel'] == 'Abbrechen'
        and cam['btns'] == 2
        and cam['scheme'] == 'dark',
        f'feeding → photo: full screen with a live preview, the hint at the top, a large shutter at the bottom centre, „Abbrechen“ ({cam["shutter"]})',
    )
    check(
        asked == {'audio': False, 'video': {'facingMode': {'ideal': 'environment'}, 'width': {'ideal': 1920}, 'height': {'ideal': 1080}}},
        f'getUserMedia: rear camera, ideally 1920×1080, without audio ({asked["video"]})',
    )
    await shot(pg, 'camera')
    await pg.evaluate('window.__calls.length = 0')
    await pg.click('#camera .shutter')
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    after = await pg.evaluate(
        "import('./js/ui/sheet.js').then(m => [document.getElementById('camera').open, m.sheet?.kind, m.sheet?.step, document.querySelectorAll('#camera button').length])"
    )
    s = await state(pg, "(s => [db.servings.length, s.status, (s.photo || '').slice(0, 23), !!s.thumb])(db.servings[0])")
    check(
        after[:3] == [False, 'serving', 'name'] and s == [1, 'noserver', 'data:image/jpeg;base64,', True] and await pg.evaluate(LIVE) == 0,
        f'the shutter takes the picture at once, without a confirmation: served, shrunk, on to naming; and the camera is released ({after}, {s})',
    )
    for _ in range(100):  # the reading is in memory beside the data, so until() does not see it
        read = await pg.evaluate("import('./js/recognize.js').then(r => r.lastReading() && [r.lastReading().width, r.lastReading().height])")
        if read:
            break
        await asyncio.sleep(0.1)
    stills = await pg.evaluate('window.__stills')
    check(
        stills == [{'imageWidth': 1920}] and read == [1920, 1080],
        f'the photo comes from the sensor as close to 2400 px as the camera offers, and the phone reads its text at that size ({stills}, {read})',
    )
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())")
    await idle(pg)
    # Cancel, the back button, the background: the camera is released at once and the feeding sheet stays
    for how, act in (
        ('„Abbrechen“', "document.querySelector('#camera [data-cam=cancel]').click()"),
        ('back button', 'window.__back({canGoBack: false})'),
        (
            'app in the background',
            "(() => { Object.defineProperty(document, 'hidden', {get: () => true, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; })()",
        ),
    ):
        await pg.click('#fab')
        await idle(pg)
        await pg.click('#sheet [data-action=photo]')
        await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0")
        await idle(pg)
        was = await pg.evaluate(f"[document.getElementById('camera').open, {LIVE}, {BARS}.at(-1)]")
        await pg.evaluate(act)
        await idle(pg)
        now = await pg.evaluate(
            f"import('./js/ui/sheet.js').then(m => [document.getElementById('camera').open, {LIVE}, m.sheet?.kind, {BARS}.at(-1)])"
        )
        check(
            was == [True, 1, 'DARK'] and now == [False, 0, 'feed', 'DEFAULT'] and await state(pg, 'db.servings.length') == 1,
            f'{how}: the camera closes and is released at once, nothing is served and the feeding sheet stays; light status bar icons only while it is open ({was}, {now})',
        )
        await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())")
        await idle(pg)
    # After an unknown barcode and through a deep link
    await pg.evaluate(f"window.__barcode = '{SHEBA}'")
    await pg.click('#fab')
    await idle(pg)
    await pg.click('[data-action=scan]')
    await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0")
    await idle(pg)
    check(
        (await pg.evaluate(CAM))['hint'] == 'Vorderseite fotografieren',
        'after an unknown barcode: our own camera with the hint „Vorderseite fotografieren“',
    )
    await pg.click('#camera .shutter')
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    check(
        await state(pg, f"db.servings.length === 2 && db.servings[0].scanCode === '{SHEBA}'") and await pg.evaluate(LIVE) == 0,
        'shutter pressed: served, and the code sits on the meal',
    )
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())")
    await idle(pg)
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})")
    await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0")
    await idle(pg)
    check((await pg.evaluate(CAM))['open'], 'the shortcut and schmeckts://photo open our own camera')
    await pg.evaluate('window.__stillFails = true')
    await pg.click('#camera .shutter')
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    check(
        await state(pg, "db.servings.length === 3 && db.servings[0].photo?.startsWith('data:image/jpeg')") and await pg.evaluate(LIVE) == 0,
        'and serve once the shutter is pressed; when the sensor will not give a photo, the frame on screen does',
    )
    await pg.evaluate('window.__stillFails = false')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())")
    await idle(pg)
    # Fallback: permission denied → the camera app through the photo plugin
    await pg.evaluate(f"window.__denyCamera = true; window.__calls.length = 0; window.__photo = '{base64.b64encode(PACK.read_bytes()).decode()}'")
    await pg.click('#fab')
    await idle(pg)
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    calls = await pg.evaluate("window.__calls.filter(c => c[0] === 'capture').map(c => c[1])")
    check(
        calls == [None] and not await pg.evaluate("document.getElementById('camera').open") and await state(pg, 'db.servings.length') == 4,
        f'camera permission denied: without our own camera it carries on through the camera app (photo plugin) and serves ({calls})',
    )
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())")
    await idle(pg)
    await pg.evaluate(
        "(() => { window.__photo = null; window.Capacitor.Plugins.Photo.capture = () => Promise.reject(new Error('camera unavailable')); })()"
    )
    await pg.click('#fab')
    await idle(pg)
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_function("document.querySelector('#toast').innerText.includes('Android-Einstellungen')")
    await idle(pg)
    t = await pg.inner_text('#toast')
    check(
        'Android-Einstellungen' in t and await state(pg, 'db.servings.length') == 4,
        f'when the camera app will not open either (Android blocks it once the permission is denied): a clear notice („{t.strip()}“)',
    )
    check(not await pg.evaluate("document.getElementById('petPhotoInput').hasAttribute('capture')"), 'the profile picture comes from the gallery')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_no_camera(browser, url):
    print('without a camera: the file picker in the browser')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    async with pg.expect_file_chooser(timeout=5000) as fc:
        await pg.click('#sheet [data-action=photo]')
    chooser = await fc.value
    check(
        chooser.element is not None and not await pg.evaluate("document.getElementById('camera').open"),
        'with no camera: the file picker in the browser',
    )
    await ctx.close()


# The status bar inset, set before the page is built: Chromium does not redo an env() fallback afterwards
INSET = """addEventListener('DOMContentLoaded', () => { const s = document.createElement('style');
  s.textContent = ':root{--safe-area-inset-top:24px}'; document.head.append(s); })"""
VIEWER = """() => { const d = document.getElementById('viewer'), i = d.querySelector('img'), x = d.querySelector('.icon-btn'),
  r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  return [d.open, i.naturalWidth, r(i), r(x), x.getAttribute('aria-label'), getComputedStyle(d).backgroundColor]; }"""
PHOTO_FILES = "Object.keys(localStorage).filter(k => k.startsWith('__fs:photos/')).sort()"
# What a view transition moves while a photo opens or closes, collected while it runs (as PAGE_STEP does)
ZOOM = """async sel => { const seen = new Map();
  const watch = setInterval(() => { for (const a of document.getAnimations()) { const p = a.effect?.pseudoElement || '';
    if (/^::view-transition-(old|new|group)\\(/.test(p) && !seen.has(p))
      seen.set(p, [p.slice('::view-transition-'.length).replace('(', ' ').replace(')', ''), a.animationName,
        a.effect.getComputedTiming().duration]); } }, 16);
  document.querySelector(sel).click();
  await new Promise(done => setTimeout(done, 600));
  clearInterval(watch);
  return [...seen.values()].sort(); }"""
# Whatever is left of a step afterwards: the class on <html> and the names in the style attributes
ZOOM_LEFT = """() => [document.documentElement.classList.contains('zoom'),
  [...document.querySelectorAll('.photo-btn img, #viewer, #viewer img')].filter(e => e.style.viewTransitionName).map(e => e.id || e.className)]"""


# How wide the photo kept for a variety is
FILE_WIDTH = """path => new Promise(done => { const i = new Image(); i.onload = () => done(i.naturalWidth); i.onerror = () => done(0);
  i.src = 'data:image/jpeg;base64,' + localStorage.getItem('__fs:' + path); })"""
# A change from another phone, as the sync delivers it: [collection, id, {field: value}]
REMOTE = """list => import('./js/store.js').then(m => { const t = String(Date.now()).padStart(13, '0') + '-0000-fremd';
  m.merge(list.map(([c, r, f]) => ({c, r, f: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, {v, t}]))}))); })"""


def large_pack():
    """The packaging photo at 1600 px, wider than the 1100 px the phone keeps: shows which size ended up where"""
    from PIL import Image

    f = PACK.parent / 'package-large.jpg'
    if not f.exists():
        Image.open(PACK).resize((1600, 1200)).save(f, quality=85)
    return str(f)


async def viewed(pg, sel):
    """Taps a photo and waits until the viewer stands open"""
    await pg.click(sel)
    await pg.wait_for_function("document.getElementById('viewer').open")
    await idle(pg)


async def closed(pg):
    await pg.wait_for_function("!document.getElementById('viewer').open")
    await idle(pg)


async def test_photo_viewer(browser, url):
    print('the packaging photo opens large where one meal or one variety is the subject')
    big = large_pack()
    ctx = await phone(browser)
    await ctx.add_init_script(INSET)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', big)
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await idle(pg)
    btn = await pg.evaluate(
        """() => { const b = document.querySelector('#sheet .photo-btn'), body = document.getElementById('sheetBody'), s = getComputedStyle(body);
          if (!b) return null; const r = b.getBoundingClientRect();
          return [!!b.querySelector(':scope > .name-photo'), Math.round(r.width) === Math.round(body.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)),
            r.height >= 48, getComputedStyle(b).borderRadius, b.getAttribute('aria-label')]; }"""
    )
    check(
        btn == [True, True, True, '24px', 'Foto vergrößern'], f'naming: the photo is a button, as wide as the sheet and as round as the photo ({btn})'
    )
    await pg.evaluate('window.__calls.length = 0')
    await viewed(pg, '#sheet .photo-btn')
    v = await pg.evaluate(VIEWER)
    under = await pg.evaluate("document.getElementById('sheet').open")
    check(
        v == [True, 1100, [0, 292, 400, 300], [348, 28, 48, 48], 'Schließen', 'rgb(27, 28, 23)'] and under and await pg.evaluate(BARS) == ['DARK'],
        f'a tap opens it over the sheet: the large photo whole and full width between two bars, the X at the top right, dark with light status bar icons ({v})',
    )
    await shot(pg, 'photo-viewer')

    # Back closes only the viewer; a tap on it and Escape close it too
    await pg.click('#viewer')
    await closed(pg)
    await pg.fill('#f-brand', 'Sheba')
    await viewed(pg, '#sheet .photo-btn')
    await pg.evaluate('window.__back({canGoBack: true})')
    await closed(pg)
    kept = await pg.evaluate(
        "import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.step, document.getElementById('f-brand').value])"
    )
    check(
        kept == [True, 'name', 'Sheba'] and (await pg.evaluate(BARS))[-1] != 'DARK',
        f'back closes the viewer and nothing else: naming stays with what was typed, the status bar follows the theme again ({kept})',
    )
    await viewed(pg, '#sheet .photo-btn')
    await pg.keyboard.press('Escape')
    await closed(pg)
    check(await pg.evaluate("document.getElementById('sheet').open"), 'Escape closes the viewer and leaves the sheet open')

    # On the home card the thumbnail opens the photo, the rest of the head the meal
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    thumb = await pg.eval_on_selector(
        '.pend .pend-top > .photo-btn',
        'b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(b).borderRadius]; }',
    )
    await viewed(pg, '.pend .pend-top > .photo-btn')
    over = await pg.evaluate("[document.getElementById('viewer').open, document.getElementById('sheet').open]")
    await pg.click('#viewer .icon-btn')
    await closed(pg)
    await pg.click('.pend-head')
    await idle(pg)
    title = await pg.inner_text('#sheet .sh-head h2')
    check(
        thumb == [48, 48, '12px'] and over == [True, False] and title == 'Futter benennen',
        f'„Wie war’s?“ on the home page: the thumbnail opens the photo, the name the meal ({thumb}, {over}, {title})',
    )

    # Named, the photo goes into a file of its own, and not into the stored data
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    pid = await state(pg, 'db.servings[0].productId')
    path = f'photos/{pid}.jpg'
    await until(pg, f"localStorage.getItem('__fs:{path}') && localStorage.getItem('__fs:db.json')?.includes('{pid}')")
    stored = await pg.evaluate(
        f"""() => {{ const f = localStorage.getItem('__fs:{path}');
          return [window.__calls.some(c => c[0] === 'writeFile' && c[1].path === '{path}' && c[1].directory === 'DATA'),
            !!f && !localStorage.getItem('__fs:db.json').includes(f.slice(-200, -100))]; }}"""
    )
    width = await pg.evaluate(FILE_WIDTH, path)
    photo = await state(pg, '[db.servings[0].photo, db.servings[0].thumb, !!db.products[0].thumb]')
    check(
        stored == [True, True] and width == 1100 and photo == [None, None, True],
        f'once named the large photo is kept as a file of the variety, outside db.json; the meal keeps no photo of its own ({stored}, {width}, {photo})',
    )

    # The meal sheet and the food sheet open it from the file
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.click('.pend-head')
    await idle(pg)
    card = await pg.evaluate(
        "[!!document.querySelector('#sheet .prod-card > .photo-btn > .thumb.xl'), !!document.querySelector('#sheet .prod-card > .prod-edit[data-action=edit-name]')]"
    )
    await viewed(pg, '#sheet .prod-card > .photo-btn')
    from_file = (await pg.evaluate(VIEWER))[1]
    await pg.click('#viewer')
    await closed(pg)
    await pg.click('#sheet .prod-edit')
    await idle(pg)
    renaming = await pg.inner_text('#sheet .sh-head h2')

    # Corrected to another variety, the photo and the thumbnail go along
    await pg.fill('#f-variety', 'Huhn')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    pid = await state(pg, 'db.servings[0].productId')
    path = f'photos/{pid}.jpg'
    await until(pg, f"!!localStorage.getItem('__fs:{path}')", timeout=4)
    moved = [
        await pg.evaluate(PHOTO_FILES),
        await state(pg, 'db.products.map(p => [p.variety, !!p.thumb])'),
        await pg.locator('#sheet .prod-card > .photo-btn > img.thumb').count(),
    ]
    check(
        moved == [[f'__fs:{path}'], [['Huhn', True]], 1],
        f'a meal put under another variety takes its photo and thumbnail along, the old variety goes ({moved})',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))")
    await idle(pg)
    food = await pg.locator('#sheet .prod-card > .photo-btn').count()
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    check(
        card == [True, True] and from_file == 1100 and renaming == 'Futter ändern' and food == 1,
        f'meal sheet: the thumbnail opens the photo, the rest of the card leads to naming; the food sheet opens it too ({card}, {from_file}, {renaming}, {food})',
    )

    # After a restart it is read from the file
    await pg.reload()
    await started(pg)
    await viewed(pg, '.pend .pend-top > .photo-btn')
    check((await pg.evaluate(VIEWER))[1] == 1100, 'after a restart the photo opens from the file')
    await pg.click('#viewer')
    await closed(pg)

    # A file that cannot be read: a word, the thumbnail becomes a plain one, the file goes
    good = await pg.evaluate(f"localStorage.getItem('__fs:{path}')")
    await pg.evaluate(f"localStorage.setItem('__fs:{path}', 'kaputt')")
    await pg.reload()
    await started(pg)
    await pg.click('.pend .pend-top > .photo-btn')
    await until(pg, f"!localStorage.getItem('__fs:{path}')", timeout=4)
    await idle(pg)
    broken = [
        await pg.evaluate("document.getElementById('viewer').open"),
        (await pg.inner_text('#toast')).split('\n')[0],
        await pg.locator('.photo-btn').count(),
        await pg.locator('.pend .pend-head > .thumb').count(),
    ]
    check(broken == [False, 'Das Foto ist nicht mehr da.', 0, 1], f'a broken file: a word, and the thumbnail is a plain one again ({broken})')

    # Without a file here (a variety from another phone, or from before) the card is the one button it was
    await pg.click('.pend-head')
    await idle(pg)
    plain = await pg.evaluate("[!!document.querySelector('#sheet button.prod-card'), document.querySelectorAll('#sheet .photo-btn').length]")
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    check(plain == [True, 0], f'without the file the meal card stays one button ({plain})')

    # Tidying up: a file whose variety is gone goes at the next start, and „Alle Daten löschen“ takes all of them
    await pg.evaluate(f"[localStorage.setItem('__fs:{path}', {json.dumps(good)}), localStorage.setItem('__fs:photos/zzzz9999.jpg', 'x')]")
    await pg.reload()
    await started(pg)
    stray = await pg.evaluate(PHOTO_FILES)
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))")
    await idle(pg)
    await pg.click('#sheet [data-action=arm][data-then=delete-product]')
    await pg.click('#sheet [data-action=arm][data-then=delete-product]')
    await idle(pg)
    await pg.reload()
    await started(pg)
    deleted = await pg.evaluate(PHOTO_FILES)
    # After a restart only the meal's smaller photo is left, and that one is kept
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', big)
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await pg.reload()
    await started(pg)
    await pg.click('.pend-head')
    await idle(pg)
    await viewed(pg, '#sheet .photo-btn')
    small = (await pg.evaluate(VIEWER))[1]
    await pg.click('#viewer')
    await closed(pg)
    await pg.fill('#f-brand', 'Felix')
    await pg.fill('#f-variety', 'Huhn')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    felix = await state(pg, 'db.servings[0].productId')
    await until(pg, f"!!localStorage.getItem('__fs:photos/{felix}.jpg')")
    check(
        [small, await pg.evaluate(FILE_WIDTH, f'photos/{felix}.jpg')] == [480, 480],
        'named after a restart: the photo in the viewer and the one kept are the smaller one the meal had',
    )
    await settings(pg)
    await pg.click('#sheet [data-action=arm][data-then=wipe]')
    await pg.click('#sheet [data-action=arm][data-then=wipe]')
    await idle(pg)
    wiped = await pg.evaluate(PHOTO_FILES)
    check(
        stray == [f'__fs:{path}'] and deleted == [] and wiped == [],
        f'photos of varieties that are gone are removed at the start, and „Alle Daten löschen“ removes them all ({stray}, {deleted}, {wiped})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # In the browser nothing is kept: only the photo of a meal still to be named opens
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await idle(pg)
    await viewed(pg, '#sheet .photo-btn')
    before = (await pg.evaluate(VIEWER))[1]
    await pg.click('#viewer')
    await closed(pg)
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    after = await pg.locator('#sheet .photo-btn').count()
    check(before == 480 and after == 0, f'browser: the photo opens before naming, and after it there is none to open ({before}, {after})')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # From elsewhere: named on another phone, the photo is handed over at once, even without photos to the server,
    # and when the variety is merged there it follows
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', big)
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    sid = await state(pg, 'db.servings[0].id')
    rind = {'brand': 'Animonda', 'variety': 'Rind', 'type': 'Nassfutter', 'createdAt': 1}
    await pg.evaluate(REMOTE, [['products', 'fremdsorte01', rind], ['servings', sid, {'productId': 'fremdsorte01'}]])
    handed = await until(pg, "!!localStorage.getItem('__fs:photos/fremdsorte01.jpg') && !db.servings[0].photo && !db.servings[0].status", timeout=4)
    await idle(pg)
    there = [await pg.evaluate(FILE_WIDTH, 'photos/fremdsorte01.jpg'), await pg.locator('.pend .pend-top > .photo-btn').count()]
    check(handed and there == [1100, 1], f'named on another phone: the large photo becomes the variety’s here at once ({handed}, {there})')
    await pg.evaluate(
        REMOTE,
        [
            ['products', 'fremdsorte02', {**rind, 'variety': 'Rind in Soße'}],
            ['servings', sid, {'productId': 'fremdsorte02'}],
            ['products', 'fremdsorte01', {'_del': True}],
        ],
    )
    await until(pg, "!!localStorage.getItem('__fs:photos/fremdsorte02.jpg')", timeout=4)
    await pg.reload()
    await started(pg)
    check(
        await pg.evaluate(PHOTO_FILES) == ['__fs:photos/fremdsorte02.jpg'],
        f'merged on another phone: the photo follows the meal and survives the next start ({await pg.evaluate(PHOTO_FILES)})',
    )

    # A sheet from a link over the open photo: the photo goes, back then closes the sheet
    await viewed(pg, '.pend .pend-top > .photo-btn')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://feed'})")
    await idle(pg)
    link = await pg.evaluate("import('./js/ui/sheet.js').then(m => [document.getElementById('viewer').open, m.sheet?.kind])")
    await pg.evaluate('window.__back({canGoBack: true})')
    await idle(pg)
    check(
        link == [False, 'feed'] and not await pg.evaluate("document.getElementById('sheet').open") and (await pg.evaluate(BARS))[-1] == 'DEFAULT',
        f'a link opens its sheet in place of the photo, and back closes that sheet ({link})',
    )

    # The system switching between light and dark keeps the icons light while the photo is open
    await viewed(pg, '.pend .pend-top > .photo-btn')
    await pg.emulate_media(color_scheme='dark')
    await pg.emulate_media(color_scheme='light')
    await idle(pg)
    switched = (await pg.evaluate(BARS))[-1]
    # Redrawn under the photo, the thumbnail gets the focus back when it closes
    await pg.evaluate("import('./js/views/home.js').then(m => m.renderHome())")
    await pg.keyboard.press('Escape')
    await closed(pg)
    focus = await pg.evaluate('document.activeElement.className')
    check(
        switched == 'DARK' and focus == 'photo-btn' and (await pg.evaluate(BARS))[-1] == 'DEFAULT',
        f'a switch of the system theme keeps the icons light over the photo; closing returns the focus to the thumbnail although it was redrawn ({switched}, {focus})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # With motion the photo grows out of its thumbnail and back; only the photo moves, the ground fades
    ctx = await phone(browser, motion=True)
    await ctx.add_init_script(INSET)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await idle(pg)
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.click('.pend-head')
    await idle(pg)
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs')
    await pg.click('[data-action=save-name]')
    await idle(pg)
    opening = await pg.evaluate(ZOOM, '#sheet .prod-card > .photo-btn')
    await idle(pg)
    closing = await pg.evaluate(ZOOM, '#viewer')
    await idle(pg)
    left = await pg.evaluate(ZOOM_LEFT)
    check(
        [o[0] for o in opening] == ['group photo', 'new photo', 'new viewer', 'old photo']
        and all(o[2] == 300 for o in opening)
        and ['new viewer', 'fadeIn', 300] in opening,
        f'opening: the photo grows out of the thumbnail and the ground fades in; nothing else moves ({opening})',
    )
    check(
        [c[0] for c in closing] == ['group photo', 'new photo', 'old photo', 'old viewer']
        and all(c[2] == 300 for c in closing)
        and ['old viewer', 'fadeOut', 300] in closing,
        f'closing: the photo goes back into the thumbnail and the ground fades out ({closing})',
    )
    check(left == [False, []], f'afterwards no name and no class of the step is left ({left})')
    # Back pressed twice while it closes: the next photo still stays open
    await viewed(pg, '#sheet .prod-card > .photo-btn')
    await pg.evaluate("document.getElementById('viewer').click(); setTimeout(() => window.__back({canGoBack: true}), 60)")
    await closed(pg)
    await viewed(pg, '#sheet .prod-card > .photo-btn')
    await pg.wait_for_timeout(400)
    again = await pg.evaluate("document.getElementById('viewer').open")
    await pg.click('#viewer')
    await closed(pg)
    check(again, 'back pressed while the photo was closing does not close the next one')
    # A level of the sheet or a page opens at rest: its bar title and line never show first and fade out
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    flash = await pg.evaluate(
        """async () => { const seen = []; document.querySelector('[data-action=open-settings]').click();
          for (let i = 0; i < 20; i++) { await new Promise(d => requestAnimationFrame(d)); const b = document.querySelector('#sheet .page-bar');
            if (b) seen.push(Math.max(+getComputedStyle(b.querySelector('.bar-title')).opacity, +getComputedStyle(b, '::after').opacity)); }
          return Math.max(0, ...seen); }"""
    )
    await idle(pg)
    await pg.evaluate('(b => b.scrollTop = b.scrollHeight)(document.getElementById("sheetBody"))')
    await idle(pg)
    deeper = await pg.evaluate(
        """async () => { const seen = []; document.querySelector('#sheet [data-action=settings-page][data-v=house]').click();
          for (let i = 0; i < 20; i++) { await new Promise(d => requestAnimationFrame(d)); const b = document.querySelector('#sheet .page-bar');
            if (b?.querySelector('.bar-title').innerText === 'Haushalt')
              seen.push(Math.max(+getComputedStyle(b.querySelector('.bar-title')).opacity, +getComputedStyle(b, '::after').opacity)); }
          return [seen.length > 0, Math.max(0, ...seen)]; }"""
    )
    check(
        flash == 0 and deeper == [True, 0],
        f'a page, and a level reached from a scrolled one, arrive with neither the bar title nor the line showing, not even for a frame ({flash}, {deeper})',
    )
    await idle(pg)
    await settings_back(pg)
    await settings_back(pg)
    await viewed(pg, '.pend .pend-top > .photo-btn')
    redraw = await pg.evaluate(
        """import('./js/views/home.js').then(m => { const o = document.startViewTransition; let n = 0;
          document.startViewTransition = function (...a) { n++; return o.apply(this, a); };
          m.update(); document.startViewTransition = o; return n; })"""
    )
    check(redraw == 0, f'a redraw of the home page under the open viewer starts no transition of its own ({redraw})')
    await pg.click('#viewer')
    await closed(pg)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # Under reduced motion it simply appears
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'noserver'")
    await idle(pg)
    still = await pg.evaluate(ZOOM, '#sheet .photo-btn')
    check(still == [] and await pg.evaluate("document.getElementById('viewer').open"), f'reduced motion: it opens without a transition ({still})')
    await ctx.close()


# Varieties and meals to order: n varieties each with its own brand, one meal each `gap` days apart (0 = one hour)
SORTS = """([n, gap]) => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now();
  const brands = ['Sheba', 'Felix', 'Gourmet', 'Whiskas', 'Animonda', 'Miamor', 'Cosma', 'Rinti', 'Bozita', 'Schesir'];
  const levels = ['top', 'gut', 'mittel', 'sosse', 'schlecht'];
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = Array.from({length: n}, (_, i) => ({id: 'sorte' + String(i).padStart(5, '0'), brand: brands[i % 10],
    variety: 'Sorte ' + (i + 1), type: 'Nassfutter', codes: {}, createdAt: i}));
  d.servings = d.products.map((p, i) => ({id: 'meal' + String(i).padStart(6, '0'), productId: p.id, note: '', by: ['Anna', 'Jonas'][i % 2],
    servedAt: now - 36e5 - i * (gap || 1 / 24) * 864e5, pets: {minka00001: {r: levels[i % 5], at: now}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_feed_routes(browser, url):
    print('feeding: both buttons, and both routes also through the shortcuts')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await settings(pg)
    labels = await pg.eval_on_selector_all('#sheet .label', 'l => l.map(e => e.innerText)')
    await settings_back(pg)
    await pg.click('#fab')
    await idle(pg)
    cta = await pg.eval_on_selector_all('#sheet .cta', 'l => l.map(b => [b.dataset.action, Math.round(b.getBoundingClientRect().width)])')
    row = await pg.eval_on_selector('#sheet .cta-row', 'r => Math.round(r.getBoundingClientRect().width)')
    check(
        [c[0] for c in cta] == ['scan', 'photo'] and cta[0][1] == cta[1][1] and cta[0][1] < row and 'Füttern beginnt mit' not in labels,
        f'always both buttons, equally wide, and nothing to set in the settings ({cta}, row {row} px)',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    # Both routes also come in through the shortcuts
    await pg.evaluate(f'window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})")
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    check(await state(pg, "db.servings[0].photo && db.servings[0].status === 'noserver'"), 'schmeckts://photo takes a photo')
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.evaluate(f"window.__barcode = '{SHEBA}'")
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})")
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    check(
        ['capture', {'hint': 'Vorderseite fotografieren'}] in await pg.evaluate('window.__calls')
        and await state(pg, f"db.servings[0].scanCode === '{SHEBA}'"),
        'schmeckts://scan scans, and the unknown code leads to the photo',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    was = await state(pg, 'db.servings.length')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://foto'})")
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    old_link = await state(pg, 'db.servings.length') == was + 1
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://fuettern'})")
    await idle(pg)
    check(
        old_link and await pg.evaluate("!!document.querySelector('#sheet .cta-row')"),
        'the German links from before the move to English still work: they sit in people\u2019s shortcuts',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def top_pixel(pg):
    """The colour of the topmost strip of the screen, where the status bar sits"""
    from PIL import Image

    shot = PACK.parent / 'top.png'
    await pg.screenshot(path=str(shot), clip={'x': 150, 'y': 2, 'width': 4, 'height': 4})
    return Image.open(shot).convert('RGB').getpixel((2, 2))


async def test_start(browser, url):
    print('start: the splash stays until the app is there, nothing moves, and it never hangs')
    ctx = await phone(browser)
    pg = await ctx.new_page()
    await pg.add_init_script(NATIVE)
    await pg.add_init_script(SHIFTS)
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    await pg.goto(url)
    await started(pg)
    hid = await pg.evaluate("window.__calls.filter(c => c[0] === 'hideSplash').map(c => c[1])")
    check(
        hid == [{'fadeOutDuration': 200, 'drawn': True, 'draws': 1, 'fonts': True}],
        f'the splash goes exactly once, after the home page was drawn exactly once and both typefaces are there ({hid})',
    )
    shifts = await pg.evaluate('window.__shifts')
    check(not shifts, f'and nothing moved on the way there: no layout shift ({shifts})')
    used = await pg.evaluate(
        """[...document.styleSheets].flatMap(s => [...s.cssRules]).filter(r => r.constructor.name === 'CSSFontFaceRule')
             .map(r => [r.style.getPropertyValue('font-family'), r.style.getPropertyValue('font-display')])"""
    )
    check(
        sorted(used) == [['Faustina', 'block'], ['Figtree', 'block']],
        f'the typefaces are drawn only once they are there, never in a stand-in first ({used})',
    )
    preload = await pg.eval_on_selector_all(
        'link[rel=preload]', "l => l.map(x => [x.getAttribute('as'), x.getAttribute('type'), x.crossOrigin, x.getAttribute('href')])"
    )
    check(
        preload
        == [['font', 'font/woff2', 'anonymous', 'fonts/figtree-latin.woff2'], ['font', 'font/woff2', 'anonymous', 'fonts/faustina-latin.woff2']],
        f'both files are asked for right away ({preload})',
    )
    check(
        not await pg.evaluate("document.body.className.includes('intro')")
        and not await pg.evaluate("document.getAnimations().some(a => a.playState === 'running')"),
        'and nothing fades in by itself: after the splash the page is simply there',
    )
    await ctx.close()

    # A strip of the background behind the status bar, as tall as the inset, and the sheet's dimming over it.
    # The inset comes in before the page is built: Chromium does not redo an env() fallback afterwards.
    ctx = await phone(browser)
    pg = await ctx.new_page()
    await pg.add_init_script(
        "addEventListener('DOMContentLoaded', () => { const s = document.createElement('style');"
        "  s.textContent = ':root{--safe-area-inset-top:24px}'; document.head.append(s); })"
    )
    await pg.goto(url)
    await started(pg)
    await pg.click('.welcome [data-action=mode-local]')
    await idle(pg)
    bar = await pg.evaluate(
        """(() => { const s = getComputedStyle(document.body, '::before');
          return [s.height, s.position, s.opacity, s.zIndex, s.backgroundImage,
            s.backgroundColor === getComputedStyle(document.body).backgroundColor,
            getComputedStyle(document.querySelector('.top')).paddingTop]; })()"""
    )
    check(
        bar == ['24px', 'fixed', '0', '5', 'none', True, '36px'],
        f'at the top the strip behind the status bar is invisible, so the picture reaches the edge; it is exactly as tall as the status bar and plain ({bar})',
    )
    moved = await pg.evaluate(
        """(async () => { const wait = ms => new Promise(r => setTimeout(r, ms));
          document.body.style.minHeight = '3000px';
          window.scrollTo(0, 60); await wait(300);
          const on = [document.documentElement.classList.contains('scrolled'),
            getComputedStyle(document.body, '::before').opacity];
          window.scrollTo(0, 0); document.body.style.minHeight = ''; await wait(300);
          return on.concat(getComputedStyle(document.body, '::before').opacity); })()"""
    )
    check(
        moved == [True, '1', '0'],
        f'once the page has moved the strip is there, and it goes again at the top ({moved})',
    )
    plain = await top_pixel(pg)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    dimmed = await top_pixel(pg)
    check(
        sum(dimmed) < sum(plain) - 60,
        f'with a sheet open its dimming lies over the strip, not the other way round ({plain} → {dimmed})',
    )
    await ctx.close()

    # The safety net: with the typefaces never arriving the splash still goes, within 2.5 s
    ctx = await phone(browser)
    pg = await ctx.new_page()
    await pg.add_init_script(NATIVE)
    await pg.add_init_script('document.fonts.load = () => new Promise(() => {});')
    began = time.monotonic()
    await pg.goto(url)
    await pg.wait_for_function("window.__calls.some(c => c[0] === 'hideSplash')", timeout=5000)
    took = time.monotonic() - began
    check(2 < took < 4, f'a start that never finishes: the splash goes anyway, after {took:.1f} s')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


GROUPS = """() => [...document.querySelectorAll('#sheet .set-group')].map(g => [g.previousElementSibling.innerText,
  [...g.querySelectorAll('.set-row')].map(r => [r.querySelector('.t-main b').innerText, r.getAttribute('role'),
    r.querySelector('.chev') ? 'chevron' : null])])"""
# One step between two levels of a page: what the view transition moves, and nothing else. The pictures are only
# there for the length of the step, so they are collected while it runs. A group among them would mean the box
# itself is being animated as well, which scales both pictures while they slide.
PAGE_STEP = """async sel => { const seen = new Map();
  const watch = setInterval(() => { for (const a of document.getAnimations()) { const p = a.effect?.pseudoElement || '';
    if (/^::view-transition-(old|new|group)\\(/.test(p) && !seen.has(p))
      seen.set(p, [p.slice('::view-transition-'.length).replace('(', ' ').replace(')', ''), a.animationName,
        a.effect.getComputedTiming().duration]); } }, 16);
  document.querySelector(sel).click();
  await new Promise(done => setTimeout(done, 400));
  clearInterval(watch);
  return [...seen.values()].sort(); }"""

# The page body fills the dialog on every level, so that the step has nothing but the two pictures to move
BODY_BOX = """() => { const b = document.getElementById('sheetBody').getBoundingClientRect();
  const d = document.getElementById('sheet'), s = getComputedStyle(d);
  return [Math.round(b.height), Math.round(d.getBoundingClientRect().height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom))]; }"""


# Where the page stands: its title, whether the sheet is a full-screen page, and how far it sits from the left
PAGE = """() => { const d = document.getElementById('sheet'), r = d.getBoundingClientRect();
  return [document.querySelector('#sheet .page-title')?.innerText ?? null, d.open, d.classList.contains('page'),
    Math.round(r.width), Math.round(r.height), Math.round(r.left)]; }"""

# The top edge of what is open (PROJECT.md, „Building blocks“, scroll edge): the bar, its line and its title
EDGE = """() => { const d = document.getElementById('sheet'), body = document.getElementById('sheetBody'),
  bar = body.querySelector(':scope > .page-bar'), title = bar.nextElementSibling, small = bar.querySelector('.bar-title'),
  line = getComputedStyle(bar, '::after'), r = bar.getBoundingClientRect(), t = title.getBoundingClientRect(),
  probe = v => { const e = document.createElement('i'); e.style.color = `var(${v})`; d.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
  return {bar: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], below: t.top >= r.bottom,
    seen: document.elementFromPoint(t.left + 8, t.top + 2) === title,
    line: [line.height, line.backgroundImage, line.opacity, line.backgroundColor === probe('--line')],
    small: [getComputedStyle(small).opacity, small.innerText === title.innerText, small.getAttribute('aria-hidden')],
    scrolled: d.classList.contains('scrolled'), titled: d.classList.contains('titled'), wide: body.scrollWidth === body.clientWidth,
    at: title.offsetTop + title.offsetHeight - bar.offsetHeight}; }"""
# The colours a token has here, as [r, g, b]
TOKENS = """list => list.map(v => { const e = document.createElement('i'); e.style.color = `var(${v})`; document.getElementById('sheet').append(e);
  const c = getComputedStyle(e).color.match(/\\d+/g).map(Number).slice(0, 3); e.remove(); return c; })"""


async def column(pg, x, y):
    """The colours of the screen at x from y - 6 to y + 5, one per row"""
    import io
    from PIL import Image

    png = await pg.screenshot(clip={'x': x, 'y': y - 6, 'width': 1, 'height': 12}, scale='css')
    img = Image.open(io.BytesIO(png)).convert('RGB')
    return [img.getpixel((0, i)) for i in range(12)]


def rows(col, want):
    """Whether every row is within 2 of the colour expected there"""
    return all(all(abs(a - b) <= 2 for a, b in zip(c, w)) for c, w in zip(col, want))


async def test_edges(browser, url):
    print('the top edge: nothing fades, the bar ends straight and draws a line only while something lies under it')
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme)
        await ctx.add_init_script(INSET)
        pg, errors = await open_page(ctx, url, scheme)
        await pg.click('[data-action=demo]')
        await idle(pg)
        await settings(pg)
        rest = await pg.evaluate(EDGE)
        check(
            rest['bar'] == [0, 24, 400, 56]
            and rest['below']
            and rest['seen']
            and rest['line'] == ['1px', 'none', '0', True]
            and rest['small'] == ['0', True, 'true']
            and rest['wide']
            and not rest['scrolled'],
            f'{scheme}, at rest: the bar is the full width and 56px under the status bar, holds the arrow only and lies over nothing ({rest})',
        )
        await pg.evaluate("document.getElementById('sheetBody').scrollTop = 1")
        await idle(pg)
        one = await pg.evaluate(EDGE)
        check(
            one['scrolled'] and one['line'][2] == '1' and one['small'][0] == '0' and not one['titled'],
            f'{scheme}, moved by a pixel: the line is there, the title not yet ({one["line"]}, {one["small"]})',
        )
        at = rest['at']
        await pg.evaluate(f"document.getElementById('sheetBody').scrollTop = {at - 1}")
        await idle(pg)
        before = (await pg.evaluate(EDGE))['titled']
        await pg.evaluate(f"document.getElementById('sheetBody').scrollTop = {at}")
        await idle(pg)
        titled = await pg.evaluate(EDGE)
        await pg.evaluate("document.getElementById('sheetBody').scrollTop = 0")
        await idle(pg)
        back = await pg.evaluate(EDGE)
        check(
            not before and titled['titled'] and titled['small'][0] == '1' and not back['scrolled'] and not back['titled'],
            f'{scheme}: once the title has gone under the bar it stands in the bar, and at the top neither is left ({before}, {titled["small"]}, {back["scrolled"]}, {back["titled"]})',
        )
        # The edge in pixels: the bar's ground down to its last row, the line, then the group under it, and no row between
        bottom = await pg.evaluate(
            """() => { const body = document.getElementById('sheetBody'), bar = body.querySelector('.page-bar').getBoundingClientRect(),
              g = body.querySelector('.set-group'); body.scrollTop += g.getBoundingClientRect().top - (bar.bottom - 30); return bar.bottom; }"""
        )
        await idle(pg)
        bg, line, surface = await pg.evaluate(TOKENS, ['--bg', '--line', '--surface'])
        col = await column(pg, 24, bottom)
        check(
            rows(col, [bg] * 5 + [line] + [surface] * 6),
            f'{scheme}: the content is cut straight at the bar, with the line right at its edge ({col})',
        )
        await shot(pg, f'edge-page-{scheme}')

        # A level deeper arrives at rest, and so does the way back
        await pg.evaluate('(b => b.scrollTop = b.scrollHeight)(document.getElementById("sheetBody"))')
        await idle(pg)
        deep = [await pg.evaluate(EDGE)]
        await settings_page(pg, 'house')
        deep.append(await pg.evaluate(EDGE))
        await settings_back(pg)
        deep.append(await pg.evaluate(EDGE))
        check(
            [x['titled'] for x in deep] == [True, False, False] and [x['scrolled'] for x in deep] == [True, False, False],
            f'{scheme}: a level deeper arrives at rest, and so does the one you come back to ({[(x["scrolled"], x["titled"]) for x in deep]})',
        )
        check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
        await ctx.close()

    # „Verlauf“: the day line parks under the bar and takes the line over; with more days than drawn at first and
    # with fewer, where the list never grows
    for scheme, n in (('light', 26), ('dark', 8)):
        ctx = await phone(browser, scheme)
        await ctx.add_init_script(INSET)
        pg, errors = await open_page(ctx, url, scheme)
        await pg.evaluate(SORTS, [n, 1])
        await idle(pg)
        home = await pg.eval_on_selector('[data-sec=hist] .tl-date', 'd => getComputedStyle(d).position')
        await pg.click('[data-sec=hist] [data-action=open-report]')
        await idle(pg)
        await pg.evaluate("document.getElementById('sheetBody').scrollTop = 40")
        await pg.wait_for_timeout(150)
        await idle(pg)
        ring = await pg.evaluate(
            "[document.querySelectorAll('#sheet .tl-date.stuck').length, getComputedStyle(document.querySelector('#sheet .page-bar'), '::after').opacity]"
        )
        bottom = await pg.evaluate(
            """() => { const body = document.getElementById('sheetBody'), bar = body.querySelector('.page-bar').getBoundingClientRect(),
              d = body.querySelector('.days .tl-date'); body.scrollTop += d.getBoundingClientRect().top - bar.bottom + 60; return bar.bottom; }"""
        )
        await pg.wait_for_timeout(150)
        await idle(pg)
        parked = await pg.evaluate(
            f"""() => {{ const d = document.elementFromPoint(innerWidth / 2, {bottom} + 4)?.closest('.tl-date');
              return d && [d.classList.contains('stuck'), Math.abs(d.getBoundingClientRect().top - {bottom}) <= 0.5,
                getComputedStyle(d, '::after').opacity, getComputedStyle(document.querySelector('#sheet .page-bar'), '::after').opacity,
                getComputedStyle(d).position, getComputedStyle(d).top]; }}"""
        )
        bg, surface = await pg.evaluate(TOKENS, ['--bg', '--surface'])
        col = await column(pg, 26, bottom)
        check(
            home == 'static' and ring == [0, '1'] and parked == [True, True, '1', '0', 'sticky', '56px'],
            f'{scheme}, „Verlauf“: the bar draws the line over the ring card; a parked day line takes it over, on the home page it does not stick ({home}, {ring}, {parked})',
        )
        check(rows(col, [bg] * 6 + [surface] * 6), f'{scheme}: under the bar the day line follows straight, with no second line ({col})')
        await shot(pg, f'edge-report-{scheme}')
        check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
        await ctx.close()

    # A sheet: the grip's line once the contents have moved, and no mask
    ctx = await phone(browser, width=360, height=640)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(SORTS, [26, 1])
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.click('#sheet [data-action=new-product]')
    await idle(pg)
    GRIP = """() => [getComputedStyle(document.querySelector('#sheet .grip-zone'), '::after').opacity,
      getComputedStyle(document.getElementById('sheetBody')).maskImage, (b => b.scrollHeight > b.clientHeight)(document.getElementById('sheetBody'))]"""
    still = await pg.evaluate(GRIP)
    await pg.evaluate("document.getElementById('sheetBody').scrollTop = 40")
    await idle(pg)
    moved = await pg.evaluate(GRIP)
    check(
        still == ['0', 'none', True] and moved[:2] == ['1', 'none'],
        f'a sheet: the grip draws its line once the contents have moved, and nothing is masked ({still}, {moved})',
    )
    await shot(pg, 'edge-sheet')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # Large system text on a small phone: the bar keeps its height and its title one line
    ctx = await phone(browser, width=360)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await pg.evaluate(BIG_TEXT, 1.3)
    await settings(pg)
    await pg.evaluate('(b => b.scrollTop = b.scrollHeight)(document.getElementById("sheetBody"))')
    await idle(pg)
    big = await pg.evaluate(
        """() => { const b = document.querySelector('#sheet .page-bar'), t = b.querySelector('.bar-title'), body = document.getElementById('sheetBody');
          return [Math.round(b.getBoundingClientRect().height), t.getBoundingClientRect().height <= 1.5 * parseFloat(getComputedStyle(t).lineHeight),
            body.scrollWidth === body.clientWidth]; }"""
    )
    check(big == [56, True, True], f'large text at 360px: the bar stays 56px, its title one line, nothing wider than the screen ({big})')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # With motion the line and the title fade in over 200 ms; under reduced motion they switch at once
    for motion in (True, False):
        ctx = await phone(browser, motion=motion)
        pg, errors = await open_page(ctx, url)
        await settings(pg)
        fade = await pg.evaluate(
            """() => { const b = document.querySelector('#sheet .page-bar');
              return [getComputedStyle(b, '::after').transitionDuration, getComputedStyle(b.querySelector('.bar-title')).transitionDuration]; }"""
        )
        quick = all(float(f.rstrip('s')) < 0.01 for f in fade)
        check(
            fade == ['0.2s', '0.2s'] if motion else quick,
            f'{"with motion" if motion else "reduced motion"}: line and title {"fade in over 200 ms" if motion else "switch at once"} ({fade})',
        )
        await ctx.close()


async def test_settings(browser, url):
    print('the settings: a page of grouped rows, each level one step back')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'granted')")
    await pg.click('[data-action=demo]')
    await idle(pg)
    await settings(pg)
    groups = await pg.evaluate(GROUPS)
    check(
        groups
        == [
            ['Tiere', [['Mau', None, 'chevron'], ['Tier hinzufügen', None, None]]],
            ['Darstellung', [['Farbschema', None, None], ['Profilbild im Hintergrund', 'switch', None]]],
            ['Erinnerungen', [['Ans Bewerten erinnern', 'switch', None], ['Ans Füttern erinnern', 'switch', None]]],
            [
                'Teilen',
                [['Dein Name', None, None], ['Haushalt', None, 'chevron'], ['Austausch von Hand', None, 'chevron']],
            ],
            ['Scannen', [['Produktsuche im Internet', 'switch', None]]],
            ['Daten', [['Backup', None, 'chevron'], ['Beispieldaten laden', None, None], ['Datenschutz', None, 'chevron']]],
        ],
        f'the overview: six groups, every on or off a switch and only a page behind a chevron ({[[g[0], len(g[1])] for g in groups]})',
    )
    await shot(pg, 'settings-overview')
    # No row carries a value on the right any more: what is set is the control in the row itself
    vals = await pg.evaluate("[...document.querySelectorAll('#sheet .set-row .val, #sheet .set-row .row-ic')].length")
    seg = await pg.evaluate(
        """(() => { const r = [...document.querySelectorAll('#sheet .set-row')].find(x => x.querySelector('.t-main b').innerText === 'Farbschema');
          const s = r.nextElementSibling.querySelector('.seg');
          return [[...s.querySelectorAll('button')].map(b => [b.innerText.trim(), b.getAttribute('aria-pressed')]),
            Math.round(s.getBoundingClientRect().left - r.querySelector('.t-main').getBoundingClientRect().left)]; })()"""
    )
    check(
        vals == 0 and seg[0] == [['System', 'true'], ['Hell', 'false'], ['Dunkel', 'false']] and seg[1] == 0,
        f'no row carries a value on the right, and a segment stands in the text column under its row ({vals}, {seg})',
    )
    # The page fills the screen and comes in from the side, its pages the same way
    page = await pg.evaluate(PAGE)
    size = await pg.evaluate('[innerWidth, innerHeight]')
    await ctx.close()

    ctx = await phone(browser, motion=True)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await pg.click('[data-action=open-settings]')
    slide = await pg.evaluate(
        """document.getElementById('sheet').getAnimations().map(a => [a.animationName,
             a.effect.getComputedTiming().duration, a.effect.getKeyframes()[0].transform])"""
    )
    await idle(pg)
    check(
        page == ['Einstellungen', True, True, size[0], size[1], 0]
        and [s[0] for s in slide] == ['pageIn']
        and slide[0][1:] == [300, 'translateX(100%)'],
        f'the settings fill the screen and come in from the side in 300 ms ({page}, {slide})',
    )
    long_page = await pg.evaluate(BODY_BOX)
    step = await pg.evaluate(PAGE_STEP, '#sheet [data-action=settings-page][data-v=house]')
    await idle(pg)
    short_page = await pg.evaluate(BODY_BOX)
    back = await pg.evaluate(PAGE_STEP, '#sheet [data-action=settings-back]')
    await idle(pg)
    check(
        step == [['new page', 'pageIn', 300], ['old page', 'pageAside', 300]]
        and back == [['new page', 'pageFromAside', 300], ['old page', 'pageOut', 300]]
        and await pg.locator('#sheet .sheet-body').count() == 1,
        f'a page below comes in from the side while the one above it goes out, and back the other way round ({step}, {back})',
    )
    check(
        long_page == short_page and long_page[0] == long_page[1],
        f'and the page fills the dialog whatever it holds, so the step scales nothing ({long_page}, {short_page})',
    )
    await ctx.close()

    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'granted')")
    await pg.click('[data-action=demo]')
    await idle(pg)
    await settings(pg, 'backup')
    deep = await pg.evaluate(PAGE)
    await settings_back(pg)
    up = await pg.evaluate(PAGE)
    await settings_page(pg, 'exchange')
    await pg.evaluate('window.__back({canGoBack: true})')
    await idle(pg)
    hardware = await pg.evaluate(PAGE)
    await pg.evaluate('window.__back({canGoBack: true})')
    await idle(pg)
    closed = await pg.evaluate("document.getElementById('sheet').open")
    check(
        deep[0] == 'Backup' and up[0] == 'Einstellungen' and hardware[0] == 'Einstellungen' and not closed,
        f'back goes one level at a time, by the arrow as by the hardware button, and only the overview leaves the settings ({deep[0]}, {up[0]}, {hardware[0]}, {closed})',
    )
    # The pet editor is a page of the settings: one level back, and saving or removing leads to the overview
    await settings(pg)
    await pg.click('#sheet [data-action=edit-pet]')
    await idle(pg)
    pet = await pg.evaluate(PAGE)
    await pg.evaluate('window.__back({canGoBack: true})')
    await idle(pg)
    back = await pg.evaluate(PAGE)
    check(
        pet[:3] == ['Tier bearbeiten', True, True] and back[0] == 'Einstellungen',
        f'the pet editor is a page of the settings, and back from it is one level, not all of them ({pet[0]}, {back[0]})',
    )
    await pg.click('#sheet [data-action=edit-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Mimi')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    saved = [await pg.evaluate(PAGE), (await pg.inner_text('#toast')).split('\n')[0], await state(pg, 'db.pets[0].name')]
    await pg.click('#sheet [data-action=edit-pet]')
    await idle(pg)
    await pg.click('[data-action=arm][data-then=delete-pet]')
    await pg.click('[data-action=arm][data-then=delete-pet]')
    await idle(pg)
    removed = [await pg.evaluate(PAGE), (await pg.inner_text('#toast')).split('\n')[0], await state(pg, 'db.pets.length')]
    check(
        saved == [['Einstellungen', True, True, 400, 860, 0], 'Gespeichert', 'Mimi']
        and removed == [['Einstellungen', True, True, 400, 860, 0], 'Mimi entfernt', 0],
        f'saving and removing a pet lead back to the overview and show the toast there ({saved[1:]}, {removed[1:]})',
    )
    # The sync notice and „Mit Haushalt verbinden“ lead straight to „Haushalt“, back from there to the overview
    await pg.evaluate('window.__back({canGoBack: true})')
    await idle(pg)
    await pg.evaluate("document.querySelector('[data-action=open-server]').click()")
    await idle(pg)
    jump = await pg.evaluate(PAGE)
    await pg.evaluate('window.__back({canGoBack: true})')
    await idle(pg)
    check(
        jump[0] == 'Haushalt' and (await pg.evaluate(PAGE))[0] == 'Einstellungen',
        f'the sync notice opens „Haushalt“ straight away, and back from it leads to the overview, not out ({jump[0]})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # 390 px: no line under a title runs past two lines, whatever the state says
    ctx = await phone(browser, width=390)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await settings(pg)
    long_subs = await pg.evaluate(
        """[...document.querySelectorAll('#sheet .set-row .t-main small')].map(s => {
             const lh = parseFloat(getComputedStyle(s).lineHeight);
             return [s.innerText.slice(0, 24), Math.round(s.getBoundingClientRect().height / lh * 10) / 10]; })
           .filter(x => x[1] > 2)"""
    )
    check(not long_subs, f'at 390 px no line under a title takes more than two lines ({long_subs})')
    await ctx.close()

    # 360 px at 130 % system font: the titles stay whole and nothing sticks out sideways
    ctx = await phone(browser, 'dark', width=360)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate(BIG_TEXT, 1.3)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await settings(pg)
    await shot(pg, 'settings-overview-big')
    cut = await pg.evaluate(
        """[...document.querySelectorAll('#sheet .set-row .t-main b')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.innerText)"""
    )
    wide = await pg.evaluate("(b => b.scrollWidth - b.clientWidth)(document.getElementById('sheetBody'))")
    check(not cut and wide == 0, f'360 px at 130 %: every title whole and nothing sticking out sideways ({cut}, {wide} px)')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_suggestions(browser, url):
    print('feeding: buttons, search field, one list, at most three suggestions and eight hits')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(SORTS, [3, 0])
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    names = await pg.eval_on_selector_all('#serveList .plist b', 'l => l.map(x => x.innerText)')
    check(
        names == ['Sorte 1', 'Sorte 2', 'Sorte 3'] and await pg.locator('#sheet [data-search]').count() == 0,
        f'three varieties: all of them as suggestions, the one fed last first, no search field ({names})',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.evaluate(SORTS, [12, 0])
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    order = await pg.eval_on_selector(
        '#sheet',
        "s => [...s.querySelectorAll('.cta-row, .search, #serveList, [data-action=new-product]')].map(e => e.id || e.className.split(' ')[0])",
    )
    names = await pg.eval_on_selector_all('#serveList .plist b', 'l => l.map(x => x.innerText)')
    check(
        names == ['Sorte 1', 'Sorte 2', 'Sorte 3'] and order == ['cta-row', 'search', 'serveList', 'btn'],
        f'buttons, then the search field, then the list of the three fed last, and „Ohne Foto eintippen“ at the end ({names}, {order})',
    )

    # The search field must not move while typing: its place inside the sheet and its distance to the two
    # buttons stay the same. The sheet grows and shrinks with its list, so both are measured against it.
    async def field():
        return await pg.eval_on_selector(
            '#sheet .search',
            """s => { const cta = document.querySelector('#sheet .cta-row').getBoundingClientRect(), r = s.getBoundingClientRect();
              const body = document.getElementById('sheetBody').getBoundingClientRect();
              return [Math.round(r.top - body.top), Math.round(r.top - cta.bottom)]; }""",
        )

    empty = await field()
    await pg.fill('#sheet [data-search]', 'Sorte')
    await idle(pg)
    many = await pg.eval_on_selector_all('#serveList .plist b', 'l => l.map(x => x.innerText)')
    hits = await field()
    await pg.fill('#sheet [data-search]', 'gibtsnicht')
    await idle(pg)
    none = await field()
    empty_text = await pg.eval_on_selector('#serveList .empty', 'e => e.innerText')
    offer = await pg.eval_on_selector('#serveList [data-action=new-product]', 'b => [b.innerText, b.dataset.v]')
    check(
        len(many) == 8,
        f'the search shows at most eight hits in place of the suggestions ({len(many)})',
    )
    check(
        empty == hits == none,
        f'the field keeps its place in the sheet and its distance to the buttons: empty, with hits, without ({empty}, {hits}, {none})',
    )
    check(
        empty_text == 'Keine Sorte passt zu „gibtsnicht“.' and offer == ['„gibtsnicht“ als neues Futter eintippen', 'gibtsnicht'],
        f'without a hit it says so and offers what was typed as a new variety ({empty_text}, {offer})',
    )
    await pg.click('#serveList [data-action=new-product]')
    await idle(pg)
    typed = await pg.eval_on_selector('#f-variety', 'i => i.value')
    check(typed == 'gibtsnicht', f'and takes it into „Neues Futter“ ({typed})')
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    await pg.fill('#sheet [data-search]', 'sheba sorte 11')
    await idle(pg)
    hit = await pg.eval_on_selector_all('#serveList .plist b', 'l => l.map(x => x.innerText)')
    await pg.fill('#sheet [data-search]', '')
    await idle(pg)
    back = await pg.eval_on_selector_all('#serveList .plist b', 'l => l.map(x => x.innerText)')
    check(
        hit == ['Sorte 11'] and back == ['Sorte 1', 'Sorte 2', 'Sorte 3'],
        f'searching brand and variety together, and an empty field shows the suggestions again ({hit}, {back})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


# Six varieties for the quick picker: served today, yesterday, three days ago, twelve and twenty days ago, and one never
# served, which only the search finds. Each served one with its ratings, the newest at the time given and the older
# ones a week apart; the one without a rating has an open meal.
PICKER_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), at = t => new Date(t).getTime(), week = 7 * 864e5;
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  const sorts = [['a', 'Catz Finefood', 'Wildschwein mit Nachtkerzenöl und Kürbis', '2026-06-09T13:14', ['top', 'gut']], ['b', 'Sheba', 'Lachs in Soße', '2026-06-08T19:22', ['sosse']],
    ['c', 'Felix', 'Huhn in Gelee', '2026-06-06T08:00', [null]], ['d', '', 'Rind', '2026-05-28T08:00', ['top']], ['e', 'Miamor', 'Pute', '2026-05-20T08:00', ['schlecht']],
    ['f', 'Bozita', 'Ente', null, []]];
  d.products = sorts.map(([id, brand, variety]) => ({id: 'sorte' + id + '0001', brand, variety, type: 'Nassfutter', codes: {}, createdAt: 1}));
  d.servings = sorts.filter(x => x[3]).flatMap(([id, , , when, rs]) => rs.map((r, j) => ({id: 'meal' + id + j + '0001', productId: 'sorte' + id + '0001', note: '',
    servedAt: at(when) - j * week, pets: {minka00001: {r, at: r ? at(when) : null}}}))).sort((a, b) => b.servedAt - a.servedAt);
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""
# The rows of the quick picker or the search hits: the name, what stands under it, the dots of the strip, and whether
# a word for serving is left in the row
PICKER_ROWS = """() => [...document.querySelectorAll('#serveList .plist .row')].map(r => [r.querySelector('b').innerText, r.querySelector('small').innerText,
  [...r.querySelectorAll('.strip i')].map(i => i.className), !!r.querySelector('.link')])"""


async def test_picker(browser, url):
    print('the quick picker: brand and when a variety was last served, its strip at the end, three of them, nothing cut off at 360 px')
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme, width=360, height=760, timezone_id='Europe/Berlin')
        pg, errors = await open_page(ctx, url, scheme)
        await pg.clock.set_fixed_time('2026-06-09T15:00:00+02:00')
        await pg.evaluate(PICKER_DB)
        await idle(pg)
        await pg.click('#fab')
        await idle(pg)
        rows = await pg.evaluate(PICKER_ROWS)
        check(
            rows
            == [
                ['Wildschwein mit Nachtkerzenöl und Kürbis', 'Catz Finefood, heute um 13:14', ['r-good', 'r-good'], False],
                ['Lachs in Soße', 'Sheba, gestern um 19:22', ['r-sauce'], False],
                ['Huhn in Gelee', 'Felix, vor 3 Tagen', [], False],
            ],
            f'{scheme}: the three fed last, each with its brand and when it was last served, its ratings as a strip where it has any, and no word for serving ({rows})',
        )
        await pg.fill('#sheet [data-search]', 'Ente')
        await idle(pg)
        hit = await pg.evaluate(PICKER_ROWS)
        check(hit == [['Ente', 'Bozita, noch nie serviert', [], False]], f'a search hit never served says so ({hit})')
        await pg.fill('#sheet [data-search]', '')
        await idle(pg)
        for scale in (1, 1.3):
            if scale != 1:
                await pg.evaluate(BIG_TEXT, scale)
                await idle(pg)
            fit = await pg.evaluate(NARROW, '.plist *')
            lines = await pg.eval_on_selector_all(
                '#serveList .plist .row',
                'l => l.map(r => [Math.round(r.querySelector("b").getBoundingClientRect().height / parseFloat(getComputedStyle(r.querySelector("b")).lineHeight)), r.querySelector(".strip")?.getBoundingClientRect().width ?? 0])',
            )
            check(
                not fit['wide'] and not fit['sideways'] and lines[0][0] == 2 and all(x[0] <= 2 for x in lines) and lines[0][1] > lines[1][1] > 0,
                f'{scheme}, {int(scale * 100)} %: nothing cut off at 360 px, the long name on two lines, the strip at the end at its full width ({fit}, {lines})',
            )
            await shot(pg, f'picker-{scheme}-{int(scale * 100)}')
        check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
        await ctx.close()


# Meals at given times for the home page's history: pets [id, name], meals [id, time, pet ids, variety]
AT = """([pets, meals]) => import('./js/store.js').then(async s => { const d = s.defaults();
  d.pets = pets.map(([id, name], i) => ({id, name, species: 'Katze', createdAt: i}));
  d.products = ['Lachs', 'Huhn', 'Rind'].map((variety, i) => ({id: 'sorte0000' + i, brand: 'Sheba', variety, type: 'Nassfutter', codes: {}, createdAt: 1}));
  d.servings = meals.map(([id, t, ids, v]) => ({id, productId: 'sorte0000' + (v || 0), servedAt: new Date(t).getTime(), note: '',
    pets: Object.fromEntries(ids.map(pid => [pid, {r: 'gut', at: new Date(t).getTime()}]))}));
  d.servings.sort((a, b) => b.servedAt - a.servedAt);
  s.prefs.activePet = 'all'; s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""
# What the history card on the home page shows: its day lines, the meals, and the line when there are none
HOME_HIST = """() => { const c = document.querySelector('[data-sec=hist]'), e = c.querySelector('.empty');
  return {days: [...c.querySelectorAll('.tl-date')].map(d => [d.querySelector('b').innerText, d.querySelector('span').innerText]),
    ids: [...c.querySelectorAll('.tl-item')].map(b => b.dataset.id), empty: e ? e.innerText.trim() : null, sketch: !!c.querySelector('.empty .sk'),
    btn: !!c.querySelector('.card-btn[data-action=open-report]'), cal: c.querySelectorAll('.cal .day.has').length}; }"""
# The meals the home page should show: today's within the filter, or yesterday's while there are none today
CURRENT = """() => import('./js/store.js').then(async s => { const {dayKey, addDays} = await import('./js/dates.js'), {servingPets} = await import('./js/derive.js');
  const now = Date.now(), mine = s.db.servings.filter(x => servingPets(x).length), on = k => mine.filter(x => dayKey(x.servedAt) === k).map(x => x.id);
  const today = on(dayKey(now)); return today.length ? today : on(dayKey(addDays(now, -1))); })"""
M, T = 'minka00001', 'tiger00001'


async def test_home_history(browser, url):
    print('the history on the home page: only what is current, today or else yesterday')
    ctx = await phone(browser, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)

    async def seed(now, meals, pets=((M, 'Minka'),)):
        await pg.clock.set_fixed_time(now)
        await pg.evaluate(AT, [list(pets), meals])
        await idle(pg)
        return await pg.evaluate(HOME_HIST)

    owner = [
        ['m1', '2026-06-12T07:00', [M]],
        ['m2', '2026-06-11T07:30', [M]],
        ['m3', '2026-06-11T12:00', [M]],
        ['m4', '2026-06-11T18:30', [M]],
        ['m5', '2026-06-10T08:00', [M]],
    ]
    got = await seed('2026-06-12T10:00:00+02:00', owner)
    btn = await pg.eval_on_selector(
        '[data-sec=hist] [data-action=open-report]',
        """b => { const ic = b.querySelector('svg'); const r = ic.getBoundingClientRect();
          return [b.innerText.trim(), b.className, ic.getBBox().width > 0, r.left > b.getBoundingClientRect().left + r.width,
            getComputedStyle(ic).width]; }""",
    )
    check(
        got['days'] == [['Heute', '1 Mahlzeit']] and got['ids'] == ['m1'] and btn == ['Ganzer Verlauf', 'card-btn', True, True, '20px'],
        f'something served today: only today, and „Ganzer Verlauf“ below it with the chevron at its end ({got["days"]}, {btn})',
    )
    got = await seed('2026-06-12T05:30:00+02:00', owner[1:])
    check(
        got['days'] == [['Gestern', '3 Mahlzeiten']] and got['ids'] == ['m4', 'm3', 'm2'],
        f'early in the morning, nothing yet today: yesterday, whole and newest first ({got["days"]}, {got["ids"]})',
    )
    got = await seed('2026-06-14T10:00:00+02:00', owner)
    check(
        got['days'] == [] and got['empty'] == 'Heute noch nichts serviert.' and not got['sketch'] and got['cal'] >= 1 and got['btn'],
        f'neither today nor yesterday: a line that says so, the calendar and the button stay ({got})',
    )
    pets = ((M, 'Minka'), (T, 'Tiger'), ('mauz000001', 'Mauz'))
    got = await seed(
        '2026-06-12T10:00:00+02:00', [['t1', '2026-06-12T08:00', [T]], ['k1', '2026-06-11T08:00', [M]], ['k2', '2026-06-11T18:00', [M]]], pets
    )
    everyone = got
    minka, never = [], []
    for pet, out in ((M, minka), ('mauz000001', never)):
        await pg.click(f'[data-action=filter][data-id={pet}]')
        await idle(pg)
        out.append(await pg.evaluate(HOME_HIST))
    check(
        everyone['ids'] == ['t1']
        and minka[0]['days'][0][0] == 'Gestern'
        and minka[0]['ids'] == ['k2', 'k1']
        and never[0]['empty'] == 'Noch nichts serviert.'
        and never[0]['sketch'],
        f'within the pet filter: „Alle“ today, Minka yesterday, a pet never fed the sketch ({everyone["ids"]}, {minka[0]["ids"]}, {never[0]["empty"]})',
    )
    got = await seed('2026-06-12T00:05:00+02:00', [['n1', '2026-06-11T23:50', [M]]])
    check(got['days'] == [['Gestern', '1 Mahlzeit']] and got['ids'] == ['n1'], f'just after midnight the evening meal is yesterday ({got})')
    got = await seed('2026-06-12T10:00:00+02:00', [['f1', '2026-06-13T09:00', [M]], ['f2', '2026-06-12T07:00', [M]]])
    check(got['ids'] == ['f2'], f'a meal stamped in the future by another clock does not push today away ({got["ids"]})')

    # The card does not grow with the history: twenty days of three meals weigh nothing
    today3 = [[f'h{i}', f'2026-06-12T0{7 + i}:00', [M]] for i in range(3)]
    long = today3 + [[f'd{d}-{i}', f'2026-05-{11 + d:02d}T{8 + 4 * i:02d}:00', [M]] for d in range(20) for i in range(3)]
    await seed('2026-06-12T12:00:00+02:00', long)
    tall = await pg.eval_on_selector('[data-sec=hist]', 'c => Math.round(c.getBoundingClientRect().height)')
    await seed('2026-06-12T12:00:00+02:00', today3 + [['y1', '2026-06-11T08:00', [M]]])
    short = await pg.eval_on_selector('[data-sec=hist]', 'c => Math.round(c.getBoundingClientRect().height)')
    check(tall == short, f'the card is as tall after twenty days as after one ({tall}, {short})')

    # Serving switches from yesterday to today, undo switches back
    await seed('2026-06-12T05:30:00+02:00', owner[1:])
    await pg.click('#fab')
    await idle(pg)
    await pg.click('#sheet [data-action=serve]')
    await idle(pg)
    served = await pg.evaluate(HOME_HIST)
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    undone = await pg.evaluate(HOME_HIST)
    check(
        served['days'] == [['Heute', '1 Mahlzeit']] and len(served['ids']) == 1 and undone['ids'] == ['m4', 'm3', 'm2'],
        f'the first meal of the day replaces yesterday, and undo brings yesterday back ({served["days"]}, {undone["ids"]})',
    )

    # A day in the calendar always opens the history page right at that day, also one beyond the days drawn at
    # first (ten); the home page holds no anchors
    cal = today3 + [[f'c{d}-{i}', f'2026-06-{1 + d:02d}T{8 + 4 * i:02d}:00', [M]] for d in range(11) for i in range(3)]
    await seed('2026-06-12T12:00:00+02:00', cal)
    days = await pg.eval_on_selector_all('[data-sec=hist] .cal .day.has', 'l => l.map(b => b.dataset.day)')
    check(days[0] == '2026-06-01' and days[-1] == '2026-06-12', f'the calendar holds today and the first day of last week ({days[0]}, {days[-1]})')
    at = []
    for day in (days[-1], days[0]):
        await pg.click(f'[data-sec=hist] [data-action=jump-day][data-day="{day}"]')
        await idle(pg)
        at.append(
            await pg.evaluate(
                """k => { const body = document.getElementById('sheetBody'), d = body.querySelector('#d-' + k);
              const bar = document.querySelector('#sheet .page-bar').getBoundingClientRect(), r = d?.getBoundingClientRect();
              return [document.getElementById('sheet').open, !!d, Math.round((r?.top ?? 0) - bar.bottom),
                body.scrollTop + body.clientHeight >= body.scrollHeight - 1 && r.top >= bar.bottom && r.bottom <= innerHeight]; }""",
                day,
            )
        )
        await pg.click('#sheet [data-action=settings-back]')
        await idle(pg)
    anchors = await pg.locator('#home [id^="d-"]').count()
    check(
        all(a[:2] == [True, True] and (0 <= a[2] < 24 or a[3]) for a in at) and anchors == 0,
        f'today and the oldest day open the history page right at that day, at the top or, at the end of the list, whole in view; the home page has no anchors ({at}, {anchors})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


# The timelines' geometry: how far, at most, a piece of the line is from the middle of its meal's dot (across and at
# the end that meets the dot), whether the line starts at the first dot and ends at the last (one meal alone: none),
# whether the times fit their column, and how wide that column is, so the caller can compare 100 % with 130 % system
# font.
TL_GEOMETRY = """l => { let off = 0, ends = true, fits = true;
  for (const t of l) { const items = [...t.children];
    items.forEach((li, i) => { const box = li.getBoundingClientRect(), d = li.querySelector('.tl-node i').getBoundingClientRect(), dx = d.left + d.width / 2 - box.left, dy = d.top + d.height / 2 - box.top;
      ['::before', '::after'].forEach((w, j) => { const s = getComputedStyle(li, w), want = j ? i < items.length - 1 : i > 0;
        if ((s.content !== 'none') !== want) ends = false;
        if (s.content === 'none') return;
        off = Math.max(off, Math.abs(parseFloat(s.left) + parseFloat(s.width) / 2 - dx), Math.abs((j ? parseFloat(s.top) : box.height - parseFloat(s.bottom)) - dy)); }); });
    const time = t.querySelector('.tl-time'); fits = fits && time.scrollWidth <= time.clientWidth + 1; }
  return [Math.round(off * 100) / 100, ends, fits, Math.round(l[0].querySelector('.tl-time').getBoundingClientRect().width)]; }"""


# The history page: its two cards, as wide as and as far apart as the ones on the home page
REPORT_CARDS = """() => { const l = [...document.querySelectorAll('#sheet .sheet-body > .card')];
  return {heads: l.map(c => c.querySelector('h2')?.innerText ?? null),
    box: l.map(c => { const s = getComputedStyle(c); return [s.borderRadius, s.padding, s.boxShadow, s.borderTopWidth].join('|'); }),
    gaps: l.slice(1).map((c, i) => Math.round(c.getBoundingClientRect().top - l[i].getBoundingClientRect().bottom)),
    side: Math.round(l[0].getBoundingClientRect().left)}; }"""

# The first card of „Verlauf“: per ring its size, what it says in the middle and under it, the sentence it carries, its
# role and its colour; the figures with the word under each; the buttons at its foot and the lines folded open
FIRST = """() => { const c = document.querySelector('#sheet .review'), text = e => e.innerText.replace(/\\s+/g, ' ').trim();
  return {head: c.querySelector('h2').innerText,
    rings: [...c.querySelectorAll('.period')].map(p => { const r = p.querySelector('.ring');
      return [Math.round(r.getBoundingClientRect().width), text(r), [...p.children].slice(1).map(text), r.getAttribute('aria-label'),
        r.getAttribute('role'), r.querySelector('.ring-fill')?.className.baseVal ?? null]; }),
    figs: [...c.querySelectorAll('.figs li')].map(li => [text(li.querySelector('b')), text(li.querySelector(':scope > small'))]),
    btn: [...c.querySelectorAll('.card-btn')].map(b => [b.innerText, b.getAttribute('aria-expanded'), b === c.lastElementChild]),
    rows: [...c.querySelectorAll('.told li')].map(li => [li.querySelector('.lead .ic') ? 'icon' : '?', text(li)])}; }"""

# Words that would name a favourite, which „Verlauf“ no longer does: that is „Einkaufen“ and „Vorlieben“
FAVOURITE = re.compile(r'Liebling|liebsten|Am besten|Am ehesten|mochte')


# Three meals a day: one page of days then fills more than a screen, so the calendar of the history page
# reaches further back than what is drawn
DENSE = """() => import('./js/store.js').then(async s => { const d = s.defaults(), day = 864e5;
  const noon = new Date(); noon.setHours(12, 0, 0, 0);
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [{id: 'sorte1', brand: 'Sheba', variety: 'Lachs', type: 'Nassfutter', codes: {}, createdAt: 1}];
  for (let i = 0; i < 20; i++) for (let n = 0; n < 3; n++)
    d.servings.push({id: 'meal' + i + '-' + n, productId: 'sorte1', note: '', by: 'Anna',
      servedAt: noon.getTime() - i * day - n * 36e5, pets: {minka00001: {r: 'top', at: noon.getTime()}}});
  d.servings.sort((a, b) => b.servedAt - a.servedAt);
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_report(browser, url):
    print('the history page: how it goes over 7, 30 and 90 days and the whole history, in two cards')
    ctx = await phone(browser, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-12T10:00:00+02:00')  # a few days after the last meal
    await pg.evaluate(HOUSE, [house_meals()])
    await idle(pg)
    await settings(pg)
    check(await pg.locator('#sheet [data-action=open-report]').count() == 0, 'the settings do not lead to the history')
    await settings_back(pg)
    await pg.click('[data-sec=hist] [data-action=open-report]')
    await idle(pg)
    page, size = await pg.evaluate(PAGE), await pg.evaluate('[innerWidth, innerHeight]')
    plain = await pg.evaluate(
        """() => [document.querySelectorAll('#sheet [data-action=report-span], #sheet .sh-head, #sheet [data-action=close]').length,
          getComputedStyle(document.querySelector('#sheet .grip-zone')).display,
          !!document.querySelector('#sheet .page-bar [data-action=settings-back]')]"""
    )
    check(
        page == ['Verlauf für alle Tiere', True, True, size[0], size[1], 0] and plain == [0, 'none', True],
        f'a page like the settings: arrow and title, no span, no grip and no X ({page}, {plain})',
    )
    cards = await pg.evaluate(REPORT_CARDS)
    check(
        cards['heads'] == ['Wie läuft’s?', None]
        and cards['box'] == ['24px|18px 18px 8px|none|0px'] * 2
        and cards['gaps'] == [14]
        and cards['side'] == 18,
        f'two cards on the page ground, exactly as on the home page ({cards})',
    )
    first = await pg.evaluate(FIRST)
    check(
        first['rings']
        == [
            [72, '–', ['7 Tage', 'Noch zu wenig'], 'Letzte 7 Tage: noch zu wenig bewertet, 2 von 3 Bewertungen.', 'img', None],
            [
                72,
                '65%',
                ['30 Tage', '11 von 17 gut'],
                'Letzte 30 Tage: 65 Prozent der bewerteten Mahlzeiten kamen gut an, 11 von 17.',
                'img',
                'ring-fill r-mid',
            ],
            [
                72,
                '70%',
                ['90 Tage', '14 von 20 gut'],
                'Letzte 90 Tage: 70 Prozent der bewerteten Mahlzeiten kamen gut an, 14 von 20.',
                'img',
                'ring-fill r-good',
            ],
        ],
        f'three rings of 72 px for 7, 30 and 90 days: the share in the middle and in its colour, the span and the count under it, all of it as a sentence; under 3 ratings the bare track ({first["rings"]})',
    )
    icons = await pg.eval_on_selector_all(
        '#sheet .figs .ic', 'l => l.map(i => [Math.round(i.getBoundingClientRect().width), i.innerHTML.length > 20])'
    )
    check(
        first['figs'] == [['15', 'Mahlzeiten'], ['6', 'Sorten'], ['14 von 30', 'Tagen']] and icons == [[20, True]] * 3,
        f'under the rings the 30 days in figures: meals, varieties and the days fed on, each with its small icon ({first["figs"]}, {icons})',
    )
    check(
        first['btn'] == [['Details', 'false', True]] and first['rows'] == [],
        f'what changed is folded away under „Details“ at the foot of the card ({first["btn"]})',
    )
    check(
        await pg.locator('#sheet .rings button, #sheet .rings [data-action], #sheet .figs button').count() == 0,
        'the rings and the figures are no buttons',
    )
    await pg.click('#sheet [data-action=fold][data-v=details]')
    await idle(pg)
    shown = await pg.evaluate(FIRST)
    focus = await pg.evaluate('document.activeElement.dataset.v')
    check(
        shown['rows']
        == [
            ['icon', 'Neu bei Nachkaufen: Pute.'],
            ['icon', 'Neu bei Nicht mehr kaufen: Rind Pastete.'],
            ['icon', '1 Mahlzeit noch nicht bewertet.'],
            ['icon', 'Fütter-Duell: Anna 1×, Jonas 1×.'],
        ]
        and shown['btn'] == [['Weniger', 'true', True]]
        and focus == 'details',
        f'„Details“: new at „Nachkaufen“ and at „Nicht mehr kaufen“ within the 30 days, the meals not rated, the feeding duel of the last 7 days without a meal nobody signed ({shown["rows"]}, {focus})',
    )
    page_text = await pg.inner_text('#sheet')
    check(not FAVOURITE.search(page_text), f'no favourite named anywhere on the page ({FAVOURITE.findall(page_text)})')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.renderSheet())")
    await idle(pg)
    kept = await pg.evaluate(FIRST)
    await pg.click('#sheet [data-action=fold][data-v=details]')
    await idle(pg)
    shut = await pg.evaluate(FIRST)
    check(
        len(kept['rows']) == 4 and shut['rows'] == [] and shut['btn'] == [['Details', 'false', True]],
        f'drawn anew the fold stays open while the page is, and „Weniger“ folds it shut ({len(kept["rows"])}, {shut["btn"]})',
    )
    # The feeding duel: the most first, and no line while only one person feeds
    await pg.click('#sheet [data-action=fold][data-v=details]')
    await idle(pg)
    duel = []
    for change in (
        "s.db.servings.find(x => !x.by && x.servedAt > new Date(2026, 5, 6).getTime()).by = 'Jonas'",
        "s.db.servings.filter(x => x.servedAt > new Date(2026, 5, 6).getTime()).forEach(x => { x.by = 'Anna'; })",
    ):
        await pg.evaluate(f"import('./js/store.js').then(async s => {{ {change}; s.save(); (await import('./js/ui/sheet.js')).renderSheet(); }})")
        await idle(pg)
        duel.append([r[1] for r in (await pg.evaluate(FIRST))['rows'] if r[1].startswith('Fütter')])
    check(duel == [['Fütter-Duell: Jonas 2×, Anna 1×.'], []], f'the feeding duel: the most first, and none with one person feeding ({duel})')
    first = await pg.locator('#sheet .tl-item').count()
    for _ in range(10):
        await pg.eval_on_selector('.sheet-body', 'b => b.scrollTo(0, b.scrollHeight)')
        await idle(pg)
        if await pg.locator('#sheet .tl-item').count() == 18:
            break
    check(
        first < 18 and await pg.locator('#sheet .tl-item').count() == 18,
        f'the list holds the whole history, not only the evaluated span ({first} drawn, 18 after scrolling)',
    )
    await shot(pg, 'report')
    calm = await pg.eval_on_selector('#sheet .ring-fill', 'c => getComputedStyle(c).animationDuration')
    check(float(calm.rstrip('s')) < 0.01, f'under reduced motion the ring does not fill itself ({calm})')

    # The list: the day line parks under the bar, the separators run straight, the name may take two lines
    day_line = await pg.eval_on_selector(
        '#sheet .days .tl-date',
        """d => { const bar = document.querySelector('#sheet .page-bar'), s = getComputedStyle(d);
          return [s.position, s.top, Math.round(bar.getBoundingClientRect().height),
            s.backgroundColor === getComputedStyle(d.closest('.card')).backgroundColor]; }""",
    )
    radius = await pg.eval_on_selector('#sheet .tl-day', 'd => getComputedStyle(d).borderRadius')
    lines = await pg.eval_on_selector(
        '#sheet .tl-item .t-main',
        "m => [getComputedStyle(m.querySelector('b')).webkitLineClamp, getComputedStyle(m.querySelector('small')).whiteSpace]",
    )
    check(
        day_line[0] == 'sticky' and day_line[1] == f'{day_line[2]}px' and day_line[3] and radius == '0px' and lines == ['2', 'nowrap'],
        f'the day line sticks under the bar, the separator is straight, two lines for the name ({day_line}, {radius}, {lines})',
    )
    stuck = await pg.evaluate(
        """async () => { const body = document.getElementById('sheetBody'), bar = body.querySelector('.page-bar').getBoundingClientRect();
          body.scrollTop += body.querySelectorAll('.days .tl-date')[2].getBoundingClientRect().top - bar.bottom + 40;
          await new Promise(d => setTimeout(d, 250));
          const d = document.elementFromPoint(innerWidth / 2, bar.bottom + 4)?.closest('.tl-date');
          return d && [d.classList.contains('stuck'), getComputedStyle(d, '::after').opacity,
            getComputedStyle(body.querySelector('.page-bar'), '::after').opacity]; }"""
    )
    check(stuck == [True, '1', '0'], f'the day line parked under the bar carries the edge’s line, and the bar gives its own up ({stuck})')

    # With the pet filter: that pet's rings and figures, and what changed for it
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    await pg.click('[data-action=filter][data-id=tiger00001]')
    await idle(pg)
    await pg.click('[data-sec=hist] [data-action=open-report]')
    await idle(pg)
    await pg.click('#sheet [data-action=fold][data-v=details]')
    await idle(pg)
    tiger = await pg.evaluate(FIRST)
    title = await pg.inner_text('#sheet .page-title')
    check(
        [r[1:3] for r in tiger['rings']]
        == [['–', ['7 Tage', 'Noch zu wenig']], ['29%', ['30 Tage', '2 von 7 gut']], ['29%', ['90 Tage', '2 von 7 gut']]]
        and tiger['figs'] == [['7', 'Mahlzeiten'], ['3', 'Sorten'], ['7 von 30', 'Tagen']]
        and tiger['rows'] == [['icon', 'Neu bei Nicht mehr kaufen: Huhn in Gelee und Rind Pastete.']]
        and title == 'Verlauf für Tiger',
        f'with Tiger chosen, Tiger’s rings, figures and changes, the clearest first, and no duel where nobody fed Tiger lately ({tiger["rings"]}, {tiger["figs"]}, {tiger["rows"]}, {title})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # With movement allowed the ring fills once when the page opens
    ctx = await phone(browser, motion=True)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(SORTS, [3, 1])
    await idle(pg)
    await pg.click('[data-sec=hist] [data-action=open-report]')
    fills = await pg.eval_on_selector(
        '#sheet .ring-fill', 'c => { const s = getComputedStyle(c); return [s.animationName, s.animationDuration, s.animationIterationCount]; }'
    )
    check(fills == ['ringFill', '0.3s', '1'], f'with movement it fills itself once, in 300 ms ({fills})')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # The ring without enough ratings: the bare track, „–“ and why
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(SORTS, [2, 1])
    await pg.evaluate("""import('./js/store.js').then(async s => { s.db.servings.forEach(x => { for (const k in x.pets) x.pets[k].r = null; });
      s.save(); (await import('./js/views/home.js')).renderHome(); })""")
    await idle(pg)
    await pg.click('[data-sec=hist] [data-action=open-report]')
    await idle(pg)
    few = (await pg.evaluate(FIRST))['rings']
    check(
        few
        == [
            [72, '–', [f'{d} Tage', 'Noch zu wenig'], f'Letzte {d} Tage: noch zu wenig bewertet, 0 von 3 Bewertungen.', 'img', None]
            for d in (7, 30, 90)
        ],
        f'nothing rated: the bare track, „–“ and why, in every span ({few})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # 360 px, light and dark, and the timeline at 130 % system font
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme, width=360, height=760)
        pg, errors = await open_page(ctx, url)
        await pg.evaluate(SORTS, [26, 1])
        await idle(pg)
        await pg.click('[data-sec=hist] [data-action=open-report]')
        await idle(pg)
        wide = await pg.evaluate("""[...document.querySelectorAll('#sheet .period, #sheet .period > *, #sheet .figs li, #sheet .figs li > *, #sheet .review li, #sheet .day')]
          .filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth).map(e => e.innerText)""")
        first = await pg.locator('#sheet .tl-item').count()
        for _ in range(10):
            await pg.eval_on_selector('.sheet-body', 'b => b.scrollTo(0, b.scrollHeight)')
            await idle(pg)
            if await pg.locator('#sheet .tl-item').count() == 26:
                break
        check(
            10 <= first < 26 and await pg.locator('#sheet .tl-item').count() == 26 and not wide,
            f'{scheme}, 360 px: a page to begin with, the rest follows on scrolling, nothing clipped ({first} of 26, {wide})',
        )
        await shot(pg, f'report-{scheme}')
        small = await pg.eval_on_selector_all('#sheet .tl', TL_GEOMETRY)
        await pg.evaluate(BIG_TEXT, 1.3)
        await idle(pg)
        geo = await pg.eval_on_selector_all('#sheet .tl', TL_GEOMETRY)
        check(
            small[0] <= 0.1 and small[1] and small[2] and geo[0] <= 0.1 and geo[1] and geo[2] and geo[3] > small[3],
            f'{scheme}: the line runs exactly through the middle of every dot, from the first dot of a day to its last and no further, and the time fits, at 100 % and at 130 % ({small}, {geo})',
        )
        check(not real_errors(errors), f'no errors in the console ({scheme}) {real_errors(errors)}')
        await ctx.close()

    # The page's own calendar: a day not drawn yet is grown to and scrolled to, inside the page
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(DENSE)
    await idle(pg)
    await pg.click('[data-sec=hist] [data-action=open-report]')
    await idle(pg)
    oldest = (await pg.eval_on_selector_all('#sheet .cal .day.has', 'l => l.map(b => b.dataset.day)'))[0]
    before = await pg.locator('#sheet .tl-day').count()
    await pg.click(f'#sheet [data-action=jump-day][data-day="{oldest}"]')
    await idle(pg)
    at = await pg.evaluate(
        """k => { const d = document.getElementById('sheetBody').querySelector('#d-' + k);
          const bar = document.querySelector('#sheet .page-bar').getBoundingClientRect();
          return [!!d, d ? Math.round(d.getBoundingClientRect().top - bar.bottom) : null]; }""",
        oldest,
    )
    check(
        before < 14 and at[0] and -1 <= at[1] < 24,
        f'a day from the page’s own calendar: the list grew to it and it sits under the bar ({before} days drawn, {at})',
    )
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()

    # A tall screen: one page would not fill it, so the next ones follow at once; without that there is no scrolling
    ctx = await phone(browser, height=1800)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(SORTS, [26, 1])
    await idle(pg)
    await pg.click('[data-sec=hist] [data-action=open-report]')
    await idle(pg)
    body = await pg.eval_on_selector('.sheet-body', 'b => [b.scrollHeight > b.clientHeight, b.querySelectorAll(".tl-day").length]')
    check(body[0] and body[1] > 10, f'a tall screen: more than one page is drawn, so the history can be scrolled at all ({body})')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


run_tests(
    {
        'start': test_start,
        'settings': test_settings,
        'edges': test_edges,
        'tour': test_tour,
        'flow': test_flow,
        'buying': test_buying,
        'window': test_window,
        'cards': test_cards,
        'shop': test_shop,
        'profile': test_profile,
        'narrow': test_narrow,
        'history': test_home_history,
        'report': test_report,
        'week': test_week,
        'overview': test_overview,
        'scales': test_scales,
        'slide': test_slide,
        'texture': test_texture,
        'feed-routes': test_feed_routes,
        'suggestions': test_suggestions,
        'picker': test_picker,
        'milestones': test_milestones,
        'reminder': test_reminders,
        'own-interval': test_remind,
        'feed-reminder': test_feed_remind,
        'pets': test_petbar,
        'birthday': test_birthday,
        'modes': test_modes,
        'network': test_network,
        'shortcuts': test_shortcuts,
        'scanning': test_scan,
        'recognition': test_recognize,
        'discard': test_discard,
        'pack-lines': test_pack_lines,
        'known-photo': test_known_photo,
        'skeleton': test_skeleton,
        'reading-said': test_reading_said,
        'rephoto': test_rephoto,
        'product-photo': test_product_photo,
        'exchange': test_exchange,
        'crop': test_crop,
        'sheet': test_sheet,
        'mood': test_mood,
        'camera': test_camera,
        'no-camera': test_no_camera,
        'photo': test_photo_viewer,
    },
    camera=('camera',),
)
