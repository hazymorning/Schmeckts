#!/usr/bin/env python3
"""Gestaltungsregeln aus PROJEKT.md: Palette und Kontraste, Schriften, Logo, Animationen, jede Ansicht in Hell und Dunkel.
Aufruf: python3 tests/design_test.py [name …]"""
import contextlib, io, json, pathlib, re, sys, tempfile
import xml.etree.ElementTree as ET
from common import RGB, ROOT, WWW, check, contrast, idle, make_pictures, near, open_page, phone, run_tests, set_theme, shot

PALETTE = {
    '--bg': ('#F4F0EC', '#191513'), '--surface': ('#FCFAF7', '#231E1B'), '--surface-2': ('#E8E2DB', '#302A27'),
    '--ink': ('#2E2724', '#EBE7E2'), '--muted': ('#6C615A', '#B2A9A1'), '--faint': ('#A0958C', '#7C726B'),
    '--line': ('#D8CFC7', '#403935'), '--accent': ('#965E4B', '#C78F7A'), '--accent-ink': ('#7F4C3A', '#C78F7A'),
    '--accent-soft': ('#F9E0D7', '#422920'), '--on-accent': ('#FFFFFF', '#191513'),
    '--good': ('#4F725F', '#97BBAA'), '--good-soft': ('#DBE0DA', '#363731'), '--mid': ('#997238', '#DBB87E'),
    '--mid-soft': ('#E8DED0', '#43392D'), '--sauce': ('#7C5B45', '#BD9E86'), '--sauce-soft': ('#E2D8D1', '#3E352E'),
    '--bad': ('#823B4E', '#D88095'), '--bad-soft': ('#EADADA', '#3D2C2C')}


PALETTE_HEX = {v for pair in PALETTE.values() for v in pair}


DERIVED = ('--seg-on', '--toast-action')  # abgeleitet, deckend


RATING = ('--good', '--mid', '--sauce', '--bad')


TEXT_PAIRS = [(fg, bg) for fg in ('--ink', '--muted', '--accent-ink') for bg in ('--bg', '--surface', '--surface-2')] + [
    ('--on-accent', '--accent'), ('--on-accent', '--bad'), ('--ink', '--seg-on'), ('--bg', '--ink'), ('--toast-action', '--ink'),
    ('--accent-ink', '--accent-soft'), ('--bad', '--bad-soft'), ('--bad', '--surface')] + [('--ink', r + '-soft') for r in RATING]


ICON_PAIRS = [(r, bg) for r in RATING for bg in ('--bg', '--surface', '--surface-2', r + '-soft')]


TOKENS = """(names) => { const rgb = """ + RGB + """, out = {};
  for (const n of names) { const i = document.createElement('i'); i.style.color = `var(${n})`; document.body.append(i); out[n] = rgb(getComputedStyle(i).color); i.remove(); }
  return out; }"""


async def test_palette(browser, url):
    print('Farbkonzept: feste Palette ohne Auswahl, abgeleitete Tokens, Kontraste')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    await pg.click('[data-action=close]'); await idle(pg)
    names = list(PALETTE) + list(DERIVED)
    for theme, k in (('light', 0), ('dark', 1)):
        await set_theme(pg, theme)
        c = await pg.evaluate(TOKENS, names)
        wrong = [f'{n} {c[n]}' for n in PALETTE if not near(c[n], PALETTE[n][k], 1)]
        check(not wrong, f'alle Tokens wie vorgegeben ({theme}){": " + ", ".join(wrong) if wrong else ""}')
        derived = [f'{n} {c[n]}' for n in DERIVED if not any(near(c[n], h, 1) for h in PALETTE_HEX)]
        check(not derived, f'abgeleitete Tokens nur aus Werten der Palette ({theme}){": " + ", ".join(derived) if derived else ""}')
        low = [f'{fg} auf {bg} {contrast(c[fg], c[bg]):.2f}' for fg, bg in TEXT_PAIRS if contrast(c[fg], c[bg]) < 4.5]
        check(not low, f'Schrift mindestens 4,5:1 auf ihren Flächen ({theme}, {len(TEXT_PAIRS)} Paare){": " + ", ".join(low) if low else ""}')
        low = [f'{fg} auf {bg} {contrast(c[fg], c[bg]):.2f}' for fg, bg in ICON_PAIRS if contrast(c[fg], c[bg]) < 3]
        worst = min(contrast(c[fg], c[bg]) for fg, bg in ICON_PAIRS)
        check(not low, f'Bewertungsfarben als Icons mindestens 3:1 ({theme}, schlechtestes Paar {worst:.2f}){": " + ", ".join(low) if low else ""}')
        got = await pg.evaluate("['top','gut','mittel','sosse','schlecht'].map(r => getComputedStyle(document.querySelector('.rb[data-r=' + r + '] .ic')).color)")
        check(len(got) == 5 and all(near(g, PALETTE[r][k], 1) for g, r in zip(got, RATING[:1] + RATING)),
              f'Bewertungsknöpfe zeigen die Bewertungsfarben, „Sofort leer“ und „Später leer“ beide --good ({theme})')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


