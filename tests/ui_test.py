#!/usr/bin/env python3
"""Abläufe und Oberfläche der App in Chromium, ohne Server, mit simulierten Android-Plugins.
Aufruf: python3 tests/ui_test.py [name …] [--bilder]   (--bilder legt Screenshots in dist/test/ ab)"""
import asyncio, base64, json, re, time
import xml.etree.ElementTree as ET
from common import PACK, ROOT, SAVED, SHEBA, UPC, check, contrast, debounced, idle, make_pictures, open_page, phone, real_errors, run_tests, seeded, shot, started, state, until

async def test_tour(browser, url, scheme='light'):
    print(f'Rundgang ({scheme})')
    ctx = await phone(browser, scheme)
    pg, errors = await open_page(ctx, url)
    await shot(pg, f'{scheme}-willkommen')
    await pg.click('[data-action=demo]'); await idle(pg)
    check(await state(pg, 'db.servings.length') > 10, 'Beispieldaten geladen')
    check(await pg.locator('#syncChip').is_hidden(), 'ohne Server kein Sync-Hinweis oben')
    await shot(pg, f'{scheme}-start')
    await pg.click('#fab'); await idle(pg)
    await shot(pg, f'{scheme}-fuettern')
    await pg.click('[data-action=scan]'); await idle(pg)  # im Browser: Eingabe, hier abgebrochen
    check(await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta-row [data-action=scan]').count() == 1,
          'Füttern-Sheet mit „Barcode“ und „Foto“, Abbrechen bleibt im Sheet')
    before = await state(pg, 'db.servings.length')
    await pg.click('.plist [data-action=serve]'); await idle(pg)
    check(await state(pg, 'db.servings.length') == before + 1, 'bekannte Sorte serviert')
    await pg.click('.pend [data-action=rate][data-r=gut]'); await idle(pg)
    check(await state(pg, "Object.values(db.servings[0].pets)[0].r") == 'gut', 'mit einem Tipp bewertet')
    heads = await pg.eval_on_selector_all('#home > section', 'l => l.map(s => s.classList.contains("card") ? s.querySelector("h2").innerText : "-")')
    hint = [h for h in heads if h in ('Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    week = [h for h in heads if h == 'Letzte Woche']  # nur montags bis mittwochs
    check(heads == ['Mau', 'Wie war’s?'] + hint + week + ['Verlauf', 'Einkaufen', 'Erkenntnisse'] and len(hint) == 1, f'Karten in fester Reihenfolge, zuerst die Übersicht: {heads}')
    check(await pg.locator('.cal').count() == 1 and await pg.locator('[data-sec=hist] .tl-day').count() >= 1 and await pg.locator('[data-sec=shop] .bar').count() == 0,
          'Verlauf sofort sichtbar, Einkaufen zugeklappt')
    await pg.click('[data-action=expand][data-v=shop]'); await idle(pg)
    check(await pg.locator('[data-sec=shop] .shop li').count() > 5, 'Einkaufen aufgeklappt: alle Sorten')
    await pg.click('[data-action=expand][data-v=ins]'); await idle(pg)
    n = await pg.locator('[data-sec=hist] .tl-item').count()
    await pg.click('[data-sec=hist] .card-btn'); await idle(pg)
    check(n == 5 and await pg.locator('[data-sec=hist] .tl-item').count() == 10, '„Weitere anzeigen“ zeigt fünf weitere Mahlzeiten')
    await shot(pg, f'{scheme}-aufgeklappt')
    await pg.click('[data-action=open-settings]'); await idle(pg)
    other = 'dark' if scheme == 'light' else 'light'
    await pg.click(f'[data-action=theme][data-v={other}]'); await idle(pg)
    bg = await pg.evaluate('getComputedStyle(document.documentElement).backgroundColor')
    meta = await pg.eval_on_selector('meta[name=theme-color]', 'm => m.content')
    check(bg == meta and await pg.get_attribute('html', 'data-theme') == other, f'Theme gewechselt: Grund und Browserleiste folgen ({meta})')
    rows = await pg.eval_on_selector_all('#serverBox .label, #serverBox .btn, #serverBox input', "l => l.map(e => e.innerText?.trim() || e.id)")
    check(rows == ['Produktsuche im Internet', 'Eigener KI-Schlüssel', 'f-aikey', 'Austausch von Hand', 'Änderungen teilen',
                   'Austausch empfangen', 'Mit Haushalt verbinden']
          and await pg.locator('#f-code, #f-server').count() == 0 and await pg.locator('#f-aikey[type=password]').count() == 1,
          f'Einstellungen, Abschnitt „Haushalt“ im Modus „lokal“: Produktsuche, verdeckter Schlüssel, Austausch, Verbinden ({rows})')
    await pg.locator('#serverBox').scroll_into_view_if_needed()
    await shot(pg, f'{scheme}-einstellungen')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-sec=shop] [data-action=open-product]'); await idle(pg)
    check(await pg.locator('.prod-card, .sh-head').count() > 0, 'Futter-Sheet öffnet')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('.tl [data-action=open-serving]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_flow(browser, url):
    print('Abläufe in der Android-App (Plugins simuliert)')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=set-species][data-v=Hund]')
    await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)  # mit einem Tier gibt es keine Tiere-Leiste
    await pg.click('#sheet [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Tiger'); await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    check(await state(pg, 'db.pets.length') == 2, 'zwei Tiere angelegt')
    await pg.click('#fab'); await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK)); await idle(pg)
    check(await state(pg, "db.servings[0].status + '|' + db.servings[0].error") == 'noserver|undefined' and await pg.locator('#sheet #f-brand').count() == 1,
          'Foto im Modus „lokal“: gespeichert, „Futter benennen“ öffnet sich direkt, kein Aufruf bei Anthropic')
    await pg.fill('#f-brand', 'Sheba'); await pg.fill('#f-variety', 'Lachs in Soße')
    await pg.click('[data-action=save-name]'); await idle(pg)
    rates = pg.locator('#sheet .pet-rate')
    await rates.nth(0).locator('[data-r=gut]').click(); await idle(pg)
    await rates.nth(1).locator('[data-r=sosse]').click(); await idle(pg)
    check(await state(pg, "Object.values(db.servings[0].pets).map(x => x.r).join()") == 'gut,sosse', 'beide Tiere bewertet')
    check(await state(pg, "!('photo' in db.servings[0]) && !('status' in db.servings[0])"), 'nach dem Benennen: Foto und Status aufgeräumt')
    await pg.click('.tl [data-action=open-serving]'); await idle(pg)
    await pg.click('[data-action=delete-serving]'); await idle(pg)
    check(await state(pg, 'db.servings.length') == 0, 'Mahlzeit gelöscht')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, "db.servings.length + '|' + db.products.length") == '1|1', 'Rückgängig stellt sie wieder her')
    await pg.click('#fab'); await idle(pg)
    await pg.evaluate('window.__back({canGoBack: true})'); await idle(pg)
    check(not await pg.evaluate("document.getElementById('sheet').open"), 'Zurück-Taste schließt das Sheet')
    await pg.evaluate('window.__back({canGoBack: false})'); await idle(pg)
    check(['minimize', None] in await pg.evaluate('window.__calls'), 'Zurück auf der Startseite: App in den Hintergrund')
    await pg.click('[data-action=open-settings]'); await idle(pg)
    check('Version 9.9.9' in await pg.inner_text('.foot'), 'Versionsnummer aus der App')
    await pg.click('[data-action=export]'); await idle(pg)
    calls = await pg.evaluate('window.__calls')
    names = [c[0] for c in calls]
    check(any(c[0] == 'writeFile' and c[1]['directory'] == 'CACHE' for c in calls) and 'share' in names, 'Backup über Datei und Teilen-Menü')
    check('setStyle' in names, 'Statusleiste folgt dem Theme')
    await pg.evaluate("import('./js/logic/products.js').then(m => m.shareShopping())"); await idle(pg)
    listed = [c[1] for c in await pg.evaluate('window.__calls') if c[0] == 'share' and c[1].get('text')]
    check(len(listed) == 1 and listed[0]['title'].startswith('Einkaufen für ') and listed[0]['text'].startswith(listed[0]['title']) and 'files' not in listed[0],
          f'Einkaufsliste in der App über das Teilen-Menü (Share-Plugin) als Text ({listed[0]["title"] if listed else listed})')
    styles = [c[1]['style'] for c in calls if c[0] == 'impact']
    check({'LIGHT', 'MEDIUM', 'HEAVY'} <= set(styles), f'Vibration abgestuft: Auswahl, Erfolg, Löschen ({sorted(set(styles))})')
    await pg.click('[data-action=close]'); await idle(pg)
    # Kurzbefehle und Deep Links bei laufender App
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://fuettern'})"); await idle(pg)
    check(await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta.primary').count() == 1,
          'schmeckts://fuettern öffnet das Füttern-Sheet')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://foto'})"); await idle(pg)
    check(['aufnehmen', None] in await pg.evaluate('window.__calls') and await pg.evaluate("document.getElementById('sheet').open")
          and await pg.locator('#sheet button.cta[data-action=photo]').count() == 1, 'schmeckts://foto: Kamera über das Plugin, Abbruch lässt das Füttern-Sheet offen')
    await pg.evaluate(f"window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}")
    before = await state(pg, 'db.servings.length')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://foto'})"); await idle(pg)
    check(await state(pg, 'db.servings.length') == before + 1 and await state(pg, "db.servings[0].status === 'noserver' && !!db.servings[0].thumb")
          and await pg.locator('#sheet #f-brand').count() == 1, 'schmeckts://foto mit Foto: serviert und als Eintrag gespeichert, im Modus „lokal“ gleich zum Benennen')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, 'db.servings.length') == before and not await pg.evaluate("document.getElementById('sheet').open"), 'und per Rückgängig wieder weg, das Sheet schließt')
    # Speicher: Dateien im App-Speicher, atomar (erst .tmp, dann umbenennen), nichts mehr in localStorage
    await pg.evaluate("import('./js/store.js').then(m => m.flush())")
    await pg.reload(); await started(pg)
    check(await state(pg, "db.pets.length + '|' + db.servings.length") == '2|1', 'Neustart: Daten aus den Dateien')
    # Kaltstart über einen Deep Link: Capacitor hält das Ereignis bis zum Anmelden zurück
    await pg.evaluate("sessionStorage.setItem('__launchUrl', 'schmeckts://fuettern')"); await pg.reload(); await started(pg)
    check(await pg.evaluate("document.getElementById('sheet').open") and await pg.locator('#sheet .cta.primary').count() == 1,
          'Kaltstart mit schmeckts://fuettern öffnet direkt das Füttern-Sheet')
    await pg.evaluate("sessionStorage.removeItem('__launchUrl'); window.__back({canGoBack: true})"); await idle(pg)
    check(not await pg.evaluate("document.getElementById('sheet').open"), 'Zurück schließt es wieder')
    # Löschung von außen (so wie vom Server): Filter springt zurück
    await pg.evaluate("""import('./js/store.js').then(m => { m.prefs.activePet = m.db.pets[0].id;
      m.merge([{c: 'pets', r: m.db.pets[0].id, f: {_del: {v: true, t: '9999999999999-0000-anderes'}}}]); })""")
    await idle(pg)
    check(await state(pg, 'prefs.activePet') == 'all', 'Filter springt auf „Alle“, wenn das Tier woanders gelöscht wird')
    check(await state(pg, 'db.pets.length') == 1, 'Löschung von außen übernommen')
    await pg.evaluate("""import('./js/store.js').then(m => m.merge([{c: 'servings', r: m.db.servings[0].id,
      f: {['pets.' + m.db.pets[0].id]: {v: {r: 'super', at: 1}, t: '9999999999999-0001-anderes'}}}]))""")
    await idle(pg)
    await pg.evaluate("import('./js/views/home.js').then(m => m.renderHome())")
    check(not [e for e in errors if 'score' in e or 'label' in e], 'unbekannte Bewertung (neuere App-Version) bringt nichts zum Absturz')
    check(not real_errors(errors), 'keine Fehler in der Konsole' + (f': {errors}' if real_errors(errors) else ''))
    await ctx.close()


