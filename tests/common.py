"""Shared helpers for the tests in Chromium (Playwright): checking, serving the app, opening phones, waiting for
states, simulated Android plugins with a file system that survives a reload."""

import asyncio
import contextvars
import functools
import http.server
import io
import json
import pathlib
import re
import sys
import threading
import time
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / 'app/www'
failures = []
SHOTS = ROOT / 'dist/test' if '--shots' in sys.argv else None


PACK = ROOT / 'dist/test/package.jpg'  # created at start-up


SHEBA, UPC = '4008429087455', '036000291452'  # valid test codes; UPC-A becomes 0036000291452

# Simulated Android plugins. The file system sits in localStorage under "__fs:" so that it survives a reload
# (= an app restart); shared files in the CACHE live there too, so tests can read their contents. rename replaces
# the target as it does on Linux. Calls end up in window.__calls.
# A file from another app (content://…) is served by convertFileSrc out of the simulated file system.
# Deep links: window.__urlOpen({url}) fires appUrlOpen; if sessionStorage.__launchUrl is set at load time, the
# event arrives right after the listener registers, as on a cold start (Capacitor holds it back). Our own photo
# plugin returns window.__photo (base64) or rejects when it is missing. The barcode scanner (scan() only, as in the
# app) returns window.__barcode or cancels; window.__scanError makes it fail. With window.__scanModule = false
# Google's scanner module is missing and the installation reports itself finished after a moment.
# Notifications (@capacitor/local-notifications): what is scheduled lives in localStorage.__notes and so survives a
# reload. The permission is in localStorage.__notifyPermission (otherwise "prompt"), the answer to the request in
# localStorage.__notifyAnswer (otherwise "granted"). A tap: window.__tapNote({actionId: 'tap', notification}); if
# sessionStorage.__launchNote is set at load time, it arrives right after the listener registers, as on a cold start.
NATIVE = """
window.__calls = []; window.__back = null; window.__urlOpen = null;
// How often the home page has been written: the splash should go after exactly one drawing of it
window.__draws = 0;
new MutationObserver(ms => { for (const m of ms) if (m.target.id === 'home') window.__draws++; })
  .observe(document, {childList: true, subtree: true});   // document: <html> may not exist yet at this point
const rec = name => arg => { window.__calls.push([name, arg ?? null]);
  return Promise.resolve({getInfo: {version: '9.9.9'}}[name]); };
const key = p => '__fs:' + p, missing = () => Promise.reject(new Error('File does not exist.'));
const notes = () => JSON.parse(localStorage.getItem('__notes') || '[]'), setNotes = l => localStorage.setItem('__notes', JSON.stringify(l));
const others = list => notes().filter(n => !list.some(x => x.id === n.id));
const LocalNotifications = {
  checkPermissions: () => Promise.resolve({display: localStorage.getItem('__notifyPermission') || 'prompt'}),
  requestPermissions: () => { window.__calls.push(['requestPermissions', null]); const display = localStorage.getItem('__notifyAnswer') || 'granted';
    localStorage.setItem('__notifyPermission', display); return Promise.resolve({display}); },
  schedule: ({notifications}) => { const list = JSON.parse(JSON.stringify(notifications)); window.__calls.push(['schedule', list]);  // the date as text, as it comes over the bridge
    setNotes([...others(list), ...list]); return Promise.resolve({notifications: list.map(n => ({id: n.id}))}); },
  cancel: ({notifications}) => { window.__calls.push(['cancelNotes', notifications]); setNotes(others(notifications)); return Promise.resolve(); },
  getPending: () => Promise.resolve({notifications: notes()}),
  addListener: (e, fn) => { if (e === 'localNotificationActionPerformed') { window.__tapNote = fn; const t = sessionStorage.getItem('__launchNote'); if (t) fn(JSON.parse(t)); }
    return Promise.resolve({remove: () => {}}); }
};
const Filesystem = {
  readFile: ({path}) => { const v = localStorage.getItem(key(path)); return v == null ? missing() : Promise.resolve({data: v}); },
  writeFile: ({path, data, directory}) => { window.__calls.push(['writeFile', {path, directory}]);
    if (directory === 'CACHE' && !(window.__cache ||= []).includes(path)) window.__cache.push(path);
    localStorage.setItem(key(path), data); return Promise.resolve({uri: 'file:///' + directory + '/' + path}); },
  rename: ({from, to}) => { window.__calls.push(['rename', {from, to}]); const v = localStorage.getItem(key(from));
    if (v == null) return missing(); localStorage.setItem(key(to), v); localStorage.removeItem(key(from)); return Promise.resolve(); },
  deleteFile: ({path, directory}) => { window.__calls.push(['deleteFile', {path, directory}]); localStorage.removeItem(key(path));
    window.__cache = (window.__cache || []).filter(n => n !== path); return Promise.resolve(); },
  readdir: ({path, directory}) => { const at = key(path ? path + '/' : '');
    return Promise.resolve({files: directory === 'CACHE' ? (window.__cache || []).map(name => ({name}))
      : Object.keys(localStorage).filter(k => k.startsWith(at) && !k.slice(at.length).includes('/')).map(k => ({name: k.slice(at.length)}))}); },
  stat: ({path}) => localStorage.getItem(key(path)) == null ? missing() : Promise.resolve({type: 'file'})
};
window.Capacitor = {isNativePlatform: () => true,
  convertFileSrc: uri => { const v = localStorage.getItem(key(String(uri).split('/').pop()));   // a file from another app
    return v == null ? uri : 'data:application/json;charset=utf-8,' + encodeURIComponent(v); },
  Plugins: {
  Haptics: {impact: rec('impact')}, SystemBars: {setStyle: rec('setStyle')},
  // The splash screen the app holds up itself: hide() records what the page looked like at that moment, so a
  // test can see it went only once the home page was drawn and both typefaces were there.
  SplashScreen: {hide: o => { window.__calls.push(['hideSplash', {...(o ?? {}),
      drawn: (document.querySelector('#home')?.childElementCount > 0) || !!document.querySelector('.welcome'), draws: window.__draws,
      fonts: document.fonts.check('1em "Figtree"') && document.fonts.check('1em "Faustina"')}]);
    return Promise.resolve(); }, show: rec('showSplash')},
  App: {addListener: (e, fn) => { if (e === 'backButton') window.__back = fn;
        if (e === 'appUrlOpen') { window.__urlOpen = fn; const u = sessionStorage.getItem('__launchUrl'); if (u) fn({url: u}); } },
        getInfo: rec('getInfo'), minimizeApp: rec('minimize')},
  Photo: {capture: o => { window.__calls.push(['capture', o ?? null]);
    return window.__photo ? Promise.resolve({base64: window.__photo}) : Promise.reject(new Error('cancelled')); }},
  BarcodeScanner: {
    isGoogleBarcodeScannerModuleAvailable: () => Promise.resolve({available: window.__scanModule !== false}),
    installGoogleBarcodeScannerModule: () => { window.__calls.push(['installModule', null]);
      setTimeout(() => { window.__scanModule = true; (window.__scanListeners || []).forEach(fn => fn({state: 4, progress: 100})); }, 700);
      return Promise.resolve(); },
    addListener: (e, fn) => { (window.__scanListeners ||= []).push(fn);
      return Promise.resolve({remove: () => { window.__scanListeners = window.__scanListeners.filter(f => f !== fn); }}); },
    scan: o => { window.__calls.push(['scan', o ?? null]); const c = window.__barcode;
      if (window.__scanError) return Promise.reject(new Error(window.__scanError));
      return c ? Promise.resolve({barcodes: [{rawValue: c, format: c.length === 12 ? 'UPC_A' : 'EAN_13'}]}) : Promise.reject(new Error('scan canceled.')); }},
  TextRecognition: {processImage: o => { window.__calls.push(['processImage', o ?? null]);
    if (window.__ocrError) return Promise.reject(new Error(window.__ocrError));
    return new Promise(done => setTimeout(() => { window.__ocrDone = (window.__ocrDone || 0) + 1; done({text: window.__ocrText || '', blocks: []}); }, window.__ocrDelay || 0)); }},
  Filesystem, LocalNotifications, Share: {share: rec('share')}}, registerPlugin: name => window.Capacitor.Plugins[name]};
"""