LOGOS = {'app/www/img/schmeckts-zeichen.svg': ['#2E2724', '#86513E', '#A76A53', '#BA7F68', '#94B3A5', '#7C9B8D'],
         'app/www/img/schmeckts-zeichen-dunkel.svg': ['#E8E2DB', '#86513E', '#A76A53', '#BA7F68', '#94B3A5', '#7C9B8D'],
         'design/schmeckts-zeichen-einfarbig.svg': ['currentColor'],
         'design/schmeckts-app-icon.svg': ['#F4F0EC', '#2E2724', '#86513E', '#A76A53', '#BA7F68', '#94B3A5', '#7C9B8D']}


VECTORS = {'drawable/ic_launcher_foreground.xml': 'app/www/img/schmeckts-zeichen.svg',
           'drawable-night/splash_logo.xml': 'app/www/img/schmeckts-zeichen-dunkel.svg',
           'drawable/ic_launcher_monochrome.xml': 'design/schmeckts-zeichen-einfarbig.svg'}


def svg_paths(text):
    return [(re.search(r'fill="([^"]*)"', x).group(1), re.search(r' d="([^"]*)"', x).group(1)) for x in re.findall(r'<path ([^>]*)/>', text)]


def test_logo_files():
    print('Logo: Dateien, Android-Icon und Startbildschirm')
    A = '{http://schemas.android.com/apk/res/android}'
    for f, colors in LOGOS.items():
        text = (ROOT / f).read_text()
        got = re.findall(r'fill="([^"]*)"', text)
        check('c2pa' not in text and '<metadata' not in text and got == colors, f'{f}: ohne Metadaten, Farben unverändert ({len(got)} Flächen)')
    res = ROOT / 'app/native/res'
    groups = set()
    for vec, src in VECTORS.items():
        root = ET.parse(res / vec).getroot()
        g = root.find('group'); groups.add(tuple(g.get(A + k) for k in ('scaleX', 'scaleY', 'translateX', 'translateY')))
        paths = [(x.get(A + 'fillColor'), x.get(A + 'pathData')) for x in root.iter('path')]
        want = svg_paths((ROOT / src).read_text())
        same = [d for _, d in paths] == [d for _, d in want] and all(c == w or w == 'currentColor' and c == '#FF000000' for (c, _), (w, _) in zip(paths, want))
        check(root.get(A + 'viewportWidth') == '108' and same, f'{vec}: Pfade und Farben aus {src}, 108er Raster')
    check(len(groups) == 1, f'Vordergrund, Themen-Icon und dunkler Startbildschirm liegen gleich ({groups})')
    alias = ET.parse(res / 'values/drawables.xml').getroot().find('drawable')
    prep = (ROOT / 'scripts/prepare.py').read_text()
    check(alias.get('name') == 'splash_logo' and alias.text == '@drawable/ic_launcher_foreground' and '@drawable/splash_logo' in prep
          and "drawable-v24/ic_launcher_foreground.xml').unlink" in prep,
          'Startbildschirm: hell das Motiv des App-Icons, dunkel das dunkle Zeichen; der Vordergrund der Vorlage fliegt raus')
    check('#F4F0EC' in (res / 'values/ic_launcher_background.xml').read_text() and '#F4F0EC' in (res / 'values/colors.xml').read_text()
          and '#191513' in (res / 'values-night/colors.xml').read_text() and 'design/schmeckts-app-icon.svg' in (ROOT / 'design/render-icons.py').read_text()
          and 'icon-512' not in (ROOT / 'design/render-icons.py').read_text(),
          'Icon-Hintergrund #F4F0EC, Startbildschirm hell #F4F0EC und dunkel #191513, Android 7 aus schmeckts-app-icon.svg')