async def test_kaufen(browser, url):
    print('Eigene Einstellung „Kaufen“ im Futter-Sheet, Tier-Filter, Schnellauswahl')
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
          f'Einkaufen: „Gemischt“ steht bei Nachkaufen mit „für Mau“, mit Tier-Filter Tiger gilt dessen Urteil ({house}, {tiger})')
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{lachs}'}}))"); await idle(pg)
    seg = await pg.eval_on_selector_all('#sheet .seg [data-action=kaufen]', 'l => l.map(b => [b.innerText.trim(), b.getAttribute("aria-pressed")])')
    lines = await pg.eval_on_selector('#sheet .verdict', 'v => [v.querySelector("p").innerText.replace(/\\s+/g, " ").trim(), ...[...v.querySelectorAll(".verdict-pet")].map(x => x.innerText.replace(/\\s+/g, " ").trim())]')
    check(seg == [['Automatisch', 'true'], ['Immer kaufen', 'false'], ['Nicht kaufen', 'false']] and lines[0] == 'Gemischt: Mau ja, Tiger nein'
          and lines[1].startswith('Mau: Nachkaufen') and '4× bewertet, zuletzt' in lines[1] and lines[2] == 'Tiger: Nicht mehr kaufen 2× bewertet, zuletzt Kaum angerührt',
          f'Futter-Sheet „Kaufen“: Automatisch · Immer kaufen · Nicht kaufen, darunter das Urteil, je Tier eine Zeile ({lines})')
    await shot(pg, 'futter-kaufen')
    await pg.click('#sheet [data-action=kaufen][data-v=nicht]'); await idle(pg)
    check(await state(pg, f"db.products.find(p => p.id === '{lachs}').kaufen") == 'nicht'
          and await pg.get_attribute('#sheet [data-action=kaufen][data-v=nicht]', 'aria-pressed') == 'true', 'Nicht kaufen: gespeichert und gewählt')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    check(await pg.locator(f'#sheet .plist [data-action=serve][data-id="{lachs}"]').count() == 0, 'Füttern: Sorten, die nicht mehr gekauft werden, stehen nicht in der Schnellauswahl')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{lachs}'}}))"); await idle(pg)
    await pg.click('#sheet [data-action=kaufen][data-v=auto]'); await idle(pg)
    check(await state(pg, f"!('kaufen' in db.products.find(p => p.id === '{lachs}'))"), 'Automatisch: das Feld fällt weg')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_cards(browser, url):
    print('Startseite: Hinweis, Einkaufen und Erkenntnisse mit „Alle anzeigen“, Verlauf immer offen')
    ctx = await phone(browser, touch=True, motion=True)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]'); await idle(pg)
    # Verlauf: Kalender und die letzten fünf Mahlzeiten, nach Tagen gruppiert
    recent = await pg.evaluate("import('./js/store.js').then(s => s.db.servings.slice(0, 5).map(x => x.id))")
    shown = await pg.eval_on_selector_all('[data-sec=hist] .tl-item', 'l => l.map(b => b.dataset.id)')
    check(await pg.locator('[data-sec=hist] .cal').is_visible() and await pg.locator('[data-sec=hist] .tl-node').first.is_visible()
          and shown == recent and await pg.locator('[data-sec=hist] .tl-day').count() >= 2, f'Verlauf: Kalender und die letzten fünf Mahlzeiten nach Tagen ({len(shown)})')
    # Einkaufen zugeklappt: bis zu 3 zum Nachkaufen, darunter bis zu 2, die nicht mehr gekauft werden
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
          and shop['btn'] == [['Alle anzeigen', 'expand', True, 'false']], f'Einkaufen zugeklappt: bis zu 3 zum Nachkaufen, bis zu 2 nicht mehr, „Alle anzeigen“ am Ende ({shop["ids"]})')
    # Tastatur: Enter klappt weich auf (220 ms), der Fokus bleibt auf dem Knopf, Leertaste klappt zu
    await pg.focus('[data-sec=shop] [data-action=expand]'); await pg.keyboard.press('Enter')
    anim = await pg.eval_on_selector('[data-sec=shop] .card-body', 'b => [b.classList.contains("animating"), b.style.height !== "", b.style.transition]')
    check(anim[0] and anim[1] and '0.22s' in anim[2] and 'ease-out' in anim[2], f'die Karte wächst weich ({anim[2]})')
    await idle(pg)
    shop = await pg.eval_on_selector('[data-sec=shop]', SHOP)
    parts = [(t_, ids) for t_, ids in (('Nachkaufen', m['ja']), ('Beobachten', m['offen']), ('Nicht mehr kaufen', m['nein'])) if ids]
    check(shop['ids'] == [ids for _, ids in parts] and [g[0] for g in shop['grp']] == [t_ for t_, _ in parts] and shop['bars'] == shop['rows']
          and shop['btn'] == [['Weniger anzeigen', 'expand', True, 'true']] and await pg.evaluate("document.activeElement.dataset.v") == 'shop'
          and await pg.eval_on_selector('[data-sec=shop] .card-body', 'b => b.style.height === "" && !b.classList.contains("animating")'),
          f'aufgeklappt: alle Sorten in Nachkaufen, Beobachten, Nicht mehr kaufen, mit Wertungsbalken, „Weniger anzeigen“, Fokus bleibt ({[g[0] for g in shop["grp"]]})')
    await pg.keyboard.press(' '); await idle(pg)
    check(await pg.inner_text('[data-sec=shop] [data-action=expand]') == 'Alle anzeigen' and await pg.locator('[data-action=share-list]').count() == 0 and await pg.locator('[data-sec=shop] .bar').count() == 0, 'Leertaste klappt wieder zu')
    ins = await pg.eval_on_selector('[data-sec=ins]', 'c => [c.querySelectorAll(".ins li").length, [...c.querySelectorAll(".card-btn")].map(b => b.innerText)]')
    check(m['ins'] > 1 and ins == [1, ['Alle anzeigen', 'Zur Auswertung']], f'Erkenntnisse zugeklappt: die wichtigste, darunter „Alle anzeigen“ und „Zur Auswertung“ ({ins}, {m["ins"]} insgesamt)')
    await pg.tap('[data-sec=ins] [data-action=expand]'); await idle(pg)
    check(await pg.locator('[data-sec=ins] .ins li').count() == m['ins'] and await pg.inner_text('[data-sec=ins] [data-action=expand]') == 'Weniger anzeigen', 'Tipp zeigt alle Erkenntnisse')
    await pg.reload(); await started(pg)
    check(await pg.locator('[data-sec=ins] .ins li').count() == 1 and await pg.locator('[data-sec=shop] .bar').count() == 0,
          'nach dem Neustart ist alles zugeklappt')
    await pg.emulate_media(reduced_motion='reduce')
    await pg.click('[data-sec=shop] [data-action=expand]'); await idle(pg)
    check(await pg.locator('[data-sec=shop] .bar').count() > 0 and await pg.eval_on_selector('[data-sec=shop] .card-body', 'b => !b.classList.contains("animating") && b.style.height === ""'),
          'reduzierte Bewegung: sofort, ohne Animation')
    # Hinweis: höchstens einer, Satz, Begründung, Knöpfe; „Nicht mehr kaufen“ und „Immer kaufen“ setzen kaufen, „Ausblenden“ merkt sich das Gerät
    HINT = """c => ({title: c.querySelector('h2').innerText, btns: [...c.querySelectorAll('.btn-row button')].map(b => b.innerText),
      id: (c.querySelector('[data-action=hint-kaufen]') || {}).dataset?.id || c.querySelector('[data-action=hide-hint]').dataset.v.split(':')[1]})"""
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
            await pg.click('[data-sec=hint] [data-action=hint-kaufen]'); await idle(pg)
            ok &= await state(pg, f"db.products.find(p => p.id === '{first['id']}').kaufen") == ('nicht' if first['kind'] == 'stop' else 'immer')
        else:
            await pg.click('[data-sec=hint] [data-action=hide-hint]'); await idle(pg)
            ok &= await state(pg, f"prefs.hiddenHints.includes('{first['kind']}:{first['id']}')")
    check(ok and 'stop' in seen and 'liebling' in seen and seen == sorted(seen, key=['stop', 'sosse', 'liebling'].index) and await pg.locator('[data-sec=hint]').count() == 0,
          f'Hinweis: immer der mit dem höchsten Vorrang, mit seinen Knöpfen; erledigt oder ausgeblendet kommt der nächste ({seen})')
    pins = await pg.eval_on_selector_all('[data-sec=shop] .shop button', 'l => l.filter(b => b.querySelector(".pin")).map(b => b.dataset.id)')
    check(len(pins) == 2 and set(pins) == set(await state(pg, "db.products.filter(p => p.kaufen).map(p => p.id)")), f'eigene Einstellung: Stecknadel an der Sorte ({len(pins)})')
    # leerer Zustand: noch kein Urteil und keine Erkenntnis
    await pg.evaluate("""import('./js/store.js').then(s => { s.db.servings.forEach(x => { for (const k in x.pets) x.pets[k].r = null; }); s.db.products.forEach(p => delete p.kaufen);
      s.db.servings[0].pets[Object.keys(s.db.servings[0].pets)[0]].r = 'gut'; s.save(); return import('./js/views/home.js').then(h => h.renderHome()); })""")
    await idle(pg)
    empty = await pg.eval_on_selector('[data-sec=shop]', 'c => [c.querySelector(".card-body > .card-line").innerText, c.querySelectorAll(".shop, .card-btn, .card-body > :not(.card-line, .taste)").length]')
    check(empty == ['Noch zu wenig Bewertungen. Nach ein paar Mahlzeiten siehst du hier, was ankommt.', 0] and await pg.locator('[data-sec=ins], [data-sec=hint]').count() == 0,
          f'noch kein Urteil: nur die eine Zeile, ohne Erkenntnis keine Karte, ohne Hinweis keine Hinweis-Karte ({empty[0]})')
    # Kalender: Tipp auf einen Tag vor vorgestern zeigt die älteren Tage und springt hin
    old = await pg.evaluate("""(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 2);
      const b = [...document.querySelectorAll('.cal .day.has')].find(x => new Date(x.dataset.day + 'T12:00').getTime() < d.getTime()); return b && b.dataset.day; })()""")
    await pg.click(f'.cal .day[data-day="{old}"]'); await idle(pg)
    top = await pg.eval_on_selector(f'#d-{old}', 'd => [d.getBoundingClientRect().top, d.className, getComputedStyle(d).animationName, innerHeight]')
    check(0 <= top[0] < top[3] - 48 and top[1] == 'tl-day' and top[2] == 'none',
          f'Tipp im Kalender auf einen älteren Tag: er erscheint im Verlauf, Sprung zum Tag, ohne Aufleuchten ({old}, {top})')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
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
    return ([['lachs', {'M': T}, day(f'05-{10 + i}'), 'Anna'] for i in range(3)]                      # Lachs: Minka Nachkaufen
            + [['huhn', {'M': G, 'T': X}, day(f'05-{14 + i}'), 'Jonas'] for i in range(3)]            # Huhn: Minka ja, Tiger nein = Gemischt
            + [['rind', {'T': X}, day(f'05-{18 + i}'), 'Anna'] for i in range(2)]                     # Rind: Nicht mehr kaufen
            + [['pute', {'M': G}, day('05-25'), 'Anna'], ['kaese', {'M': T}, day('05-26'), 'Anna']]
            + [['pute', {'M': T}, day('06-01', '00:00'), 'Anna'], ['pute', {'M': T}, day('06-02'), 'Anna'], ['lachs', {'T': G}, day('06-03'), 'Jonas'],
               ['lachs', {'T': T}, day('06-04'), 'Jonas'], ['ente', {'M': M}, day('06-05'), 'Anna'], [None, {'M': None}, day('06-06'), 'Jonas'],
               ['huhn', {'M': G}, day('06-07', '23:59'), ''], ['lachs', {'M': T}, day('06-07', '12:00'), 'Anna']])