# Layout shifts while the page is being built: entries with no tap or key behind them.
# Started before the app's own module, so nothing is missed.
SHIFTS = """
window.__shifts = [];
new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push(e.value); })
  .observe({type: 'layout-shift', buffered: true});
"""

# Android's system font size, simulated: it multiplies every font size the app sets. This re-declares the text
# styles (--type-*) and every px font size from the style sheets, scaled, as !important.
BIG_TEXT = """k => { const s = document.createElement('style'), rules = [...document.styleSheets].flatMap(x => [...x.cssRules]);
  const px = v => v.replace(/([\\d.]+)px/g, (_, n) => `${(parseFloat(n) * k).toFixed(2)}px`);
  const types = rules.filter(r => r.selectorText === ':root').flatMap(r => [...r.style].filter(p => p.startsWith('--type-'))
    .map(p => `${p}:${px(r.style.getPropertyValue(p))} !important`));
  s.textContent = `:root{${types.join(';')}}` + rules
    .filter(r => r.style && r.style.fontSize && r.style.fontSize.endsWith('px'))
    .map(r => `${r.selectorText}{font-size:${(parseFloat(r.style.fontSize) * k).toFixed(2)}px !important}`).join('');
  document.head.append(s); }"""

# A colour as sRGB "rgb(r, g, b)", even when set as oklch(): through a canvas, the way the screen shows it
RGB = """(c => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d', {willReadFrequently: true});
  x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; })"""

