#!/usr/bin/env python3
"""Flows of the app in Chromium, without a server, with simulated Android plugins.
Usage: python3 tests/ui_test.py [name …]"""

import base64
import json
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from common import (
    NATIVE,
    PACK,
    PACK_LARGE,
    SAVED,
    SHEBA,
    UPC,
    check,
    debounced,
    fixed_clock,
    idle,
    make_pictures,
    open_page,
    phone,
    real_errors,
    run_tests,
    seeded,
    started,
    state,
    until,
)

OPEN = "document.getElementById('sheet').open"
LEVEL = "import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind ?? null, m.sheet?.page ?? null, m.sheet?.step ?? null])"
SRV = 'http://192.168.99.9:8486'  # a simulated server at a home-network address
BERLIN = ZoneInfo('Europe/Berlin')


def at(t):
    return int(datetime.fromisoformat(t).replace(tzinfo=BERLIN).timestamp() * 1000)


def b64(path=PACK):
    return base64.b64encode(path.read_bytes()).decode()


def pet(id, name='Minka', **kw):
    return {'id': id, 'name': name, 'species': 'Katze', 'createdAt': 1, **kw}


def product(id, brand='Sheba', variety='Lachs', type='Nassfutter', **kw):
    return {'id': id, 'brand': brand, 'variety': variety, 'type': type, 'codes': {}, 'createdAt': 1, **kw}


def meal(id, pid, when, rated, **kw):
    return {
        'id': id,
        'productId': pid,
        'servedAt': when,
        'note': '',
        'pets': {p: {'r': r, 'at': when if r else None} for p, r in rated.items()},
        **kw,
    }


async def tap(pg, sel, **kw):
    if not sel.startswith('#toast'):  # a toast over the target would hold the click until it goes by itself
        await pg.evaluate("document.getElementById('toast')?.classList.remove('show')")
    await pg.click(sel, **kw)
    await idle(pg)


async def hw_back(pg):
    await pg.evaluate('window.__back({canGoBack: true})')
    await idle(pg)


async def settings(pg, page=None, wait=idle):
    await pg.click('[data-action=open-settings]')
    await wait(pg)
    if page:
        await settings_page(pg, page, wait)


async def settings_page(pg, page, wait=idle):
    await pg.click(f'#sheet [data-action=settings-page][data-v={page}]')
    await wait(pg)


async def back(pg, times=1, wait=idle):
    for _ in range(times):
        await pg.click('#sheet [data-action=settings-back]')
        await wait(pg)


async def open_sheet(pg, **s):
    await pg.evaluate("s => import('./js/ui/sheet.js').then(m => m.openSheet(s))", s)
    await idle(pg)


async def load(pg, pets, products, servings):
    await pg.evaluate(
        """d => import('./js/store.js').then(async s => { s.replaceDb({...s.defaults(), ...d}); s.db.servings.sort((a, b) => b.servedAt - a.servedAt);
          s.save(); (await import('./js/views/home.js')).renderHome(); })""",
        {'pets': pets, 'products': products, 'servings': servings},
    )
    await idle(pg)


# body runs with s = store.js and a = arg, then the data is saved and the home page drawn again
async def change(pg, body, arg=None):
    await pg.evaluate(
        f"a => import('./js/store.js').then(async s => {{ {body}; s.save(); (await import('./js/views/home.js')).renderHome(); }})", arg
    )
    await idle(pg)


async def demo(browser, url, native=False, **kw):
    ctx = await phone(browser, **kw)
    pg, errors = await open_page(ctx, url, native=native)
    await tap(pg, '[data-action=demo]')
    return ctx, pg, errors


async def one_pet(browser, url, native=True, **kw):
    ctx = await phone(browser, **kw)
    pg, errors = await open_page(ctx, url, native=native)
    await tap(pg, '.welcome [data-action=add-pet]')
    await pg.fill('#f-name', 'Minka')
    await tap(pg, '[data-action=save-pet]')
    return ctx, pg, errors


async def snap(pg, file=PACK, done="db.servings[0]?.status === 'noserver'"):
    await tap(pg, '#fab')
    await pg.set_input_files('#camInputSheet', str(file))
    await until(pg, done)
    await idle(pg)


def calls(pg, name):
    return pg.evaluate(f"window.__calls.filter(c => c[0] === '{name}').map(c => c[1])")


# The next text recognition waits for window.__release(); the ones after it answer as usual
HOLD = """text => { const p = window.Capacitor.Plugins.TextRecognition, plain = p.processImage;
  p.processImage = o => { p.processImage = plain; window.__calls.push(['processImage', o]);
    return new Promise(done => { window.__release = () => done({text, blocks: []}); }); }; }"""


# the household server; fail['server'] breaks its recognition, photos collects what it was sent
async def household(ctx, fail=None, photos=None):
    fail = {} if fail is None else fail

    async def route(r, request):
        path, now, status = request.url.split(':8486')[1], int(time.time() * 1000), 200
        if path.startswith('/api/recognize') and photos is not None:
            photos.append(json.loads(request.post_data or '{}').get('image', '')[-32:])
        if fail.get('server') and path.startswith('/api/recognize'):
            body, status = {'error': 'aus'}, 503
        elif path.startswith('/api/info'):
            body = {'app': 'schmeckts', 'protocol': 1, 'recognition': True, 'features': [], 'auth': True}
        elif path.startswith('/api/recognize'):
            body = {'brand': 'Gourmet', 'variety': 'Gold Pastete', 'type': 'Nassfutter', 'animal': 'Katze'}
        elif path.startswith('/api/changes') and request.method == 'POST':
            body = {'ok': [c['id'] for c in json.loads(request.post_data or '{}').get('changes', [])]}
        elif path.startswith('/api/changes'):
            body = {'epoch': 'test', 'seq': 0, 'records': []}
        else:
            body = {'epoch': 'test', 'seq': 0, 'sum': '', 'fields': 0}
        await r.fulfill(status=status, content_type='application/json', body=json.dumps({**body, 'now': now}))

    await ctx.route(f'{SRV}/**', route)


async def connect(pg, **prefs):
    await pg.evaluate(
        "p => import('./js/store.js').then(m => { Object.assign(m.prefs, p); m.savePrefs(); })", {'server': SRV, 'code': 'K7PM-3QXD', **prefs}
    )
    await pg.evaluate("import('./js/sync.js').then(m => m.startSync())")
    check(await until(pg, "import('./js/sync.js').then(s => s.status.state === 'ok')"), 'connected to the household server')


async def test_start(browser, url):
    print('start: the splash goes once the home page is drawn, and a stuck start still loses it')
    ctx = await phone(browser)
    pg = await ctx.new_page()
    await pg.add_init_script(NATIVE)
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    await pg.goto(url)
    await started(pg)
    hid = await pg.evaluate("window.__calls.filter(c => c[0] === 'hideSplash').map(c => [c[1].drawn, c[1].draws])")
    check(hid == [[True, 1]], f'splash hidden once, after one drawing of the home page {hid}')
    check(not errors, f'no errors {errors}')
    await ctx.close()
    ctx = await phone(browser)
    pg = await ctx.new_page()
    await pg.add_init_script(NATIVE)
    await pg.add_init_script('document.fonts.load = () => new Promise(() => {});')
    began = time.monotonic()
    await pg.goto(url)
    await pg.wait_for_function("window.__calls.some(c => c[0] === 'hideSplash')", timeout=8000)
    check(time.monotonic() - began >= 2, 'fonts never load: the safety net still hides the splash')
    await ctx.close()


async def test_settings(browser, url):
    print('settings: one level per back, the pet editor is a level')
    ctx, pg, errors = await demo(browser, url, native=True)
    await settings(pg, 'backup')
    deep = await pg.evaluate(LEVEL)
    await back(pg)
    up = await pg.evaluate(LEVEL)
    await settings_page(pg, 'exchange')
    await hw_back(pg)
    hardware = await pg.evaluate(LEVEL)
    overview = [True, 'settings', None, None]
    check(deep == [True, 'settings', 'backup', None] and up == overview and hardware == overview, f'arrow and back button go one level {deep} {up}')
    await hw_back(pg)
    check(not await pg.evaluate(OPEN), 'back on the overview closes the settings')
    await settings(pg)
    await tap(pg, '#sheet [data-action=edit-pet]')
    editor = await pg.evaluate(LEVEL)
    await hw_back(pg)
    check(editor == [True, 'settings', 'pet', None] and await pg.evaluate(LEVEL) == overview, f'pet editor is one level {editor}')
    await tap(pg, '#sheet [data-action=edit-pet]')
    await pg.fill('#f-name', 'Mimi')
    await tap(pg, '[data-action=save-pet]')
    saved = [await pg.evaluate(LEVEL), await state(pg, 'db.pets[0].name')]
    await tap(pg, '#sheet [data-action=edit-pet]')
    await pg.click('[data-action=arm][data-then=delete-pet]')
    await tap(pg, '[data-action=arm][data-then=delete-pet]')
    removed = [await pg.evaluate(LEVEL), await state(pg, 'db.pets.length')]
    check(saved == [overview, 'Mimi'] and removed == [overview, 0], f'save and remove return to the overview {saved} {removed}')
    await hw_back(pg)
    await pg.evaluate("document.querySelector('[data-action=open-server]').click()")
    await idle(pg)
    jump = await pg.evaluate(LEVEL)
    await hw_back(pg)
    check(
        jump == [True, 'settings', 'house', None] and await pg.evaluate(LEVEL) == overview,
        f'sync notice opens Haushalt, back to the overview {jump}',
    )
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_tour(browser, url):
    print('a walk through the demo data')
    ctx, pg, errors = await demo(browser, url)
    check(await state(pg, 'db.servings.length') > 10, 'demo data loaded')
    check(await pg.locator('#syncChip').is_hidden(), 'no sync chip without a server')
    await tap(pg, '#fab')
    await tap(pg, '[data-action=scan]')  # the browser has no scanner: cancelled
    check(await pg.evaluate(OPEN) and await pg.locator('#sheet .cta-row [data-action=scan]').count() == 1, 'scan cancelled: the sheet stays')
    before = await state(pg, 'db.servings.length')
    await tap(pg, '.plist [data-action=serve]')
    check(await state(pg, 'db.servings.length') == before + 1, 'a known variety served')
    await tap(pg, '.pend [data-action=rate][data-r=gut]', force=True)  # the button takes no pointer, the track does
    check(await state(pg, 'Object.values(db.servings[0].pets)[0].r') == 'gut', 'rated with one tap')
    await tap(pg, '[data-sec=evaluation] [data-action=open-evaluation]')
    last = await pg.eval_on_selector('#sheetBody', "b => [...b.querySelectorAll('section.card')].at(-1).querySelectorAll('.shop li').length")
    await tap(pg, '#sheet .card [data-action=open-level][data-v=shop]')
    check(
        last == 3 and await pg.locator('#sheet .shop li').count() >= 3,
        'three varieties to buy on the last card of „Vorlieben“, all of them on its level',
    )
    await back(pg)
    await tap(pg, '#sheet [data-action=open-level][data-v=profile]')
    check(await pg.locator('#sheet .likes li').count() >= 4, 'comparisons page opens')
    await back(pg, 2)
    await settings(pg)
    await tap(pg, '[data-action=theme][data-v=dark]')
    check(await pg.get_attribute('html', 'data-theme') == 'dark', 'theme switched')
    await settings_page(pg, 'house')
    check(
        await pg.locator('#serverBox [data-action=connect-form]').count() == 1 and await pg.locator('#f-code, #f-server').count() == 0,
        'Haushalt: only the way in',
    )
    await back(pg, 2)
    await tap(pg, '[data-sec=evaluation] button.tile')
    check(await pg.evaluate(LEVEL) == [True, 'product', None, None], 'food sheet opens')
    await tap(pg, '[data-action=close]')
    await tap(pg, '.tl [data-action=open-serving]')
    await tap(pg, '[data-action=close]')
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_flow(browser, url):
    print('flows in the Android app: pets, photo, naming, rating, undo, back, backup, deep links, restart')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await tap(pg, '.welcome [data-action=add-pet]')
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=set-species][data-v=Hund]')
    await tap(pg, '[data-action=save-pet]')
    await settings(pg)  # with one pet there is no pet bar
    await tap(pg, '#sheet [data-action=add-pet]')
    await pg.fill('#f-name', 'Tiger')
    await tap(pg, '[data-action=save-pet]')
    check(await pg.evaluate(LEVEL) == [True, 'settings', None, None], 'saving a pet returns to the settings overview')
    await back(pg)
    check(await state(pg, 'db.pets.length') == 2, 'two pets')
    await snap(pg)
    check(
        await state(pg, "db.servings[0].status + '|' + db.servings[0].error") == 'noserver|undefined'
        and await pg.locator('#sheet #f-brand').count() == 1,
        'photo without a server: stored, naming opens at once',
    )
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs in Soße')
    await tap(pg, '[data-action=save-name]')
    rates = pg.locator('#sheet .slider')
    await rates.nth(0).locator('[data-r=gut]').click(force=True)
    await idle(pg)
    await rates.nth(1).locator('[data-r=sosse]').click(force=True)
    await idle(pg)
    check(await state(pg, 'Object.values(db.servings[0].pets).map(x => x.r).join()') == 'gut,sosse', 'both pets rated')
    check(await state(pg, "!('photo' in db.servings[0]) && !('status' in db.servings[0])"), 'named: photo and status dropped from the meal')
    await tap(pg, '.tl [data-action=open-serving]')
    await tap(pg, '[data-action=delete-serving]')
    check(await state(pg, 'db.servings.length') == 0, 'meal deleted')
    await tap(pg, '#toast [data-action=undo]')
    check(await state(pg, "db.servings.length + '|' + db.products.length") == '1|1', 'undo brings it back')
    await tap(pg, '#fab')
    await hw_back(pg)
    check(not await pg.evaluate(OPEN), 'back button closes the sheet')
    await pg.evaluate('window.__back({canGoBack: false})')
    await idle(pg)
    check(['minimize', None] in await pg.evaluate('window.__calls'), 'back on the home page minimizes the app')
    await settings(pg)
    check('9.9.9' in await pg.inner_text('.foot'), 'version from the app')
    await settings_page(pg, 'backup')
    await tap(pg, '[data-action=export]')
    check(any(c['directory'] == 'CACHE' for c in await calls(pg, 'writeFile')) and await calls(pg, 'share'), 'backup through a cache file and share')
    await pg.evaluate("import('./js/logic/products.js').then(m => m.shareShopping())")
    await idle(pg)
    listed = [c for c in await calls(pg, 'share') if c.get('text')]
    want = await pg.evaluate("import('./js/derive.js').then(d => d.shoppingList())")
    check(len(listed) == 1 and listed[0]['text'] == want['text'] and 'files' not in listed[0], 'shopping list shared as text')
    await back(pg, 2)
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://feed'})")
    await pg.wait_for_selector('#sheet .cta.primary')  # the link closes the open sheet first
    await idle(pg)
    check(await pg.evaluate(LEVEL) == [True, 'feed', None, None], 'schmeckts://feed opens the feeding sheet')
    shots = len(await calls(pg, 'capture'))
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})")
    await pg.wait_for_function(f"window.__calls.filter(c => c[0] === 'capture').length > {shots}")
    await idle(pg)
    check(await pg.evaluate(LEVEL) == [True, 'feed', None, None], 'schmeckts://photo cancelled: the feeding sheet stays')
    await pg.evaluate(f'window.__photo = {json.dumps(b64())}')
    before = await state(pg, 'db.servings.length')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})")
    await until(pg, f'db.servings.length === {before + 1}')
    await idle(pg)
    check(
        await state(pg, "db.servings[0].status === 'noserver' && !!db.servings[0].thumb") and await pg.locator('#sheet #f-brand').count() == 1,
        'schmeckts://photo: served, naming',
    )
    await tap(pg, '#toast [data-action=undo]')
    check(await state(pg, 'db.servings.length') == before and not await pg.evaluate(OPEN), 'undo removes it and closes the sheet')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://foto'})")  # German links from before still sit in shortcuts
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    legacy = await state(pg, 'db.servings.length') == before + 1
    await tap(pg, '#toast [data-action=undo]')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://fuettern'})")
    await pg.wait_for_selector('#sheet .cta-row')
    await idle(pg)
    check(legacy and await pg.evaluate(LEVEL) == [True, 'feed', None, None], 'legacy links schmeckts://foto and schmeckts://fuettern')
    await tap(pg, '#sheet [data-action=close]')
    await pg.evaluate("import('./js/store.js').then(m => m.flush())")
    await pg.reload()
    await started(pg)
    check(await state(pg, "db.pets.length + '|' + db.servings.length") == '2|1', 'restart: the data comes from the files')
    await pg.evaluate("sessionStorage.setItem('__launchUrl', 'schmeckts://feed')")
    await pg.reload()
    await started(pg)
    check(await pg.evaluate(LEVEL) == [True, 'feed', None, None], 'cold start with schmeckts://feed opens the feeding sheet')
    await pg.evaluate("sessionStorage.removeItem('__launchUrl')")
    await hw_back(pg)
    check(not await pg.evaluate(OPEN), 'back closes it')
    await pg.evaluate("""import('./js/store.js').then(m => { m.prefs.activePet = m.db.pets[0].id;
      m.merge([{c: 'pets', r: m.db.pets[0].id, f: {_del: {v: true, t: '9999999999999-0000-anderes'}}}]); })""")
    await idle(pg)
    check(await state(pg, "prefs.activePet + '|' + db.pets.length") == 'all|1', 'pet deleted elsewhere: gone, the filter falls back to all')
    await pg.evaluate("""import('./js/store.js').then(m => m.merge([{c: 'servings', r: m.db.servings[0].id,
      f: {['pets.' + m.db.pets[0].id]: {v: {r: 'super', at: 1}, t: '9999999999999-0001-anderes'}}}]))""")
    await idle(pg)
    await pg.evaluate("import('./js/views/home.js').then(m => m.renderHome())")
    check(not real_errors(errors), f'an unknown rating from a newer app breaks nothing; no errors {real_errors(errors)}')
    await ctx.close()


