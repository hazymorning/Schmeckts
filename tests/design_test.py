#!/usr/bin/env python3
"""What a user would see break in the design: contrast, typefaces, tokens, the logo, reduced motion.
Usage: python3 tests/design_test.py [name …]"""

import re
import xml.etree.ElementTree as ET
from common import PACK, RGB, ROOT, WWW, check, contrast, idle, make_pictures, open_page, phone, run_tests, set_theme

RATING = ('--good', '--mid', '--sauce', '--bad')
OBSERVED = ('--happy', '--stink', '--hungry', '--tired', '--vomit')
TEXT_PAIRS = (
    [(fg, bg) for fg in ('--ink', '--muted', '--accent-ink') for bg in ('--bg', '--surface', '--surface-2')]
    + [
        ('--on-accent', '--accent'),
        ('--on-accent', '--bad'),
        ('--ink', '--seg-on'),
        ('--bg', '--ink'),
        ('--toast-action', '--ink'),
        ('--accent-ink', '--accent-soft'),
        ('--bad', '--bad-soft'),
        ('--good', '--good-soft'),
        ('--muted', '--good-soft'),
        ('--muted', '--bad-soft'),
        ('--bad', '--surface'),
        ('--paper-ink', '--paper'),
        ('--paper-muted', '--paper'),
    ]
    + [('--ink', r + '-soft') for r in RATING + OBSERVED]
)
# what lies on the page without glaring at it: the calendar sheet is on night paper in the dark
CALM_PAIRS = [('--paper', '--bg')]
ICON_PAIRS = (
    [(r, bg) for r in RATING for bg in ('--bg', '--surface', '--surface-2', r + '-soft')]
    + [(o, bg) for o in OBSERVED for bg in ('--bg', '--surface', '--surface-2', o + '-soft')]
    + [('--surface', o) for o in OBSERVED]
)
TOKENS = (
    """(names) => { const rgb = """
    + RGB
    + """, out = {};
  for (const n of names) { const i = document.createElement('i'); i.style.color = `var(${n})`; document.body.append(i); out[n] = rgb(getComputedStyle(i).color); i.remove(); }
  return out; }"""
)


async def test_palette(browser, url):
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    names = sorted({n for pair in TEXT_PAIRS + ICON_PAIRS + CALM_PAIRS for n in pair})
    for theme in ('light', 'dark'):
        await set_theme(pg, theme)
        c = await pg.evaluate(TOKENS, names)
        low = [f'{fg} on {bg} {contrast(c[fg], c[bg]):.2f}' for fg, bg in TEXT_PAIRS if contrast(c[fg], c[bg]) < 4.5]
        check(not low, f'text tokens at least 4.5:1 ({theme}) {low}')
        low = [f'{fg} on {bg} {contrast(c[fg], c[bg]):.2f}' for fg, bg in ICON_PAIRS if contrast(c[fg], c[bg]) < 3]
        check(not low, f'rating and observation colours as icons at least 3:1 ({theme}) {low}')
        loud = [f'{a} on {b} {contrast(c[a], c[b]):.2f}' for a, b in CALM_PAIRS if contrast(c[a], c[b]) > 2]
        check(not loud, f'the calendar sheet at most 2:1 against the page ({theme}) {loud}')
    check(not errors, f'no errors in the console {errors}')
    await ctx.close()


A = '{http://schemas.android.com/apk/res/android}'
VECTORS = {
    'drawable/ic_launcher_foreground.xml': 'app/www/img/schmeckts-mark.svg',
    'drawable-night/splash_logo.xml': 'app/www/img/schmeckts-mark-dark.svg',
    'drawable/ic_launcher_monochrome.xml': 'design/schmeckts-mark-mono.svg',
}


def test_logo_files():
    res = ROOT / 'app/native/res'
    groups = set()
    for vec, src in VECTORS.items():
        root = ET.parse(res / vec).getroot()
        g = root.find('group')
        groups.add(tuple(g.get(A + k) for k in ('scaleX', 'scaleY', 'translateX', 'translateY')))
        paths = [x.get(A + 'pathData') for x in root.iter('path')]
        want = re.findall(r'<path [^>]* d="([^"]*)"', (ROOT / src).read_text())
        check(paths == want, f'{vec}: the paths of {src}')
    check(len(groups) == 1, f'icon, themed icon and dark splash share one position {groups}')