async def test_week(browser, url):
    print('Startseite: Bewertungsknöpfe, „Letzte Woche“, „Geschmack bekannt“, Liste teilen, Appetit')
    ctx = await browser.new_context(viewport={'width': 360, 'height': 800}, timezone_id='Europe/Berlin', permissions=['clipboard-read', 'clipboard-write'])
    pg, errors = await open_page(ctx, url)
    await pg.clock.set_fixed_time('2026-06-09T10:00:00+02:00')
    await pg.click('[data-action=demo]'); await idle(pg)
    # fünf Bewertungsknöpfe bei 360 px, in der Karte und im Sheet
    ROW = """row => [...row.children].map(b => { const r = b.getBoundingClientRect(), lines = [...b.querySelectorAll('span, small')];
      return {r: b.dataset.r, w: r.width, h: r.height, top: Math.round(r.top), lines: lines.map(e => e.innerText), page: document.documentElement.scrollWidth <= innerWidth,
        fits: lines.every(e => e.scrollWidth <= e.clientWidth + .5 && e.getBoundingClientRect().height < parseFloat(getComputedStyle(e).lineHeight) * 1.5)}; })"""
    LINES = [['Sofort', 'leer'], ['Später', 'leer'], ['Halb', 'gegessen'], ['Soße', 'geleckt'], ['Kaum', 'angerührt']]
    for where, sel in (('Karte „Wie war’s?“', '.pend .rate-row'), ('Sheet', '#sheet .rate-row')):
        if where == 'Sheet':
            await pg.click('.pend-head'); await idle(pg)
        b = await pg.eval_on_selector(sel, ROW)
        check([x['r'] for x in b] == ['top', 'gut', 'mittel', 'sosse', 'schlecht'] and [x['lines'] for x in b] == LINES and len({x['top'] for x in b}) == 1
              and max(x['w'] for x in b) - min(x['w'] for x in b) < .6 and all(x['fits'] and x['page'] and x['h'] >= 48 for x in b),
              f'{where}: fünf gleich breite Knöpfe in der Reihenfolge der Skala, bei 360 px nichts abgeschnitten oder umgebrochen, mindestens 48 px hoch')
    await shot(pg, 'bewerten-360')
    await pg.click('[data-action=close]'); await idle(pg)
    # Haushalt mit Vorwoche: Karte „Letzte Woche“ nach dem Hinweis und vor „Verlauf“
    await pg.evaluate(HOUSE, [house_meals()]); await idle(pg)
    heads = await pg.eval_on_selector_all('#home > section.card', 'l => l.map(s => s.querySelector("h2").innerText)')
    hint = [h for h in heads if h in ('Appetit', 'Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    check(len(hint) == 1 and heads[:5] == ['Minka und Tiger'] + hint + ['Letzte Woche', 'Verlauf', 'Einkaufen'], f'„Letzte Woche“ steht direkt nach dem Hinweis, danach „Verlauf“ und „Einkaufen“ ({heads})')
    w = {'lines': await pg.eval_on_selector_all('[data-sec=week] .week p', 'l => l.map(p => p.innerText.trim())')}
    check(w['lines'] == ['8× gefüttert, 7 bewertet', 'Minka mochte am liebsten Pute', 'Tiger mochte am liebsten Lachs in Soße', 'Neuer Liebling: Pute', 'Gefüttert: Anna 4×, Jonas 3×'],
          f'„Letzte Woche“: Mahlzeiten, je Tier die liebste Sorte, neuer Liebling, Futter-Duell mit den meisten zuerst, ohne Namen nicht gezählt ({w["lines"]})')
    await shot(pg, 'letzte-woche')
    await pg.evaluate("import('./js/store.js').then(async s => { s.db.servings.find(x => !x.by && x.servedAt > new Date(2026, 5, 1).getTime()).by = 'Jonas'; s.save(); (await import('./js/views/home.js')).renderHome(); })")
    await idle(pg)
    duel = await pg.inner_text('[data-sec=week] .duel')
    await pg.evaluate("import('./js/store.js').then(async s => { s.db.servings.filter(x => x.servedAt > new Date(2026, 5, 1).getTime()).forEach(x => { x.by = 'Anna'; }); s.save(); (await import('./js/views/home.js')).renderHome(); })")
    await idle(pg)
    check(duel.strip() == 'Gleichstand: Anna und Jonas je 4×' and await pg.locator('[data-sec=week] .duel').count() == 0,
          f'Futter-Duell: bei Gleichstand „{duel.strip()}“, mit nur einer Person keine Zeile')
    # „Schließen“ gilt pro Woche
    await pg.evaluate("import('./js/views/home.js').then(h => h.renderHome())")
    await pg.click('[data-action=close-week]'); await idle(pg)
    closed = [await pg.locator('[data-sec=week]').count(), await state(pg, 'prefs.closedWeek')]
    await pg.reload(); await started(pg)
    closed.append(await pg.locator('[data-sec=week]').count())
    await pg.clock.set_fixed_time('2026-06-15T09:00:00+02:00')
    await pg.evaluate("""import('./js/store.js').then(async s => { for (let i = 0; i < 5; i++) s.db.servings.unshift({id: 'neuewoche' + i, productId: 'lachs000001', servedAt: new Date(2026, 5, 9 + i, 8).getTime(), note: '', by: 'Anna', pets: {minka00001: {r: 'top', at: 1}}});
      s.save(); (await import('./js/views/home.js')).renderHome(); })"""); await idle(pg)
    closed.append(await pg.locator('[data-sec=week]').count())
    check(closed == [0, '2026-06-01', 0, 1], f'„Schließen“ merkt sich das Gerät für diese Woche, auch nach dem Neustart; die nächste Woche erscheint wieder ({closed})')
    # „Geschmack bekannt“ als Fußzeile der Karte „Einkaufen“
    TASTE = """c => { const t = c.querySelector('.taste'), m = t.querySelector('.meter');
      return {text: t.firstChild.textContent.trim(), share: m.querySelector('i').getBoundingClientRect().width / m.getBoundingClientRect().width}; }"""
    t = await pg.eval_on_selector('[data-sec=shop]', TASTE)
    check(t['text'] == 'Geschmack eurer Tiere: 5 von 8 Sorten bekannt' and abs(t['share'] - .625) < .01, f'„Geschmack bekannt“ im Haushalt, der Balken zeigt den Anteil ({t})')
    await pg.click('[data-action=filter][data-id=minka00001]'); await idle(pg)
    t = await pg.eval_on_selector('[data-sec=shop]', TASTE)
    check(t['text'] == 'Minkas Geschmack: 3 von 5 Sorten bekannt', f'„Geschmack bekannt“ mit Tier-Filter ({t["text"]})')
    await shot(pg, 'geschmack-bekannt')
    names = await pg.evaluate("""import('./js/store.js').then(async s => { const h = await import('./js/views/home.js'), out = [];
      for (const n of ['Max', 'Minka']) { s.db.pets[0].name = n; s.save(); h.renderHome(); out.push(document.querySelector('.taste').firstChild.textContent.split(':')[0]); } return out; })""")
    check(names == ['Max’ Geschmack', 'Minkas Geschmack'], f'Genitiv des Tiernamens ({names})')
    # Einkaufsliste teilen: aufgeklappt über „Weniger anzeigen“, Text passend zum Tier-Filter
    await pg.click('[data-action=filter][data-id=all]'); await idle(pg)
    check(await pg.locator('[data-action=share-list]').count() == 0, '„Als Liste teilen“ fehlt in der zugeklappten Karte')
    await pg.click('[data-action=expand][data-v=shop]'); await idle(pg)
    await shot(pg, 'einkaufen-teilen')
    await pg.click('[data-action=share-list]'); await idle(pg)
    house = await pg.evaluate('navigator.clipboard.readText()')
    toast = await pg.inner_text('#toast')
    want = 'Einkaufen für Minka und Tiger\n\nNachkaufen\n- Sheba Lachs in Soße\n- Animonda Pute\n- Miamor Ente\n- Felix Huhn in Gelee (für Minka)\n\nNicht kaufen\n- Dreamies Käse\n- Gourmet Rind Pastete'
    check(house == want and 'Liste kopiert' in toast, f'Liste im Haushalt: Nachkaufen mit „Gemischt“ (für …) und „immer“, Nicht kaufen mit „nicht“, ohne „Beobachten“; ohne Teilen-Menü in die Zwischenablage mit Toast ({house!r})')
    lists = await pg.evaluate("""import('./js/store.js').then(async s => { const d = await import('./js/derive.js'), out = [];
      for (const p of ['minka00001', 'tiger00001']) { s.prefs.activePet = p; out.push(d.shoppingList().text); } s.prefs.activePet = 'all'; return out; })""")
    check(lists == ['Einkaufen für Minka\n\nNachkaufen\n- Sheba Lachs in Soße\n- Animonda Pute\n- Felix Huhn in Gelee\n- Miamor Ente\n\nNicht kaufen\n- Dreamies Käse',
                    'Einkaufen für Tiger\n\nNachkaufen\n- Miamor Ente\n\nNicht kaufen\n- Felix Huhn in Gelee\n- Gourmet Rind Pastete\n- Dreamies Käse'],
          f'Liste mit Tier-Filter: dessen Urteile, leere Gruppen fehlen ({lists})')
    await pg.evaluate("navigator.share = o => { window.__shared = o; return Promise.resolve(); }")
    await pg.click('[data-action=share-list]'); await idle(pg)
    shared = await pg.evaluate('window.__shared')
    check(shared and shared['text'] == want and shared['title'] == 'Einkaufen für Minka und Tiger', 'im Browser mit Teilen-Menü: navigator.share bekommt Titel und Text')
    # Hinweis „Appetit“ in der Hinweis-Karte
    await pg.clock.set_fixed_time('2026-06-09T10:00:00+02:00')
    low = [['lachs', {'M': 'top'}, f'2026-05-{25 + i}T08:00', 'Anna'] for i in range(7)] + [['lachs', {'M': 'top'}, '2026-06-01T08:00', 'Anna'],
           ['rind', {'M': 'mittel'}, '2026-06-07T18:00', 'Anna'], ['huhn', {'M': 'sosse'}, '2026-06-08T14:00', 'Anna'], ['rind', {'M': 'schlecht'}, '2026-06-09T07:00', 'Anna']]
    await pg.evaluate(HOUSE, [low]); await idle(pg)
    HINT = """c => ({title: c.querySelector('h2').innerText, say: c.querySelector('.say').innerText, why: c.querySelector('.why').innerText, btns: [...c.querySelectorAll('.btn-row button')].map(b => [b.innerText, b.className, b.dataset.v])})"""
    h = await pg.eval_on_selector('[data-sec=hint]', HINT)
    check(await pg.locator('[data-sec=hint]').count() == 1 and h == {'title': 'Appetit', 'say': 'Minka frisst seit ein paar Tagen schlechter als sonst.', 'why': 'Die letzten 3 Bewertungen im Schnitt 27 %, sonst 100 %.',
                                                                    'btns': [['Ausblenden', 'btn soft', 'appetit:minka00001:2026-06-09']]},
          f'Hinweis „Appetit“ hat den höchsten Vorrang: Satz, Begründung, nur „Ausblenden“ ({h})')
    await shot(pg, 'hinweis-appetit')
    await pg.click('[data-sec=hint] [data-action=hide-hint]'); await idle(pg)
    nxt = await pg.eval_on_selector('[data-sec=hint]', HINT)
    check(nxt['title'] != 'Appetit' and await state(pg, "prefs.hiddenHints.includes('appetit:minka00001:2026-06-09')"), f'„Ausblenden“ merkt sich das Gerät, der nächste Hinweis rückt nach ({nxt["title"]})')
    check(not real_errors(errors), 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


SCALES_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now(), H = 36e5;
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['trocken', 'Josera', 'Trockenfutter'], ['snack', 'Dreamies', 'Snack']].map(([id, brand, type]) => ({id: id + '0001', brand, variety: '', type, codes: {}, createdAt: 1}));
  d.servings = [['trocken', null, 1], ['snack', null, 2], ['trocken', 'gut', 20], ['trocken', 'gern', 21], ['trocken', 'gern', 22], ['trocken', 'liegen', 23]]
    .map(([pid, r, ago], i) => ({id: 'meal00000' + i, productId: pid + '0001', servedAt: now - ago * H, note: '', pets: {minka00001: {r, at: r ? now - ago * H : null}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_scales(browser, url):
    print('Bewertung je Futterart: Skala der Sorte, vier Spalten bei 360 px, fremde Stufe bleibt sichtbar, Zähler im Futter-Sheet')
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
              and all(x['fits'] and x['icon'] and x['h'] >= 48 for x in b), f'{kind}: vier gleich breite Knöpfe der eigenen Skala mit Icon, bei 360 px nichts abgeschnitten')
    await shot(pg, 'bewerten-skalen-360')
    # gespeicherte Stufe einer anderen Skala: eigener Text und Icon, ein Tipp ersetzt sie
    await pg.click('.tl-item[data-id=meal000002]'); await idle(pg)
    old = await pg.evaluate("[document.querySelector('#sheet .pet-rate > .badge')?.innerText.trim(), !!document.querySelector('#sheet .pet-rate > .badge svg'), document.querySelectorAll('#sheet .rb').length, document.querySelectorAll('#sheet .rb[aria-pressed=true]').length]")
    check(old == ['Später leer', True, 4, 0], f'eine Stufe außerhalb der Skala steht mit eigenem Text und Icon über den vier Knöpfen ({old})')
    # Zähler im Futter-Sheet: die Stufen der Skala, andere vorkommende dahinter
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=open-product][data-id=trocken0001]'); await idle(pg)
    cnt = await pg.eval_on_selector_all('#sheet .cnt', "l => l.map(c => [c.querySelector('span').innerText.replace('\\n', ' '), +c.querySelector('b').innerText, c.getBoundingClientRect().right <= innerWidth])")
    check(cnt == [['Gern gefressen', 2, True], ['Normal gefressen', 0, True], ['Wenig gefressen', 0, True], ['Liegen gelassen', 1, True], ['Später leer', 1, True]],
          f'Futter-Sheet zählt die Stufen der Skala, andere vorkommende dahinter ({cnt})')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('.tl-item[data-id=meal000002]'); await idle(pg)
    await pg.click('#sheet [data-r=normal]'); await idle(pg)
    r = await state(pg, "db.servings.find(x => x.id === 'meal000002').pets.minka00001.r")
    await pg.click('.tl-item[data-id=meal000002]'); await idle(pg)
    now = await pg.evaluate("[!!document.querySelector('#sheet .pet-rate > .badge'), document.querySelector('#sheet .rb[aria-pressed=true]')?.dataset.r]")
    check(r == 'normal' and now == [False, 'normal'], f'ein Tipp auf einen Knopf ersetzt die alte Stufe ({r}, {now})')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


TEXTURE_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1}];
  d.products = [['nass', 'Sheba', 'Lachs', 'Nassfutter'], ['snack', 'Dreamies', 'Käse', 'Snack'], ['trocken', 'Josera', 'Huhn in Soße', 'Trockenfutter']]
    .map(([id, brand, variety, type]) => ({id: id + '0001', brand, variety, type, codes: {}, createdAt: 1}));
  d.servings = d.products.map((p, i) => ({id: 'meal00000' + i, productId: p.id, servedAt: now - (i + 30) * 36e5, note: '', pets: {minka00001: {r: 'top', at: now}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_texture(browser, url):
    print('Konsistenz und Snack-Art: Auswahl je Art, Hinweis bei „Fester Block“, Artwechsel, Stichwörter, Wert des Servers')
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
          f'Futter-Sheet, Nassfutter: „Konsistenz“ mit sechs Chips unter der Art, keine Pflicht, bei 360 px nichts abgeschnitten ({c})')
    await pg.click('#sheet [data-action=set-texture][data-v=block]'); await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(c['on'] == ['block'] and c['note'] == 'Vor dem Servieren zerkleinern' and await tex('nass') == 'block', f'„Fester Block“ gewählt: gespeichert, kleiner Hinweis zum Zerkleinern ({c["on"]}, {c["note"]})')
    await shot(pg, 'futter-konsistenz-360')
    await pg.click('#sheet [data-action=set-texture][data-v=block]'); await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(c['on'] == [] and c['note'] == '' and await state(pg, "!('texture' in db.products.find(p => p.id === 'nass0001'))"), 'ein zweiter Tipp hebt die Auswahl auf, das Feld fällt weg')
    await pg.click('#sheet [data-action=set-texture][data-v=gelee]'); await pg.click('#sheet [data-action=set-texture][data-v=pastete]'); await idle(pg)
    check((await pg.evaluate(CHIPS))['on'] == ['pastete'] and await tex('nass') == 'pastete', 'Einfachauswahl: die neue Wahl ersetzt die alte')
    await pg.click('[data-action=close]'); await idle(pg)
    c = await product('snack')
    check(c['title'] == 'Snack-Art' and c['labels'] == ['Knusprig', 'Weich', 'Creme', 'Milch', 'Stick', 'Kauartikel'] and c['fits'], f'Futter-Sheet, Snack: „Snack-Art“ mit sechs Chips ({c})')
    await pg.click('[data-action=close]'); await idle(pg)
    c = await product('trocken')
    check(c['labels'] == [] and await tex('trocken') is None, 'Trockenfutter: keine Auswahl')
    await pg.click('[data-action=close]'); await idle(pg)
    # Benennen: Chips unter der Art, beim Wechsel der Art fällt ein unpassender Wert weg
    await product('nass')
    await pg.click('[data-action=rename-product]'); await idle(pg)
    c = await pg.evaluate(CHIPS)
    check(c['title'] == 'Konsistenz' and c['on'] == ['pastete'] and c['under'] == 'chips' and c['fits'], f'Benennen: die Chip-Reihe steht unter der Art und zeigt die Auswahl ({c})')
    await pg.click('#sheet [data-action=set-type][data-v=Snack]'); await idle(pg)
    c = await pg.evaluate(CHIPS)
    await pg.click('#sheet [data-action=set-type][data-v=Sonstiges]'); await idle(pg)
    none = await pg.evaluate(CHIPS)
    check(c['title'] == 'Snack-Art' and c['on'] == [] and none['labels'] == [], 'Art gewechselt: die Auswahl der neuen Art, ohne Wert; bei „Sonstiges“ keine Reihe')
    await pg.click('[data-action=save-name]'); await idle(pg)
    check(await state(pg, "(p => p.type === 'Sonstiges' && !('texture' in p))(db.products.find(p => p.id === 'nass0001'))"), 'gespeichert: mit der Art ist auch die Konsistenz weg')
    await pg.click('[data-action=close]'); await idle(pg)
    # Stichwörter beim Benennen: füllen nur ein leeres Feld, eine Auswahl und ein bewusstes „keine“ gelten
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
    check(got == ['gelee', 'mousse', None, 'knusprig', None], f'Benennen: Stichwörter füllen das leere Feld, die eigene Auswahl und ein aufgehobenes Feld bleiben ({got})')
    # Erkennung und Barcode-Treffer: Wert des Servers vor Stichwörtern, nur wenn er zur Art passt; ein vorhandener Wert bleibt
    got = await pg.evaluate("""import('./js/logic/products.js').then(m => { const make = (variety, texture, type = 'Nassfutter') => m.newProduct({brand: 'Test', variety, type, texture}).texture ?? null;
      const old = m.newProduct({brand: 'Test', variety: 'Pute', type: 'Nassfutter', texture: 'suppe'}); m.applyTexture(old, {texture: 'gelee'});
      return [make('Huhn in Soße', 'gelee'), make('Rind in Soße', 'knusprig'), make('Ente in Soße'), make('Sticks', 'weich', 'Snack'), make('Kroketten in Soße', 'sosse', 'Trockenfutter'), old.texture]; })""")
    check(got == ['gelee', 'sosse', 'sosse', 'weich', None, 'suppe'], f'Wert des Servers geht den Stichwörtern vor, wenn er zur Art passt; ein vorhandener Wert bleibt ({got})')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


OVERVIEW_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), now = Date.now(), H = 36e5;
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1, photos: {}}];
  d.products = [['lachs', 'Lachs', 'Nassfutter'], ['rind', 'Rind', 'Nassfutter'], ['snack', 'Käse', 'Snack']].map(([id, variety, type]) => ({id: id + '00001', brand: 'Sheba', variety, type, codes: {}, createdAt: 1}));
  d.servings = [['snack', 'verputzt', 1], ['lachs', 'top', 2], ['lachs', 'top', 30], ['lachs', 'gut', 54], ['rind', 'schlecht', 60], ['rind', 'schlecht', 80]]
    .map(([pid, r, ago], i) => ({id: 'meal00000' + i, productId: pid + '00001', servedAt: now - ago * H, note: '', pets: {minka00001: {r, at: now}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_overview(browser, url):
    print('Übersicht: niedrige Karte mit Bild, Namen und dem Wichtigsten, zwei Zeilen und Aufklappen; Zählung im Verlauf, Abstand über dem Kalender')
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
          f'die Übersicht steht oben: Name in der Schrift der Überschriften, links das Bild mit 72 px, das Wichtigste fett; nie mehr als zwei Zeilen (108 px), längerer Text endet mit „…“ ({c})')
    await shot(pg, 'uebersicht-360')
    await pg.evaluate("window.__card = document.querySelector('.overview')")
    await pg.click('.overview p'); await idle(pg)
    o = await pg.evaluate(CARD)
    await shot(pg, 'uebersicht-offen-360')
    await pg.click('.overview h2'); await idle(pg)
    back = await pg.evaluate(CARD)
    check([o['cut'], o['dots'], o['tap'], o['text']] == [False, False, ['toggle-overview', 'true'], text] and o['height'] > 108 and back == c
          and await pg.evaluate("window.__card === document.querySelector('.overview')"),
          f'ein Tipp auf die Karte zeigt den ganzen Text, ein zweiter klappt wieder zu, beides ohne die Seite neu zu zeichnen ({o["height"]} px, {o["lines"]} Zeilen)')
    day = await pg.evaluate("[document.querySelector('.tl-date span').innerText, document.querySelector('.day.today').getAttribute('aria-label')]")
    check(day == ['1 Mahlzeit, 1 Snack', 'Heute, 1 Mahlzeit, 1 Snack'], f'Verlauf zählt Mahlzeiten und Snacks getrennt, auch für Vorleser im Kalender ({day})')
    gap = await pg.evaluate("document.querySelector('.cal').getBoundingClientRect().top - document.querySelector('[data-sec=hist] h2').getBoundingClientRect().bottom")
    check(gap == 14, f'unter „Verlauf“ 14 px bis zum Kalender, 8 mehr als zuvor ({gap})')
    await pg.click('.ov-pic'); await idle(pg)
    check(await pg.input_value('#sheet #f-name') == 'Minka' and await pg.evaluate("!document.querySelector('.overview').classList.contains('open')"), 'ein Tipp auf das Bild öffnet das Tier und klappt nichts auf')
    await pg.click('[data-action=close]'); await idle(pg)
    # mehrere Tiere: wer zuletzt was bekam, je Tier die liebste Sorte und was nicht ankommt
    await pg.evaluate("""import('./js/store.js').then(async s => { const now = Date.now(), H = 36e5;
      s.db.pets.push({id: 'tiger00001', name: 'Tiger', species: 'Hund', photos: {}, createdAt: 2});
      s.db.products.push({id: 'pute000001', brand: 'Rinti', variety: 'Pute', type: 'Nassfutter', codes: {}, createdAt: 1});
      [26, 50, 74].forEach((ago, i) => s.db.servings.push({id: 'tigermeal' + i, productId: 'pute000001', servedAt: now - ago * H, note: '', pets: {tiger00001: {r: 'top', at: now}}}));
      s.db.servings.unshift({id: 'beide00001', productId: 'lachs00001', servedAt: now - 5 * 6e4, note: '', pets: {minka00001: {r: null, at: null}, tiger00001: {r: null, at: null}}});
      s.save(); (await import('./js/views/home.js')).renderHome(); })"""); await idle(pg)
    house = await pg.evaluate(CARD)
    await pg.click('[data-action=filter][data-id=tiger00001]'); await idle(pg)
    tiger = await pg.evaluate(CARD)
    await pg.evaluate("import('./js/store.js').then(async s => { s.db.pets.push({id: 'kiwi000001', name: 'Kiwi', species: 'Vogel', photos: {}, createdAt: 3}); s.prefs.activePet = 'kiwi000001'; s.save(); (await import('./js/views/home.js')).renderHome(); })"); await idle(pg)
    kiwi = await pg.evaluate(CARD)
    check([house['title'], house['pic'][:2], house['text'], house['bold']] == ['Minka und Tiger', ['SPAN', 2], 'Minka und Tiger bekamen zuletzt vor 5 Min. Lachs. Minka mag am liebsten Lachs, Tiger Pute. Nicht an kommt bei Minka Rind.',
                                                                                 ['vor 5 Min.', 'Lachs', 'Lachs', 'Pute', 'Rind']] and house['height'] == 108 and house['dots'],
          f'bei „Alle“ mit mehreren Tieren nennt der Text die Tiere: wer zuletzt was bekam, je Tier die liebste Sorte, was bei wem nicht ankommt ({house["text"]})')
    check([tiger['title'], tiger['pic'][:2], tiger['text']] == ['Tiger', ['BUTTON', 1], 'Bekam zuletzt vor 5 Min. Lachs (noch offen). Am liebsten Pute.']
          and [kiwi['text'], kiwi['cut'], kiwi['tap'], kiwi['height']] == ['Noch nichts serviert.', False, [None, None], 108],
          f'die Übersicht folgt dem Filter; ohne Mahlzeit gibt es nichts aufzuklappen ({tiger["text"]} / {kiwi["text"]})')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()
    # mit Bewegung: Der Text wächst und schrumpft weich, danach bleibt nichts zurück
    ctx = await browser.new_context(viewport={'width': 360, 'height': 800}, reduced_motion='no-preference')
    pg, errors = await open_page(ctx, url)
    await pg.evaluate(OVERVIEW_DB); await idle(pg)
    SLIDE = """() => new Promise(done => { const c = document.querySelector('.overview'), p = c.querySelector('p'), h = [p.offsetHeight]; c.click();
      setTimeout(() => h.push(p.getBoundingClientRect().height, p.classList.contains('animating')), 110);
      setTimeout(() => { h.push(p.offsetHeight, p.classList.contains('animating'), p.style.height, p.style.transition); done(h); }, 450); })"""
    up, down = await pg.evaluate(SLIDE), await pg.evaluate(SLIDE)
    check(up[0] < up[1] < up[3] and up[2:] == [True, up[3], False, '', ''] and down[0] > down[1] > down[3] and down[2:] == [True, up[0], False, '', ''],
          f'Aufklappen und Zuklappen laufen weich über die Höhe, ohne Neuzeichnen; danach ist alles aufgeräumt ({up[:2] + up[3:4]}, {down[:2] + down[3:4]})')
    await ctx.close()


async def test_milestones(browser, url):
    print('Meilensteine im Toast')
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
    check(t1 == ['Sorte 0 serviert. Zum 100. Mal gefüttert!', True], f'erreicht das Servieren eine Schwelle, steht sie im Toast, „Rückgängig“ bleibt ({t1})')
    await shot(pg, 'meilenstein')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    await serve(0); await idle(pg)
    t2 = await toast()
    check(t2 == ['Sorte 0 serviert', True] and await state(pg, "prefs.milestones.includes('meals:100')"), f'jede Schwelle nur einmal pro Gerät, auch nach „Rückgängig“ ({t2})')
    await serve(9); await idle(pg)
    t3 = await toast()
    check(t3 == ['Sorte 9 serviert. 10 Sorten probiert!', True], f'zehnte Sorte probiert ({t3})')
    # Einstellungen ohne Meilensteine: bereits Erreichtes gilt als gesehen
    await pg.evaluate(FILL, [250, 10]); await idle(pg)
    await pg.evaluate("import('./js/store.js').then(s => { delete s.prefs.milestones; s.savePrefs(); })"); await idle(pg)
    await pg.reload(); await started(pg)
    first = await state(pg, 'prefs.milestones')
    await pg.evaluate("import('./js/store.js').then(s => { s.db.servings.pop(); s.save(); })")
    await serve(1); await idle(pg)
    t4 = await toast()
    check(first == ['meals:50', 'meals:100', 'meals:250', 'sorts:10'] and t4 == ['Sorte 1 serviert', True], f'ohne gemerkte Meilensteine gilt Erreichtes als gesehen ({first}, {t4})')
    # von einem anderen Handy überschritten: still gesehen, kein falscher Satz
    await pg.evaluate(FILL, [520, 10]); await idle(pg)
    await pg.evaluate("import('./js/store.js').then(s => { s.prefs.milestones = ['meals:50', 'sorts:10']; })")
    await serve(1); await idle(pg)
    t5 = await toast()
    check(t5 == ['Sorte 1 serviert', True] and await state(pg, "prefs.milestones.includes('meals:500')"), f'schon überschrittene Schwellen gelten still als gesehen ({t5})')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_reminders(browser, url):
    print('Erinnerung zum Bewerten (Plugin simuliert)')
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
          f'Einstellungen, Abschnitt „Erinnerung“: Aus · 1 Std. · 3 Std. · 6 Std. · Eigene im Segment-Baustein in einer Reihe, Standard „Aus“ ({[x[0] for x in seg]})')
    await shot(pg, 'einstellungen-erinnerung')
    await pg.click('#sheet [data-action=remind][data-v="60"]'); await debounced(pg)
    seg = await pg.evaluate(SEG)
    toast = await pg.inner_text('#toast')
    check(len(await calls('requestPermissions')) == 1 and await state(pg, 'prefs.remind') == 0 and seg[0][1] == 'true' and 'nicht erlaubt' in toast,
          f'Einschalten fragt nach der Erlaubnis; verweigert: zurück auf „Aus“ mit kurzem Hinweis („{toast.strip()}“)')
    await pg.evaluate("localStorage.removeItem('__notifyPermission'); localStorage.setItem('__notifyAnswer', 'granted')")
    await pg.click('#sheet [data-action=remind][data-v="180"]'); await debounced(pg)
    seg = await pg.evaluate(SEG)
    await pg.reload(); await started(pg)
    check(seg[2][1] == 'true' and await state(pg, 'prefs.remind') == 180, 'erlaubt: 3 Std. gewählt und gespeichert, in Minuten')
    # Servieren plant, ungefähre Zeit ohne exakten Alarm
    await pg.click('#fab'); await debounced(pg)
    await pg.click('.plist [data-action=serve]'); await debounced(pg)
    s = await state(pg, "(s => ({id: s.id, at: s.servedAt, name: db.products.find(p => p.id === s.productId).variety, pets: Object.keys(s.pets).map(id => db.pets.find(p => p.id === id).name)}))(db.servings[0])")
    notes = await pending()
    n = notes[0] if notes else {}
    due = await pg.evaluate("t => new Date(t).getTime()", n.get('schedule', {}).get('at'))
    check(len(notes) == 1 and n['title'] == 'Wie war’s?' and n['body'] == f'{s["name"]} für {" und ".join(s["pets"])}' and due == s['at'] + 180 * 60000 and n['extra']['serving'] == s['id']
          and n['isExactNotification'] is False and isinstance(n['id'], int) and 0 < n['id'] < 2 ** 31,
          f'Servieren plant die Benachrichtigung zur Servierzeit plus Abstand, Titel „Wie war’s?“, Text „{n.get("body")}“, ohne exakten Alarm')
    # Tipp öffnet die Mahlzeit im Sheet
    await pg.evaluate("n => window.__tapNote({actionId: 'tap', notification: n})", n); await debounced(pg)
    opened = await pg.evaluate("import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.id])")
    check(opened == [True, 'serving', s['id']] and await pg.locator('#sheet .rate-row .rb').count() == 5 * len(s['pets']), f'ein Tipp auf die Benachrichtigung öffnet das Sheet dieser Mahlzeit zum Bewerten ({opened[1]})')
    # Bewerten: erst wenn alle Tiere bewertet sind, wird abgesagt
    if len(s['pets']) > 1:
        await pg.click('#sheet .pet-rate:nth-child(1 of .pet-rate) [data-r=top]'); await debounced(pg)
        half = len(await pending())
        await pg.click('#sheet .pet-rate:nth-child(2 of .pet-rate) [data-r=gut]'); await debounced(pg)
    else:
        half = 1
        await pg.click('#sheet [data-r=top]'); await debounced(pg)
    check(half == 1 and await pending() == [] and any(c[0]['id'] == n['id'] for c in await calls('cancelNotes')), 'vollständig bewertet: die Erinnerung wird abgesagt, vorher nicht')
    # unbekanntes Futter, zu alte Mahlzeit, gelöscht, Zeit geändert, Abstand geändert, ausgeschaltet
    PLAN = """([id, ago, productId]) => import('./js/store.js').then(async s => { const t = Date.now() - ago * 60000;
      const x = {id, productId, servedAt: t, note: '', pets: {[s.db.pets[0].id]: {r: null, at: null}}}; s.db.servings.unshift(x); s.save();
      (await import('./js/logic/reminders.js')).planReminder(x); return t; })"""
    t0 = await pg.evaluate(PLAN, ['ohnesorte001', 2, None]); await debounced(pg)
    await pg.evaluate(PLAN, ['zualt0000001', 11, None]); await debounced(pg)
    notes = await pending()
    hhmm = await pg.evaluate("t => import('./js/dates.js').then(d => d.timeStr(t))", t0)
    check([x['extra']['serving'] for x in notes] == ['ohnesorte001'] and notes[0]['body'] == f'Futter von {hhmm} für Mau',
          f'unbekanntes Futter: „{notes[0]["body"] if notes else ""}“; Mahlzeiten, die älter als 10 Minuten sind, bekommen keine Erinnerung')
    lachs = await state(pg, "db.products.find(p => p.variety === 'Lachs in Soße').id")
    await pg.evaluate(f"import('./js/store.js').then(s => {{ const x = s.db.servings.find(v => v.id === 'ohnesorte001'); x.productId = '{lachs}'; x.servedAt -= 5 * 60000; s.save(); }})"); await debounced(pg)
    notes = await pending()
    due = await pg.evaluate("t => new Date(t).getTime()", notes[0]['schedule']['at'])
    check(len(notes) == 1 and notes[0]['body'] == 'Lachs in Soße für Mau' and due == t0 - 5 * 60000 + 180 * 60000, 'Sorte erkannt oder Zeitpunkt geändert: die Erinnerung zieht mit')
    await pg.click('[data-action=open-settings]'); await debounced(pg)
    await pg.click('#sheet [data-action=remind][data-v="360"]'); await debounced(pg)
    due60 = await pg.evaluate("t => new Date(t).getTime()", (await pending())[0]['schedule']['at'])
    await pg.click('#sheet [data-action=remind][data-v="0"]'); await debounced(pg)
    off = await pending()
    check(due60 == t0 - 5 * 60000 + 360 * 60000 and off == [] and await calls('requestPermissions') == [], 'anderer Abstand plant um, „Aus“ sagt alles ab; ist die Erlaubnis erteilt, fragt die App nicht noch einmal')
    await pg.click('#sheet [data-action=remind][data-v="60"]'); await debounced(pg)
    await pg.click('[data-action=close]'); await debounced(pg)
    await pg.evaluate(PLAN, ['loeschen0001', 0, lachs]); await debounced(pg)
    before = len(await pending())
    await pg.evaluate("import('./js/logic/editing.js').then(async e => { (await import('./js/ui/sheet.js')).openSheet({kind: 'serving', id: 'loeschen0001'}); e.deleteServing('loeschen0001'); })"); await debounced(pg)
    check(before == 1 and await pending() == [], 'Mahlzeit gelöscht: die Erinnerung wird abgesagt')
    # Abgleich beim Start: Geplantes ohne offene Mahlzeit verschwindet, Offenes bleibt
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
    check(left == ['bleibt000001'], f'beim Start gleicht die App ab: Erinnerungen ohne offene Mahlzeit sind abgesagt, die offene bleibt ({left})')
    check(opened == [True, 'serving', 'bleibt000001'], f'Tipp beim Kaltstart öffnet die Mahlzeit ({opened})')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


async def test_remind(browser, url):
    print('Erinnerung: eigener Abstand in Stunden')
    ctx = await phone(browser)
    await ctx.clock.install()
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('[data-action=demo]'); await debounced(pg)
    await pg.click('[data-action=open-settings]'); await debounced(pg)
    check(await pg.locator('#f-remind').count() == 0, 'ohne „Eigene“ kein Zahlenfeld')
    hints = [await pg.inner_text('#remind-hint')]
    await pg.click('[data-action=remind][data-v="60"]'); await debounced(pg)
    hints.append(await pg.inner_text('#remind-hint'))
    await pg.click('[data-action=remind][data-v="0"]'); await debounced(pg)
    await pg.click('[data-action=remind-own]'); await debounced(pg)
    hints.append(await pg.inner_text('#remind-hint'))
    f = await pg.eval_on_selector('#f-remind', 'f => [f.type, f.min, f.max, f.step, f.value, f.labels[0]?.innerText, f.className]')
    on = await pg.eval_on_selector_all('#sheet [data-action^=remind][aria-pressed=true]', 'l => l.map(b => b.innerText.trim())')
    check(f == ['number', '1', '24', '1', '2', 'Stunden nach dem Füttern', 'field'] and on == ['Eigene'] and await state(pg, 'prefs.remind') == 120,
          f'„Eigene“ zeigt ein Zahlenfeld für ganze Stunden von 1 bis 24, von „Aus“ mit 2 Stunden; gespeichert in Minuten ({f})')
    await shot(pg, 'erinnerung-eigene')
    await pg.evaluate("document.getElementById('f-remind').__same = true")
    await pg.fill('#f-remind', '5'); await debounced(pg)
    hints.append(await pg.inner_text('#remind-hint'))
    check(hints == ['Dieses Handy erinnert nicht ans Bewerten.', 'Dieses Handy erinnert 1 Stunde nach dem Füttern ans Bewerten.', 'Dieses Handy erinnert 2 Stunden nach dem Füttern ans Bewerten.',
                    'Dieses Handy erinnert 5 Stunden nach dem Füttern ans Bewerten.'], f'der Hinweis sagt, was mit der Auswahl gilt, auch beim Tippen der eigenen Stunden ({hints})')
    same = await pg.evaluate("[document.getElementById('f-remind').__same === true, document.activeElement.id]")
    check(await state(pg, 'prefs.remind') == 300 and same == [True, 'f-remind'], f'5 eingetippt: 300 Minuten gelten sofort, das Feld bleibt beim Tippen stehen ({same})')
    for bad in ('30', '0', ''):
        await pg.fill('#f-remind', bad); await debounced(pg)
    check(await state(pg, 'prefs.remind') == 300, 'Werte außerhalb von 1 bis 24 ändern nichts')
    await pg.press('#f-remind', 'Enter'); await debounced(pg)
    check(await pg.input_value('#f-remind') == '5', 'Feld verlassen: es zeigt wieder den geltenden Wert')
    await pg.click('[data-action=close]'); await debounced(pg)
    await pg.click('#fab'); await debounced(pg)
    await pg.click('.plist [data-action=serve]'); await debounced(pg)
    due = await pg.evaluate("window.Capacitor.Plugins.LocalNotifications.getPending().then(r => new Date(r.notifications[0].schedule.at).getTime())")
    check(due == await state(pg, 'db.servings[0].servedAt') + 5 * 3600e3, 'geplant wird zur Servierzeit plus 5 Stunden')
    await pg.reload(); await started(pg)
    await pg.click('[data-action=open-settings]'); await debounced(pg)
    on = await pg.eval_on_selector_all('#sheet [data-action^=remind][aria-pressed=true]', 'l => l.map(b => b.innerText.trim())')
    check(on == ['Eigene'] and await pg.input_value('#f-remind') == '5', f'nach dem Neustart: „Eigene“ mit 5 Stunden ({on})')
    await pg.click('#sheet [data-action=remind][data-v="180"]'); await debounced(pg)
    check(await pg.locator('#f-remind').count() == 0 and await state(pg, 'prefs.remind') == 180, 'eine feste Stufe blendet das Feld wieder aus')
    await pg.click('#sheet [data-action=remind][data-v="0"]'); await debounced(pg)
    await pg.evaluate("localStorage.setItem('__notifyPermission', 'denied'); localStorage.setItem('__notifyAnswer', 'denied')")
    await pg.click('[data-action=remind-own]'); await debounced(pg)
    on = await pg.eval_on_selector_all('#sheet [data-action^=remind][aria-pressed=true]', 'l => l.map(b => b.innerText.trim())')
    check(on == ['Aus'] and await pg.locator('#f-remind').count() == 0 and 'nicht erlaubt' in await pg.inner_text('#toast'), 'ohne Erlaubnis bleibt auch „Eigene“ bei „Aus“')
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
    await ctx.close()


FEED_DB = """() => import('./js/store.js').then(async s => { const d = s.defaults(), at = (day, time) => new Date(`2026-06-${String(day).padStart(2, '0')}T${time}`).getTime();
  d.pets = [{id: 'minka00001', name: 'Minka', species: 'Katze', createdAt: 1, photos: {}}];
  d.products = [['nass', 'Lachs', 'Nassfutter'], ['snack', 'Käse', 'Snack']].map(([id, variety, type]) => ({id: id + '000001', brand: 'Sheba', variety, type, codes: {}, createdAt: 1}));
  d.servings = [3, 4, 5, 6, 7, 8, 9].flatMap(day => [[day, '07:15'], [day, '18:30']]).map(([day, time], i) => ({id: 'meal0000' + String(i).padStart(2, '0'), productId: 'nass000001', servedAt: at(day, time), note: '',
    pets: {minka00001: {r: 'gut', at: at(day, time)}}}));
  s.replaceDb(d); s.save(); (await import('./js/views/home.js')).renderHome(); })"""


async def test_feed_remind(browser, url):
    print('Erinnerung ans Füttern: übliche Zeiten aus dem Verlauf, geplant nur, solange nichts serviert ist')
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
          f'Einstellungen, unter „Ans Bewerten erinnern“: „Ans Füttern erinnern“, Standard aus; ohne Verlauf erklärt der Hinweis, woher die Zeiten kommen ({empty})')
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
          f'Einschalten fragt nach der Erlaubnis, ohne sie bleibt es aus; der Hinweis nennt die gelernten Zeiten und was gerade gilt ({before[1]} / {sec[1]})')
    check(plan == [['2026-06-10|1110', '06-10 19:15'] + note, ['2026-06-11|1110', '06-11 19:15'] + note, ['2026-06-11|435', '06-11 08:00'] + note, ['2026-06-12|1110', '06-12 19:15'] + note, ['2026-06-12|435', '06-12 08:00'] + note],
          f'geplant je übliche Zeit 45 Minuten danach für heute und zwei Tage, ohne exakten Alarm; die Zeit von heute früh ist vorbei ({[x[:2] for x in plan]})')
    await shot(pg, 'einstellungen-fuettern-erinnern')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.clock.set_fixed_time('2026-06-10T18:00:00+02:00')
    await pg.evaluate("import('./js/logic/feeding.js').then(f => f.serveProduct('snack000001'))"); await debounced(pg)
    snack = len(await pg.evaluate(PENDING))
    await pg.evaluate("import('./js/logic/feeding.js').then(f => f.serveProduct('nass000001'))"); await debounced(pg)
    fed = [x[0] for x in await pg.evaluate(PENDING)]
    check(snack == 5 and fed == ['2026-06-11|1110', '2026-06-11|435', '2026-06-12|1110', '2026-06-12|435'], f'ein Snack sagt nichts ab, eine Mahlzeit zur üblichen Zeit die Erinnerung von heute ({snack}, {fed})')
    await pg.evaluate("window.__tapNote({actionId: 'tap', notification: {extra: {feed: '2026-06-11|435'}}})"); await idle(pg)
    check(await pg.locator('#sheet [data-action=scan]').count() == 1, 'ein Tipp auf die Benachrichtigung öffnet das Füttern-Sheet')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('[data-action=feed-remind][data-v=off]'); await debounced(pg)
    check(await pg.evaluate(PENDING) == [] and await state(pg, 'prefs.feedRemind') is False, 'ausgeschaltet: alles Geplante ist abgesagt')
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
    await ctx.close()


async def test_petbar(browser, url):
    print('Startseite: Reihenfolge, Tiere-Leiste erst ab zwei Tieren')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]'); await idle(pg)
    await pg.evaluate("""import('./js/store.js').then(async s => { s.db.servings.unshift({id: 'offen0000001', productId: s.db.products[0].id, servedAt: Date.now() - 60000, note: '',
      pets: {[s.db.pets[0].id]: {r: null, at: null}}}); s.save(); (await import('./js/views/home.js')).renderHome(); })""")
    order = await pg.evaluate("""[...document.querySelectorAll('.app > *, #home > *')].filter(e => e.id !== 'home' && e.getClientRects().length)
      .map(e => e.matches('header') ? 'Kopf' : e.id === 'pets' ? 'Tiere' : e.querySelector('h2')?.innerText ?? e.tagName)""")
    hint = [x for x in order if x in ('Appetit', 'Nicht mehr kaufen?', 'Frisst meist nur die Soße', 'Neuer Liebling')]
    week = [x for x in order if x == 'Letzte Woche']
    check(order == ['Kopf', 'Mau', 'Wie war’s?'] + hint + week + ['Verlauf', 'Einkaufen', 'Erkenntnisse'] and len(hint) == 1,
          f'ein Tier: keine Tiere-Leiste; Übersicht, „Wie war’s?“, Hinweis, „Letzte Woche“, „Verlauf“, „Einkaufen“, „Erkenntnisse“ ({order})')
    check(await pg.locator('#pets').is_hidden() and await pg.locator('#pets *').count() == 0, 'bei einem Tier gibt es keinen Filter')
    await shot(pg, 'start-ein-tier')
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('#sheet [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Tiger'); await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    bar = await pg.eval_on_selector_all('#pets .pet', 'l => l.map(b => [b.innerText.trim(), b.getAttribute("aria-pressed")])')
    order = await pg.evaluate("[...document.querySelectorAll('.app > *')].filter(e => e.getClientRects().length).map(e => e.id || e.tagName)")
    check(bar == [['Alle', 'true'], ['Mau', 'false'], ['Tiger', 'false'], ['Neu', None]] and order == ['HEADER', 'pets', 'home'],
          f'zweites Tier in den Einstellungen angelegt: die Tiere-Leiste erscheint, ganz oben ({[b[0] for b in bar]})')
    await pg.click('#pets .pet:nth-child(2)'); await idle(pg)
    check(await state(pg, "prefs.activePet === db.pets[0].id"), 'die Leiste filtert')
    await shot(pg, 'start-zwei-tiere')
    await pg.evaluate("import('./js/logic/pets.js').then(async p => { (await import('./js/ui/sheet.js')).openSheet({kind: 'pet', id: (await import('./js/store.js')).db.pets[1].id}); p.deletePet(); })")
    await idle(pg)
    check(await pg.locator('#pets').is_hidden(), 'wieder nur ein Tier: die Leiste verschwindet')
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
    await ctx.close()


SERVER_WORDS = re.compile(r'server|abgleich|abgeglichen|erkennung|erkannt|erkenn(en|t)\b')  # im Modus „lokal“ nirgends zu sehen („Erkenntnisse“ schon)


PRIVACY = ['Tiere, Futter und Mahlzeiten speichert die App auf deinem Handy, nicht in der Galerie und nicht in Googles Cloud-Sicherung.',
           'Nutzt du die App nur auf diesem Handy, bleiben die Daten dort. Ausnahme ist der Barcode-Scanner: Er kommt von Google und meldet allgemeine Nutzungsdaten wie das Gerätemodell, aber keine Bilder.',
           'Den Text auf einer Packung liest das Handy selbst, ohne Netz. Zwei Einstellungen unter „Haushalt“ können mehr, beide sind aus: Die Produktsuche im Internet fragt bei unbekannten Barcodes zwei freie Produktdatenbanken, übertragen wird nur die Nummer. Mit einem eigenen KI-Schlüssel geht das Packungsfoto an Anthropic; der Schlüssel liegt nur auf diesem Handy.',
           'Bist du mit einem Haushalt verbunden, gleicht die App mit eurem Server ab. Der schickt Packungsfotos zur Erkennung an Anthropic und unbekannte Barcodes, nur die Nummer, an freie Produktdatenbanken.',
           'Ein Backup und das Löschen aller Daten findest du in den Einstellungen unter „Daten“. „Änderungen teilen“ unter „Haushalt“ gibt eine Datei mit Tieren, Futter und Mahlzeiten an ein anderes Handy weiter, ohne Server.']


async def texts(pg):
    """alle sichtbaren Texte samt Platzhaltern und Beschriftungen für Vorleser"""
    return await pg.evaluate("""[document.body.innerText, ...[...document.querySelectorAll('[placeholder], [aria-label], [title]')]
      .map(e => [e.placeholder, e.getAttribute('aria-label'), e.title].join(' '))].join('\\n').toLowerCase()""")


async def test_modes(browser, url):
    print('Modi: erster Start, bestehende Installationen, „lokal“ ohne Hinweise auf den Server')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True, choose=False)
    btns = await pg.eval_on_selector_all('.welcome button, .welcome a, .welcome label', 'l => l.map(b => [b.innerText.trim(), b.dataset.action])')
    check(btns == [['Nur auf diesem Handy', 'mode-local'], ['Mit Haushalt verbinden', 'connect-form']] and await state(pg, 'prefs.mode') == ''
          and await pg.locator('#fab').is_hidden(), f'erster Start: die Willkommensseite bietet genau zwei Knöpfe ({[b[0] for b in btns]})')
    await shot(pg, 'erster-start')
    await pg.click('[data-action=connect-form]'); await idle(pg)
    form = await pg.evaluate("""[document.getElementById('sheet').open, document.getElementById('f-server')?.value, document.getElementById('f-server')?.placeholder,
      !!document.getElementById('f-code'), document.activeElement.id]""")
    check(form == [True, '', 'http://192.168.… oder https://…', True, 'f-server'] and await state(pg, 'prefs.mode') == '',
          f'„Mit Haushalt verbinden“: Adresse und Code, die Adresse ist leer mit Platzhalter ({form})')
    await shot(pg, 'verbinden-formular')
    await pg.fill('#f-code', 'K7PM3QXD'); await pg.click('[data-action=connect]'); await idle(pg)
    check('Adresse' in await pg.inner_text('#serverBox .note.warn') and await state(pg, "prefs.code === '' && prefs.mode === ''"), 'ohne Adresse wird nicht verbunden: klare Meldung')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=mode-local]'); await idle(pg)
    btns = await pg.eval_on_selector_all('.welcome button', 'l => l.map(b => b.dataset.action)')
    check(await state(pg, 'prefs.mode') == 'lokal' and btns == ['add-pet', 'demo'], f'„Nur auf diesem Handy“: Modus „lokal“, weiter mit dem ersten Tier ({btns})')
    await pg.reload(); await started(pg)
    check(await state(pg, 'prefs.mode') == 'lokal' and await pg.locator('[data-action=mode-local]').count() == 0, 'die Wahl ist gespeichert, gefragt wird nur einmal')
    await ctx.close()

    # ohne gespeicherten Modus: verbunden ergibt „haushalt“, ein benutztes Handy „lokal“
    pet = {'id': 'lxpet00001', 'name': 'Minka', 'species': 'Katze', 'createdAt': 1}
    cases = [('mit Daten, nicht verbunden', {'db': {'version': 3, 'pets': [pet], 'products': [], 'servings': []}}, 'lokal'),
             ('nur Einstellungen, nicht verbunden', {'prefs': {'theme': 'dark'}}, 'lokal'),
             ('verbunden', {'prefs': {'server': 'http://127.0.0.1:9', 'code': 'K7PM-3QXD'}, 'db': {'version': 3, 'pets': [pet], 'products': [], 'servings': []}}, 'haushalt'),
             ('verbunden gewesen, Code fehlt', {'prefs': {'server': 'http://127.0.0.1:9', 'code': '', 'mode': 'haushalt'}}, 'lokal')]
    for name, files, want in cases:
        ctx, pg, errors = await seeded(browser, url, files)
        got = await state(pg, 'prefs.mode')
        check(got == want and await pg.locator('[data-action=mode-local]').count() == 0, f'{name}: Modus „{got}“, keine Frage')
        await ctx.close()

    # Modus „lokal“: nirgends Server, Abgleich oder Erkennung; Foto wird gespeichert und die Sorte direkt eingetippt
    ctx = await phone(browser)
    requests = []
    ctx.on('request', lambda r: requests.append(r.url))
    pg, errors = await open_page(ctx, url, native=True)
    seen = [await texts(pg)]
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)
    seen.append(await texts(pg))  # „So geht’s“
    await pg.click('[data-action=open-settings]'); await idle(pg)
    seen.append(await texts(pg))
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    seen.append(await texts(pg))
    await pg.evaluate('window.__calls.length = 0')
    await pg.set_input_files('#camInputSheet', str(PACK))
    await until(pg, "db.servings[0]?.status === 'noserver'"); await idle(pg)   # das Handy liest den Text, hier ohne Ergebnis
    seen.append(await texts(pg))
    view = await pg.evaluate("""import('./js/ui/sheet.js').then(m => [document.getElementById('sheet').open, m.sheet?.kind, m.sheet?.step, document.querySelector('#sheet h2')?.innerText,
      !!document.querySelector('#sheet .name-photo'), document.querySelectorAll('#sheet .note, #sheet .warn, #sheet .spin').length, document.getElementById('toast').innerText.trim()])""")
    s = await state(pg, "(s => [s.status, !!s.photo, !!s.thumb, s.error ?? null])(db.servings[0])")
    heavy = await pg.evaluate("window.__calls.filter(c => c[0] === 'impact' && c[1].style === 'HEAVY').length")
    check(view[:6] == [True, 'serving', 'name', 'Futter benennen', True, 0] and view[6].startswith('Serviert') and 'erkannt' not in view[6] and s == ['noserver', True, True, None] and heavy == 0,
          f'Foto im Modus „lokal“: gespeichert, „Futter benennen“ öffnet sich direkt, ohne Hinweis und ohne Fehlerton ({view}, {s})')
    await shot(pg, 'lokal-foto-benennen')
    await pg.click('[data-action=close]'); await idle(pg)
    seen.append(await texts(pg))
    row = await pg.eval_on_selector('.pend-head .t-main', "e => [e.innerText.replace(/\\n/g, ' / '), !!e.querySelector('.warn')]")
    check(row == ['Unbekanntes Futter / Tippen zum Benennen', False], f'noch ohne Sorte: neutrale Zeile ohne Warnfarbe ({row})')
    await pg.click('.pend-head'); await idle(pg)
    await pg.fill('#f-brand', 'Sheba'); await pg.fill('#f-variety', 'Lachs'); await pg.click('[data-action=save-name]'); await idle(pg)
    check(await state(pg, "db.servings[0].productId === db.products[0].id && !db.servings[0].status && !db.servings[0].photo"), 'Sorte eingetippt: benannt, das Foto bleibt als Vorschaubild an der Sorte')
    await pg.click('[data-action=close]'); await idle(pg)
    # Barcodes: unbekannt führt zum Foto, danach bekannt
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = '{base64.b64encode(PACK.read_bytes()).decode()}'; window.__calls.length = 0")
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]')
    await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    seen.append(await texts(pg))
    cam = await pg.evaluate("window.__calls.filter(c => c[0] === 'aufnehmen').map(c => c[1])")
    view = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet?.kind, m.sheet?.step])")
    check(cam == [{'hinweis': 'Vorderseite fotografieren'}] and view == ['serving', 'name'] and await state(pg, f"db.servings[0].scanCode === '{SHEBA}'"),
          f'unbekannter Barcode: ohne Nachfrage zum Foto, danach die Sorte eintippen ({cam}, {view})')
    await pg.click('#suggest [data-action=use-product]'); await idle(pg)
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    check(await state(pg, f"!!db.products[0].codes?.['{SHEBA}']"), 'der Code hängt an der gewählten Sorte')
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    seen.append(await texts(pg))
    check(await state(pg, 'db.servings.length') == n + 1 and await state(pg, 'db.servings[0].productId === db.products[0].id') and 'serviert' in (await pg.inner_text('#toast')).lower(),
          'bekannter Barcode: sofort serviert')
    found = sorted({m.group(0) for t in seen for m in SERVER_WORDS.finditer(t)})
    check(not found, f'Modus „lokal“: nirgends Hinweise auf Server, Abgleich oder Erkennung (Willkommen, So geht’s, Einstellungen, Füttern, Foto, Scannen) {found}')
    check(await pg.locator('#syncChip').is_hidden(), 'kein Sync-Hinweis in der Kopfzeile')
    foreign = [r for r in requests if not r.startswith((url.rsplit('/', 1)[0], 'data:', 'blob:'))]
    check(len(requests) > 20 and not foreign and await state(pg, '!prefs.lookup && !prefs.aiKey'),
          f'Modus „lokal“: keine einzige Netzwerkanfrage außer an die App selbst, solange Produktsuche und eigener Schlüssel aus sind ({len(requests)} Anfragen) {foreign[:3]}')
    await pg.click('[data-action=open-settings]'); await idle(pg)
    data = await pg.eval_on_selector_all('#sheet .btn-col:has([data-action=open-privacy]) > *', "l => l.map(b => [b.innerText.trim(), b.classList.contains('btn'), !!b.querySelector('svg')])")
    check([d[0] for d in data] == ['Backup exportieren', 'Backup importieren', 'Beispieldaten laden', 'Datenschutz', 'Alle Daten löschen'] and all(d[1] and d[2] for d in data)
          and await pg.locator('#sheet .privacy').count() == 0, f'Einstellungen: „Datenschutz“ ist ein Knopf wie die anderen unter „Daten“, vor dem Löschen ({[d[0] for d in data]})')
    await pg.click('#sheet [data-action=open-privacy]'); await idle(pg)
    got = await pg.evaluate("[document.querySelector('#sheet h2').innerText, ...[...document.querySelectorAll('#sheet .privacy p')].map(p => p.innerText)]")
    check(got == ['Datenschutz'] + PRIVACY, f'ein Tipp öffnet das Sheet „Datenschutz“ mit genau dem vorgegebenen Text ({len(got) - 1} Absätze)')
    await shot(pg, 'datenschutz')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('[data-action=export]'); await idle(pg)
    await pg.click('[data-action=export]'); await idle(pg)
    gone = [c[1]['path'] for c in await pg.evaluate('window.__calls')
            if c[0] == 'deleteFile' and c[1]['directory'] == 'CACHE' and c[1]['path'].startswith('schmeckts-backup-')]
    check(len(gone) == 1 and gone[0].startswith('schmeckts-backup-'), f'ein geteiltes Backup bleibt nicht im Cache liegen: vor dem nächsten Export gelöscht ({gone})')
    await pg.click('[data-action=close]'); await idle(pg)
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
    await ctx.close()