async def test_logo(browser, url):
    ctx = await phone(browser)
    pg = await ctx.new_page(); await pg.goto(url)
    A = '{http://schemas.android.com/apk/res/android}'
    g = ET.parse(ROOT / 'app/native/res/drawable/ic_launcher_foreground.xml').getroot().find('group')
    k, tx, ty = float(g.get(A + 'scaleX')), float(g.get(A + 'translateX')), float(g.get(A + 'translateY'))
    await pg.set_content((WWW / 'img/schmeckts-zeichen.svg').read_text())
    r = await pg.evaluate("""([k, tx, ty]) => { let m = 0; for (const p of document.querySelectorAll('path')) { const L = p.getTotalLength();
      for (let i = 0; i <= 600; i++) { const q = p.getPointAtLength(L * i / 600); m = Math.max(m, Math.hypot(tx + k * q.x - 54, ty + k * q.y - 54)); } } return m; }""", [k, tx, ty])
    check(r <= 33, f'adaptives Icon: das Motiv liegt in der sicheren Zone (bis {r:.1f} dp vom Mittelpunkt, erlaubt 33)')
    await ctx.close()


def colors_in(text):
    out = []
    for m in re.finditer(r'#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b', text):
        x = m.group(1)
        x = x[2:] if len(x) == 8 else ''.join(c * 2 for c in x) if len(x) == 3 else x
        out.append('#' + x.upper())
    for m in re.finditer(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', text):
        out.append('#' + ''.join(f'{int(v):02X}' for v in m.groups()))
    return out


def css_rules(text):
    """(Selektor, [(Eigenschaft, Wert)]) für jeden innersten Block, ohne Kommentare"""
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return [(sel.strip(), [tuple(x.strip() for x in d.split(':', 1)) for d in body.split(';') if ':' in d])
            for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', text)]


def test_rules_static():
    print('Gestaltungsregeln in den Quelltexten')
    css = {f: (WWW / 'css' / f).read_text() for f in ('tokens.css', 'app.css')}
    bad = []
    for f, text in css.items():
        for sel, decls in css_rules(text):
            for prop, val in decls:
                if prop == 'text-transform' and val != 'none' and '.field.code' not in sel:
                    bad.append(f'{sel} {prop}:{val}')
                if prop == 'letter-spacing' and not val.startswith('-') and val not in ('0', 'normal') and '.field.code' not in sel:
                    bad.append(f'{sel} {prop}:{val}')
    js = [f.name for f in (WWW / 'js').rglob('*.js') if re.search(r'text-?transform|letter-?spacing', f.read_text(), re.I)]
    js += [f for f in ('index.html',) if re.search(r'text-transform|letter-spacing', (WWW / f).read_text())]
    check(not bad and not js, f'kein text-transform und kein positives letter-spacing außer im Code-Feld, auch nicht im JavaScript ({bad + js})')
    # Schriften: Figtree und Fraunces liegen in der App, Rubik ist ganz weg
    fonts = sorted(p.name for p in (WWW / 'fonts').iterdir())
    check(fonts == ['OFL-Figtree.txt', 'OFL-Fraunces.txt', 'figtree-latin.woff2', 'fraunces-latin.woff2'], f'Schriften mit Lizenz, sonst nichts ({fonts})')
    check(all('SIL Open Font License' in (WWW / 'fonts' / f).read_text() for f in ('OFL-Figtree.txt', 'OFL-Fraunces.txt'))
          and 'Figtree' in (WWW / 'fonts/OFL-Figtree.txt').read_text() and 'Fraunces' in (WWW / 'fonts/OFL-Fraunces.txt').read_text(), 'Lizenzen: SIL OFL')
    prep = (ROOT / 'scripts/prepare.py').read_text()
    check('8330490a01c60c196eae00b823de8102275aaa5862e7b76a7af21b8745338928' in prep and '5097cb6923bb6938dcfc373e6f99a19fbb603cc32f740cc1ecd9791af359470b' in prep,
          'prepare.py lädt beide Schriften mit Prüfsumme')
    tok = css['tokens.css']
    check('font-family:"Figtree"' in tok and 'font-weight:400 700' in tok and 'font-family:"Fraunces"' in tok and 'font-weight:500 700' in tok
          and '--font-display:"Fraunces","Iowan Old Style",Georgia,serif;' in tok and '--font-ui:"Figtree",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' in tok,
          '@font-face und Schrift-Tokens wie vorgegeben')
    # Farben nur in tokens.css, dort nur Werte der Palette (abgeleitete Tokens mit Deckkraft als 8-stelliges Hex)
    literal = re.compile(r'#[0-9A-Fa-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|\b(?:white|black)\b(?!-)')
    outside = [f'app.css: {m.group(0)}' for m in literal.finditer(re.sub(r'/\*.*?\*/', '', css['app.css'], flags=re.S))]
    outside += [f'index.html: {m.group(0)}' for m in literal.finditer(re.sub(r'<!--.*?-->', '', (WWW / 'index.html').read_text(), flags=re.S))]
    outside += [f'{f.name}: {m.group(0)}' for f in (WWW / 'js').rglob('*.js')
                for m in re.finditer(r'#[0-9A-Fa-f]{6}\b|\b(?:rgba?|hsla?|oklch)\(', f.read_text())]
    tok = re.sub(r'/\*.*?\*/', '', css['tokens.css'], flags=re.S)
    foreign = [c for c in re.findall(r'#[0-9A-Fa-f]{3,8}\b', tok) if c[:7].upper() not in PALETTE_HEX or len(c) not in (7, 9)]
    foreign += re.findall(r'\b(?:rgba?|hsla?|oklch)\(', tok)
    check(not outside and not foreign, f'Farben nur in tokens.css und nur aus der Palette ({outside + foreign})')
    check(set(colors_in((WWW / 'webview-update.html').read_text())) == {'#F4F0EC', '#2E2724', '#191513', '#EBE7E2'},
          'webview-update.html (ohne light-dark()): Grund und Schrift der Palette')
    res = ROOT / 'app/native/res'
    android = [(str(f.relative_to(res)), c) for f in res.rglob('*.xml') if str(f.relative_to(res)) not in VECTORS
               for c in colors_in(f.read_text()) if c not in PALETTE_HEX]
    check(not android and colors_in((ROOT / 'design/render-icons.py').read_text()) == [],
          f'Android-Ressourcen nur mit Werten der Palette, außer den Logo-Vektoren ({android})')
    # Animationen nur als Bewegung und Deckkraft innerhalb der Form: keine Fläche, kein Schatten, kein Rahmen in @keyframes
    frames = {}
    for f, text in css.items():
        for m in re.finditer(r'@keyframes\s+([\w-]+)\s*\{', text):
            depth, i = 1, m.end()
            while depth: depth += {'{': 1, '}': -1}.get(text[i], 0); i += 1
            frames[m.group(1)] = text[m.end():i - 1]
    loud = [f'{n}: {p}' for n, body in frames.items() for _, decls in css_rules(body) for p, _ in decls
            if re.match(r'background(?!-position)|box-shadow|outline|border(-[a-z]+)?-color|filter', p)]
    check(frames and not loud,
          f'@keyframes nur mit Bewegung und Deckkraft, ohne Hintergrund und Schatten ({len(frames)} Animationen){": " + ", ".join(loud) if loud else ""}')
    focus = [d for f, text in css.items() for sel, decls in css_rules(text) if 'focus' in sel for d in decls if d[0] == 'border-radius']
    check(not focus and ':focus-visible{outline:' in css['app.css'], f'Fokusrahmen folgen der Rundung: kein eigener Radius im Fokus ({focus})')
    check('data-logo' not in (WWW / 'index.html').read_text() and 'data-logo' not in (WWW / 'js/main.js').read_text()
          and "from './logo.js'" not in (WWW / 'js/main.js').read_text(), 'Kopfzeile ohne Logo: nichts in index.html und main.js')


FRAUNCES = '.brand, .card h2, .sh-head h2, .welcome h2, .tl-date b, .pct, .cnt b, .thumb'


SCAN = """(allowed) => { const bad = [], seen = new Set();
  const rgba = c => { const m = (c.match(/[\\d.]+/g) || []).map(Number); return [m[0] || 0, m[1] || 0, m[2] || 0, m.length > 3 ? m[3] : 1]; };
  const lum = c => { const f = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const probe = document.createElement('i'); probe.style.color = 'var(--faint)'; document.body.append(probe);
  const faint = getComputedStyle(probe).color; probe.remove();
  const ratio = el => { // Schrift mit ihrer Deckkraft auf den Flächen darunter
    let op = 1, layers = [];
    for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e), c = rgba(s.backgroundColor);
      if (c[3] > 0) { layers.unshift(c); if (c[3] >= 1) break; } op *= +s.opacity; }
    let back = [255, 255, 255]; for (const c of layers) back = back.map((v, i) => v * (1 - c[3]) + c[i] * c[3]);
    const f = rgba(getComputedStyle(el).color), a = f[3] * op, fg = back.map((v, i) => v * (1 - a) + f[i] * a);
    return op < .1 ? 99 : (Math.max(lum(fg), lum(back)) + .05) / (Math.min(lum(fg), lum(back)) + .05); };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') || !el.getClientRects().length) continue;
    const s = getComputedStyle(el), own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
    if (el.id !== 'f-code' && s.textTransform !== 'none') bad.push('Großbuchstaben ' + tag);
    if (el.id !== 'f-code' && s.letterSpacing !== 'normal' && parseFloat(s.letterSpacing) > 0) bad.push('gesperrt ' + tag);
    if (!own && el.tagName !== 'INPUT') continue;
    if (s.color !== faint && s.visibility === 'visible' && !el.closest(':disabled')) { const r = ratio(el); if (r < 4.5) bad.push(`Kontrast ${r.toFixed(2)} ${tag}`); }
    const fam = s.fontFamily.split(',')[0].replace(/"/g, '');
    if (fam === 'Fraunces') { if (!el.closest(allowed)) bad.push('Fraunces an ' + tag); seen.add(allowed.split(', ').find(a => el.closest(a))); }
    else if (fam !== 'Figtree') bad.push(fam + ' an ' + tag);
  }
  return {bad: [...new Set(bad)], seen: [...seen]}; }"""


async def test_rules(browser, url):
    print('Gestaltungsregeln in jeder Ansicht')
    pictures = make_pictures()
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme)
        pg, errors = await open_page(ctx, url, choose=False)
        await pg.evaluate('document.fonts.ready')
        seen, bad = set(), []
        async def scan():
            r = await pg.evaluate(SCAN, FRAUNCES); bad.extend(r['bad']); seen.update(r['seen'])
        await scan()  # Willkommen beim ersten Start: Wahl des Modus
        await pg.click('[data-action=mode-local]'); await idle(pg)
        await scan()  # Willkommen
        top = await pg.eval_on_selector('.top', """t => { const b = t.querySelector('.brand'), s = getComputedStyle(b);
          return [t.querySelectorAll('svg, img, [data-logo]').length - t.querySelectorAll('.top-end svg').length, b.innerText, b.children.length,
            s.fontFamily.split(',')[0].replace(/"/g, ''), s.fontWeight, s.fontSize, s.lineHeight, s.letterSpacing]; }""")
        check(top == [0, 'Schmeckt’s?', 0, 'Fraunces', '650', '30px', '33px', '-0.6px'], f'Kopfzeile ({scheme}): nur die Wortmarke, Fraunces 650, 30px ({top})')
        logo = await pg.eval_on_selector_all('.welcome .hero img', "l => l.filter(i => i.getClientRects().length).map(i => [i.getAttribute('src'), i.naturalWidth > 0, i.offsetWidth])")
        want = 'img/schmeckts-zeichen.svg' if scheme == 'light' else 'img/schmeckts-zeichen-dunkel.svg'
        check(logo == [[want, True, 104]], f'Willkommensbildschirm ({scheme}): das Zeichen für dieses Schema ({logo})')
        vs = await pg.evaluate("getComputedStyle(document.body).fontVariationSettings")
        check(vs == '"SOFT" 100', f'body: font-variation-settings „SOFT“ 100 ({vs})')
        await pg.click('[data-action=demo]'); await idle(pg)
        if await pg.query_selector('[data-action=close-week]'):  # „Letzte Woche“ gibt es nur montags bis mittwochs
            await pg.click('[data-action=close-week]'); await idle(pg)
        await pg.click('[data-action=expand][data-v=shop]'); await pg.click('[data-action=expand][data-v=ins]'); await idle(pg)
        await scan()  # Startseite mit allem
        layout = await pg.evaluate("""(() => { const app = getComputedStyle(document.querySelector('.app')), probe = document.createElement('i');
          probe.style.cssText = 'background:var(--surface);color:var(--ink)'; document.body.append(probe); const p = getComputedStyle(probe);
          const cards = [...document.querySelectorAll('#home > section')];
          const out = {app: [app.maxWidth, app.paddingLeft, app.paddingRight], cards: cards.map(c => { const s = getComputedStyle(c), h = getComputedStyle(c.querySelector('h2'));
            return [c.classList.contains('card'), s.backgroundColor === p.backgroundColor, s.backgroundImage, s.borderRadius, s.padding, s.boxShadow, s.borderTopWidth, s.borderBottomWidth,
              c.firstElementChild.tagName, h.fontFamily.split(',')[0].replace(/"/g, ''), h.fontWeight, h.fontSize, h.lineHeight, h.letterSpacing, h.color === p.color].join('|'); }),
            gaps: cards.slice(1).map((c, i) => Math.round(c.getBoundingClientRect().top - cards[i].getBoundingClientRect().bottom))};
          probe.remove(); return out; })()""")
        want = 'true|true|none|26px|18px 18px 8px|none|0px|0px|H2|Fraunces|600|21px|26.25px|-0.21px|true'
        first = want.replace('|H2|', '|BUTTON|')  # Übersicht: links das Bild, die Überschrift daneben
        check(layout['app'] == ['600px', '18px', '18px'] and len(layout['cards']) == 6 and layout['cards'][0] == first and all(c == want for c in layout['cards'][1:]) and layout['gaps'] == [14] * 5,
              f'Startseite ({scheme}): 600px, 18px Rand; jede Karte Fläche, Radius 26px, 18/18/8, ohne Rahmen und Schatten, Überschrift Fraunces 600 21px oben (Übersicht: neben dem Bild), 14px Abstand ({layout["gaps"]})')
        await pg.click('[data-action=open-settings]'); await idle(pg)
        await scan()
        label = await pg.eval_on_selector('.label', """l => { const s = getComputedStyle(l), probe = document.createElement('i'); probe.style.color = 'var(--muted)'; l.after(probe);
          const c = getComputedStyle(probe).color; probe.remove(); return [s.fontFamily.split(',')[0].replace(/"/g, ''), s.fontWeight, s.fontSize, s.color === c, s.textTransform, s.letterSpacing, l.innerText]; }""")
        check(label == ['Figtree', '600', '13.5px', True, 'none', 'normal', 'Darstellung'], f'Feldbeschriftung: Figtree 600, 13,5px, gedämpft, normale Schreibweise ({label})')
        await pg.click('#serverBox [data-action=connect-form]'); await idle(pg)
        await scan()  # Adresse und Code
        await pg.fill('#f-code', 'abcd1234')
        code = await pg.eval_on_selector('#f-code', 'f => [getComputedStyle(f).textTransform, getComputedStyle(f).letterSpacing]')
        check(code[0] == 'uppercase' and float(code[1][:-2]) > 0, f'Ausnahme: das Feld für den Haushaltscode ({code})')
        await pg.click('[data-action=close]'); await idle(pg)
        await pg.click('#fab'); await idle(pg)
        await scan()
        await pg.click('[data-action=close]'); await idle(pg)
        await pg.click('[data-sec=shop] [data-action=open-product]'); await idle(pg)
        await scan()
        await pg.click('[data-action=close]'); await idle(pg)
        await pg.click('.tl [data-action=open-serving]'); await idle(pg)
        await scan()
        await pg.click('[data-action=close]'); await idle(pg)
        await pg.click('[data-action=open-settings]'); await idle(pg)
        await pg.click('#sheet [data-action=edit-pet]'); await idle(pg)
        await pg.set_input_files('#albumInput', pictures[1:3])
        await pg.click('#sheet .ph-img >> nth=1'); await idle(pg)
        await scan()  # Tier-Sheet mit Album und gewähltem Foto
        await pg.set_input_files('#petPhotoInput', pictures[1])
        await pg.wait_for_selector('#sheet .crop img'); await idle(pg)
        await scan()
        await pg.click('[data-action=crop-cancel]'); await idle(pg)
        await pg.click('[data-action=close]'); await idle(pg)
        await pg.click('#fab'); await idle(pg)
        await pg.click('#sheet [data-action=photo]')
        await pg.wait_for_selector('#camera[open]'); await idle(pg)
        await scan()
        await pg.click('[data-cam=cancel]'); await idle(pg)
        check(not bad, f'überall nur Figtree und Fraunces an den festgelegten Stellen, keine Großbuchstaben, nichts gesperrt, jede Schrift mit 4,5:1 ({scheme}): {bad}')
        check(seen == set(FRAUNCES.split(', ')), f'Fraunces an Wortmarke, Überschriften, Tageszeilen, Prozent, Zählern, Anfangsbuchstaben ({sorted(seen)})')
        check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
        await ctx.close()


SMALL_ICONS = '.btn .ic, .chip > .ic, .seg button .ic, .sugg > .ic, .list-row .chev, .prod-card .edit .ic, .search .ic, .pick .ic'
ICONS = """sel => [...document.querySelectorAll(sel)].filter(i => i.getClientRects().length).map(i => { const r = i.getBoundingClientRect(), box = i.closest('.pick, .sugg, .prod-card, .search'),
    b = (box?.querySelector('.field') || box)?.getBoundingClientRect(), left = !!i.closest('.search');
  return {where: i.closest('[class]:not(svg)').className, w: r.width, h: r.height, stroke: getComputedStyle(i).strokeWidth,
    edge: b ? Math.round((left ? r.left - b.left : b.right - r.right) * 10) / 10 : null, mid: b ? Math.abs((r.top + r.bottom) / 2 - (b.top + b.bottom) / 2) < .6 : null}; })"""


async def test_polish(browser, url):
    print('Feinschliff: kleine Icons einheitlich, Auswahlfeld „Serviert von“, Abstand unter der Wortmarke')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]'); await idle(pg)
    gap = await pg.evaluate("[getComputedStyle(document.querySelector('.top')).paddingBottom, document.querySelector('#home > section').getBoundingClientRect().top - document.querySelector('.top').getBoundingClientRect().bottom]")
    check(gap == ['10px', 0], f'Startseite: unter der Wortmarke 10px bis zur ersten Karte, 8px mehr als zuvor ({gap})')
    icons = []
    await pg.click('.pend-head'); await idle(pg)
    pick = [i for i in await pg.evaluate(ICONS, '.pick .ic')]
    check(pick == [{'where': 'pick', 'w': 20, 'h': 20, 'stroke': '1.8px', 'edge': 14, 'mid': True}], f'Auswahl-Icon bei „Serviert von“: 20px, Strichstärke des Icon-Sets, 14px vom rechten Rand, senkrecht mittig ({pick})')
    check(await pg.eval_on_selector('#f-time', 'f => getComputedStyle(f).appearance') == 'none', 'das Feld zeichnet keinen eigenen Pfeil des Systems daneben (Android)')
    await shot(pg, 'auswahlfeld')
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    await pg.click('[data-action=edit-name]'); await idle(pg)
    await pg.fill('#f-variety', ''); await pg.fill('#f-brand', 'She'); await idle(pg)
    await pg.wait_for_selector('#sheet .sugg')
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('[data-action=open-settings]'); await idle(pg)
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    await pg.click('#sheet [data-action=edit-pet]'); await idle(pg)
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    await pg.click('[data-action=close]'); await idle(pg)
    await pg.click('#fab'); await idle(pg)
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    kinds = {i['where'].split()[0] for i in icons}
    odd = [i for i in icons if (i['w'], i['h'], i['stroke']) != (20, 20, '1.8px') or i['edge'] not in (None, 14) or i['mid'] is False]
    check({'pick', 'sugg', 'edit', 'list-row', 'btn', 'chip'} <= kinds and not odd,
          f'Auswahlfelder, Pfeile in Zeilen und kleine Icons in Knöpfen: 20px, Strichstärke 1.8, in Kästen 14px vom Rand und senkrecht mittig ({len(icons)} Icons, {sorted(kinds)}) {odd[:3]}')
    check(not errors, 'keine Fehler in der Konsole' + (f': {errors}' if errors else ''))
    await ctx.close()


