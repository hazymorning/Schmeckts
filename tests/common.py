"""Gemeinsame Helfer für die Tests in Chromium (Playwright): Prüfen, App ausliefern, Handys öffnen, auf Zustände warten,
simulierte Android-Plugins mit einem Dateisystem, das Neuladen übersteht."""
import asyncio, functools, http.server, json, pathlib, re, sys, threading, time
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / 'app/www'
failures = []
SHOTS = ROOT / 'dist/test' if '--bilder' in sys.argv else None


PACK = ROOT / 'dist/test/packung.jpg'  # wird beim Start erzeugt


SHEBA, UPC = '4008429087455', '036000291452'  # gültige Testcodes, UPC-A wird zu 0036000291452

# Simulierte Android-Plugins. Das Dateisystem liegt in localStorage unter „__fs:“, damit es ein Neuladen
# (= App-Neustart) übersteht; auch geteilte Dateien im CACHE stehen dort, damit Tests ihren Inhalt lesen können. rename ersetzt das Ziel wie unter Linux. Aufrufe landen in window.__calls.
# Eine Datei aus einer anderen App (content://…) liefert convertFileSrc aus dem simulierten Dateisystem.
# Deep Links: window.__urlOpen({url}) löst appUrlOpen aus; steht beim Laden sessionStorage.__launchUrl, kommt das
# Ereignis wie beim Kaltstart sofort nach dem Anmelden (Capacitor hält es zurück). Das eigene Foto-Plugin
# liefert window.__photo (Base64) oder lehnt ab, wenn es fehlt. Der Barcode-Scanner (nur scan(), wie in der App)
# liefert window.__barcode oder bricht ab, window.__scanError lässt ihn scheitern. Mit window.__scanModule = false
# fehlt Googles Scanner-Modul, die Installation meldet sich dann nach kurzer Zeit als fertig.
# Benachrichtigungen (@capacitor/local-notifications): Geplantes liegt in localStorage.__notes und übersteht so ein Neuladen.
# Die Erlaubnis steht in localStorage.__notifyPermission (sonst „prompt“), die Antwort auf die Nachfrage in
# localStorage.__notifyAnswer (sonst „granted“). Ein Tipp: window.__tapNote({actionId: 'tap', notification}); steht beim
# Laden sessionStorage.__launchNote, kommt er wie beim Kaltstart sofort nach dem Anmelden.
NATIVE = """
window.__calls = []; window.__back = null; window.__urlOpen = null;
const rec = name => arg => { window.__calls.push([name, arg ?? null]);
  return Promise.resolve({getInfo: {version: '9.9.9'}}[name]); };
const key = p => '__fs:' + p, missing = () => Promise.reject(new Error('File does not exist.'));
const notes = () => JSON.parse(localStorage.getItem('__notes') || '[]'), setNotes = l => localStorage.setItem('__notes', JSON.stringify(l));
const others = list => notes().filter(n => !list.some(x => x.id === n.id));
const LocalNotifications = {
  checkPermissions: () => Promise.resolve({display: localStorage.getItem('__notifyPermission') || 'prompt'}),
  requestPermissions: () => { window.__calls.push(['requestPermissions', null]); const display = localStorage.getItem('__notifyAnswer') || 'granted';
    localStorage.setItem('__notifyPermission', display); return Promise.resolve({display}); },
  schedule: ({notifications}) => { const list = JSON.parse(JSON.stringify(notifications)); window.__calls.push(['schedule', list]);  // Datum als Text, wie über die Brücke
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
  readdir: ({directory}) => Promise.resolve({files: directory === 'CACHE' ? (window.__cache || []).map(name => ({name})) : []}),
  stat: ({path}) => localStorage.getItem(key(path)) == null ? missing() : Promise.resolve({type: 'file'})
};
window.Capacitor = {isNativePlatform: () => true,
  convertFileSrc: uri => { const v = localStorage.getItem(key(String(uri).split('/').pop()));   // Datei aus einer anderen App
    return v == null ? uri : 'data:application/json;charset=utf-8,' + encodeURIComponent(v); },
  Plugins: {
  Haptics: {impact: rec('impact')}, SystemBars: {setStyle: rec('setStyle')},
  App: {addListener: (e, fn) => { if (e === 'backButton') window.__back = fn;
        if (e === 'appUrlOpen') { window.__urlOpen = fn; const u = sessionStorage.getItem('__launchUrl'); if (u) fn({url: u}); } },
        getInfo: rec('getInfo'), minimizeApp: rec('minimize')},
  Foto: {aufnehmen: o => { window.__calls.push(['aufnehmen', o ?? null]);
    return window.__photo ? Promise.resolve({base64: window.__photo}) : Promise.reject(new Error('abgebrochen')); }},
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
    return new Promise(done => setTimeout(() => done({text: window.__ocrText || '', blocks: []}), window.__ocrDelay || 0)); }},
  Filesystem, LocalNotifications, Share: {share: rec('share')}}, registerPlugin: name => window.Capacitor.Plugins[name]};
"""