async def test_network(browser, url):
    print('Netzwerkregel: http nur im Heimnetz, sonst https')
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
    check(not wrong, f'erlaubt: http im Heimnetz (10/8, 172.16/12, 192.168/16, 100.64/10, 127/8, fc00::/7, fe80::/10, localhost, *.local, *.home.arpa), https überall {wrong}')
    msg = 'input: Außerhalb des Heimnetzes geht es nur mit https.'
    wrong = [bad[i] for i, v in enumerate(got[1]) if v not in (msg, 'input: Das ist keine gültige Adresse.')]
    check(not wrong and got[1][:3] == [msg] * 3, f'abgelehnt: http außerhalb, auch an den Grenzen (172.15.x, 172.32.x, 100.63.x, 100.128.x, öffentliche IPv6, ähnliche Namen) {wrong}')
    check(got[2:] == ['', 'http://192.168.1.20:8486'], f'leer bleibt leer, ohne Angabe http ({got[2:]})')
    # beim Verbinden
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if '/api/' in r.url else None)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('#serverBox [data-action=connect-form]'); await idle(pg)
    await pg.fill('#f-server', 'http://schmeckts.example.com:8486'); await pg.fill('#f-code', 'K7PM-3QXD')
    await pg.click('[data-action=connect]'); await idle(pg)
    note = await pg.inner_text('#serverBox .note.warn')
    check(note.strip() == 'Außerhalb des Heimnetzes geht es nur mit https.' and not asked and await state(pg, "prefs.code === '' && prefs.mode === 'lokal'"),
          f'Verbinden mit einer anderen http-Adresse: „{note.strip()}“, keine Anfrage geht hinaus')
    await shot(pg, 'verbinden-nur-https')
    await ctx.close()
    # jede Anfrage: eine gespeicherte Adresse außerhalb des Heimnetzes wird nie angefragt
    ctx, pg, errors = await seeded(browser, url, {'prefs': {'server': 'http://93.184.216.34:8486', 'code': 'K7PM-3QXD'}, 'db': {'version': 3, 'pets': [], 'products': [], 'servings': []}}, native=True)
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if '/api/' in r.url else None)
    res = await pg.evaluate("""Promise.all([import('./js/api.js'), import('./js/recognize.js'), import('./js/sync.js')]).then(async ([a, r, s]) => { const out = [];
      for (const run of [() => a.request('GET', '/api/info'), () => a.request('POST', '/api/push', {body: {}}), () => r.lookupBarcode('4008429087455'), () => r.recognize('AAAA'), () => s.retrySync().then(() => { throw s.status; })])
        out.push(await run().then(() => 'gesendet', e => `${e.kind}: ${e.message}`));
      return out; })""")
    msg = 'Außerhalb des Heimnetzes geht es nur mit https.'
    check(all(msg in x for x in res) and not asked, f'gilt für jede Anfrage (Info, Senden, Barcode, Erkennung, Abgleich): abgelehnt, nichts geht hinaus ({res[0]}, {asked})')
    await ctx.close()


