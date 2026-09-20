#!/usr/bin/env python3
"""Tests des Abgleichs gegen den echten Go-Server: mehrere Handys (je ein Browser-Kontext) und ein Server mit
eigenem Datenordner auf einem freien Port, dazu ein Schein-Anthropic für die Foto-Erkennung und eine
Schein-Produktdatenbank für die Barcode-Suche (Config barcodeUrls).
Prüft Übernahme und Verbinden, Abgleich in beide Richtungen, Live-Meldungen, Warteschlange ohne Verbindung,
Neustart, abweichende Handy-Uhr, Wiederherstellung (neue Epoche), Prüfsumme, geänderten Code,
Protokollversion, die Erkennung samt automatischer Wiederholung und das Scannen: Suche über den Server,
Foto-Umweg, bekannter Code ohne Verbindung, Codes von zwei Handys, Entfernen, Server ohne Barcode-Suche.
Am Ende müssen alle gleich sein.
Aufruf: python3 tests/sync_test.py   (braucht Go, baut den Server selbst)"""
import asyncio, base64, http.server, json, os, pathlib, shutil, socket, subprocess, sys, tempfile, threading, time, urllib.request
from playwright.async_api import async_playwright
from common import PACK, ROOT, SAVED, check, failures, idle, make_photo, make_pictures, open_page, real_errors, seeded, serve, started, state, until

CODE, NEW_CODE = 'K7PM-3QXD', 'W9ZX-4HJT'
HIT, MISS, C1, C2, OLD = '5901234123457', '4012345000016', '4012345000023', '4012345000030', '4012345000047'  # gültige EAN-13


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class FakeAnthropic:
    """Antwortet wie die Messages-API mit der Packung in reply und zählt die Aufrufe."""
    def __init__(self):
        self.calls, self.reply = 0, {'brand': 'Sheba', 'variety': 'Lachs in Soße', 'type': 'Nassfutter', 'animal': 'Katze'}
        fake = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def send(self, body):
                raw = json.dumps(body).encode()
                self.send_response(200)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):
                self.send({'data': []})

            def do_POST(self):
                self.rfile.read(int(self.headers.get('content-length', 0)))
                fake.calls += 1
                self.send({'content': [{'type': 'text', 'text': json.dumps(fake.reply, ensure_ascii=False)}]})
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.url = f'http://127.0.0.1:{srv.server_port}'


class FakeFoodDB:
    """Antwortet wie Open Pet Food Facts (API v2) und merkt sich die gefragten Codes."""
    def __init__(self):
        self.calls = []
        self.products = {HIT: {'product_name': 'Sheba Fresh Choice Huhn in Sauce 4x50g', 'brands': 'Sheba, Mars',
                               'categories_tags': ['en:pet-food', 'en:cat-food', 'en:wet-cat-food']}}
        fake = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                code = self.path.split('/product/')[-1].split('.json')[0]
                fake.calls.append(code)
                p = fake.products.get(code)
                raw = json.dumps({'status': 1, 'code': code, 'product': p} if p else {'status': 0, 'code': code}).encode()
                self.send_response(200 if p else 404)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.url = f'http://127.0.0.1:{srv.server_port}'


class GoServer:
    """Der echte Server aus server/, mit eigenem Datenordner."""
    def __init__(self, binary, anthropic):
        self.binary, self.dir = binary, pathlib.Path(tempfile.mkdtemp(prefix='schmeckts-test-'))
        self.port = free_port()
        self.url = f'http://127.0.0.1:{self.port}'
        self.env = {**os.environ, 'STATE_DIRECTORY': str(self.dir)}
        self.cfg = {'code': CODE, 'apiKey': 'sk-ant-test', 'anthropicUrl': anthropic.url, 'port': self.port}
        self.write_config()

    def write_config(self):
        (self.dir / 'config.json').write_text(json.dumps(self.cfg))

    def start(self):
        self.proc = subprocess.Popen([self.binary], env=self.env, stdout=open(self.dir / 'server.log', 'a'), stderr=subprocess.STDOUT)
        for _ in range(100):
            try:
                urllib.request.urlopen(self.url + '/api/info', timeout=1)
                return
            except Exception:
                time.sleep(0.05)
        raise RuntimeError('Server startet nicht:\n' + (self.dir / 'server.log').read_text())

    def stop(self):
        self.proc.terminate()
        self.proc.wait(10)

    def get(self, path):
        req = urllib.request.Request(self.url + path, headers={'Authorization': 'Bearer ' + self.cfg['code']})
        return json.load(urllib.request.urlopen(req, timeout=10))

    def records(self):
        """Sichtbare Datensätze wie in der App: {sammlung: {id: {feld: wert}}}, ohne _del und null."""
        out = {'pets': {}, 'products': {}, 'servings': {}}
        for x in self.get('/api/changes?since=0')['records']:
            if x['f'].get('_del', {}).get('v') is True:
                continue
            out[x['c']][x['r']] = {k: f['v'] for k, f in x['f'].items() if k != '_del' and f['v'] is not None}
        return out

    def restore(self, backup):
        """Wiederherstellen wie auf dem Mini-PC. Der Befehl verlangt root, sonst hier nachgebildet."""
        if os.geteuid() == 0:
            subprocess.run([self.binary, 'wiederherstellen', str(backup)], env=self.env, check=True, capture_output=True)
        else:
            st = json.loads(pathlib.Path(backup).read_text())
            st['epoch'] = 'nachgebildet' + str(int(time.time()))
            (self.dir / 'state.json').write_text(json.dumps(st))