# A phone already in use: one pet, one variety, three rated meals
SAVED = {
    'version': 3,
    'pets': [{'id': 'lxpet00001', 'name': 'Minka', 'species': 'Katze', 'photo': None, 'createdAt': 1750000000000}],
    'products': [
        {
            'id': 'lxprod0001',
            'brand': 'Sheba',
            'variety': 'Lachs',
            'type': 'Nassfutter',
            'animal': 'Katze',
            'thumb': None,
            'lastPets': ['lxpet00001'],
            'createdAt': 1750000000000,
        }
    ],
    'servings': [
        {
            'id': f'lxserv000{i}',
            'productId': 'lxprod0001',
            'servedAt': 1750000000000 + i * 864e5,
            'pets': {'lxpet00001': {'r': 'gut', 'at': 1750000000000 + i * 864e5 + 3600e3}},
            'note': '',
        }
        for i in range(3)
    ],
}


# Tests run at the same time (run_tests), so each one collects its output and its phones for itself.
# Both live in a context variable, which every task inherits a copy of.
written = contextvars.ContextVar('written', default=None)  # the running test's output
phones = contextvars.ContextVar('phones', default=None)  # its open browser contexts


class PerTestOutput(io.TextIOBase):
    """Keeps the output of tests running side by side apart, so the log stays readable: every test's lines are
    collected and written out in one piece when it is done. Anything printed outside a test goes straight through."""

    def __init__(self, real):
        self.real = real

    def write(self, s):
        out = written.get()
        if out is None:
            return self.real.write(s)
        out.append(s)
        return len(s)

    def flush(self):
        self.real.flush()


def check(cond, text):
    print(('  ok   ' if cond else '  FAIL ') + text)
    if not cond:
        failures.append(text)
    return cond


def serve():
    """Serves app/www and returns the address of index.html."""

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=str(WWW))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{srv.server_port}/index.html'


def real_errors(errors):
    """Console errors without the expected network messages (server deliberately off, wrong code)."""
    return [e for e in errors if 'Failed to load resource' not in e and 'net::ERR_' not in e and 'EventSource' not in e]


# The tests reach the app's modules through import() inside evaluate. Chromium's inspector holds the promise that
# evaluate waits on only weakly: while garbage collection runs (lots of data, just reloaded) it occasionally collects
# it (CDP "Promise was collected", "Execution context was destroyed" in Playwright). So the page stores the result
# (window.__out) and the test asks for it instead of leaving the inspector to wait. Expression or function, as in
# Playwright.
CALL = """a => { const v = (EXPR), id = Math.random().toString(36).slice(2), out = (window.__out ||= {})[id] = {};
  Promise.resolve(typeof v === 'function' ? v(a) : v).then(value => { out.value = value; out.done = true; }, e => { out.error = String(e?.stack || e); out.done = true; });
  return id; }"""


def keep_promises(pg):
    plain = pg.evaluate

    async def evaluate(expression, arg=None):
        if 'import(' not in expression:
            return await plain(expression, arg)
        key = await plain(CALL.replace('EXPR', expression), arg)
        await pg.wait_for_function('id => window.__out[id].done', arg=key)
        out = await plain('id => { const o = window.__out[id]; delete window.__out[id]; return o; }', key)
        if 'error' in out:
            raise RuntimeError(out['error'])
        return out.get('value')

    pg.evaluate = evaluate


async def open_page(ctx, url, scheme='light', native=False, choose=True):
    """A new page in a browser context (= one phone). Returns the page and the list of errors.
    choose: pick „Nur auf diesem Handy“ right at the first start, which is how most tests begin."""
    pg = await ctx.new_page()
    keep_promises(pg)
    pg.set_default_timeout(8000)
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    if native:
        await pg.add_init_script(NATIVE)
    await pg.goto(url)
    await started(pg)
    if choose and await pg.locator('.welcome [data-action=mode-local]').count():
        await pg.click('.welcome [data-action=mode-local]')
        await idle(pg)
    return pg, errors