async def test_buying(browser, url):
    print('„Kaufen“ in the food sheet: stored, honoured by the quick picker, „auto“ drops it')
    ctx, pg, errors = await demo(browser, url)
    await tap(pg, '#fab')
    pid = await pg.get_attribute('#sheet .plist [data-action=serve]', 'data-id')
    await tap(pg, '#sheet [data-action=close]')
    kaufen = f"db.products.find(p => p.id === '{pid}').kaufen ?? null"
    await open_sheet(pg, kind='product', id=pid)
    await tap(pg, '#sheet [data-action=buy][data-v=nicht]')
    check(
        await state(pg, kaufen) == 'nicht' and await pg.get_attribute('#sheet [data-action=buy][data-v=nicht]', 'aria-pressed') == 'true',
        '„nicht“ stored',
    )
    await tap(pg, '#sheet [data-action=close]')
    await tap(pg, '#fab')
    check(await pg.locator(f'#sheet .plist [data-action=serve][data-id="{pid}"]').count() == 0, 'no longer bought: gone from the quick picker')
    await tap(pg, '#sheet [data-action=close]')
    await open_sheet(pg, kind='product', id=pid)
    await tap(pg, '#sheet [data-action=buy][data-v=auto]')
    check(await state(pg, f"!('kaufen' in db.products.find(p => p.id === '{pid}'))"), '„auto“ drops the field')
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_cards(browser, url):
    print('hint card: highest precedence first, buying from the hint, hidden hints remembered')
    ctx, pg, errors = await demo(browser, url)
    seen, ok = [], True
    for _ in range(12):
        first = await pg.evaluate("import('./js/derive.js').then(d => d.model().hints[0] || null)")
        if not first:
            break
        key = f'{first["kind"]}:{first["id"]}'
        ok &= await pg.locator('[data-sec=hint]').count() == 1 and await pg.get_attribute('[data-sec=hint] [data-action=hide-hint]', 'data-v') == key
        seen.append(first['kind'])
        if first['kind'] in ('stop', 'liebling') and seen.count(first['kind']) == 1:
            await tap(pg, '[data-sec=hint] [data-action=hint-buy]')
            ok &= await state(pg, f"db.products.find(p => p.id === '{first['id']}').kaufen") == ('nicht' if first['kind'] == 'stop' else 'immer')
        else:
            await tap(pg, '[data-sec=hint] [data-action=hide-hint]')
            ok &= await state(pg, f"prefs.hiddenHints.includes('{key}')")
    check(
        ok
        and {'stop', 'liebling'} <= set(seen)
        and seen == sorted(seen, key=['stop', 'sosse', 'liebling'].index)
        and await pg.locator('[data-sec=hint]').count() == 0,
        f'one hint at a time by precedence, settled or hidden the next follows {seen}',
    )
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_shop(browser, url):
    print('„Einkaufen“: a level of „Vorlieben“ from the bar, the list shared as derive builds it, a row opens its food sheet over the page')
    ctx, pg, errors = await demo(browser, url, permissions=['clipboard-read', 'clipboard-write'])
    want = await pg.evaluate("import('./js/derive.js').then(d => d.shoppingList())")
    check(await pg.locator('#home .shop').count() == 0, 'nothing of it on the home page')
    await tap(pg, '[data-sec=evaluation] [data-action=open-evaluation]')
    await tap(pg, '#sheet .head [data-action=open-level][data-v=shop]')
    level = await pg.evaluate(LEVEL)
    await back(pg)
    check(
        level == [True, 'evaluation', 'shop', None] and await pg.evaluate(LEVEL) == [True, 'evaluation', None, None],
        f'the cart in the bar opens it as a level, back returns to „Vorlieben“ {level}',
    )
    await tap(pg, '#sheet .head [data-action=open-level][data-v=shop]')
    await tap(pg, '#sheet [data-action=share-list]')
    check(await pg.evaluate('navigator.clipboard.readText()') == want['text'], 'without a share menu the list goes to the clipboard')
    await pg.evaluate('navigator.share = o => { window.__shared = o; return Promise.resolve(); }')
    await tap(pg, '#sheet [data-action=share-list]')
    check(await pg.evaluate('window.__shared') == want, 'navigator.share gets title and text')
    pid = await pg.get_attribute('#sheet [data-action=open-product]', 'data-id')
    await tap(pg, f'#sheet [data-action=open-product][data-id="{pid}"]')
    kinds = "[document.getElementById('sheet').dataset.kind, document.getElementById('popup').open]"
    over = [await pg.evaluate(kinds), await pg.evaluate(LEVEL)]
    await tap(pg, '#popup [data-action=close]')
    check(
        over == [['evaluation', True], [True, 'product', None, None]] and await pg.evaluate(kinds) == ['evaluation', False],
        f'a row opens over the page and closes back {over}',
    )
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_shop_folds(browser, url):
    print('„Einkaufen“: what is no longer bought shows its first three at once, the rest behind one tap')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    now = await pg.evaluate('Date.now()')
    left = [f'stehen{i:04d}' for i in range(5)]
    await load(
        pg,
        [pet(M)],
        [product(i, 'Sheba', f'Sorte {n}') for n, i in enumerate([*left, 'unklar0001'])],
        [meal(f'{i}-{n}', i, now - (n + 1) * 864e5, {M: 'schlecht'}) for i in left for n in range(2)]
        + [meal('unklar0001-0', 'unklar0001', now - 864e5, {M: 'mittel'})],
    )
    await open_sheet(pg, kind='evaluation', page='shop')
    ROWS = "s => document.querySelector(s).closest('.card').querySelectorAll('.shop > li').length"
    shut = await pg.evaluate(ROWS, '#sheet [data-action=fold][data-v=nicht]')
    await tap(pg, '#sheet [data-action=fold][data-v=nicht]')
    rows = [shut, await pg.evaluate(ROWS, '#sheet [data-action=fold][data-v=nicht]'), await pg.evaluate(ROWS, '#sheet [data-id=unklar0001]')]
    check(
        rows == [3, 5, 1] and await pg.locator('#sheet [data-action=fold][data-v=unklar]').count() == 0,
        f'three at once, the rest after a tap; a short list has nothing to unfold {rows}',
    )
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


M, T = 'minka00001', 'tiger00001'


async def test_dry_food(browser, url):
    print('only dry food rated: no ranking, the „Vorlieben“ card still leads to what to buy again')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    now = await pg.evaluate('Date.now()')
    await load(
        pg,
        [pet(M)],
        [product('trocken0001', 'Josera', 'Huhn', 'Trockenfutter')],
        [meal(f'meal{i}', 'trocken0001', now - (i + 1) * 864e5, {M: 'gern'}) for i in range(3)],
    )
    rows = await pg.eval_on_selector_all('[data-sec=evaluation] .shop [data-action=open-product]', 'l => l.map(b => b.dataset.id)')
    await tap(pg, '[data-sec=evaluation] [data-action=open-evaluation]')
    check(
        rows == ['trocken0001'] and await pg.locator('#sheet .card [data-action=open-level][data-v=shop]').count() == 1,
        f'the card on the home page and the last card of the page name it {rows}',
    )
    check(not errors, f'no errors {errors}')
    await ctx.close()


BRANDS = ['Sheba', 'Felix', 'Gourmet', 'Whiskas', 'Animonda', 'Miamor', 'Cosma', 'Rinti', 'Bozita', 'Schesir']


# n varieties of their own brand, one meal each, `days` apart (0: an hour)
async def sorts(pg, n, days):
    now, levels = await pg.evaluate('Date.now()'), ['top', 'gut', 'mittel', 'sosse', 'schlecht']
    await load(
        pg,
        [pet(M)],
        [product(f'sorte{i:05d}', BRANDS[i % 10], f'Sorte {i + 1}', createdAt=i) for i in range(n)],
        [meal(f'meal{i:06d}', f'sorte{i:05d}', now - 36e5 - i * (days or 1 / 24) * 864e5, {M: levels[i % 5]}) for i in range(n)],
    )


