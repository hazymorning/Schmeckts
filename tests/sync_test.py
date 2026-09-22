#!/usr/bin/env python3
"""Tests of the sync against the real Go server: several phones (one browser context each) and a server with its
own data directory on a free port, plus a fake Anthropic for photo recognition and a fake product database for the
barcode lookup (config barcodeUrls).
Checks taking data over and connecting, syncing in both directions, live notifications, the queue without a
connection, restarts, a phone with a skewed clock, a restore (new epoch), the checksum, a changed code, the
protocol version, recognition including the automatic retry, and scanning: lookup through the server, the detour
via a photo, a known code without a connection, codes from two phones, removal, a server without barcode lookup.
At the end both phones and the server must hold the same data.
Usage: python3 tests/sync_test.py   (needs Go, builds the server itself)"""

import asyncio
import base64
import http.server
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from playwright.async_api import async_playwright
from common import PACK, ROOT, SAVED, check, failures, idle, make_photo, open_page, phone, real_errors, seeded, serve, started, state, until

CODE, NEW_CODE = 'K7PM-3QXD', 'W9ZX-4HJT'
HIT, MISS, C1, C2, OLD = '5901234123457', '4012345000016', '4012345000023', '4012345000030', '4012345000047'  # valid EAN-13


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class FakeAnthropic:
    """Answers like the Messages API with the packaging in reply, and counts the calls."""

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
        self.products = {
            HIT: {
                'product_name': 'Sheba Fresh Choice Huhn in Sauce 4x50g',
                'brands': 'Sheba, Mars',
                'categories_tags': ['en:pet-food', 'en:cat-food', 'en:wet-cat-food'],
            }
        }
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
    """The real server from server/, with its own data directory."""

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
        raise RuntimeError('server does not start:\n' + (self.dir / 'server.log').read_text())

    def stop(self):
        self.proc.terminate()
        self.proc.wait(10)

    def get(self, path):
        req = urllib.request.Request(self.url + path, headers={'Authorization': 'Bearer ' + self.cfg['code']})
        return json.load(urllib.request.urlopen(req, timeout=10))

    def records(self):
        """Visible records as in the app: {collection: {id: {field: value}}}, without _del and null."""
        out = {'pets': {}, 'products': {}, 'servings': {}}
        for x in self.get('/api/changes?since=0')['records']:
            if x['f'].get('_del', {}).get('v') is True:
                continue
            out[x['c']][x['r']] = {k: f['v'] for k, f in x['f'].items() if k != '_del' and f['v'] is not None}
        return out

    def restore(self, backup):
        """Restoring as on the mini-PC. The command needs root, so it is reproduced here otherwise."""
        if os.geteuid() == 0:
            subprocess.run([self.binary, 'restore', str(backup)], env=self.env, check=True, capture_output=True)
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
    """Runs JS with the exports of store.js (db, save, queue, …), the way the logic modules do."""
    return await pg.evaluate(f"import('./js/store.js').then(async m => {{ const {{db, prefs, save}} = m; {body} }})")