async def state(pg, expr):
    """Evaluates expr with db, prefs, queue and state from store.js."""
    return await pg.evaluate(f"import('./js/store.js').then(({{db, prefs, queue, state}}) => {expr})")


async def until(pg, expr, timeout=10.0):
    """Waits until expr (with db, prefs, queue, state) is true. Returns whether that worked."""
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while loop.time() < end:
        if await state(pg, expr):
            return True
        await asyncio.sleep(0.1)
    return False


async def shot(pg, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        await pg.screenshot(path=str(SHOTS / f'{name}.png'))


async def phone(browser, scheme='light', touch=False, motion=False, width=400, height=860, **kw):
    """One phone as a browser context, and the only place the tests make one: that way run_tests can see that
    every phone belongs to exactly one test and is closed again before the next one starts.
    Without motion the app runs under reduced motion, so no flow waits on animations."""
    ctx = await browser.new_context(
        viewport={'width': width, 'height': height},
        color_scheme=scheme,
        has_touch=touch,
        **{'reduced_motion': 'no-preference' if motion else 'reduce', **kw},
    )
    mine = phones.get()
    if mine is not None:
        mine.append(ctx)
        ctx.on('close', lambda _: mine.remove(ctx) if ctx in mine else None)
    return ctx


def rgb_of(hexv):
    return tuple(int(hexv[i : i + 2], 16) for i in (1, 3, 5))


def near(rgb, hexv, tol=2):
    """rgb(…) from the browser matches #RRGGBB up to rounding"""
    got = [int(x) for x in re.findall(r'\d+', rgb)[:3]]
    return all(abs(a - b) <= tol for a, b in zip(got, rgb_of(hexv)))


def contrast(a, b):
    def lum(c):
        r, g, b_ = [int(x) / 255 for x in re.findall(r'\d+', c)[:3]] if isinstance(c, str) else [v / 255 for v in c]

        def lin(v):
            return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b_)

    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def make_photo():
    from PIL import Image, ImageDraw  # a plain "packaging" as the test photo

    PACK.parent.mkdir(parents=True, exist_ok=True)
    im = Image.new('RGB', (480, 360), (214, 120, 60))
    ImageDraw.Draw(im).rectangle((60, 90, 420, 270), fill=(250, 240, 225))
    im.save(PACK, quality=70)


_pictures = []


def make_pictures():
    """Test photos: four quadrants (red, green, blue, yellow) for cropping, plus two plain ones.
    Written once: several tests ask for them, and running side by side they must not write over each other."""
    from PIL import Image

    if _pictures:
        return list(_pictures)
    out = PACK.parent
    quad = Image.new('RGB', (800, 400))
    for (x, y), color in {(0, 0): (220, 30, 30), (400, 0): (30, 160, 60), (0, 200): (30, 60, 220), (400, 200): (230, 210, 40)}.items():
        quad.paste(Image.new('RGB', (400, 200), color), (x, y))
    quad.save(out / 'quadrants.png')
    files = []
    for i in range(2):
        f = out / f'photo{i}.jpg'
        Image.new('RGB', (300, 200), (25 * i, 255 - 25 * i, 120)).save(f, quality=80)
        files.append(str(f))
    return files


async def seeded(browser, url, files, scheme='light', native=False):
    """A phone with existing data: files = {name: content} for db, prefs … (localStorage in the browser, files in the app)"""
    ctx = await phone(browser, scheme)
    seed = await ctx.new_page()
    await seed.goto(url)
    keys = {'db': 'schmeckts-v3', 'prefs': 'schmeckts-prefs'}
    for name, data in files.items():
        key = f'__fs:{name}.json' if native else keys[name]
        await seed.evaluate('([k, v]) => localStorage.setItem(k, v)', [key, json.dumps(data)])
    await seed.close()
    pg, errors = await open_page(ctx, url, native=native, choose=False)
    return ctx, pg, errors


async def set_theme(pg, theme):
    await pg.evaluate(
        f"import('./js/store.js').then(m => {{ m.prefs.theme = '{theme}'; return import('./js/ui/theme.js'); }}).then(t => t.applyTheme())"
    )
    await idle(pg)