# Farbe als sRGB „rgb(r, g, b)“, auch wenn sie als oklch() gesetzt ist: über ein Canvas, so wie der Bildschirm sie zeigt
RGB = """(c => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d', {willReadFrequently: true});
  x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; })"""

# Ein Handy, das schon benutzt wird: ein Tier, eine Sorte, drei bewertete Mahlzeiten
SAVED = {'version': 3,
          'pets': [{'id': 'lxpet00001', 'name': 'Minka', 'species': 'Katze', 'photo': None, 'createdAt': 1750000000000}],
          'products': [{'id': 'lxprod0001', 'brand': 'Sheba', 'variety': 'Lachs', 'type': 'Nassfutter', 'animal': 'Katze',
                        'thumb': None, 'lastPets': ['lxpet00001'], 'createdAt': 1750000000000}],
          'servings': [{'id': f'lxserv000{i}', 'productId': 'lxprod0001', 'servedAt': 1750000000000 + i * 864e5,
                        'pets': {'lxpet00001': {'r': 'gut', 'at': 1750000000000 + i * 864e5 + 3600e3}}, 'note': ''} for i in range(3)]}


def check(cond, text):
    print(('  ok   ' if cond else '  FEHLER ') + text)
    if not cond:
        failures.append(text)
    return cond


def serve():
    """Liefert app/www aus, gibt die Adresse von index.html zurück."""
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(WWW))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{srv.server_port}/index.html'


def real_errors(errors):
    """Konsolenfehler ohne die erwartbaren Netzwerkmeldungen (Server absichtlich aus, falscher Code)."""
    return [e for e in errors if 'Failed to load resource' not in e and 'net::ERR_' not in e
            and 'EventSource' not in e]


# Die Tests rufen die Module der App über import() in evaluate auf. Chromiums Inspektor hält das Versprechen, auf das
# evaluate wartet, nur schwach: Läuft gerade die Speicherbereinigung (viele Daten, eben neu geladen), sammelt sie es
# gelegentlich ein (CDP „Promise was collected“, bei Playwright „Execution context was destroyed“). Deshalb wartet hier
# nicht der Inspektor: Die Seite legt das Ergebnis ab (window.__out), der Test fragt es ab. Ausdruck oder Funktion, wie bei Playwright.
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
    """Neue Seite in einem Browser-Kontext (= ein Handy). Gibt Seite und Fehlerliste zurück.
    choose: beim ersten Start gleich „Nur auf diesem Handy“ wählen, so beginnen die meisten Tests."""
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
    """Wertet expr mit db, prefs, queue und state aus store.js aus."""
    return await pg.evaluate(f"import('./js/store.js').then(({{db, prefs, queue, state}}) => {expr})")


async def until(pg, expr, timeout=10.0):
    """Wartet, bis expr (mit db, prefs, queue, state) wahr ist. Gibt zurück, ob das geklappt hat."""
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while loop.time() < end:
        if await state(pg, expr):
            return True
        await asyncio.sleep(.1)
    return False