async def test_shortcuts(browser, url):
    print('Kurzbefehle und Deep Links in den Android-Dateien')
    A = '{http://schemas.android.com/apk/res/android}'
    root = ET.parse(ROOT / 'app/native/res/xml/shortcuts.xml').getroot()
    links = [s.find('intent').get(A + 'data') for s in root.findall('shortcut')]
    check(links == ['schmeckts://fuettern', 'schmeckts://scan', 'schmeckts://foto'], 'statische Kurzbefehle „Füttern“, „Scannen“ und „Packung fotografieren“')
    ok = True
    for s in root.findall('shortcut'):
        icon = s.get(A + 'icon').split('/')[1]
        ok &= (ROOT / f'app/native/res/drawable/{icon}.xml').exists()
        for attr in ('shortcutShortLabel', 'shortcutLongLabel'):
            ok &= s.get(A + attr) in ('@string/' + n for n in re.findall(r'name="(\w+)"', (ROOT / 'app/native/res/values/strings_shortcuts.xml').read_text()))
        ok &= s.find('intent').get(A + 'targetClass') == 'de.schmeckts.app.MainActivity'
    check(ok, 'Icons, Beschriftungen und Ziel der Kurzbefehle vorhanden')
    prep = (ROOT / 'scripts/prepare.py').read_text()
    check('android:scheme="schmeckts"' in prep and 'android.intent.category.BROWSABLE' in prep and '@xml/shortcuts' in prep and 'registerPlugin(FotoPlugin.class)' in prep,
          'prepare.py trägt Deep-Link-Filter, Kurzbefehle und das Foto-Plugin ins Android-Projekt ein')
    foto = (ROOT / 'app/native/java/de/schmeckts/app/FotoPlugin.java').read_text()
    check('ACTION_IMAGE_CAPTURE' in foto and 'hinweis' in foto, 'Foto-Plugin nutzt die System-Kamera, mit Hinweis darüber')
    check('com.google.mlkit.vision.DEPENDENCIES' in prep and 'barcode_ui' in prep, 'prepare.py meldet Googles Scanner-Modul im Manifest an (barcode_ui)')
    check('android:mimeType="application/json"' in prep and 'android.intent.action.SEND' in prep and 'EXTRA_STREAM' in prep and 'ACTION_VIEW' in prep,
          'prepare.py nimmt geteilte Austausch-Dateien an: Intent-Filter auf den Dateityp, aus SEND wird VIEW')
    check('abiFilters "armeabi-v7a", "arm64-v8a"' in prep and 'x86' in (ROOT / 'scripts/build-apk.sh').read_text(),
          'nur Handys: prepare.py baut ohne x86, build-apk.sh bricht ab, wenn doch welche in der APK sind')
    build = (ROOT / 'scripts/build-apk.sh').read_text()
    check(re.search(r"grep -q '\"android\.permission\.CAMERA\"' <<<\"\$MANIFEST\" \|\| \{[^}]*exit 1", build) and '<uses-permission android:name="android.permission.CAMERA" />' in prep
          and 'android:name="android.hardware.camera" android:required="false"' in prep, 'Kamerarecht: prepare.py trägt es ins Manifest ein (Kamera nicht vorausgesetzt), build-apk.sh bricht ab, wenn es fehlt')