async def until_sync(pg, expr, timeout=10.0):
    """Wartet, bis expr mit dem Sync-Status (status) wahr ist."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if await pg.evaluate(f"import('./js/sync.js').then(({{status}}) => {expr})"):
            return True
        await asyncio.sleep(0.1)
    return False


PHONES = {}  # name → (page, console errors), for diagnosing failures


async def expect(cond, text):
    """Like check, but on a failure it prints the status, the queue and the console of every phone."""
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
        print(f'      {name} console: {real_errors(errs)[-5:]}')
    return False


async def sync_status(pg):
    return await pg.evaluate("import('./js/sync.js').then(m => ({...m.status}))")


async def connect(pg, code, server, edit=True):
    if not await pg.locator('#serverBox').count():
        if not await pg.evaluate("document.getElementById('sheet').open"):
            await pg.click('[data-action=open-settings]')
            await idle(pg)
        await pg.click('#sheet [data-action=settings-page][data-v=house]')
        await idle(pg)
    if await pg.locator('#serverBox [data-action=connect-form]').count():  # mode `lokal`: the button opens address and code
        await pg.click('#serverBox [data-action=connect-form]')
        await idle(pg)
    if edit:
        if await pg.locator('[data-action=edit-server]').count():
            await pg.click('[data-action=edit-server]')
            await idle(pg)
        await pg.fill('#f-server', server)
    await pg.fill('#f-code', code)
    # If the box redraws between typing and connecting, the fields are empty again and connectServer()
    # would take the empty prefs.server. So check before the click and, if need be, type it in again.
    await idle(pg)
    if edit and await pg.input_value('#f-server') != server:
        await pg.fill('#f-server', server)
    if await pg.input_value('#f-code') != code:
        await pg.fill('#f-code', code)
    await pg.click('[data-action=connect]')


async def close_sheet(pg):
    """Out of whatever is open: a sheet has the X, the settings are a page and go by their arrow, one level a time."""
    while await pg.evaluate("document.getElementById('sheet').open"):
        await pg.click('#sheet [data-action=close], #sheet [data-action=settings-back]')
        await idle(pg)


async def main():
    make_photo()
    go = shutil.which('go') or '/usr/local/go/bin/go'
    binary = os.path.join(tempfile.mkdtemp(), 'schmeckts-server')
    # -buildvcs=false: the stamp is pointless in a throwaway test binary, and the git call behind it fails when
    # the checkout belongs to a different user than the build runs as, which is the case in the CI container.
    subprocess.run([go, 'build', '-buildvcs=false', '-o', binary, '.'], cwd=ROOT / 'server', check=True)
    fake, food = FakeAnthropic(), FakeFoodDB()
    srv = GoServer(binary, fake)
    srv.cfg['barcodeUrls'] = [food.url]
    srv.write_config()
    srv.start()
    url = serve()
    blocked = set()

    async def block(ctx):  # the server unreachable for this phone (as without Wi-Fi)
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

        def new_phone():
            return phone(browser, motion=True)  # these phones do not run under reduced motion

        try:
            # Phone A is already in use (data without clocks) and connects
            print('connecting')
            ctx_a, a, err_a = await seeded(browser, url, {'db': SAVED, 'prefs': {'mode': 'lokal'}}, native=True)
            PHONES['A'] = (a, err_a)
            await expect(await state(a, 'db.servings.length') == 3, 'phone A: data on the device')
            await connect(a, 'XXXX-YYYY', srv.url)
            await idle(a)
            await expect(
                'stimmt nicht' in await a.inner_text('#serverBox') and await state(a, 'prefs.code') == '',
                'wrong code: a clear message, not connected',
            )
            await connect(a, 'k7pm 3qxd', srv.url, edit=False)
            await expect(
                await until(a, "prefs.code === 'K7PM-3QXD' && state.epoch !== '' && queue.length === 0"),
                'correct code (lower case, with spaces): connected, everything sent',
            )
            rec = srv.records()
            await expect(
                len(rec['servings']) == 3 and rec['pets'].get('lxpet00001', {}).get('name') == 'Minka', 'the data taken over sits on the server'
            )
            await expect(all('photo' not in r and 'status' not in r for r in rec['servings'].values()), 'local fields stay on the phone')
            await expect(
                await until_sync(a, "status.state === 'ok' && !status.busy") and 'Alles abgeglichen' in await a.inner_text('#serverBox'),
                'status: all synced',
            )
            backup = srv.dir / 'backup-test.json'
            shutil.copy(srv.dir / 'state.json', backup)  # for the restore further down

            # Phone B: sample data, then connect
            ctx_b = await new_phone()
            b, err_b = await open_page(ctx_b, url)
            PHONES['B'] = (b, err_b)
            await b.click('[data-action=demo]')
            await idle(b)
            await connect(b, CODE, srv.url)
            await expect(
                await until(b, "state.epoch !== '' && db.pets.some(p => p.id === 'lxpet00001')"),
                'phone B connected and sees the household\u2019s data',
            )
            await expect(
                await state(b, "!db.pets.concat(db.products, db.servings).some(r => r.id.startsWith('demo'))"), 'sample data removed on connecting'
            )
            await expect(not any(i.startswith('demo') for c in srv.records().values() for i in c), 'sample data not in the household')
            await expect(await b.locator('#sheet [data-action=demo]').count() == 0, 'with a server there is no „Beispieldaten laden“')

            # Live notifications and simultaneous ratings
            print('syncing')
            await close_sheet(a)
            await close_sheet(b)
            await run(b, "db.pets.push({id: 'tigerpet0001', name: 'Tiger', species: 'Katze', photo: null, createdAt: Date.now()}); save();")
            await expect(await until(a, "db.pets.some(p => p.name === 'Tiger')", 6), 'live: a new pet appears on the other phone without a reload')
            await expect((await sync_status(a))['live'], 'the live connection is up')
            await run(
                a,
                """db.servings.unshift({id: 'zweipets0001', productId: 'lxprod0001', servedAt: Date.now(),
              pets: {lxpet00001: {r: null, at: null}, tigerpet0001: {r: null, at: null}}, note: ''}); save();""",
            )
            await expect(await until(b, "db.servings.some(s => s.id === 'zweipets0001')", 6), 'a meal for two pets arrives')

            # The rating reminder on phone A (plugin simulated): it is only cancelled once the other phone has rated too
            def reminders():
                return a.evaluate(
                    'window.Capacitor.Plugins.LocalNotifications.getPending().then(r => r.notifications.map(n => n.extra.serving).sort())'
                )

            async def planned(want, timeout=5.0):
                end = time.monotonic() + timeout
                while await reminders() != want and time.monotonic() < end:
                    await asyncio.sleep(0.1)
                return await reminders() == want

            await a.evaluate("""import('./js/store.js').then(async s => { s.prefs.remind = 60; const r = await import('./js/logic/reminders.js');
              s.db.servings.unshift({id: 'wirdgeloescht', productId: 'lxprod0001', servedAt: Date.now(), pets: {lxpet00001: {r: null, at: null}}, note: ''}); s.save();
              for (const id of ['zweipets0001', 'wirdgeloescht']) r.planReminder(s.db.servings.find(x => x.id === id)); })""")
            await expect(
                await until(b, "db.servings.some(s => s.id === 'wirdgeloescht')", 6) and await reminders() == ['wirdgeloescht', 'zweipets0001'],
                'reminders scheduled on phone A',
            )
            await block(ctx_b)
            await run(a, "const s = db.servings.find(s => s.id === 'zweipets0001'); s.pets.lxpet00001 = {r: 'gut', at: Date.now()}; save();")
            await run(b, "const s = db.servings.find(s => s.id === 'zweipets0001'); s.pets.tigerpet0001 = {r: 'schlecht', at: Date.now()}; save();")
            await until(a, 'queue.length === 0')
            half = await reminders()
            await unblock(ctx_b, b)
            both = "(s => s && s.pets.lxpet00001.r === 'gut' && s.pets.tigerpet0001.r === 'schlecht')(db.servings.find(s => s.id === 'zweipets0001'))"
            await expect(await until(a, both, 8) and await until(b, both, 8), 'rated at the same time, different pets: both ratings are kept')
            await expect(
                'zweipets0001' in half and await planned(['wirdgeloescht']),
                'reminder: still scheduled after our own rating, cancelled as soon as the other phone rates the rest',
            )
            await run(b, "db.servings = db.servings.filter(s => s.id !== 'wirdgeloescht'); save();")
            await expect(await until(a, "!db.servings.some(s => s.id === 'wirdgeloescht')", 8), 'a meal deleted on the other phone disappears')
            await expect(await planned([]), 'reminder: cancelled when another phone deletes the meal')
            await a.evaluate("import('./js/store.js').then(s => { s.prefs.remind = 0; })")

            # The queue without a connection survives a restart
            await block(ctx_a)
            await run(a, "db.pets.push({id: 'lunapet00001', name: 'Luna', species: 'Hund', photo: null, createdAt: Date.now()}); save();")
            await a.wait_for_function("/warte/.test(document.getElementById('syncChip').innerText)")
            chip = await a.inner_text('#syncChip')
            await expect('wartet' in chip or 'warten' in chip, f'without a connection: a notice at the top ({chip.strip()})')
            await a.reload()
            await started(a)
            await expect(
                await state(a, 'queue.length') > 0 and await state(a, "db.pets.some(p => p.name === 'Luna')"),
                'app restart without a connection: queue and data are kept',
            )
            await unblock(ctx_a, a)
            await expect(
                await until(a, 'queue.length === 0') and await until(b, "db.pets.some(p => p.name === 'Luna')", 6),
                'connected again: the queue was sent and the other phone has it',
            )
            await expect(await a.locator('#syncChip').is_hidden(), 'no notice at the top afterwards')

            # Server down, phone off
            srv.stop()
            await run(b, "db.pets.find(p => p.name === 'Tiger').name = 'Tiger II'; save();")
            await expect(await until_sync(b, "status.state === 'offline'", 15), 'server down: status offline')
            await b.close()
            del PHONES['B']
            srv.start()
            await run(a, "db.pets.find(p => p.name === 'Luna').species = 'Katze'; save();")
            await a.evaluate("dispatchEvent(new Event('online'))")
            await expect(await until(a, 'queue.length === 0', 10), 'server back up: phone A syncs')
            b, err_b2 = await open_page(ctx_b, url)
            err_b += err_b2
            PHONES['B'] = (b, err_b2)
            await expect(
                await until(b, "db.pets.some(p => p.name === 'Luna' && p.species === 'Katze') && !db.pets.some(p => p.name === 'Tiger')", 8),
                'phone B starts again: sends what was waiting and catches up on what is new',
            )
            await expect(await until(a, "db.pets.some(p => p.name === 'Tiger II')", 8), 'a change from B arrives at A')

            # Deleting and undo, lots of changes
            await run(
                a,
                "window.__s = JSON.parse(JSON.stringify(db.servings.find(s => s.id === 'zweipets0001'))); "
                "db.servings.splice(db.servings.findIndex(s => s.id === 'zweipets0001'), 1); save();",
            )
            await expect(await until(b, "!db.servings.some(s => s.id === 'zweipets0001')", 6), 'the deletion arrives')
            await run(a, 'db.servings.unshift(window.__s); save();')
            await expect(
                await until(b, "(s => s && s.pets.tigerpet0001.r === 'schlecht')(db.servings.find(s => s.id === 'zweipets0001'))", 6),
                'undo arrives, ratings and all',
            )
            await run(
                a,
                """for (let i = 0; i < 620; i++) db.servings.push({id: 'massen' + String(i).padStart(4, '0'),
              productId: 'lxprod0001', servedAt: 1700000000000 + i, pets: {lxpet00001: {r: 'mittel', at: null}}, note: ''}); save();""",
            )
            await expect(await until(a, 'queue.length === 0', 15) and len(srv.records()['servings']) >= 620, '620 changes in several batches')
            await run(a, "m.replaceDb({...db, servings: db.servings.filter(s => !s.id.startsWith('massen'))}); save();")
            await expect(await until(b, "!db.servings.some(s => s.id.startsWith('massen')) && db.servings.length > 3", 10), 'and deleted again')

            # Photo recognition through the server
            print('recognition')
            await a.click('#fab')
            await idle(a)
            await a.set_input_files('#camInputSheet', str(PACK))
            await expect(
                await until(a, "db.products.some(p => p.variety === 'Lachs in Soße')", 10) and fake.calls == 1, 'photo recognised through the server'
            )
            await expect(
                await until(b, "db.products.some(p => p.variety === 'Lachs in Soße') && db.servings[0].productId", 6),
                'the recognised food arrives at the other phone',
            )
            soup = "db.products.some(p => p.variety === 'Lachs in Soße' && p.texture === 'sosse')"
            await expect(
                await state(a, soup) and await until(b, soup, 6) and any(r.get('texture') == 'sosse' for r in srv.records()['products'].values()),
                'consistency after recognition from the keywords, synced like any other field',
            )
            await expect(
                await state(b, '!db.servings[0].photo && !!(db.products.find(p => p.id === db.servings[0].productId) || {}).thumb'),
                'only the thumbnail is shared (on the food), not the photo',
            )
            await block(ctx_a)
            fake.reply = {'brand': 'Felix', 'variety': 'So gut wie es aussieht', 'type': 'Nassfutter', 'animal': 'Katze'}
            await a.click('#fab')
            await idle(a)
            await a.set_input_files('#camInputSheet', str(PACK))
            await expect(await until(a, "db.servings[0].status === 'waiting'", 6), 'server unreachable: the photo waits')
            await unblock(ctx_a, a)
            await expect(
                await until(a, "db.products.some(p => p.brand === 'Felix') && !db.servings[0].status", 10) and fake.calls == 2,
                'server back: recognised automatically',
            )

            # Scanning: lookup through the server, the detour via a photo, a known code offline, two phones
            print('scanning')
            photo = json.dumps(base64.b64encode(PACK.read_bytes()).decode())
            await close_sheet(a)
            await a.evaluate(f"window.__barcode = '{HIT}'")
            await a.click('#fab')
            await idle(a)
            await a.click('[data-action=scan]')
            hit = f"db.products.find(p => p.codes && p.codes['{HIT}'])"
            ok = await until(
                a,
                f"(p => p && p.brand === 'Sheba' && p.variety === 'Fresh Choice Huhn in Sauce' && p.type === 'Nassfutter' && p.animal === 'Katze'"
                f' && db.servings[0].productId === p.id)({hit})',
                10,
            )
            await expect(
                ok and food.calls == [HIT],
                'unknown code: the server finds it in the product database, the variety is created, the code attached, and it is served',
            )
            await expect(await until(b, f'!!{hit}', 6), 'the variety and its code arrive at the other phone')
            rec = srv.records()
            await expect(
                any(r.get('codes.' + HIT) is True for r in rec['products'].values()) and not any('scanCode' in r for r in rec['servings'].values()),
                'server: the code as the field codes.<EAN> on the variety, scanCode stays on the phone',
            )
            fake.reply = {'brand': 'Animonda', 'variety': 'Carny Rind', 'type': 'Nassfutter', 'animal': 'Katze'}
            await a.evaluate(f"window.__barcode = '{MISS}'; window.__photo = {photo}")
            await a.click('#fab')
            await idle(a)
            await a.click('[data-action=scan]')
            ok = await until(a, f"db.products.some(p => p.brand === 'Animonda' && p.codes && p.codes['{MISS}'])", 12)
            asked = ['capture', {'hint': 'Vorderseite fotografieren'}] in await a.evaluate('window.__calls')
            await expect(
                ok and asked and MISS in food.calls, 'no hit: the camera for the front, the photo recognised, the code on the recognised variety'
            )
            await expect(
                await until(b, f"db.products.some(p => p.brand === 'Animonda' && p.codes && p.codes['{MISS}'])", 6), 'on the other phone too'
            )
            await block(ctx_a)
            await a.evaluate(f"window.__barcode = '{HIT}'")
            n = await state(a, 'db.servings.length')
            await a.click('#fab')
            await idle(a)
            await a.click('[data-action=scan]')
            await idle(a)
            await expect(
                await state(a, f'db.servings.length === {n + 1} && db.servings[0].productId === {hit}.id') and food.calls.count(HIT) == 1,
                'a known code without a connection: served at once, without a request',
            )
            await run(a, f"db.products.find(p => p.codes && p.codes['{HIT}']).codes['{C1}'] = true; save();")
            await run(b, f"db.products.find(p => p.codes && p.codes['{HIT}']).codes['{C2}'] = true; save();")
            await idle(b)
            await unblock(ctx_a, a)
            both = f"(p => p.codes['{C1}'] && p.codes['{C2}'] && p.codes['{HIT}'])({hit})"
            await expect(
                await until(a, both, 8) and await until(b, both, 8), 'two phones attach codes to the same variety at the same time: both are kept'
            )
            pid = await state(a, f'{hit}.id')
            await a.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))")
            await idle(a)
            await a.click(f'#sheet [data-action=remove-code][data-code="{C1}"]')
            gone = f"(p => !p.codes['{C1}'] && p.codes['{C2}'] && p.codes['{HIT}'])(db.products.find(p => p.id === '{pid}'))"
            await expect(
                await until(b, gone, 6) and 'codes.' + C1 not in srv.records()['products'][pid], 'code removed: gone everywhere, the others are kept'
            )

            # The manual „Kaufen“ setting syncs like any other field, including back to „Automatisch“
            def kauf(v):
                return "(p => p && %s)(db.products.find(p => p.id === '%s'))" % ("!('kaufen' in p)" if v is None else f"p.kaufen === '{v}'", pid)

            await a.click('#sheet [data-action=buy][data-v=immer]')
            await expect(
                await until(b, kauf('immer'), 6) and srv.records()['products'][pid].get('kaufen') == 'immer',
                '„Immer kaufen“ from A arrives at B and on the server',
            )
            await b.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))")
            await idle(b)
            await b.click('#sheet [data-action=buy][data-v=nicht]')
            await expect(
                await until(a, kauf('nicht'), 6)
                and await until(a, "document.querySelector('#sheet [data-action=buy][data-v=nicht]')?.getAttribute('aria-pressed') === 'true'", 4),
                '„Nicht kaufen“ from B arrives at A, and the open food sheet shows it',
            )
            await close_sheet(b)
            await a.click('#sheet [data-action=buy][data-v=auto]')
            await expect(
                await until(b, kauf(None), 6) and srv.records()['products'][pid].get('kaufen') is None,
                'back to „Automatisch“: the field is gone everywhere',
            )

            # Consistency: choosing and clearing arrive everywhere; a value from the server beats the keywords
            def tex(v, name):
                return '(p => !!p && %s)(db.products.find(p => %s))' % ("!('texture' in p)" if v is None else f"p.texture === '{v}'", name)

            await a.click('#sheet [data-action=set-texture][data-v=mousse]')
            await expect(
                await until(b, tex('mousse', f"p.id === '{pid}'"), 6) and srv.records()['products'][pid].get('texture') == 'mousse',
                'the consistency from A arrives at B and on the server',
            )
            await a.click('#sheet [data-action=set-texture][data-v=mousse]')
            await expect(
                await until(b, tex(None, f"p.id === '{pid}'"), 6) and srv.records()['products'][pid].get('texture') is None,
                'a second tap clears it: the field is gone everywhere',
            )
            await close_sheet(a)

            async def newer_server(route):
                await route.fulfill(
                    json={
                        'brand': 'Miamor',
                        'variety': 'Huhn in Soße',
                        'type': 'Nassfutter',
                        'animal': 'Katze',
                        'texture': 'gelee',
                        'now': int(time.time() * 1000),
                    }
                )

            await a.route('**/api/recognize', newer_server)
            await a.click('#fab')
            await idle(a)
            await a.set_input_files('#camInputSheet', str(PACK))
            await expect(
                await until(a, tex('gelee', "p.brand === 'Miamor'"), 10) and await until(b, tex('gelee', "p.brand === 'Miamor'"), 6),
                'when the server supplies texture, that value beats the keywords',
            )
            await a.unroute('**/api/recognize')
            # Levels of the other scales pass through the server like any rating
            sid = await state(a, 'db.servings[0].id')
            await run(a, "const s = db.servings[0]; s.pets[Object.keys(s.pets)[0]] = {r: 'verputzt', at: Date.now()}; save();")
            await expect(
                await until(b, f"Object.values(db.servings.find(s => s.id === '{sid}').pets).some(x => x.r === 'verputzt')", 6)
                and any(k.startswith('pets.') and v.get('r') == 'verputzt' for k, v in srv.records()['servings'][sid].items() if isinstance(v, dict)),
                'a level of the treat scale arrives at the other phone and on the server',
            )
            # A server without barcode lookup (as in 1.0.0: no "barcode" in features): straight to the camera, no request
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
            asked = ['capture', {'hint': 'Vorderseite fotografieren'}] in await e.evaluate('window.__calls')
            await expect(
                asked and not asked_e and OLD not in food.calls and await e.locator('#sheet [data-action=scan]').count() == 1,
                'server without barcode lookup: no request, straight to the camera; cancelled, back in the feeding sheet',
            )
            await expect(
                not real_errors(err_e),
                'phone without barcode lookup: no errors in the console' + (f': {real_errors(err_e)}' if real_errors(err_e) else ''),
            )
            await ctx_e.close()

            # Connecting from the welcome page, the server box, disconnecting
            print('modes and the server box')
            ctx_f = await new_phone()
            f, err_f = await open_page(ctx_f, url, native=True, choose=False)
            PHONES['F'] = (f, err_f)
            await f.click('.welcome [data-action=connect-form]')
            await idle(f)
            await f.fill('#f-server', srv.url.replace('http://', ''))
            await f.fill('#f-code', CODE)
            await f.click('[data-action=connect]')
            await expect(
                await until(f, "prefs.mode === 'haushalt' && state.epoch !== '' && db.pets.some(p => p.id === 'lxpet00001')")
                and await state(f, 'prefs.server') == srv.url,
                'first start, „Mit Haushalt verbinden“: address (with or without http://) and code, mode `haushalt`, data there',
            )
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
            await expect(await f.evaluate('window.__mut') == 0, 'a sync in the background, a slow one too: the server box stays as it is')
            await expect(
                await f.locator('#serverBox [data-action=sync-now]').count() == 0 and 'Alles abgeglichen' in await f.inner_text('#serverBox'),
                'all synced: no „Jetzt abgleichen“ button, there is nothing to do',
            )
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
            await expect(
                early == 0
                and 'Abgleich läuft' in late
                and await until(f, 'queue.length === 0', 6)
                and await f.locator('#serverBox [data-action=sync-now]').count() == 0,
                'with a change waiting there is „Jetzt abgleichen“: progress only on a hand-started sync and not at once, and afterwards the button is gone again',
            )
            await ctx_f.unroute(f'{srv.url}/api/info*')
            n = await state(f, 'db.servings.length')
            await f.click('#serverBox [data-then=disconnect]')
            await idle(f)
            await f.click('#serverBox [data-then=disconnect]')
            await idle(f)
            box = await f.eval_on_selector_all('#serverBox .btn', 'l => l.map(b => b.innerText.trim())')
            await f.click('#sheet [data-action=settings-back]')  # the footer sits on the overview
            await idle(f)
            await expect(
                await state(f, f"prefs.mode === 'lokal' && prefs.code === '' && db.servings.length === {n} && db.pets.length > 0")
                and box == ['Mit Haushalt verbinden']
                and 'Alle Daten bleiben auf diesem Gerät' in await f.inner_text('#sheet .foot'),
                '„Verbindung trennen“ switches to `lokal`, the data is kept, and the „Haushalt“ page shows only the connect button',
            )
            await f.click('#sheet [data-action=settings-page][data-v=house]')
            await idle(f)
            await f.click('#serverBox [data-action=connect-form]')
            await idle(f)
            await expect(await f.input_value('#f-server') == srv.url, 'connecting again: the address used last is in the field')
            await expect(not real_errors(err_f), 'Handy F: no errors in the console' + (f': {real_errors(err_f)}' if real_errors(err_f) else ''))
            del PHONES['F']
            await ctx_f.close()

            # The phone clock runs two hours fast
            print('special cases')
            ctx_c = await new_phone()
            await ctx_c.add_init_script('const _now = Date.now; Date.now = () => _now() + 2 * 3600e3;')
            c, err_c = await open_page(ctx_c, url)
            await run(c, "db.pets.push({id: 'kiwipet00001', name: 'Kiwi', species: 'Vogel', photo: null, createdAt: Date.now()}); save();")
            await connect(c, CODE, srv.url)
            await expect(
                await until(c, "state.epoch !== '' && queue.length === 0", 10), 'a phone with a skewed clock: the changes are restamped and accepted'
            )
            kiwi = [x for x in srv.get('/api/changes?since=0')['records'] if x['r'] == 'kiwipet00001']
            skew = abs(int(kiwi[0]['f']['name']['t'][:13]) / 1000 - time.time()) if kiwi else 1e9
            await expect(skew < 120, f'the server\u2019s clock is what counts (skew {skew:.0f} s)')
            kiwi = "db.pets.some(p => p.name === 'Kiwi')"
            await expect(await until(a, kiwi) and await until(b, kiwi), 'the third phone\u2019s pet arrives at the others')
            await ctx_c.close()

            # Restore from a backup: a new epoch
            srv.stop()
            srv.restore(backup)
            srv.start()
            await expect(len(srv.records()['servings']) == 3, 'server restored from the backup (an older state)')
            for pg in (a, b):
                await pg.evaluate("dispatchEvent(new Event('online'))")
            ok = await until(a, "queue.length === 0 && state.epoch === '%s'" % srv.get('/api/checksum')['epoch'], 10)
            ok = ok and await until(b, "queue.length === 0 && state.epoch === '%s'" % srv.get('/api/checksum')['epoch'], 10)
            names = {r.get('name') for r in srv.records()['pets'].values()}
            await expect(ok and {'Luna', 'Tiger II', 'Kiwi'} <= names, f'new epoch: the phones resend everything newer ({sorted(names)})')

            # The checksum uncovers a gap
            srv.stop()
            st = json.loads((srv.dir / 'state.json').read_text())
            luna = next((i for i, r in st['records']['pets'].items() if r['f'].get('name', {}).get('v') == 'Luna'), None)
            if luna:
                del st['records']['pets'][luna]
            (srv.dir / 'state.json').write_text(json.dumps(st))
            srv.start()
            await a.reload()  # at start-up the app compares the checksum
            await expect(
                await until(a, "state.log.some(l => l.text.includes('checksum differs'))", 10)
                and await until(a, 'queue.length === 0', 10)
                and luna in srv.records()['pets'],
                'checksum differs: a full sync restores the gap',
            )

            # The code has changed
            srv.cfg['code'] = NEW_CODE
            time.sleep(1.1)
            srv.write_config()
            await a.evaluate("dispatchEvent(new Event('online'))")
            ok = await until_sync(a, "status.kind === 'auth'")
            await expect(ok and 'Code prüfen' in await a.inner_text('#syncChip'), 'a new code on the server: the notice „Code prüfen“')
            await a.click('#syncChip')
            await idle(a)
            await connect(a, NEW_CODE.lower(), srv.url, edit=False)
            await expect(
                await until(a, "prefs.code === '%s' && queue.length === 0" % NEW_CODE, 10) and await a.locator('#syncChip').is_hidden(),
                'new code typed in: syncing carries on',
            )
            await b.evaluate("dispatchEvent(new Event('online'))")
            await until_sync(b, "status.kind === 'auth'")
            await connect(b, NEW_CODE, srv.url, edit=False)
            await until(b, "prefs.code === '%s'" % NEW_CODE, 10)

            # The protocol does not match
            ctx_d = await new_phone()

            async def newer(route):  # answers like a server with protocol 2, CORS headers included
                cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type'}
                if route.request.method == 'OPTIONS':
                    await route.fulfill(status=204, headers=cors)
                else:
                    await route.fulfill(
                        headers=cors,
                        json={
                            'app': 'schmeckts',
                            'version': '9.0.0',
                            'protocol': 2,
                            'auth': True,
                            'recognition': True,
                            'now': int(time.time() * 1000),
                        },
                    )

            await ctx_d.route(f'{srv.url}/api/info*', newer)
            d, _ = await open_page(ctx_d, url)
            await connect(d, NEW_CODE, srv.url)
            await idle(d)
            await expect(
                'neuer als diese App' in await d.inner_text('#serverBox') and await state(d, 'prefs.code') == '',
                'a server with a newer protocol: a notice, not connected',
            )
            await ctx_d.close()

            # Final state: both phones and the server hold the same data
            print('final state')
            for pg in (a, b):
                await pg.evaluate("import('./js/sync.js').then(m => m.retrySync())")
            await until(a, 'queue.length === 0', 10)
            await until(b, 'queue.length === 0', 10)
            server = srv.get('/api/checksum')
            sums = [await pg.evaluate("import('./js/store.js').then(m => m.checksum()).then(x => x.sum)") for pg in (a, b)]
            await expect(sums == [server['sum']] * 2, f'checksum: both phones match the server ({server["fields"]} fields)')
            pa, pb, ps = await a.evaluate(PROJECTION), await b.evaluate(PROJECTION), srv.records()
            await expect(pa == pb == ps, 'contents: both phones and the server are level')
            for name, errs in (('A', err_a), ('B', err_b)):
                bad = real_errors(errs)
                await expect(not bad, f'phone {name}: no errors in the console' + (f': {bad}' if bad else ''))
        finally:
            await browser.close()
            if srv.proc.poll() is None:
                srv.stop()
            if failures:
                print('\nserver log:\n' + (srv.dir / 'server.log').read_text()[-3000:])
    print(f'\n{"All tests passed" if not failures else f"{len(failures)} tests failed"}')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    asyncio.run(main())