PROJECTION = """Promise.all([import('./js/fields.js'), import('./js/store.js')]).then(([f, {db}]) => {
  const out = {};
  for (const c of f.COLLECTIONS) { out[c] = {};
    for (const r of db[c]) out[c][r.id] = Object.fromEntries(Object.entries(f.fieldsOf(c, r)).map(([k, j]) => [k, JSON.parse(j)])); }
  return out; })"""


async def run(pg, body):
    """Führt JS mit den Exporten von store.js aus (db, save, queue, …), wie es die Logik-Module tun."""
    return await pg.evaluate(f"import('./js/store.js').then(async m => {{ const {{db, prefs, save}} = m; {body} }})")


async def until_sync(pg, expr, timeout=10.0):
    """Wartet, bis expr mit dem Sync-Status (status) wahr ist."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if await pg.evaluate(f"import('./js/sync.js').then(({{status}}) => {expr})"):
            return True
        await asyncio.sleep(.1)
    return False


async def until_dom(pg, expr, timeout=10.0):
    """Wartet, bis expr im Dokument wahr ist: eine offene Ansicht zeichnet nach einem Abgleich erst neu."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if await pg.evaluate(expr):
            return True
        await asyncio.sleep(.1)
    return False


PHONES = {}  # Name → (Seite, Konsolenfehler), für die Diagnose bei Fehlschlägen


async def expect(cond, text):
    """Wie check, gibt bei einem Fehlschlag Status, Warteschlange und Konsole aller Handys aus."""
    if check(cond, text):
        return True
    for name, (pg, errs) in PHONES.items():
        try:
            info = await pg.evaluate("""Promise.all([import('./js/sync.js'), import('./js/store.js')]).then(([s, m]) =>
              JSON.stringify({status: s.status, queue: m.queue.length, first: m.queue.slice(0, 2).map(q => [q.c, q.r, Object.keys(q.f).join(), q.t]),
                epoch: m.state.epoch, seq: m.state.seq, log: m.state.log.slice(-4).map(l => l.text)}))""")
        except Exception as e:
            info = f'nicht abfragbar: {e}'
        print(f'      {name}: {info}')
        print(f'      {name} Konsole: {real_errors(errs)[-5:]}')
    return False


async def sync_status(pg):
    return await pg.evaluate("import('./js/sync.js').then(m => ({...m.status}))")


async def connect(pg, code, server, edit=True):
    if not await pg.locator('#serverBox').count():
        await pg.click('[data-action=open-settings]')
        await idle(pg)
    if await pg.locator('#serverBox [data-action=connect-form]').count():  # Modus „lokal“: der Knopf öffnet Adresse und Code
        await pg.click('#serverBox [data-action=connect-form]')
        await idle(pg)
    if edit:
        if await pg.locator('[data-action=edit-server]').count():
            await pg.click('[data-action=edit-server]')
            await idle(pg)
        await pg.fill('#f-server', server)
    await pg.fill('#f-code', code)
    # Zeichnet der Kasten zwischen Tippen und Verbinden neu, stehen die Felder wieder leer und connectServer()
    # nähme das leere prefs.server. Darum vor dem Klick nachsehen und notfalls noch einmal eintragen.
    await idle(pg)
    if edit and await pg.input_value('#f-server') != server:
        await pg.fill('#f-server', server)
    if await pg.input_value('#f-code') != code:
        await pg.fill('#f-code', code)
    await pg.click('[data-action=connect]')


async def close_sheet(pg):
    if await pg.evaluate("document.getElementById('sheet').open"):
        await pg.click('#sheet [data-action=close]')
        await idle(pg)