async def test_scan(browser, url):
    print('Scannen (Plugins simuliert, ohne Server)')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    is_open = lambda: pg.evaluate("document.getElementById('sheet').open")
    impacts = lambda: pg.evaluate("window.__calls.filter(c => c[0] === 'impact').map(c => c[1].style)")
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    # Abbrechen
    await pg.click('[data-action=scan]'); await idle(pg)
    check(['scan', {'formats': ['EAN_13', 'EAN_8', 'UPC_A']}] in await pg.evaluate('window.__calls'), 'Scanner: nur scan(), Formate EAN-13, EAN-8, UPC-A')
    check(await is_open() and await pg.locator('#sheet [data-action=scan]').count() == 1 and await state(pg, 'db.servings.length') == 0,
          'Scannen abgebrochen: zurück im Füttern-Sheet, nichts gespeichert')
    # unbekannter Code ohne Server: Kamera für die Vorderseite, Code wartet, bis die Sorte benannt ist
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}")
    await pg.click('[data-action=scan]')
    await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    check(['aufnehmen', {'hinweis': 'Vorderseite fotografieren'}] in await pg.evaluate('window.__calls'),
          'unbekannter Code ohne Server: direkt die Kamera, Hinweis „Vorderseite fotografieren“')
    check(await state(pg, f"db.servings.length === 1 && db.servings[0].scanCode === '{SHEBA}' && db.servings[0].status === 'noserver'")
          and await pg.locator('#sheet #f-brand').count() == 1, 'Foto serviert, der Code steht an der Mahlzeit, die Sorte wird gleich eingetippt')
    check(await pg.evaluate("Promise.all([import('./js/fields.js'), import('./js/store.js')]).then(([f, m]) => !Object.keys(f.fieldsOf('servings', m.db.servings[0])).some(k => k.startsWith('scan')))"),
          'scanCode bleibt auf dem Handy, abgeglichen wird er nicht')
    await pg.fill('#f-brand', 'Sheba'); await pg.fill('#f-variety', 'Lachs in Soße')
    await pg.click('[data-action=save-name]'); await idle(pg)
    check(await state(pg, f"db.products.length === 1 && db.products[0].codes['{SHEBA}'] === true"), 'benannt: der Code hängt an der benannten Sorte')
    await pg.click('[data-action=close]'); await idle(pg)
    sheba = await state(pg, 'db.products[0].id')
    # bekannter Code: sofort serviert, ohne Server
    before = len(await impacts())
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await state(pg, f"db.servings.length === 2 && db.servings[0].productId === '{sheba}' && db.servings[0].scanCode === '{SHEBA}'")
          and not await is_open(), 'bekannter Code: sofort serviert, ohne Server')
    check('MEDIUM' in (await impacts())[before:] and 'Lachs in Soße serviert' in await pg.inner_text('#toast')
          and await pg.locator('#toast [data-action=undo]').count() == 1, 'mit Vibration und Toast samt Rückgängig')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, "db.servings.length === 1 && db.products.length === 1"), 'Rückgängig nimmt die Mahlzeit zurück, die Sorte bleibt')
    await shot(pg, 'scan-serviert')
    # Multipack: gescannt, dann auf eine andere Sorte geändert, der Code hängt danach an beiden
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    await pg.locator('.pend-head').first.click(); await idle(pg)
    await pg.click('[data-action=edit-name]'); await idle(pg)
    await pg.fill('#f-variety', 'Huhn in Gelee'); await pg.click('[data-action=save-name]'); await idle(pg)
    check(await state(pg, f"db.products.length === 2 && db.products.every(p => p.codes['{SHEBA}'])"),
          'gescannte Mahlzeit auf eine andere Sorte geändert: der Code hängt an beiden (Multipack)')
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await is_open() and 'Welche Sorte?' in await pg.inner_text('#sheet h2') and await pg.locator('#sheet .plist [data-action=serve]').count() == 2,
          'Mehrfachtreffer: kurze Auswahl dieser Sorten')
    await shot(pg, 'scan-auswahl')
    huhn = await state(pg, "db.products.find(p => p.variety === 'Huhn in Gelee').id")
    n = await state(pg, 'db.servings.length')
    await pg.click(f'#sheet [data-action=serve][data-id="{huhn}"]'); await idle(pg)
    check(await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}' && db.servings[0].scanCode === '{SHEBA}'")
          and not await is_open(), 'gewählte Sorte serviert')
    # Code im Futter-Sheet entfernen, mit Rückgängig
    await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{sheba}'}}))"); await idle(pg)
    check(await pg.locator(f'#sheet [data-action=remove-code][data-code="{SHEBA}"]').count() == 1 and SHEBA in await pg.inner_text('#sheet'),
          'Futter-Sheet zeigt die Barcodes der Sorte')
    await shot(pg, 'scan-futter')
    await pg.click('[data-action=remove-code]'); await idle(pg)
    check(await state(pg, f"!db.products.find(p => p.id === '{sheba}').codes['{SHEBA}']") and await pg.locator('#sheet [data-action=remove-code]').count() == 0,
          'Barcode entfernt')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, f"db.products.find(p => p.id === '{sheba}').codes['{SHEBA}'] === true") and await pg.locator('#sheet [data-action=remove-code]').count() == 1,
          'Rückgängig hängt ihn wieder an')
    await pg.click('[data-action=remove-code]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}'") and not await is_open(),
          'nach dem Entfernen: nur noch eine Sorte, sofort serviert')
    # UPC-A wird wie auf dem Server zu EAN-13, hier über das Foto-Plugin ohne Foto (Abbruch)
    await pg.evaluate(f"window.__barcode = '{UPC}'; window.__photo = null")
    n = await state(pg, 'db.servings.length')
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await is_open() and await state(pg, f'db.servings.length === {n}') and await pg.locator('#sheet [data-action=scan]').count() == 1,
          'Kamera abgebrochen: zurück im Füttern-Sheet')
    # Scanner-Modul fehlt: wird installiert, mit kurzem Hinweis
    await pg.evaluate(f"window.__barcode = '{SHEBA}'; window.__scanModule = false")
    await pg.click('[data-action=scan]'); await idle(pg)
    hint = await pg.inner_text('#sheet .note') if await pg.locator('#sheet .note').count() else ''
    await until(pg, f'db.servings.length === {n + 1}'); await idle(pg)
    check(['installModule', None] in await pg.evaluate('window.__calls') and 'Scanner wird eingerichtet' in hint and not await is_open()
          and await state(pg, f"db.servings[0].productId === '{huhn}'"), f'Scanner-Modul fehlt: installiert, Hinweis „{hint}“, danach gescannt')
    # Scannen geht nicht (etwa ohne Google-Play-Dienste): Hinweis aufs Foto, das Sheet bleibt
    await pg.evaluate("window.__scanError = 'Play-Dienste fehlen'")
    await pg.click('#fab'); await idle(pg)
    before = len(await impacts())
    await pg.click('[data-action=scan]'); await idle(pg)
    check(await pg.evaluate("document.getElementById('sheet').open") and 'Foto' in await pg.inner_text('#toast') and 'HEAVY' in (await impacts())[before:],
          'Scanner nicht verfügbar: Hinweis aufs Foto, das Sheet bleibt')
    await pg.evaluate("window.__scanError = null")
    # Deep Link schmeckts://scan bei laufender App und beim Kaltstart
    await pg.click('[data-action=close]'); await idle(pg)
    n = await state(pg, 'db.servings.length')
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})"); await idle(pg)
    check(await state(pg, f"db.servings.length === {n + 1} && db.servings[0].productId === '{huhn}'"), 'schmeckts://scan bei laufender App: gescannt und serviert')
    await pg.evaluate("window.__barcode = null")
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://scan'})"); await idle(pg)
    check(await is_open() and await pg.locator('#sheet [data-action=scan]').count() == 1, 'schmeckts://scan abgebrochen: das Füttern-Sheet bleibt')
    await pg.evaluate(f"sessionStorage.setItem('__launchUrl', 'schmeckts://scan'); sessionStorage.setItem('__code', '{SHEBA}')")
    await pg.add_init_script("if (sessionStorage.getItem('__code')) window.__barcode = sessionStorage.getItem('__code');")
    await pg.reload(); await started(pg)
    check(await state(pg, f"db.servings.length === {n + 2} && db.servings[0].productId === '{huhn}'"), 'Kaltstart mit schmeckts://scan: gescannt und serviert')
    await pg.evaluate("sessionStorage.clear()")
    check(not real_errors(errors), 'keine Fehler in der Konsole' + (f': {real_errors(errors)}' if real_errors(errors) else ''))
    await ctx.close()


SRV = 'http://192.168.99.9:8486'   # Server nur simuliert, Adresse im Heimnetz
OFF_HIT = {'status': 1, 'product': {'product_name_de': 'Sheba Fresh Choice Huhn in Sauce 4x50g', 'brands': 'Sheba, Mars',
                                    'categories_tags': ['en:cat-food', 'en:wet-cat-food']}}


async def test_recognize(browser, url):
    print('Erkennungskette: bekannter Code, Produktsuche, Server, eigener Schlüssel, Text auf dem Gerät')
    fail = {'online': False, 'server': False, 'key': False}      # damit jede Stufe gezielt scheitern kann
    seen = {'online': 0, 'key': 0, 'headers': {}}

    async def off_route(route, request):                          # Open Pet Food Facts und Open Food Facts
        seen['online'] += 1
        if fail['online']:
            await route.fulfill(status=500, headers={'access-control-allow-origin': '*'}, body='')
            return
        found = 'openpetfoodfacts' in request.url and '4008429087455' in request.url
        await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                            body=json.dumps(OFF_HIT if found else {'status': 0}))

    async def ai_route(route, request):                           # api.anthropic.com, eigener Schlüssel
        cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST'}
        if request.method == 'OPTIONS':
            await route.fulfill(status=204, headers=cors)
            return
        seen['key'] += 1
        seen['headers'] = {k: v for k, v in request.headers.items() if k.startswith(('x-api', 'anthropic'))}
        seen['body'] = json.loads(request.post_data)
        if fail['key']:
            await route.fulfill(status=401, headers=cors, content_type='application/json', body='{"error":"nope"}')
            return
        answer = '{"brand":"Cosma","variety":"Thunfisch","type":"Nassfutter","animal":"Katze"}'
        await route.fulfill(status=200, headers=cors, content_type='application/json',
                            body=json.dumps({'content': [{'type': 'text', 'text': answer}]}))

    async def srv_route(route, request):                          # der Haushalts-Server
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
                             ('https://api.anthropic.com/**', ai_route), (f'{SRV}/**', srv_route)):
        await ctx.route(pattern, handler)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)

    async def ident(**kw):
        return await pg.evaluate("o => import('./js/recognize.js').then(r => r.identify(o))", kw)

    async def setp(**kw):
        await pg.evaluate("p => import('./js/store.js').then(m => { Object.assign(m.prefs, p); })", kw)

    # Texterkennung auf dem Gerät: Das Foto im Modus „lokal“ füllt „Futter benennen“ vor
    await pg.evaluate("window.__ocrText = 'Sheba\\nNEU\\nSelection in Sauce\\nmit Lachs\\n4 x 85 g\\nZutaten: Fleisch 40 %'; window.__ocrDelay = 400")
    await pg.click('#fab'); await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await pg.wait_for_selector('#sheet .note .spin')
    reading = [await pg.inner_text('#sheet .note'), await pg.eval_on_selector('.tl-item .t-main b', 'e => e.textContent'),
               await pg.locator('#sheet .note.warn').count()]
    check(reading == ['Packung wird gelesen …', 'Wird gelesen …', 0], f'während das Handy liest: ruhiger Hinweis im Sheet und im Verlauf, ohne Warnfarbe ({reading})')
    await until(pg, "!!db.servings[0]?.guess"); await idle(pg)
    await pg.evaluate('window.__ocrDelay = 0')
    filled = await pg.evaluate("[document.getElementById('f-brand').value, document.getElementById('f-variety').value, document.querySelector('.chip[aria-pressed=true]')?.innerText]")
    read = [c[1]['path'] for c in await pg.evaluate('window.__calls') if c[0] == 'processImage']
    gone = [c[1]['path'] for c in await pg.evaluate('window.__calls') if c[0] == 'deleteFile' and c[1]['directory'] == 'CACHE']
    s = await state(pg, "(s => [s.status, s.error ?? null])(db.servings[0])")
    check(filled == ['Sheba', 'Selection in Sauce mit Lachs', 'Nassfutter'] and len(read) == 1 and gone == ['schmeckts-lesen.jpg'] and s == ['noserver', None],
          f'Foto ohne Server: das Handy liest den Text und füllt Marke, Sorte und Art vor ({filled}, {s})')
    await shot(pg, 'text-gelesen')
    await pg.click('[data-action=save-name]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    p = await state(pg, "(p => [p.brand, p.variety, p.type, p.texture])(db.products[0])")
    check(p == ['Sheba', 'Selection in Sauce mit Lachs', 'Nassfutter', 'sosse'] and not await state(pg, 'db.servings[0].guess'),
          f'bestätigt: die Sorte entsteht samt Konsistenz, das Geratene ist weg ({p})')
    # dieselbe Packung noch einmal: die eigene Sorte wird wiedererkannt, auch anders geschrieben
    await pg.evaluate("window.__ocrText = 'SHEBA  selection-in-sauce mit LACHS 85g'")
    got = await ident(photo='AAA')
    check(got['source'] == 'text' and got['details']['brand'] == 'Sheba' and got['details']['variety'] == 'Selection in Sauce mit Lachs',
          f'bekannte Sorte im Text wiedererkannt ({got.get("details")})')
    await pg.evaluate("window.__ocrText = '12345\\n850 g'")
    got = await ident(photo='AAA')
    check(got['source'] == '' and not got.get('details'), f'ohne brauchbaren Text bleibt alles leer ({got})')

    # Produktsuche im Internet: aus heißt keine Anfrage
    await pg.evaluate("window.__ocrText = ''")
    got = await ident(code='4008429087455')
    check(got['source'] == '' and seen['online'] == 0, f'Produktsuche aus: keine Anfrage ({seen["online"]})')
    await setp(lookup=True)
    got = await ident(code='4008429087455')
    kept = await state(pg, "prefs.codes['4008429087455']")
    hit = got.get('details') or {}
    check(got['source'] == 'online' and [hit.get(k) for k in ('brand', 'variety', 'type', 'animal')] == ['Sheba', 'Fresh Choice Huhn in Sauce', 'Nassfutter', 'Katze']
          and kept['found'] is True, f'Produktsuche an: Marke und Sorte aufbereitet wie auf dem Server ({hit})')
    before = seen['online']
    await ident(code='4008429087455')
    miss = await ident(code='96385074')
    kept = await state(pg, "prefs.codes['96385074']")
    check(seen['online'] == before + 2 and miss['source'] == '' and kept['found'] is False,
          f'Treffer und Fehlanzeige gemerkt: derselbe Code geht nicht noch einmal hinaus ({seen["online"] - before} Anfragen für 2 Codes)')

    # Server: verbunden schlägt er den Code nach und erkennt das Foto
    await setp(server=SRV, code='K7PM-3QXD', lookup=False)
    got = await ident(code='96385074')
    check(got['source'] == 'server' and got['details']['brand'] == 'Felix', f'verbunden: der Server schlägt den Barcode nach ({got.get("details")})')
    got = await ident(photo='AAA')
    check(got['source'] == 'server' and got['details']['variety'] == 'Gold Pastete', f'verbunden: der Server erkennt das Foto ({got.get("details")})')

    # eigener Schlüssel: richtiger Kopf, und er springt ein, wenn der Server nicht kann
    fail['server'] = True
    await setp(aiKey='sk-ant-test')
    got = await ident(photo='AAA')
    check(got['source'] == 'key' and got['details']['brand'] == 'Cosma' and seen['headers'].get('x-api-key') == 'sk-ant-test'
          and seen['headers'].get('anthropic-version') == '2023-06-01' and seen['headers'].get('anthropic-dangerous-direct-browser-access') == 'true'
          and seen['body']['model'] == 'claude-sonnet-5' and 'Tierfutter-Verpackung' in seen['body']['messages'][0]['content'][1]['text'],
          f'eigener Schlüssel: direkter Aufruf mit Kopfzeile und Modell des Servers ({seen["headers"]})')

    # jede Stufe fällt sauber zur nächsten durch, von billig nach teuer
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'")
    await setp(lookup=True)
    kette = []
    fail.update(online=False, server=False, key=False)
    kette.append((await ident(code='4008429087455', photo='AAA'))['source'])   # Produktsuche vor dem Server
    fail['online'] = True
    kette.append((await ident(code='96385074', photo='AAA'))['source'])        # Produktsuche kaputt → Server
    fail['server'] = True
    kette.append((await ident(code='96385074', photo='AAA'))['source'])        # Server kaputt → eigener Schlüssel
    fail['key'] = True
    kette.append((await ident(code='96385074', photo='AAA'))['source'])        # Schlüssel kaputt → Text auf dem Gerät
    await pg.evaluate("window.__ocrText = ''")
    kette.append((await ident(code='96385074', photo='AAA'))['source'])        # nichts geht → leeres Formular
    check(kette == ['online', 'server', 'key', 'text', ''], f'Kette: jede Stufe greift, jede fällt sauber zur nächsten durch ({kette})')
    await pg.evaluate("p => import('./js/store.js').then(m => { m.db.products[0].codes = {'4008429087455': true}; })")
    first = await ident(code='4008429087455', photo='AAA')
    check(first['source'] == 'codes' and len(first['products']) == 1, f'ein bekannter Barcode im Haushalt geht allem vor ({first["source"]})')
    await setp(code='', server='', aiKey='', lookup=False)
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)[:2]}')
    await ctx.close()