async def test_home_history(browser, url):
    print('history on the home page: today, else yesterday, within the pet filter')
    ctx = await phone(browser, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    IDS = "[...document.querySelectorAll('[data-sec=hist] .tl-item')].map(b => b.dataset.id)"

    async def seed(now, meals, pets=(M,)):
        await pg.clock.set_fixed_time(now)
        await pg.evaluate("import('./js/store.js').then(s => { s.prefs.activePet = 'all'; })")
        await load(
            pg, [pet(p, p[:5]) for p in pets], [product('sorte00000')], [meal(i, 'sorte00000', at(t), {p: 'gut' for p in who}) for i, t, who in meals]
        )
        return await pg.evaluate(IDS)

    owner = [
        ['m1', '2026-06-12T07:00', [M]],
        ['m2', '2026-06-11T07:30', [M]],
        ['m3', '2026-06-11T12:00', [M]],
        ['m4', '2026-06-11T18:30', [M]],
        ['m5', '2026-06-10T08:00', [M]],
    ]
    check(await seed('2026-06-12T10:00:00+02:00', owner) == ['m1'], 'served today: only today')
    check(await seed('2026-06-12T05:30:00+02:00', owner[1:]) == ['m4', 'm3', 'm2'], 'nothing yet today: yesterday, newest first')
    none = await seed('2026-06-14T10:00:00+02:00', owner)
    check(
        none == []
        and await pg.locator('[data-sec=hist] .empty').count() == 1
        and await pg.locator('[data-sec=hist] [data-action=open-report]').count() == 1,
        'neither today nor yesterday: an empty line, the way to the whole history stays',
    )
    house = [['t1', '2026-06-12T08:00', [T]], ['k1', '2026-06-11T08:00', [M]], ['k2', '2026-06-11T18:00', [M]]]
    everyone = await seed('2026-06-12T10:00:00+02:00', house, (M, T, 'mauz000001'))
    mine = []
    for p in (M, 'mauz000001'):
        await tap(pg, f'[data-action=filter][data-id={p}]')
        mine.append(await pg.evaluate(IDS))
    check(
        [everyone, *mine] == [['t1'], ['k2', 'k1'], []] and await pg.locator('[data-sec=hist] .empty .sk').count() == 1,
        f'within the filter {mine}',
    )
    check(await seed('2026-06-12T00:05:00+02:00', [['n1', '2026-06-11T23:50', [M]]]) == ['n1'], 'just after midnight the evening meal is yesterday')
    future = [['f1', '2026-06-13T09:00', [M]], ['f2', '2026-06-12T07:00', [M]]]
    check(await seed('2026-06-12T10:00:00+02:00', future) == ['f2'], 'a meal stamped in the future by another clock does not push today away')
    today3 = [[f'h{i}', f'2026-06-12T0{7 + i}:00', [M]] for i in range(3)]
    long = today3 + [[f'd{d}-{i}', f'2026-05-{11 + d:02d}T{8 + 4 * i:02d}:00', [M]] for d in range(20) for i in range(3)]
    check(await seed('2026-06-12T12:00:00+02:00', long) == ['h2', 'h1', 'h0'], 'a long history: still only today')
    await seed('2026-06-12T05:30:00+02:00', owner[1:])
    await tap(pg, '#fab')
    await tap(pg, '#sheet [data-action=serve]')
    served = await pg.evaluate(IDS)
    await tap(pg, '#toast [data-action=undo]')
    check(
        len(served) == 1 and served[0] not in ('m2', 'm3', 'm4') and await pg.evaluate(IDS) == ['m4', 'm3', 'm2'],
        'serving replaces yesterday, undo brings it back',
    )
    cal = today3 + [[f'c{d}-{i}', f'2026-06-{1 + d:02d}T{8 + 4 * i:02d}:00', [M]] for d in range(11) for i in range(3)]
    await seed('2026-06-12T12:00:00+02:00', cal)
    week = await pg.eval_on_selector_all('#home .cal .day', 'l => l.map(b => b.classList.contains("today"))')
    check(len(week) == 7 and week[-1] and not any(week[:-1]), f'the home calendar: the last seven days in one row, today last {week}')
    jumps = []
    for day in ('2026-06-12', '2026-06-06'):
        await tap(pg, f'[data-sec=hist] [data-action=jump-day][data-day="{day}"]')
        jumps.append(
            await pg.evaluate(
                "k => { const d = document.querySelector('#sheetBody #d-' + k)?.getBoundingClientRect(); return [document.getElementById('sheet').dataset.kind, !!d && d.top >= 0 && d.top < innerHeight]; }",
                day,
            )
        )
        await back(pg)
    check(jumps == [['report', True]] * 2 and await pg.locator('#home [id^="d-"]').count() == 0, f'a calendar day opens the history there {jumps}')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_report(browser, url):
    print('the history page: every meal reachable by scrolling, the pet filter, its calendar grows the list')
    ctx = await phone(browser, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-12T15:00:00+02:00')
    noon = at('2026-06-12T12:00')
    meals = [
        meal(f'meal{d}-{n}', 'sorte1', noon - d * 864e5 - n * 36e5, {M: 'top', **({T: 'gut'} if n == 0 and d % 2 == 0 else {})})
        for d in range(20)
        for n in range(3)
    ]
    await load(pg, [pet(M), pet(T, 'Tiger')], [product('sorte1')], meals)
    ITEMS = '#sheet .tl-item'

    async def scrolled():
        for _ in range(12):
            await pg.eval_on_selector('#sheetBody', 'b => b.scrollTo(0, b.scrollHeight)')
            await idle(pg)
        return await pg.locator(ITEMS).count()

    await tap(pg, '[data-sec=hist] [data-action=open-report]')
    first = await pg.locator(ITEMS).count()
    oldest = (await pg.eval_on_selector_all('#sheet .cal .day.has', 'l => l.map(b => b.dataset.day)'))[0]
    drawn = await pg.locator(f'#sheetBody #d-{oldest}').count()
    await tap(pg, f'#sheet [data-action=jump-day][data-day="{oldest}"]')
    check(not drawn and await pg.locator(f'#sheetBody #d-{oldest}').count() == 1, f'a calendar day not drawn yet grows the list to it {first}')
    check(await scrolled() == 60, 'every meal reachable by scrolling')
    await back(pg)
    await tap(pg, f'[data-action=filter][data-id={T}]')
    await tap(pg, '[data-sec=hist] [data-action=open-report]')
    check(await scrolled() == 10, 'with a pet chosen, only its meals')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()
    ctx = await phone(browser, height=1800)
    pg, errors = await open_page(ctx, url)
    await sorts(pg, 26, 1)
    await tap(pg, '[data-sec=hist] [data-action=open-report]')
    body = await pg.eval_on_selector('#sheetBody', 'b => [b.scrollHeight > b.clientHeight, b.querySelectorAll(".tl-day").length]')
    check(body[0] and body[1] > 10, f'a tall screen draws more than one page, so it can scroll {body}')
    await ctx.close()


async def test_evaluation(browser, url):
    print('„Vorlieben“: a row opens its food sheet, the page leads to a level and back')
    ctx, pg, errors = await demo(browser, url)
    pid = await pg.get_attribute('[data-sec=evaluation] button.tile', 'data-id')
    await tap(pg, '[data-sec=evaluation] button.tile')
    check(await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet?.kind, m.sheet?.id])") == ['product', pid], 'a row opens its food sheet')
    await tap(pg, '#sheet [data-action=close]')
    await tap(pg, '[data-sec=evaluation] [data-action=open-evaluation]')
    told = await pg.evaluate(
        "[document.querySelector('#sheet .portrait .say').textContent, [...document.querySelectorAll('#sheet .ranks b')].map(b => b.textContent)]"
    )
    check(told[1] and not any(name in told[0] for name in told[1]), f'the portrait names none of the varieties the lists below show {told}')
    ranked = await pg.eval_on_selector_all('#sheet .ranks', "l => l.map(o => [o.children.length, o.querySelectorAll('.place').length])")
    check(ranked and all(n == shown for n, shown in ranked), f'every row of a longer list shows its place {ranked}')
    await tap(pg, '#sheet [data-action=open-level][data-v=profile]')
    level = await pg.evaluate(LEVEL)
    await back(pg)
    check(level == [True, 'evaluation', 'profile', None] and await pg.evaluate(LEVEL) == [True, 'evaluation', None, None], 'a level and back')
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_candidate(browser, url):
    print('no Leibgericht yet: its empty side names the variety closest to it, which „Als Nächstes“ then leaves out')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    now = await pg.evaluate('Date.now()')
    rated = [('ladenhueter', ['schlecht', 'schlecht', 'mittel']), ('naechste1', ['top', 'gut']), ('naechste2', ['top'])]
    await load(
        pg,
        [pet(M)],
        [product(i, 'Sheba', i.capitalize()) for i, _ in rated],
        [meal(f'{i}-{n}', i, now - (n + 1) * 864e5 - k * 36e5, {M: r}) for k, (i, levels) in enumerate(rated) for n, r in enumerate(levels)],
    )
    tile = await pg.eval_on_selector('[data-sec=evaluation] .tile', "t => [t.tagName, t.dataset.id ?? null, !!t.querySelector('.kicker')]")
    await tap(pg, '[data-sec=evaluation] [data-action=open-evaluation]')
    named = await pg.eval_on_selector_all('#sheetBody [data-action=open-product]', 'l => l.map(b => b.dataset.id)')
    check(tile == ['BUTTON', 'naechste1', True], f'the empty Leibgericht tile keeps its kicker and opens the closest variety {tile}')
    check(named == ['naechste1', 'ladenhueter', 'naechste2'], f'its card names it before the Ladenhüter, „Als Nächstes“ only the others {named}')
    check(await pg.locator('#sheet .ranks .place').count() == 0, 'a list of one shows no place')
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_scales(browser, url):
    print('rating scales per food type: dry food and treats have their own levels')
    ctx = await phone(browser, timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-10T23:30:00+02:00')
    now = at('2026-06-10T23:30')
    rated = [['trocken', None, 1], ['snack', None, 2], ['trocken', 'gut', 20], ['trocken', 'gern', 21], ['trocken', 'liegen', 23]]
    await load(
        pg,
        [pet(M)],
        [product('trocken0001', 'Josera', '', 'Trockenfutter'), product('snack0001', 'Dreamies', '', 'Snack')],
        [meal(f'meal00000{i}', p + '0001', now - ago * 36e5, {M: r}) for i, (p, r, ago) in enumerate(rated)],
    )
    levels = await pg.evaluate(
        "[...document.querySelectorAll('.pend .slider')].map(s => [...s.querySelectorAll('.slider-track button')].map(b => b.dataset.r))"
    )
    check(
        levels == [['gern', 'normal', 'wenig', 'liegen'], ['verputzt', 'spaeter', 'angeknabbert', 'unberuehrt']],
        f'own scales for dry food and treats {levels}',
    )
    await tap(pg, '.tl-item[data-id=meal000002]')  # rated on another scale
    await tap(pg, '#sheet [data-r=liegen]', force=True)
    check(await state(pg, "db.servings.find(x => x.id === 'meal000002').pets.minka00001.r") == 'liegen', 'a tap replaces a level from another scale')
    check(await until(pg, f'!{OPEN}', 5), 'every pet rated: the sheet closes')
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_slider_words(browser, url):
    print('the words under each scale stay whole at 360px')
    ctx = await phone(browser, width=360)
    pg, errors = await open_page(ctx, url)
    now = await pg.evaluate('Date.now()')
    foods = [product('nass0001'), product('trocken0001', 'Josera', 'Huhn', 'Trockenfutter'), product('snack0001', 'Dreamies', 'Käse', 'Snack')]
    await load(pg, [pet(M)], foods, [meal(f'meal{i}', p['id'], now - (i + 1) * 36e5, {M: None}) for i, p in enumerate(foods)])
    broken = await pg.evaluate("""[...document.querySelectorAll('.pend .slider-names > span > *')].filter(w => {
      const r = document.createRange(); r.selectNodeContents(w);
      return r.getClientRects().length > 1 || r.getBoundingClientRect().width > w.clientWidth; }).map(w => w.textContent)""")
    scales = await pg.locator('.pend .slider').count()
    check(scales == 3 and broken == [], f'no word broken or cut on any of the three scales {broken}')
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_slide(browser, url):
    print('rating slider under a finger, the mouse and the keyboard: one rating per gesture, none when scrolling or cancelled')
    ctx, pg, errors = await demo(browser, url, touch=True, width=360, height=800)
    cdp = await ctx.new_cdp_session(pg)

    async def touch(kind, x=0, y=0):  # a real finger: the browser decides on scrolling and clicks
        await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind in ('touchEnd', 'touchCancel') else [{'x': x, 'y': y}]})

    async def slide(a, b, steps=5, dy=0):
        await touch('touchStart', *a)
        for i in range(1, steps + 1):
            await touch('touchMove', a[0] + (b[0] - a[0]) * i / steps, a[1] + dy)

    async def stops():
        return await pg.eval_on_selector_all(
            '.pend .slider-track button',
            'l => l.map(b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })',
        )

    async def rated():  # the open meal's rating, and the clicks on a level since the last call
        return [await state(pg, RATED), await pg.evaluate('(() => { const r = window.__rated; window.__rated = []; return r; })()')]

    async def reopen():
        await change(pg, 'const x = s.db.servings.find(v => v.id === window.__open); for (const k in x.pets) x.pets[k] = {r: null, at: null}')
        await rated()

    RATED = '(() => { const s = db.servings.find(x => x.id === window.__open); return s && Object.values(s.pets)[0].r; })()'
    await pg.evaluate("""import('./js/derive.js').then(d => { window.__open = d.pendingServings()[0].id; window.__rated = [];
      document.addEventListener('click', e => { const b = e.target.closest('.slider-track button'); if (b) window.__rated.push(b.dataset.r); }); })""")
    at_ = await stops()
    await touch('touchStart', *at_[1])
    await pg.wait_for_timeout(250)  # a resting finger
    await touch('touchEnd')
    await idle(pg)
    check(await rated() == ['gut', ['gut']], 'lifting the finger rates once')
    await slide(at_[1], at_[0])
    await touch('touchEnd')
    await idle(pg)
    check(await rated() == ['top', ['top']], 'while the card stays, a slide puts it right')
    await tap(pg, '#toast [data-action=undo]')
    check(await state(pg, RATED) == 'gut', 'undo brings back the level before')
    await reopen()
    at_ = await stops()
    await slide(at_[0], at_[3], 10, 2)
    await touch('touchEnd')
    await idle(pg)
    check(await rated() == ['eager', ['eager']], 'a slide rates the level it ends on, once')
    await reopen()
    top = await pg.evaluate('scrollY')
    x, y = (await stops())[2]
    await touch('touchStart', x, y)
    for dy in range(10, 130, 10):
        await touch('touchMove', x + dy / 10, y - dy)
    await touch('touchEnd')
    await pg.wait_for_function('(y => { const same = y === window.__y; window.__y = y; return same; })(scrollY)', polling=100)
    check(await pg.evaluate('scrollY') > top and await rated() == [None, []], 'moving up scrolls and rates nothing')
    at_ = await stops()
    await slide(at_[1], at_[3])
    await touch('touchCancel')
    await idle(pg)
    check(await rated() == [None, []], 'a cancelled slide rates nothing')
    await touch('touchStart', *(await stops())[1])
    await pg.evaluate("import('./js/views/home.js').then(h => h.renderHome())")
    await touch('touchEnd')
    await idle(pg)
    check(await rated() == [None, []], 'a slider redrawn under the finger rates nothing')
    at_ = await stops()
    await pg.mouse.move(*at_[5])
    await pg.mouse.down()
    await pg.mouse.move(*at_[4], steps=4)
    await pg.mouse.up()
    await idle(pg)
    check(await rated() == ['sosse', ['sosse']], 'mouse: pressed on one level, released on the next, that one counts')
    await reopen()
    await pg.focus('.pend .slider-bar [data-r=gut]')
    await pg.keyboard.press('Tab')
    await pg.keyboard.press('Enter')
    await idle(pg)
    check(await rated() == ['mittel', ['mittel']], 'keyboard: Enter rates the focused level')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_texture(browser, url):
    print('consistency: set, cleared, replaced, gone with a type change, filled from keywords only when empty')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    now = await pg.evaluate('Date.now()')
    foods = [product('nass0001'), product('trocken0001', 'Josera', 'Huhn in Soße', 'Trockenfutter')]
    await load(pg, [pet(M)], foods, [meal(f'meal{i}', p['id'], now - (i + 30) * 36e5, {M: 'top'}) for i, p in enumerate(foods)])
    TEX = "(p => 'texture' in p ? p.texture : null)(db.products.find(p => p.id === 'nass0001'))"
    ON = "[...document.querySelectorAll('#sheet [data-action=set-texture][aria-pressed=true]')].map(c => c.dataset.v)"
    await open_sheet(pg, kind='product', id='nass0001')
    got = []
    for picks in (['block'], ['block'], ['gelee', 'pastete']):
        for v in picks:
            await tap(pg, f'#sheet [data-action=set-texture][data-v={v}]')
        got.append([await state(pg, TEX), await pg.evaluate(ON)])
    check(got == [['block', ['block']], [None, []], ['pastete', ['pastete']]], f'a tap sets it, a second drops the field, another replaces it {got}')
    await tap(pg, '[data-action=close]')
    await open_sheet(pg, kind='product', id='trocken0001')
    check(await pg.locator('#sheet [data-action=set-texture]').count() == 0, 'dry food: no choice')
    await tap(pg, '[data-action=close]')
    await open_sheet(pg, kind='product', id='nass0001')
    await tap(pg, '[data-action=rename-product]')
    await tap(pg, '#sheet [data-action=set-type][data-v=Snack]')
    snack = await pg.evaluate(ON)
    await tap(pg, '#sheet [data-action=set-type][data-v=Sonstiges]')
    await tap(pg, '[data-action=save-name]')
    check(
        snack == [] and await state(pg, "(p => p.type === 'Sonstiges' && !('texture' in p))(db.products.find(p => p.id === 'nass0001'))"),
        'another type drops it',
    )
    await tap(pg, '[data-action=close]')

    async def name_new(variety, pick=None, twice=False, kind='Nassfutter'):
        await tap(pg, '#fab')
        await tap(pg, '[data-action=new-product]')
        await pg.fill('#f-brand', 'Miamor')
        await pg.fill('#f-variety', variety)
        await tap(pg, f'#sheet [data-action=set-type][data-v={kind}]')
        for _ in range((pick is not None) + twice):
            await tap(pg, f'#sheet [data-action=set-texture][data-v={pick}]')
        await tap(pg, '[data-action=save-name]')
        return await state(pg, f"(p => p.texture ?? null)(db.products.find(p => p.variety === '{variety}'))")

    got = [
        await name_new('Ragout in Gelee'),
        await name_new('Filet in Soße', 'mousse'),
        await name_new('Huhn in Jelly', 'gelee', twice=True),
        await name_new('Knusperkissen', kind='Snack'),
        await name_new('Kaninchen'),
    ]
    check(got == ['gelee', 'mousse', None, 'knusprig', None], f'keywords fill an empty field only, a choice or a cleared field stays {got}')
    got = await pg.evaluate("""import('./js/logic/products.js').then(m => { const make = (variety, texture, type = 'Nassfutter') => m.newProduct({brand: 'Test', variety, type, texture}).texture ?? null;
      const old = m.newProduct({brand: 'Test', variety: 'Pute', type: 'Nassfutter', texture: 'suppe'}); m.applyTexture(old, {texture: 'gelee'});
      return [make('Huhn in Soße', 'gelee'), make('Rind in Soße', 'knusprig'), make('Ente in Soße'), make('Sticks', 'weich', 'Snack'), make('Kroketten in Soße', 'sosse', 'Trockenfutter'), old.texture]; })""")
    check(got == ['gelee', 'sosse', 'sosse', 'weich', None, 'suppe'], f'a fitting recognised value beats keywords {got}')
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_suggestions(browser, url):
    print('feeding: suggestions, at most eight hits, a new variety from the search')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    NAMES = "[...document.querySelectorAll('#serveList .plist b')].map(x => x.innerText)"
    await sorts(pg, 3, 0)
    await tap(pg, '#fab')
    check(
        await pg.evaluate(NAMES) == ['Sorte 1', 'Sorte 2', 'Sorte 3'] and await pg.locator('#sheet [data-search]').count() == 0,
        'three: all suggested, no search',
    )
    await tap(pg, '#sheet [data-action=close]')
    await sorts(pg, 12, 0)
    await tap(pg, '#fab')
    check(await pg.evaluate(NAMES) == ['Sorte 1', 'Sorte 2', 'Sorte 3'], 'twelve: the three fed last')
    await pg.fill('#sheet [data-search]', 'Sorte')
    await idle(pg)
    check(len(await pg.evaluate(NAMES)) == 8, 'at most eight hits')
    await pg.fill('#sheet [data-search]', 'sheba sorte 11')
    await idle(pg)
    hit = await pg.evaluate(NAMES)
    await pg.fill('#sheet [data-search]', '')
    await idle(pg)
    check(
        hit == ['Sorte 11'] and await pg.evaluate(NAMES) == ['Sorte 1', 'Sorte 2', 'Sorte 3'],
        f'brand and variety together; empty: suggestions {hit}',
    )
    await pg.fill('#sheet [data-search]', 'gibtsnicht')
    await idle(pg)
    await tap(pg, '#serveList [data-action=new-product]')
    check(await pg.input_value('#f-variety') == 'gibtsnicht', 'no hit: what was typed becomes a new variety')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_reminders(browser, url):
    print('rating reminder: permission, schedule, tap, cancel once rated, follow changes, own interval, reconcile at start')
    ctx = await phone(browser)
    await fixed_clock(ctx)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=demo]')
    await debounced(pg)
    await change(pg, "s.db.pets.push({id: 'tigerpet01', name: 'Tiger', species: 'Katze', createdAt: Date.now()})")
    SWITCH = "document.querySelector('#sheet [data-action=remind-on]').getAttribute('aria-checked')"
    OPENED = "import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.id])"
    PLAN = """([id, ago, productId]) => import('./js/store.js').then(async s => { const t = Date.now() - ago * 60000;
      const x = {id, productId, servedAt: t, note: '', pets: {[s.db.pets[0].id]: {r: null, at: null}}}; s.db.servings.unshift(x); s.save();
      (await import('./js/logic/reminders.js')).planReminder(x); return t; })"""

    def pending():
        return pg.evaluate('window.Capacitor.Plugins.LocalNotifications.getPending().then(r => r.notifications)')

    async def due():
        return [[n['extra']['serving'], n['body'], await pg.evaluate('t => new Date(t).getTime()', n['schedule']['at'])] for n in await pending()]

    await settings(pg, None, debounced)
    check(
        await pg.evaluate(SWITCH) == 'false'
        and await state(pg, 'prefs.remind') == 0
        and await pg.locator('#sheet [data-action=remind]').count() == 0,
        'off by default, no steps shown',
    )
    await pg.click('#sheet [data-action=remind-on]')
    await debounced(pg)
    check(
        len(await calls(pg, 'requestPermissions')) == 1 and await state(pg, 'prefs.remind') == 0 and await pg.evaluate(SWITCH) == 'false',
        'denied: asked once, stays off',
    )
    await pg.evaluate("localStorage.removeItem('__notifyPermission'); localStorage.setItem('__notifyAnswer', 'granted')")
    await pg.click('#sheet [data-action=remind-on]')
    await debounced(pg)
    check(
        await pg.evaluate(SWITCH) == 'true'
        and await state(pg, 'prefs.remind') == 180
        and await pg.get_attribute('#sheet [data-action=remind][data-v="180"]', 'aria-pressed') == 'true',
        'granted: on with 3 hours',
    )
    await pg.reload()
    await started(pg)
    await pg.click('#fab')
    await debounced(pg)
    await pg.click('.plist [data-action=serve]')
    await debounced(pg)
    s = await state(
        pg,
        '(s => ({id: s.id, at: s.servedAt, name: db.products.find(p => p.id === s.productId).variety, pets: Object.keys(s.pets).length}))(db.servings[0])',
    )
    notes = await pending()
    n = notes[0] if notes else {'body': '', 'extra': {}, 'schedule': {}}
    check(
        len(notes) == 1
        and s['name'] in n['body']
        and await pg.evaluate('t => new Date(t).getTime()', n['schedule'].get('at')) == s['at'] + 180 * 60000
        and n['extra'].get('serving') == s['id']
        and n.get('isExactNotification') is False
        and isinstance(n.get('id'), int)
        and 0 < n['id'] < 2**31,
        f'serving schedules one inexact reminder, serving time plus 3 hours, naming the variety {n}',
    )
    await pg.evaluate("n => window.__tapNote({actionId: 'tap', notification: n})", n)
    await debounced(pg)
    check(
        await pg.evaluate(OPENED) == [True, 'serving', s['id']] and await pg.locator('#sheet .slider-track button').count() == 6 * s['pets'],
        'a tap opens the meal',
    )
    half = 1
    for i in range(s['pets']):
        if i:
            half = len(await pending())
        await pg.locator('#sheet .slider').nth(i).locator('[data-r=top]').click(force=True)
        await debounced(pg)
    check(half == 1 and await pending() == [] and any(c[0]['id'] == n['id'] for c in await calls(pg, 'cancelNotes')), 'cancelled once all pets rated')
    t0 = await pg.evaluate(PLAN, ['ohnesorte001', 2, None])
    await debounced(pg)
    await pg.evaluate(PLAN, ['zualt0000001', 11, None])
    await debounced(pg)
    check([x[0] for x in await due()] == ['ohnesorte001'], 'unknown food gets one, a meal older than 10 minutes none')
    lachs, name = await state(pg, '[db.products[0].id, db.products[0].variety]')
    await pg.evaluate(
        f"import('./js/store.js').then(s => {{ const x = s.db.servings.find(v => v.id === 'ohnesorte001'); x.productId = '{lachs}'; x.servedAt -= 5 * 60000; s.save(); }})"
    )
    await debounced(pg)
    moved = await due()
    check(len(moved) == 1 and name in moved[0][1] and moved[0][2] == t0 - 5 * 60000 + 180 * 60000, f'it follows naming and time {moved}')
    await settings(pg, None, debounced)
    await pg.click('#sheet [data-action=remind][data-v="360"]')
    await debounced(pg)
    later = (await due())[0][2]
    await pg.click('#sheet [data-action=remind-on]')
    await debounced(pg)
    check(
        later == t0 - 5 * 60000 + 360 * 60000 and await pending() == [] and await calls(pg, 'requestPermissions') == [],
        'another step moves it, off cancels all',
    )
    await pg.click('#sheet [data-action=remind-on]')
    await debounced(pg)
    check(await state(pg, 'prefs.remind') == 360, 'on again: the step chosen last')
    await pg.click('#sheet [data-action=remind-own]')
    await debounced(pg)
    await pg.fill('#f-remind', '5')
    await debounced(pg)
    own = await state(pg, 'prefs.remind')
    for bad in ('30', '0', ''):
        await pg.fill('#f-remind', bad)
        await debounced(pg)
    check(own == 300 and await state(pg, 'prefs.remind') == 300, 'own interval in hours, stored in minutes; out of range ignored')
    await back(pg, 1, debounced)
    t1 = await pg.evaluate(PLAN, ['loeschen0001', 0, lachs])
    await debounced(pg)
    planned = await due()
    await pg.evaluate(
        "import('./js/logic/editing.js').then(async e => { (await import('./js/ui/sheet.js')).openSheet({kind: 'serving', id: 'loeschen0001'}); e.deleteServing('loeschen0001'); })"
    )
    await debounced(pg)
    check([x[2] for x in planned] == [t1 + 300 * 60000] and await pending() == [], 'own interval scheduled; meal deleted: cancelled')
    await pg.evaluate(PLAN, ['bleibt000001', 1, lachs])
    await pg.evaluate(
        "import('./js/store.js').then(s => { const x = s.db.servings.find(v => v.id === 'ohnesorte001'); x.pets[Object.keys(x.pets)[0]] = {r: 'top', at: 1}; s.save(); })"
    )
    await debounced(pg)
    await pg.evaluate("import('./js/store.js').then(m => m.flush())")
    await pg.evaluate("""localStorage.setItem('__notes', JSON.stringify([...JSON.parse(localStorage.getItem('__notes')), {id: 4711, title: 'x', body: 'alt', extra: {serving: 'gibtsnicht01', at: 1}},
      {id: 4712, title: 'x', body: 'alt', extra: {serving: 'ohnesorte001', at: 1}}]))""")
    await pg.evaluate(
        "sessionStorage.setItem('__launchNote', JSON.stringify({actionId: 'tap', notification: {id: 1, extra: {serving: 'bleibt000001'}}}))"
    )
    await pg.reload()
    await started(pg)
    await debounced(pg)
    check([x[0] for x in await due()] == ['bleibt000001'], 'at start-up reminders without an open meal go, the open one stays')
    check(await pg.evaluate(OPENED) == [True, 'serving', 'bleibt000001'], 'a tap on a cold start opens the meal')
    await pg.evaluate("sessionStorage.removeItem('__launchNote')")
    await pg.click('#sheet [data-action=close]')
    await debounced(pg)
    await settings(pg, None, debounced)
    check(await pg.input_value('#f-remind') == '5', 'the own interval survives a restart')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


NOTES = "JSON.parse(localStorage.getItem('__notes') || '[]')"
ASK = """([id, pets, productId]) => import('./js/store.js').then(async s => { const x = {id, productId, servedAt: Date.now(), note: '',
  pets: Object.fromEntries(pets.map(p => [p, {r: null, at: null}]))}; s.db.servings.unshift(x); s.save();
  (await import('./js/logic/reminders.js')).planReminder(x); })"""


def household_with_ratings(now):
    rated = [('lachs00001', 'top'), ('lachs00001', 'gut'), ('lachs00001', 'top'), ('lachs00001', 'mittel'), ('lachs00001', 'gut')]
    rated += [('rind000001', 'sosse'), ('rind000001', 'sosse')]
    return {
        'version': 3,
        'pets': [pet('minka00001'), pet('tiger00001', 'Tiger')],
        'products': [product('lachs00001'), product('rind000001', variety='Rind')],
        'servings': [meal(f'altmeal00{i}', pid, now - (i + 1) * 864e5, {'minka00001': r}) for i, (pid, r) in enumerate(rated)],
    }