async def main():
    make_photo()
    go = shutil.which('go') or '/usr/local/go/bin/go'
    binary = os.path.join(tempfile.mkdtemp(), 'schmeckts-server')
    subprocess.run([go, 'build', '-o', binary, '.'], cwd=ROOT / 'server', check=True)
    fake, food = FakeAnthropic(), FakeFoodDB()
    srv = GoServer(binary, fake)
    srv.cfg['barcodeUrls'] = [food.url]
    srv.write_config()
    srv.start()
    url = serve()
    blocked = set()

    async def block(ctx):  # Server für dieses Handy nicht erreichbar (wie ohne WLAN)
        async def abort(route):
            await route.abort()
        await ctx.route(f'{srv.url}/**', abort)
        blocked.add(ctx)

    async def unblock(ctx, pg):
        await ctx.unroute(f'{srv.url}/**')
        blocked.discard(ctx)
        await pg.evaluate("dispatchEvent(new Event('online'))")

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        new_phone = lambda: browser.new_context(viewport={'width': 400, 'height': 860})
        try:
            # Handy A wird schon benutzt (Daten ohne Uhren) und verbindet sich
            print('Verbinden')
            ctx_a, a, err_a = await seeded(browser, url, {'db': SAVED, 'prefs': {'mode': 'lokal'}}, native=True)
            PHONES['A'] = (a, err_a)
            await expect(await state(a, 'db.servings.length') == 3, 'Handy A: Daten auf dem Gerät')
            await connect(a, 'XXXX-YYYY', srv.url)
            await idle(a)
            await expect('stimmt nicht' in await a.inner_text('#serverBox') and await state(a, "prefs.code") == '',
                  'falscher Code: klare Meldung, nicht verbunden')
            await connect(a, 'k7pm 3qxd', srv.url, edit=False)
            await expect(await until(a, "prefs.code === 'K7PM-3QXD' && state.epoch !== '' && queue.length === 0"),
                  'richtiger Code (klein, mit Leerzeichen): verbunden, alles gesendet')
            rec = srv.records()
            await expect(len(rec['servings']) == 3 and rec['pets'].get('lxpet00001', {}).get('name') == 'Minka',
                  'die übernommenen Daten liegen auf dem Server')
            await expect(all('photo' not in r and 'status' not in r for r in rec['servings'].values()), 'lokale Felder bleiben auf dem Handy')
            await expect(await until_sync(a, "status.state === 'ok' && !status.busy") and 'Alles abgeglichen' in await a.inner_text('#serverBox'),
                  'Status: Alles abgeglichen')
            backup = srv.dir / 'backup-test.json'
            shutil.copy(srv.dir / 'state.json', backup)  # für die Wiederherstellung weiter unten

            # Handy B: Beispieldaten, dann verbinden
            ctx_b = await new_phone()
            b, err_b = await open_page(ctx_b, url)
            PHONES['B'] = (b, err_b)
            await b.click('[data-action=demo]')
            await idle(b)
            await connect(b, CODE, srv.url)
            await expect(await until(b, "state.epoch !== '' && db.pets.some(p => p.id === 'lxpet00001')"),
                  'Handy B verbunden und sieht die Daten des Haushalts')
            await expect(await state(b, "!db.pets.concat(db.products, db.servings).some(r => r.id.startsWith('demo'))"),
                  'Beispieldaten beim Verbinden entfernt')
            await expect(not any(i.startswith('demo') for c in srv.records().values() for i in c), 'Beispieldaten nicht im Haushalt')
            await expect(await b.locator('#sheet [data-action=demo]').count() == 0, 'mit Server kein „Beispieldaten laden“')

            # Live-Meldungen und gleichzeitige Bewertungen
            print('Abgleich')
            await close_sheet(a)
            await close_sheet(b)
            await run(b, "db.pets.push({id: 'tigerpet0001', name: 'Tiger', species: 'Katze', photo: null, createdAt: Date.now()}); save();")
            await expect(await until(a, "db.pets.some(p => p.name === 'Tiger')", 6), 'Live: neues Tier erscheint ohne Neuladen auf dem anderen Handy')
            await expect((await sync_status(a))['live'], 'Live-Verbindung steht')
            await run(a, """db.servings.unshift({id: 'zweipets0001', productId: 'lxprod0001', servedAt: Date.now(),
              pets: {lxpet00001: {r: null, at: null}, tigerpet0001: {r: null, at: null}}, note: ''}); save();""")
            await expect(await until(b, "db.servings.some(s => s.id === 'zweipets0001')", 6), 'Mahlzeit für zwei Tiere kommt an')
            # Erinnerung zum Bewerten auf Handy A (Plugin simuliert): abgesagt wird erst, wenn auch das andere Handy bewertet hat
            reminders = lambda: a.evaluate("window.Capacitor.Plugins.LocalNotifications.getPending().then(r => r.notifications.map(n => n.extra.serving).sort())")

            async def planned(want, timeout=5.0):
                end = time.monotonic() + timeout
                while await reminders() != want and time.monotonic() < end:
                    await asyncio.sleep(.1)
                return await reminders() == want
            await a.evaluate("""import('./js/store.js').then(async s => { s.prefs.remind = 60; const r = await import('./js/logic/reminders.js');
              s.db.servings.unshift({id: 'wirdgeloescht', productId: 'lxprod0001', servedAt: Date.now(), pets: {lxpet00001: {r: null, at: null}}, note: ''}); s.save();
              for (const id of ['zweipets0001', 'wirdgeloescht']) r.planReminder(s.db.servings.find(x => x.id === id)); })""")
            await expect(await until(b, "db.servings.some(s => s.id === 'wirdgeloescht')", 6) and await reminders() == ['wirdgeloescht', 'zweipets0001'], 'Erinnerungen auf Handy A geplant')
            await block(ctx_b)
            await run(a, "const s = db.servings.find(s => s.id === 'zweipets0001'); s.pets.lxpet00001 = {r: 'gut', at: Date.now()}; save();")
            await run(b, "const s = db.servings.find(s => s.id === 'zweipets0001'); s.pets.tigerpet0001 = {r: 'schlecht', at: Date.now()}; save();")
            await until(a, 'queue.length === 0')
            half = await reminders()
            await unblock(ctx_b, b)
            both = "(s => s && s.pets.lxpet00001.r === 'gut' && s.pets.tigerpet0001.r === 'schlecht')(db.servings.find(s => s.id === 'zweipets0001'))"
            await expect(await until(a, both, 8) and await until(b, both, 8), 'gleichzeitig bewertet, verschiedene Tiere: beide Bewertungen bleiben')
            await expect('zweipets0001' in half and await planned(['wirdgeloescht']), 'Erinnerung: nach der eigenen Bewertung noch geplant, abgesagt, sobald das andere Handy den Rest bewertet hat')
            await run(b, "db.servings = db.servings.filter(s => s.id !== 'wirdgeloescht'); save();")
            await expect(await until(a, "!db.servings.some(s => s.id === 'wirdgeloescht')", 8), 'auf dem anderen Handy gelöschte Mahlzeit verschwindet')
            await expect(await planned([]), 'Erinnerung: abgesagt, wenn ein anderes Handy die Mahlzeit löscht')
            await a.evaluate("import('./js/store.js').then(s => { s.prefs.remind = 0; })")

            # Warteschlange ohne Verbindung, übersteht einen Neustart
            await block(ctx_a)
            await run(a, "db.pets.push({id: 'lunapet00001', name: 'Luna', species: 'Hund', photo: null, createdAt: Date.now()}); save();")
            await a.wait_for_function("/warte/.test(document.getElementById('syncChip').innerText)")
            chip = await a.inner_text('#syncChip')
            await expect('wartet' in chip or 'warten' in chip, f'ohne Verbindung: Hinweis oben ({chip.strip()})')
            await a.reload()
            await started(a)
            await expect(await state(a, "queue.length") > 0 and await state(a, "db.pets.some(p => p.name === 'Luna')"),
                  'App-Neustart ohne Verbindung: Warteschlange und Daten bleiben')
            await unblock(ctx_a, a)
            await expect(await until(a, 'queue.length === 0') and await until(b, "db.pets.some(p => p.name === 'Luna')", 6),
                  'wieder verbunden: Warteschlange gesendet, anderes Handy hat es')
            await expect(await a.locator('#syncChip').is_hidden(), 'danach kein Hinweis mehr oben')

            # Server aus, Handy aus
            srv.stop()
            await run(b, "db.pets.find(p => p.name === 'Tiger').name = 'Tiger II'; save();")
            await expect(await until_sync(b, "status.state === 'offline'", 15), 'Server aus: Status offline')
            await b.close()  # Handy B aus
            del PHONES['B']
            srv.start()
            await run(a, "db.pets.find(p => p.name === 'Luna').species = 'Katze'; save();")
            await a.evaluate("dispatchEvent(new Event('online'))")
            await expect(await until(a, 'queue.length === 0', 10), 'Server wieder an: Handy A gleicht ab')
            b, err_b2 = await open_page(ctx_b, url)
            err_b += err_b2
            PHONES['B'] = (b, err_b2)
            await expect(await until(b, "db.pets.some(p => p.name === 'Luna' && p.species === 'Katze') && !db.pets.some(p => p.name === 'Tiger')", 8),
                  'Handy B startet wieder: sendet Wartendes und holt Neues nach')
            await expect(await until(a, "db.pets.some(p => p.name === 'Tiger II')", 8), 'Änderung von B kommt bei A an')

            # Löschen und Rückgängig, viele Änderungen
            await run(a, "window.__s = JSON.parse(JSON.stringify(db.servings.find(s => s.id === 'zweipets0001'))); "
                         "db.servings.splice(db.servings.findIndex(s => s.id === 'zweipets0001'), 1); save();")
            await expect(await until(b, "!db.servings.some(s => s.id === 'zweipets0001')", 6), 'Löschung kommt an')
            await run(a, "db.servings.unshift(window.__s); save();")
            await expect(await until(b, "(s => s && s.pets.tigerpet0001.r === 'schlecht')(db.servings.find(s => s.id === 'zweipets0001'))", 6),
                  'Rückgängig kommt an, samt Bewertungen')
            await run(a, """for (let i = 0; i < 620; i++) db.servings.push({id: 'massen' + String(i).padStart(4, '0'),
              productId: 'lxprod0001', servedAt: 1700000000000 + i, pets: {lxpet00001: {r: 'mittel', at: null}}, note: ''}); save();""")
            await expect(await until(a, 'queue.length === 0', 15) and len(srv.records()['servings']) >= 620, '620 Änderungen in mehreren Paketen')
            await run(a, "m.replaceDb({...db, servings: db.servings.filter(s => !s.id.startsWith('massen'))}); save();")
            await expect(await until(b, "!db.servings.some(s => s.id.startsWith('massen')) && db.servings.length > 3", 10), 'und wieder gelöscht')

            # Foto-Erkennung über den Server
            print('Erkennung')
            await a.click('#fab')
            await idle(a)
            await a.set_input_files('#camInputSheet', str(PACK))
            await expect(await until(a, "db.products.some(p => p.variety === 'Lachs in Soße')", 10) and fake.calls == 1,
                  'Foto erkannt über den Server')
            await expect(await until(b, "db.products.some(p => p.variety === 'Lachs in Soße') && db.servings[0].productId", 6),
                  'erkanntes Futter kommt beim anderen Handy an')
            soup = "db.products.some(p => p.variety === 'Lachs in Soße' && p.texture === 'sosse')"
            await expect(await state(a, soup) and await until(b, soup, 6) and any(r.get('texture') == 'sosse' for r in srv.records()['products'].values()),
                  'Konsistenz nach der Erkennung aus den Stichwörtern, abgeglichen wie jedes Feld')
            await expect(await state(b, "!db.servings[0].photo && !!(db.products.find(p => p.id === db.servings[0].productId) || {}).thumb"),
                         'geteilt wird nur das Vorschaubild (am Futter), nicht das Foto')
            await block(ctx_a)
            fake.reply = {'brand': 'Felix', 'variety': 'So gut wie es aussieht', 'type': 'Nassfutter', 'animal': 'Katze'}
            await a.click('#fab')
            await idle(a)
            await a.set_input_files('#camInputSheet', str(PACK))
            await expect(await until(a, "db.servings[0].status === 'waiting'", 6), 'Server nicht erreichbar: Foto wartet')
            await unblock(ctx_a, a)
            await expect(await until(a, "db.products.some(p => p.brand === 'Felix') && !db.servings[0].status", 10) and fake.calls == 2,
                  'Server wieder da: automatisch erkannt')

            # Scannen: Suche über den Server, Foto-Umweg, bekannter Code offline, zwei Handys
            print('Scannen')
            photo = json.dumps(base64.b64encode(PACK.read_bytes()).decode())
            await close_sheet(a)
            await a.evaluate(f"window.__barcode = '{HIT}'")
            await a.click('#fab')
            await idle(a)
            await a.click('[data-action=scan]')
            hit = f"db.products.find(p => p.codes && p.codes['{HIT}'])"
            ok = await until(a, f"(p => p && p.brand === 'Sheba' && p.variety === 'Fresh Choice Huhn in Sauce' && p.type === 'Nassfutter' && p.animal === 'Katze'"
                                f" && db.servings[0].productId === p.id)({hit})", 10)
            await expect(ok and food.calls == [HIT], 'unbekannter Code: Server findet ihn in der Produktdatenbank, Sorte angelegt, Code angehängt, serviert')
            await expect(await until(b, f"!!{hit}", 6), 'die Sorte samt Code kommt beim anderen Handy an')
            rec = srv.records()
            await expect(any(r.get('codes.' + HIT) is True for r in rec['products'].values()) and not any('scanCode' in r for r in rec['servings'].values()),
                         'Server: Code als Feld codes.<EAN> an der Sorte, scanCode bleibt auf dem Handy')
            fake.reply = {'brand': 'Animonda', 'variety': 'Carny Rind', 'type': 'Nassfutter', 'animal': 'Katze'}
            await a.evaluate(f"window.__barcode = '{MISS}'; window.__photo = {photo}")
            await a.click('#fab')
            await idle(a)
            await a.click('[data-action=scan]')
            ok = await until(a, f"db.products.some(p => p.brand === 'Animonda' && p.codes && p.codes['{MISS}'])", 12)
            asked = ['aufnehmen', {'hinweis': 'Vorderseite fotografieren'}] in await a.evaluate('window.__calls')
            await expect(ok and asked and MISS in food.calls, 'kein Treffer: Kamera für die Vorderseite, Foto erkannt, Code an der erkannten Sorte')
            await expect(await until(b, f"db.products.some(p => p.brand === 'Animonda' && p.codes && p.codes['{MISS}'])", 6), 'auch beim anderen Handy')
            await block(ctx_a)
            await a.evaluate(f"window.__barcode = '{HIT}'")
            n = await state(a, 'db.servings.length')
            await a.click('#fab')
            await idle(a)
            await a.click('[data-action=scan]')
            await idle(a)
            await expect(await state(a, f"db.servings.length === {n + 1} && db.servings[0].productId === {hit}.id")
                         and food.calls.count(HIT) == 1, 'bekannter Code ohne Verbindung: sofort serviert, ohne Anfrage')
            await run(a, f"db.products.find(p => p.codes && p.codes['{HIT}']).codes['{C1}'] = true; save();")
            await run(b, f"db.products.find(p => p.codes && p.codes['{HIT}']).codes['{C2}'] = true; save();")
            await idle(b)
            await unblock(ctx_a, a)
            both = f"(p => p.codes['{C1}'] && p.codes['{C2}'] && p.codes['{HIT}'])({hit})"
            await expect(await until(a, both, 8) and await until(b, both, 8), 'zwei Handys hängen gleichzeitig Codes an dieselbe Sorte: beide bleiben')
            pid = await state(a, f"{hit}.id")
            await a.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))")
            await idle(a)
            await a.click(f'#sheet [data-action=remove-code][data-code="{C1}"]')
            gone = f"(p => !p.codes['{C1}'] && p.codes['{C2}'] && p.codes['{HIT}'])(db.products.find(p => p.id === '{pid}'))"
            await expect(await until(b, gone, 6) and 'codes.' + C1 not in srv.records()['products'][pid], 'Code entfernt: überall weg, die anderen bleiben')
            # Eigene Einstellung „Kaufen“ wird wie jedes Feld abgeglichen, auch zurück auf „Automatisch“
            kauf = lambda v: "(p => p && %s)(db.products.find(p => p.id === '%s'))" % ("!('kaufen' in p)" if v is None else f"p.kaufen === '{v}'", pid)
            await a.click('#sheet [data-action=kaufen][data-v=immer]')
            await expect(await until(b, kauf('immer'), 6) and srv.records()['products'][pid].get('kaufen') == 'immer', 'Kaufen „Immer“ von A kommt bei B und auf dem Server an')
            await b.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))"); await idle(b)
            await b.click('#sheet [data-action=kaufen][data-v=nicht]')
            await expect(await until(a, kauf('nicht'), 6) and await until(a, "document.querySelector('#sheet [data-action=kaufen][data-v=nicht]')?.getAttribute('aria-pressed') === 'true'", 4),
                         'Kaufen „Nicht“ von B kommt bei A an, das offene Futter-Sheet zeigt es')
            await close_sheet(b)
            await a.click('#sheet [data-action=kaufen][data-v=auto]')
            await expect(await until(b, kauf(None), 6) and srv.records()['products'][pid].get('kaufen') is None, 'zurück auf „Automatisch“: das Feld ist überall weg')
            # Konsistenz: Auswahl und Aufheben kommen überall an; ein Wert des Servers geht den Stichwörtern vor
            tex = lambda v, name: "(p => !!p && %s)(db.products.find(p => %s))" % ("!('texture' in p)" if v is None else f"p.texture === '{v}'", name)
            await a.click('#sheet [data-action=set-texture][data-v=mousse]')
            await expect(await until(b, tex('mousse', f"p.id === '{pid}'"), 6) and srv.records()['products'][pid].get('texture') == 'mousse', 'Konsistenz von A kommt bei B und auf dem Server an')
            await a.click('#sheet [data-action=set-texture][data-v=mousse]')
            await expect(await until(b, tex(None, f"p.id === '{pid}'"), 6) and srv.records()['products'][pid].get('texture') is None, 'ein zweiter Tipp hebt sie auf: das Feld ist überall weg')
            await close_sheet(a)

            async def newer_server(route):
                await route.fulfill(json={'brand': 'Miamor', 'variety': 'Huhn in Soße', 'type': 'Nassfutter', 'animal': 'Katze', 'texture': 'gelee', 'now': int(time.time() * 1000)})
            await a.route('**/api/recognize', newer_server)
            await a.click('#fab')
            await idle(a)
            await a.set_input_files('#camInputSheet', str(PACK))
            await expect(await until(a, tex('gelee', "p.brand === 'Miamor'"), 10) and await until(b, tex('gelee', "p.brand === 'Miamor'"), 6),
                         'liefert der Server texture, geht der Wert den Stichwörtern vor')
            await a.unroute('**/api/recognize')
            # Stufen der anderen Skalen gehen wie jede Bewertung durch den Server
            sid = await state(a, 'db.servings[0].id')
            await run(a, "const s = db.servings[0]; s.pets[Object.keys(s.pets)[0]] = {r: 'verputzt', at: Date.now()}; save();")
            await expect(await until(b, f"Object.values(db.servings.find(s => s.id === '{sid}').pets).some(x => x.r === 'verputzt')", 6)
                         and any(k.startswith('pets.') and v.get('r') == 'verputzt' for k, v in srv.records()['servings'][sid].items() if isinstance(v, dict)),
                         'eine Stufe der Snack-Skala kommt beim anderen Handy und auf dem Server an')
            # Server ohne Barcode-Suche (wie 1.0.0: kein „barcode“ in features): gleich die Kamera, keine Anfrage
            ctx_e = await new_phone()
            asked_e = []

            async def old_info(route):
                if route.request.method != 'GET':
                    await route.continue_()
                    return
                res = await route.fetch()
                body = await res.json()
                body.pop('features', None)
                await route.fulfill(response=res, json=body)
            await ctx_e.route(f'{srv.url}/api/info*', old_info)
            ctx_e.on('request', lambda r: asked_e.append(r.url) if '/api/barcode/' in r.url else None)
            e, err_e = await open_page(ctx_e, url, native=True)
            await connect(e, CODE, srv.url)
            await until(e, 'db.pets.length > 0 && queue.length === 0', 10)
            await close_sheet(e)
            await e.evaluate(f"window.__barcode = '{OLD}'")
            await e.click('#fab')
            await idle(e)
            await e.click('[data-action=scan]')
            await idle(e)
            asked = ['aufnehmen', {'hinweis': 'Vorderseite fotografieren'}] in await e.evaluate('window.__calls')
            await expect(asked and not asked_e and OLD not in food.calls and await e.locator('#sheet [data-action=scan]').count() == 1,
                         'Server ohne Barcode-Suche: keine Anfrage, gleich die Kamera; abgebrochen zurück im Füttern-Sheet')
            await expect(not real_errors(err_e), 'Handy ohne Barcode-Suche: keine Fehler in der Konsole' + (f': {real_errors(err_e)}' if real_errors(err_e) else ''))
            await ctx_e.close()

            # Album am Tier, pro Foto abgeglichen
            print('Album')
            files = make_pictures()
            ALBUM = "Object.keys(db.pets.find(p => p.id === 'lxpet00001').photos || {}).sort()"
            for pg in (a, b):
                await close_sheet(pg)
                await pg.evaluate("import('./js/logic/pets.js').then(p => p.openPet('lxpet00001'))")
                await idle(pg)
            await a.set_input_files('#albumInput', files[:2])
            await expect(await until(b, f"{ALBUM}.length === 2"), 'Handy A fügt zwei Fotos hinzu, Handy B bekommt sie')
            keys = await state(a, ALBUM)
            rec = srv.records()['pets']['lxpet00001']
            pa, pb = [await state(pg, "JSON.stringify(db.pets.find(p => p.id === 'lxpet00001').photos)") for pg in (a, b)]
            await expect(pa == pb and sorted(k for k in rec if k.startswith('photos.')) == [f'photos.{k}' for k in keys] and rec[f'photos.{keys[0]}'].startswith('data:image/jpeg;base64,')
                         and 'photos' not in rec, f'auf dem Server liegt jedes Foto als eigenes Feld photos.<id>, beide Handys haben dieselben Bilder ({len(rec["photos." + keys[0]]) // 1024} KB)')
            await idle(b)
            await expect(await until_dom(b, "document.querySelectorAll('#sheet .ph-img').length === 2"),
                         'im offenen Tier-Sheet von Handy B erscheinen die Fotos')
            await block(ctx_a)
            await block(ctx_b)
            await a.set_input_files('#albumInput', files[2:3])          # A fügt eins hinzu …
            await b.click(f'#sheet .ph-x[data-key="{keys[0]}"]')       # … während B eins entfernt, beide ohne Verbindung
            await idle(a)
            await unblock(ctx_a, a)
            await unblock(ctx_b, b)
            await expect(await until(a, f"{ALBUM}.length === 2 && !{ALBUM}.includes('{keys[0]}')") and await until(b, f"{ALBUM}.length === 2 && {ALBUM}.includes('{keys[1]}')")
                         and await state(a, ALBUM) == await state(b, ALBUM), 'gleichzeitig hinzugefügt und entfernt: Beides bleibt erhalten, weil pro Foto abgeglichen wird')
            for pg in (a, b):
                await close_sheet(pg)

            # Verbinden von der Willkommensseite, Server-Kasten, Trennen
            print('Modi und Server-Kasten')
            ctx_f = await new_phone()
            f, err_f = await open_page(ctx_f, url, native=True, choose=False)
            PHONES['F'] = (f, err_f)
            await f.click('.welcome [data-action=connect-form]')
            await idle(f)
            await f.fill('#f-server', srv.url.replace('http://', ''))
            await f.fill('#f-code', CODE)
            await f.click('[data-action=connect]')
            await expect(await until(f, "prefs.mode === 'haushalt' && state.epoch !== '' && db.pets.some(p => p.id === 'lxpet00001')")
                         and await state(f, 'prefs.server') == srv.url, 'erster Start, „Mit Haushalt verbinden“: Adresse (auch ohne http://) und Code, Modus „haushalt“, Daten da')
            await until_sync(f, "status.state === 'ok' && !status.busy")
            await idle(f)
            await f.evaluate("""() => { window.__mut = 0; new MutationObserver(l => window.__mut += l.length)
              .observe(document.getElementById('serverBox'), {childList: true, subtree: true, characterData: true, attributes: true}); }""")

            async def slow(route):
                await asyncio.sleep(1.5)
                await route.continue_()
            await ctx_f.route(f'{srv.url}/api/info*', slow)
            await f.evaluate("import('./js/sync.js').then(m => { m.retrySync(); })")
            await until_sync(f, 'status.busy')
            await until_sync(f, '!status.busy')
            await expect(await f.evaluate('window.__mut') == 0, 'Abgleich im Hintergrund, auch ein langsamer: der Server-Kasten bleibt, wie er ist')
            await expect(await f.locator('#serverBox [data-action=sync-now]').count() == 0 and 'Alles abgeglichen' in await f.inner_text('#serverBox'),
                         'alles abgeglichen: kein Knopf „Jetzt abgleichen“, es gibt nichts zu tun')
            await block(ctx_f)
            await run(f, "db.servings[0].note = 'wartet'; save();")
            await f.wait_for_selector('#serverBox [data-action=sync-now]')
            await ctx_f.unroute(f'{srv.url}/**')  # wieder erreichbar, aber ohne Meldung: abgeglichen wird erst von Hand
            blocked.discard(ctx_f)
            await f.click('#serverBox [data-action=sync-now]')
            early = await f.locator('#serverBox .spin').count()
            await f.wait_for_selector('#serverBox .spin')
            late = await f.inner_text('#serverBox')
            await until_sync(f, '!status.busy')
            await f.wait_for_selector('#serverBox .spin', state='detached')
            await expect(early == 0 and 'Abgleich läuft' in late and await until(f, 'queue.length === 0', 6) and await f.locator('#serverBox [data-action=sync-now]').count() == 0,
                         'wartet eine Änderung, gibt es „Jetzt abgleichen“: Fortschritt nur beim Abgleich von Hand und nicht sofort, danach ist der Knopf wieder weg')
            await ctx_f.unroute(f'{srv.url}/api/info*')
            n = await state(f, 'db.servings.length')
            await f.click('#serverBox [data-then=disconnect]')
            await idle(f)
            await f.click('#serverBox [data-then=disconnect]')
            await idle(f)
            box = await f.eval_on_selector_all('#serverBox .btn', "l => l.map(b => b.innerText.trim())")
            await expect(await state(f, f"prefs.mode === 'lokal' && prefs.code === '' && db.servings.length === {n} && db.pets.length > 0") and box == ['Änderungen teilen', 'Austausch empfangen', 'Mit Haushalt verbinden']
                         and 'Alle Daten bleiben auf diesem Gerät' in await f.inner_text('#sheet .foot'), '„Verbindung trennen“ wechselt zu „lokal“, die Daten bleiben, im Abschnitt „Haushalt“ nur noch der Verbinden-Knopf')
            await f.click('#serverBox [data-action=connect-form]')
            await idle(f)
            await expect(await f.input_value('#f-server') == srv.url, 'erneut verbinden: die zuletzt genutzte Adresse steht im Feld')
            await expect(not real_errors(err_f), 'Handy F: keine Fehler in der Konsole' + (f': {real_errors(err_f)}' if real_errors(err_f) else ''))
            del PHONES['F']
            await ctx_f.close()

            # Handy-Uhr geht zwei Stunden vor
            print('Sonderfälle')
            ctx_c = await new_phone()
            await ctx_c.add_init_script("const _now = Date.now; Date.now = () => _now() + 2 * 3600e3;")
            c, err_c = await open_page(ctx_c, url)
            await run(c, "db.pets.push({id: 'kiwipet00001', name: 'Kiwi', species: 'Vogel', photo: null, createdAt: Date.now()}); save();")
            await connect(c, CODE, srv.url)
            await expect(await until(c, "state.epoch !== '' && queue.length === 0", 10), 'Handy mit falscher Uhr: Änderungen neu gestempelt und angenommen')
            kiwi = [x for x in srv.get('/api/changes?since=0')['records'] if x['r'] == 'kiwipet00001']
            skew = abs(int(kiwi[0]['f']['name']['t'][:13]) / 1000 - time.time()) if kiwi else 1e9
            await expect(skew < 120, f'Uhr des Servers maßgeblich (Abweichung {skew:.0f} s)')
            kiwi = "db.pets.some(p => p.name === 'Kiwi')"
            await expect(await until(a, kiwi) and await until(b, kiwi), 'das Tier des dritten Handys kommt bei den anderen an')
            await ctx_c.close()

            # Wiederherstellung aus Backup: neue Epoche
            srv.stop()
            srv.restore(backup)
            srv.start()
            await expect(len(srv.records()['servings']) == 3, 'Server aus dem Backup wiederhergestellt (älterer Stand)')
            for pg in (a, b):
                await pg.evaluate("dispatchEvent(new Event('online'))")
            ok = await until(a, "queue.length === 0 && state.epoch === '%s'" % srv.get('/api/checksum')['epoch'], 10)
            ok = ok and await until(b, "queue.length === 0 && state.epoch === '%s'" % srv.get('/api/checksum')['epoch'], 10)
            names = {r.get('name') for r in srv.records()['pets'].values()}
            await expect(ok and {'Luna', 'Tiger II', 'Kiwi'} <= names, f'neue Epoche: Handys senden alles Neuere erneut ({sorted(names)})')

            # Prüfsumme deckt eine Lücke auf
            srv.stop()
            st = json.loads((srv.dir / 'state.json').read_text())
            luna = next((i for i, r in st['records']['pets'].items() if r['f'].get('name', {}).get('v') == 'Luna'), None)
            if luna:
                del st['records']['pets'][luna]
            (srv.dir / 'state.json').write_text(json.dumps(st))
            srv.start()
            await a.reload()  # beim Start vergleicht die App die Prüfsumme
            await expect(await until(a, "state.log.some(l => l.text.includes('Prüfsumme weicht ab'))", 10) and
                  await until(a, 'queue.length === 0', 10) and luna in srv.records()['pets'],
                  'Prüfsumme weicht ab: vollständiger Abgleich stellt die Lücke wieder her')

            # Code geändert
            srv.cfg['code'] = NEW_CODE
            time.sleep(1.1)
            srv.write_config()
            await a.evaluate("dispatchEvent(new Event('online'))")
            ok = await until_sync(a, "status.kind === 'auth'")
            await expect(ok and 'Code prüfen' in await a.inner_text('#syncChip'), 'neuer Code auf dem Server: Hinweis „Code prüfen“')
            await a.click('#syncChip')
            await idle(a)
            await connect(a, NEW_CODE.lower(), srv.url, edit=False)
            await expect(await until(a, "prefs.code === '%s' && queue.length === 0" % NEW_CODE, 10) and await a.locator('#syncChip').is_hidden(),
                  'neuen Code eingegeben: gleicht weiter ab')
            await b.evaluate("dispatchEvent(new Event('online'))")
            await until_sync(b, "status.kind === 'auth'")
            await connect(b, NEW_CODE, srv.url, edit=False)
            await until(b, "prefs.code === '%s'" % NEW_CODE, 10)

            # Protokoll passt nicht
            ctx_d = await new_phone()

            async def newer(route):  # antwortet wie ein Server mit Protokoll 2, samt CORS
                cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type'}
                if route.request.method == 'OPTIONS':
                    await route.fulfill(status=204, headers=cors)
                else:
                    await route.fulfill(headers=cors, json={'app': 'schmeckts', 'version': '9.0.0', 'protocol': 2, 'auth': True,
                                                            'recognition': True, 'now': int(time.time() * 1000)})
            await ctx_d.route(f'{srv.url}/api/info*', newer)
            d, _ = await open_page(ctx_d, url)
            await connect(d, NEW_CODE, srv.url)
            await idle(d)
            await expect('neuer als diese App' in await d.inner_text('#serverBox') and await state(d, 'prefs.code') == '',
                  'Server mit neuerem Protokoll: Hinweis, nicht verbunden')
            await ctx_d.close()

            # Endstand: alle gleich
            print('Endstand')
            for pg in (a, b):
                await pg.evaluate("import('./js/sync.js').then(m => m.retrySync())")
            await until(a, 'queue.length === 0', 10)
            await until(b, 'queue.length === 0', 10)
            server = srv.get('/api/checksum')
            sums = [await pg.evaluate("import('./js/store.js').then(m => m.checksum()).then(x => x.sum)") for pg in (a, b)]
            await expect(sums == [server['sum']] * 2, f'Prüfsumme: beide Handys gleich dem Server ({server["fields"]} Felder)')
            pa, pb, ps = await a.evaluate(PROJECTION), await b.evaluate(PROJECTION), srv.records()
            await expect(pa == pb == ps, 'Inhalte: beide Handys und Server gleich')
            for name, errs in (('A', err_a), ('B', err_b)):
                bad = real_errors(errs)
                await expect(not bad, f'Handy {name}: keine Fehler in der Konsole' + (f': {bad}' if bad else ''))
        finally:
            await browser.close()
            if srv.proc.poll() is None:
                srv.stop()
            if failures:
                print('\nServer-Protokoll:\n' + (srv.dir / 'server.log').read_text()[-3000:])
    print(f'\n{"Alle Tests bestanden" if not failures else f"{len(failures)} Tests fehlgeschlagen"}')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    asyncio.run(main())