async def shot(pg, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        await pg.screenshot(path=str(SHOTS / f'{name}.png'))


async def phone(browser, scheme='light', touch=False, motion=False, **kw):
    """Ein Handy als Browser-Kontext. Ohne motion läuft die App mit reduzierter Bewegung, so wartet kein Ablauf auf Animationen."""
    return await browser.new_context(viewport={'width': 400, 'height': 860}, color_scheme=scheme, has_touch=touch,
                                     **{'reduced_motion': 'no-preference' if motion else 'reduce', **kw})


def rgb_of(hexv):
    return tuple(int(hexv[i:i + 2], 16) for i in (1, 3, 5))


def near(rgb, hexv, tol=2):
    """rgb(…) aus dem Browser entspricht #RRGGBB bis auf Rundung"""
    got = [int(x) for x in re.findall(r'\d+', rgb)[:3]]
    return all(abs(a - b) <= tol for a, b in zip(got, rgb_of(hexv)))


def contrast(a, b):
    def lum(c):
        r, g, b_ = [int(x) / 255 for x in re.findall(r'\d+', c)[:3]] if isinstance(c, str) else [v / 255 for v in c]
        f = lambda v: v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
        return .2126 * f(r) + .7152 * f(g) + .0722 * f(b_)
    la, lb = lum(a), lum(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)


def make_photo():
    from PIL import Image, ImageDraw  # eine schlichte „Packung“ als Testfoto
    PACK.parent.mkdir(parents=True, exist_ok=True)
    im = Image.new('RGB', (480, 360), (214, 120, 60))
    ImageDraw.Draw(im).rectangle((60, 90, 420, 270), fill=(250, 240, 225))
    im.save(PACK, quality=70)


def make_pictures():
    """Testfotos: vier Felder (rot, grün, blau, gelb) für den Zuschnitt, dazu einfarbige fürs Album, eins davon groß"""
    from PIL import Image
    out = PACK.parent
    quad = Image.new('RGB', (800, 400))
    for (x, y), color in {(0, 0): (220, 30, 30), (400, 0): (30, 160, 60), (0, 200): (30, 60, 220), (400, 200): (230, 210, 40)}.items():
        quad.paste(Image.new('RGB', (400, 200), color), (x, y))
    quad.save(out / 'felder.png')
    files = []
    for i in range(10):
        f = out / f'album{i}.jpg'
        Image.new('RGB', (2400, 1200) if i == 0 else (300, 200), (25 * i, 255 - 25 * i, 120)).save(f, quality=80)
        files.append(str(f))
    Image.new('RGB', (64, 64), (0, 0, 0)).save(out / 'schwarz.png')
    Image.new('RGB', (64, 64), (255, 255, 255)).save(out / 'weiss.png')
    return files


async def seeded(browser, url, files, scheme='light', native=False):
    """Handy mit vorhandenen Daten: files = {name: inhalt} für db, prefs … (im Browser localStorage, in der App Dateien)"""
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
    await pg.evaluate(f"import('./js/store.js').then(m => {{ m.prefs.theme = '{theme}'; return import('./js/ui/theme.js'); }}).then(t => t.applyTheme())")
    await idle(pg)


# Ruhe: keine laufenden Übergänge (Sheet, Karten, Toast); endlose Animationen wie der Spinner zählen nicht
SETTLED = """!document.querySelector('.animating, .closing, :active-view-transition') && document.getAnimations().every(a =>
  a.playState !== 'running' || a.effect.getComputedTiming().iterations === Infinity)"""


async def idle(pg, timeout=3.0):
    """Wartet, bis die Oberfläche zweimal hintereinander ruhig ist. Fragt von außen, läuft also auch mit gestellter Uhr."""
    end, calm = asyncio.get_running_loop().time() + timeout, 0
    while calm < 2 and asyncio.get_running_loop().time() < end:
        calm = calm + 1 if await pg.evaluate(SETTLED) else 0
        await asyncio.sleep(.02)


async def debounced(pg):
    """Lässt gebündelte Arbeit sofort ablaufen (Speicher meldet Änderungen, Erinnerungen gleichen ab). Braucht ctx.clock.install()."""
    await pg.clock.run_for(1000)
    await idle(pg)


async def started(pg):
    """Wartet, bis die App geladen und die Startseite gezeichnet ist."""
    await pg.wait_for_function("document.querySelector('#home')?.childElementCount > 0 || !!document.querySelector('.welcome')")
    await idle(pg)


def run_tests(tests, camera=()):
    """Führt die Tests aus, auf Wunsch nur die auf der Kommandozeile genannten. camera: Namen der Tests, die einen
    Chromium mit simuliertem Kameragerät brauchen."""
    async def main():
        only = [a for a in sys.argv[1:] if not a.startswith('--')]
        make_photo()
        url = serve()
        async with async_playwright() as p:
            for flags in ([], ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']):
                names = [n for n in tests if (n in camera) == bool(flags) and (not only or n in only)]
                if not names:
                    continue
                browser = await p.chromium.launch(args=flags)
                for name in names:
                    began = time.monotonic()
                    try:
                        await tests[name](browser, url)
                    except Exception as e:
                        check(False, f'{name} abgebrochen: {" ".join(str(e).split())[:160]} … {" ".join(str(e).split())[-260:]}')
                    print(f'  {name}: {time.monotonic() - began:.1f} s')
                await browser.close()
        print(f'\n{"Alle Tests bestanden" if not failures else f"{len(failures)} Tests fehlgeschlagen"}')
        sys.exit(1 if failures else 0)
    asyncio.run(main())