async def test_exchange(browser, url):
    print('Austausch von Hand: teilen, empfangen, antworten – zwei Handys ohne Server')

    async def settings(pg):
        if await pg.locator('#sheet [data-action=open-settings]').count() == 0 and await pg.evaluate("document.getElementById('sheet').open"):
            await pg.click('[data-action=close]'); await idle(pg)
        await pg.click('[data-action=open-settings]'); await idle(pg)

    async def datei(pg):                        # die zuletzt geteilte Austausch-Datei aus dem Cache
        return await pg.evaluate("""(() => { const k = Object.keys(localStorage).filter(n => n.includes('austausch')).sort();
          return localStorage.getItem(k[k.length - 1]); })()""")

    async def empfangen(pg, text):              # wie „Austausch empfangen“ mit dieser Datei
        await settings(pg)
        await pg.set_input_files('#exchangeInput', files=[{'name': 'schmeckts-austausch-2026-01-01.json',
                                                           'mimeType': 'application/json', 'buffer': text.encode()}])
        await idle(pg)
        return await pg.inner_text('#serverBox .note')

    async def daten(pg):
        # Daten vergleichbar machen: Schlüssel sortiert, und wie im Protokoll zählt ein leeres Feld wie ein fehlendes
        return await state(pg, """JSON.stringify([db.pets, db.products, db.servings], (k, v) => v === null ? undefined
          : v && typeof v === 'object' && !Array.isArray(v) ? (Object.keys(v).length ? Object.fromEntries(Object.entries(v).sort()) : undefined) : v)""")

    ctx_a, a, err_a = await seeded(browser, url, {'db': SAVED}, native=True)
    ctx_b = await phone(browser)
    b, err_b = await open_page(ctx_b, url, native=True)
    await a.evaluate("import('./js/store.js').then(m => { m.prefs.aiKey = 'sk-ant-geheim'; m.savePrefs(); })")

    # Erstes Teilen: alles, mit den eigenen Uhren, ohne Einstellungen
    await settings(a)
    await a.click('[data-action=share-changes]'); await idle(a)
    text = await datei(a)
    file = json.loads(text)
    shared = ['share' == c[0] for c in await a.evaluate('window.__calls')]
    check(sorted(file) == ['app', 'at', 'clocks', 'device', 'kind', 'protokoll', 'records'] and file['app'] == 'schmeckts'
          and file['kind'] == 'austausch' and len(file['records']) == 5 and len(file['clocks']['servings']) == 3
          and 'sk-ant' not in text and any(shared),
          f'erstes Teilen: alle {len(file["records"])} Datensätze samt Uhren, nichts aus den Einstellungen')
    await shot(a, 'austausch-teilen')

    # Empfangen auf dem leeren Handy B
    note = await empfangen(b, text)
    da, dbb = await daten(a), await daten(b)
    check(note == '5 Änderungen übernommen. Beide Geräte sind gleich.' and dbb == da
          and await b.locator('[data-action=send-answer]').count() == 0,
          f'empfangen: alles übernommen, keine Antwort nötig („{note}“)')
    await shot(b, 'austausch-empfangen')

    # Beide ändern etwas anderes am selben Datensatz, B löscht dazu eine Mahlzeit
    await a.evaluate("import('./js/store.js').then(m => { m.db.products[0].variety = 'Lachs pur'; m.save(); })")
    await b.evaluate("""import('./js/store.js').then(m => { m.db.products[0].kaufen = 'immer';
      m.db.servings = m.db.servings.filter(s => s.id !== 'lxserv0001'); m.save(); })""")
    await idle(a); await idle(b)
    await settings(b)
    await b.click('[data-action=share-changes]'); await idle(b)
    zweite = json.loads(await datei(b))
    note = await empfangen(a, json.dumps(zweite))
    check(len(zweite['records']) == 2 and note == '2 Änderungen übernommen. 1 Änderung fehlt auf dem anderen Gerät.'
          and await a.locator('#serverBox [data-action=send-answer]').count() == 1,
          f'zweites Teilen: nur das Neue, drüben fehlt etwas → Knopf „Antwort senden“ („{note}“)')
    check(await state(a, "db.products[0].kaufen === 'immer' && db.products[0].variety === 'Lachs pur' && db.servings.length === 2"),
          'pro Feld zusammengeführt: beide Änderungen stehen da, die gelöschte Mahlzeit bleibt gelöscht')

    # Antwort schließt die Lücke: danach sind beide gleich
    await a.click('#serverBox [data-action=send-answer]'); await idle(a)
    antwort = json.loads(await datei(a))
    note = await empfangen(b, json.dumps(antwort))
    check(len(antwort['records']) == 1 and note == '1 Änderung übernommen. Beide Geräte sind gleich.'
          and await daten(b) == await daten(a) and await a.locator('[data-action=send-answer]').count() == 0,
          f'Antwort schickt genau das Fehlende, danach sind beide Geräte gleich („{note}“)')

    # Aus einer anderen App geteilt: die App öffnet den Empfangen-Ablauf von selbst
    await b.click('[data-action=close]'); await idle(b)
    await b.evaluate("t => localStorage.setItem('__fs:schmeckts-austausch-geteilt.json', t)", json.dumps(antwort))
    await b.evaluate("window.__urlOpen({url: 'content://media/external/file/schmeckts-austausch-geteilt.json'})")
    await idle(b)
    offen = await b.evaluate("[document.getElementById('sheet').open, document.querySelector('#sheet h2')?.innerText]")
    check(offen == [True, 'Einstellungen'] and 'Beide Geräte sind gleich' in await b.inner_text('#serverBox .note'),
          f'aus einer anderen App geteilt: die Einstellungen öffnen sich mit der Meldung ({offen})')

    # Fremde und beschädigte Dateien
    fremd = [(json.dumps({'app': 'anders', 'kind': 'austausch'}), 'Diese Datei ist kein Schmeckt’s-Austausch.'),
             ('kein json', 'Diese Datei ist kein Schmeckt’s-Austausch.'),
             (json.dumps({'version': 3, 'pets': [], 'products': [], 'servings': []}), 'Das ist ein Backup. Es gehört unter „Daten“ zu „Backup importieren“.'),
             (json.dumps({'app': 'schmeckts', 'kind': 'austausch', 'protokoll': 1, 'device': 'x'}), 'Diese Austausch-Datei ist beschädigt.'),
             (json.dumps({'app': 'schmeckts', 'kind': 'austausch', 'protokoll': 9, 'device': 'x', 'clocks': {}, 'records': []}),
              'Die Datei kommt von einer neueren App. Bitte diese App aktualisieren.')]
    vorher = await daten(b)
    meldungen = []
    for inhalt, want in fremd:
        await settings(b)
        await b.set_input_files('#exchangeInput', files=[{'name': 'fremd.json', 'mimeType': 'application/json', 'buffer': inhalt.encode()}])
        await idle(b)
        meldungen.append((await b.inner_text('#toast')).split('\n')[0])
    check(meldungen == [w for _, w in fremd] and await daten(b) == vorher,
          f'fremde oder beschädigte Dateien: verständliche Meldung, nichts verändert ({meldungen})')
    check(not real_errors(err_a) and not real_errors(err_b), f'keine Fehler in der Konsole {real_errors(err_a)[:2]}{real_errors(err_b)[:2]}')
    await ctx_a.close(); await ctx_b.close()


async def one_pet(browser, url, scheme='light', **kw):
    """Handy im Modus „lokal“ mit dem Tier Minka, geöffnet ist ihr Tier-Sheet"""
    ctx = await phone(browser, scheme, **kw)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]'); await idle(pg)
    await pg.fill('#f-name', 'Minka'); await pg.click('[data-action=save-pet]'); await idle(pg)
    return ctx, pg, errors


async def open_pet(pg, i=0):
    await pg.evaluate(f"import('./js/logic/pets.js').then(async p => p.openPet((await import('./js/store.js')).db.pets[{i}].id))"); await idle(pg)


PIXEL = """([src, pts]) => new Promise(done => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); done({w: img.width, h: img.height, px: pts.map(([fx, fy]) => { const d = x.getImageData(Math.round(fx * (img.width - 1)), Math.round(fy * (img.height - 1)), 1, 1).data;
    return d[0] > 150 && d[1] < 100 ? 'rot' : d[1] > 120 && d[0] < 100 ? 'grün' : d[2] > 150 && d[0] < 100 ? 'blau' : d[0] > 180 && d[1] > 160 ? 'gelb' : [...d].join(); })}); }; img.src = src; })"""


CORNERS = [[.1, .1], [.9, .1], [.1, .9], [.9, .9]]


async def test_crop(browser, url):
    print('Zuschnitt fürs Profilbild')
    make_pictures()
    ctx, pg, errors = await one_pet(browser, url)
    await open_pet(pg)
    await pg.set_input_files('#petPhotoInput', str(PACK.parent / 'felder.png')); await idle(pg)
    crop = lambda: pg.evaluate("import('./js/ui/sheet.js').then(async m => { const c = (await import('./js/ui/crop.js')).cropRect(m.sheet.crop); return [Math.round(c.x), Math.round(c.y), Math.round(c.side), +m.sheet.crop.z.toFixed(2)]; })")
    view = await pg.evaluate("""(() => { const st = document.getElementById('cropStage'), r = st.getBoundingClientRect(), hole = getComputedStyle(st, '::after'), z = document.getElementById('f-zoom');
      return {h2: document.querySelector('#sheet h2').innerText, square: Math.abs(r.width - r.height) < 1, round: hole.borderRadius, shade: hole.boxShadow !== 'none', touch: getComputedStyle(st).touchAction,
        zoom: [z.type, z.min, z.max, z.value], btns: [...document.querySelectorAll('#sheet .btn')].map(b => b.innerText.trim()), img: !!st.querySelector('img')}; })()""")
    check(view == {'h2': 'Foto zuschneiden', 'square': True, 'round': '50%', 'shade': True, 'touch': 'none', 'zoom': ['range', '1', '4', '1'], 'btns': ['Abbrechen', 'Übernehmen'], 'img': True},
          f'nach der Wahl eines Fotos öffnet sich der Zuschnitt: quadratische Ansicht, runder Ausschnitt, Regler, „Abbrechen“ und „Übernehmen“ ({view["btns"]})')
    check(await crop() == [200, 0, 400, 1], f'Start: ganz herausgezoomt, Bildmitte ({await crop()})')
    await shot(pg, 'zuschnitt')
    box = await pg.locator('#cropStage').bounding_box()
    cx, cy, S = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, box['width']
    await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + S / 4, cy, steps=4); await pg.mouse.up()
    check(await crop() == [100, 0, 400, 1], f'mit der Maus um ein Viertel nach rechts gezogen: der Ausschnitt wandert 100 Bildpunkte nach links ({await crop()})')
    await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + S, cy + 50, steps=4); await pg.mouse.up()
    check(await crop() == [0, 0, 400, 1], f'weiter geht es nur bis zum Bildrand ({await crop()})')
    await pg.evaluate("(() => { const z = document.getElementById('f-zoom'); z.value = 2; z.dispatchEvent(new Event('input', {bubbles: true})); })()")
    check(await crop() == [100, 100, 200, 2], f'Regler auf 2: halbe Kantenlänge um die Mitte der Ansicht ({await crop()})')
    TOUCH = """(steps) => { const st = document.getElementById('cropStage'), r = st.getBoundingClientRect();
      for (const [type, id, fx, fy] of steps) st.dispatchEvent(new PointerEvent(type, {pointerId: id, pointerType: 'touch', clientX: r.left + fx * r.width, clientY: r.top + fy * r.height, bubbles: true})); }"""
    await pg.evaluate(TOUCH, [['pointerdown', 11, .5, .5], ['pointermove', 11, .5, .75], ['pointermove', 11, .5, 1], ['pointerup', 11, .5, 1]])
    check(await crop() == [100, 0, 200, 2], f'ein Finger verschiebt: halbe Ansicht nach unten gezogen, der Ausschnitt liegt oben ({await crop()})')
    await pg.evaluate(TOUCH, [['pointerdown', 21, .4, .5], ['pointerdown', 22, .6, .5], ['pointermove', 21, .3, .5], ['pointermove', 22, .7, .5], ['pointerup', 21, .3, .5], ['pointerup', 22, .7, .5]])
    check(await crop() == [150, 50, 100, 4] and await pg.input_value('#f-zoom') == '4', f'zwei Finger zoomen um ihre Mitte, der Regler folgt ({await crop()})')
    await pg.evaluate(TOUCH, [['pointerdown', 31, .4, .5], ['pointerdown', 32, .6, .5], ['pointermove', 31, .45, .5], ['pointermove', 32, .55, .5], ['pointerup', 31, .45, .5], ['pointerup', 32, .55, .5]])
    check(await crop() == [100, 0, 200, 2], f'zusammenschieben zoomt wieder heraus ({await crop()})')
    await pg.click('[data-action=crop-apply]'); await idle(pg)
    got = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step ?? null, m.sheet.photo])")
    res = await pg.evaluate(PIXEL, [got[1], CORNERS])
    check(got[0] is None and got[1].startswith('data:image/jpeg') and res == {'w': 320, 'h': 320, 'px': ['rot'] * 4} and await pg.locator('#sheet .pet-photo img').count() == 1,
          f'„Übernehmen“: quadratisch, 320 px, genau der erwartete Ausschnitt (nur das rote Feld), im Feld photo des Sheets ({res})')
    await pg.click('[data-action=save-pet]'); await idle(pg)
    check(await state(pg, 'db.pets[0].photo') == got[1], 'mit „Speichern“ steht es am Tier')
    await open_pet(pg)
    await pg.set_input_files('#petPhotoInput', str(PACK)); await idle(pg)
    await pg.click('[data-action=crop-cancel]'); await idle(pg)
    back = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step ?? null, m.sheet.photo])")
    check(back == [None, got[1]] and await pg.locator('#f-name').count() == 1, '„Abbrechen“ führt zurück ins Tier-Sheet, das Profilbild bleibt')
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
    await ctx.close()


async def test_album(browser, url):
    print('Album im Tier-Sheet')
    files = make_pictures()
    ctx, pg, errors = await one_pet(browser, url)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('#sheet [data-action=add-pet]'); await idle(pg)
    check(await pg.locator('#sheet .album').count() == 0, 'neues Tier: das Album gibt es erst nach dem Anlegen')
    await pg.click('[data-action=close]'); await idle(pg)
    await open_pet(pg)
    head = await pg.evaluate("[...document.querySelectorAll('#sheet .label')].map(l => l.innerText)")
    check('Fotos' in head and await pg.locator('#sheet label.ph.add[for=albumInput]').count() == 1 and await pg.get_attribute('#albumInput', 'multiple') is not None,
          f'Tier-Sheet mit Abschnitt „Fotos“, Hinzufügen per Mehrfachauswahl aus der Galerie ({head})')
    await pg.evaluate("import('./js/store.js').then(m => { const saved = m.hooks.saved; window.__saves = 0; m.hooks.saved = () => { window.__saves++; saved(); }; })")
    await pg.set_input_files('#albumInput', files[:5]); await idle(pg)
    keys = await state(pg, "Object.keys(db.pets[0].photos).sort()")
    check(await pg.evaluate('window.__saves') == 5, 'jedes Foto wird sofort gespeichert: Endet die App beim Hinzufügen, bleibt, was fertig war')
    t = await pg.inner_text('#toast')
    dims = await pg.evaluate("""import('./js/store.js').then(s => Promise.all(Object.keys(s.db.pets[0].photos).sort().map(k => new Promise(d => { const i = new Image();
      i.onload = () => d([i.width, i.height, s.db.pets[0].photos[k].slice(0, 23)]); i.src = s.db.pets[0].photos[k]; }))))""")
    check(len(keys) == 5 and '5 Fotos hinzugefügt' in t and dims[0] == [960, 480, 'data:image/jpeg;base64,'] and dims[1][:2] == [300, 200],
          f'fünf Fotos hinzugefügt: JPEG als Data-URL, längste Seite höchstens 960 px ({dims[0][:2]}, {dims[1][:2]})')
    await pg.set_input_files('#albumInput', files[5:]); await idle(pg)
    t = await pg.inner_text('#toast')
    check(await state(pg, "Object.keys(db.pets[0].photos).length") == 8 and 'Höchstens 8 Fotos. 3 hinzugefügt.' in t and await pg.locator('#sheet .ph.add').count() == 0
          and 'Fotos (8 von 8)' in await pg.inner_text('#sheet'), f'bis zu 8 Fotos: von fünf weiteren kommen drei dazu, danach gibt es kein Hinzufügen mehr („{t.strip()}“)')
    await shot(pg, 'album')
    keys = await state(pg, "Object.keys(db.pets[0].photos).sort()")
    gone = await state(pg, f"db.pets[0].photos['{keys[2]}']")
    await pg.click(f'#sheet .ph-x[data-key="{keys[2]}"]'); await idle(pg)
    t = await pg.inner_text('#toast')
    check(await state(pg, "Object.keys(db.pets[0].photos).length") == 7 and 'Foto entfernt' in t and await pg.locator('#toast [data-action=undo]').count() == 1
          and await pg.locator('#sheet .ph-img').count() == 7, 'Entfernen über das Kreuz, mit Rückgängig im Toast')
    await pg.click('#toast [data-action=undo]'); await idle(pg)
    check(await state(pg, f"Object.keys(db.pets[0].photos).sort().join() === '{','.join(keys)}' && db.pets[0].photos['{keys[2]}'].length") == len(gone)
          and await pg.locator('#sheet .ph-img').count() == 8, 'Rückgängig: das Foto ist wieder da, an derselben Stelle')
    await pg.reload(); await started(pg)
    check(await state(pg, "Object.keys(db.pets[0].photos).length") == 8, 'das Album übersteht den Neustart')
    # „Als Profilbild“
    await open_pet(pg)
    check(await pg.locator('[data-action=album-profile]').count() == 0, 'ohne gewähltes Foto kein „Als Profilbild“')
    await pg.click(f'#sheet .ph-img[data-key="{keys[0]}"]'); await idle(pg)
    await pg.click('[data-action=album-profile]'); await idle(pg)
    z = await pg.evaluate("import('./js/ui/sheet.js').then(m => [m.sheet.step, m.sheet.crop.w, m.sheet.crop.h])")
    check(z == ['crop', 960, 480], f'„Als Profilbild“ an einem Foto öffnet den Zuschnitt mit diesem Foto ({z})')
    await pg.click('[data-action=crop-apply]'); await idle(pg)
    await pg.click('[data-action=save-pet]'); await idle(pg)
    check(await state(pg, "db.pets[0].photo.startsWith('data:image/jpeg') && Object.keys(db.pets[0].photos).length === 8"), 'übernommen und gespeichert, das Album bleibt unverändert')
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
    await ctx.close()