async def test_reminder_buttons(browser, url):
    print('rating reminder buttons: the levels most given, one open pet only, a button rates, a rated meal opens instead')
    M, T = 'minka00001', 'tiger00001'
    db = household_with_ratings(int(time.time() * 1000))
    ctx, pg, errors = await seeded(browser, url, {'db': db, 'prefs': {'remind': 180}}, native=True)

    async def note(sid):
        await pg.wait_for_function(f"{NOTES}.some(n => n.extra.serving === '{sid}')")
        await idle(pg)
        return next(n for n in await pg.evaluate(NOTES) if n['extra']['serving'] == sid)

    async def reconciled():
        await pg.evaluate("import('./js/logic/reminders.js').then(m => m.syncReminders())")
        await pg.wait_for_timeout(600)
        await idle(pg)

    short = await pg.evaluate("import('./js/config.js').then(c => [c.RATINGS.top.short, c.RATINGS.gut.short])")
    await pg.evaluate(ASK, ['einzeln0001', [M], 'lachs00001'])
    n = await note('einzeln0001')
    calls = [c[0] for c in await pg.evaluate('window.__calls') if c[0] in ('registerActionTypes', 'schedule')]
    types = await pg.evaluate("JSON.parse(localStorage.getItem('__actionTypes') || '[]')")
    check(
        n.get('actionTypeId') == 'rate:top,gut'
        and n['extra'].get('pet') == M
        and 'Minka' in n['body']
        and calls[:2] == ['registerActionTypes', 'schedule']
        and types == [{'id': 'rate:top,gut', 'actions': [{'id': 'top', 'title': short[0]}, {'id': 'gut', 'title': short[1]}]}],
        f'one open pet: buttons for the two levels it gives this variety most, registered before scheduling {n} {types}',
    )
    before = len([c for c in await pg.evaluate('window.__calls') if c[0] == 'schedule'])
    await reconciled()
    after = len([c for c in await pg.evaluate('window.__calls') if c[0] == 'schedule'])
    check(before == after, 'the plugin hands back no actionTypeId, and a reconcile leaves the reminder alone')
    await pg.evaluate("n => window.__tapNote({actionId: 'gut', notification: n})", n)
    await idle(pg)
    told, undo = await pg.inner_text('#toast > span'), await pg.locator('#toast.show [data-action=undo]').count()
    rated = await state(pg, f"db.servings.find(s => s.id === 'einzeln0001').pets['{M}'].r")
    await reconciled()
    check(
        rated == 'gut'
        and undo == 1
        and not await pg.evaluate(OPEN)
        and await pg.locator('.pend[data-id=einzeln0001]').count() == 0
        and not [x for x in await pg.evaluate(NOTES) if x['extra']['serving'] == 'einzeln0001'],
        f'a button rates the meal with a toast to undo, opens nothing, and the reminder goes ({told})',
    )
    await pg.click('#toast [data-action=undo]')
    await idle(pg)
    check(await state(pg, f"db.servings.find(s => s.id === 'einzeln0001').pets['{M}'].r") is None, 'undone like a rating in the app')
    await change(pg, f"s.db.servings.find(x => x.id === 'einzeln0001').pets['{M}'] = {{r: 'top', at: Date.now()}}")
    await pg.evaluate("n => window.__tapNote({actionId: 'gut', notification: n})", n)
    await idle(pg)
    check(
        await pg.evaluate(LEVEL) == [True, 'serving', None, None]
        and await state(pg, f"db.servings.find(s => s.id === 'einzeln0001').pets['{M}'].r") == 'top',
        'rated meanwhile: the button opens the meal and changes nothing',
    )
    await pg.click('#sheet [data-action=close]')
    await idle(pg)
    await pg.evaluate(ASK, ['zusammen01', [M, T], 'lachs00001'])
    both = await note('zusammen01')
    await change(pg, f"s.db.servings.find(x => x.id === 'zusammen01').pets['{T}'] = {{r: 'top', at: Date.now()}}")
    await reconciled()
    left = await note('zusammen01')
    check(
        'actionTypeId' not in both
        and 'pet' not in both['extra']
        and 'Tiger' in both['body']
        and left.get('actionTypeId') == 'rate:top,gut'
        and left['extra'].get('pet') == M
        and 'Tiger' not in left['body'],
        f'two open pets: no buttons; once one is rated, buttons for the other, and the text names only it {both} {left}',
    )
    # a reminder already due that Android has not shown yet, inexact as it is
    due, served = 'ueberfaellig', await pg.evaluate('Date.now() - 181 * 60000')
    nid = 7
    for c in due:
        nid = (nid * 31 + ord(c)) % 2147483647
    await change(
        pg,
        f"s.db.servings.unshift({{id: '{due}', productId: 'lachs00001', servedAt: {served}, note: '', pets: {{{M}: {{r: null, at: null}}, {T}: {{r: null, at: null}}}}}})",
    )
    await pg.evaluate(
        f"""localStorage.setItem('__notes', JSON.stringify([...JSON.parse(localStorage.getItem('__notes')),
      {{id: {nid}, title: 'Wie war’s?', body: 'Lachs für Minka und Tiger', extra: {{serving: '{due}', at: {served + 180 * 60000}}}}}]))"""
    )
    await change(pg, f"s.db.servings.find(x => x.id === '{due}').pets['{T}'] = {{r: 'gut', at: Date.now()}}")
    await reconciled()
    kept = [x['body'] for x in await pg.evaluate(NOTES) if x['id'] == nid]
    await change(pg, f"s.db.servings.find(x => x.id === '{due}').pets['{M}'] = {{r: 'gut', at: Date.now()}}")
    await reconciled()
    check(
        kept == ['Lachs für Minka und Tiger'] and not [x for x in await pg.evaluate(NOTES) if x['id'] == nid],
        f'a reminder already due stays when its text would change, and goes once the meal is rated {kept}',
    )
    await pg.evaluate('window.__noButtons = true')
    await pg.evaluate(ASK, ['rindmeal01', [M], 'rind000001'])
    plain = await note('rindmeal01')
    check('actionTypeId' not in plain and 'pet' not in plain['extra'], f'buttons refused by the plugin: the reminder comes without {plain}')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


NEWS = "import('./js/config.js').then(c => c.NEWS.map(n => 'neu:' + n.v))"
CARD = '[data-sec=news]'


async def test_news(browser, url):
    print('news after an update: never on a new phone or with sample data, hidden for good, gone once the novelty is used')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    keys = await pg.evaluate(NEWS)
    await tap(pg, '.welcome [data-action=add-pet]')
    await pg.fill('#f-name', 'Minka')
    await tap(pg, '[data-action=save-pet]')
    await pg.reload()
    await started(pg)
    hidden = await state(pg, 'prefs.hiddenHints')
    check(keys and all(k in hidden for k in keys) and await pg.locator(CARD).count() == 0, f'a new phone has seen all news {hidden}')
    await ctx.close()

    ctx, pg, errors = await seeded(browser, url, {'db': SAVED}, native=True)
    check(await pg.locator(CARD).count() == 1, 'an update with own pets brings the newest news')
    await tap(pg, f'{CARD} [data-action=open-pet]')
    check(await pg.evaluate(LEVEL) == [True, 'pet', None, None], 'the card leads to where the novelty is')
    await tap(pg, '#sheet [data-action=close]')
    await tap(pg, f'{CARD} [data-action=hide-hint]')
    await pg.reload()
    await started(pg)
    check(await pg.locator(CARD).count() == 0, 'hidden, also after a restart')
    await ctx.close()

    many = [*keys, 'tipp:beobachtung', *[f'appetit:lxpet00001:2025-{d // 28 + 1:02d}-{d % 28 + 1:02d}' for d in range(330)]]
    ctx, pg, errors = await seeded(browser, url, {'db': SAVED, 'prefs': {'hiddenHints': many}}, native=True)
    kept = await state(pg, 'prefs.hiddenHints')
    check(
        await pg.locator(CARD).count() == 0 and len(kept) == 300 + len(keys) + 1 and all(k in kept for k in [*keys, 'tipp:beobachtung']),
        'many hidden hints: the oldest go, what is said once stays',
    )
    await ctx.close()

    demo = {**SAVED, 'pets': [pet('demopet0001', 'Mau')], 'servings': [{**x, 'pets': {'demopet0001': {'r': 'gut'}}} for x in SAVED['servings']]}
    ctx, pg, errors = await seeded(browser, url, {'db': demo}, native=True)
    check(await pg.locator(CARD).count() == 0, 'only sample data: no news')
    await ctx.close()

    ctx, pg, errors = await seeded(browser, url, {'db': SAVED}, native=True)
    shown = await pg.locator(CARD).count() == 1
    await tap(pg, f'{CARD} [data-action=open-pet]')
    await pg.fill('#f-nick', 'Mimi')
    await tap(pg, '[data-action=save-pet]')
    check(shown and await pg.locator(CARD).count() == 0, 'a nickname saved: the news has done its job')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_feed_remind(browser, url):
    print('feeding reminder: the usual times handed to our own plugin, with the server when connected')
    ctx, pg, errors = await one_pet(browser, url, timezone_id='Europe/Berlin')
    await pg.clock.set_fixed_time('2026-06-10T12:00:00+02:00')
    SET = "JSON.parse(localStorage.getItem('__feed') || '{\"reminders\": []}')"
    PLAN = f"(() => {{ const t = x => new Date(x).toLocaleString('sv').slice(5, 16); return {SET}.reminders.map(r => [r.key, t(r.at), t(r.since)]).sort(); }})()"
    # feeding reminders belong to our plugin: one left in LocalNotifications goes
    await pg.evaluate("localStorage.setItem('__notes', JSON.stringify([{id: 99, title: 'x', body: 'alt', extra: {feed: '2026-06-10|1110', at: 1}}]))")
    when = [at(f'2026-06-{d:02d}T{t}') for d in range(3, 10) for t in ('07:15', '18:30')]
    await load(
        pg,
        [pet(M)],
        [product('nass000001'), product('snack000001', variety='Käse', type='Snack')],
        [meal(f'meal{i:04d}', 'nass000001', w, {M: 'gut'}) for i, w in enumerate(when)],
    )
    await settings(pg)
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=feed-remind]')
    await debounced(pg)
    denied = [await state(pg, 'prefs.feedRemind'), await pg.evaluate(PLAN)]
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'granted'); localStorage.setItem('__notifyPermission', 'prompt')")
    await pg.click('[data-action=feed-remind]')
    await debounced(pg)
    check(denied == [False, []] and await state(pg, 'prefs.feedRemind') is True, 'needs the permission, on once granted')
    handed, plan = await pg.evaluate(SET), await pg.evaluate(PLAN)
    slots = {'1110': ['19:15', '17:30'], '435': ['08:00', '06:15']}
    check(
        plan[:5]
        == [
            ['2026-06-10|1110', '06-10 19:15', '06-10 17:30'],
            ['2026-06-11|1110', '06-11 19:15', '06-11 17:30'],
            ['2026-06-11|435', '06-11 08:00', '06-11 06:15'],
            ['2026-06-12|1110', '06-12 19:15', '06-12 17:30'],
            ['2026-06-12|435', '06-12 08:00', '06-12 06:15'],
        ]
        and all([a[6:], s[6:]] == slots[k.split('|')[1]] for k, a, s in plan)
        and 'server' not in handed
        and 'code' not in handed
        and await pg.evaluate("JSON.parse(localStorage.getItem('__notes') || '[]').filter(n => n.extra?.feed).length") == 0,
        f'one per usual time and day, 45 minutes late, from an hour before, none for this morning; no server alone; the old one is gone {len(plan)}',
    )
    await back(pg)
    SYNC = "c => import('./js/store.js').then(async s => { Object.assign(s.prefs, c); (await import('./js/logic/reminders.js')).syncReminders(); })"
    await pg.evaluate(SYNC, {'code': 'K7PM-3QXD', 'server': 'http://192.168.178.20:8486'})
    await pg.wait_for_function("JSON.parse(localStorage.getItem('__feed')).code === 'K7PM-3QXD'")
    house = await pg.evaluate(SET)
    await pg.evaluate(SYNC, {'code': '', 'server': ''})
    await pg.wait_for_function("!('server' in JSON.parse(localStorage.getItem('__feed')))")
    check(
        [house['server'], house['code'], len(house['reminders'])] == ['http://192.168.178.20:8486', 'K7PM-3QXD', len(plan)],
        'server and code handed over while connected',
    )
    await pg.clock.set_fixed_time('2026-06-10T18:00:00+02:00')
    await pg.evaluate("import('./js/logic/feeding.js').then(f => f.serveProduct('snack000001'))")
    await debounced(pg)
    snack = [len(await pg.evaluate(PLAN)), await pg.evaluate(f'{SET}.dismiss.length')]
    await pg.evaluate("import('./js/logic/feeding.js').then(f => f.serveProduct('nass000001'))")
    await debounced(pg)
    check(
        snack == [len(plan), 0]
        and [x[0] for x in await pg.evaluate(PLAN)] == [x[0] for x in plan[1:]]
        and await pg.evaluate(f'{SET}.dismiss.length') == 2,
        f'a treat changes nothing; a meal at the usual time drops today’s and dismisses shown ones {snack}',
    )
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://feed'})")
    await idle(pg)
    check(await pg.evaluate(LEVEL) == [True, 'feed', None, None], 'its tap opens the feeding sheet through schmeckts://feed')
    await tap(pg, '[data-action=close]')
    await settings(pg)
    await pg.click('[data-action=feed-remind]')
    await debounced(pg)
    check(await pg.evaluate(PLAN) == [] and await state(pg, 'prefs.feedRemind') is False, 'off: the plugin holds none')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_petbar(browser, url):
    print('the pet bar only from two pets on, and it filters')
    ctx, pg, errors = await demo(browser, url)
    check(await pg.locator('#pets').is_hidden() and await pg.locator('#pets *').count() == 0, 'one pet: no pet bar')
    await settings(pg)
    await tap(pg, '#sheet [data-action=add-pet]')
    await pg.fill('#f-name', 'Tiger')
    await tap(pg, '[data-action=save-pet]')
    await back(pg)
    ids = await state(pg, 'db.pets.map(p => p.id)')
    bar = await pg.eval_on_selector_all('#pets [data-action=filter]', 'l => l.map(b => [b.dataset.id, b.getAttribute("aria-pressed")])')
    check(await pg.locator('#pets').is_visible() and bar == [['all', 'true'], [ids[0], 'false'], [ids[1], 'false']], f'two pets: the bar {bar}')
    await tap(pg, f'#pets [data-id="{ids[0]}"]')
    check(await state(pg, 'prefs.activePet') == ids[0], 'the bar filters')
    await pg.evaluate(
        "import('./js/logic/pets.js').then(async p => { (await import('./js/ui/sheet.js')).openSheet({kind: 'pet', id: (await import('./js/store.js')).db.pets[1].id}); p.deletePet(); })"
    )
    await idle(pg)
    check(await pg.locator('#pets').is_hidden(), 'back to one pet: no bar')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_nicknames(browser, url):
    print('nicknames: added with Enter or the button, each once, a typed one kept on saving; the home card uses them in turn')
    ctx, pg, errors = await one_pet(browser, url, native=False)
    NICKS = "[...document.querySelectorAll('#nicks .chip')].map(c => c.textContent)"
    stored = 'db.pets[0].nicknames ?? null'
    await settings(pg)
    await tap(pg, '#sheet [data-action=edit-pet]')
    for name in ('Mimi', 'mimi', 'Minka'):
        await pg.fill('#f-nick', name)
        await pg.press('#f-nick', 'Enter')
    focused = await pg.evaluate('document.activeElement?.id ?? null')
    await pg.fill('#f-nick', 'Schnurrli')
    await tap(pg, '#sheet [data-action=add-nick]')
    chips = await pg.evaluate(NICKS)
    await pg.fill('#f-nick', 'Minki')
    await tap(pg, '[data-action=save-pet]')
    check(
        chips == ['Mimi', 'Schnurrli'] and await state(pg, stored) == ['Mimi', 'Schnurrli', 'Minki'],
        f'each name once, never the pet’s own, one typed but not added comes along {chips}',
    )
    check(focused == 'f-nick', 'Enter keeps the field and its keyboard')
    await tap(pg, '#sheet [data-action=edit-pet]')
    await tap(pg, '#nicks [data-action=drop-nick][data-v=Schnurrli]')
    await tap(pg, '[data-action=save-pet]')
    check(await state(pg, stored) == ['Mimi', 'Minki'], 'a tap on one removes it')
    await back(pg)
    await change(
        pg,
        "s.db.products.push({id: 'sorte00001', brand: 'Sheba', variety: 'Lachs', type: 'Nassfutter', codes: {}, createdAt: 1}); s.db.servings.unshift({id: 'meal000001', productId: 'sorte00001', servedAt: Date.parse('2026-05-31T08:00:00+02:00'), note: '', pets: {[s.db.pets[0].id]: {r: 'gut', at: 1}}})",
    )
    await fixed_clock(ctx)
    heads = []
    for day in range(1, 8):
        await pg.clock.set_fixed_time(f'2026-06-{day:02d}T12:00:00+02:00')
        await pg.evaluate("import('./js/views/home.js').then(h => h.renderHome())")
        heads.append(await pg.inner_text('.overview h2'))
    check(
        all(any(n in h for n in ('Minka', 'Mimi', 'Minki')) for h in heads) and any('Mimi' in h or 'Minki' in h for h in heads),
        f'the heading names the pet each day, now and then by a nickname {heads}',
    )
    await settings(pg)
    await tap(pg, '#sheet [data-action=edit-pet]')
    for name in ('Mimi', 'Minki'):
        await tap(pg, f'#nicks [data-action=drop-nick][data-v={name}]')
    await tap(pg, '[data-action=save-pet]')
    check(await state(pg, "!('nicknames' in db.pets[0])"), 'all removed: the field goes')
    check(not errors, f'no errors {errors}')
    await ctx.close()