def test_pack():
    """Quellen in zwei Dateien: zusammen entpackt ergeben sie wieder denselben Arbeitsbaum"""
    sys.path.insert(0, str(ROOT / 'scripts'))
    import pack, unpack
    with tempfile.TemporaryDirectory() as tmp:
        with contextlib.redirect_stdout(io.StringIO()):
            pack.main(tmp)
            for name in ('schmeckts-quellen.txt', 'schmeckts-server-quellen.txt'):
                unpack.unpack(f'{tmp}/{name}', f'{tmp}/baum')
        names = {name: re.findall(r'^===== DATEI: (.+) \(\d+ Zeichen\) =====$', pathlib.Path(tmp, name).read_text(encoding='utf-8'), re.M)
                 for name in ('schmeckts-quellen.txt', 'schmeckts-server-quellen.txt')}
        server = lambda rel: rel.startswith(('server/', 'packaging/')) or rel in ('scripts/build-deb.sh', 'docs/INSTALLATION.md')
        app, srv = names['schmeckts-quellen.txt'], names['schmeckts-server-quellen.txt']
        check(app[0] == 'PROJEKT.md' and not any(map(server, app)) and all(map(server, srv)) and {'server/main.go', 'packaging/debian/control', 'scripts/build-deb.sh', 'docs/INSTALLATION.md'} <= set(srv)
              and {'scripts/unpack.py', 'scripts/pack.py', 'tests/ui_test.py', 'app/www/js/main.js'} <= set(app),
              f'App-Datei mit PROJEKT.md vorn, Tests und Skripten ({len(app)} Dateien), Server-Datei mit server/, packaging/, build-deb.sh, INSTALLATION.md ({len(srv)})')
        want = dict(pack.files())
        got = {p.relative_to(f'{tmp}/baum').as_posix(): p.read_text(encoding='utf-8') for p in pathlib.Path(tmp, 'baum').rglob('*') if p.is_file()}
        check(got == want and len(got) == len(app) + len(srv), f'beide Dateien in denselben Ordner entpackt: derselbe Arbeitsbaum ({len(got)} Dateien)')
        first = pathlib.Path(tmp, 'schmeckts-server-quellen.txt').read_text(encoding='utf-8').split('\n', 1)[0]
        check(f"Version {(ROOT / 'server/VERSION').read_text().strip()}," in first, f'die Server-Datei nennt die Version des Servers, sie ändert sich nicht mit der App ({first})')


