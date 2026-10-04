#!/usr/bin/env python3
"""The sync against the real Go server: several phones (one browser context each), the server with a data directory
of its own, and a fake Anthropic for photo recognition. At the end both phones and the server hold the same data.
Usage: python3 tests/sync_test.py   (needs Go, builds the server itself)"""

import asyncio
import base64
import http.server
import json
import os
import pathlib
import random
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from playwright.async_api import async_playwright
from common import (
    PACK,
    PACK_LARGE,
    ROOT,
    SAVED,
    check,
    failures,
    idle,
    make_photo,
    open_page,
    phone,
    real_errors,
    seeded,
    serve,
    started,
    state,
    until,
)

CODE, NEW_CODE = 'K7PM-3QXD', 'W9ZX-4HJT'
MISS, C1, C2 = '4012345000016', '4012345000023', '4012345000030'  # valid EAN-13


class FakeAnthropic:
    """Answers like the Messages API with reply as the packaging, and counts the calls."""

    def __init__(self):
        self.calls, self.reply = 0, {'brand': 'Sheba', 'variety': 'Lachs in Soße', 'type': 'Nassfutter', 'animal': 'Katze'}
        fake = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers.get('content-length', 0)))
                fake.calls += 1
                raw = json.dumps({'content': [{'type': 'text', 'text': json.dumps(fake.reply, ensure_ascii=False)}]}).encode()
                self.send_response(200)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.url = f'http://127.0.0.1:{srv.server_port}'


def some_port():
    return random.randint(20000, 32000)  # below the ephemeral range, where Chromium's own connections come from


class GoServer:
    """The real server from server/, with its own data directory."""

    def __init__(self, binary):
        self.binary, self.dir = binary, pathlib.Path(tempfile.mkdtemp(prefix='schmeckts-test-'))
        self.env = {**os.environ, 'STATE_DIRECTORY': str(self.dir)}
        self.cfg = {'code': CODE, 'apiKey': 'sk-ant-test', 'port': some_port()}
        self.proc = None

    @property
    def url(self):
        return f'http://127.0.0.1:{self.cfg["port"]}'

    def write_config(self):
        (self.dir / 'config.json').write_text(json.dumps(self.cfg))

    async def start(self):
        """On its port while that is free, otherwise on another one. Only an answer with the epoch from our own
        state.json counts, so a foreign server on the port is never taken for ours."""
        log = self.dir / 'server.log'
        for attempt in range(10):
            self.write_config()
            self.proc = subprocess.Popen([self.binary], env=self.env, stdout=open(log, 'a'), stderr=subprocess.STDOUT)
            if await self.answers():
                return
            self.proc.kill()
            self.proc.wait(10)
            if attempt >= 2:  # a restart tries its own port a few times first
                self.cfg['port'] = some_port()
        raise RuntimeError('server does not start:\n' + log.read_text()[-2000:])

    async def answers(self):
        for _ in range(100):
            if self.proc.poll() is not None:
                return False
            try:
                info = json.load(urllib.request.urlopen(self.url + '/api/info', timeout=1))
                ours = json.loads((self.dir / 'state.json').read_text())['epoch']
                return info.get('epoch') == ours and self.proc.poll() is None
            except Exception:
                await asyncio.sleep(0.05)
        return False

    async def stop(self):
        self.proc.terminate()
        await asyncio.to_thread(self.proc.wait, 10)

    def get(self, path):
        req = urllib.request.Request(self.url + path, headers={'Authorization': 'Bearer ' + self.cfg['code']})
        return json.load(urllib.request.urlopen(req, timeout=10))

    def records(self):
        """Visible records as in the app: {collection: {id: {field: value}}}, without _del and null."""
        out = {'pets': {}, 'products': {}, 'servings': {}, 'observations': {}}
        for x in self.get('/api/changes?since=0')['records']:
            if x['f'].get('_del', {}).get('v') is True:
                continue
            out.setdefault(x['c'], {})[x['r']] = {k: f['v'] for k, f in x['f'].items() if k != '_del' and f['v'] is not None}
        return out


PROJECTION = """Promise.all([import('./js/fields.js'), import('./js/store.js')]).then(([f, {db}]) => {
  const out = {};
  for (const c of f.COLLECTIONS) { out[c] = {};
    for (const r of db[c]) out[c][r.id] = Object.fromEntries(Object.entries(f.fieldsOf(c, r)).map(([k, j]) => [k, JSON.parse(j)])); }
  return out; })"""


async def run(pg, body):
    """Runs JS with the exports of store.js (db, prefs, save, …), the way the logic modules do."""
    return await pg.evaluate(f"import('./js/store.js').then(async m => {{ const {{db, prefs, save}} = m; {body} }})")


