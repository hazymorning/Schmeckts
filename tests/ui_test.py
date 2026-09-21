#!/usr/bin/env python3
"""Flows and interface of the app in Chromium, without a server, with simulated Android plugins.
Usage: python3 tests/ui_test.py [name …] [--shots]   (--shots leaves screenshots in dist/test/)"""
import asyncio, base64, json, re, time
import xml.etree.ElementTree as ET
from common import PACK, ROOT, SAVED, SHEBA, UPC, check, contrast, debounced, idle, make_pictures, open_page, phone, real_errors, run_tests, seeded, shot, started, state, until

async def test_tour(browser, url, scheme='light'):
    print(f'tour ({scheme})')
    ctx = await phone(browser, scheme)
    pg, errors = await open_page(ctx, url)
    await shot(pg, f'{scheme}-welcome')
    await pg.click('[data-action=demo]'); await idle(pg)
    check(await state(pg, 'db.servings.length') > 10, 'sample data loaded')
    check(await pg.locator('#syncChip').is_hidden(), 'without a server there is no sync notice at the top')
    await shot(pg, f'{scheme}-home')
    await pg.click('#fab'); await idle(pg)
    await shot(pg, f'{scheme}-feeding')
    await pg.click('[data-action=scan]'); await idle(pg)  # in the browser: a prompt, cancelled here
    check(await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta-row [data-action=scan]').count() == 1,
          'feeding sheet with „Barcode“ and „Foto“; cancelling stays in the sheet')
    before = await state(pg, 'db.servings.length')
    await pg.click('.plist [data-action=serve]'); await idle(pg)
    check(await state(pg, 'db.servings.length') == before + 1, 'a known variety served')
    await pg.click('.pend [data-action=rate][data-r=gut]'); await idle(pg)
    check(await state(pg, "Object.values(db.servings[0].pets)[0].r") == 'gut', 'rated with one tap')
    heads = await pg.eval_on_selector_all('#home > section', 'l => l.map(s => s.classList.contains("card") ? s.querySelector("h2").innerText : "-")')
    hint = [h for h in heads if h in ('Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    week = [h for h in heads if h == 'Letzte Woche']  # Monday to Wednesday only
    check(heads == ['Mau', 'Wie war’s?'] + hint + week + ['Verlauf', 'Einkaufen', 'Erkenntnisse'] and len(hint) == 1, f'cards in a fixed order, the overview first: {heads}')
    check(await pg.locator('.cal').count() == 1 and await pg.locator('[data-sec=hist] .tl-day').count() >= 1 and await pg.locator('[data-sec=shop] .bar').count() == 0,
          'the history visible at once, shopping folded up')
    await pg.click('[data-action=expand][data-v=shop]'); await idle(pg)
    check(await pg.locator('[data-sec=shop] .shop li').count() > 5, 'shopping unfolded: every variety')
    await pg.click('[data-action=expand][data-v=ins]'); await idle(pg)
    n = await pg.locator('[data-sec=hist] .tl-item').count()
    await pg.click('[data-sec=hist] .card-btn'); await idle(pg)
    check(n == 5 and await pg.locator('[data-sec=hist] .tl-item').count() == 10, '„Weitere anzeigen“ shows five more meals')
    await shot(pg, f'{scheme}-unfolded')
    await pg.click('[data-action=open-settings]'); await idle(pg)
    other = 'dark' if scheme == 'light' else 'light'
    await pg.click(f'[data-action=theme][data-v={other}]'); await idle(pg)
    bg = await pg.evaluate('getComputedStyle(document.documentElement).backgroundColor')
    meta = await pg.eval_on_selector('meta[name=theme-color]', 'm => m.content')
    check(bg == meta and await pg.get_attribute('html', 'data-theme') == other, f'theme switched: the background and the browser bar follow ({meta})')
    rows = await pg.eval_on_selector_all('#serverBox .label, #serverBox .btn, #serverBox input', "l => l.map(e => e.innerText?.trim() || e.id)")
    check(rows == ['Produktsuche im Internet', 'Austausch von Hand', 'Änderungen teilen',
                   'Austausch empfangen', 'Mit Haushalt verbinden'] and await pg.locator('#f-code, #f-server').count() == 0,
          f'settings, section „Haushalt“ in mode `lokal`: product lookup, exchange, connect ({rows})')
    await pg.locator('#serverBox').scroll_into_view_if_needed()
    await shot(pg, f'{scheme}-settings')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-sec=shop] [data-action=open-product]'); await idle(pg)
    check(await pg.locator('.prod-card, .sh-head').count() > 0, 'the food sheet opens')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('.tl [data-action=open-serving]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_flow(browser, url):
    print('flows in the Android app (plugins simulated)')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=set-species][data-v=Hund]')
    await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)  # with one pet there is no pet bar
    await pg.click('#sheet [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Tiger'); await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    check(await state(pg, 'db.pets.length') == 2, 'two pets created')
    await pg.click('#fab'); await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK)); await idle(pg)
    check(await state(pg, "db.servings[0].status + '|' + db.servings[0].error") == 'noserver|undefined' and await pg.locator('#sheet #f-brand').count() == 1,
          'a photo in mode `lokal`: saved, „Futter benennen“ opens straight away, no call to Anthropic')
    await pg.fill('#f-brand', 'Sheba'); await pg.fill('#f-variety', 'Lachs in Soße')
    await pg.click('[data-action=save-name]'); await idle(pg)
    rates = pg.locator('#sheet .pet-rate')
    await rates.nth(0).locator('[data-r=gut]').click(); await idle(pg)
    await rates.nth(1).locator('[data-r=sosse]').click(); await idle(pg)
    check(await state(pg, "Object.values(db.servings[0].pets).map(x => x.r).join()") == 'gut,sosse', 'both pets rated')
    check(await state(pg, "!('photo' in db.servings[0]) && !('status' in db.servings[0])"), 'after naming: photo and status tidied up')
    await pg.click('.tl [data-action=open-serving]'); await idle(pg)
    await pg.click('[data-action=delete-serving]'); await idle(pg)
    check(await state(pg, 'db.servings.length') == 0, 'meal deleted')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, "db.servings.length + '|' + db.products.length") == '1|1', 'undo brings it back')
    await pg.click('#fab'); await idle(pg)
    await pg.evaluate('window.__back({canGoBack: true})'); await idle(pg)
    check(not await pg.evaluate("document.getElementById('sheet').open"), 'the back button closes the sheet')
    await pg.evaluate('window.__back({canGoBack: false})'); await idle(pg)
    check(['minimize', None] in await pg.evaluate('window.__calls'), 'back on the home page: the app goes to the background')
    await pg.click('[data-action=open-settings]'); await idle(pg)
    check('Version 9.9.9' in await pg.inner_text('.foot'), 'the version number from the app')
    await pg.click('[data-action=export]'); await idle(pg)
    calls = await pg.evaluate('window.__calls')
    names = [c[0] for c in calls]
    check(any(c[0] == 'writeFile' and c[1]['directory'] == 'CACHE' for c in calls) and 'share' in names, 'backup through a file and the share menu')
    check('setStyle' in names, 'the status bar follows the theme')
    await pg.evaluate("import('./js/logic/products.js').then(m => m.shareShopping())"); await idle(pg)
    listed = [c[1] for c in await pg.evaluate('window.__calls') if c[0] == 'share' and c[1].get('text')]
    check(len(listed) == 1 and listed[0]['title'].startswith('Einkaufen für ') and listed[0]['text'].startswith(listed[0]['title']) and 'files' not in listed[0],
          f'the shopping list in the app through the share menu (Share plugin) as text ({listed[0]["title"] if listed else listed})')
    styles = [c[1]['style'] for c in calls if c[0] == 'impact']
    check({'LIGHT', 'MEDIUM', 'HEAVY'} <= set(styles), f'haptics graded: selection, success, deletion ({sorted(set(styles))})')
    await pg.click('[data-action=close]'); await idle(pg)
    # Shortcuts and deep links while the app is running
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://feed'})"); await idle(pg)
    check(await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta.primary').count() == 1,
          'schmeckts://feed opens the feeding sheet')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})"); await idle(pg)
    check(['capture', None] in await pg.evaluate('window.__calls') and await pg.evaluate("document.getElementById('sheet').open")
          and await pg.locator('#sheet button.cta[data-action=photo]').count() == 1, 'schmeckts://photo: the camera through the plugin; cancelling leaves the feeding sheet open')
    await pg.evaluate(f"window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}")
    before = await state(pg, 'db.servings.length')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})"); await idle(pg)
    check(await state(pg, 'db.servings.length') == before + 1 and await state(pg, "db.servings[0].status === 'noserver' && !!db.servings[0].thumb")
          and await pg.locator('#sheet #f-brand').count() == 1, 'schmeckts://photo with a photo: served and stored as an entry, and in mode `lokal` straight on to naming')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, 'db.servings.length') == before and not await pg.evaluate("document.getElementById('sheet').open"), 'and gone again through undo, with the sheet closing')
    # Storage: files in app storage, atomically (.tmp first, then rename), nothing left in localStorage
    await pg.evaluate("import('./js/store.js').then(m => m.flush())")
    await pg.reload(); await started(pg)
    check(await state(pg, "db.pets.length + '|' + db.servings.length") == '2|1', 'restart: the data comes from the files')
    # A cold start through a deep link: Capacitor holds the event back until the listener registers
    await pg.evaluate("sessionStorage.setItem('__launchUrl', 'schmeckts://feed')"); await pg.reload(); await started(pg)
    check(await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta.primary').count() == 1,
          'a cold start with schmeckts://feed opens the feeding sheet straight away')
    await pg.evaluate("sessionStorage.removeItem('__launchUrl'); window.__back({canGoBack: true})"); await idle(pg)
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
    await pg.click('[data-action=demo]'); await idle(pg)
    await pg.evaluate("""import('./js/store.js').then(s => { const d = s.db, mau = d.pets[0], now = Date.now();
      d.pets.push({id: 'tigerpet01', name: 'Tiger', species: 'Katze', createdAt: now});
      const lachs = d.products.find(p => p.variety === 'Lachs in Soße');
      for (let i = 0; i < 2; i++) d.servings.unshift({id: 'tigerserv' + i, productId: lachs.id, servedAt: now - i * 36e5, pets: {tigerpet01: {r: 'schlecht', at: now}}});
      s.save(); return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    lachs = await state(pg, "db.products.find(p => p.variety === 'Lachs in Soße').id")
    where = f"""c => [...c.querySelectorAll('.shop')].map(u => [u.previousElementSibling.innerText, (b => b ? b.querySelector('.t-main small').innerText : null)(u.querySelector('[data-id="{lachs}"]'))]).filter(x => x[1] !== null)"""
    house = await pg.eval_on_selector('[data-sec=shop]', where)
    await pg.click('[data-action=filter][data-id=tigerpet01]'); await idle(pg)
    tiger = await pg.eval_on_selector('[data-sec=shop]', where)
    await pg.click('[data-action=filter][data-id=all]'); await idle(pg)
    check(house == [['Nachkaufen', 'Sheba, für Mau']] and tiger == [['Nicht mehr kaufen', 'Sheba']],
          f'shopping: „Gemischt“ sits under „Nachkaufen“ with „für Mau“, and with the Tiger filter that pet\u2019s verdict applies ({house}, {tiger})')
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{lachs}'}}))"); await idle(pg)
    seg = await pg.eval_on_selector_all('#sheet .seg [data-action=buy]', 'l => l.map(b => [b.innerText.trim(), b.getAttribute("aria-pressed")])')
    lines = await pg.eval_on_selector('#sheet .verdict', 'v => [v.querySelector("p").innerText.replace(/\\s+/g, " ").trim(), ...[...v.querySelectorAll(".verdict-pet")].map(x => x.innerText.replace(/\\s+/g, " ").trim())]')
    check(seg == [['Automatisch', 'true'], ['Immer kaufen', 'false'], ['Nicht kaufen', 'false']] and lines[0] == 'Gemischt: Mau ja, Tiger nein'
          and lines[1].startswith('Mau: Nachkaufen') and '4× bewertet, zuletzt' in lines[1] and lines[2] == 'Tiger: Nicht mehr kaufen 2× bewertet, zuletzt Kaum angerührt',
          f'food sheet „Kaufen“: Automatisch · Immer kaufen · Nicht kaufen, the verdict below, one line per pet ({lines})')
    await shot(pg, 'food-buying')
    await pg.click('#sheet [data-action=buy][data-v=nicht]'); await idle(pg)
    check(await state(pg, f"db.products.find(p => p.id === '{lachs}').kaufen") == 'nicht'
          and await pg.get_attribute('#sheet [data-action=buy][data-v=nicht]', 'aria-pressed') == 'true', '„Nicht kaufen“: stored and selected')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    check(await pg.locator(f'#sheet .plist [data-action=serve][data-id="{lachs}"]').count() == 0, 'feeding: varieties that are no longer bought are absent from the quick picker')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{lachs}'}}))"); await idle(pg)
    await pg.click('#sheet [data-action=buy][data-v=auto]'); await idle(pg)
    check(await state(pg, f"!('kaufen' in db.products.find(p => p.id === '{lachs}'))"), '„Automatisch“: the field is dropped')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_cards(browser, url):
    print('home page: hint, shopping and insights with „Alle anzeigen“, the history always open')
    ctx = await phone(browser, touch=True, motion=True)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]'); await idle(pg)
    # History: the calendar and the last five meals, grouped by day
    recent = await pg.evaluate("import('./js/store.js').then(s => s.db.servings.slice(0, 5).map(x => x.id))")
    shown = await pg.eval_on_selector_all('[data-sec=hist] .tl-item', 'l => l.map(b => b.dataset.id)')
    check(await pg.locator('[data-sec=hist] .cal').is_visible() and await pg.locator('[data-sec=hist] .tl-node').first.is_visible()
          and shown == recent and await pg.locator('[data-sec=hist] .tl-day').count() >= 2, f'history: the calendar and the last five meals by day ({len(shown)})')
    # Shopping folded up: up to 3 to buy again, below them up to 2 no longer bought
    groups = """import('./js/derive.js').then(d => { const m = d.model(), g = e => e.choice === 'gemischt' ? 'nachkaufen' : e.choice, shown = m.sorts.filter(e => e.n || e.kaufen);
      return {ja: shown.filter(e => g(e) === 'nachkaufen').map(e => e.id), offen: shown.filter(e => g(e) === 'beobachten').map(e => e.id),
              nein: shown.filter(e => g(e) === 'nicht').map(e => e.id), ins: m.insights.length}; })"""
    SHOP = """c => ({grp: [...c.querySelectorAll('.grp')].map(g => [g.innerText]),
      ids: [...c.querySelectorAll('.shop')].map(u => [...u.querySelectorAll('[data-action=open-product]')].map(b => b.dataset.id)),
      bars: c.querySelectorAll('.shop .bar').length, rows: c.querySelectorAll('.shop li').length,
      btn: [...c.querySelectorAll('.card-btn[data-action=expand]')].map(b => [b.innerText, b.dataset.action, b === c.lastElementChild, b.getAttribute('aria-expanded')])})"""
    m = await pg.evaluate(groups)
    shop = await pg.eval_on_selector('[data-sec=shop]', SHOP)
    parts = [(t_, ids) for t_, ids in (('Nachkaufen', m['ja'][:3]), ('Nicht mehr kaufen', m['nein'][:2])) if ids]
    check(shop['ids'] == [ids for _, ids in parts] and [g[0] for g in shop['grp']] == [t_ for t_, _ in parts] and shop['bars'] == 0
          and shop['btn'] == [['Alle anzeigen', 'expand', True, 'false']], f'shopping folded up: up to 3 to buy again, up to 2 no longer, „Alle anzeigen“ at the end ({shop["ids"]})')
    # Keyboard: Enter eases it open (220 ms), the focus stays on the button, space folds it shut
    await pg.focus('[data-sec=shop] [data-action=expand]'); await pg.keyboard.press('Enter')
    anim = await pg.eval_on_selector('[data-sec=shop] .card-body', 'b => [b.classList.contains("animating"), b.style.height !== "", b.style.transition]')
    check(anim[0] and anim[1] and '0.22s' in anim[2] and 'ease-out' in anim[2], f'the card eases open ({anim[2]})')
    await idle(pg)
    shop = await pg.eval_on_selector('[data-sec=shop]', SHOP)
    parts = [(t_, ids) for t_, ids in (('Nachkaufen', m['ja']), ('Beobachten', m['offen']), ('Nicht mehr kaufen', m['nein'])) if ids]
    check(shop['ids'] == [ids for _, ids in parts] and [g[0] for g in shop['grp']] == [t_ for t_, _ in parts] and shop['bars'] == shop['rows']
          and shop['btn'] == [['Weniger anzeigen', 'expand', True, 'true']] and await pg.evaluate("document.activeElement.dataset.v") == 'shop'
          and await pg.eval_on_selector('[data-sec=shop] .card-body', 'b => b.style.height === "" && !b.classList.contains("animating")'),
          f'unfolded: every variety under Nachkaufen, Beobachten, Nicht mehr kaufen, with score bars, „Weniger anzeigen“, and the focus stays ({[g[0] for g in shop["grp"]]})')
    await pg.keyboard.press(' '); await idle(pg)
    check(await pg.inner_text('[data-sec=shop] [data-action=expand]') == 'Alle anzeigen' and await pg.locator('[data-action=share-list]').count() == 0 and await pg.locator('[data-sec=shop] .bar').count() == 0, 'space folds it shut again')
    ins = await pg.eval_on_selector('[data-sec=ins]', 'c => [c.querySelectorAll(".ins li").length, [...c.querySelectorAll(".card-btn")].map(b => b.innerText)]')
    check(m['ins'] > 1 and ins == [1, ['Alle anzeigen', 'Zur Auswertung']], f'insights folded up: the most important one, with „Alle anzeigen“ and „Zur Auswertung“ below ({ins}, {m["ins"]} in total)')
    await pg.tap('[data-sec=ins] [data-action=expand]'); await idle(pg)
    check(await pg.locator('[data-sec=ins] .ins li').count() == m['ins'] and await pg.inner_text('[data-sec=ins] [data-action=expand]') == 'Weniger anzeigen', 'a tap shows every insight')
    await pg.reload(); await started(pg)
    check(await pg.locator('[data-sec=ins] .ins li').count() == 1 and await pg.locator('[data-sec=shop] .bar').count() == 0,
          'after a restart everything is folded up')
    await pg.emulate_media(reduced_motion='reduce')
    await pg.click('[data-sec=shop] [data-action=expand]'); await idle(pg)
    check(await pg.locator('[data-sec=shop] .bar').count() > 0 and await pg.eval_on_selector('[data-sec=shop] .card-body', 'b => !b.classList.contains("animating") && b.style.height === ""'),
          'reduced motion: at once, without animation')
    # Hint: at most one, a sentence, a reason, the buttons; „Nicht mehr kaufen“ and „Immer kaufen“ set kaufen, and „Ausblenden“ is remembered by the device
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
        ok &= h['btns'] == {'stop': ['Nicht mehr kaufen', 'Ausblenden'], 'sosse': ['Ausblenden'], 'liebling': ['Immer kaufen', 'Ausblenden']}[first['kind']]
        seen.append(first['kind'])
        if first['kind'] in ('stop', 'liebling') and seen.count(first['kind']) == 1:
            await pg.click('[data-sec=hint] [data-action=hint-buy]'); await idle(pg)
            ok &= await state(pg, f"db.products.find(p => p.id === '{first['id']}').kaufen") == ('nicht' if first['kind'] == 'stop' else 'immer')
        else:
            await pg.click('[data-sec=hint] [data-action=hide-hint]'); await idle(pg)
            ok &= await state(pg, f"prefs.hiddenHints.includes('{first['kind']}:{first['id']}')")
    check(ok and 'stop' in seen and 'liebling' in seen and seen == sorted(seen, key=['stop', 'sosse', 'liebling'].index) and await pg.locator('[data-sec=hint]').count() == 0,
          f'hint: always the one with the highest precedence, with its buttons; once settled or hidden the next one follows ({seen})')
    pins = await pg.eval_on_selector_all('[data-sec=shop] .shop button', 'l => l.filter(b => b.querySelector(".pin")).map(b => b.dataset.id)')
    check(len(pins) == 2 and set(pins) == set(await state(pg, "db.products.filter(p => p.kaufen).map(p => p.id)")), f'a manual setting: the pin on the variety ({len(pins)})')
    # Empty state: no verdict and no insight yet
    await pg.evaluate("""import('./js/store.js').then(s => { s.db.servings.forEach(x => { for (const k in x.pets) x.pets[k].r = null; }); s.db.products.forEach(p => delete p.kaufen);
      s.db.servings[0].pets[Object.keys(s.db.servings[0].pets)[0]].r = 'gut'; s.save(); return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    empty = await pg.eval_on_selector('[data-sec=shop]', 'c => [c.querySelector(".card-body > .card-line").innerText, c.querySelectorAll(".shop, .card-btn, .card-body > :not(.card-line, .taste)").length]')
    check(empty == ['Noch zu wenig Bewertungen. Nach ein paar Mahlzeiten siehst du hier, was ankommt.', 0] and await pg.locator('[data-sec=ins], [data-sec=hint]').count() == 0,
          f'no verdict yet: only the one line, no card without an insight, no hint card without a hint ({empty[0]})')
    # Calendar: a tap on a day before the day before yesterday shows the older days and jumps to them
    old = await pg.evaluate("""(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 2);
      const b = [...document.querySelectorAll('.cal .day.has')].find(x => new Date(x.dataset.day + 'T12:00').getTime() < d.getTime()); return b && b.dataset.day; })()""")
    await pg.click(f'.cal .day[data-day="{old}"]'); await idle(pg)
    top = await pg.eval_on_selector(f'#d-{old}', 'd => [d.getBoundingClientRect().top, d.className, getComputedStyle(d).animationName, innerHeight]')
    check(0 <= top[0] < top[3] - 48 and top[1] == 'tl-day' and top[2] == 'none',
          f'a tap in the calendar on an older day: it appears in the history and is jumped to, without a glow ({old}, {top})')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


HOUSE = """([meals]) => import('./js/store.js').then(async s => { const at = t => new Date(t).getTime(), d = s.defaults();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}, {id: 'tiger00001', name: 'Tiger', species: 'Katze', createdAt: 2}];
  d.products = [['lachs', 'Sheba', 'Lachs in Soße'], ['huhn', 'Felix', 'Huhn in Gelee'], ['rind', 'Gourmet', 'Rind Pastete'], ['ente', 'Miamor', 'Ente', 'immer'], ['kaese', 'Dreamies', 'Käse', 'nicht'], ['pute', 'Animonda', 'Pute']]
    .map(([id, brand, variety, kaufen]) => ({id: id + '000001', brand, variety, type: 'Nassfutter', codes: {}, createdAt: 1, ...(kaufen ? {kaufen} : {})}));
  d.servings = meals.map(([pid, pets, when, by], i) => ({id: 'meal' + String(i).padStart(6, '0'), productId: pid && pid + '000001', servedAt: at(when), note: '', ...(by ? {by} : {}),
    pets: Object.fromEntries(Object.entries(pets).map(([k, r]) => [k === 'M' ? 'minka00001' : 'tiger00001', {r, at: r ? at(when) : null}]))}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


def house_meals():
    T, G, M, X = 'top', 'gut', 'mittel', 'schlecht'
    day = lambda d, h='08:00': f'2026-{d}T{h}'
    return ([['lachs', {'M': T}, day(f'05-{10 + i}'), 'Anna'] for i in range(3)]                      # Lachs: Minka buys again
            + [['huhn', {'M': G, 'T': X}, day(f'05-{14 + i}'), 'Jonas'] for i in range(3)]            # Huhn: Minka yes, Tiger no = mixed
            + [['rind', {'T': X}, day(f'05-{18 + i}'), 'Anna'] for i in range(2)]                     # Rind: stop buying
            + [['pute', {'M': G}, day('05-25'), 'Anna'], ['kaese', {'M': T}, day('05-26'), 'Anna']]
            + [['pute', {'M': T}, day('06-01', '00:00'), 'Anna'], ['pute', {'M': T}, day('06-02'), 'Anna'], ['lachs', {'T': G}, day('06-03'), 'Jonas'],
               ['lachs', {'T': T}, day('06-04'), 'Jonas'], ['ente', {'M': M}, day('06-05'), 'Anna'], [None, {'M': None}, day('06-06'), 'Jonas'],
               ['huhn', {'M': G}, day('06-07', '23:59'), ''], ['lachs', {'M': T}, day('06-07', '12:00'), 'Anna']])


async def test_week(browser, url):
    print('home page: rating buttons, „Letzte Woche“, „Geschmack bekannt“, sharing the list, appetite')
    ctx = await browser.new_context(viewport={'width': 360, 'height': 800}, timezone_id='Europe/Berlin', permissions=['clipboard-read', 'clipboard-write'])
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-09T10:00:00+02:00')
    await pg.click('[data-action=demo]'); await idle(pg)
    # Five rating buttons at 360 px, in the card and in the sheet
    ROW = """row => [...row.children].map(b => { const r = b.getBoundingClientRect(), lines = [...b.querySelectorAll('span, small')];
      return {r: b.dataset.r, w: r.width, h: r.height, top: Math.round(r.top), lines: lines.map(e => e.innerText), page: document.documentElement.scrollWidth <= innerWidth,
        fits: lines.every(e => e.scrollWidth <= e.clientWidth + .5 && e.getBoundingClientRect().height < parseFloat(getComputedStyle(e).lineHeight) * 1.5)}; })"""
    LINES = [['Sofort', 'leer'], ['Später', 'leer'], ['Halb', 'gegessen'], ['Soße', 'geleckt'], ['Kaum', 'angerührt']]
    for where, sel in (('card „Wie war’s?“', '.pend .rate-row'), ('sheet', '#sheet .rate-row')):
        if where == 'sheet':
            await pg.click('.pend-head'); await idle(pg)
        b = await pg.eval_on_selector(sel, ROW)
        check([x['r'] for x in b] == ['top', 'gut', 'mittel', 'sosse', 'schlecht'] and [x['lines'] for x in b] == LINES and len({x['top'] for x in b}) == 1
              and max(x['w'] for x in b) - min(x['w'] for x in b) < .6 and all(x['fits'] and x['page'] and x['h'] >= 48 for x in b),
              f'{where}: five equally wide buttons in the scale\u2019s order, nothing clipped or wrapped at 360 px, at least 48 px tall')
    await shot(pg, 'rating-360')
    await pg.click('[data-action=close]'); await idle(pg)
    # A household with a previous week: the „Letzte Woche“ card after the hint and before „Verlauf“
    await pg.evaluate(HOUSE, [house_meals()]); await idle(pg)
    heads = await pg.eval_on_selector_all('#home > section.card', 'l => l.map(s => s.querySelector("h2").innerText)')
    hint = [h for h in heads if h in ('Appetit', 'Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    check(len(hint) == 1 and heads[:5] == ['Minka und Tiger'] + hint + ['Letzte Woche', 'Verlauf', 'Einkaufen'], f'„Letzte Woche“ sits right after the hint, then „Verlauf“ and „Einkaufen“ ({heads})')
    w = {'lines': await pg.eval_on_selector_all('[data-sec=week] .week p', 'l => l.map(p => p.innerText.trim())')}
    check(w['lines'] == ['8× gefüttert, 7 bewertet', 'Minka mochte am liebsten Pute', 'Tiger mochte am liebsten Lachs in Soße', 'Neuer Liebling: Pute', 'Gefüttert: Anna 4×, Jonas 3×'],
          f'„Letzte Woche“: meals, the favourite variety per pet, a new favourite, the feeding duel with the most first, not counted without a name ({w["lines"]})')
    await shot(pg, 'last-week')
    await pg.evaluate("import('./js/store.js').then(async s => { s.db.servings.find(x => !x.by && x.servedAt > new Date(2026, 5, 1).getTime()).by = 'Jonas'; s.save(); (await import('./js/views/home.js')).renderHome(); })")
    await idle(pg)
    duel = await pg.inner_text('[data-sec=week] .duel')
    await pg.evaluate("import('./js/store.js').then(async s => { s.db.servings.filter(x => x.servedAt > new Date(2026, 5, 1).getTime()).forEach(x => { x.by = 'Anna'; }); s.save(); (await import('./js/views/home.js')).renderHome(); })")
    await idle(pg)
    check(duel.strip() == 'Gleichstand: Anna und Jonas je 4×' and await pg.locator('[data-sec=week] .duel').count() == 0,
          f'feeding duel: on a tie „{duel.strip()}“, and with only one person no line at all')
    # „Schließen“ applies per week
    await pg.evaluate("import('./js/views/home.js').then(h => h.renderHome())")
    await pg.click('[data-action=close-week]'); await idle(pg)
    closed = [await pg.locator('[data-sec=week]').count(), await state(pg, 'prefs.closedWeek')]
    await pg.reload(); await started(pg)
    closed.append(await pg.locator('[data-sec=week]').count())
    await pg.clock.set_fixed_time('2026-06-15T09:00:00+02:00')
    await pg.evaluate("""import('./js/store.js').then(async s => { for (let i = 0; i < 5; i++) s.db.servings.unshift({id: 'neuewoche' + i, productId: 'lachs000001', servedAt: new Date(2026, 5, 9 + i, 8).getTime(), note: '', by: 'Anna', pets: {minka00001: {r: 'top', at: 1}}});
      s.save(); (await import('./js/views/home.js')).renderHome(); })"""); await idle(pg)
    closed.append(await pg.locator('[data-sec=week]').count())
    check(closed == [0, '2026-06-01', 0, 1], f'the device remembers „Schließen“ for that week, across a restart too; the next week shows up again ({closed})')
    # „Geschmack bekannt“ as the footer of the „Einkaufen“ card
    TASTE = """c => { const t = c.querySelector('.taste'), m = t.querySelector('.meter');
      return {text: t.firstChild.textContent.trim(), share: m.querySelector('i').getBoundingClientRect().width / m.getBoundingClientRect().width}; }"""
    t = await pg.eval_on_selector('[data-sec=shop]', TASTE)
    check(t['text'] == 'Geschmack eurer Tiere: 5 von 8 Sorten bekannt' and abs(t['share'] - .625) < .01, f'„Geschmack bekannt“ for the household, with the bar showing the share ({t})')
    await pg.click('[data-action=filter][data-id=minka00001]'); await idle(pg)
    t = await pg.eval_on_selector('[data-sec=shop]', TASTE)
    check(t['text'] == 'Minkas Geschmack: 3 von 5 Sorten bekannt', f'„Geschmack bekannt“ with the pet filter ({t["text"]})')
    await shot(pg, 'taste-known')
    names = await pg.evaluate("""import('./js/store.js').then(async s => { const h = await import('./js/views/home.js'), out = [];
      for (const n of ['Max', 'Minka']) { s.db.pets[0].name = n; s.save(); h.renderHome(); out.push(document.querySelector('.taste').firstChild.textContent.split(':')[0]); } return out; })""")
    check(names == ['Max’ Geschmack', 'Minkas Geschmack'], f'the genitive of the pet\u2019s name ({names})')
    # Sharing the shopping list: unfolded via „Weniger anzeigen“, the text matching the pet filter
    await pg.click('[data-action=filter][data-id=all]'); await idle(pg)
    check(await pg.locator('[data-action=share-list]').count() == 0, '„Als Liste teilen“ is absent from the folded card')
    await pg.click('[data-action=expand][data-v=shop]'); await idle(pg)
    await shot(pg, 'shopping-share')
    await pg.click('[data-action=share-list]'); await idle(pg)
    house = await pg.evaluate('navigator.clipboard.readText()')
    toast = await pg.inner_text('#toast')
    want = 'Einkaufen für Minka und Tiger\n\nNachkaufen\n- Sheba Lachs in Soße\n- Animonda Pute\n- Miamor Ente\n- Felix Huhn in Gelee (für Minka)\n\nNicht kaufen\n- Dreamies Käse\n- Gourmet Rind Pastete'
    check(house == want and 'Liste kopiert' in toast, f'the household list: „Nachkaufen“ with „Gemischt“ (für …) and `immer`, „Nicht kaufen“ with `nicht`, without „Beobachten“; without a share menu it goes to the clipboard with a toast ({house!r})')
    lists = await pg.evaluate("""import('./js/store.js').then(async s => { const d = await import('./js/derive.js'), out = [];
      for (const p of ['minka00001', 'tiger00001']) { s.prefs.activePet = p; out.push(d.shoppingList().text); } s.prefs.activePet = 'all'; return out; })""")
    check(lists == ['Einkaufen für Minka\n\nNachkaufen\n- Sheba Lachs in Soße\n- Animonda Pute\n- Felix Huhn in Gelee\n- Miamor Ente\n\nNicht kaufen\n- Dreamies Käse',
                    'Einkaufen für Tiger\n\nNachkaufen\n- Miamor Ente\n\nNicht kaufen\n- Felix Huhn in Gelee\n- Gourmet Rind Pastete\n- Dreamies Käse'],
          f'the list with a pet filter: that pet\u2019s verdicts, and empty groups are left out ({lists})')
    await pg.evaluate("navigator.share = o => { window.__shared = o; return Promise.resolve(); }")
    await pg.click('[data-action=share-list]'); await idle(pg)
    shared = await pg.evaluate('window.__shared')
    check(shared and shared['text'] == want and shared['title'] == 'Einkaufen für Minka und Tiger', 'in the browser with a share menu: navigator.share gets the title and the text')
    # The „Appetit“ hint in the hint card
    await pg.clock.set_fixed_time('2026-06-09T10:00:00+02:00')
    low = [['lachs', {'M': 'top'}, f'2026-05-{25 + i}T08:00', 'Anna'] for i in range(7)] + [['lachs', {'M': 'top'}, '2026-06-01T08:00', 'Anna'],
           ['rind', {'M': 'mittel'}, '2026-06-07T18:00', 'Anna'], ['huhn', {'M': 'sosse'}, '2026-06-08T14:00', 'Anna'], ['rind', {'M': 'schlecht'}, '2026-06-09T07:00', 'Anna']]
    await pg.evaluate(HOUSE, [low]); await idle(pg)
    HINT = """c => ({title: c.querySelector('h2').innerText, say: c.querySelector('.say').innerText, why: c.querySelector('.why').innerText, btns: [...c.querySelectorAll('.btn-row button')].map(b => [b.innerText, b.className, b.dataset.v])})"""
    h = await pg.eval_on_selector('[data-sec=hint]', HINT)
    check(await pg.locator('[data-sec=hint]').count() == 1 and h == {'title': 'Appetit', 'say': 'Minka frisst seit ein paar Tagen schlechter als sonst.', 'why': 'Die letzten 3 Bewertungen im Schnitt 27 %, sonst 100 %.',
                                                                    'btns': [['Ausblenden', 'btn soft', 'appetit:minka00001:2026-06-09']]},
          f'the „Appetit“ hint has the highest precedence: a sentence, a reason, only „Ausblenden“ ({h})')
    await shot(pg, 'hint-appetite')
    await pg.click('[data-sec=hint] [data-action=hide-hint]'); await idle(pg)
    nxt = await pg.eval_on_selector('[data-sec=hint]', HINT)
    check(nxt['title'] != 'Appetit' and await state(pg, "prefs.hiddenHints.includes('appetit:minka00001:2026-06-09')"), f'the device remembers „Ausblenden“ and the next hint moves up ({nxt["title"]})')
    check(not real_errors(errors), 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


SCALES_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now(), H = 36e5;
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['trocken', 'Josera', 'Trockenfutter'], ['snack', 'Dreamies', 'Snack']].map(([id, brand, type]) => ({id: id + '0001', brand, variety: '', type, codes: {}, createdAt: 1}));
  d.servings = [['trocken', null, 1], ['snack', null, 2], ['trocken', 'gut', 20], ['trocken', 'gern', 21], ['trocken', 'gern', 22], ['trocken', 'liegen', 23]]
    .map(([pid, r, ago], i) => ({id: 'meal00000' + i, productId: pid + '0001', servedAt: now - ago * H, note: '', pets: {minka00001: {r, at: r ? now - ago * H : null}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_scales(browser, url):
    print('rating per food type: the variety\u2019s scale, four columns at 360 px, a foreign level stays visible, counters in the food sheet')
    ctx = await browser.new_context(viewport={'width': 360, 'height': 800}, reduced_motion='reduce')
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(SCALES_DB); await idle(pg)
    ROW = """row => [...row.children].map(b => { const r = b.getBoundingClientRect(), lines = [...b.querySelectorAll('span, small')];
      return {r: b.dataset.r, w: r.width, h: r.height, top: Math.round(r.top), lines: lines.map(e => e.innerText), icon: !!b.querySelector('svg path, svg circle'),
        fits: document.documentElement.scrollWidth <= innerWidth && lines.every(e => e.scrollWidth <= e.clientWidth + .5)}; })"""
    want = {'Trockenfutter': [['gern', 'Gern', 'gefressen'], ['normal', 'Normal', 'gefressen'], ['wenig', 'Wenig', 'gefressen'], ['liegen', 'Liegen', 'gelassen']],
            'Snack': [['verputzt', 'Sofort', 'verputzt'], ['spaeter', 'Später', 'gefressen'], ['angeknabbert', 'Nur', 'angeknabbert'], ['unberuehrt', 'Nicht', 'angerührt']]}
    for i, (kind, levels) in enumerate(want.items()):
        b = await pg.locator('.pend .rate-row').nth(i).evaluate(ROW)
        check([[x['r']] + x['lines'] for x in b] == levels and len({x['top'] for x in b}) == 1 and max(x['w'] for x in b) - min(x['w'] for x in b) < .6
              and all(x['fits'] and x['icon'] and x['h'] >= 48 for x in b), f'{kind}: four equally wide buttons of its own scale with icons, nothing clipped at 360 px')
    await shot(pg, 'rating-scales-360')
    # A stored level from another scale: its own wording and icon, and one tap replaces it
    await pg.click('.tl-item[data-id=meal000002]'); await idle(pg)
    old = await pg.evaluate("[document.querySelector('#sheet .pet-rate > .badge')?.innerText.trim(), !!document.querySelector('#sheet .pet-rate > .badge svg'), document.querySelectorAll('#sheet .rb').length, document.querySelectorAll('#sheet .rb[aria-pressed=true]').length]")
    check(old == ['Später leer', True, 4, 0], f'a level outside the scale sits above the four buttons with its own wording and icon ({old})')
    # Counters in the food sheet: the scale's levels, other levels that occur after them
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=open-product][data-id=trocken0001]'); await idle(pg)
    cnt = await pg.eval_on_selector_all('#sheet .cnt', "l => l.map(c => [c.querySelector('span').innerText.replace('\\n', ' '), +c.querySelector('b').innerText, c.getBoundingClientRect().right <= innerWidth])")
    check(cnt == [['Gern gefressen', 2, True], ['Normal gefressen', 0, True], ['Wenig gefressen', 0, True], ['Liegen gelassen', 1, True], ['Später leer', 1, True]],
          f'the food sheet counts the scale\u2019s levels, other levels that occur after them ({cnt})')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('.tl-item[data-id=meal000002]'); await idle(pg)
    await pg.click('#sheet [data-r=normal]'); await idle(pg)
    r = await state(pg, "db.servings.find(x => x.id === 'meal000002').pets.minka00001.r")
    await pg.click('.tl-item[data-id=meal000002]'); await idle(pg)
    now = await pg.evaluate("[!!document.querySelector('#sheet .pet-rate > .badge'), document.querySelector('#sheet .rb[aria-pressed=true]')?.dataset.r]")
    check(r == 'normal' and now == [False, 'normal'], f'one tap on a button replaces the old level ({r}, {now})')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


TEXTURE_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['nass', 'Sheba', 'Lachs', 'Nassfutter'], ['snack', 'Dreamies', 'Käse', 'Snack'], ['trocken', 'Josera', 'Huhn in Soße', 'Trockenfutter']]
    .map(([id, brand, variety, type]) => ({id: id + '0001', brand, variety, type, codes: {}, createdAt: 1}));
  d.servings = d.products.map((p, i) => ({id: 'meal00000' + i, productId: p.id, servedAt: now - (i + 30) * 36e5, note: '', pets: {minka00001: {r: 'top', at: now}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_texture(browser, url):
    print('consistency and treat type: the choice per type, the note on „Fester Block“, changing type, keywords, the server\u2019s value')
    ctx = await browser.new_context(viewport={'width': 360, 'height': 800}, reduced_motion='reduce')
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(TEXTURE_DB); await idle(pg)
    CHIPS = """() => { const chips = [...document.querySelectorAll('#sheet [data-action=set-texture]')], label = chips[0]?.closest('.chips').previousElementSibling, box = label?.parentElement;
      return {title: label?.innerText, labels: chips.map(c => c.innerText), on: chips.filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.v),
        fits: chips.every(c => c.getBoundingClientRect().right <= innerWidth && c.getBoundingClientRect().height >= 44),
        under: box?.previousElementSibling?.className, note: document.querySelector('#sheet .note')?.innerText || ''}; }"""
    async def product(pid):
        await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}0001'}}))"); await idle(pg)
        return await pg.evaluate(CHIPS)
    tex = lambda pid: state(pg, f"(p => p.texture ?? null)(db.products.find(p => p.id === '{pid}0001'))")
    c = await product('nass')
    check(c == {'title': 'Konsistenz', 'labels': ['In Soße', 'In Gelee', 'Pastete', 'Mousse', 'Fester Block', 'Suppe'], 'on': [], 'fits': True, 'under': 'prod-card', 'note': ''},
          f'food sheet, wet food: „Konsistenz“ with six chips under the type, never mandatory, nothing clipped at 360 px ({c})')
    await pg.click('#sheet [data-action=set-texture][data-v=block]'); await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(c['on'] == ['block'] and c['note'] == 'Vor dem Servieren zerkleinern' and await tex('nass') == 'block', f'„Fester Block“ chosen: stored, with a small note about breaking it up ({c["on"]}, {c["note"]})')
    await shot(pg, 'food-consistency-360')
    await pg.click('#sheet [data-action=set-texture][data-v=block]'); await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(c['on'] == [] and c['note'] == '' and await state(pg, "!('texture' in db.products.find(p => p.id === 'nass0001'))"), 'a second tap clears the choice and the field is dropped')
    await pg.click('#sheet [data-action=set-texture][data-v=gelee]'); await pg.click('#sheet [data-action=set-texture][data-v=pastete]'); await idle(pg)
    check((await pg.evaluate(CHIPS))['on'] == ['pastete'] and await tex('nass') == 'pastete', 'single choice: the new pick replaces the old one')
    await pg.click('[data-action=close]'); await idle(pg)
    c = await product('snack')
    check(c['title'] == 'Snack-Art' and c['labels'] == ['Knusprig', 'Weich', 'Creme', 'Milch', 'Stick', 'Kauartikel'] and c['fits'], f'food sheet, treat: „Snack-Art“ with six chips ({c})')
    await pg.click('[data-action=close]'); await idle(pg)
    c = await product('trocken')
    check(c['labels'] == [] and await tex('trocken') is None, 'dry food: no choice at all')
    await pg.click('[data-action=close]'); await idle(pg)
    # Naming: the chips under the type, and on a type change a value that no longer fits is dropped
    await product('nass')
    await pg.click('[data-action=rename-product]'); await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(c['title'] == 'Konsistenz' and c['on'] == ['pastete'] and c['under'] == 'chips' and c['fits'], f'naming: the chip row sits under the type and shows the choice ({c})')
    await pg.click('#sheet [data-action=set-type][data-v=Snack]'); await idle(pg)
    c = await pg.evaluate(CHIPS)
    await pg.click('#sheet [data-action=set-type][data-v=Sonstiges]'); await idle(pg)
    none = await pg.evaluate(CHIPS)
    check(c['title'] == 'Snack-Art' and c['on'] == [] and none['labels'] == [], 'type changed: the new type\u2019s choice, with no value; under „Sonstiges“ no row at all')
    await pg.click('[data-action=save-name]'); await idle(pg)
    check(await state(pg, "(p => p.type === 'Sonstiges' && !('texture' in p))(db.products.find(p => p.id === 'nass0001'))"), 'stored: with the type the consistency is gone too')
    await pg.click('[data-action=close]'); await idle(pg)
    # Keywords while naming: they only fill an empty field; a choice and a deliberate "none" both stand
    async def name_new(variety, pick=None, twice=False, kind='Nassfutter'):
        await pg.click('#fab'); await idle(pg)
        await pg.click('[data-action=new-product]'); await idle(pg)
        await pg.fill('#f-brand', 'Miamor'); await pg.fill('#f-variety', variety)
        await pg.click(f'#sheet [data-action=set-type][data-v={kind}]'); await idle(pg)
        for _ in range((pick is not None) + twice):
            await pg.click(f'#sheet [data-action=set-texture][data-v={pick}]'); await idle(pg)
        await pg.click('[data-action=save-name]'); await idle(pg)
        return await state(pg, f"(p => p.texture ?? null)(db.products.find(p => p.variety === '{variety}'))")
    got = [await name_new('Ragout in Gelee'), await name_new('Filet in Soße', 'mousse'), await name_new('Huhn in Jelly', 'gelee', twice=True), await name_new('Knusperkissen', kind='Snack'), await name_new('Kaninchen')]
    check(got == ['gelee', 'mousse', None, 'knusprig', None], f'naming: the keywords fill the empty field, while our own choice and a cleared field are kept ({got})')
    # Recognition and barcode hits: the server's value beats the keywords, but only when it fits the type; an existing value stays
    got = await pg.evaluate("""import('./js/logic/products.js').then(m => { const make = (variety, texture, type = 'Nassfutter') => m.newProduct({brand: 'Test', variety, type, texture}).texture ?? null;
      const old = m.newProduct({brand: 'Test', variety: 'Pute', type: 'Nassfutter', texture: 'suppe'}); m.applyTexture(old, {texture: 'gelee'});
      return [make('Huhn in Soße', 'gelee'), make('Rind in Soße', 'knusprig'), make('Ente in Soße'), make('Sticks', 'weich', 'Snack'), make('Kroketten in Soße', 'sosse', 'Trockenfutter'), old.texture]; })""")
    check(got == ['gelee', 'sosse', 'sosse', 'weich', None, 'suppe'], f'the server\u2019s value beats the keywords when it fits the type; an existing value stays ({got})')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


OVERVIEW_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now(), H = 36e5;
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['lachs', 'Lachs', 'Nassfutter'], ['rind', 'Rind', 'Nassfutter'], ['snack', 'Käse', 'Snack']].map(([id, variety, type]) => ({id: id + '00001', brand: 'Sheba', variety, type, codes: {}, createdAt: 1}));
  d.servings = [['snack', 'verputzt', 1], ['lachs', 'top', 2], ['lachs', 'top', 30], ['lachs', 'gut', 54], ['rind', 'schlecht', 60], ['rind', 'schlecht', 80]]
    .map(([pid, r, ago], i) => ({id: 'meal00000' + i, productId: pid + '00001', servedAt: now - ago * H, note: '', pets: {minka00001: {r, at: now}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_overview(browser, url):
    print('overview: a low card with picture, name and the essentials, two lines and unfolding; counting in the history, the gap above the calendar')
    ctx = await browser.new_context(viewport={'width': 360, 'height': 800}, reduced_motion='reduce', timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-09T12:00:00+02:00')
    await pg.evaluate(OVERVIEW_DB); await idle(pg)
    CARD = """() => { const c = document.querySelector('#home > section'), h = c.querySelector('h2'), other = document.querySelector('[data-sec=hist] h2'), pic = c.querySelector('.ov-pic'), p = c.querySelector('p');
      const font = e => { const s = getComputedStyle(e); return [s.fontFamily, s.fontWeight, s.fontSize].join(); }, r = c.getBoundingClientRect(), a = pic.querySelector('.av').getBoundingClientRect(), ps = getComputedStyle(p);
      return {first: c.classList.contains('overview'), height: Math.round(r.height), title: h.innerText, sameFont: font(h) === font(other), pic: [pic.tagName, pic.querySelectorAll('.av').length, a.width, a.left < h.getBoundingClientRect().left],
        text: p.innerText, bold: [...p.querySelectorAll('b')].map(b => b.innerText), lines: Math.round(p.clientHeight / parseFloat(ps.lineHeight) * 10) / 10, cut: p.scrollHeight > p.clientHeight + 1,
        dots: ps.webkitLineClamp === '2' && ps.display !== 'block', tap: [c.dataset.action ?? null, c.getAttribute('aria-expanded')], wide: document.documentElement.scrollWidth > innerWidth}; }"""
    c = await pg.evaluate(CARD)
    text = 'Bekam zuletzt vor 1 Std. einen Snack: Käse (Sofort verputzt). Am liebsten Lachs, Rind kommt nicht an.'
    check(c == {'first': True, 'height': 108, 'title': 'Minka', 'sameFont': True, 'pic': ['BUTTON', 1, 72, True], 'text': text, 'bold': ['vor 1 Std.', 'Käse', 'Lachs', 'Rind'], 'lines': 2, 'cut': True,
                'dots': True, 'tap': ['toggle-overview', 'false'], 'wide': False},
          f'the overview sits on top: the name in the heading typeface, the picture on the left at 72 px, the essentials in bold; never more than two lines (108 px), and longer text ends in „…“ ({c})')
    await shot(pg, 'overview-360')
    await pg.evaluate("window.__card = document.querySelector('.overview')")
    await pg.click('.overview p'); await idle(pg)
    o = await pg.evaluate(CARD)
    await shot(pg, 'overview-open-360')
    await pg.click('.overview h2'); await idle(pg)
    back = await pg.evaluate(CARD)
    check([o['cut'], o['dots'], o['tap'], o['text']] == [False, False, ['toggle-overview', 'true'], text] and o['height'] > 108 and back == c
          and await pg.evaluate("window.__card === document.querySelector('.overview')"),
          f'a tap on the card shows the whole text, a second folds it away again, both without redrawing the page ({o["height"]} px, {o["lines"]} lines)')
    day = await pg.evaluate("[document.querySelector('.tl-date span').innerText, document.querySelector('.day.today').getAttribute('aria-label')]")
    check(day == ['1 Mahlzeit, 1 Snack', 'Heute, 1 Mahlzeit, 1 Snack'], f'the history counts meals and treats separately, for screen readers in the calendar too ({day})')
    gap = await pg.evaluate("document.querySelector('.cal').getBoundingClientRect().top - document.querySelector('[data-sec=hist] h2').getBoundingClientRect().bottom")
    check(gap == 14, f'14 px from „Verlauf“ to the calendar, 8 more than before ({gap})')
    await pg.click('.ov-pic'); await idle(pg)
    check(await pg.input_value('#sheet #f-name') == 'Minka' and await pg.evaluate("!document.querySelector('.overview').classList.contains('open')"), 'a tap on the picture opens the pet and unfolds nothing')
    await pg.click('[data-action=close]'); await idle(pg)
    # Several pets: who last had what, the favourite variety per pet and what does not go down well
    await pg.evaluate("""import('./js/store.js').then(async s => { const now = Date.now(), H = 36e5;
      s.db.pets.push({id: 'tiger00001', name: 'Tiger', species: 'Hund', createdAt: 2});
      s.db.products.push({id: 'pute000001', brand: 'Rinti', variety: 'Pute', type: 'Nassfutter', codes: {}, createdAt: 1});
      [26, 50, 74].forEach((ago, i) => s.db.servings.push({id: 'tigermeal' + i, productId: 'pute000001', servedAt: now - ago * H, note: '', pets: {tiger00001: {r: 'top', at: now}}}));
      s.db.servings.unshift({id: 'beide00001', productId: 'lachs00001', servedAt: now - 5 * 6e4, note: '', pets: {minka00001: {r: null, at: null}, tiger00001: {r: null, at: null}}});
      s.save(); (await import('./js/views/home.js')).renderHome(); })"""); await idle(pg)
    house = await pg.evaluate(CARD)
    await pg.click('[data-action=filter][data-id=tiger00001]'); await idle(pg)
    tiger = await pg.evaluate(CARD)
    await pg.evaluate("import('./js/store.js').then(async s => { s.db.pets.push({id: 'kiwi000001', name: 'Kiwi', species: 'Vogel', createdAt: 3}); s.prefs.activePet = 'kiwi000001'; s.save(); (await import('./js/views/home.js')).renderHome(); })"); await idle(pg)
    kiwi = await pg.evaluate(CARD)
    check([house['title'], house['pic'][:2], house['text'], house['bold']] == ['Minka und Tiger', ['SPAN', 2], 'Minka und Tiger bekamen zuletzt vor 5 Min. Lachs. Minka mag am liebsten Lachs, Tiger Pute. Nicht an kommt bei Minka Rind.',
                                                                                 ['vor 5 Min.', 'Lachs', 'Lachs', 'Pute', 'Rind']] and house['height'] == 108 and house['dots'],
          f'under „Alle“ with several pets the text names them: who last had what, the favourite variety per pet, and what does not go down well with whom ({house["text"]})')
    check([tiger['title'], tiger['pic'][:2], tiger['text']] == ['Tiger', ['BUTTON', 1], 'Bekam zuletzt vor 5 Min. Lachs (noch offen). Am liebsten Pute.']
          and [kiwi['text'], kiwi['cut'], kiwi['tap'], kiwi['height']] == ['Noch nichts serviert.', False, [None, None], 108],
          f'the overview follows the filter; without a meal there is nothing to unfold ({tiger["text"]} / {kiwi["text"]})')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()
    # With motion: the text eases open and shut, and nothing is left behind afterwards
    ctx = await browser.new_context(viewport={'width': 360, 'height': 800}, reduced_motion='no-preference')
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(OVERVIEW_DB); await idle(pg)
    SLIDE = """() => new Promise(done => { const c = document.querySelector('.overview'), p = c.querySelector('p'), h = [p.offsetHeight]; c.click();
      setTimeout(() => h.push(p.getBoundingClientRect().height, p.classList.contains('animating')), 110);
      setTimeout(() => { h.push(p.offsetHeight, p.classList.contains('animating'), p.style.height, p.style.transition); done(h); }, 450); })"""
    up, down = await pg.evaluate(SLIDE), await pg.evaluate(SLIDE)
    check(up[0] < up[1] < up[3] and up[2:] == [True, up[3], False, '', ''] and down[0] > down[1] > down[3] and down[2:] == [True, up[0], False, '', ''],
          f'unfolding and folding ease through the height, without a redraw; afterwards everything is tidied up ({up[:2] + up[3:4]}, {down[:2] + down[3:4]})')
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
    serve = lambda i: pg.evaluate(f"import('./js/logic/feeding.js').then(f => f.serveProduct('sorte{i:05d}'))")
    toast = lambda: pg.eval_on_selector('#toast', 't => [t.querySelector("span").innerText, !!t.querySelector("[data-action=undo]")]')
    await pg.evaluate(FILL, [99, 9]); await idle(pg)
    await serve(0); await idle(pg)
    t1 = await toast()
    check(t1 == ['Sorte 0 serviert. Zum 100. Mal gefüttert!', True], f'when serving reaches a threshold it appears in the toast, and „Rückgängig“ stays ({t1})')
    await shot(pg, 'milestone')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    await serve(0); await idle(pg)
    t2 = await toast()
    check(t2 == ['Sorte 0 serviert', True] and await state(pg, "prefs.milestones.includes('meals:100')"), f'every threshold only once per device, after „Rückgängig“ too ({t2})')
    await serve(9); await idle(pg)
    t3 = await toast()
    check(t3 == ['Sorte 9 serviert. 10 Sorten probiert!', True], f'the tenth variety tried ({t3})')
    # Settings without milestones: what is already reached counts as seen
    await pg.evaluate(FILL, [250, 10]); await idle(pg)
    await pg.evaluate("import('./js/store.js').then(s => { delete s.prefs.milestones; s.savePrefs(); })"); await idle(pg)
    await pg.reload(); await started(pg)
    first = await state(pg, 'prefs.milestones')
    await pg.evaluate("import('./js/store.js').then(s => { s.db.servings.pop(); s.save(); })")
    await serve(1); await idle(pg)
    t4 = await toast()
    check(first == ['meals:50', 'meals:100', 'meals:250', 'sorts:10'] and t4 == ['Sorte 1 serviert', True], f'without remembered milestones what is reached counts as seen ({first}, {t4})')
    # Passed by another phone: silently seen, no wrong sentence
    await pg.evaluate(FILL, [520, 10]); await idle(pg)
    await pg.evaluate("import('./js/store.js').then(s => { s.prefs.milestones = ['meals:50', 'sorts:10']; })")
    await serve(1); await idle(pg)
    t5 = await toast()
    check(t5 == ['Sorte 1 serviert', True] and await state(pg, "prefs.milestones.includes('meals:500')"), f'thresholds already passed count silently as seen ({t5})')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_reminders(browser, url):
    print('the rating reminder (plugin simulated)')
    ctx = await phone(browser)
    await ctx.clock.install()
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=demo]'); await debounced(pg)
    await pg.evaluate("""import('./js/store.js').then(async s => { s.db.pets.push({id: 'tigerpet01', name: 'Tiger', species: 'Katze', createdAt: Date.now()}); s.save(); (await import('./js/views/home.js')).renderHome(); })""")
    pending = lambda: pg.evaluate("window.Capacitor.Plugins.LocalNotifications.getPending().then(r => r.notifications)")
    calls = lambda name: pg.evaluate(f"window.__calls.filter(c => c[0] === '{name}').map(c => c[1])")
    SEG = """() => { const l = [...document.querySelectorAll('#sheet .label')].find(x => x.innerText === 'Ans Bewerten erinnern'); let seg = l.nextElementSibling; while (seg && !seg.classList.contains('seg')) seg = seg.nextElementSibling;
      const rows = new Set([...seg.children].map(b => Math.round(b.getBoundingClientRect().top))).size, widths = [...seg.children].map(b => Math.round(b.getBoundingClientRect().width));
      return [...seg.querySelectorAll('button')].map(b => [b.innerText.trim(), b.getAttribute('aria-pressed'), b.dataset.action, rows === 1 && new Set(widths).size === 1 && b.scrollWidth <= b.clientWidth]); }"""
    await pg.click('[data-action=open-settings]'); await debounced(pg)
    seg = await pg.evaluate(SEG)
    check(seg == [['Aus', 'true', 'remind', True], ['1 Std.', 'false', 'remind', True], ['3 Std.', 'false', 'remind', True], ['6 Std.', 'false', 'remind', True], ['Eigene', 'false', 'remind-own', True]] and await state(pg, 'prefs.remind') == 0,
          f'settings, section „Erinnerung“: Aus · 1 Std. · 3 Std. · 6 Std. · Eigene as a segmented control in one row, „Aus“ by default ({[x[0] for x in seg]})')
    await shot(pg, 'settings-reminder')
    await pg.click('#sheet [data-action=remind][data-v="60"]'); await debounced(pg)
    seg = await pg.evaluate(SEG)
    toast = await pg.inner_text('#toast')
    check(len(await calls('requestPermissions')) == 1 and await state(pg, 'prefs.remind') == 0 and seg[0][1] == 'true' and 'nicht erlaubt' in toast,
          f'switching it on asks for the permission; denied, it goes back to „Aus“ with a short notice („{toast.strip()}“)')
    await pg.evaluate("localStorage.removeItem('__notifyPermission'); localStorage.setItem('__notifyAnswer', 'granted')")
    await pg.click('#sheet [data-action=remind][data-v="180"]'); await debounced(pg)
    seg = await pg.evaluate(SEG)
    await pg.reload(); await started(pg)
    check(seg[2][1] == 'true' and await state(pg, 'prefs.remind') == 180, 'granted: 3 Std. chosen and stored, in minutes')
    # Serving schedules one, at an approximate time without an exact alarm
    await pg.click('#fab'); await debounced(pg)
    await pg.click('.plist [data-action=serve]'); await debounced(pg)
    s = await state(pg, "(s => ({id: s.id, at: s.servedAt, name: db.products.find(p => p.id === s.productId).variety, pets: Object.keys(s.pets).map(id => db.pets.find(p => p.id === id).name)}))(db.servings[0])")
    notes = await pending()
    n = notes[0] if notes else {}
    due = await pg.evaluate("t => new Date(t).getTime()", n.get('schedule', {}).get('at'))
    check(len(notes) == 1 and n['title'] == 'Wie war’s?' and n['body'] == f'{s["name"]} für {" und ".join(s["pets"])}' and due == s['at'] + 180 * 60000 and n['extra']['serving'] == s['id']
          and n['isExactNotification'] is False and isinstance(n['id'], int) and 0 < n['id'] < 2 ** 31,
          f'serving schedules the notification for the serving time plus the interval, title „Wie war’s?“, body „{n.get("body")}“, without an exact alarm')
    # A tap opens the meal in the sheet
    await pg.evaluate("n => window.__tapNote({actionId: 'tap', notification: n})", n); await debounced(pg)
    opened = await pg.evaluate("import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.id])")
    check(opened == [True, 'serving', s['id']] and await pg.locator('#sheet .rate-row .rb').count() == 5 * len(s['pets']), f'a tap on the notification opens that meal\u2019s sheet for rating ({opened[1]})')
    # Rating: only once every pet is rated is it cancelled
    if len(s['pets']) > 1:
        await pg.click('#sheet .pet-rate:nth-child(1 of .pet-rate) [data-r=top]'); await debounced(pg)
        half = len(await pending())
        await pg.click('#sheet .pet-rate:nth-child(2 of .pet-rate) [data-r=gut]'); await debounced(pg)
    else:
        half = 1
        await pg.click('#sheet [data-r=top]'); await debounced(pg)
    check(half == 1 and await pending() == [] and any(c[0]['id'] == n['id'] for c in await calls('cancelNotes')), 'fully rated: the reminder is cancelled, and not before')
    # Unknown food, a meal that is too old, deleted, the time changed, the interval changed, switched off
    PLAN = """([id, ago, productId]) => import('./js/store.js').then(async s => { const t = Date.now() - ago * 60000;
      const x = {id, productId, servedAt: t, note: '', pets: {[s.db.pets[0].id]: {r: null, at: null}}}; s.db.servings.unshift(x); s.save();
      (await import('./js/logic/reminders.js')).planReminder(x); return t; })"""
    t0 = await pg.evaluate(PLAN, ['ohnesorte001', 2, None]); await debounced(pg)
    await pg.evaluate(PLAN, ['zualt0000001', 11, None]); await debounced(pg)
    notes = await pending()
    hhmm = await pg.evaluate("t => import('./js/dates.js').then(d => d.timeStr(t))", t0)
    check([x['extra']['serving'] for x in notes] == ['ohnesorte001'] and notes[0]['body'] == f'Futter von {hhmm} für Mau',
          f'unknown food: „{notes[0]["body"] if notes else ""}“; meals older than 10 minutes get no reminder')
    lachs = await state(pg, "db.products.find(p => p.variety === 'Lachs in Soße').id")
    await pg.evaluate(f"import('./js/store.js').then(s => {{ const x = s.db.servings.find(v => v.id === 'ohnesorte001'); x.productId = '{lachs}'; x.servedAt -= 5 * 60000; s.save(); }})"); await debounced(pg)
    notes = await pending()
    due = await pg.evaluate("t => new Date(t).getTime()", notes[0]['schedule']['at'])
    check(len(notes) == 1 and notes[0]['body'] == 'Lachs in Soße für Mau' and due == t0 - 5 * 60000 + 180 * 60000, 'the variety recognised or the time changed: the reminder moves along')
    await pg.click('[data-action=open-settings]'); await debounced(pg)
    await pg.click('#sheet [data-action=remind][data-v="360"]'); await debounced(pg)
    due60 = await pg.evaluate("t => new Date(t).getTime()", (await pending())[0]['schedule']['at'])
    await pg.click('#sheet [data-action=remind][data-v="0"]'); await debounced(pg)
    off = await pending()
    check(due60 == t0 - 5 * 60000 + 360 * 60000 and off == [] and await calls('requestPermissions') == [], 'a different interval reschedules and „Aus“ cancels everything; once the permission is granted the app does not ask again')
    await pg.click('#sheet [data-action=remind][data-v="60"]'); await debounced(pg)
    await pg.click('[data-action=close]'); await debounced(pg)
    await pg.evaluate(PLAN, ['loeschen0001', 0, lachs]); await debounced(pg)
    before = len(await pending())
    await pg.evaluate("import('./js/logic/editing.js').then(async e => { (await import('./js/ui/sheet.js')).openSheet({kind: 'serving', id: 'loeschen0001'}); e.deleteServing('loeschen0001'); })"); await debounced(pg)
    check(before == 1 and await pending() == [], 'meal deleted: the reminder is cancelled')
    # Reconciling at start-up: anything scheduled without an open meal goes, what is open stays
    await pg.evaluate(PLAN, ['bleibt000001', 1, lachs]); await debounced(pg)
    await pg.evaluate("""localStorage.setItem('__notes', JSON.stringify([...JSON.parse(localStorage.getItem('__notes')), {id: 4711, title: 'Wie war’s?', body: 'alt', extra: {serving: 'gibtsnicht01', at: 1}},
      {id: 4712, title: 'Wie war’s?', body: 'alt', extra: {serving: 'ohnesorte001', at: 1}}]))""")
    await pg.evaluate("import('./js/store.js').then(s => { const x = s.db.servings.find(v => v.id === 'ohnesorte001'); x.pets[Object.keys(x.pets)[0]] = {r: 'top', at: Date.now()}; s.save(); })")
    await pg.evaluate("localStorage.setItem('__notes', JSON.stringify([...JSON.parse(localStorage.getItem('__notes')).filter(n => n.id !== 4712), {id: 4712, title: 'Wie war’s?', body: 'alt', extra: {serving: 'ohnesorte001', at: 1}}]))")
    await debounced(pg)
    await pg.evaluate("sessionStorage.setItem('__launchNote', JSON.stringify({actionId: 'tap', notification: {id: 1, extra: {serving: 'bleibt000001'}}}))")
    await pg.reload(); await started(pg)
    left = [x['extra']['serving'] for x in await pending()]
    opened = await pg.evaluate("import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.id])")
    check(left == ['bleibt000001'], f'at start-up the app reconciles: reminders without an open meal are cancelled and the open one stays ({left})')
    check(opened == [True, 'serving', 'bleibt000001'], f'a tap on a cold start opens the meal ({opened})')
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_remind(browser, url):
    print('reminder: your own interval in hours')
    ctx = await phone(browser)
    await ctx.clock.install()
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('[data-action=demo]'); await debounced(pg)
    await pg.click('[data-action=open-settings]'); await debounced(pg)
    check(await pg.locator('#f-remind').count() == 0, 'without „Eigene“ there is no number field')
    hints = [await pg.inner_text('#remind-hint')]
    await pg.click('[data-action=remind][data-v="60"]'); await debounced(pg)
    hints.append(await pg.inner_text('#remind-hint'))
    await pg.click('[data-action=remind][data-v="0"]'); await debounced(pg)
    await pg.click('[data-action=remind-own]'); await debounced(pg)
    hints.append(await pg.inner_text('#remind-hint'))
    f = await pg.eval_on_selector('#f-remind', 'f => [f.type, f.min, f.max, f.step, f.value, f.labels[0]?.innerText, f.className]')
    on = await pg.eval_on_selector_all('#sheet [data-action^=remind][aria-pressed=true]', 'l => l.map(b => b.innerText.trim())')
    check(f == ['number', '1', '24', '1', '2', 'Stunden nach dem Füttern', 'field'] and on == ['Eigene'] and await state(pg, 'prefs.remind') == 120,
          f'„Eigene“ shows a number field for whole hours from 1 to 24, starting at 2 hours from „Aus“; stored in minutes ({f})')
    await shot(pg, 'reminder-own')
    await pg.evaluate("document.getElementById('f-remind').__same = true")
    await pg.fill('#f-remind', '5'); await debounced(pg)
    hints.append(await pg.inner_text('#remind-hint'))
    check(hints == ['Dieses Handy erinnert nicht ans Bewerten.', 'Dieses Handy erinnert 1 Stunde nach dem Füttern ans Bewerten.', 'Dieses Handy erinnert 2 Stunden nach dem Füttern ans Bewerten.',
                    'Dieses Handy erinnert 5 Stunden nach dem Füttern ans Bewerten.'], f'the note says what the choice means, while typing your own hours too ({hints})')
    same = await pg.evaluate("[document.getElementById('f-remind').__same === true, document.activeElement.id]")
    check(await state(pg, 'prefs.remind') == 300 and same == [True, 'f-remind'], f'5 typed in: 300 minutes take effect at once and the field stays put while typing ({same})')
    for bad in ('30', '0', ''):
        await pg.fill('#f-remind', bad); await debounced(pg)
    check(await state(pg, 'prefs.remind') == 300, 'values outside 1 to 24 change nothing')
    await pg.press('#f-remind', 'Enter'); await debounced(pg)
    check(await pg.input_value('#f-remind') == '5', 'leaving the field: it shows the current value again')
    await pg.click('[data-action=close]'); await debounced(pg)
    await pg.click('#fab'); await debounced(pg)
    await pg.click('.plist [data-action=serve]'); await debounced(pg)
    due = await pg.evaluate("window.Capacitor.Plugins.LocalNotifications.getPending().then(r => new Date(r.notifications[0].schedule.at).getTime())")
    check(due == await state(pg, 'db.servings[0].servedAt') + 5 * 3600e3, 'it is scheduled for the serving time plus 5 hours')
    await pg.reload(); await started(pg)
    await pg.click('[data-action=open-settings]'); await debounced(pg)
    on = await pg.eval_on_selector_all('#sheet [data-action^=remind][aria-pressed=true]', 'l => l.map(b => b.innerText.trim())')
    check(on == ['Eigene'] and await pg.input_value('#f-remind') == '5', f'after the restart: „Eigene“ with 5 hours ({on})')
    await pg.click('#sheet [data-action=remind][data-v="180"]'); await debounced(pg)
    check(await pg.locator('#f-remind').count() == 0 and await state(pg, 'prefs.remind') == 180, 'a fixed step hides the field again')
    await pg.click('#sheet [data-action=remind][data-v="0"]'); await debounced(pg)
    await pg.evaluate("localStorage.setItem('__notifyPermission', 'denied'); localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=remind-own]'); await debounced(pg)
    on = await pg.eval_on_selector_all('#sheet [data-action^=remind][aria-pressed=true]', 'l => l.map(b => b.innerText.trim())')
    check(on == ['Aus'] and await pg.locator('#f-remind').count() == 0 and 'nicht erlaubt' in await pg.inner_text('#toast'), 'without the permission even „Eigene“ stays at „Aus“')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


FEED_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), at = (day, time) => new Date(`2026-06-${String(day).padStart(2, '0')}T${time}`).getTime();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['nass', 'Lachs', 'Nassfutter'], ['snack', 'Käse', 'Snack']].map(([id, variety, type]) => ({id: id + '000001', brand: 'Sheba', variety, type, codes: {}, createdAt: 1}));
  d.servings = [3, 4, 5, 6, 7, 8, 9].flatMap(day => [[day, '07:15'], [day, '18:30']]).map(([day, time], i) => ({id: 'meal0000' + String(i).padStart(2, '0'), productId: 'nass000001', servedAt: at(day, time), note: '',
    pets: {minka00001: {r: 'gut', at: at(day, time)}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_feed_remind(browser, url):
    print('the feeding reminder: the usual times from the history, scheduled only while nothing has been served')
    ctx = await browser.new_context(viewport={'width': 400, 'height': 860}, reduced_motion='reduce', timezone_id='Europe/Berlin')
    pg, errors = await open_page(ctx, url, native=True)
    await pg.clock.set_fixed_time('2026-06-10T12:00:00+02:00')
    PENDING = "Capacitor.Plugins.LocalNotifications.getPending().then(r => r.notifications.filter(n => n.extra.feed).map(n => [n.extra.feed, new Date(n.schedule.at).toLocaleString('sv').slice(5, 16), n.title, n.body, n.isExactNotification]).sort())"
    SECTION = """() => { const b = [...document.querySelectorAll('#sheet [data-action=feed-remind]')], hint = b[0].closest('.seg').previousElementSibling;
      return [hint.previousElementSibling.innerText, hint.innerText, b.map(x => x.innerText + (x.getAttribute('aria-pressed') === 'true' ? '*' : ''))]; }"""
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    empty = await pg.evaluate(SECTION)
    check(empty == ['Ans Füttern erinnern', 'Die üblichen Zeiten lernt die App aus dem Verlauf, sobald an vier Tagen etwa zur selben Zeit gefüttert wurde.', ['An', 'Aus*']],
          f'settings, below „Ans Bewerten erinnern“: „Ans Füttern erinnern“, off by default; without a history the note explains where the times come from ({empty})')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.evaluate(FEED_DB); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    before = await pg.evaluate(SECTION)
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=feed-remind][data-v=on]'); await debounced(pg)
    denied = [await state(pg, 'prefs.feedRemind'), 'nicht erlaubt' in await pg.inner_text('#toast'), await pg.evaluate(PENDING)]
    await pg.evaluate("localStorage.setItem('__notifyAnswer', 'granted'); localStorage.setItem('__notifyPermission', 'prompt')")
    await pg.click('[data-action=feed-remind][data-v=on]'); await debounced(pg)
    sec, plan = await pg.evaluate(SECTION), await pg.evaluate(PENDING)
    note = ['Schon gefüttert?', 'Um diese Zeit gibt es sonst Futter für Minka.', False]
    check(denied == [False, True, []] and before[1] == 'Futter gibt es meist um 07:15 und 18:30 Uhr. Dieses Handy erinnert nicht daran.' and sec[1:] == ['Futter gibt es meist um 07:15 und 18:30 Uhr. Ist 45 Minuten später nichts serviert, erinnert dieses Handy.', ['An*', 'Aus']] and await state(pg, 'prefs.feedRemind') is True,
          f'switching it on asks for the permission and stays off without it; the note names the learnt times and what currently applies ({before[1]} / {sec[1]})')
    check(plan == [['2026-06-10|1110', '06-10 19:15'] + note, ['2026-06-11|1110', '06-11 19:15'] + note, ['2026-06-11|435', '06-11 08:00'] + note, ['2026-06-12|1110', '06-12 19:15'] + note, ['2026-06-12|435', '06-12 08:00'] + note],
          f'one is scheduled per usual time 45 minutes later for today and two days ahead, without an exact alarm; this morning\u2019s time has passed ({[x[:2] for x in plan]})')
    await shot(pg, 'settings-feed-reminder')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.clock.set_fixed_time('2026-06-10T18:00:00+02:00')
    await pg.evaluate("import('./js/logic/feeding.js').then(f => f.serveProduct('snack000001'))"); await debounced(pg)
    snack = len(await pg.evaluate(PENDING))
    await pg.evaluate("import('./js/logic/feeding.js').then(f => f.serveProduct('nass000001'))"); await debounced(pg)
    fed = [x[0] for x in await pg.evaluate(PENDING)]
    check(snack == 5 and fed == ['2026-06-11|1110', '2026-06-11|435', '2026-06-12|1110', '2026-06-12|435'], f'a treat cancels nothing, while a meal at the usual time cancels today\u2019s reminder ({snack}, {fed})')
    await pg.evaluate("window.__tapNote({actionId: 'tap', notification: {extra: {feed: '2026-06-11|435'}}})"); await idle(pg)
    check(await pg.locator('#sheet [data-action=scan]').count() == 1, 'a tap on the notification opens the feeding sheet')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('[data-action=feed-remind][data-v=off]'); await debounced(pg)
    check(await pg.evaluate(PENDING) == [] and await state(pg, 'prefs.feedRemind') is False, 'switched off: everything scheduled is cancelled')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_petbar(browser, url):
    print('home page: the order, and the pet bar only from two pets on')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]'); await idle(pg)
    await pg.evaluate("""import('./js/store.js').then(async s => { s.db.servings.unshift({id: 'offen0000001', productId: s.db.products[0].id, servedAt: Date.now() - 60000, note: '',
      pets: {[s.db.pets[0].id]: {r: null, at: null}}}); s.save(); (await import('./js/views/home.js')).renderHome(); })""")
    order = await pg.evaluate("""[...document.querySelectorAll('.app > *, #home > *')].filter(e => e.id !== 'home' && e.getClientRects().length)
      .map(e => e.matches('header') ? 'header' : e.id === 'pets' ? 'pets' : e.querySelector('h2')?.innerText ?? e.tagName)""")
    hint = [x for x in order if x in ('Appetit', 'Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    week = [x for x in order if x == 'Letzte Woche']
    check(order == ['header', 'Mau', 'Wie war’s?'] + hint + week + ['Verlauf', 'Einkaufen', 'Erkenntnisse'] and len(hint) == 1,
          f'one pet: no pet bar; overview, „Wie war’s?“, hint, „Letzte Woche“, „Verlauf“, „Einkaufen“, „Erkenntnisse“ ({order})')
    check(await pg.locator('#pets').is_hidden() and await pg.locator('#pets *').count() == 0, 'with one pet there is no filter')
    await shot(pg, 'home-one-pet')
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('#sheet [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Tiger'); await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    bar = await pg.eval_on_selector_all('#pets .pet', 'l => l.map(b => [b.innerText.trim(), b.getAttribute("aria-pressed")])')
    order = await pg.evaluate("[...document.querySelectorAll('.app > *')].filter(e => e.getClientRects().length).map(e => e.id || e.tagName)")
    check(bar == [['Alle', 'true'], ['Mau', 'false'], ['Tiger', 'false'], ['Neu', None]] and order == ['HEADER', 'pets', 'home'],
          f'a second pet created in the settings: the pet bar appears, right at the top ({[b[0] for b in bar]})')
    await pg.click('#pets .pet:nth-child(2)'); await idle(pg)
    check(await state(pg, "prefs.activePet === db.pets[0].id"), 'the bar filters')
    await shot(pg, 'home-two-pets')
    await pg.evaluate("import('./js/logic/pets.js').then(async p => { (await import('./js/ui/sheet.js')).openSheet({kind: 'pet', id: (await import('./js/store.js')).db.pets[1].id}); p.deletePet(); })")
    await idle(pg)
    check(await pg.locator('#pets').is_hidden(), 'back to one pet: the bar disappears')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


SERVER_WORDS = re.compile(r'server|abgleich|abgeglichen|erkennung|erkannt|erkenn(en|t)\b')  # nowhere to be seen in mode `lokal` („Erkenntnisse“ is fine)


PRIVACY = ['Tiere, Futter und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.',
           'Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.',
           'Den Text auf einer Packung liest das Handy selbst, ohne Netz. Mehr kann eine Einstellung unter „Haushalt“, sie ist aus: Die Produktsuche im Internet fragt bei unbekannten Barcodes zwei freie Produktdatenbanken, übertragen wird nur die Nummer.',
           'Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Der schickt Packungsfotos zur Erkennung an Anthropic und unbekannte Barcodes, nur die Nummer, an freie Produktdatenbanken.',
           'Ein Backup und das Löschen aller Daten findest du in den Einstellungen unter „Daten“. „Änderungen teilen“ unter „Haushalt“ gibt eine Datei mit Tieren, Futter und Mahlzeiten an ein anderes Handy weiter, ohne Server.']


async def texts(pg):
    """every visible text including placeholders and labels for screen readers"""
    return await pg.evaluate("""[document.body.innerText, ...[...document.querySelectorAll('[placeholder], [aria-label], [title]')]
      .map(e => [e.placeholder, e.getAttribute('aria-label'), e.title].join(' '))].join('\\n').toLowerCase()""")


async def test_modes(browser, url):
    print('modes: first start, existing installations, `lokal` without any trace of the server')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True, choose=False)
    btns = await pg.eval_on_selector_all('.welcome button, .welcome a, .welcome label', 'l => l.map(b => [b.innerText.trim(), b.dataset.action])')
    check(btns == [['Nur auf diesem Handy', 'mode-local'], ['Mit Haushalt verbinden', 'connect-form']] and await state(pg, 'prefs.mode') == ''
          and await pg.locator('#fab').is_hidden(), f'first start: the welcome page offers exactly two buttons ({[b[0] for b in btns]})')
    await shot(pg, 'first-start')
    await pg.click('[data-action=connect-form]'); await idle(pg)
    form = await pg.evaluate("""[document.getElementById('sheet').open, document.getElementById('f-server')?.value, document.getElementById('f-server')?.placeholder,
      !!document.getElementById('f-code'), document.activeElement.id]""")
    check(form == [True, '', 'http://192.168.… oder https://…', True, 'f-server'] and await state(pg, 'prefs.mode') == '',
          f'„Mit Haushalt verbinden“: address and code, with the address empty and a placeholder ({form})')
    await shot(pg, 'connect-form')
    await pg.fill('#f-code', 'K7PM3QXD'); await pg.click('[data-action=connect]'); await idle(pg)
    check('Adresse' in await pg.inner_text('#serverBox .note.warn') and await state(pg, "prefs.code === '' && prefs.mode === ''"), 'without an address nothing connects: a clear message')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=mode-local]'); await idle(pg)
    btns = await pg.eval_on_selector_all('.welcome button', 'l => l.map(b => b.dataset.action)')
    check(await state(pg, 'prefs.mode') == 'lokal' and btns == ['add-pet', 'demo'], f'„Nur auf diesem Handy“: mode `lokal`, on to the first pet ({btns})')
    await pg.reload(); await started(pg)
    check(await state(pg, 'prefs.mode') == 'lokal' and await pg.locator('[data-action=mode-local]').count() == 0, 'the choice is stored and only asked once')
    await ctx.close()

    # Without a stored mode: connected gives `haushalt`, a phone already in use gives `lokal`
    pet = {'id': 'lxpet00001', 'name': 'Minka', 'species': 'Katze', 'createdAt': 1}
    cases = [('with data, not connected', {'db': {'version': 3, 'pets': [pet], 'products': [], 'servings': []}}, 'lokal'),
             ('settings only, not connected', {'prefs': {'theme': 'dark'}}, 'lokal'),
             ('connected', {'prefs': {'server': 'http://127.0.0.1:9', 'code': 'K7PM-3QXD'}, 'db': {'version': 3, 'pets': [pet], 'products': [], 'servings': []}}, 'haushalt'),
             ('was connected, code missing', {'prefs': {'server': 'http://127.0.0.1:9', 'code': '', 'mode': 'haushalt'}}, 'lokal')]
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
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)
    seen.append(await texts(pg))  # „So geht’s“ page
    await pg.click('[data-action=open-settings]'); await idle(pg)
    seen.append(await texts(pg))
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    seen.append(await texts(pg))
    await pg.evaluate('window.__calls.length = 0')
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'noserver'"); await idle(pg)   # the phone reads the text, with no result here
    seen.append(await texts(pg))
    view = await pg.evaluate("""import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.step, document.querySelector('#sheet h2')?.innerText,
      !!document.querySelector('#sheet .name-photo'), document.querySelectorAll('#sheet .note, #sheet .warn, #sheet .spin').length, document.getElementById('toast').innerText.trim()])""")
    s = await state(pg, "(s => [s.status, !!s.photo, !!s.thumb, s.error ?? null])(db.servings[0])")
    heavy = await pg.evaluate("window.__calls.filter(c => c[0] === 'impact' && c[1].style === 'HEAVY').length")
    check(view[:6] == [True, 'serving', 'name', 'Futter benennen', True, 0] and view[6].startswith('Serviert') and 'erkannt' not in view[6] and s == ['noserver', True, True, None] and heavy == 0,
          f'a photo in mode `lokal`: saved, „Futter benennen“ opens straight away, without a notice and without the error tone ({view}, {s})')
    await shot(pg, 'local-photo-naming')
    await pg.click('[data-action=close]'); await idle(pg)
    seen.append(await texts(pg))
    row = await pg.eval_on_selector('.pend-head .t-main', "e => [e.innerText.replace(/\\n/g, ' / '), !!e.querySelector('.warn')]")
    check(row == ['Unbekanntes Futter / Tippen zum Benennen', False], f'still without a variety: a neutral row without a warning colour ({row})')
    await pg.click('.pend-head'); await idle(pg)
    await pg.fill('#f-brand', 'Sheba'); await pg.fill('#f-variety', 'Lachs'); await pg.click('[data-action=save-name]'); await idle(pg)
    check(await state(pg, "db.servings[0].productId === db.products[0].id && !db.servings[0].status && !db.servings[0].photo"), 'variety typed in: named, and the photo stays as the thumbnail on the variety')
    await pg.click('[data-action=close]'); await idle(pg)
    # Barcodes: an unknown one leads to the photo, and is known afterwards
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = '{base64.b64encode(PACK.read_bytes()).decode()}'; window.__calls.length = 0")
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]')
    await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    seen.append(await texts(pg))
    cam = await pg.evaluate("window.__calls.filter(c => c[0] === 'capture').map(c => c[1])")
    view = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet?.kind, m.sheet?.step])")
    check(cam == [{'hint': 'Vorderseite fotografieren'}] and view == ['serving', 'name'] and await state(pg, f"db.servings[0].scanCode === '{SHEBA}'"),
          f'an unknown barcode: straight to the photo without asking, then type the variety in ({cam}, {view})')
    await pg.click('#suggest [data-action=use-product]'); await idle(pg)
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    check(await state(pg, f"!!db.products[0].codes?.['{SHEBA}']"), 'the code hangs on the chosen variety')
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    seen.append(await texts(pg))
    check(await state(pg, 'db.servings.length') == n + 1 and await state(pg, 'db.servings[0].productId === db.products[0].id') and 'serviert' in (await pg.inner_text('#toast')).lower(),
          'a known barcode: served at once')
    found = sorted({m.group(0) for t in seen for m in SERVER_WORDS.finditer(t)})
    check(not found, f'mode `lokal`: no trace of server, sync or recognition anywhere (welcome, „So geht’s“, settings, feeding, photo, scanning) {found}')
    check(await pg.locator('#syncChip').is_hidden(), 'no sync notice in the header')
    foreign = [r for r in requests if not r.startswith((url.rsplit('/', 1)[0], 'data:', 'blob:'))]
    check(len(requests) > 20 and not foreign and await state(pg, '!prefs.lookup'),
          f'mode `lokal`: not a single network request except to the app itself, as long as the product lookup is off ({len(requests)} requests) {foreign[:3]}')
    await pg.click('[data-action=open-settings]'); await idle(pg)
    data = await pg.eval_on_selector_all('#sheet .btn-col:has([data-action=open-privacy]) > *', "l => l.map(b => [b.innerText.trim(), b.classList.contains('btn'), !!b.querySelector('svg')])")
    check([d[0] for d in data] == ['Backup exportieren', 'Backup importieren', 'Beispieldaten laden', 'Datenschutz', 'Alle Daten löschen'] and all(d[1] and d[2] for d in data)
          and await pg.locator('#sheet .privacy').count() == 0, f'settings: „Datenschutz“ is a button like the others under „Daten“, before the delete ({[d[0] for d in data]})')
    await pg.click('#sheet [data-action=open-privacy]'); await idle(pg)
    got = await pg.evaluate("[document.querySelector('#sheet h2').innerText, ...[...document.querySelectorAll('#sheet .privacy p')].map(p => p.innerText)]")
    check(got == ['Datenschutz'] + PRIVACY, f'a tap opens the „Datenschutz“ sheet with exactly the text laid down ({len(got) - 1} paragraphs)')
    await shot(pg, 'privacy')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('[data-action=export]'); await idle(pg)
    await pg.click('[data-action=export]'); await idle(pg)
    gone = [c[1]['path'] for c in await pg.evaluate('window.__calls')
            if c[0] == 'deleteFile' and c[1]['directory'] == 'CACHE' and c[1]['path'].startswith('schmeckts-backup-')]
    check(len(gone) == 1 and gone[0].startswith('schmeckts-backup-'), f'a shared backup does not linger in the cache: deleted before the next export ({gone})')
    await pg.click('[data-action=close]'); await idle(pg)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_network(browser, url):
    print('network rule: http on the home network only, https otherwise')
    ok = ['http://10.0.0.1:8486', '10.255.255.255', 'http://172.16.0.1', 'http://172.31.255.254:8486', '192.168.178.65:8486', 'http://192.168.0.1/', 'http://100.64.0.1', 'http://100.127.255.255',
          'http://127.0.0.1:8486', 'http://127.8.9.10', 'http://localhost:8486', 'LOCALHOST', 'http://minipc.local:8486', 'http://MiniPC.Local', 'http://server.home.arpa', 'http://a.b.home.arpa:8486',
          'http://[fc00::1]:8486', 'http://[fd12:3456:789a::1]', 'http://[fdff:ffff::1]', 'http://[fe80::1]:8486', 'http://[febf::1]', 'http://3232235777',
          'https://example.com', 'https://8.8.8.8:8486', 'https://[2001:db8::1]', 'https://172.32.0.1']
    bad = ['http://9.255.255.255', 'http://11.0.0.1', 'http://172.15.255.255:8486', 'http://172.32.0.1:8486', 'http://192.167.1.1', 'http://192.169.1.1', 'http://100.63.255.255', 'http://100.128.0.1',
           'http://126.0.0.1', 'http://128.0.0.1', 'http://8.8.8.8', 'example.com', 'http://example.com:8486', 'http://local', 'http://notlocal', 'http://evil-local', 'http://home.arpa', 'http://xhome.arpa',
           'http://minipc.local.example.com', 'http://localhost.example.com', 'http://[2001:db8::1]:8486', 'http://[2a02:8109::1]', 'http://[fbff::1]', 'http://[fe00::1]', 'http://[fec0::1]', 'http://[::1]',
           'http://[::ffff:192.168.1.1]', 'http://[fc]', 'http://10.0.0.1.example.com']
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    got = await pg.evaluate("""([ok, bad]) => import('./js/api.js').then(a => { const run = v => { try { return a.normServer(v); } catch (e) { return e.kind + ': ' + e.message; } };
      return [ok.map(run), bad.map(run), run(''), run('  192.168.1.20:8486// ')]; })""", [ok, bad])
    wrong = [ok[i] for i, v in enumerate(got[0]) if not v.startswith('http')]
    check(not wrong, f'allowed: http on the home network (10/8, 172.16/12, 192.168/16, 100.64/10, 127/8, fc00::/7, fe80::/10, localhost, *.local, *.home.arpa), https everywhere {wrong}')
    msg = 'input: Außerhalb des Heimnetzes geht es nur mit https.'
    wrong = [bad[i] for i, v in enumerate(got[1]) if v not in (msg, 'input: Das ist keine gültige Adresse.')]
    check(not wrong and got[1][:3] == [msg] * 3, f'rejected: http outside, at the boundaries too (172.15.x, 172.32.x, 100.63.x, 100.128.x, public IPv6, similar names) {wrong}')
    check(got[2:] == ['', 'http://192.168.1.20:8486'], f'empty stays empty, and http when none is given ({got[2:]})')
    # While connecting
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if '/api/' in r.url else None)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('#serverBox [data-action=connect-form]'); await idle(pg)
    await pg.fill('#f-server', 'http://schmeckts.example.com:8486'); await pg.fill('#f-code', 'K7PM-3QXD')
    await pg.click('[data-action=connect]'); await idle(pg)
    note = await pg.inner_text('#serverBox .note.warn')
    check(note.strip() == 'Außerhalb des Heimnetzes geht es nur mit https.' and not asked and await state(pg, "prefs.code === '' && prefs.mode === 'lokal'"),
          f'connecting to another http address: „{note.strip()}“, and no request goes out')
    await shot(pg, 'connect-https-only')
    await ctx.close()
    # Every request: a stored address outside the home network is never asked
    ctx, pg, errors = await seeded(browser, url, {'prefs': {'server': 'http://93.184.216.34:8486', 'code': 'K7PM-3QXD'}, 'db': {'version': 3, 'pets': [], 'products': [], 'servings': []}}, native=True)
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if '/api/' in r.url else None)
    res = await pg.evaluate("""Promise.all([import('./js/api.js'), import('./js/recognize.js'), import('./js/sync.js')]).then(async ([a, r, s]) => { const out = [];
      for (const run of [() => a.request('GET', '/api/info'), () => a.request('POST', '/api/push', {body: {}}), () => r.lookupBarcode('4008429087455'), () => r.recognize('AAAA'), () => s.retrySync().then(() => { throw s.status; })])
        out.push(await run().then(() => 'sent', e => `${e.kind}: ${e.message}`));
      return out; })""")
    msg = 'Außerhalb des Heimnetzes geht es nur mit https.'
    check(all(msg in x for x in res) and not asked, f'holds for every request (info, send, barcode, recognition, sync): rejected, and nothing goes out ({res[0]}, {asked})')
    await ctx.close()


async def test_shortcuts(browser, url):
    print('shortcuts and deep links in the Android files')
    A = '{http://schemas.android.com/apk/res/android}'
    root = ET.parse(ROOT / 'app/native/res/xml/shortcuts.xml').getroot()
    links = [s.find('intent').get(A + 'data') for s in root.findall('shortcut')]
    check(links == ['schmeckts://feed', 'schmeckts://scan', 'schmeckts://photo'], 'the static shortcuts „Füttern“, „Scannen“ and „Packung fotografieren“')
    ok = True
    for s in root.findall('shortcut'):
        icon = s.get(A + 'icon').split('/')[1]
        ok &= (ROOT / f'app/native/res/drawable/{icon}.xml').exists()
        for attr in ('shortcutShortLabel', 'shortcutLongLabel'):
            ok &= s.get(A + attr) in ('@string/' + n for n in re.findall(r'name="(\w+)"', (ROOT / 'app/native/res/values/strings_shortcuts.xml').read_text()))
        ok &= s.find('intent').get(A + 'targetClass') == 'de.schmeckts.app.MainActivity'
    check(ok, 'icons, labels and target of the shortcuts are present')
    prep = (ROOT / 'scripts/prepare.py').read_text()
    check('android:scheme="schmeckts"' in prep and 'android.intent.category.BROWSABLE' in prep and '@xml/shortcuts' in prep and 'registerPlugin(PhotoPlugin.class)' in prep,
          'prepare.py adds the deep-link filter, the shortcuts and the photo plugin to the Android project')
    photo = (ROOT / 'app/native/java/de/schmeckts/app/PhotoPlugin.java').read_text()
    check('ACTION_IMAGE_CAPTURE' in photo and 'hint' in photo, 'the photo plugin uses the system camera, with a hint above it')
    check('com.google.mlkit.vision.DEPENDENCIES' in prep and 'barcode_ui' in prep, 'prepare.py declares Google\u2019s scanner module in the manifest (barcode_ui)')
    check('android:mimeType="application/json"' in prep and 'android.intent.action.SEND' in prep and 'EXTRA_STREAM' in prep and 'ACTION_VIEW' in prep,
          'prepare.py accepts shared exchange files: an intent filter on the file type, and SEND becomes VIEW')
    check('abiFilters "armeabi-v7a", "arm64-v8a"' in prep and 'x86' in (ROOT / 'scripts/build-apk.sh').read_text(),
          'phones only: prepare.py builds without x86, and build-apk.sh aborts if any end up in the APK')
    build = (ROOT / 'scripts/build-apk.sh').read_text()
    check(re.search(r"grep -q '\"android\.permission\.CAMERA\"' <<<\"\$MANIFEST\" \|\| \{[^}]*exit 1", build) and '<uses-permission android:name="android.permission.CAMERA" />' in prep
          and 'android:name="android.hardware.camera" android:required="false"' in prep, 'camera permission: prepare.py puts it in the manifest (no camera required) and build-apk.sh aborts when it is missing')


async def test_scan(browser, url):
    print('scanning (plugins simulated, without a server)')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    is_open = lambda: pg.evaluate("document.getElementById('sheet').open")
    impacts = lambda: pg.evaluate("window.__calls.filter(c => c[0] === 'impact').map(c => c[1].style)")
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    # Cancelling
    await pg.click('[data-action=scan]'); await idle(pg)
    check(['scan', {'formats': ['EAN_13', 'EAN_8', 'UPC_A']}] in await pg.evaluate('window.__calls'), 'scanner: scan() only, formats EAN-13, EAN-8, UPC-A')
    check(await is_open() and await pg.locator('#sheet [data-action=scan]').count() == 1 and await state(pg, 'db.servings.length') == 0,
          'scanning cancelled: back in the feeding sheet, nothing stored')
    # An unknown code without a server: the camera for the front, and the code waits until the variety is named
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}")
    await pg.click('[data-action=scan]')
    await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    check(['capture', {'hint': 'Vorderseite fotografieren'}] in await pg.evaluate('window.__calls'),
          'an unknown code without a server: straight to the camera, with the hint „Vorderseite fotografieren“')
    check(await state(pg, f"db.servings.length === 1 && db.servings[0].scanCode === '{SHEBA}' && db.servings[0].status === 'noserver'")
          and await pg.locator('#sheet #f-brand').count() == 1, 'the photo is served, the code sits on the meal, and the variety is typed in right away')
    check(await pg.evaluate("Promise.all([import('./js/fields.js'), import('./js/store.js')]).then(([f, m]) => !Object.keys(f.fieldsOf('servings', m.db.servings[0])).some(k => k.startsWith('scan')))"),
          'scanCode stays on the phone and is never synced')
    await pg.fill('#f-brand', 'Sheba'); await pg.fill('#f-variety', 'Lachs in Soße')
    await pg.click('[data-action=save-name]'); await idle(pg)
    check(await state(pg, f"db.products.length === 1 && db.products[0].codes['{SHEBA}'] === true"), 'named: the code hangs on the named variety')
    await pg.click('[data-action=close]'); await idle(pg)
    sheba = await state(pg, 'db.products[0].id')
    # A known code: served at once, without a server
    before = len(await impacts())
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await state(pg, f"db.servings.length === 2 && db.servings[0].productId === '{sheba}' && db.servings[0].scanCode === '{SHEBA}'")
          and not await is_open(), 'a known code: served at once, without a server')
    check('MEDIUM' in (await impacts())[before:] and 'Lachs in Soße serviert' in await pg.inner_text('#toast')
          and await pg.locator('#toast [data-action=undo]').count() == 1, 'with haptics and a toast including undo')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, "db.servings.length === 1 && db.products.length === 1"), 'undo takes the meal back and the variety stays')
    await shot(pg, 'scan-served')
    # Multipack: scanned, then changed to another variety, after which the code hangs on both
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    await pg.locator('.pend-head').first.click(); await idle(pg)
    await pg.click('[data-action=edit-name]'); await idle(pg)
    await pg.fill('#f-variety', 'Huhn in Gelee'); await pg.click('[data-action=save-name]'); await idle(pg)
    check(await state(pg, f"db.products.length === 2 && db.products.every(p => p.codes['{SHEBA}'])"),
          'a scanned meal changed to another variety: the code hangs on both (a multipack)')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await is_open() and 'Welche Sorte?' in await pg.inner_text('#sheet h2') and await pg.locator('#sheet .plist [data-action=serve]').count() == 2,
          'several hits: a short choice of those varieties')
    await shot(pg, 'scan-choice')
    huhn = await state(pg, "db.products.find(p => p.variety === 'Huhn in Gelee').id")
    n = await state(pg, 'db.servings.length')
    await pg.click(f'#sheet [data-action=serve][data-id="{huhn}"]'); await idle(pg)
    check(await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}' && db.servings[0].scanCode === '{SHEBA}'")
          and not await is_open(), 'the chosen variety is served')
    # Removing a code in the food sheet, with undo
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{sheba}'}}))"); await idle(pg)
    check(await pg.locator(f'#sheet [data-action=remove-code][data-code="{SHEBA}"]').count() == 1 and SHEBA in await pg.inner_text('#sheet'),
          'the food sheet shows the variety\u2019s barcodes')
    await shot(pg, 'scan-food')
    await pg.click('[data-action=remove-code]'); await idle(pg)
    check(await state(pg, f"!db.products.find(p => p.id === '{sheba}').codes['{SHEBA}']") and await pg.locator('#sheet [data-action=remove-code]').count() == 0,
          'barcode removed')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, f"db.products.find(p => p.id === '{sheba}').codes['{SHEBA}'] === true") and await pg.locator('#sheet [data-action=remove-code]').count() == 1,
          'undo attaches it again')
    await pg.click('[data-action=remove-code]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}'") and not await is_open(),
          'after the removal: only one variety left, served at once')
    # UPC-A becomes EAN-13 as on the server, here through the photo plugin without a photo (a cancel)
    await pg.evaluate(f"window.__barcode = '{UPC}'; window.__photo = null")
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await is_open() and await state(pg, f'db.servings.length === {n}') and await pg.locator('#sheet [data-action=scan]').count() == 1,
          'camera cancelled: back in the feeding sheet')
    # The scanner module is missing: it gets installed, with a short notice
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__scanModule = false")
    await pg.click('[data-action=scan]'); await idle(pg)
    hint = await pg.inner_text('#sheet .note') if await pg.locator('#sheet .note').count() else ''
    await until(pg, f'db.servings.length === {n + 1}'); await idle(pg)
    check(['installModule', None] in await pg.evaluate('window.__calls') and 'Scanner wird eingerichtet' in hint and not await is_open()
          and await state(pg, f"db.servings[0].productId === '{huhn}'"), f'the scanner module is missing: installed, notice „{hint}“, then scanned')
    # Scanning does not work (without Google Play services, say): a pointer to the photo, and the sheet stays
    await pg.evaluate("window.__scanError = 'Play-Dienste fehlen'")
    await pg.click('#fab'); await idle(pg)
    before = len(await impacts())
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await pg.evaluate("document.getElementById('sheet').open") and 'Foto' in await pg.inner_text('#toast') and 'HEAVY' in (await impacts())[before:],
          'scanner unavailable: a pointer to the photo, and the sheet stays')
    await pg.evaluate("window.__scanError = null")
    # The deep link schmeckts://scan while the app is running and on a cold start
    await pg.click('[data-action=close]'); await idle(pg)
    n = await state(pg, 'db.servings.length')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})"); await idle(pg)
    check(await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}'"), 'schmeckts://scan while the app is running: scanned and served')
    await pg.evaluate("window.__barcode = null")
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})"); await idle(pg)
    check(await is_open() and await pg.locator('#sheet [data-action=scan]').count() == 1, 'schmeckts://scan cancelled: the feeding sheet stays')
    await pg.evaluate(f"sessionStorage.setItem('__launchUrl', 'schmeckts://scan'); sessionStorage.setItem('__code', '{SHEBA}')")
    await pg.add_init_script("if (sessionStorage.getItem('__code')) window.__barcode = sessionStorage.getItem('__code');")
    await pg.reload(); await started(pg)
    check(await state(pg, f"db.servings.length === {n + 2} && db.servings[0].productId === '{huhn}'"), 'a cold start with schmeckts://scan: scanned and served')
    await pg.evaluate("sessionStorage.clear()")
    check(not real_errors(errors), 'no errors in the console' + (f': {real_errors(errors)}' if real_errors(errors) else ''))
    await ctx.close()


SRV = 'http://192.168.99.9:8486'   # the server is only simulated, at a home-network address
OFF_HIT = {'status': 1, 'product': {'product_name_de': 'Sheba Fresh Choice Huhn in Sauce 4x50g', 'brands': 'Sheba, Mars',
                                    'categories_tags': ['en:cat-food', 'en:wet-cat-food']}}


async def test_recognize(browser, url):
    print('the recognition chain: known code, product lookup, server, text on the device')
    fail = {'online': False, 'server': False}                     # so that each stage can be made to fail on purpose
    seen = {'online': 0}

    async def off_route(route, request):                          # Open Pet Food Facts and Open Food Facts
        seen['online'] += 1
        if fail['online']:
            await route.fulfill(status=500, headers={'access-control-allow-origin': '*'}, body='')
            return
        found = 'openpetfoodfacts' in request.url and '4008429087455' in request.url
        await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                            body=json.dumps(OFF_HIT if found else {'status': 0}))

    async def srv_route(route, request):                          # the household server
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
    for pattern, handler in (('https://world.openpetfoodfacts.org/**', off_route), ('https://world.openfoodfacts.org/**', off_route),
                             (f'{SRV}/**', srv_route)):
        await ctx.route(pattern, handler)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)

    async def ident(**kw):
        return await pg.evaluate("o => import('./js/recognize.js').then(r => r.identify(o))", kw)

    async def setp(**kw):
        await pg.evaluate("p => import('./js/store.js').then(m => { Object.assign(m.prefs, p); })", kw)

    # On-device text recognition: in mode `lokal` the photo prefills „Futter benennen“
    await pg.evaluate("window.__ocrText = 'Sheba\\nNEU\\nSelection in Sauce\\nmit Lachs\\n4 x 85 g\\nZutaten: Fleisch 40 %'; window.__ocrDelay = 400")
    await pg.click('#fab'); await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await pg.wait_for_selector('#sheet .note .spin')
    reading = [await pg.inner_text('#sheet .note'), await pg.eval_on_selector('.tl-item .t-main b', 'e => e.textContent'),
               await pg.locator('#sheet .note.warn').count()]
    check(reading == ['Packung wird gelesen …', 'Wird gelesen …', 0], f'while the phone reads: a calm notice in the sheet and in the history, without a warning colour ({reading})')
    await until(pg, "!!db.servings[0]?.guess"); await idle(pg)
    await pg.evaluate('window.__ocrDelay = 0')
    filled = await pg.evaluate("[document.getElementById('f-brand').value, document.getElementById('f-variety').value, document.querySelector('.chip[aria-pressed=true]')?.innerText]")
    read = [c[1]['path'] for c in await pg.evaluate('window.__calls') if c[0] == 'processImage']
    gone = [c[1]['path'] for c in await pg.evaluate('window.__calls') if c[0] == 'deleteFile' and c[1]['directory'] == 'CACHE']
    s = await state(pg, "(s => [s.status, s.error ?? null])(db.servings[0])")
    check(filled == ['Sheba', 'Selection in Sauce mit Lachs', 'Nassfutter'] and len(read) == 1 and gone == ['schmeckts-ocr.jpg'] and s == ['noserver', None],
          f'a photo without a server: the phone reads the text and prefills brand, variety and type ({filled}, {s})')
    await shot(pg, 'text-read')
    await pg.click('[data-action=save-name]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    p = await state(pg, "(p => [p.brand, p.variety, p.type, p.texture])(db.products[0])")
    check(p == ['Sheba', 'Selection in Sauce mit Lachs', 'Nassfutter', 'sosse'] and not await state(pg, 'db.servings[0].guess'),
          f'confirmed: the variety is created including its consistency, and the guess is gone ({p})')
    # The same packaging again: our own variety is recognised, spelled differently too
    await pg.evaluate("window.__ocrText = 'SHEBA  selection-in-sauce mit LACHS 85g'")
    got = await ident(photo='AAA')
    check(got['source'] == 'text' and got['details']['brand'] == 'Sheba' and got['details']['variety'] == 'Selection in Sauce mit Lachs',
          f'a known variety recognised in the text ({got.get("details")})')
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
    check(got['source'] == 'online' and [hit.get(k) for k in ('brand', 'variety', 'type', 'animal')] == ['Sheba', 'Fresh Choice Huhn in Sauce', 'Nassfutter', 'Katze']
          and kept['found'] is True, f'product lookup on: brand and variety cleaned up as on the server ({hit})')
    before = seen['online']
    await ident(code='4008429087455')
    miss = await ident(code='96385074')
    kept = await state(pg, "prefs.codes['96385074']")
    check(seen['online'] == before + 2 and miss['source'] == '' and kept['found'] is False,
          f'hit and miss remembered: the same code does not go out again ({seen["online"] - before} requests for 2 codes)')

    # Server: when connected it looks the code up and recognises the photo
    await setp(server=SRV, code='K7PM-3QXD', lookup=False)
    got = await ident(code='96385074')
    check(got['source'] == 'server' and got['details']['brand'] == 'Felix', f'connected: the server looks the barcode up ({got.get("details")})')
    got = await ident(photo='AAA')
    check(got['source'] == 'server' and got['details']['variety'] == 'Gold Pastete', f'connected: the server recognises the photo ({got.get("details")})')

    # Every stage falls through cleanly to the next, cheapest first
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    await setp(lookup=True)
    chain = []
    fail.update(online=False, server=False)
    chain.append((await ident(code='4008429087455', photo='AAA'))['source'])   # product lookup before the server
    fail['online'] = True
    chain.append((await ident(code='96385074', photo='AAA'))['source'])        # product lookup broken → server
    fail['server'] = True
    chain.append((await ident(code='96385074', photo='AAA'))['source'])        # server broken → text on the device
    await pg.evaluate("window.__ocrText = ''")
    chain.append((await ident(code='96385074', photo='AAA'))['source'])        # nothing works → an empty form
    check(chain == ['online', 'server', 'text', ''], f'the chain: every stage works and every one falls through cleanly ({chain})')
    await pg.evaluate("p => import('./js/store.js').then(m => { m.db.products[0].codes = {'4008429087455': true}; })")
    first = await ident(code='4008429087455', photo='AAA')
    check(first['source'] == 'codes' and len(first['products']) == 1, f'a barcode already known in the household beats everything ({first["source"]})')
    await setp(code='', server='', lookup=False)
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)[:2]}')
    await ctx.close()


async def test_exchange(browser, url):
    print('manual exchange: share, receive, answer — two phones without a server')

    async def settings(pg):
        if await pg.locator('#sheet [data-action=open-settings]').count() == 0 and await pg.evaluate("document.getElementById('sheet').open"):
            await pg.click('[data-action=close]'); await idle(pg)
        await pg.click('[data-action=open-settings]'); await idle(pg)

    async def shared_file(pg):                  # the most recently shared exchange file from the cache
        return await pg.evaluate("""(() => { const k = Object.keys(localStorage).filter(n => n.includes('exchange')).sort();
          return localStorage.getItem(k[k.length - 1]); })()""")

    async def receive(pg, text):                # like „Austausch empfangen“ with this file
        await settings(pg)
        await pg.set_input_files('#exchangeInput', files=[{'name': 'schmeckts-exchange-2026-01-01.json',
                                                           'mimeType': 'application/json', 'buffer': text.encode()}])
        await idle(pg)
        return await pg.inner_text('#serverBox .note')

    async def data(pg):
        # Make the data comparable: keys sorted, and as in the protocol an empty field counts as a missing one
        return await state(pg, """JSON.stringify([db.pets, db.products, db.servings], (k, v) => v === null ? undefined
          : v && typeof v === 'object' && !Array.isArray(v) ? (Object.keys(v).length ? Object.fromEntries(Object.entries(v).sort()) : undefined) : v)""")

    ctx_a, a, err_a = await seeded(browser, url, {'db': SAVED}, native=True)
    ctx_b = await phone(browser)
    b, err_b = await open_page(ctx_b, url, native=True)
    await a.evaluate("import('./js/store.js').then(m => { m.prefs.name = 'Geheimniskraemer'; m.savePrefs(); })")

    # First share: everything, with our own clocks, without any settings
    await settings(a)
    await a.click('[data-action=share-changes]'); await idle(a)
    text = await shared_file(a)
    file = json.loads(text)
    shared = ['share' == c[0] for c in await a.evaluate('window.__calls')]
    check(sorted(file) == ['app', 'at', 'clocks', 'device', 'kind', 'protocol', 'records'] and file['app'] == 'schmeckts'
          and file['kind'] == 'exchange' and len(file['records']) == 5 and len(file['clocks']['servings']) == 3
          and 'Geheimniskraemer' not in text and any(shared),
          f'first share: all {len(file["records"])} records including clocks, nothing from the settings')
    await shot(a, 'exchange-share')

    # Receiving on the empty phone B
    note = await receive(b, text)
    da, dbb = await data(a), await data(b)
    check(note == '5 Änderungen übernommen. Beide Geräte sind gleich.' and dbb == da
          and await b.locator('[data-action=send-answer]').count() == 0,
          f'received: everything taken over, no answer needed („{note}“)')
    await shot(b, 'exchange-receive')

    # Both change something different on the same record, and B deletes a meal on top
    await a.evaluate("import('./js/store.js').then(m => { m.db.products[0].variety = 'Lachs pur'; m.save(); })")
    await b.evaluate("""import('./js/store.js').then(m => { m.db.products[0].kaufen = 'immer';
      m.db.servings = m.db.servings.filter(s => s.id !== 'lxserv0001'); m.save(); })""")
    await idle(a); await idle(b)
    await settings(b)
    await b.click('[data-action=share-changes]'); await idle(b)
    second = json.loads(await shared_file(b))
    note = await receive(a, json.dumps(second))
    check(len(second['records']) == 2 and note == '2 Änderungen übernommen. 1 Änderung fehlt auf dem anderen Gerät.'
          and await a.locator('#serverBox [data-action=send-answer]').count() == 1,
          f'second share: only what is new, and something is missing over there → the „Antwort senden“ button („{note}“)')
    check(await state(a, "db.products[0].kaufen === 'immer' && db.products[0].variety === 'Lachs pur' && db.servings.length === 2"),
          'merged per field: both changes are there, and the deleted meal stays deleted')

    # The answer closes the gap: afterwards both are level
    await a.click('#serverBox [data-action=send-answer]'); await idle(a)
    answer = json.loads(await shared_file(a))
    note = await receive(b, json.dumps(answer))
    check(len(answer['records']) == 1 and note == '1 Änderung übernommen. Beide Geräte sind gleich.'
          and await data(b) == await data(a) and await a.locator('[data-action=send-answer]').count() == 0,
          f'the answer sends exactly what was missing, after which both devices are level („{note}“)')

    # Shared from another app: the app opens the receive flow by itself
    await b.click('[data-action=close]'); await idle(b)
    await b.evaluate("t => localStorage.setItem('__fs:schmeckts-exchange-shared.json', t)", json.dumps(answer))
    await b.evaluate("window.__urlOpen({url: 'content://media/external/file/schmeckts-exchange-shared.json'})")
    await idle(b)
    opened = await b.evaluate("[document.getElementById('sheet').open, document.querySelector('#sheet h2')?.innerText]")
    check(opened == [True, 'Einstellungen'] and 'Beide Geräte sind gleich' in await b.inner_text('#serverBox .note'),
          f'shared from another app: the settings open with the report ({opened})')

    # Foreign and corrupted files
    foreign = [(json.dumps({'app': 'other', 'kind': 'exchange'}), 'Diese Datei ist kein Schmeckt’s-Austausch.'),
             ('kein json', 'Diese Datei ist kein Schmeckt’s-Austausch.'),
             (json.dumps({'version': 3, 'pets': [], 'products': [], 'servings': []}), 'Das ist ein Backup. Es gehört unter „Daten“ zu „Backup importieren“.'),
             (json.dumps({'app': 'schmeckts', 'kind': 'exchange', 'protocol': 1, 'device': 'x'}), 'Diese Austausch-Datei ist beschädigt.'),
             (json.dumps({'app': 'schmeckts', 'kind': 'exchange', 'protocol': 9, 'device': 'x', 'clocks': {}, 'records': []}),
              'Die Datei kommt von einer neueren App. Bitte diese App aktualisieren.')]
    before = await data(b)
    notes = []
    for body, want in foreign:
        await settings(b)
        await b.set_input_files('#exchangeInput', files=[{'name': 'foreign.json', 'mimeType': 'application/json', 'buffer': body.encode()}])
        await idle(b)
        notes.append((await b.inner_text('#toast')).split('\n')[0])
    check(notes == [w for _, w in foreign] and await data(b) == before,
          f'foreign or corrupted files: a message people understand, and nothing changed ({notes})')
    check(not real_errors(err_a) and not real_errors(err_b), f'no errors in the console {real_errors(err_a)[:2]}{real_errors(err_b)[:2]}')
    await ctx_a.close(); await ctx_b.close()


async def one_pet(browser, url, scheme='light', **kw):
    """A phone in mode `lokal` with the pet Minka, with her pet sheet open"""
    ctx = await phone(browser, scheme, **kw)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)
    return ctx, pg, errors


async def open_pet(pg, i=0):
    await pg.evaluate(f"import('./js/logic/pets.js').then(async p => p.openPet((await import('./js/store.js')).db.pets[{i}].id))"); await idle(pg)


PIXEL = """([src, pts]) => new Promise(done => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); done({w: img.width, h: img.height, px: pts.map(([fx, fy]) => { const d = x.getImageData(Math.round(fx * (img.width - 1)), Math.round(fy * (img.height - 1)), 1, 1).data;
    return d[0] > 150 && d[1] < 100 ? 'red' : d[1] > 120 && d[0] < 100 ? 'green' : d[2] > 150 && d[0] < 100 ? 'blue' : d[0] > 180 && d[1] > 160 ? 'yellow' : [...d].join(); })}); }; img.src = src; })"""


CORNERS = [[.1, .1], [.9, .1], [.1, .9], [.9, .9]]


async def test_crop(browser, url):
    print('cropping the profile picture')
    make_pictures()
    ctx, pg, errors = await one_pet(browser, url)
    await open_pet(pg)
    await pg.set_input_files('#petPhotoInput', str(PACK.parent / 'quadrants.png')); await idle(pg)
    crop = lambda: pg.evaluate("import('./js/ui/sheet.js').then(async m => { const c = (await import('./js/ui/crop.js')).cropRect(m.sheet.crop); return [Math.round(c.x), Math.round(c.y), Math.round(c.side), +m.sheet.crop.z.toFixed(2)]; })")
    view = await pg.evaluate("""(() => { const st = document.getElementById('cropStage'), r = st.getBoundingClientRect(), hole = getComputedStyle(st, '::after'), z = document.getElementById('f-zoom');
      return {h2: document.querySelector('#sheet h2').innerText, square: Math.abs(r.width - r.height) < 1, round: hole.borderRadius, shade: hole.boxShadow !== 'none', touch: getComputedStyle(st).touchAction,
        zoom: [z.type, z.min, z.max, z.value], btns: [...document.querySelectorAll('#sheet .btn')].map(b => b.innerText.trim()), img: !!st.querySelector('img')}; })()""")
    check(view == {'h2': 'Foto zuschneiden', 'square': True, 'round': '50%', 'shade': True, 'touch': 'none', 'zoom': ['range', '1', '4', '1'], 'btns': ['Abbrechen', 'Übernehmen'], 'img': True},
          f'once a photo is picked the crop opens: a square stage, a round cut-out, a slider, „Abbrechen“ and „Übernehmen“ ({view["btns"]})')
    check(await crop() == [200, 0, 400, 1], f'start: fully zoomed out, centre of the image ({await crop()})')
    await shot(pg, 'crop')
    box = await pg.locator('#cropStage').bounding_box()
    cx, cy, S = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, box['width']
    await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + S / 4, cy, steps=4); await pg.mouse.up()
    check(await crop() == [100, 0, 400, 1], f'dragged a quarter to the right with the mouse: the crop moves 100 pixels to the left ({await crop()})')
    await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + S, cy + 50, steps=4); await pg.mouse.up()
    check(await crop() == [0, 0, 400, 1], f'it only goes as far as the edge of the image ({await crop()})')
    await pg.evaluate("(() => { const z = document.getElementById('f-zoom'); z.value = 2; z.dispatchEvent(new Event('input', {bubbles: true})); })()")
    check(await crop() == [100, 100, 200, 2], f'slider at 2: half the edge length around the centre of the stage ({await crop()})')
    TOUCH = """(steps) => { const st = document.getElementById('cropStage'), r = st.getBoundingClientRect();
      for (const [type, id, fx, fy] of steps) st.dispatchEvent(new PointerEvent(type, {pointerId: id, pointerType: 'touch', clientX: r.left + fx * r.width, clientY: r.top + fy * r.height, bubbles: true})); }"""
    await pg.evaluate(TOUCH, [['pointerdown', 11, .5, .5], ['pointermove', 11, .5, .75], ['pointermove', 11, .5, 1], ['pointerup', 11, .5, 1]])
    check(await crop() == [100, 0, 200, 2], f'one finger pans: dragged half a stage down, the crop sits at the top ({await crop()})')
    await pg.evaluate(TOUCH, [['pointerdown', 21, .4, .5], ['pointerdown', 22, .6, .5], ['pointermove', 21, .3, .5], ['pointermove', 22, .7, .5], ['pointerup', 21, .3, .5], ['pointerup', 22, .7, .5]])
    check(await crop() == [150, 50, 100, 4] and await pg.input_value('#f-zoom') == '4', f'two fingers zoom around their midpoint and the slider follows ({await crop()})')
    await pg.evaluate(TOUCH, [['pointerdown', 31, .4, .5], ['pointerdown', 32, .6, .5], ['pointermove', 31, .45, .5], ['pointermove', 32, .55, .5], ['pointerup', 31, .45, .5], ['pointerup', 32, .55, .5]])
    check(await crop() == [100, 0, 200, 2], f'pinching in zooms back out ({await crop()})')
    await pg.click('[data-action=crop-apply]'); await idle(pg)
    got = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step ?? null, m.sheet.photo])")
    res = await pg.evaluate(PIXEL, [got[1], CORNERS])
    check(got[0] is None and got[1].startswith('data:image/jpeg') and res == {'w': 320, 'h': 320, 'px': ['red'] * 4} and await pg.locator('#sheet .pet-photo img').count() == 1,
          f'„Übernehmen“: square, 320 px, exactly the expected crop (the red quadrant only), in the sheet\u2019s photo field ({res})')
    await pg.click('[data-action=save-pet]'); await idle(pg)
    check(await state(pg, 'db.pets[0].photo') == got[1], 'with „Speichern“ it sits on the pet')
    await open_pet(pg)
    await pg.set_input_files('#petPhotoInput', str(PACK)); await idle(pg)
    await pg.click('[data-action=crop-cancel]'); await idle(pg)
    back = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step ?? null, m.sheet.photo])")
    check(back == [None, got[1]] and await pg.locator('#f-name').count() == 1, '„Abbrechen“ leads back to the pet sheet and the profile picture stays')
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


async def test_mood(browser, url):
    print('the mood picture on the home page: the pet\u2019s profile picture')
    make_pictures()
    dist = url.rsplit('/', 1)[0]  # the test photos are not under www: served as a data URL through a route
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme, motion=True)
        await ctx.clock.install()
        async def pictures(route):
            await route.fulfill(path=str(PACK.parent / route.request.url.rsplit('/', 1)[1]), content_type='image/png')
        await ctx.route('**/testfoto/*', pictures)
        pg, errors = await open_page(ctx, url, native=True)
        pic = lambda n: f'{dist}/testfoto/{n}'

        async def pick(who):
            await pg.evaluate(f"import('./js/store.js').then(async s => {{ s.prefs.activePet = '{who}'; (await import('./js/views/home.js')).renderHome(); }})"); await idle(pg)

        await pg.evaluate(SET_PETS, [['Minka', pic('quadrants.png')], ['Tiger', pic('photo0.jpg')], ['Kiwi', None]]); await idle(pg)
        srcs = await state(pg, "db.pets.map(p => p.photo && p.photo.slice(-40))")
        await pick('petminka001')
        css = await pg.evaluate("""() => { const m = document.getElementById('mood'), s = getComputedStyle(m), i = getComputedStyle(m.querySelector('img')), r = m.getBoundingClientRect(), b = document.querySelector('.brand').getBoundingClientRect();
          return {pos: s.position, box: [r.left, r.top, r.width === document.documentElement.clientWidth, r.height], ptr: s.pointerEvents, mask: (s.maskImage || s.webkitMaskImage).startsWith('linear-gradient') && /rgba\\(0, 0, 0, 0\\)\\)$/.test(s.maskImage || s.webkitMaskImage),
            fit: i.objectFit, opacity: +(+i.opacity).toFixed(2), filter: i.filter, trans: i.transitionProperty, front: document.elementFromPoint(b.left + 5, b.top + 10).className,
            card: getComputedStyle(document.querySelector('#home .card')).backgroundColor, first: document.body.firstElementChild.id, aria: m.getAttribute('aria-hidden')}; }""")
        want = {'pos': 'absolute', 'box': [0, 0, True, 260], 'ptr': 'none', 'mask': True, 'fit': 'cover', 'opacity': .16 if scheme == 'light' else .26, 'filter': 'saturate(0.85)',
                'trans': 'all', 'front': 'brand', 'first': 'mood', 'aria': 'true'}
        check({k: css[k] for k in want} == want and 'rgba' not in css['card'], f'layer ({scheme}): full width, 260 px, object-fit cover, opacity {want["opacity"]}, saturate(0.85), the mask fades right out at the bottom, and the cards sit in front unchanged ({css["box"]}, {css["opacity"]})')
        await shot(pg, f'{scheme}-mood')
        # Contrast of the wordmark: in the worst case an all-black or all-white photo sits behind it
        col = await pg.evaluate(RGB_OF + "([getComputedStyle(document.querySelector('.brand')).color, getComputedStyle(document.body).backgroundColor])")
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
        check(shows == {'all': ['', True, 1], 'petminka001': [srcs[0], False, 1], 'pettiger001': [srcs[1], False, 1], 'petkiwi001': ['', True, 1]},
              f'several pets: the chosen pet\u2019s profile picture, none under „Alle“ and none for a pet without a photo ({[v[1] for v in shows.values()]})')
        await pg.evaluate("import('./js/store.js').then(async s => { s.db.pets = s.db.pets.slice(0, 1); s.prefs.activePet = 'all'; s.save(); (await import('./js/views/home.js')).renderHome(); })"); await idle(pg)
        check(await pg.evaluate("import('./js/views/mood.js').then(m => m.moodPhoto().slice(-40))") == srcs[0] and await pg.locator('#pets').is_hidden(),
              'with only one pet, that pet\u2019s picture')
        # The choice in the settings: on or off, in the style of the other choices
        async def choose(v):
            await pg.click('[data-action=open-settings]'); await idle(pg)
            seg = await pg.eval_on_selector_all('[data-action=backdrop]', "l => [l[0].closest('.seg').previousElementSibling.innerText, l[0].getBoundingClientRect().height >= 40, ...l.map(b => b.innerText + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''))]")
            await pg.click(f'[data-action=backdrop][data-v={v}]'); await idle(pg)
            await pg.click('[data-action=close]'); await pg.clock.run_for(600); await idle(pg)  # the clock is stopped: closing takes 240 ms
            return seg
        seg = await choose('off')
        off = [await state(pg, 'prefs.backdrop'), (await pg.evaluate(MOOD))['hidden']]
        await pg.reload(); await started(pg)
        off.append((await pg.evaluate(MOOD))['hidden'])
        seg2 = await choose('on')
        on = [await state(pg, 'prefs.backdrop'), (await pg.evaluate(MOOD))['hidden']]
        check(seg == ['Profilbild im Hintergrund', True, 'An*', 'Aus'] and seg2[2:] == ['An', 'Aus*'] and off == [False, True, True] and on == [True, False],
              f'settings: „Profilbild im Hintergrund“ as an An/Aus choice, on by default; off means no layer, across a restart too ({seg}, {off}, {on})')
        check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
        await ctx.close()
    old = []
    for v in ('card', 'off'):  # values from 1.1.0
        ctx, pg, errors = await seeded(browser, url, {'db': SAVED, 'prefs': {'mode': 'lokal', 'backdrop': v}})
        old.append(await state(pg, 'prefs.backdrop')); await ctx.close()
    check(old == [True, False], f'the 1.1.0 setting is carried over: „Übersicht“ becomes on and „Aus“ stays off ({old})')


async def test_camera(browser, url):
    print('our own camera (simulated device)')
    CAM = """() => { const d = document.getElementById('camera'), v = d.querySelector('video'), r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      return {open: d.open, box: r(d), video: [r(v), getComputedStyle(v).objectFit, v.videoWidth > 0, !!v.srcObject], hint: d.querySelector('.cam-hint').innerText, hintTop: r(d.querySelector('.cam-hint'))[1],
        shutter: r(d.querySelector('.shutter')), cancel: d.querySelector('[data-cam=cancel]').innerText, scheme: getComputedStyle(d).colorScheme, btns: d.querySelectorAll('button').length}; }"""
    LIVE = "navigator.mediaDevices.__streams.filter(s => s.getTracks().some(t => t.readyState === 'live')).length"
    SPY = """(() => { const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md); md.__streams = []; md.__asked = [];
      md.getUserMedia = c => { md.__asked.push(c); return window.__denyCamera ? Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) : orig(c).then(s => (md.__streams.push(s), s)); }; })()"""
    ctx = await phone(browser, permissions=['camera'])
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate(SPY)
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0"); await idle(pg)
    cam = await pg.evaluate(CAM)
    asked = await pg.evaluate("navigator.mediaDevices.__asked[0]")
    check(cam['open'] and cam['box'] == [0, 0, 400, 860] and cam['video'] == [[0, 0, 400, 860], 'cover', True, True] and cam['hint'] == 'Packung fotografieren' and cam['hintTop'] < 40
          and cam['shutter'][2] >= 72 and cam['shutter'][1] > 700 and abs(cam['shutter'][0] + cam['shutter'][2] / 2 - 200) <= 1 and cam['cancel'] == 'Abbrechen' and cam['btns'] == 2 and cam['scheme'] == 'dark',
          f'feeding → photo: full screen with a live preview, the hint at the top, a large shutter at the bottom centre, „Abbrechen“ ({cam["shutter"]})')
    check(asked == {'audio': False, 'video': {'facingMode': {'ideal': 'environment'}, 'width': {'ideal': 1920}, 'height': {'ideal': 1080}}}, f'getUserMedia: rear camera, ideally 1920×1080, without audio ({asked["video"]})')
    await shot(pg, 'camera')
    await pg.evaluate("window.__calls.length = 0")
    await pg.click('#camera .shutter'); await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    after = await pg.evaluate("import('./js/ui/sheet.js').then(m => [document.getElementById('camera').open, m.sheet?.kind, m.sheet?.step, document.querySelectorAll('#camera button').length])")
    s = await state(pg, "(s => [db.servings.length, s.status, (s.photo || '').slice(0, 23), !!s.thumb])(db.servings[0])")
    check(after[:3] == [False, 'serving', 'name'] and s == [1, 'noserver', 'data:image/jpeg;base64,', True] and await pg.evaluate(LIVE) == 0,
          f'the shutter takes the picture at once, without a confirmation: served, shrunk, on to naming; and the camera is released ({after}, {s})')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    # Cancel, the back button, the background: the camera is released at once and the feeding sheet stays
    for how, act in (('„Abbrechen“', "document.querySelector('#camera [data-cam=cancel]').click()"), ('back button', 'window.__back({canGoBack: false})'),
                     ('app in the background', "(() => { Object.defineProperty(document, 'hidden', {get: () => true, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; })()")):
        await pg.click('#fab'); await idle(pg)
        await pg.click('#sheet [data-action=photo]')
        await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0"); await idle(pg)
        was = await pg.evaluate(f"[document.getElementById('camera').open, {LIVE}]")
        await pg.evaluate(act); await idle(pg)
        now = await pg.evaluate(f"import('./js/ui/sheet.js').then(m => [document.getElementById('camera').open, {LIVE}, m.sheet?.kind])")
        check(was == [True, 1] and now == [False, 0, 'feed'] and await state(pg, 'db.servings.length') == 1, f'{how}: the camera closes and is released at once, nothing is served and the feeding sheet stays ({now})')
        await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    # After an unknown barcode and through a deep link
    await pg.evaluate(f"window.__barcode = '{SHEBA}'")
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0"); await idle(pg)
    check((await pg.evaluate(CAM))['hint'] == 'Vorderseite fotografieren', 'after an unknown barcode: our own camera with the hint „Vorderseite fotografieren“')
    await pg.click('#camera .shutter'); await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    check(await state(pg, f"db.servings.length === 2 && db.servings[0].scanCode === '{SHEBA}'") and await pg.evaluate(LIVE) == 0, 'shutter pressed: served, and the code sits on the meal')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})"); await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0"); await idle(pg)
    check((await pg.evaluate(CAM))['open'], 'the shortcut and schmeckts://photo open our own camera')
    await pg.click('#camera .shutter'); await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    check(await state(pg, 'db.servings.length') == 3, 'and serve once the shutter is pressed')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    # Fallback: permission denied → the camera app through the photo plugin
    await pg.evaluate(f"window.__denyCamera = true; window.__calls.length = 0; window.__photo = '{base64.b64encode(PACK.read_bytes()).decode()}'")
    await pg.click('#fab'); await idle(pg)
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    calls = await pg.evaluate("window.__calls.filter(c => c[0] === 'capture').map(c => c[1])")
    check(calls == [None] and not await pg.evaluate("document.getElementById('camera').open") and await state(pg, 'db.servings.length') == 4,
          f'camera permission denied: without our own camera it carries on through the camera app (photo plugin) and serves ({calls})')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    await pg.evaluate("(() => { window.__photo = null; window.Capacitor.Plugins.Photo.capture = () => Promise.reject(new Error('camera unavailable')); })()")
    await pg.click('#fab'); await idle(pg)
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_function("document.querySelector('#toast').innerText.includes('Android-Einstellungen')"); await idle(pg)
    t = await pg.inner_text('#toast')
    check('Android-Einstellungen' in t and await state(pg, 'db.servings.length') == 4, f'when the camera app will not open either (Android blocks it once the permission is denied): a clear notice („{t.strip()}“)')
    check(not await pg.evaluate("document.getElementById('petPhotoInput').hasAttribute('capture')"), 'the profile picture comes from the gallery')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_no_camera(browser, url):
    print('without a camera: the file picker in the browser')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    async with pg.expect_file_chooser(timeout=5000) as fc:
        await pg.click('#sheet [data-action=photo]')
    chooser = await fc.value
    check(chooser.element is not None and not await pg.evaluate("document.getElementById('camera').open"), 'with no camera: the file picker in the browser')
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


async def test_feed_start(browser, url):
    print('„Füttern beginnt mit“: barcode, photo or both; both routes stay open')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('[data-action=demo]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    seg = await pg.eval_on_selector_all('#sheet [data-action=feed-start]', 'l => l.map(b => [b.innerText, b.getAttribute("aria-pressed")])')
    check(seg == [['Barcode & Foto', 'true'], ['Nur Foto', 'false'], ['Nur Barcode', 'false']],
          f'a setting with three options, with „Barcode & Foto“ as the default ({seg})')
    await pg.click('#sheet [data-action=close]'); await idle(pg)
    for v, want in (('beides', ['scan', 'photo']), ('foto', ['photo']), ('barcode', ['scan'])):
        await pg.click('[data-action=open-settings]'); await idle(pg)
        await pg.click(f'#sheet [data-action=feed-start][data-v={v}]'); await idle(pg)
        await pg.click('#sheet [data-action=close]'); await idle(pg)
        await pg.click('#fab'); await idle(pg)
        cta = await pg.eval_on_selector_all('#sheet .cta', 'l => l.map(b => [b.dataset.action, Math.round(b.getBoundingClientRect().width)])')
        row = await pg.eval_on_selector('#sheet .cta-row', 'r => Math.round(r.getBoundingClientRect().width)')
        check([c[0] for c in cta] == want and (len(want) > 1 or cta[0][1] == row),
              f'„{v}“: only the chosen button, and a single one takes the full width ({cta}, row {row} px)')
        await pg.click('#sheet [data-action=close]'); await idle(pg)
    # With „Nur Barcode“ the photo stays reachable through the shortcut
    await pg.evaluate(f"window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}")
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://photo'})")
    await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    check(await state(pg, "db.servings[0].photo && db.servings[0].status === 'noserver'"),
          'with „Nur Barcode“ schmeckts://photo still takes a photo')
    await pg.click('#sheet [data-action=close]'); await idle(pg)
    # With „Nur Foto“ scanning stays reachable through the shortcut, and the unknown code leads to the photo
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('#sheet [data-action=feed-start][data-v=foto]'); await idle(pg)
    await pg.click('#sheet [data-action=close]'); await idle(pg)
    await pg.evaluate(f"window.__barcode = '{SHEBA}'")
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})")
    await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    check(['capture', {'hint': 'Vorderseite fotografieren'}] in await pg.evaluate('window.__calls')
          and await state(pg, f"db.servings[0].scanCode === '{SHEBA}'"),
          'with „Nur Foto“ schmeckts://scan still scans, and the unknown code leads to the photo')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_suggestions(browser, url):
    print('feeding: at most three suggestions, a search field from four varieties, up to eight hits')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(SORTS, [3, 0]); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    names = await pg.eval_on_selector_all('#serveList .plist b', 'l => l.map(x => x.innerText)')
    check(names == ['Sorte 1', 'Sorte 2', 'Sorte 3'] and await pg.locator('#sheet [data-search]').count() == 0,
          f'three varieties: all of them as suggestions, the one fed last first, no search field ({names})')
    await pg.click('#sheet [data-action=close]'); await idle(pg)
    await pg.evaluate(SORTS, [4, 0]); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    names = await pg.eval_on_selector_all('#serveList .plist b', 'l => l.map(x => x.innerText)')
    order = await pg.eval_on_selector('#sheet', "s => [...s.querySelectorAll('#serveList, .search, #serveHits, [data-action=new-product]')].map(e => e.id || e.className.split(' ')[0])")
    check(names == ['Sorte 1', 'Sorte 2', 'Sorte 3'] and order == ['serveList', 'search', 'serveHits', 'btn'],
          f'from four varieties on: three suggestions, the search field below them, and „Ohne Foto eintippen“ stays ({names}, {order})')
    await pg.click('#sheet [data-action=close]'); await idle(pg)
    await pg.evaluate(SORTS, [12, 0]); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    await pg.fill('#sheet [data-search]', 'Sorte'); await idle(pg)
    many = await pg.eval_on_selector_all('#serveHits b', 'l => l.map(x => x.innerText)')
    check(len(many) == 8 and await pg.locator('#serveList').is_hidden(),
          f'the search shows at most eight hits in place of the suggestions ({len(many)})')
    await pg.fill('#sheet [data-search]', 'sheba sorte 11'); await idle(pg)
    hit = await pg.eval_on_selector_all('#serveHits b', 'l => l.map(x => x.innerText)')
    await pg.fill('#sheet [data-search]', ''); await idle(pg)
    back = await pg.eval_on_selector_all('#serveList .plist b', 'l => l.map(x => x.innerText)')
    check(hit == ['Sorte 11'] and back == ['Sorte 1', 'Sorte 2', 'Sorte 3'] and await pg.locator('#serveHits li').count() == 0,
          f'searching brand and variety together, and an empty field shows the suggestions again ({hit})')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


async def test_home_history(browser, url):
    print('the history on the home page: five meals, loading more up to twenty, then the evaluation')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(SORTS, [26, 1]); await idle(pg)
    items = lambda: pg.locator('[data-sec=hist] .tl-item').count()
    btn = lambda: pg.eval_on_selector_all('[data-sec=hist] .card-btn', 'l => l.map(b => [b.innerText, b.dataset.action, b.dataset.v || ""])')
    cal = lambda: pg.eval_on_selector('[data-sec=hist] .cal', 'c => c.innerHTML')
    first, before = await items(), await cal()
    check(first == 5 and await btn() == [['Weitere anzeigen', 'more-history', '']] and await pg.locator('[data-sec=hist] .tl-day').count() == 5,
          f'five meals to begin with, grouped by day, with „Weitere anzeigen“ below ({first})')
    steps = []
    for _ in range(4):
        if await pg.locator('[data-action=more-history]').count():
            await pg.click('[data-action=more-history]'); await idle(pg)
        steps.append(await items())
    check(steps == [10, 15, 20, 20] and await btn() == [['Ganzer Verlauf', 'open-report', 'hist']],
          f'five more at a time up to twenty, then „Ganzer Verlauf“ ({steps})')
    check(await cal() == before, 'the two-week calendar stays unchanged while that happens')
    await pg.click('[data-action=open-report]'); await idle(pg)
    at_hist = await pg.evaluate("""(() => { const b = document.getElementById('ab-hist'), s = document.querySelector('.sheet-body');
      return [!!b, Math.round(b.getBoundingClientRect().top - s.getBoundingClientRect().top)]; })()""")
    check(await pg.inner_text('#sheet .sh-head h2') == 'Auswertung' and at_hist[0] and abs(at_hist[1]) < 4,
          f'„Ganzer Verlauf“ opens the evaluation at the history section ({at_hist})')
    await pg.click('#sheet [data-action=close]'); await idle(pg)
    await pg.reload(); await started(pg)
    check(await items() == 5, 'after a restart the history starts at five again')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()


REPORT_SECTIONS = "() => [...document.querySelectorAll('#sheet h3.label')].map(h => h.id)"


async def test_report(browser, url):
    print('the evaluation: span, pet filter, sections, history, text descriptions')
    ctx = await browser.new_context(viewport={'width': 400, 'height': 860}, timezone_id='Europe/Berlin', reduced_motion='reduce')
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-20T10:00:00+02:00')
    await pg.evaluate(HOUSE, [house_meals()]); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('#sheet [data-action=open-report]'); await idle(pg)
    spans = await pg.eval_on_selector_all('#sheet [data-action=report-span]', 'l => l.map(b => [b.innerText, b.getAttribute("aria-pressed")])')
    short, short_n = await pg.evaluate(REPORT_SECTIONS), await pg.locator('#sheet .tl-item').count()
    check(spans == [['30 Tage', 'true'], ['90 Tage', 'false'], ['Alles', 'false']] and short[0] == 'ab-trend',
          f'the span switch at the top, „30 Tage“ by default, and the page starts at the beginning ({spans})')
    await pg.click('#sheet [data-action=report-span][data-v="0"]'); await idle(pg)
    full, full_n = await pg.evaluate(REPORT_SECTIONS), await pg.locator('#sheet .tl-item').count()
    check([short_n, full_n] == [10, 18] and 'ab-hist' in short and set(short) <= set(full),
          f'the span applies to the whole page, and sections without enough data are left out ({short_n} → {full_n} meals, {short} → {full})')
    says = await pg.eval_on_selector_all('#sheet .why', 'l => l.map(p => p.innerText)')
    labels = await pg.eval_on_selector_all('#sheet [role=img]', 'l => l.map(x => (x.getAttribute("aria-label") || "").length)')
    check(len(says) == len(full) - 1 and all(s.endswith('.') for s in says) and len(labels) == len(says) and all(n > 20 for n in labels),
          f'every graphic with a sentence below it and a text description ({len(says)} sentences, {labels})')
    head = await pg.inner_text('#sheet .sh-head h2')
    check(head == 'Auswertung für alle Tiere' and await pg.locator('#sheet .plot polyline').count() == 2
          and await pg.eval_on_selector_all('#sheet .legend .key', 'l => l.map(k => k.innerText)') == ['Minka', 'Tiger'],
          f'two pets: two lines with a legend, and the filter in the heading ({head})')
    await pg.click('#sheet [data-action=close]'); await idle(pg)
    await pg.click('[data-action=filter][data-id=minka00001]'); await idle(pg)
    await pg.click('[data-sec=ins] [data-action=open-report]'); await idle(pg)
    head = await pg.inner_text('#sheet .sh-head h2')
    check(head == 'Auswertung für Minka' and await pg.locator('#sheet .plot polyline').count() == 1 and await pg.locator('#sheet .legend').count() == 0,
          f'the home page\u2019s pet filter: one line without a legend, and the name in the heading ({head})')
    await pg.click('#sheet [data-action=close]'); await idle(pg)
    await pg.click('[data-action=filter][data-id=all]'); await idle(pg)
    await pg.evaluate("""import('./js/store.js').then(s => { s.db.servings.forEach(x => { for (const k in x.pets) x.pets[k].r = null; });
      s.save(); return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('#sheet [data-action=open-report]'); await idle(pg)
    hint = await pg.eval_on_selector_all('#sheet .hint', 'l => l.map(x => x.innerText)')
    check(await pg.evaluate(REPORT_SECTIONS) == ['ab-hist'] and hint == ['Ab 3 Bewertungen in diesem Zeitraum zeigt diese Seite, was ankommt.'],
          f'too little data: one sentence about when it starts; the history stays ({hint})')
    check(not real_errors(errors), f'no errors in the console {real_errors(errors)}')
    await ctx.close()
    # Loading more in the history, and how it looks at 360 px in light and dark
    for scheme in ('light', 'dark'):
        ctx = await browser.new_context(viewport={'width': 360, 'height': 760}, color_scheme=scheme, reduced_motion='reduce')
        pg, errors = await open_page(ctx, url)
        await pg.evaluate(SORTS, [26, 1]); await idle(pg)
        await pg.click('[data-action=open-settings]'); await idle(pg)
        await pg.click('#sheet [data-action=open-report]'); await idle(pg)
        was = await pg.locator('#sheet .tl-item').count()
        await pg.click('#sheet [data-action=report-more]'); await idle(pg)
        now = await pg.locator('#sheet .tl-item').count()
        check([was, now] == [20, 26], f'the evaluation\u2019s history loads 20 more at a time ({was} → {now})')
        wide = await pg.evaluate("""[...document.querySelectorAll('#sheet .lv-name, #sheet .lv-n, #sheet .lv-s, #sheet .wd-col b, #sheet .chart-y span, #sheet .why, #sheet h3.label')]
          .filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth).map(e => e.innerText)""")
        chart = await pg.eval_on_selector('#sheet .chart', 'c => [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)]')
        check(not wide and chart[0] <= 360 and chart[1] > 80, f'{scheme}, 360 px: nothing clipped and the graphic holds up ({chart}, {wide})')
        check(not real_errors(errors), f'no errors in the console ({scheme}) {real_errors(errors)}')
        await ctx.close()


run_tests({'tour': test_tour, 'flow': test_flow, 'buying': test_buying, 'cards': test_cards, 'history': test_home_history, 'report': test_report, 'week': test_week, 'overview': test_overview, 'scales': test_scales, 'texture': test_texture, 'feed-start': test_feed_start, 'suggestions': test_suggestions, 'milestones': test_milestones,
           'reminder': test_reminders, 'own-interval': test_remind, 'feed-reminder': test_feed_remind, 'pets': test_petbar, 'modes': test_modes, 'network': test_network, 'shortcuts': test_shortcuts,
           'scanning': test_scan, 'recognition': test_recognize, 'exchange': test_exchange, 'crop': test_crop, 'mood': test_mood, 'camera': test_camera, 'no-camera': test_no_camera},
          camera=('camera',))