def test_prompt():
    """Der Prompt der Foto-Erkennung steht nur in shared/recognize-prompt.txt: App und Server nutzen denselben Text."""
    shared = (ROOT / 'shared/recognize-prompt.txt').read_text(encoding='utf-8').strip()
    module = (WWW / 'js/prompt.js').read_text(encoding='utf-8')
    app = json.loads(re.search(r'export const PROMPT = (".*");', module, re.S).group(1))
    server = (ROOT / 'server/recognize-prompt.txt').read_text(encoding='utf-8').strip()
    go = (ROOT / 'server/recognize.go').read_text(encoding='utf-8')
    head = shared.split('\n')[0]
    check(len(shared) > 100 and app == shared and server == shared and '//go:embed recognize-prompt.txt' in go
          and head not in go and head not in (WWW / 'js/recognize.js').read_text(encoding='utf-8'),
          'App und Server nutzen denselben Prompt, er steht nur in shared/recognize-prompt.txt')
    check("from './prompt.js'" in (WWW / 'js/recognize.js').read_text(encoding='utf-8')
          and 'shared/recognize-prompt.txt' in (ROOT / 'scripts/prepare.py').read_text(encoding='utf-8')
          and "'app/www/js/prompt.js'" in (ROOT / 'scripts/pack.py').read_text(encoding='utf-8'),
          'prepare.py erzeugt Modul und Kopie, gepackt wird nur die Datei in shared/')


async def test_files(browser, url):
    test_logo_files()
    test_rules_static()
    test_pack()
    test_prompt()


run_tests({'dateien': test_files, 'palette': test_palette, 'logo': test_logo, 'ansichten': test_rules, 'feinschliff': test_polish}, camera=('ansichten',))