async def test_logo(browser, url):
    ctx = await phone(browser)
    pg = await ctx.new_page()
    await pg.goto(url)
    g = ET.parse(ROOT / 'app/native/res/drawable/ic_launcher_foreground.xml').getroot().find('group')
    k, tx, ty = float(g.get(A + 'scaleX')), float(g.get(A + 'translateX')), float(g.get(A + 'translateY'))
    await pg.set_content((WWW / 'img/schmeckts-mark.svg').read_text())
    r = await pg.evaluate(
        """([k, tx, ty]) => { let m = 0; for (const p of document.querySelectorAll('path')) { const L = p.getTotalLength();
      for (let i = 0; i <= 600; i++) { const q = p.getPointAtLength(L * i / 600); m = Math.max(m, Math.hypot(tx + k * q.x - 54, ty + k * q.y - 54)); } } return m; }""",
        [k, tx, ty],
    )
    check(r <= 33, f'adaptive icon motif inside the 33 dp safe zone ({r:.1f})')
    await ctx.close()


def css_decls(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return [
        (' '.join(sel.split()), prop.strip(), value.strip())
        for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', text)
        for prop, value in (d.split(':', 1) for d in body.split(';') if ':' in d)
    ]


def test_tokens():
    app = (WWW / 'css/app.css').read_text(encoding='utf-8')
    literal = re.compile(r'#[0-9A-Fa-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|\b(?:white|black)\b(?!-)')
    outside = [f'app.css: {m.group(0)}' for m in literal.finditer(re.sub(r'/\*.*?\*/', '', app, flags=re.S))]
    outside += [f'index.html: {m.group(0)}' for m in literal.finditer(re.sub(r'<!--.*?-->', '', (WWW / 'index.html').read_text(), flags=re.S))]
    outside += [
        f'{f.name}: {m.group(0)}'
        for f in (WWW / 'js').rglob('*.js')
        for m in re.finditer(r'#[0-9A-Fa-f]{6}\b|\b(?:rgba?|hsla?|oklch)\(', f.read_text())
    ]
    check(not outside, f'colours only in tokens.css {outside}')
    decls = css_decls(app)
    loose = [
        f'{sel} {prop}: {value}'
        for sel, prop, value in decls
        if re.match(r'(margin|padding|gap|row-gap|column-gap)(-|$)', prop) and re.search(r'\d+(\.\d+)?px', re.sub(r'env\([^)]*\)', '', value))
    ]
    check(not loose, f'distances from the space scale {loose[:4]}')
    loose = [
        f'{sel} {prop}: {value}'
        for sel, prop, value in decls
        if 'radius' in prop and any(p not in ('0', '50%') and not p.startswith('var(--radius-') for p in value.split())
    ]
    check(not loose, f'radii from the radius tokens {loose[:4]}')
    loose = [
        f'{sel} {prop}: {value}' for sel, prop, value in decls if prop == 'font' and value not in ('inherit',) and not value.startswith('var(--type-')
    ]
    check(not loose, f'type only through the --type-* styles {loose[:4]}')


# Visible text and placeholders against what lies beneath them, with opacity, and the typeface in use
SCAN = """() => { const bad = [];
  const rgba = c => { const m = (c.match(/[\\d.]+/g) || []).map(Number); return [m[0] || 0, m[1] || 0, m[2] || 0, m.length > 3 ? m[3] : 1]; };
  const lum = c => { const f = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ratio = (el, color = getComputedStyle(el).color) => {
    let op = 1, layers = [];
    for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e), c = rgba(s.backgroundColor);
      if (c[3] > 0) { layers.unshift(c); if (c[3] >= 1) break; } op *= +s.opacity; }
    let back = [255, 255, 255]; for (const c of layers) back = back.map((v, i) => v * (1 - c[3]) + c[i] * c[3]);
    const f = rgba(color), a = f[3] * op, fg = back.map((v, i) => v * (1 - a) + f[i] * a);
    return op < .1 ? 99 : (Math.max(lum(fg), lum(back)) + .05) / (Math.min(lum(fg), lum(back)) + .05); };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') || !el.getClientRects().length) continue;
    const s = getComputedStyle(el), own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own && el.tagName !== 'INPUT') continue;
    const tag = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
    if (el.placeholder && !el.value) { const r = ratio(el, getComputedStyle(el, '::placeholder').color); if (r < 4.5) bad.push(`placeholder ${r.toFixed(2)} ${tag}`); }
    if (s.visibility === 'visible' && !el.closest(':disabled')) { const r = ratio(el); if (r < 4.5) bad.push(`contrast ${r.toFixed(2)} ${tag}`); }
    const fam = s.fontFamily.split(',')[0].replace(/"/g, '');
    if (fam !== 'Figtree' && fam !== 'Faustina') bad.push(`${fam} on ${tag}`);
  }
  for (const el of document.querySelectorAll('p:not(.slider-names), .said, .why, .told li > span, .tile small'))
    for (const part of el.innerHTML.split(/[.!?](?=\\s|<|$)/))
      if ((part.match(/<b>/g) || []).length > 1) bad.push(`two bold in one sentence: ${part.replace(/<[^>]*>/g, '').trim()}`);
  return [...new Set(bad)]; }"""


async def test_views(browser, url, scheme):
    pictures = make_pictures()
    ctx = await phone(browser, scheme)
    pg, errors = await open_page(ctx, url)
    await pg.evaluate('document.fonts.ready')
    bad = []

    async def scan():
        bad.extend(await pg.evaluate(SCAN))

    async def tap(sel, **kw):
        await pg.click(sel, **kw)
        await idle(pg)

    await scan()
    logo = await pg.eval_on_selector_all(
        '.welcome .hero img', "l => l.filter(i => i.getClientRects().length).map(i => [i.getAttribute('src'), i.naturalWidth > 0])"
    )
    want = 'img/schmeckts-mark.svg' if scheme == 'light' else 'img/schmeckts-mark-dark.svg'
    check(logo == [[want, True]], f'welcome logo for the {scheme} scheme {logo}')
    await tap('[data-action=demo]')
    await scan()
    await tap('[data-sec=evaluation] [data-action=open-evaluation]')
    await scan()
    await tap('#sheet [data-action=open-level][data-v=profile]')
    await scan()
    await tap('#sheet [data-action=settings-back]')
    await tap('#sheet .head [data-action=open-level][data-v=shop]')
    await scan()
    await tap('#sheet [data-action=settings-back]')
    await tap('#sheet [data-action=settings-back]')
    await tap('[data-action=open-settings]')
    await scan()
    await tap('#sheet [data-action=settings-page][data-v=house]')
    await tap('#serverBox [data-action=connect-form]')
    await scan()
    await tap('#sheet [data-action=settings-back]')
    await tap('#sheet [data-action=settings-back]')
    await tap('#fab')
    await scan()
    await tap('[data-action=close]')
    await pg.evaluate("import('./js/store.js').then(s => { for (const p of s.db.products) p.codes = {...p.codes, '4001234567890': true}; })")
    await tap('[data-sec=evaluation] button.tile')
    await scan()
    await tap('[data-action=close]')
    await tap('.tl [data-action=open-serving]')
    await scan()
    await tap('[data-action=close]')
    await tap('[data-action=open-settings]')
    await tap('#sheet [data-action=edit-pet]')
    await scan()
    await pg.set_input_files('#petPhotoInput', pictures[1])
    await pg.wait_for_selector('#sheet .crop img')
    await idle(pg)
    await scan()
    await tap('[data-action=crop-cancel]')
    await tap('#sheet [data-action=settings-back]')
    await tap('#sheet [data-action=settings-back]')
    await tap('#fab')
    await pg.click('#sheet [data-action=photo]')
    await pg.wait_for_selector('#camera[open]')
    await idle(pg)
    await scan()
    await tap('[data-cam=cancel]')
    await tap('#sheet [data-action=close]')
    await tap('[data-sec=hist] [data-action=open-report]')
    await scan()
    await tap('#sheet [data-action=settings-back]')
    await tap('.pend-head')
    # ::backdrop is no element, so the reduced-motion rule has to name it
    dimming = await pg.evaluate("getComputedStyle(document.getElementById('sheet'), '::backdrop').animationDuration")
    check(float(dimming.rstrip('s')) < 0.01, f'reduced motion reaches the sheet dimming ({scheme}, {dimming})')
    await tap('[data-action=close]')
    await pg.click('.pend .slider-track button', force=True)  # the level takes no pointer, the track does
    await pg.wait_for_selector('#toast [data-action=undo]')
    await idle(pg)
    await scan()
    await tap('.tl [data-action=open-serving]')
    await scan()
    await tap('[data-action=close]')
    await tap('[data-action=open-settings]')
    await pg.click('#sheet [data-action=arm][data-then=wipe]')
    await tap('#sheet [data-action=arm][data-then=wipe]')
    await tap('.welcome [data-action=add-pet]')
    await pg.fill('#f-name', 'Minka')
    await tap('[data-action=save-pet]')
    await scan()
    full = await phone(browser, scheme)
    await full.add_init_script("Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };")
    pg2, _ = await open_page(full, url, scheme)
    bad.extend(await pg2.evaluate(SCAN))
    await full.close()
    check(not bad, f'all visible text at 4.5:1, in Figtree or Faustina, at most one bold per sentence ({scheme}) {bad}')
    check(not errors, f'no errors in the console {errors}')
    await ctx.close()


SKELETON = """() => { const r = e => e.getBoundingClientRect(), labels = [...document.querySelectorAll('#sheet .label')].filter(l => l.querySelector('.skel-text')),
  blocks = [...document.querySelectorAll('#sheet .skel-field')];
  return labels.map((l, i) => Math.round((r(blocks[i]).bottom - r(l).top) * 100) / 100); }"""
FIELDS = """() => { const r = s => document.querySelector('#sheet ' + s).getBoundingClientRect();
  return [['label[for=f-brand]', '#f-brand'], ['label[for=f-variety]', '#f-variety']].map(([l, f]) => Math.round((r(f).bottom - r(l).top) * 100) / 100); }"""


async def test_skeleton(browser, url):
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url, native=True)
    await pg.click('.welcome [data-action=add-pet]')
    await idle(pg)
    await pg.fill('#f-name', 'Minka')
    await pg.click('[data-action=save-pet]')
    await idle(pg)
    await pg.evaluate("window.__ocrText = 'Whiskas\\nRind in Gelee'; window.__ocrDelay = 1500")
    await pg.click('#fab')
    await idle(pg)
    await pg.set_input_files('#camInputSheet', str(PACK))
    await pg.wait_for_selector('#sheet .skel-field')
    skeleton = await pg.evaluate(SKELETON)
    await pg.wait_for_selector('#sheet #f-brand')
    await idle(pg)
    fields = await pg.evaluate(FIELDS)
    check(len(skeleton) == 2 and skeleton == fields, f'the skeleton is as tall as the fields it stands in for {skeleton} {fields}')
    check(not errors, f'no errors in the console {errors}')
    await ctx.close()