async def test_birthday(browser, url):
    print('birthday in the pet editor: none in the future, saved, cleared')
    ctx, pg, errors = await one_pet(browser, url, timezone_id='Europe/Berlin')
    await pg.clock.set_fixed_time('2026-06-09T12:00:00+02:00')
    await settings(pg)
    await tap(pg, '#sheet [data-action=add-pet]')
    await pg.fill('#f-name', 'Tiger')
    await pg.fill('#f-birthday', '2027-01-01')
    await tap(pg, '[data-action=save-pet]')
    check(
        await pg.input_value('#f-birthday') == '2027-01-01'
        and await pg.evaluate('document.activeElement.id') == 'f-birthday'
        and await state(pg, 'db.pets.length') == 1,
        'a future date is refused: the editor stays, the field focused, nothing saved',
    )
    await pg.fill('#f-birthday', '2022-06-12')
    await tap(pg, '[data-action=save-pet]')
    saved = await state(pg, 'db.pets.map(p => [p.name, p.birthday ?? null])')
    check(saved == [['Minka', None], ['Tiger', '2022-06-12']], f'a past date is saved {saved}')
    tiger = await state(pg, 'db.pets[1].id')
    await tap(pg, f'#sheet [data-action=edit-pet][data-id="{tiger}"]')
    await pg.fill('#f-birthday', '')
    await tap(pg, '[data-action=save-pet]')
    check(await state(pg, "db.pets.map(p => 'birthday' in p)") == [False, False], 'cleared: the field is dropped')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


SERVER_WORDS = re.compile(r'server|abgleich|abgeglichen|erkennung|erkannt|erkenn(en|t)\b')
TEXTS = """[document.body.innerText, ...[...document.querySelectorAll('[placeholder], [aria-label], [title]')]
  .map(e => [e.placeholder, e.getAttribute('aria-label'), e.title].join(' '))].join('\\n').toLowerCase()"""


async def test_local(browser, url):
    print('on its own: no trace of a server, no request beyond the app, connecting needs an address')
    ctx = await phone(browser)
    requests = []
    ctx.on('request', lambda r: requests.append(r.url))
    pg, errors = await open_page(ctx, url, native=True)
    welcome = await pg.eval_on_selector_all('.welcome [data-action]', 'l => l.map(b => b.dataset.action)')
    check(welcome == ['add-pet', 'demo'] and await pg.locator('#fab').is_hidden(), f'first start: a first pet or the demo data {welcome}')
    seen = [await pg.evaluate(TEXTS)]
    await tap(pg, '.welcome [data-action=add-pet]')
    await pg.fill('#f-name', 'Minka')
    await tap(pg, '[data-action=save-pet]')
    seen.append(await pg.evaluate(TEXTS))
    await settings(pg)
    seen.append(await pg.evaluate(TEXTS))
    await back(pg)
    await snap(pg)
    seen.append(await pg.evaluate(TEXTS))
    await tap(pg, '#sheet [data-action=close]')
    seen.append(await pg.evaluate(TEXTS))
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = '{b64()}'")
    await tap(pg, '#fab')
    seen.append(await pg.evaluate(TEXTS))
    await pg.click('[data-action=scan]')
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    seen.append(await pg.evaluate(TEXTS))
    await tap(pg, '#sheet [data-action=close]')
    found = sorted({m.group(0) for t in seen for m in SERVER_WORDS.finditer(t)})
    check(not found and await pg.locator('#syncChip').is_hidden(), f'no word of a server, sync or recognition anywhere {found}')
    foreign = [r for r in requests if not r.startswith((url.rsplit('/', 1)[0], 'data:', 'blob:'))]
    check(len(requests) > 20 and not foreign and await state(pg, '!prefs.lookup'), f'not one request beyond the app itself {foreign[:3]}')
    await settings(pg, 'backup')
    await tap(pg, '[data-action=export]')
    await tap(pg, '[data-action=export]')
    gone = [c['path'] for c in await calls(pg, 'deleteFile') if c['directory'] == 'CACHE' and c['path'].startswith('schmeckts-backup-')]
    check(len(gone) == 1, f'a shared backup is deleted from the cache before the next export {gone}')
    await back(pg)
    await settings_page(pg, 'house')
    await tap(pg, '#serverBox [data-action=connect-form]')
    await pg.fill('#f-code', 'K7PM3QXD')
    await tap(pg, '[data-action=connect]')
    check(await pg.locator('#serverBox .note.warn').count() == 1 and await state(pg, "prefs.code === ''"), 'no address: refused')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


OK_ADDRESSES = (
    'http://10.0.0.1:8486 10.255.255.255 http://172.16.0.1 http://172.31.255.254:8486 192.168.178.65:8486 http://192.168.0.1/ http://100.64.0.1 '
    'http://100.127.255.255 http://127.0.0.1:8486 http://127.8.9.10 http://localhost:8486 LOCALHOST http://minipc.local:8486 http://MiniPC.Local '
    'http://server.home.arpa http://a.b.home.arpa:8486 http://[fc00::1]:8486 http://[fd12:3456:789a::1] http://[fdff:ffff::1] http://[fe80::1]:8486 '
    'http://[febf::1] http://3232235777 https://example.com https://8.8.8.8:8486 https://[2001:db8::1] https://172.32.0.1'
).split()
BAD_ADDRESSES = (
    'http://9.255.255.255 http://11.0.0.1 http://172.15.255.255:8486 http://172.32.0.1:8486 http://192.167.1.1 http://192.169.1.1 http://100.63.255.255 '
    'http://100.128.0.1 http://126.0.0.1 http://128.0.0.1 http://8.8.8.8 example.com http://example.com:8486 http://local http://notlocal '
    'http://evil-local http://home.arpa http://xhome.arpa http://minipc.local.example.com http://localhost.example.com http://[2001:db8::1]:8486 '
    'http://[2a02:8109::1] http://[fbff::1] http://[fe00::1] http://[fec0::1] http://[::1] http://[::ffff:192.168.1.1] http://[fc] http://10.0.0.1.example.com'
).split()


async def test_network(browser, url):
    print('network rule: http on the home network only, https elsewhere, for every request')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    got = await pg.evaluate(
        """([ok, bad]) => import('./js/api.js').then(a => { const run = v => { try { return a.normServer(v); } catch (e) { return 'error ' + e.kind; } };
          return [ok.map(run), bad.map(run), run(''), run('  192.168.1.20:8486// ')]; })""",
        [OK_ADDRESSES, BAD_ADDRESSES],
    )
    check(not [a for a, v in zip(OK_ADDRESSES, got[0]) if not v.startswith('http')], f'allowed: http at home, https anywhere {got[0]}')
    check(set(got[1]) == {'error input'}, f'refused: http outside the home network, near misses too {got[1]}')
    check(got[2:] == ['', 'http://192.168.1.20:8486'], f'empty stays empty, http when none is given {got[2:]}')
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if '/api/' in r.url else None)
    await settings(pg, 'house')
    await tap(pg, '#serverBox [data-action=connect-form]')
    await pg.fill('#f-server', 'http://schmeckts.example.com:8486')
    await pg.fill('#f-code', 'K7PM-3QXD')
    await tap(pg, '[data-action=connect]')
    check(
        await pg.locator('#serverBox .note.warn').count() == 1 and not asked and await state(pg, "prefs.code === ''"),
        'http outside: refused, no request',
    )
    await ctx.close()
    prefs = {'server': 'http://93.184.216.34:8486', 'code': 'K7PM-3QXD'}
    ctx, pg, errors = await seeded(browser, url, {'prefs': prefs, 'db': {'version': 3, 'pets': [], 'products': [], 'servings': []}}, native=True)
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if '/api/' in r.url else None)
    res = await pg.evaluate("""Promise.all([import('./js/api.js'), import('./js/sync.js')]).then(async ([a, s]) => { const out = [];
      for (const run of [() => a.request('GET', '/api/info'), () => a.request('POST', '/api/push', {body: {}}), () => s.retrySync().then(() => { throw s.status; })])
        out.push(await run().then(() => 'sent', e => e.kind));
      return out; })""")
    check(res == ['input'] * 3 and not asked, f'a stored outside address is refused for every request {res} {asked}')
    await ctx.close()


async def test_scan(browser, url):
    print('scanning without a server: unknown code to the photo, known one served, multipacks, removing codes, scanner module, deep links')
    ctx, pg, errors = await one_pet(browser, url)
    await tap(pg, '#fab')
    await tap(pg, '[data-action=scan]')
    check(await calls(pg, 'scan') == [{'formats': ['EAN_13', 'EAN_8', 'UPC_A']}], 'scan() only, EAN-13, EAN-8, UPC-A')
    check(await pg.evaluate(LEVEL) == [True, 'feed', None, None] and await state(pg, 'db.servings.length') == 0, 'cancelled: nothing stored')
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = '{b64()}'")
    await pg.click('[data-action=scan]')
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    cam = await calls(pg, 'capture')
    check(
        len(cam) == 1
        and bool(cam[0] and cam[0].get('hint'))
        and await state(pg, f"db.servings.length === 1 && db.servings[0].scanCode === '{SHEBA}' && db.servings[0].status === 'noserver'"),
        'unknown code: straight to the camera with a hint, the photo served with the code, on to naming',
    )
    check(
        await pg.evaluate(
            "Promise.all([import('./js/fields.js'), import('./js/store.js')]).then(([f, m]) => !Object.keys(f.fieldsOf('servings', m.db.servings[0])).some(k => k.startsWith('scan')))"
        ),
        'scanCode is never synced',
    )
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs in Soße')
    await tap(pg, '[data-action=save-name]')
    check(await state(pg, f"db.products.length === 1 && db.products[0].codes['{SHEBA}'] === true"), 'named: the code hangs on the variety')
    await tap(pg, '[data-action=close]')
    sheba = await state(pg, 'db.products[0].id')
    await tap(pg, '#fab')
    await tap(pg, '[data-action=scan]')
    check(
        await state(pg, f"db.servings.length === 2 && db.servings[0].productId === '{sheba}' && db.servings[0].scanCode === '{SHEBA}'")
        and not await pg.evaluate(OPEN)
        and await pg.locator('#toast.show [data-action=undo]').count() == 1,
        'known code: served at once, with undo',
    )
    await tap(pg, '#toast [data-action=undo]')
    check(await state(pg, 'db.servings.length === 1 && db.products.length === 1'), 'undo takes the meal back, the variety stays')
    await tap(pg, '#fab')
    await tap(pg, '[data-action=scan]')
    await pg.locator('.pend-head').first.click()
    await idle(pg)
    await tap(pg, '[data-action=edit-name]')
    await pg.fill('#f-variety', 'Huhn in Gelee')
    await tap(pg, '[data-action=save-name]')
    check(await state(pg, f"db.products.length === 2 && db.products.every(p => p.codes['{SHEBA}'])"), 'changed to another variety: code on both')
    await tap(pg, '[data-action=close]')
    huhn = await state(pg, "db.products.find(p => p.variety === 'Huhn in Gelee').id")
    n = await state(pg, 'db.servings.length')
    await tap(pg, '#fab')
    await tap(pg, '[data-action=scan]')
    check(await pg.evaluate(OPEN) and await pg.locator('#sheet .plist [data-action=serve]').count() == 2, 'several hits: a choice of those two')
    await tap(pg, f'#sheet [data-action=serve][data-id="{huhn}"]')
    check(
        await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}' && db.servings[0].scanCode === '{SHEBA}'")
        and not await pg.evaluate(OPEN),
        'the chosen one is served',
    )
    await open_sheet(pg, kind='product', id=sheba)
    REMOVE = f'#sheet [data-action=remove-code][data-code="{SHEBA}"]'
    has = await pg.locator(REMOVE).count()
    await tap(pg, REMOVE)
    removed = [await state(pg, f"!db.products.find(p => p.id === '{sheba}').codes['{SHEBA}']"), await pg.locator(REMOVE).count()]
    await tap(pg, '#toast [data-action=undo]')
    check(
        has == 1 and removed == [True, 0] and await state(pg, f"db.products.find(p => p.id === '{sheba}').codes['{SHEBA}'] === true"),
        'code removed, undo restores it',
    )
    await tap(pg, REMOVE)
    await tap(pg, '[data-action=close]')
    n = await state(pg, 'db.servings.length')
    await tap(pg, '#fab')
    await tap(pg, '[data-action=scan]')
    check(
        await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}'") and not await pg.evaluate(OPEN),
        'one left: served',
    )
    await pg.evaluate(f"window.__barcode = '{UPC}'; window.__photo = null")
    await tap(pg, '#fab')
    await tap(pg, '[data-action=scan]')
    check(
        await pg.evaluate(LEVEL) == [True, 'feed', None, None] and await state(pg, f'db.servings.length === {n + 1}'),
        'camera cancelled: sheet stays',
    )
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__scanModule = false")
    await pg.click('[data-action=scan]')
    await until(pg, f'db.servings.length === {n + 2}')
    await idle(pg)
    check(
        ['installModule', None] in await pg.evaluate('window.__calls')
        and not await pg.evaluate(OPEN)
        and await state(pg, f"db.servings[0].productId === '{huhn}'"),
        'scanner module missing: installed, then scanned',
    )
    await pg.evaluate("window.__scanError = 'Play-Dienste fehlen'")
    await tap(pg, '#fab')
    await tap(pg, '[data-action=scan]')
    check(
        await pg.evaluate(LEVEL) == [True, 'feed', None, None]
        and await pg.locator('#toast.show').count() == 1
        and await state(pg, f'db.servings.length === {n + 2}'),
        'scanner broken: a toast, the sheet stays',
    )
    await pg.evaluate('window.__scanError = null')
    await tap(pg, '[data-action=close]')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})")
    await until(pg, f'db.servings.length === {n + 3}')
    await idle(pg)
    check(await state(pg, f"db.servings[0].productId === '{huhn}'"), 'schmeckts://scan while running: scanned and served')
    await pg.evaluate('window.__barcode = null')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})")
    await idle(pg)
    check(await pg.evaluate(LEVEL) == [True, 'feed', None, None], 'schmeckts://scan cancelled: the feeding sheet stays')
    await pg.evaluate(f"sessionStorage.setItem('__launchUrl', 'schmeckts://scan'); sessionStorage.setItem('__code', '{SHEBA}')")
    await pg.add_init_script("if (sessionStorage.getItem('__code')) window.__barcode = sessionStorage.getItem('__code');")
    await pg.reload()
    await started(pg)
    check(await until(pg, f"db.servings.length === {n + 4} && db.servings[0].productId === '{huhn}'"), 'cold start with schmeckts://scan')
    await pg.evaluate('sessionStorage.clear()')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


OFF_HIT = {
    'status': 1,
    'product': {
        'product_name_de': 'Sheba Fresh Choice Huhn in Sauce 4x50g',
        'brands': 'Sheba, Mars',
        'categories_tags': ['en:cat-food', 'en:wet-cat-food'],
    },
}


async def test_recognize(browser, url):
    print('recognition chain: known code, product lookup, server photo, text read on the phone')
    fail, seen = {'online': False}, {'online': 0}

    async def off_route(route, request):  # Open Pet Food Facts and Open Food Facts
        seen['online'] += 1
        if fail['online']:
            return await route.fulfill(status=500, headers={'access-control-allow-origin': '*'}, body='')
        found = 'openpetfoodfacts' in request.url and SHEBA in request.url
        await route.fulfill(
            status=200,
            content_type='application/json',
            headers={'access-control-allow-origin': '*'},
            body=json.dumps(OFF_HIT if found else {'status': 0}),
        )

    ctx, pg, errors = await one_pet(browser, url)
    for pattern in ('https://world.openpetfoodfacts.org/**', 'https://world.openfoodfacts.org/**'):
        await ctx.route(pattern, off_route)
    await household(ctx, fail)

    async def ident(**kw):
        return await pg.evaluate("o => import('./js/recognize.js').then(r => r.identify(o))", kw)

    async def setp(**kw):
        await pg.evaluate("p => import('./js/store.js').then(m => { Object.assign(m.prefs, p); })", kw)

    async def dump():  # schmeckts://ocr-dump shares the last reading as a fixture
        before = len(await pg.evaluate('window.__calls'))
        await pg.evaluate("window.__urlOpen({url: 'schmeckts://ocr-dump'})")
        await idle(pg)
        shared = [c[1] for c in (await pg.evaluate('window.__calls'))[before:] if c[0] == 'share']
        name = shared[0]['files'][0].split('/')[-1] if shared else ''
        return json.loads(await pg.evaluate(f"localStorage.getItem('__fs:{name}')") or 'null')

    check(await dump() is None, 'ocr-dump before any reading: nothing shared')
    text = 'Sheba\nNEU\nSelection in Sauce\nmit Lachs\n4 x 85 g\nZutaten: Fleisch 40 %'
    await pg.evaluate(f'window.__ocrText = {json.dumps(text)}')
    await snap(pg, done='!!db.servings[0]?.guess')
    filled = await pg.evaluate(
        "[document.getElementById('f-brand').value, document.getElementById('f-variety').value, document.querySelector('[data-action=set-type][aria-pressed=true]')?.dataset.v]"
    )
    cache = [[c['path'] for c in await calls(pg, name) if c['directory'] == 'CACHE'] for name in ('writeFile', 'deleteFile')]
    check(
        filled == ['Sheba', 'Selection in Sauce mit Lachs', 'Nassfutter']
        and len(await calls(pg, 'processImage')) == 1
        and len(cache[0]) == 1
        and cache[0] == cache[1]
        and await state(pg, '(s => [s.status, s.error ?? null])(db.servings[0])') == ['noserver', None],
        f'without a server the phone reads the text and fills brand, variety and type, the photo file it read goes again {filled} {cache}',
    )
    await tap(pg, '[data-action=save-name]')
    await tap(pg, '[data-action=close]')
    p = await state(pg, '(p => [p.brand, p.variety, p.type, p.texture])(db.products[0])')
    check(
        p == ['Sheba', 'Selection in Sauce mit Lachs', 'Nassfutter', 'sosse'] and not await state(pg, 'db.servings[0].guess'),
        f'confirmed: variety with texture {p}',
    )
    fixture = await dump()
    want = {'brand': 'Sheba', 'variety': 'Selection in Sauce mit Lachs', 'type': 'Nassfutter', 'texture': 'sosse', 'locked': False}
    check(
        [fixture['width'], fixture['height']] == [480, 360]
        and fixture['result'] == {'text': text, 'blocks': []}
        and {k: fixture['expected'].get(k) for k in want} == want
        and fixture['ms'] >= 0,
        'ocr-dump: the last reading with the photo size and what it was named',
    )
    check('Zutaten: Fleisch' not in await state(pg, 'JSON.stringify([db, prefs, queue])'), 'the reading lives in memory only')
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    before = await pg.evaluate("import('./js/recognize.js').then(r => r.lastReading().at)")
    await tap(pg, '#fab')
    await pg.set_input_files('#camInputSheet', str(PACK_LARGE))
    await until(pg, f"import('./js/recognize.js').then(r => r.lastReading().at > {before})")
    await idle(pg)
    sizes = await pg.evaluate(
        """Promise.all([import('./js/recognize.js'), import('./js/images.js'), import('./js/store.js'), import('./js/reading.js')])
          .then(([r, i, s, g]) => { const meal = s.db.servings[0], wh = x => [x.width, x.height];
            return [wh(r.lastReading()), wh(g.jpegSize(i.memPhotos.get(meal.id))), wh(g.jpegSize(meal.photo.split(',')[1]))]; })"""
    )
    check(sizes == [[2400, 1800], [1100, 825], [480, 360]], f'a large photo is read at 2400 px, kept at 1100 and 480 {sizes}')
    await tap(pg, '[data-action=close]')
    await pg.evaluate("window.__ocrText = 'SHEBA  selection-in-sauce mit LACHS 85g'")
    got = await ident(photo='AAA')
    check(
        got['source'] == 'text'
        and [p['variety'] for p in got.get('products', [])] == ['Selection in Sauce mit Lachs']
        and 'details' not in got
        and got['lines'],
        f'a known variety found in the text, spelled differently: the variety itself {got}',
    )
    await pg.evaluate("window.__ocrText = '12345\\n850 g'")
    got = await ident(photo='AAA')
    check(got['source'] == '' and not got.get('details'), 'no usable text: nothing')
    await pg.evaluate("window.__ocrText = ''")
    got = await ident(code=SHEBA)
    check(got['source'] == '' and seen['online'] == 0, 'product lookup off: no request')
    await setp(lookup=True)
    got = await ident(code=SHEBA)
    hit = got.get('details') or {}
    check(
        got['source'] == 'online'
        and [hit.get(k) for k in ('brand', 'variety', 'type', 'animal')] == ['Sheba', 'Fresh Choice Huhn in Sauce', 'Nassfutter', 'Katze']
        and (await state(pg, f"prefs.codes['{SHEBA}']"))['found'] is True,
        f'product lookup on: brand and variety tidied {hit}',
    )
    before = seen['online']
    await ident(code=SHEBA)
    miss = await ident(code='96385074')
    check(
        seen['online'] == before + 2 and miss['source'] == '' and (await state(pg, "prefs.codes['96385074']"))['found'] is False,
        'hit and miss remembered',
    )
    await setp(lookup=False)
    await connect(pg)
    got = await ident(photo='AAA')
    check(got['source'] == 'server' and got['details']['variety'] == 'Gold Pastete', 'connected: the server recognises the photo')
    await settings(pg)
    switch = await pg.get_attribute('#sheet [data-action=server-photo]', 'aria-checked')
    await tap(pg, '#sheet [data-action=server-photo]')
    await back(pg)
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    got = await ident(photo='AAA')
    check(switch == 'true' and await state(pg, 'prefs.serverPhoto') is False and got['source'] == 'text', 'server photos off: read on the phone')
    await setp(serverPhoto=True, lookup=True)
    chain = [(await ident(code=SHEBA, photo='AAA'))['source']]
    fail['online'] = True
    chain.append((await ident(code='96385074', photo='AAA'))['source'])
    fail['server'] = True
    chain.append((await ident(code='96385074', photo='AAA'))['source'])
    await pg.evaluate("window.__ocrText = ''")
    chain.append((await ident(code='96385074', photo='AAA'))['source'])
    check(chain == ['online', 'server', 'text', ''], f'each stage works and falls through to the next {chain}')
    await pg.evaluate(f"import('./js/store.js').then(m => {{ m.db.products[0].codes = {{'{SHEBA}': true}}; }})")
    check((await ident(code=SHEBA, photo='AAA'))['source'] == 'codes', 'a code known in the household beats everything')
    await setp(code='', server='', lookup=False)
    check(not real_errors(errors), f'no errors {real_errors(errors)[:2]}')
    await ctx.close()