SET_ALBUMS = """albums => import('./js/store.js').then(async s => { const b64 = async u => { const r = await fetch(u), buf = new Uint8Array(await r.arrayBuffer()); let t = ''; for (const x of buf) t += String.fromCharCode(x);
    return 'data:image/png;base64,' + btoa(t); };
  s.db.pets = []; let n = 0;
  for (const [name, urls] of albums) { const photos = {}; for (const u of urls) photos['foto' + String(n++).padStart(4, '0')] = await b64(u);
    s.db.pets.push({id: 'pet' + name.toLowerCase() + '001', name, species: 'Katze', photo: null, photos, createdAt: 1}); }
  s.prefs.activePet = 'all'; s.save(); s.savePrefs(); (await import('./js/views/home.js')).renderHome(); })"""


MOOD = """() => { const m = document.getElementById('mood'), on = m.querySelector('img.on'), s = getComputedStyle(m), i = on && getComputedStyle(on);
  return {hidden: m.hidden || s.display === 'none', on: on ? on.src.slice(-40) : null, n: m.querySelectorAll('img.on').length, opacity: i && +(+i.opacity).toFixed(2)}; }"""


RGB_OF = """(list => list.map(c => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); }))"""


async def test_mood(browser, url):
    print('Stimmungsbild auf der Startseite')
    make_pictures()
    dist = url.rsplit('/', 1)[0]  # die Testfotos liegen nicht unter www: als Data-URL über eine Route
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme, motion=True)
        await ctx.clock.install()
        async def pictures(route):
            await route.fulfill(path=str(PACK.parent / route.request.url.rsplit('/', 1)[1]), content_type='image/png')
        await ctx.route('**/testfoto/*', pictures)
        pg, errors = await open_page(ctx, url, native=True)
        pic = lambda n: f'{dist}/testfoto/{n}'
        await pg.evaluate(SET_ALBUMS, [['Minka', [pic('felder.png'), pic('schwarz.png')]], ['Tiger', [pic('weiss.png')]], ['Kiwi', []]]); await idle(pg)
        srcs = await state(pg, "db.pets.flatMap(p => Object.keys(p.photos).sort().map(k => p.photos[k].slice(-40)))")
        css = await pg.evaluate("""() => { const m = document.getElementById('mood'), s = getComputedStyle(m), i = getComputedStyle(m.querySelector('img.on')), r = m.getBoundingClientRect(), b = document.querySelector('.brand').getBoundingClientRect();
          return {pos: s.position, box: [r.left, r.top, r.width === document.documentElement.clientWidth, r.height], ptr: s.pointerEvents, mask: (s.maskImage || s.webkitMaskImage).startsWith('linear-gradient') && /rgba\\(0, 0, 0, 0\\)\\)$/.test(s.maskImage || s.webkitMaskImage),
            fit: i.objectFit, opacity: +(+i.opacity).toFixed(2), filter: i.filter, trans: [i.transitionProperty, i.transitionDuration], front: document.elementFromPoint(b.left + 5, b.top + 10).className,
            card: getComputedStyle(document.querySelector('#home .card')).backgroundColor, first: document.body.firstElementChild.id, aria: m.getAttribute('aria-hidden')}; }""")
        want = {'pos': 'absolute', 'box': [0, 0, True, 260], 'ptr': 'none', 'mask': True, 'fit': 'cover', 'opacity': .16 if scheme == 'light' else .26, 'filter': 'saturate(0.85)',
                'trans': ['opacity', '2s'], 'front': 'brand', 'first': 'mood', 'aria': 'true'}
        check({k: css[k] for k in want} == want and 'rgba' not in css['card'], f'Ebene ({scheme}): volle Breite, 260 px, object-fit cover, Deckkraft {want["opacity"]}, saturate(0.85), Maske läuft unten ganz aus, Karten liegen unverändert davor ({css["box"]}, {css["opacity"]})')
        await shot(pg, f'{scheme}-stimmungsbild')
        # Kontrast der Wortmarke: im schlimmsten Fall liegt ein ganz schwarzes oder ganz weißes Foto dahinter
        col = await pg.evaluate(RGB_OF + "([getComputedStyle(document.querySelector('.brand')).color, getComputedStyle(document.body).backgroundColor])")
        worst = min(contrast(col[0], [bg * (1 - css['opacity']) + px * css['opacity'] for bg in col[1]]) for px in (0, 255))
        check(worst >= 4.5, f'Wortmarke ({scheme}): mindestens 4,5:1 auch vor einem ganz schwarzen oder weißen Foto ({worst:.2f}:1)')
        if scheme == 'dark':
            await ctx.close()
            continue
        # Auswahl der Fotos je Filter
        first = await pg.evaluate(MOOD)
        lists = {}
        for who in ('all', 'petminka001', 'pettiger001', 'petkiwi001'):
            await pg.evaluate(f"import('./js/store.js').then(async s => {{ s.prefs.activePet = '{who}'; (await import('./js/views/home.js')).renderHome(); }})"); await idle(pg)
            lists[who] = [await pg.evaluate("import('./js/views/mood.js').then(m => m.moodPhotos().map(p => p.slice(-40)))"), (await pg.evaluate(MOOD))['hidden']]
        check(first['on'] == srcs[0] and first['n'] == 1 and lists == {'all': [srcs, False], 'petminka001': [srcs[:2], False], 'pettiger001': [srcs[2:], False], 'petkiwi001': [[], True]},
              '„Alle“ zeigt die Fotos aller Tiere, ein gewähltes Tier nur seine, ohne Album-Fotos gibt es keine Ebene')
        await pg.evaluate("import('./js/store.js').then(async s => { s.db.pets = s.db.pets.slice(0, 1); s.prefs.activePet = 'all'; s.save(); (await import('./js/views/home.js')).renderHome(); })"); await idle(pg)
        check(await pg.evaluate("import('./js/views/mood.js').then(m => m.moodPhotos().length)") == 2 and await pg.locator('#pets').is_hidden(), 'bei nur einem Tier dessen Fotos')
        # Wechsel alle 12 Sekunden, nur solange die Seite sichtbar ist. Die Uhr steht, nur run_for bewegt sie
        await pg.clock.pause_at(await pg.evaluate('Date.now() + 100'))
        shown = lambda: pg.evaluate("document.querySelector('#mood img.on')?.src.slice(-40)")
        async def later(ms):
            before = await shown()
            await pg.clock.run_for(ms)
            for _ in range(10):  # das nächste Foto wird erst dekodiert, dann getauscht
                if await shown() != before:
                    break
                await asyncio.sleep(.03)
            return await shown()
        a = await shown()
        for _ in range(13):  # der Takt läuft seit dem Start der App: bis kurz nach dem nächsten Wechsel
            b = await later(1000)
            if b != a:
                break
        c, d = await later(10000), await later(2000)
        check(a in srcs and b in srcs and [b != a, c, d] == [True, b, a] and (await pg.evaluate(MOOD))['n'] == 1, 'alle 12 Sekunden wechselt das Foto, dazwischen nicht')
        await pg.evaluate("Object.defineProperty(document, 'hidden', {get: () => true, configurable: true})")
        e = await later(12000)
        await pg.evaluate("delete document.hidden")
        f = await later(12000)
        check([e, f] == [d, b], 'kein Wechsel, solange die Seite nicht sichtbar ist; danach geht es weiter')
        # Auswahl in den Einstellungen: an oder aus, im Stil der anderen Auswahlen
        async def choose(v):
            await pg.click('[data-action=open-settings]'); await idle(pg)
            seg = await pg.eval_on_selector_all('[data-action=backdrop]', "l => [l[0].closest('.seg').previousElementSibling.innerText, l[0].getBoundingClientRect().height >= 40, ...l.map(b => b.innerText + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''))]")
            await pg.click(f'[data-action=backdrop][data-v={v}]'); await idle(pg)
            await pg.click('[data-action=close]'); await pg.clock.run_for(600); await idle(pg)  # die Uhr steht: das Schließen braucht 240 ms
            return seg
        seg = await choose('off')
        off = [await state(pg, 'prefs.backdrop'), (await pg.evaluate(MOOD))['hidden']]
        await pg.reload(); await started(pg)
        off.append((await pg.evaluate(MOOD))['hidden'])
        seg2 = await choose('on')
        on = [await state(pg, 'prefs.backdrop'), (await pg.evaluate(MOOD))['hidden']]
        check(seg == ['Tierfotos im Hintergrund', True, 'An*', 'Aus'] and seg2[2:] == ['An', 'Aus*'] and off == [False, True, True] and on == [True, False],
              f'Einstellungen: „Tierfotos im Hintergrund“ als Auswahl An/Aus, Standard an; aus heißt keine Ebene, auch nach dem Neustart ({seg}, {off}, {on})')
        check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
        await ctx.close()
    old = []
    for v in ('card', 'off'):  # Werte aus 1.1.0
        ctx, pg, errors = await seeded(browser, url, {'db': SAVED, 'prefs': {'mode': 'lokal', 'backdrop': v}})
        old.append(await state(pg, 'prefs.backdrop')); await ctx.close()
    check(old == [True, False], f'Einstellung aus 1.1.0 übernommen: „Übersicht“ wird an, „Aus“ bleibt aus ({old})')
    # reduzierte Bewegung: kein Wechsel
    ctx = await phone(browser, reduced_motion='reduce')
    await ctx.clock.install()
    await ctx.route('**/testfoto/*', pictures)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.evaluate(SET_ALBUMS, [['Minka', [f'{dist}/testfoto/felder.png', f'{dist}/testfoto/schwarz.png']]]); await idle(pg)
    a = await pg.evaluate(MOOD)
    await pg.clock.run_for(25000); await idle(pg)
    b = await pg.evaluate(MOOD)
    check(a['on'] and a == b and a['opacity'] == .16, 'bei reduzierter Bewegung kein Wechsel, das erste Foto bleibt stehen')
    await ctx.close()


async def test_camera(browser, url):
    print('Eigene Kamera (simuliertes Gerät)')
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
          f'Füttern → Foto: Vollbild mit Live-Vorschau, Hinweis oben, großer Auslöser unten in der Mitte, „Abbrechen“ ({cam["shutter"]})')
    check(asked == {'audio': False, 'video': {'facingMode': {'ideal': 'environment'}, 'width': {'ideal': 1920}, 'height': {'ideal': 1080}}}, f'getUserMedia: hintere Kamera, ideal 1920×1080, ohne Ton ({asked["video"]})')
    await shot(pg, 'kamera')
    await pg.evaluate("window.__calls.length = 0")
    await pg.click('#camera .shutter'); await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    after = await pg.evaluate("import('./js/ui/sheet.js').then(m => [document.getElementById('camera').open, m.sheet?.kind, m.sheet?.step, document.querySelectorAll('#camera button').length])")
    s = await state(pg, "(s => [db.servings.length, s.status, (s.photo || '').slice(0, 23), !!s.thumb])(db.servings[0])")
    check(after[:3] == [False, 'serving', 'name'] and s == [1, 'noserver', 'data:image/jpeg;base64,', True] and await pg.evaluate(LIVE) == 0,
          f'Auslösen übernimmt das Bild sofort, ohne Bestätigung: serviert, verkleinert, weiter zum Benennen; die Kamera ist freigegeben ({after}, {s})')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    # Abbrechen, Zurück-Taste, Hintergrund: Kamera sofort frei, das Füttern-Sheet bleibt
    for how, act in (('„Abbrechen“', "document.querySelector('#camera [data-cam=cancel]').click()"), ('Zurück-Taste', 'window.__back({canGoBack: false})'),
                     ('App im Hintergrund', "(() => { Object.defineProperty(document, 'hidden', {get: () => true, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; })()")):
        await pg.click('#fab'); await idle(pg)
        await pg.click('#sheet [data-action=photo]')
        await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0"); await idle(pg)
        was = await pg.evaluate(f"[document.getElementById('camera').open, {LIVE}]")
        await pg.evaluate(act); await idle(pg)
        now = await pg.evaluate(f"import('./js/ui/sheet.js').then(m => [document.getElementById('camera').open, {LIVE}, m.sheet?.kind])")
        check(was == [True, 1] and now == [False, 0, 'feed'] and await state(pg, 'db.servings.length') == 1, f'{how}: Kamera zu und sofort freigegeben, nichts serviert, das Füttern-Sheet bleibt ({now})')
        await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    # nach unbekanntem Barcode und per Deep Link
    await pg.evaluate(f"window.__barcode = '{SHEBA}'")
    await pg.click('#fab'); await idle(pg)
    await pg.click('[data-action=scan]'); await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0"); await idle(pg)
    check((await pg.evaluate(CAM))['hint'] == 'Vorderseite fotografieren', 'nach unbekanntem Barcode: eigene Kamera mit dem Hinweis „Vorderseite fotografieren“')
    await pg.click('#camera .shutter'); await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    check(await state(pg, f"db.servings.length === 2 && db.servings[0].scanCode === '{SHEBA}'") and await pg.evaluate(LIVE) == 0, 'ausgelöst: serviert, der Code steht an der Mahlzeit')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    await pg.evaluate("window.__urlOpen({url: 'schmeckts://foto'})"); await pg.wait_for_function("document.querySelector('#camera video').videoWidth > 0"); await idle(pg)
    check((await pg.evaluate(CAM))['open'], 'Kurzbefehl und schmeckts://foto öffnen die eigene Kamera')
    await pg.click('#camera .shutter'); await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    check(await state(pg, 'db.servings.length') == 3, 'und servieren nach dem Auslösen')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    # Rückfall: Recht verweigert → Kamera-App über das Foto-Plugin
    await pg.evaluate(f"window.__denyCamera = true; window.__calls.length = 0; window.__photo = '{base64.b64encode(PACK.read_bytes()).decode()}'")
    await pg.click('#fab'); await idle(pg)
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_selector('#sheet #f-brand'); await idle(pg)
    calls = await pg.evaluate("window.__calls.filter(c => c[0] === 'aufnehmen').map(c => c[1])")
    check(calls == [None] and not await pg.evaluate("document.getElementById('camera').open") and await state(pg, 'db.servings.length') == 4,
          f'Kamerarecht verweigert: ohne eigene Kamera weiter über die Kamera-App (Foto-Plugin), serviert ({calls})')
    await pg.evaluate("import('./js/ui/sheet.js').then(m => m.closeSheet())"); await idle(pg)
    await pg.evaluate("(() => { window.__photo = null; window.Capacitor.Plugins.Foto.aufnehmen = () => Promise.reject(new Error('Die Kamera ließ sich nicht öffnen.')); })()")
    await pg.click('#fab'); await idle(pg)
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_function("document.querySelector('#toast').innerText.includes('Android-Einstellungen')"); await idle(pg)
    t = await pg.inner_text('#toast')
    check('Android-Einstellungen' in t and await state(pg, 'db.servings.length') == 4, f'lässt auch die Kamera-App sich nicht öffnen (Android sperrt sie bei verweigertem Recht): klarer Hinweis („{t.strip()}“)')
    album = await pg.evaluate("[document.getElementById('petPhotoInput').hasAttribute('capture'), document.getElementById('albumInput').hasAttribute('capture')]")
    check(album == [False, False], 'Tierfotos kommen aus der Galerie')
    check(not real_errors(errors), f'keine Fehler in der Konsole {real_errors(errors)}')
    await ctx.close()


async def test_no_camera(browser, url):
    print('Ohne Kamera: Dateiauswahl im Browser')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    async with pg.expect_file_chooser(timeout=5000) as fc:
        await pg.click('#sheet [data-action=photo]')
    chooser = await fc.value
    check(chooser.element is not None and not await pg.evaluate("document.getElementById('camera').open"), 'gibt es keine Kamera: im Browser die Dateiauswahl')
    await ctx.close()


run_tests({'rundgang': test_tour, 'ablauf': test_flow, 'kaufen': test_kaufen, 'karten': test_cards, 'woche': test_week, 'uebersicht': test_overview, 'skalen': test_scales, 'konsistenz': test_texture, 'meilensteine': test_milestones,
           'erinnerung': test_reminders, 'eigene': test_remind, 'fuettern-erinnern': test_feed_remind, 'tiere': test_petbar, 'modi': test_modes, 'netz': test_network, 'kurzbefehle': test_shortcuts,
           'scannen': test_scan, 'erkennung': test_recognize, 'austausch': test_exchange, 'zuschnitt': test_crop, 'album': test_album, 'stimmung': test_mood, 'kamera': test_camera, 'ohne-kamera': test_no_camera},
          camera=('kamera',))