LOADER = """() => import('./js/recognize.js').then(r => { const w = document.querySelector('#sheet .note .wait'),
    photo = document.querySelector('#sheet .photo-btn.reading'), sheen = photo.getAnimations({subtree: true}).find(a => a.animationName === 'shimmer');
  return {waited: Date.now() - [...r.readingSince.values()][0], at: w.querySelector('.fill').getAnimations()[0]?.currentTime ?? null,
    delay: getComputedStyle(w).animationDelay, fill: getComputedStyle(w.querySelector('.fill')).animationName,
    sheen: sheen?.currentTime ?? null, shown: getComputedStyle(photo, '::after').display}; })"""


async def test_loader(browser, url):
    for motion in (True, False):
        ctx = await phone(browser, motion=motion)
        pg, errors = await open_page(ctx, url, native=True)
        await pg.click('.welcome [data-action=add-pet]')
        await idle(pg)
        await pg.fill('#f-name', 'Minka')
        await pg.click('[data-action=save-pet]')
        await idle(pg)
        await pg.evaluate("window.__ocrText = 'Whiskas'; window.__ocrDelay = 4000")
        await pg.click('#fab')
        await idle(pg)
        await pg.set_input_files('#camInputSheet', str(PACK))
        await pg.wait_for_selector('#sheet .skel-field')
        await pg.wait_for_selector('#sheet #f-brand')  # drawn again after the skeleton, still reading
        got = await pg.evaluate(LOADER)
        if motion:
            check(
                got['delay'] != '0s'
                and got['fill'] == 'bowlFill'
                and abs(got['at'] - got['waited']) < 300
                and abs(got['sheen'] - got['waited']) < 300,
                f'the loader and the sheen over the photo wait a moment, and drawn again they go on from where they were {got}',
            )
        else:
            check(
                got['fill'] == 'none' and got['delay'] != '0s' and got['shown'] == 'none',
                f'reduced motion: the loader stands still, still after a moment, and no sheen runs {got}',
            )
        check(not errors, f'no errors in the console {errors}')
        await ctx.close()


async def test_files(browser, url):
    test_logo_files()
    test_tokens()


run_tests(
    {
        'files': test_files,
        'palette': test_palette,
        'logo': test_logo,
        'light': lambda browser, url: test_views(browser, url, 'light'),
        'dark': lambda browser, url: test_views(browser, url, 'dark'),
        'skeleton': test_skeleton,
        'loader': test_loader,
    },
    camera=('light', 'dark'),
)