# Calm: no transitions running (sheet, cards, toast); endless animations such as the spinner do not count
SETTLED = """!document.querySelector('.animating, .closing, :active-view-transition') && document.getAnimations().every(a =>
  a.playState !== 'running' || a.effect.getComputedTiming().iterations === Infinity)"""

# The same condition, waited for inside the page: on the animations themselves (animation.finished) instead of
# asking from the outside every 20 ms, which cost a round trip each time. Two frames at the end, as before, so
# that anything the last frame started is counted too. A run of BLIND ms covers what has no animation object yet:
# an element already marked .animating or .closing, or a view transition about to begin.
IDLE = (
    """async ms => { const quiet = () => """
    + SETTLED
    + """;
  const deadline = performance.now() + ms, BLIND = 50;
  const frame = () => new Promise(done => requestAnimationFrame(() => done()));
  const moving = () => document.getAnimations().filter(a => a.playState === 'running'
    && a.effect.getComputedTiming().iterations !== Infinity);
  for (;;) {
    while (!quiet()) {
      if (performance.now() > deadline) return false;
      const list = moving();
      if (list.length) await Promise.race([Promise.allSettled(list.map(a => a.finished)), new Promise(d => setTimeout(d, BLIND))]);
      else await frame();
    }
    await frame();
    await frame();
    if (quiet()) return true;
  } }"""
)


async def fixed_clock(ctx, **kw):
    """ctx.clock.install(), marked on the context so idle() can see it: with the clock installed the frames stand
    still, so waiting for them inside the page would never return."""
    await ctx.clock.install(**kw)
    ctx.schmeckts_fixed_clock = True


async def idle(pg, timeout=3.0):
    """Waits until the interface is calm: no marked movement and no finite animation running."""
    if getattr(pg.context, 'schmeckts_fixed_clock', False):
        end, calm = asyncio.get_running_loop().time() + timeout, 0
        while calm < 2 and asyncio.get_running_loop().time() < end:
            calm = calm + 1 if await pg.evaluate(SETTLED) else 0
            await asyncio.sleep(0.02)
        return
    await pg.evaluate(IDLE, int(timeout * 1000))


async def debounced(pg):
    """Lets batched work run at once (the store reports changes, the reminders reconcile). Needs fixed_clock()."""
    await pg.clock.run_for(1000)
    await idle(pg)


async def started(pg):
    """Waits until the app has loaded and the home page is drawn."""
    await pg.wait_for_function("document.querySelector('#home')?.childElementCount > 0 || !!document.querySelector('.welcome')")
    await idle(pg)


PARALLEL = 4  # independent tests at the same time, each on phones of its own; --serial runs them one by one


def run_tests(tests, camera=()):
    """Runs the tests, or only those named on the command line. Tests run at the same time, at most PARALLEL of
    them; --serial runs them one after another. Nothing is shared but the local web server and the test photo,
    both read-only, so the order makes no difference, which is what the check per test confirms.
    camera: names of the tests that need a Chromium with a simulated camera device."""

    async def one(name, browser, url, slots):
        """Runs one test with its output and its phones to itself."""
        out, mine = [], []
        written.set(out)
        phones.set(mine)
        async with slots:
            began = time.monotonic()  # the test's own time, not the wait for a free slot
            try:
                await tests[name](browser, url)
            except Exception as e:
                check(False, f'{name} aborted: {" ".join(str(e).split())[:160]} … {" ".join(str(e).split())[-260:]}')
            check(not mine, f'{name}: every phone closed again, so nothing of it reaches the tests beside it')
        print(f'  {name}: {time.monotonic() - began:.1f} s')
        return out

    async def main():
        only = [a for a in sys.argv[1:] if not a.startswith('--')]
        slots = asyncio.Semaphore(1 if '--serial' in sys.argv else PARALLEL)
        make_photo()
        url = serve()
        sys.stdout = PerTestOutput(sys.stdout)
        try:
            async with async_playwright() as p:
                for flags in ([], ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']):
                    names = [n for n in tests if (n in camera) == bool(flags) and (not only or n in only)]
                    if not names:
                        continue
                    browser = await p.chromium.launch(args=flags)
                    running = [asyncio.create_task(one(n, browser, url, slots)) for n in names]
                    for task in running:  # in the order they are declared, so the log reads the same every time
                        sys.stdout.real.write(''.join(await task))
                    await browser.close()
        finally:
            sys.stdout = sys.stdout.real
        print(f'\n{"All tests passed" if not failures else f"{len(failures)} tests failed"}')
        sys.exit(1 if failures else 0)

    asyncio.run(main())