async def test_text_thumb(browser, url):
    print('a packaging photo read on the phone: the thumbnail shows the square around the text, the middle without places')
    ctx, pg, errors = await one_pet(browser, url)
    # the test photo is orange with a cream label in its middle; a corner of the thumbnail shows either
    CORNERS = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]

    async def corners():
        got = await pg.evaluate(PIXEL, [await state(pg, 'db.servings[0].thumb'), CORNERS])
        return [got['w'], ['cream' if p != 'red' and int(p.split(',')[1]) > 180 else 'orange' for p in got['px']]]

    await pg.evaluate("window.__ocrText = 'Sheba\\nHuhn in Gelee'")
    await snap(pg, done='!!db.servings[0]?.guess')
    middle = await corners()
    await tap(pg, '[data-action=close]')
    # in the top left of the label, in the pixels of the large photo as it is read (2400 x 1800)
    lines = [('Whiskas', 350, 500, 1000, 650), ('Rind in Gelee', 350, 700, 1250, 850)]
    blocks = [{'lines': [{'text': t, 'boundingBox': {'left': x0, 'top': y0, 'right': x1, 'bottom': y1}}]} for t, x0, y0, x1, y1 in lines]
    await pg.evaluate('r => { window.__ocrResult = r; }', {'text': 'Whiskas\nRind in Gelee', 'blocks': blocks})
    await snap(pg, PACK_LARGE, done='db.servings.length === 2 && !!db.servings[0].guess')  # the new meal, not the first one
    moved = await corners()
    check(
        middle == [200, ['orange'] * 4] and moved == [200, ['orange', 'orange', 'cream', 'cream']],
        f'read without places: the middle; with them: up and to the left, where the text stands {middle} {moved}',
    )
    thumb = await state(pg, 'db.servings[0].thumb')
    await tap(pg, '[data-action=save-name]')
    check(await state(pg, "db.products.find(p => p.brand === 'Whiskas')?.thumb") == thumb, 'the variety named from it has that thumbnail')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_discard(browser, url):
    print('a meal broken off after the photo: deleted from naming or its card, with undo, also while it is read')
    ctx, pg, errors = await one_pet(browser, url)
    await snap(pg)
    await tap(pg, '#sheet [data-action=delete-serving]')
    gone = [await pg.evaluate(OPEN), await state(pg, 'db.servings.length'), await pg.locator('.pend').count()]
    await tap(pg, '#toast [data-action=undo]')
    back_ = await state(pg, '(s => [db.servings.length, s.productId ?? null, s.status, !!s.photo, !!s.thumb])(db.servings[0])')
    check(gone == [False, 0, 0] and back_ == [1, None, 'noserver', True, True], f'deleted from naming; undo restores it {back_}')
    await tap(pg, '.pend [data-action=delete-serving]')
    gone = [await state(pg, 'db.servings.length'), await pg.locator('.pend').count()]
    await tap(pg, '#toast [data-action=undo]')
    check(
        gone == [0, 0] and await state(pg, 'db.servings.length') == 1 and await pg.locator('.pend .slider').count() == 1,
        'deleted from its card, undone',
    )
    await tap(pg, '.pend-head')
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs')
    await tap(pg, '[data-action=save-name]')
    await tap(pg, '#sheet [data-action=close]')
    before = await state(pg, '[db.products.length, db.servings.length]')
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = '{b64()}'")
    await tap(pg, '#fab')
    await pg.click('#sheet [data-action=scan]')
    await until(pg, "db.servings[0]?.scanCode && db.servings[0].status === 'noserver'")
    await idle(pg)
    await tap(pg, '#sheet [data-action=delete-serving]')
    after = await state(pg, f"[db.products.length, db.servings.length, db.products.some(p => p.codes?.['{SHEBA}'])]")
    check(after == before + [False], f'deleted after an unknown code: no variety got the code {after}')
    reads = len(await calls(pg, 'processImage'))
    await pg.evaluate(HOLD, '')
    await snap(pg, done="db.servings[0]?.status === 'reading'")
    await tap(pg, '#sheet [data-action=close]')
    await tap(pg, '.pend [data-action=delete-serving]')
    await pg.evaluate('(window.__release(), new Promise(r => setTimeout(r, 200)))')
    await tap(pg, '#toast [data-action=undo]')
    check(
        await until(pg, "db.servings[0]?.status === 'noserver'", 5) and len(await calls(pg, 'processImage')) == reads + 2,
        'deleted while read, undone: read again',
    )
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


FIELDS = "[document.getElementById('f-brand').value, document.getElementById('f-variety').value]"


async def test_pack_lines(browser, url):
    print('lines read off the packaging: chips that set the variety, in memory only, none after server recognition')
    ctx, pg, errors = await one_pet(browser, url)
    await household(ctx)
    await pg.evaluate("window.__ocrText = 'Katzenglück\\nZarte Häppchen\\nmit Huhn\\n4 x 85 g\\nZutaten: Fleisch'")
    await snap(pg, done='!!db.servings[0]?.guess')
    CHIPS = "[...document.querySelectorAll('#lineChips [data-action=pack-line]')].map(c => [c.dataset.v, c.getAttribute('aria-pressed')])"
    chips = [c[0] for c in await pg.evaluate(CHIPS)]
    await pg.fill('#f-variety', 'Zart')
    got = []
    for line in ('Zarte Häppchen', 'mit Huhn', 'mit Huhn'):
        await tap(pg, f'#lineChips [data-v="{line}"]')
        got.append(
            [
                (await pg.evaluate(FIELDS))[1],
                [c[0] for c in await pg.evaluate(CHIPS) if c[1] == 'true'],
                await pg.evaluate('document.activeElement.id'),
            ]
        )
    await tap(pg, '#lineChips [data-v="Katzenglück"]')
    await pg.type('#f-variety', 'x')
    await idle(pg)
    check(
        chips == ['Katzenglück', 'Zarte Häppchen', 'mit Huhn']
        and got == [['Zarte Häppchen', ['Zarte Häppchen'], 'f-variety'], ['mit Huhn', ['mit Huhn'], 'f-variety'], ['', [], 'f-variety']]
        and [c for c in await pg.evaluate(CHIPS) if c[1] == 'true'] == [],
        f'a chip sets the variety, the next replaces it, the pressed one clears it, typing unpresses {got}',
    )
    await tap(pg, '[data-action=close]')
    kept = await state(pg, 'JSON.stringify([db, queue])')
    await pg.reload()
    await started(pg)
    await tap(pg, '.pend-head')
    check('Zarte Häppchen' not in kept and await pg.evaluate(CHIPS) == [], 'the lines are never stored: gone after a restart')
    await tap(pg, '[data-action=close]')
    await connect(pg)
    await snap(pg, done='db.servings[0]?.productId')
    await tap(pg, '.tl [data-action=open-serving]')
    await tap(pg, '#sheet [data-action=edit-name]')
    check(await pg.evaluate(FIELDS) == ['Gourmet', 'Gold Pastete'] and await pg.evaluate(CHIPS) == [], 'recognised by the server: no chips')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


MEAL = '(s => [s.productId ?? null, s.status ?? null, !!s.photo, !!s.thumb, s.guess ? [s.guess.brand, s.guess.variety] : null])(db.servings[0])'


async def test_known_photo(browser, url):
    print('a photo of a known variety: served without the sheet; undo takes the recognition back, not the meal')
    ctx, pg, errors = await one_pet(browser, url)
    await household(ctx)
    await change(
        pg,
        """const now = Date.now(); s.db.products.push({id: 'sheba000001', brand: 'Sheba', variety: 'Lachs in Soße', type: 'Nassfutter', codes: {}, createdAt: now});
        s.db.servings.unshift({id: 'first0000001', productId: 'sheba000001', servedAt: now - 864e5, note: '', pets: {[s.db.pets[0].id]: {r: 'top', at: now}}})""",
    )
    KEPT = "import('./js/photos.js').then(p => p.keptPhoto('sheba000001'))"

    async def photo(text, n):
        await pg.evaluate(f'window.__ocrText = {json.dumps(text)}')
        await snap(pg, done=f"db.servings.length === {n} && (db.servings[0].productId === 'sheba000001' || db.servings[0].status === 'noserver')")
        return await state(pg, MEAL)

    meal_ = await photo('SHEBA\nLachs in Soße\n85 g', 2)
    check(
        meal_ == ['sheba000001', None, False, False, None]
        and not await pg.evaluate(OPEN)
        and await pg.locator('#toast.show [data-action=undo]').count() == 1
        and await pg.evaluate(KEPT),
        f'served as that variety, no sheet, undo offered, the photo kept for the variety {meal_}',
    )
    await tap(pg, '#toast [data-action=undo]')
    check(
        await state(pg, MEAL) == [None, 'noserver', True, True, ['Sheba', 'Lachs in Soße']]
        and await pg.evaluate(LEVEL) == [True, 'serving', None, 'name']
        and await pg.evaluate(FIELDS) == ['Sheba', 'Lachs in Soße']
        and await pg.locator('#lineChips [data-action=pack-line]').count() > 0
        and await state(pg, 'db.products.length === 1 && db.servings.length === 2')
        and await pg.evaluate(KEPT),
        'undo takes the variety off, not the meal: naming opens with the reading, the variety keeps its photo',
    )
    await tap(pg, '#sheet [data-action=delete-serving]')
    check(await state(pg, 'db.servings.length === 1 && db.products.length === 1') and not await pg.evaluate(OPEN), 'deleted there, variety kept')
    await connect(pg, serverPhoto=False)
    meal_ = await photo('Sheba\nLachs in Soße', 2)
    check(meal_[:2] == ['sheba000001', None] and not await pg.evaluate(OPEN), 'in a household without server photos: served at once as well')
    await tap(pg, '#toast [data-action=undo]')
    check(
        await state(pg, MEAL) == [None, 'noserver', True, True, ['Sheba', 'Lachs in Soße']]
        and await pg.evaluate(LEVEL) == [True, 'serving', None, 'name'],
        'and undo opens naming',
    )
    await tap(pg, '#sheet [data-action=close]')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_skeleton(browser, url):
    print('a slow reading: fields once patience runs out, typing meanwhile stays, the reading fills only empty fields')
    ctx, pg, errors = await one_pet(browser, url)
    await pg.evaluate(HOLD, 'Whiskas\nRind in Gelee')
    await tap(pg, '#fab')
    await pg.set_input_files('#camInputSheet', str(PACK))
    await pg.wait_for_selector('#sheet .skel-field')
    early = await pg.locator('#sheet #f-brand').count()
    await pg.wait_for_selector('#sheet #f-brand', timeout=6000)
    await pg.fill('#f-brand', 'Animonda')
    await pg.evaluate('window.__release()')
    await until(pg, '!!db.servings[0]?.guess')
    await idle(pg)
    check(
        early == 0
        and await pg.evaluate(FIELDS) == ['Animonda', 'Rind in Gelee']
        and await pg.evaluate('document.activeElement.id') == 'f-brand'
        and await state(pg, '(s => [s.status, s.guess.brand])(db.servings[0])') == ['noserver', 'Whiskas'],
        'no fields while it reads at first; typed brand stays, the variety is filled, the focus stays',
    )
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


REPHOTO = "(s => [s.status ?? null, s.guess ? [s.guess.brand, s.guess.variety] : null, (s.thumb || '').slice(-32), (s.photo || '').slice(-32)])(db.servings[0])"


async def test_rephoto(browser, url):
    print('„Neues Foto“ while naming: replaces the photo and reads it anew, a late old reading counts for nothing')
    fail, photos = {}, []
    ctx, pg, errors = await one_pet(browser, url)
    await household(ctx, fail, photos)
    THUMB = "document.querySelector('.pend .thumb')?.getAttribute('src')?.slice(-32) ?? null"

    async def snapshot():
        return [await state(pg, REPHOTO), await pg.evaluate(FIELDS), await pg.evaluate(THUMB)]

    async def again(text, photo):
        await pg.evaluate(f'window.__ocrText = {json.dumps(text)}; window.__photo = {json.dumps(photo)}')
        await pg.click('#sheet [data-action=rephoto]')

    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    await snap(pg)
    first = await snapshot()
    await pg.evaluate('window.__calls.length = 0')
    await again('Sheba\nLachs in Soße', b64(PACK_LARGE))
    await until(pg, "db.servings[0]?.guess?.brand === 'Sheba'")
    await idle(pg)
    second = await snapshot()
    check(
        first[0][:2] == ['noserver', ['Whiskas', 'Rind in Gelee']]
        and second[0][:2] == ['noserver', ['Sheba', 'Lachs in Soße']]
        and second[1] == ['Sheba', 'Lachs in Soße']
        and second[0][2:] != first[0][2:]
        and second[2] == second[0][2] != first[2]
        and await calls(pg, 'capture') == [None],
        'a new photo replaces photo and thumbnail and is read anew',
    )
    await again('Animonda\nCarny', None)
    await idle(pg)
    check(await snapshot() == second, 'cancelled: nothing changes')
    await pg.evaluate(HOLD, 'Animonda\nCarny')
    await again('', b64())
    await pg.wait_for_selector('#sheet .skel-field')
    await pg.wait_for_selector('#sheet #f-brand', timeout=6000)
    waiting = [await state(pg, 'db.servings[0].status'), await pg.locator('#sheet [data-action=rephoto]').count()]
    await again('Felix\nHuhn in Gelee', b64(PACK_LARGE))
    await until(pg, "db.servings[0]?.guess?.brand === 'Felix'")
    await pg.evaluate('(window.__release(), new Promise(r => setTimeout(r, 200)))')
    await idle(pg)
    late = await snapshot()
    check(
        waiting == ['reading', 1] and late[0][:2] == ['noserver', ['Felix', 'Huhn in Gelee']] and late[1] == ['Felix', 'Huhn in Gelee'],
        f'a late old reading changes nothing {waiting}',
    )
    await tap(pg, '#sheet [data-action=close]')
    await connect(pg)
    fail['server'] = True
    await pg.evaluate("window.__ocrText = ''")
    await snap(pg, done="db.servings[0]?.status === 'waiting'")
    await tap(pg, '.pend-head')
    link = await pg.locator('#sheet [data-action=rephoto]').count()
    fail['server'] = False
    await again('', b64(PACK_LARGE))
    await until(pg, "db.servings[0]?.productId && db.products.some(p => p.variety === 'Gold Pastete')")
    check(link == 1 and len(photos) == 2 and photos[0] != photos[1], f'household: the new photo goes to the server {len(photos)}')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


PRODUCT_PHOTO = """pid => import('./js/store.js').then(s => { const p = s.db.products.find(x => x.id === pid);
  return [document.querySelector('#sheet .prod .thumb, #sheet .name-photo')?.getAttribute('src')?.slice(-32) ?? null, (p.thumb || '').slice(-32),
    (localStorage.getItem('__fs:photos/' + pid + '.jpg') || '').slice(-32), p.sharedPhoto ?? null]; })"""