async def wait_js(pg, expr, timeout=10.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if await pg.evaluate(expr):
            return True
        await asyncio.sleep(0.1)
    return False


def until_sync(pg, expr, timeout=10.0):
    return wait_js(pg, f"import('./js/sync.js').then(({{status, held}}) => {expr})", timeout)


def until_sheet(pg, expr, timeout=10.0):
    return wait_js(pg, f"import('./js/ui/sheet.js').then(({{sheet}}) => {expr})", timeout)


PHONES = {}  # name → (page, console errors), for diagnosing failures


async def expect(cond, text):
    """Like check, but a failure prints the status, the queue and the console of every phone."""
    if check(cond, text):
        return True
    for name, (pg, errs) in PHONES.items():
        try:
            info = await pg.evaluate("""Promise.all([import('./js/sync.js'), import('./js/store.js')]).then(([s, m]) =>
              JSON.stringify({status: s.status, queue: m.queue.length, first: m.queue.slice(0, 2).map(q => [q.c, q.r, Object.keys(q.f).join(), q.t]),
                epoch: m.state.epoch, seq: m.state.seq, log: m.state.log.slice(-4).map(l => l.text)}))""")
        except Exception as e:
            info = f'unavailable: {e}'
        print(f'      {name}: {info}')
        print(f'      {name} console: {real_errors(errs)[-5:]}')
    return False


async def close_sheet(pg):
    """Out of whatever is open, one level at a time."""
    while await pg.evaluate("document.getElementById('sheet').open"):
        await pg.click('#sheet [data-action=close], #sheet [data-action=settings-back]')
        await idle(pg)


async def open_house(pg):
    await close_sheet(pg)
    await pg.click('[data-action=open-settings]')
    await idle(pg)
    await pg.click('#sheet [data-action=settings-page][data-v=house]')
    await idle(pg)


async def connect(pg, code, server=None):
    """Address and code on the household page; without server the address the phone has stays."""
    if not await pg.locator('#serverBox').count():
        await open_house(pg)
    if await pg.locator('#serverBox [data-action=connect-form]').count():
        await pg.click('#serverBox [data-action=connect-form]')
        await idle(pg)
    if server is not None and await pg.locator('#serverBox [data-action=edit-server]').count():
        await pg.click('#serverBox [data-action=edit-server]')
        await idle(pg)
    # the box may redraw between typing and the click, so the fields are checked once more
    for _ in range(2):
        if server is not None and await pg.input_value('#f-server') != server:
            await pg.fill('#f-server', server)
        if await pg.input_value('#f-code') != code:
            await pg.fill('#f-code', code)
        await idle(pg)
    await pg.click('#serverBox [data-action=connect]')


async def main():
    make_photo()
    fake = FakeAnthropic()
    go = shutil.which('go') or '/usr/local/go/bin/go'
    binary = os.path.join(tempfile.mkdtemp(), 'schmeckts-server')
    # -buildvcs=false: the git call behind the stamp fails when the checkout belongs to another user, as in CI
    flags = ['-buildvcs=false', '-ldflags', f'-X main.anthropicURL={fake.url}']
    subprocess.run([go, 'build', *flags, '-o', binary, '.'], cwd=ROOT / 'server', check=True)
    srv = GoServer(binary)
    await srv.start()
    url = serve()

    async def restart():
        """Starts the server again; if it had to move, the open phones follow."""
        old = srv.url
        await srv.start()
        if srv.url != old:
            for pg, _ in PHONES.values():
                await repoint(pg)

    async def repoint(pg):
        await pg.evaluate(
            f"import('./js/store.js').then(m => {{ if (m.prefs.server !== '{srv.url}') {{ m.prefs.server = '{srv.url}'; m.savePrefs(); }} }})"
        )

    async def block(ctx):  # the server out of reach for this phone, as without Wi-Fi
        async def abort(route):
            await route.abort()

        await ctx.route(f'{srv.url}/**', abort)

    async def unblock(ctx, pg):
        await ctx.unroute(f'{srv.url}/**')
        await pg.evaluate("dispatchEvent(new Event('online'))")

    async def online(*pages):
        for pg in pages:
            await pg.evaluate("dispatchEvent(new Event('online'))")

    async with async_playwright() as p:
        browser = await p.chromium.launch()

        def new_phone():
            return phone(browser, motion=True)

        try:
            # Phone A is already in use (data without clocks) and connects
            print('connecting')
            ctx_a, a, err_a = await seeded(browser, url, {'db': SAVED}, native=True)
            PHONES['A'] = (a, err_a)
            await connect(a, 'XXXX-YYYY', srv.url)
            await expect(
                await until_sheet(a, 'sheet?.connectError && !sheet.connecting') and await state(a, "prefs.code === ''"),
                'wrong code: an error, not connected',
            )
            await connect(a, 'k7pm 3qxd')
            await expect(
                await until(a, "prefs.code === 'K7PM-3QXD' && state.epoch !== '' && queue.length === 0"),
                'right code, lower case with spaces: connected, everything sent',
            )
            rec = srv.records()
            await expect(
                len(rec['servings']) == 3 and rec['pets'].get('lxpet00001', {}).get('name') == 'Minka', 'the data taken over is on the server'
            )
            await expect(await until_sync(a, "status.state === 'ok' && !status.busy"), 'status ok')

            # Phone B: sample data, then connect
            ctx_b = await new_phone()
            b, err_b = await open_page(ctx_b, url)
            PHONES['B'] = (b, err_b)
            await b.click('.welcome [data-action=demo]')
            await idle(b)
            await connect(b, CODE, srv.url)
            await expect(
                await until(b, "state.epoch !== '' && db.pets.some(p => p.id === 'lxpet00001')"), 'phone B connected, sees the household data'
            )
            await expect(
                await state(b, "!db.pets.concat(db.products, db.servings).some(r => r.id.startsWith('demo'))")
                and not any(i.startswith('demo') for c in srv.records().values() for i in c),
                'sample data removed on connecting, never sent',
            )

            # Live notifications and ratings at the same time
            print('syncing')
            await close_sheet(a)
            await close_sheet(b)
            await run(b, "db.pets.push({id: 'tigerpet0001', name: 'Tiger', species: 'Katze', photo: null, createdAt: Date.now()}); save();")
            await expect(await until(a, "db.pets.some(p => p.name === 'Tiger')", 6), 'live: a new pet appears on the other phone')
            await run(b, "db.pets.find(p => p.id === 'tigerpet0001').nicknames = ['Tigi', 'Mietz']; save();")
            await expect(
                await until(a, "db.pets.find(p => p.id === 'tigerpet0001')?.nicknames?.join() === 'Tigi,Mietz'", 6),
                'nicknames reach the other phone as a list',
            )
            await run(a, "delete db.pets.find(p => p.id === 'tigerpet0001').nicknames; save();")
            await expect(await until(b, "!('nicknames' in db.pets.find(p => p.id === 'tigerpet0001'))", 6), 'and go there too when all are removed')
            await run(b, "db.pets.find(p => p.id === 'tigerpet0001').sex = 'm'; save();")
            await expect(
                await until(a, "db.pets.find(p => p.id === 'tigerpet0001')?.sex === 'm'", 6)
                and srv.records()['pets'].get('tigerpet0001', {}).get('sex') == 'm',
                'the sex goes through the server as it is',
            )
            await expect(await until_sync(a, 'status.live'), 'the live connection is up')
            await run(
                a,
                """db.servings.unshift({id: 'zweipets0001', productId: 'lxprod0001', servedAt: Date.now(),
              pets: {lxpet00001: {r: null, at: null}, tigerpet0001: {r: null, at: null}}, note: ''}); save();""",
            )
            await expect(await until(b, "db.servings.some(s => s.id === 'zweipets0001')", 6), 'a meal for two pets arrives')

            # Rating reminders on A (plugin simulated): cancelled only once the other phone has rated too
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
                'reminders scheduled on A',
            )
            await block(ctx_b)
            await run(a, "const s = db.servings.find(s => s.id === 'zweipets0001'); s.pets.lxpet00001 = {r: 'gut', at: Date.now()}; save();")
            await run(b, "const s = db.servings.find(s => s.id === 'zweipets0001'); s.pets.tigerpet0001 = {r: 'schlecht', at: Date.now()}; save();")
            await until(a, 'queue.length === 0')
            half = await reminders()
            await unblock(ctx_b, b)
            both = "(s => s && s.pets.lxpet00001.r === 'gut' && s.pets.tigerpet0001.r === 'schlecht')(db.servings.find(s => s.id === 'zweipets0001'))"
            await expect(await until(a, both, 8) and await until(b, both, 8), 'different pets rated at the same time: both ratings kept')
            await expect(
                'zweipets0001' in half and await planned(['wirdgeloescht']), 'reminder kept after our rating, cancelled once B rates the rest'
            )
            await run(b, "db.servings = db.servings.filter(s => s.id !== 'wirdgeloescht'); save();")
            await expect(await until(a, "!db.servings.some(s => s.id === 'wirdgeloescht')", 8), 'a meal deleted on B disappears on A')
            await expect(await planned([]), 'reminder cancelled when another phone deletes the meal')
            await a.evaluate("import('./js/store.js').then(s => { s.prefs.remind = 0; })")

            # A reminder's button waits for the household: a pet B rated meanwhile opens on A instead of being rated
            # over; A's pulls are held until the button is pressed, and live notices do not reach it
            release = asyncio.Event()

            async def hold_pulls(route):
                if route.request.method == 'GET':
                    await release.wait()
                await route.continue_()

            async def no_live(route):
                await route.abort()

            meal = "db.servings.find(s => s.id === 'knopfmahl01')"
            await run(
                a,
                "db.servings.unshift({id: 'knopfmahl01', productId: 'lxprod0001', servedAt: Date.now(), pets: {lxpet00001: {r: null, at: null}}, note: ''}); save();",
            )
            await until(b, f'!!{meal}', 6)
            await ctx_a.route(f'{srv.url}/api/events**', no_live)
            await ctx_a.route(f'{srv.url}/api/changes**', hold_pulls)
            await run(b, f"{meal}.pets.lxpet00001 = {{r: 'schlecht', at: Date.now()}}; save();")
            await until(b, 'queue.length === 0')
            stale = await state(a, f'{meal}.pets.lxpet00001.r')
            await a.evaluate("void window.__tapNote({actionId: 'gut', notification: {extra: {serving: 'knopfmahl01', pet: 'lxpet00001'}}})")
            await asyncio.sleep(0.5)
            release.set()
            await expect(
                stale is None
                and await until_sheet(a, "sheet?.kind === 'serving' && sheet.id === 'knopfmahl01'", 6)
                and await state(a, f'{meal}.pets.lxpet00001.r') == 'schlecht',
                'a reminder button first catches up: what B rated meanwhile opens on A and stays',
            )
            await ctx_a.unroute(f'{srv.url}/api/changes**')
            await ctx_a.unroute(f'{srv.url}/api/events**')
            await close_sheet(a)
            await block(ctx_a)
            await run(
                a,
                "db.servings.unshift({id: 'knopfmahl02', productId: 'lxprod0001', servedAt: Date.now(), pets: {lxpet00001: {r: null, at: null}}, note: ''}); save();",
            )
            await until_sync(a, "status.state === 'offline'", 15)
            await a.evaluate("window.__tapNote({actionId: 'gut', notification: {extra: {serving: 'knopfmahl02', pet: 'lxpet00001'}}})")
            await expect(
                await until(a, "db.servings.find(s => s.id === 'knopfmahl02').pets.lxpet00001.r === 'gut'", 0.5),
                'with the server out of reach the button rates at once',
            )
            await unblock(ctx_a, a)
            await until(a, 'queue.length === 0')

            # Feeding reminder: the plugin gets server and code, and the server knows of B's meal but not of its treat
            await a.evaluate(
                "import('./js/store.js').then(async s => { s.prefs.feedRemind = true; (await import('./js/logic/reminders.js')).syncReminders(); })"
            )
            await a.wait_for_function("JSON.parse(localStorage.getItem('__feed') || '{}').code === 'K7PM-3QXD'")
            handed = await a.evaluate("JSON.parse(localStorage.getItem('__feed'))")
            since = int(time.time() * 1000)
            before = srv.get(f'/api/fed?since={since}')
            await run(
                b,
                """db.products.push({id: 'snackprod001', brand: 'Dreamies', variety: 'Käse', type: 'Snack', codes: {}, createdAt: Date.now()});
              db.servings.unshift({id: 'snackmeal001', productId: 'snackprod001', servedAt: Date.now(), by: 'Jonas', pets: {lxpet00001: {r: null, at: null}}, note: ''}); save();""",
            )
            await until(b, 'queue.length === 0')
            treat = srv.get(f'/api/fed?since={since}')
            await run(
                b,
                "db.servings.unshift({id: 'fedmeal00001', productId: 'lxprod0001', servedAt: Date.now(), by: 'Jonas', pets: {lxpet00001: {r: null, at: null}}, note: ''}); save();",
            )
            await until(b, 'queue.length === 0')
            meal = srv.get(f'/api/fed?since={since}')
            await expect(
                [handed['server'], handed['code']] == [srv.url, CODE]
                and before == {'fed': False, 'at': 0, 'by': ''}
                and not treat['fed']
                and meal['fed']
                and meal['by'] == 'Jonas'
                and meal['at'] >= since,
                f'feeding reminder: server and code handed over, B’s meal counts, its treat does not ({meal})',
            )
            await a.evaluate("import('./js/store.js').then(s => { s.prefs.feedRemind = false; })")

            # The queue without a connection survives a restart
            await block(ctx_a)
            await run(a, "db.pets.push({id: 'lunapet00001', name: 'Luna', species: 'Hund', photo: null, createdAt: Date.now()}); save();")
            await a.wait_for_selector('#syncChip:not([hidden])')
            await a.reload()
            await started(a)
            await expect(
                await state(a, "queue.length > 0 && db.pets.some(p => p.name === 'Luna')"),
                'offline: a notice at the top, queue and data survive a restart',
            )
            await unblock(ctx_a, a)
            await expect(
                await until(a, 'queue.length === 0') and await until(b, "db.pets.some(p => p.name === 'Luna')", 6),
                'online again: the queue is sent and B has it',
            )
            await expect(await a.locator('#syncChip').is_hidden(), 'no notice at the top afterwards')

            # Server down, phone off
            await srv.stop()
            await run(b, "db.pets.find(p => p.name === 'Tiger').name = 'Tiger II'; save();")
            await expect(await until_sync(b, "status.state === 'offline'", 15), 'server down: status offline')
            await b.close()
            del PHONES['B']
            await restart()
            await run(a, "db.pets.find(p => p.name === 'Luna').species = 'Katze'; save();")
            await online(a)
            await expect(await until(a, 'queue.length === 0', 10), 'server back: A syncs')
            b, err_b2 = await open_page(ctx_b, url)
            err_b += err_b2
            PHONES['B'] = (b, err_b2)
            await repoint(b)
            await online(b)
            await expect(
                await until(b, "db.pets.some(p => p.name === 'Luna' && p.species === 'Katze') && !db.pets.some(p => p.name === 'Tiger')", 8),
                'B starts again: sends what waited and catches up',
            )
            await expect(await until(a, "db.pets.some(p => p.name === 'Tiger II')", 8), 'B’s change arrives at A')

            # Deleting and undo, lots of changes
            await run(
                a,
                "window.__s = JSON.parse(JSON.stringify(db.servings.find(s => s.id === 'zweipets0001'))); "
                "db.servings.splice(db.servings.findIndex(s => s.id === 'zweipets0001'), 1); save();",
            )
            await expect(await until(b, "!db.servings.some(s => s.id === 'zweipets0001')", 6), 'a deletion arrives')
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

            # Observations: a collection older servers reject, so the phone holds it back for them
            print('observations')
            await run(
                a,
                "db.observations.unshift({id: 'beob00000001', kind: 'stink', at: Date.now(), pets: {lxpet00001: true, tigerpet0001: true}, by: 'Anna'}); save();",
            )
            await expect(
                await until(
                    b, "(o => o && o.kind === 'stink' && o.pets.tigerpet0001 === true)(db.observations.find(o => o.id === 'beob00000001'))", 8
                )
                and srv.records()['observations'].get('beob00000001', {}).get('kind') == 'stink',
                'an observation from A reaches the server and B',
            )
            posted = []

            async def older_server(route):  # /api/info as a server before 1.5.0 gives it
                res = await route.fetch()
                body = await res.json()
                body['features'] = [f for f in body.get('features', []) if f != 'collections']
                await route.fulfill(response=res, json=body)

            ctx_a.on('request', lambda r: posted.append(r.post_data or '') if r.method == 'POST' and '/api/changes' in r.url else None)
            await ctx_a.route(f'{srv.url}/api/info*', older_server)
            await a.evaluate("import('./js/sync.js').then(m => { m.status.features = null; return m.serverCan('collections'); })")
            await run(
                a,
                "db.observations.unshift({id: 'beob00000002', kind: 'tired', at: Date.now(), pets: {lxpet00001: true}}); db.pets.push({id: 'moglipet0001', name: 'Mogli', species: 'Katze', photo: null, createdAt: Date.now()}); save();",
            )
            await expect(
                await until(b, "db.pets.some(p => p.name === 'Mogli')", 8)
                and await until(a, "queue.length === 1 && queue[0].c === 'observations'", 8)
                and 'beob00000002' not in srv.records()['observations']
                and not any('beob00000002' in body for body in posted),
                'an older server: the pet goes out, the observation waits on the phone',
            )
            await a.evaluate("import('./js/store.js').then(s => { s.state.log.length = 0; })")
            await a.evaluate("import('./js/sync.js').then(m => m.retrySync())")
            await until_sync(a, "status.state === 'ok' && !status.busy", 10)
            log = await state(a, 'state.log.map(l => l.text)')
            await expect(
                not any('checksum' in t for t in log) and await until_sync(a, 'held().length === 1') and await a.locator('#syncChip').is_hidden(),
                f'the checksum leaves out what the server cannot hold, and nothing at the top nags ({log})',
            )
            await ctx_a.unroute(f'{srv.url}/api/info*')
            await a.evaluate("import('./js/sync.js').then(m => m.retrySync())")
            await expect(
                await until(a, 'queue.length === 0', 10) and await until(b, "db.observations.some(o => o.id === 'beob00000002')", 8),
                'the server updated: what waited goes out and reaches B',
            )

            # Photo recognition through the server, and the packaging photo shared with every phone
            print('recognition')
            await a.click('#fab')
            await idle(a)
            await a.set_input_files('#camInputSheet', str(PACK))
            await expect(
                await until(a, "db.products.some(p => p.variety === 'Lachs in Soße')", 10) and fake.calls == 1, 'photo recognised by the server'
            )
            await expect(
                await until(b, "db.products.some(p => p.variety === 'Lachs in Soße') && db.servings[0].productId", 6), 'the recognised food reaches B'
            )
            pid = await state(a, "db.products.find(p => p.variety === 'Lachs in Soße').id")
            on_server = srv.dir / 'photos' / f'{pid}.jpg'

            def file_on(pg):
                return pg.evaluate(f"localStorage.getItem('__fs:photos/{pid}.jpg')")

            await expect(
                await until(b, f"!!db.products.find(p => p.id === '{pid}')?.sharedPhoto", 10)
                and on_server.read_bytes() == base64.b64decode(await file_on(a)),
                'A hands its photo to the server, and the variety is marked on every phone',
            )
            await close_sheet(b)
            thumb = f'#home [data-action=view-photo][data-p="{pid}"]'

            async def view(pg):
                await pg.click(thumb)
                await pg.wait_for_selector('#viewer[open]')
                await idle(pg)
                width = await pg.evaluate("document.querySelector('#viewer img').naturalWidth")
                await pg.click('#viewer')
                await idle(pg)
                return width

            await expect(await view(b) == 480, 'B, which did not take it, opens the photo large from the server')
            on_server.unlink()
            await b.click(thumb)
            await expect(await until(b, f"!db.products.find(p => p.id === '{pid}').sharedPhoto", 6), 'a photo the server has lost: the mark goes')
            await expect(
                await until(b, f"!!db.products.find(p => p.id === '{pid}').sharedPhoto", 15) and on_server.exists(),
                'A, which still has it, hands it over again',
            )

            async def change_photo(pg, jpeg):
                await pg.evaluate(f'window.__photo = {json.dumps(base64.b64encode(jpeg.read_bytes()).decode())}')
                await pg.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))")
                await idle(pg)
                await pg.click('#sheet [data-action=product-photo]')

            await change_photo(a, PACK_LARGE)
            await expect(
                await until(a, f"typeof db.products.find(p => p.id === '{pid}').sharedPhoto === 'number' && prefs.photoStamps['{pid}'] > 0", 10)
                and await until(b, f"typeof db.products.find(p => p.id === '{pid}').sharedPhoto === 'number'", 10)
                and on_server.read_bytes() == base64.b64decode(await file_on(a))
                and on_server.stat().st_size != len(PACK.read_bytes()),
                'a new photo on A: the server replaces its own, the mark carries the stamp',
            )
            await close_sheet(a)
            width = await view(b)
            await expect(
                width == 1100 and await state(b, f"prefs.photoStamps['{pid}'] === db.products.find(p => p.id === '{pid}').sharedPhoto"),
                f'B fetches the new photo and notes its stamp ({width} px)',
            )

            # A server before 1.4.0 (no "replace") keeps its photo; A says so and marks nothing
            async def no_replace(route):
                res = await route.fetch()
                body = await res.json()
                body['features'] = [f for f in body.get('features', []) if f != 'replace']
                await route.fulfill(response=res, json=body)

            await ctx_a.route(f'{srv.url}/api/info*', no_replace)
            await a.evaluate("import('./js/sync.js').then(m => { m.status.features = null; return m.serverCan('replace'); })")
            await until_sync(a, "status.features && !status.features.includes('replace')", 10)
            stamp, server_before = await state(a, f"db.products.find(p => p.id === '{pid}').sharedPhoto"), on_server.read_bytes()
            await change_photo(a, PACK)
            await a.wait_for_selector('#toast.show', timeout=15000)
            await idle(a)
            await expect(
                await state(a, f"db.products.find(p => p.id === '{pid}').sharedPhoto") == stamp
                and on_server.read_bytes() == server_before
                and base64.b64decode(await file_on(a)) != server_before,
                'a server that cannot replace photos: a notice, the mark stays, only A has the new photo',
            )
            await close_sheet(a)
            await ctx_a.unroute(f'{srv.url}/api/info*')
            await a.evaluate("import('./js/sync.js').then(m => { m.status.features = null; return m.serverCan('replace'); })")
            await until_sync(a, "status.features && status.features.includes('replace')", 10)
            await expect(
                await state(b, '!db.servings[0].photo && !!(db.products.find(p => p.id === db.servings[0].productId) || {}).thumb'),
                'only the thumbnail is shared, on the food',
            )
            await block(ctx_a)
            fake.reply = {'brand': 'Felix', 'variety': 'So gut wie es aussieht', 'type': 'Nassfutter', 'animal': 'Katze'}
            await a.click('#fab')
            await idle(a)
            await a.set_input_files('#camInputSheet', str(PACK))
            await expect(await until(a, "['waiting', 'noserver'].includes(db.servings[0].status)", 6), 'server out of reach: the photo waits')
            await unblock(ctx_a, a)
            await expect(
                await until(a, "db.products.some(p => p.brand === 'Felix') && !db.servings[0].status", 10) and fake.calls == 2,
                'server back: recognised automatically',
            )
            await close_sheet(a)
            await expect(
                not any(k in r for r in srv.records()['servings'].values() for k in ('photo', 'status', 'error', 'scanCode')),
                'fields local to the phone stay there',
            )

            # Scanning: an unknown code with the lookup off goes to the camera; codes from two phones
            print('scanning')
            barcode_asked = []
            ctx_a.on('request', lambda r: barcode_asked.append(r.url) if '/api/barcode' in r.url else None)
            fake.reply = {'brand': 'Animonda', 'variety': 'Carny Rind', 'type': 'Nassfutter', 'animal': 'Katze'}
            await a.evaluate(
                f"window.__calls = []; window.__barcode = '{MISS}'; window.__photo = {json.dumps(base64.b64encode(PACK.read_bytes()).decode())}"
            )
            await a.click('#fab')
            await idle(a)
            await a.click('[data-action=scan]')
            hit = f"db.products.find(p => p.codes && p.codes['{MISS}'])"
            await expect(
                await until(a, f"({hit} || {{}}).brand === 'Animonda'", 12)
                and any(c[0] == 'capture' for c in await a.evaluate('window.__calls'))
                and not barcode_asked,
                'unknown code: straight to the camera, recognised, the code on the variety, no barcode request',
            )
            await expect(await until(b, f'!!{hit}', 8), 'the variety and its code reach B')
            await block(ctx_a)
            await run(a, f"{hit}.codes['{C1}'] = true; save();")
            await run(b, f"{hit}.codes['{C2}'] = true; save();")
            await until(b, 'queue.length === 0')
            await unblock(ctx_a, a)
            both = f"(p => p.codes['{C1}'] && p.codes['{C2}'] && p.codes['{MISS}'])({hit})"
            await expect(await until(a, both, 8) and await until(b, both, 8), 'codes added on two phones at once: all kept')
            pid = await state(a, f'{hit}.id')
            await a.evaluate(f"import('./js/ui/sheet.js').then(m => m.openSheet({{kind: 'product', id: '{pid}'}}))")
            await idle(a)
            await a.click(f'#sheet [data-action=remove-code][data-code="{C1}"]')
            gone = f"(p => !p.codes['{C1}'] && p.codes['{C2}'])(db.products.find(p => p.id === '{pid}'))"
            await expect(await until(b, gone, 6) and 'codes.' + C1 not in srv.records()['products'][pid], 'a removed code is gone everywhere')

            # The buy setting syncs like any field, back to automatic too
            def kauf(v):
                return "(p => p && %s)(db.products.find(p => p.id === '%s'))" % ("!('kaufen' in p)" if v is None else f"p.kaufen === '{v}'", pid)

            await a.click('#sheet [data-action=buy][data-v=immer]')
            await expect(
                await until(b, kauf('immer'), 6) and srv.records()['products'][pid].get('kaufen') == 'immer',
                '"always buy" reaches B and the server',
            )
            await a.click('#sheet [data-action=buy][data-v=auto]')
            await expect(
                await until(b, kauf(None), 6) and 'kaufen' not in srv.records()['products'][pid], 'back to automatic: the field is gone everywhere'
            )
            await close_sheet(a)

            # A new phone connects on its first start, syncs by hand, disconnects
            print('the server box')
            ctx_f = await new_phone()
            f, err_f = await open_page(ctx_f, url, native=True)
            PHONES['F'] = (f, err_f)
            await connect(f, CODE, srv.url.replace('http://', ''))
            await expect(
                await until(f, "state.epoch !== '' && db.pets.some(p => p.id === 'lxpet00001')") and await state(f, 'prefs.server') == srv.url,
                'first start: connected from the settings, the address works without http://',
            )
            await until_sync(f, "status.state === 'ok' && !status.busy")
            await idle(f)
            await expect(await f.locator('#serverBox [data-action=sync-now]').count() == 0, 'all synced: no button to sync')
            await block(ctx_f)
            await run(f, "db.servings[0].note = 'wartet'; save();")
            await f.wait_for_selector('#serverBox [data-action=sync-now]')
            await ctx_f.unroute(f'{srv.url}/**')  # reachable again, but nothing tells the phone
            await f.click('#serverBox [data-action=sync-now]')
            await expect(
                await until(f, 'queue.length === 0', 6) and await wait_js(f, "!document.querySelector('#serverBox [data-action=sync-now]')", 6),
                'a change waiting: synced by hand, then the button goes',
            )
            n = await state(f, 'db.servings.length')
            for _ in range(2):
                await f.click('#serverBox [data-then=disconnect]')
                await idle(f)
            await expect(
                await state(f, f"prefs.code === '' && db.servings.length === {n} && db.pets.length > 0")
                and await f.locator('#serverBox [data-action=connect-form]').count() == 1
                and await f.locator('#serverBox [data-then=disconnect]').count() == 0,
                'disconnected: the data stays, the page offers to connect again',
            )
            await f.click('#serverBox [data-action=connect-form]')
            await idle(f)
            await expect(await f.input_value('#f-server') == srv.url, 'connecting again: the last address is in the field')
            await expect(not real_errors(err_f), 'phone F: no console errors' + (f': {real_errors(err_f)}' if real_errors(err_f) else ''))
            del PHONES['F']
            await ctx_f.close()

            # A phone whose clock runs two hours fast
            print('special cases')
            ctx_c = await new_phone()
            await ctx_c.add_init_script('const _now = Date.now; Date.now = () => _now() + 2 * 3600e3;')
            c, _ = await open_page(ctx_c, url)
            await run(c, "db.pets.push({id: 'kiwipet00001', name: 'Kiwi', species: 'Vogel', photo: null, createdAt: Date.now()}); save();")
            await connect(c, CODE, srv.url)
            await expect(
                await until(c, "state.epoch !== '' && queue.length === 0", 10), 'a phone with a skewed clock: changes restamped and accepted'
            )
            kiwi = [x for x in srv.get('/api/changes?since=0')['records'] if x['r'] == 'kiwipet00001']
            skew = abs(int(kiwi[0]['f']['name']['t'][:13]) / 1000 - time.time()) if kiwi else 1e9
            await expect(skew < 120, f'the server’s clock counts (skew {skew:.0f} s)')
            kiwi = "db.pets.some(p => p.name === 'Kiwi')"
            await expect(await until(a, kiwi) and await until(b, kiwi), 'the third phone’s pet reaches the others')
            await ctx_c.close()

            # The server's state file unreadable: set aside, a new epoch, and the phones send everything again
            old = srv.get('/api/info')['epoch']
            await block(ctx_a)  # so the server can be seen empty before the phones send again
            await block(ctx_b)
            await srv.stop()
            (srv.dir / 'state.json').write_text('{kaputt')
            await restart()
            epoch = srv.get('/api/info')['epoch']
            await expect(
                epoch != old and not srv.get('/api/changes?since=0')['records'] and len(list(srv.dir.glob('state-unreadable-*.json'))) == 1,
                'unreadable state: kept aside, the server starts empty under a new epoch',
            )
            await unblock(ctx_a, a)
            await unblock(ctx_b, b)
            ok = await until(a, f"queue.length === 0 && state.epoch === '{epoch}'", 10)
            ok = await until(b, f"queue.length === 0 && state.epoch === '{epoch}'", 10) and ok
            names = {r.get('name') for r in srv.records()['pets'].values()}
            await expect(ok and {'Minka', 'Luna', 'Tiger II', 'Kiwi'} <= names, f'the phones send everything again ({sorted(names)})')

            # The checksum uncovers a gap
            await srv.stop()
            st = json.loads((srv.dir / 'state.json').read_text())
            luna = next((i for i, r in st['records']['pets'].items() if r['f'].get('name', {}).get('v') == 'Luna'), None)
            st['records']['pets'].pop(luna, None)
            (srv.dir / 'state.json').write_text(json.dumps(st))
            await restart()
            await a.reload()  # the app compares the checksum at start-up
            await expect(
                await until(a, "state.log.some(l => l.text.includes('checksum differs'))", 10)
                and await until(a, 'queue.length === 0', 10)
                and luna in srv.records()['pets'],
                'checksum differs: a full sync fills the gap',
            )

            # A new code on the server
            srv.cfg['code'] = NEW_CODE
            await asyncio.sleep(1.1)  # a new mtime, so the server rereads its config
            srv.write_config()
            await online(a)
            await expect(
                await until_sync(a, "status.kind === 'auth'") and await a.locator('#syncChip').is_visible(), 'a new code: a notice at the top'
            )
            await a.click('#syncChip')
            await idle(a)
            await connect(a, NEW_CODE.lower())
            await expect(
                await until(a, f"prefs.code === '{NEW_CODE}' && queue.length === 0", 10) and await a.locator('#syncChip').is_hidden(),
                'new code typed in: syncing carries on',
            )
            await online(b)
            await until_sync(b, "status.kind === 'auth'")
            await connect(b, NEW_CODE)
            await until(b, f"prefs.code === '{NEW_CODE}'", 10)

            # A server with a newer protocol
            ctx_d = await new_phone()

            async def newer(route):
                cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type'}
                if route.request.method == 'OPTIONS':
                    await route.fulfill(status=204, headers=cors)
                else:
                    await route.fulfill(headers=cors, json={'app': 'schmeckts', 'protocol': 2, 'auth': True, 'now': int(time.time() * 1000)})

            await ctx_d.route(f'{srv.url}/api/info*', newer)
            d, _ = await open_page(ctx_d, url)
            kind = await d.evaluate(
                f"import('./js/sync.js').then(m => m.checkServer('{NEW_CODE}', '{srv.url}').then(() => 'connected', e => e.kind))"
            )
            await expect(kind == 'protocol', f'a server with a newer protocol is refused ({kind})')
            await ctx_d.close()

            # Both phones and the server hold the same data
            print('final state')
            for pg in (a, b):
                await pg.evaluate("import('./js/sync.js').then(m => m.retrySync())")
            await until(a, 'queue.length === 0', 10)
            await until(b, 'queue.length === 0', 10)
            server = srv.get('/api/checksum?c=pets,products,servings,observations')
            sums = [await pg.evaluate("import('./js/store.js').then(m => m.checksum()).then(x => x.sum)") for pg in (a, b)]
            await expect(sums == [server['sum']] * 2, f'checksum: both phones match the server ({server["fields"]} fields)')
            pa, pb, ps = await a.evaluate(PROJECTION), await b.evaluate(PROJECTION), srv.records()
            await expect(pa == pb == ps, 'contents: both phones and the server are level')
            for name, errs in (('A', err_a), ('B', err_b)):
                bad = real_errors(errs)
                await expect(not bad, f'phone {name}: no console errors' + (f': {bad}' if bad else ''))
        finally:
            await browser.close()
            if srv.proc and srv.proc.poll() is None:
                await srv.stop()
            if failures:
                print('\nserver log:\n' + (srv.dir / 'server.log').read_text()[-3000:])
    print(f'\n{"All tests passed" if not failures else f"{len(failures)} tests failed"}')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    asyncio.run(main())