async def test_product_photo(browser, url):
    print('the variety’s photo changed from its sheets: thumbnail and file change, cancel changes nothing, typed fields stay')
    ctx, pg, errors = await one_pet(browser, url)
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    await snap(pg)
    await tap(pg, '[data-action=save-name]')
    await tap(pg, '#sheet [data-action=close]')
    pid = await state(pg, 'db.products[0].id')

    async def take(photo, owner=None):
        await pg.evaluate(f"window.__photo = '{photo}'")
        old = await pg.evaluate(PRODUCT_PHOTO, owner or pid)
        await pg.click('#sheet [data-action=product-photo]')
        await until(pg, f"(db.products.find(x => x.id === '{owner or pid}').thumb || '').slice(-32) !== '{old[1]}'")
        await idle(pg)
        return old, await pg.evaluate(PRODUCT_PHOTO, owner or pid)

    await open_sheet(pg, kind='product', id=pid)
    await pg.evaluate('window.__calls.length = 0')
    before, after = await take(b64(PACK_LARGE))
    check(
        before[2] and after[0] == after[1] != before[1] and after[2] != before[2] and after[3] is None and await calls(pg, 'capture') == [None],
        f'food sheet: new thumbnail and file {after}',
    )
    await pg.evaluate('window.__photo = null')
    await tap(pg, '#sheet [data-action=product-photo]')
    check(await pg.evaluate(PRODUCT_PHOTO, pid) == after, 'cancelled: nothing changes')
    await tap(pg, '#sheet [data-action=close]')
    await change(
        pg, "s.db.products.push({id: 'ohnefoto0001', brand: 'Felix', variety: 'Huhn', type: 'Nassfutter', codes: {}, createdAt: Date.now()})"
    )
    await open_sheet(pg, kind='product', id='ohnefoto0001')
    none, added = await take(b64(), 'ohnefoto0001')
    check(none[1:3] == ['', ''] and added[1] and added[2], 'a variety without a photo gets one')
    await tap(pg, '#sheet [data-action=close]')
    await open_sheet(pg, kind='serving', id=await state(pg, 'db.servings[0].id'))
    await tap(pg, '#sheet [data-action=edit-name]')
    await pg.fill('#f-brand', 'Whiskas Neu')
    old, new = await take(b64())
    check(
        new[0] == new[1] != old[1] and new[2] != old[2] and await pg.input_value('#f-brand') == 'Whiskas Neu',
        'while naming: photo changes, typed brand stays',
    )
    await tap(pg, '#sheet [data-action=close]')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_exchange(browser, url):
    print('manual exchange between two phones: share, receive, answer, refuse foreign files')

    async def open_exchange(pg):
        while await pg.evaluate(OPEN):
            await tap(pg, '#sheet [data-action=close], #sheet [data-action=settings-back]')
        await settings(pg, 'exchange')

    async def shared(pg):  # the newest exchange file in the cache
        return json.loads(
            await pg.evaluate("(k => localStorage.getItem(k.sort().at(-1)))(Object.keys(localStorage).filter(n => n.includes('exchange')))")
        )

    async def receive(pg, file):
        await open_exchange(pg)
        body = file if isinstance(file, str) else json.dumps(file)
        await pg.set_input_files(
            '#exchangeInput', files=[{'name': 'schmeckts-exchange-2026-01-01.json', 'mimeType': 'application/json', 'buffer': body.encode()}]
        )
        await idle(pg)

    async def data(pg):  # comparable: keys sorted, an empty field counts as a missing one
        return await state(
            pg,
            """JSON.stringify([db.pets, db.products, db.servings], (k, v) => v === null ? undefined
              : v && typeof v === 'object' && !Array.isArray(v) ? (Object.keys(v).length ? Object.fromEntries(Object.entries(v).sort()) : undefined) : v)""",
        )

    ANSWER = '#sheet [data-action=send-answer]'
    ctx_a, a, err_a = await seeded(browser, url, {'db': SAVED}, native=True)
    ctx_b = await phone(browser)
    b, err_b = await open_page(ctx_b, url, native=True)
    await a.evaluate("import('./js/store.js').then(m => { m.prefs.name = 'Geheimniskraemer'; m.savePrefs(); })")
    await open_exchange(a)
    await tap(a, '[data-action=share-changes]')
    first = await shared(a)
    check(
        sorted(first) == ['app', 'at', 'clocks', 'device', 'kind', 'protocol', 'records']
        and [first['app'], first['kind'], len(first['records']), len(first['clocks']['servings'])] == ['schmeckts', 'exchange', 5, 3]
        and 'Geheimniskraemer' not in json.dumps(first)
        and await calls(a, 'share'),
        'first share: every record with its clocks, nothing from the settings',
    )
    await receive(b, first)
    check(await data(b) == await data(a) and await b.locator(ANSWER).count() == 0, 'received on an empty phone: everything, no answer needed')
    await a.evaluate("import('./js/store.js').then(m => { m.db.products[0].variety = 'Lachs pur'; m.save(); })")
    await b.evaluate(
        "import('./js/store.js').then(m => { m.db.products[0].kaufen = 'immer'; m.db.servings = m.db.servings.filter(s => s.id !== 'lxserv0001'); m.save(); })"
    )
    await open_exchange(b)
    await tap(b, '[data-action=share-changes]')
    second = await shared(b)
    await receive(a, second)
    check(len(second['records']) == 2 and await a.locator(ANSWER).count() == 1, 'second share: only what is new, an answer offered')
    check(
        await state(a, "db.products[0].kaufen === 'immer' && db.products[0].variety === 'Lachs pur' && db.servings.length === 2"),
        'merged per field, deletion kept',
    )
    await tap(a, ANSWER)
    answer = await shared(a)
    await receive(b, answer)
    check(len(answer['records']) == 1 and await data(b) == await data(a) and await a.locator(ANSWER).count() == 0, 'the answer levels both')
    while await b.evaluate(OPEN):
        await tap(b, '#sheet [data-action=close], #sheet [data-action=settings-back]')
    await b.evaluate("t => localStorage.setItem('__fs:schmeckts-exchange-shared.json', t)", json.dumps(answer))
    await b.evaluate("window.__urlOpen({url: 'content://media/external/file/schmeckts-exchange-shared.json'})")
    await idle(b)
    check(await b.evaluate(LEVEL) == [True, 'settings', 'exchange', None], 'a file shared from another app opens the exchange page')
    before = await data(b)
    toasts = []
    for body in (
        json.dumps({'app': 'other', 'kind': 'exchange'}),
        'kein json',
        json.dumps({'version': 3, 'pets': [], 'products': [], 'servings': []}),
        json.dumps({'app': 'schmeckts', 'kind': 'exchange', 'protocol': 1, 'device': 'x'}),
        json.dumps({'app': 'schmeckts', 'kind': 'exchange', 'protocol': 9, 'device': 'x', 'clocks': {}, 'records': []}),
    ):
        await b.evaluate("document.getElementById('toast').classList.remove('show')")
        await receive(b, body)
        toasts.append(await b.locator('#toast.show').count())
    check(toasts == [1] * 5 and await data(b) == before, f'foreign, broken or newer files: a message, nothing changed {toasts}')
    check(not real_errors(err_a) and not real_errors(err_b), f'no errors {real_errors(err_a)[:2]}{real_errors(err_b)[:2]}')
    await ctx_a.close()
    await ctx_b.close()


PIXEL = """([src, pts]) => new Promise(done => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); done({w: img.width, h: img.height, px: pts.map(([fx, fy]) => { const d = x.getImageData(Math.round(fx * (img.width - 1)), Math.round(fy * (img.height - 1)), 1, 1).data;
    return d[0] > 150 && d[1] < 100 ? 'red' : [...d].join(); })}); }; img.src = src; })"""


async def open_pet(pg):
    await pg.evaluate("import('./js/logic/pets.js').then(async p => p.openPet((await import('./js/store.js')).db.pets[0].id))")
    await idle(pg)


async def test_crop(browser, url):
    print('cropping the profile picture: zoom and drag, applied at 320 px, cancel keeps the old one')
    make_pictures()
    ctx, pg, errors = await one_pet(browser, url)
    await open_pet(pg)
    await pg.set_input_files('#petPhotoInput', str(PACK.parent / 'quadrants.png'))
    await idle(pg)
    CROP = "import('./js/ui/sheet.js').then(async m => { const c = (await import('./js/ui/crop.js')).cropRect(m.sheet.crop); return [c.x, c.y, c.side].map(Math.round); })"
    start = await pg.evaluate(CROP)
    await pg.evaluate("(z => { z.value = 2; z.dispatchEvent(new Event('input', {bubbles: true})); })(document.getElementById('f-zoom'))")
    box = await pg.locator('#cropStage').bounding_box()
    cx, cy, side = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, box['width']
    await pg.mouse.move(cx, cy)
    await pg.mouse.down()
    await pg.mouse.move(cx + side / 2, cy + side / 2, steps=4)
    await pg.mouse.up()
    check([start, await pg.evaluate(CROP)] == [[200, 0, 400], [200, 0, 200]], 'opens on the whole middle; zoomed and dragged, it stops at the edge')
    await tap(pg, '[data-action=crop-apply]')
    got = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step ?? null, m.sheet.photo])")
    res = await pg.evaluate(PIXEL, [got[1], [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]])
    check(
        got[0] is None and got[1].startswith('data:image/jpeg') and res == {'w': 320, 'h': 320, 'px': ['red'] * 4},
        f'applied: 320 px, red quadrant {res}',
    )
    await tap(pg, '[data-action=save-pet]')
    check(await state(pg, 'db.pets[0].photo') == got[1], 'saved on the pet')
    await open_pet(pg)
    await pg.set_input_files('#petPhotoInput', str(PACK))
    await idle(pg)
    await tap(pg, '[data-action=crop-cancel]')
    back_ = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step ?? null, m.sheet.photo])")
    check(back_ == [None, got[1]] and await pg.locator('#f-name').count() == 1, 'cancel: back in the pet sheet, the picture stays')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


POPUP = """() => { const d = id => document.getElementById(id);
  return {page: d('sheet').open ? d('sheet').dataset.kind : null, popup: d('popup').open ? d('popup').dataset.kind : null, y: d('sheetBody').scrollTop,
    locked: document.body.classList.contains('locked'), toast: d('toast').parentNode.id || d('toast').parentNode.tagName}; }"""


async def test_popup(browser, url):
    print('a sheet opened from a page lies over it; closing or back leads to the page as it was')
    ctx, pg, errors = await demo(browser, url, native=True, motion=True)
    await tap(pg, '[data-action=open-report]')
    await pg.evaluate("document.getElementById('sheetBody').scrollTop = 900")
    await idle(pg)
    index = await pg.evaluate(
        "[...document.querySelectorAll('#sheet .tl-item[data-action=open-serving]')].findIndex(b => { const r = b.getBoundingClientRect(); return r.top > 120 && r.bottom < 700; })"
    )
    item = pg.locator('#sheet .tl-item[data-action=open-serving]').nth(index)
    await item.click()
    await idle(pg)
    over = await pg.evaluate(POPUP)
    check([over['page'], over['popup'], over['y']] == ['report', 'serving', 900], f'a meal opens over the page, which keeps its scroll {over}')
    ways = []
    for close in (lambda: pg.click('#popup [data-action=close]'), lambda: pg.evaluate('window.__back({canGoBack: true})'), pg.go_back):
        await close()
        await idle(pg)
        ways.append(await pg.evaluate(POPUP))
        await item.click()
        await idle(pg)
    await tap(pg, '#popup [data-action=close]')
    check(
        all([x['page'], x['popup'], x['y'], x['locked']] == ['report', None, 900, True] for x in ways),
        f'X, back button, gesture close the sheet only {ways}',
    )
    meal_ = await pg.evaluate(
        "(b => { b.scrollIntoView({block: 'center'}); return b.dataset.id; })(document.querySelector('#sheet .tl-item .badge.open').closest('.tl-item'))"
    )
    await idle(pg)
    y = await pg.evaluate("document.getElementById('sheetBody').scrollTop")
    OPEN_BADGE = f'#sheet .tl-item[data-id="{meal_}"] .badge.open'
    await tap(pg, f'#sheet .tl-item[data-id="{meal_}"]')
    await pg.click('#popup [data-action=rate][data-r=gut]', force=True)
    await pg.wait_for_function("!document.getElementById('popup').open", timeout=6000)
    await idle(pg)
    rated = await pg.evaluate(POPUP)
    check(
        [rated['page'], rated['popup'], rated['y'], rated['toast']] == ['report', None, y, 'sheet']
        and await pg.locator(OPEN_BADGE).count() == 0
        and await state(pg, f"Object.values(db.servings.find(s => s.id === '{meal_}').pets).some(x => x.r === 'gut')"),
        f'rated over the page: the sheet closes by itself, the page shows it in place, the toast on the page {rated}',
    )
    await tap(pg, '#toast [data-action=undo]')
    check(await pg.locator(OPEN_BADGE).count() == 1, 'undo on the page takes the rating back there')
    await tap(pg, f'#sheet .tl-item[data-id="{meal_}"]')
    await pg.evaluate(f"import('./js/logic/editing.js').then(m => m.deleteServing('{meal_}'))")
    await idle(pg)
    gone = [await pg.evaluate(POPUP), await pg.locator(f'#sheet .tl-item[data-id="{meal_}"]').count()]
    await tap(pg, '#toast [data-action=undo]')
    check(
        [gone[0]['page'], gone[0]['popup'], gone[1]] == ['report', None, 0] and await pg.locator(f'#sheet .tl-item[data-id="{meal_}"]').count() == 1,
        'deleted over the page, undone there',
    )
    await back(pg)
    await tap(pg, '[data-action=open-evaluation]')
    await pg.locator('#sheet [data-action=open-product]').first.click()
    await idle(pg)
    product_ = await pg.evaluate(POPUP)
    await tap(pg, '#popup [data-action=close]')
    stays = await pg.evaluate(POPUP)
    await pg.locator('#sheet [data-action=open-product]').first.click()
    await idle(pg)
    await tap(pg, '#popup [data-action=serve]')
    served = await pg.evaluate(POPUP)
    check(
        [product_['page'], product_['popup'], stays['page'], stays['popup']] == ['evaluation', 'product', 'evaluation', None]
        and [served['page'], served['popup'], served['locked'], served['toast']] == [None, None, False, 'BODY']
        and not await pg.evaluate('history.state'),
        f'a variety over „Vorlieben“ closes back to it; serving from it ends on the home page, history cleared {served}',
    )
    await tap(pg, '[data-action=open-evaluation]')
    await tap(pg, '#sheet .head [data-action=open-level][data-v=shop]')
    await pg.locator('#sheet [data-action=open-product]').first.click()
    await idle(pg)
    await open_sheet(pg, kind='settings', page='house')
    swapped = await pg.evaluate(POPUP)
    await back(pg, 2)
    home = await pg.evaluate(POPUP)
    check(
        [swapped['page'], swapped['popup'], home['page'], home['locked']] == ['settings', None, None, False],
        'a page over both replaces them, back leads home',
    )
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


OBS = "import('./js/store.js').then(s => s.db.observations.map(o => [o.kind, Object.keys(o.pets).sort(), o.by ?? null]))"


async def test_observations(browser, url):
    print('observations: noted with one tap, undone, put right and deleted from the diary, per pet')
    ctx, pg, errors = await demo(browser, url, native=True, width=360)
    await state(pg, "(prefs.name = 'Anna', true)")
    before = await pg.evaluate(OBS)
    CHIP = '#home .overview [data-action=observe]'
    ROW = '[data-sec=hist] [data-action=open-observation]'
    words = await pg.eval_on_selector_all(CHIP, 'l => l.map(c => c.textContent.trim())')
    check(len(words) == 5 and all(len(w) <= 11 and len(w.split()) <= 2 for w in words), f'the chips always at hand, short {words}')
    await tap(pg, '[data-action=observe][data-v=tired]')
    tired = await pg.inner_text('#toast > span')
    await tap(pg, '#toast [data-action=undo]')
    await tap(pg, '[data-action=observe][data-v=stink]')
    after, pet_ = await pg.evaluate(OBS), await state(pg, 'db.pets[0].id')
    told = await pg.inner_text('#toast > span')
    check(
        after[0] == ['stink', [pet_], 'Anna']
        and len(after) == len(before) + 1
        and await pg.locator(CHIP).count() == 5
        and await pg.locator(ROW).count() == 1
        and await pg.inner_text(f'{ROW} .t-main b') == await pg.inner_text('[data-action=observe][data-v=stink]'),
        f'a chip notes it at once, for the pet and by who noted it, in today’s diary under the chip’s word {after[0]}',
    )
    await tap(pg, '#toast [data-action=undo]')
    check(await pg.evaluate(OBS) == before and await pg.locator(ROW).count() == 0, 'undo takes it back, from the diary too')
    await tap(pg, '[data-action=observe][data-v=hungry]')
    again = await pg.inner_text('#toast > span')
    check(
        'Vorlieben' not in tired and 'Vorlieben' in told and 'Vorlieben' not in again and 'tipp:beobachtung' in await state(pg, 'prefs.hiddenHints'),
        f'the first note the preferences weigh says once where it shows up later, a tired day is not one ({tired} / {told} / {again})',
    )
    await tap(pg, ROW)
    KINDS = "[...document.querySelectorAll('#sheet [data-action=set-observation-kind][aria-pressed=true]')].map(c => c.dataset.v)"
    check(
        await pg.evaluate(KINDS) == ['hungry']
        and await pg.locator('#f-obs-time').count() == 1
        and await pg.locator('#sheet [data-action=toggle-observation-pet]').count() == 0,
        'its sheet: the kind pressed, its time, no pets to choose with one pet',
    )
    await tap(pg, '#sheet [data-action=set-observation-kind][data-v=tired]')
    mine = await pg.evaluate("import('./js/ui/sheet.js').then(m => m.sheet.id)")
    await pg.fill('#f-obs-time', '2026-01-02T08:30')
    await pg.dispatch_event('#f-obs-time', 'change')
    await idle(pg)
    got = await state(pg, f"(o => [o.kind, o.at, db.observations.at(-1) === o])(db.observations.find(o => o.id === '{mine}'))")
    check(got == ['tired', await pg.evaluate("new Date('2026-01-02T08:30').getTime()"), True], f'kind and time put right {got}')
    await tap(pg, '#sheet [data-action=delete-observation]')
    gone = [await pg.evaluate(OBS) == before, await pg.evaluate(OPEN)]
    await tap(pg, '#toast [data-action=undo]')
    check(gone == [True, False] and await state(pg, f"db.observations.find(o => o.id === '{mine}')?.kind ?? null") == 'tired', 'deleted, undone')
    await tap(pg, '[data-action=open-report]')
    await pg.locator('#sheet [data-action=open-observation]').first.click()
    await idle(pg)
    over = await pg.evaluate("[document.getElementById('sheet').dataset.kind, document.getElementById('popup').dataset.kind]")
    await tap(pg, '#popup [data-action=close]')
    check(over == ['report', 'observation'], 'in the history page it opens over the page')
    await back(pg)
    await change(pg, f"s.db.pets.push({{id: '{T}', name: 'Tiger', species: 'Katze', photo: null, createdAt: Date.now()}})")
    await tap(pg, '[data-action=observe][data-v=stink]')
    both = (await pg.evaluate(OBS))[0][1]
    await tap(pg, ROW)
    await tap(pg, f'#sheet [data-action=toggle-observation-pet][data-id={T}]')
    narrowed = (await pg.evaluate(OBS))[0][1]
    await tap(pg, f'#sheet [data-action=toggle-observation-pet][data-id={pet_}]')
    check(both == sorted([pet_, T]) and narrowed == [pet_] and (await pg.evaluate(OBS))[0][1] == [pet_], 'for all pets, narrowed, at least one')
    await tap(pg, '#sheet [data-action=close]')
    await tap(pg, f'[data-action=filter][data-id={T}]')
    await tap(pg, '[data-action=observe][data-v=hungry]')
    check((await pg.evaluate(OBS))[0][:2] == ['hungry', [T]], 'with a pet chosen: noted for that pet')
    count = len(await pg.evaluate(OBS))
    await pg.evaluate(f"import('./js/logic/pets.js').then(p => {{ p.openPet('{T}'); p.deletePet(); }})")
    await idle(pg)
    left = await pg.evaluate(OBS)
    check(len(left) == count - 1 and not [o for o in left if T in o[1]], 'a pet deleted: gone from the observations, those of it alone too')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_toast_time(browser, url):
    print('a toast stays until it can be read: the usual time, longer for a long text')
    ctx = await phone(browser)
    await fixed_clock(ctx)
    pg, errors = await open_page(ctx, url)

    async def lasts(msg, undo=True):
        await pg.evaluate("([m, u]) => import('./js/ui/toast.js').then(t => t.toast(m, u ? () => {} : null))", [msg, undo])
        ms = 0
        while await pg.evaluate("document.getElementById('toast').classList.contains('show')") and ms < 20000:
            await pg.clock.run_for(100)
            ms += 100
        return ms

    short, plain = await lasts('Hunger notiert.'), await lasts('Hunger notiert.', False)
    long = await lasts('Stunk notiert. Fenster auf! ' + 'Ein langer Satz, der etwas länger zu lesen ist. ' * 3)
    check(plain < short < long and long - short > 1500, f'short with undo, short without, long: {short} {plain} {long} ms')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_mood(browser, url):
    print('the mood picture: the chosen pet’s photo, always, with no switch for it')
    make_pictures()
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    MOOD = "(m => m.hidden ? null : m.querySelector('img').getAttribute('src').slice(-40))(document.getElementById('mood'))"
    minka, tiger = 'data:image/png;base64,' + b64(PACK.parent / 'quadrants.png'), 'data:image/jpeg;base64,' + b64(PACK.parent / 'photo0.jpg')
    await load(pg, [pet('petminka001', photo=minka), pet('pettiger001', 'Tiger', photo=tiger), pet('petkiwi001', 'Kiwi')], [], [])
    shows = []
    for who in ('all', 'petminka001', 'pettiger001', 'petkiwi001'):
        await change(pg, 's.prefs.activePet = a', who)
        shows.append(await pg.evaluate(MOOD))
    check(shows == [None, minka[-40:], tiger[-40:], None], 'the chosen pet’s photo; none for all pets or a pet without one')
    await change(pg, "s.db.pets = s.db.pets.slice(0, 1); s.prefs.activePet = 'all'")
    check(await pg.evaluate(MOOD) == minka[-40:], 'one pet: its photo')
    await settings(pg)
    check(await pg.locator('#sheet [data-action=backdrop]').count() == 0, 'no switch for it in the settings')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()
    db = {**SAVED, 'pets': [{**SAVED['pets'][0], 'photo': minka}]}
    ctx, pg, errors = await seeded(browser, url, {'db': db, 'prefs': {'backdrop': False}})
    check(await pg.evaluate(MOOD) == minka[-40:] and await state(pg, "!('backdrop' in prefs)"), 'switched off before: shown now, the setting gone')
    await ctx.close()


async def test_camera(browser, url):
    print('our own camera: serves at once, released on every way out, falls back to the camera app')
    LIVE = "navigator.mediaDevices.__streams.filter(s => s.getTracks().some(t => t.readyState === 'live')).length"
    CAM = "document.getElementById('camera').open"
    SPY = """(() => { const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md); md.__streams = []; md.__asked = [];
      md.getUserMedia = c => { md.__asked.push(c); return window.__denyCamera ? Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) : orig(c).then(s => (md.__streams.push(s), s)); };
      const take = ImageCapture.prototype.takePhoto; window.__stills = [];
      ImageCapture.prototype.takePhoto = function (o) { window.__stills.push(o ?? null);
        return window.__stillFails ? Promise.reject(new DOMException('Camera busy', 'UnknownError')) : take.call(this, o); }; })()"""
    ctx, pg, errors = await one_pet(browser, url, permissions=['camera'])
    await pg.evaluate(SPY)

    async def live(open_it):
        await open_it()
        await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0")
        await idle(pg)

    async def feed_photo():
        await tap(pg, '#fab')
        await pg.click('#sheet [data-action=photo]')

    async def shutter(n):
        await pg.click('#camera .shutter')
        await pg.wait_for_selector('#sheet #f-brand')
        await idle(pg)
        return (
            await state(pg, f"db.servings.length === {n} && !!db.servings[0].photo?.startsWith('data:image/jpeg')") and await pg.evaluate(LIVE) == 0
        )

    await live(feed_photo)
    asked = await pg.evaluate('navigator.mediaDevices.__asked[0]')
    check(
        await pg.evaluate(CAM)
        and asked == {'audio': False, 'video': {'facingMode': {'ideal': 'environment'}, 'width': {'ideal': 1920}, 'height': {'ideal': 1080}}},
        f'feeding → photo: a live preview from the rear camera at up to 1920 px, no audio {asked}',
    )
    served = await shutter(1)
    check(
        served
        and await pg.evaluate(LEVEL) == [True, 'serving', None, 'name']
        and await state(pg, "db.servings[0].status === 'noserver' && !!db.servings[0].thumb"),
        'the shutter serves at once and releases the camera, on to naming',
    )
    check(
        await until(pg, "import('./js/recognize.js').then(r => r.lastReading()?.width === 1920)")
        and await pg.evaluate('window.__stills') == [{'imageWidth': 1920}],
        'the still comes from the sensor at its width and is read at that size',
    )
    await open_sheet(pg, kind='feed')
    await tap(pg, '#sheet [data-action=close]')
    for how, act in (
        ('cancel', "document.querySelector('#camera [data-cam=cancel]').click()"),
        ('back button', 'window.__back({canGoBack: false})'),
        (
            'background',
            "Object.defineProperty(document, 'hidden', {get: () => true, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden",
        ),
    ):
        await live(feed_photo)
        await pg.evaluate(act)
        await idle(pg)
        check(
            [await pg.evaluate(CAM), await pg.evaluate(LIVE), await state(pg, 'db.servings.length'), (await pg.evaluate(LEVEL))[1]]
            == [False, 0, 1, 'feed'],
            f'{how}: closed and released at once, nothing served, the feeding sheet stays',
        )
        await tap(pg, '#sheet [data-action=close]')
    await pg.evaluate(f"window.__barcode = '{SHEBA}'")

    async def scan():
        await tap(pg, '#fab')
        await pg.click('[data-action=scan]')

    await live(scan)
    check(await shutter(2) and await state(pg, f"db.servings[0].scanCode === '{SHEBA}'"), 'unknown barcode: our camera, code on the meal')
    await tap(pg, '#sheet [data-action=close]')
    await live(lambda: pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})"))
    await pg.evaluate('window.__stillFails = true')
    check(await shutter(3), 'schmeckts://photo opens our camera; no still from the sensor: the frame on screen is served')
    await pg.evaluate("window.__stillFails = false; window.__denyCamera = true; window.__calls.length = 0; window.__photo = '" + b64() + "'")
    await tap(pg, '#sheet [data-action=close]')
    await feed_photo()
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    check(
        await calls(pg, 'capture') == [None] and not await pg.evaluate(CAM) and await state(pg, 'db.servings.length') == 4,
        'camera denied: the camera app serves',
    )
    await tap(pg, '#sheet [data-action=close]')
    await pg.evaluate("window.__photo = null; window.Capacitor.Plugins.Photo.capture = () => Promise.reject(new Error('camera unavailable')); 0")
    await feed_photo()
    await pg.wait_for_selector('#toast.show')
    check(await state(pg, 'db.servings.length') == 4, 'the camera app blocked as well: a notice, nothing served')
    check(not await pg.evaluate("document.getElementById('petPhotoInput').hasAttribute('capture')"), 'the profile picture comes from the gallery')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


async def test_no_camera(browser, url):
    print('without a camera: the file picker in the browser')
    ctx, pg, errors = await demo(browser, url)
    await tap(pg, '#fab')
    async with pg.expect_file_chooser(timeout=5000) as fc:
        await pg.click('#sheet [data-action=photo]')
    check((await fc.value).element is not None and not await pg.evaluate("document.getElementById('camera').open"), 'no camera: file picker')
    await ctx.close()


VIEWER = "document.getElementById('viewer').open"
PHOTO_FILES = "Object.keys(localStorage).filter(k => k.startsWith('__fs:photos/')).sort()"
FILE_WIDTH = """path => new Promise(done => { const i = new Image(); i.onload = () => done(i.naturalWidth); i.onerror = () => done(0);
  i.src = 'data:image/jpeg;base64,' + localStorage.getItem('__fs:' + path); })"""
# a change from another phone, as the sync delivers it: [collection, id, {field: value}]
REMOTE = """list => import('./js/store.js').then(m => { const t = String(Date.now()).padStart(13, '0') + '-0000-fremd';
  m.merge(list.map(([c, r, f]) => ({c, r, f: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, {v, t}]))}))); })"""


async def viewed(pg, sel):
    await tap(pg, sel)
    await pg.wait_for_function(VIEWER)
    await idle(pg)
    return await pg.evaluate("document.querySelector('#viewer img').naturalWidth")


async def closed(pg):
    await pg.wait_for_function(f'!{VIEWER}')
    await idle(pg)


async def test_photo_viewer(browser, url):
    print('the packaging photo: opens large, kept as a file of the variety outside the data, follows it, tidied up')
    ctx, pg, errors = await one_pet(browser, url)
    THUMB = '.pend .pend-top > .photo-btn'
    await snap(pg, PACK_LARGE)
    check(await viewed(pg, '#sheet .photo-btn') == 1100 and await pg.evaluate(OPEN), 'naming: the photo opens large over the sheet')
    await tap(pg, '#viewer')
    await closed(pg)
    await pg.fill('#f-brand', 'Sheba')
    await viewed(pg, '#sheet .photo-btn')
    await hw_back(pg)
    await closed(pg)
    kept = await pg.evaluate(
        "import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.step, document.getElementById('f-brand').value])"
    )
    await viewed(pg, '#sheet .photo-btn')
    await pg.keyboard.press('Escape')
    await closed(pg)
    check(kept == [True, 'name', 'Sheba'] and await pg.evaluate(OPEN), f'back and Escape close the viewer only, naming keeps what was typed {kept}')
    await tap(pg, '#sheet [data-action=close]')
    await viewed(pg, THUMB)
    over = await pg.evaluate(f'[{VIEWER}, {OPEN}]')
    await tap(pg, '#viewer .icon-btn')
    await closed(pg)
    await tap(pg, '.pend-head')
    check(
        over == [True, False] and await pg.evaluate(LEVEL) == [True, 'serving', None, 'name'],
        'home card: thumbnail opens the photo, the rest the meal',
    )
    await pg.fill('#f-brand', 'Sheba')
    await pg.fill('#f-variety', 'Lachs')
    await tap(pg, '[data-action=save-name]')
    pid = await state(pg, 'db.servings[0].productId')
    path = f'photos/{pid}.jpg'
    await until(pg, f"localStorage.getItem('__fs:{path}') && localStorage.getItem('__fs:db.json')?.includes('{pid}')")
    outside = await pg.evaluate(
        f"(f => !!f && !localStorage.getItem('__fs:db.json').includes(f.slice(-200, -100)))(localStorage.getItem('__fs:{path}'))"
    )
    check(
        outside
        and any(c['path'] == path and c['directory'] == 'DATA' for c in await calls(pg, 'writeFile'))
        and await pg.evaluate(FILE_WIDTH, path) == 1100
        and await state(pg, '[db.servings[0].photo ?? null, db.servings[0].thumb ?? null, !!db.products[0].thumb]') == [None, None, True],
        'named: the large photo is a file of the variety outside db.json, the meal keeps none',
    )
    await tap(pg, '#sheet [data-action=close]')
    await tap(pg, '.pend-head')
    from_file = await viewed(pg, '#sheet .prod .photo-btn')
    await tap(pg, '#viewer')
    await closed(pg)
    await tap(pg, '#sheet .prod-edit')
    await pg.fill('#f-variety', 'Huhn')
    await tap(pg, '[data-action=save-name]')
    pid = await state(pg, 'db.servings[0].productId')
    path = f'photos/{pid}.jpg'
    await until(pg, f"!!localStorage.getItem('__fs:{path}')", timeout=4)
    moved = [await pg.evaluate(PHOTO_FILES), await state(pg, 'db.products.map(p => [p.variety, !!p.thumb])')]
    check(from_file == 1100 and moved == [[f'__fs:{path}'], [['Huhn', True]]], f'opened from the file; it follows another variety {moved}')
    await tap(pg, '#sheet [data-action=close]')
    await pg.reload()
    await started(pg)
    check(await viewed(pg, THUMB) == 1100, 'after a restart it opens from the file')
    await tap(pg, '#viewer')
    await closed(pg)
    good = await pg.evaluate(f"localStorage.getItem('__fs:{path}')")
    await pg.evaluate(f"localStorage.setItem('__fs:{path}', 'kaputt')")
    await pg.reload()
    await started(pg)
    await tap(pg, THUMB)
    await pg.wait_for_selector('#toast.show')
    check(
        not await pg.evaluate(VIEWER)
        and await pg.evaluate(f"localStorage.getItem('__fs:{path}')") == 'kaputt'
        and await pg.locator(THUMB).count() == 1,
        'a photo that will not decode: a notice, the file stays',
    )
    await pg.evaluate(f"localStorage.removeItem('__fs:{path}')")
    await tap(pg, THUMB)
    await pg.wait_for_selector('#toast.show')
    await idle(pg)
    check(
        not await pg.evaluate(VIEWER) and await pg.locator('.photo-btn').count() == 0 and await pg.locator('.pend .pend-head > .thumb').count() == 1,
        'a photo found nowhere is forgotten',
    )
    await pg.evaluate(f"[localStorage.setItem('__fs:{path}', {json.dumps(good)}), localStorage.setItem('__fs:photos/zzzz9999.jpg', 'x')]")
    await pg.reload()
    await started(pg)
    stray = await pg.evaluate(PHOTO_FILES)
    await open_sheet(pg, kind='product', id=pid)
    await pg.click('#sheet [data-action=arm][data-then=delete-product]')
    await tap(pg, '#sheet [data-action=arm][data-then=delete-product]')
    await pg.reload()
    await started(pg)
    check(stray == [f'__fs:{path}'] and await pg.evaluate(PHOTO_FILES) == [], f'a file without its variety goes at the next start {stray}')
    await snap(pg, PACK_LARGE)
    await pg.reload()
    await started(pg)
    await tap(pg, '.pend-head')
    small = await viewed(pg, '#sheet .photo-btn')
    await tap(pg, '#viewer')
    await closed(pg)
    await pg.fill('#f-brand', 'Felix')
    await pg.fill('#f-variety', 'Huhn')
    await tap(pg, '[data-action=save-name]')
    felix = await state(pg, 'db.servings[0].productId')
    await until(pg, f"!!localStorage.getItem('__fs:photos/{felix}.jpg')")
    check([small, await pg.evaluate(FILE_WIDTH, f'photos/{felix}.jpg')] == [480, 480], 'named after a restart: the smaller photo the meal kept')
    await tap(pg, '#sheet [data-action=close]')
    await settings(pg)
    await pg.click('#sheet [data-action=arm][data-then=wipe]')
    await tap(pg, '#sheet [data-action=arm][data-then=wipe]')
    check(await pg.evaluate(PHOTO_FILES) == [], '„Alle Daten löschen“ removes every photo')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()
    ctx, pg, errors = await one_pet(browser, url)
    await snap(pg, PACK_LARGE)
    await tap(pg, '#sheet [data-action=close]')
    sid = await state(pg, 'db.servings[0].id')
    rind = {'brand': 'Animonda', 'variety': 'Rind', 'type': 'Nassfutter', 'createdAt': 1}
    await pg.evaluate(REMOTE, [['products', 'fremdsorte01', rind], ['servings', sid, {'productId': 'fremdsorte01'}]])
    handed = await until(pg, "!!localStorage.getItem('__fs:photos/fremdsorte01.jpg') && !db.servings[0].photo && !db.servings[0].status", timeout=4)
    await idle(pg)
    check(
        handed and await pg.evaluate(FILE_WIDTH, 'photos/fremdsorte01.jpg') == 1100 and await pg.locator(THUMB).count() == 1,
        'named elsewhere: the photo is that variety’s',
    )
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
    check(await pg.evaluate(PHOTO_FILES) == ['__fs:photos/fremdsorte02.jpg'], 'merged elsewhere: the photo follows, survives a restart')
    check(not real_errors(errors), f'no errors {real_errors(errors)}')
    await ctx.close()


run_tests(
    {
        'start': test_start,
        'settings': test_settings,
        'tour': test_tour,
        'flow': test_flow,
        'buying': test_buying,
        'cards': test_cards,
        'shop': test_shop,
        'shop-folds': test_shop_folds,
        'dry-food': test_dry_food,
        'history': test_home_history,
        'report': test_report,
        'evaluation': test_evaluation,
        'candidate': test_candidate,
        'scales': test_scales,
        'slider-words': test_slider_words,
        'slide': test_slide,
        'texture': test_texture,
        'suggestions': test_suggestions,
        'reminder': test_reminders,
        'reminder-buttons': test_reminder_buttons,
        'news': test_news,
        'feed-reminder': test_feed_remind,
        'pets': test_petbar,
        'nicknames': test_nicknames,
        'birthday': test_birthday,
        'local': test_local,
        'network': test_network,
        'scanning': test_scan,
        'recognition': test_recognize,
        'text-thumb': test_text_thumb,
        'discard': test_discard,
        'pack-lines': test_pack_lines,
        'known-photo': test_known_photo,
        'skeleton': test_skeleton,
        'rephoto': test_rephoto,
        'product-photo': test_product_photo,
        'exchange': test_exchange,
        'crop': test_crop,
        'popup': test_popup,
        'observations': test_observations,
        'toast-time': test_toast_time,
        'mood': test_mood,
        'camera': test_camera,
        'no-camera': test_no_camera,
        'photo': test_photo_viewer,
    },
    camera=('camera',),
)
