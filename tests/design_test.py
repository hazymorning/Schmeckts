#!/usr/bin/env python3
"""Design rules from PROJECT.md: palette and contrasts, type, space, sizes and motion, logo, every view in light and dark.
Usage: python3 tests/design_test.py [name …]"""

import contextlib
import io
import json
import pathlib
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from common import RGB, ROOT, WWW, check, contrast, idle, make_pictures, near, open_page, phone, run_tests, set_theme, shot

PALETTE = {
    '--bg': ('#EEEDE7', '#1B1C17'),
    '--surface': ('#FAFAF6', '#25261F'),
    '--surface-2': ('#E4E3DA', '#30312A'),
    '--ink': ('#25261F', '#ECECE3'),
    '--muted': ('#62625A', '#A6A699'),
    '--faint': ('#9D9D92', '#77776C'),
    '--line': ('#D8D7CD', '#3B3C34'),
    '--accent': ('#58603F', '#A9B283'),
    '--accent-ink': ('#4A5134', '#A9B283'),
    '--accent-soft': ('#DEE0D7', '#393B2E'),
    '--on-accent': ('#FFFFFF', '#1B1C17'),
    '--good': ('#4D6C57', '#93BBA0'),
    '--good-soft': ('#D9DFD8', '#373E34'),
    '--mid': ('#8A6822', '#D2AE62'),
    '--mid-soft': ('#E5DECE', '#413C2A'),
    '--sauce': ('#7A5A43', '#C49C7E'),
    '--sauce-soft': ('#E2DCD4', '#3E392E'),
    '--bad': ('#8F3F43', '#D98C8E'),
    '--bad-soft': ('#E9DCD9', '#3E342F'),
}


PALETTE_HEX = {v for pair in PALETTE.values() for v in pair}


DERIVED = ('--seg-on', '--toast-action')  # abgeleitet, deckend


RATING = ('--good', '--mid', '--sauce', '--bad')


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
        ('--bad', '--surface'),
    ]
    + [('--ink', r + '-soft') for r in RATING]
)


ICON_PAIRS = [(r, bg) for r in RATING for bg in ('--bg', '--surface', '--surface-2', r + '-soft')]


TOKENS = (
    """(names) => { const rgb = """
    + RGB
    + """, out = {};
  for (const n of names) { const i = document.createElement('i'); i.style.color = `var(${n})`; document.body.append(i); out[n] = rgb(getComputedStyle(i).color); i.remove(); }
  return out; }"""
)


async def test_palette(browser, url):
    print('colour scheme: a fixed palette with no choice, derived tokens, contrasts')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    await pg.click('[data-action=open-settings]')
    await idle(pg)
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    names = list(PALETTE) + list(DERIVED)
    for theme, k in (('light', 0), ('dark', 1)):
        await set_theme(pg, theme)
        c = await pg.evaluate(TOKENS, names)
        wrong = [f'{n} {c[n]}' for n in PALETTE if not near(c[n], PALETTE[n][k], 1)]
        check(not wrong, f'every token as specified ({theme}){": " + ", ".join(wrong) if wrong else ""}')
        derived = [f'{n} {c[n]}' for n in DERIVED if not any(near(c[n], h, 1) for h in PALETTE_HEX)]
        check(not derived, f'derived tokens from the palette\u2019s values only ({theme}){": " + ", ".join(derived) if derived else ""}')
        low = [f'{fg} auf {bg} {contrast(c[fg], c[bg]):.2f}' for fg, bg in TEXT_PAIRS if contrast(c[fg], c[bg]) < 4.5]
        check(not low, f'type at least 4.5:1 on its own surfaces ({theme}, {len(TEXT_PAIRS)} pairs){": " + ", ".join(low) if low else ""}')
        low = [f'{fg} auf {bg} {contrast(c[fg], c[bg]):.2f}' for fg, bg in ICON_PAIRS if contrast(c[fg], c[bg]) < 3]
        worst = min(contrast(c[fg], c[bg]) for fg, bg in ICON_PAIRS)
        check(not low, f'rating colours as icons at least 3:1 ({theme}, worst pair {worst:.2f}){": " + ", ".join(low) if low else ""}')
        got = await pg.evaluate(
            "['top','gut','mittel','sosse','schlecht'].map(r => getComputedStyle(document.querySelector('.rb[data-r=' + r + '] .ic')).color)"
        )
        check(
            len(got) == 5 and all(near(g, PALETTE[r][k], 1) for g, r in zip(got, RATING[:1] + RATING)),
            f'the rating buttons show the rating colours, „Sofort leer“ and „Später leer“ both --good ({theme})',
        )
    check(
        await pg.evaluate("import('./js/motion.js').then(m => ['fade', 'step', 'long'].map(m.dur))") == [200, 300, 1200],
        'dur() reads the duration tokens',
    )
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


LOGOS = {
    'app/www/img/schmeckts-mark.svg': ['#25261F', '#86513E', '#A76A53', '#BA7F68', '#A3A97F', '#8A9066'],
    'app/www/img/schmeckts-mark-dark.svg': ['#ECECE3', '#86513E', '#A76A53', '#BA7F68', '#A3A97F', '#8A9066'],
    'design/schmeckts-mark-mono.svg': ['currentColor'],
    'design/schmeckts-app-icon.svg': ['#EEEDE7', '#25261F', '#86513E', '#A76A53', '#BA7F68', '#A3A97F', '#8A9066'],
}


VECTORS = {
    'drawable/ic_launcher_foreground.xml': 'app/www/img/schmeckts-mark.svg',
    'drawable-night/splash_logo.xml': 'app/www/img/schmeckts-mark-dark.svg',
    'drawable/ic_launcher_monochrome.xml': 'design/schmeckts-mark-mono.svg',
}


def svg_paths(text):
    return [(re.search(r'fill="([^"]*)"', x).group(1), re.search(r' d="([^"]*)"', x).group(1)) for x in re.findall(r'<path ([^>]*)/>', text)]


def test_logo_files():
    print('logo: files, Android icon and splash screen')
    A = '{http://schemas.android.com/apk/res/android}'
    for f, colors in LOGOS.items():
        text = (ROOT / f).read_text()
        got = re.findall(r'fill="([^"]*)"', text)
        check('c2pa' not in text and '<metadata' not in text and got == colors, f'{f}: without metadata, colours unchanged ({len(got)} fills)')
    res = ROOT / 'app/native/res'
    groups = set()
    for vec, src in VECTORS.items():
        root = ET.parse(res / vec).getroot()
        g = root.find('group')
        groups.add(tuple(g.get(A + k) for k in ('scaleX', 'scaleY', 'translateX', 'translateY')))
        paths = [(x.get(A + 'fillColor'), x.get(A + 'pathData')) for x in root.iter('path')]
        want = svg_paths((ROOT / src).read_text())
        same = [d for _, d in paths] == [d for _, d in want] and all(
            c == w or w == 'currentColor' and c == '#FF000000' for (c, _), (w, _) in zip(paths, want)
        )
        check(root.get(A + 'viewportWidth') == '108' and same, f'{vec}: paths and colours from {src}, 108 grid')
    check(len(groups) == 1, f'foreground, themed icon and the dark splash screen sit in the same place ({groups})')
    alias = ET.parse(res / 'values/drawables.xml').getroot().find('drawable')
    prep = (ROOT / 'scripts/prepare.py').read_text()
    check(
        alias.get('name') == 'splash_logo'
        and alias.text == '@drawable/ic_launcher_foreground'
        and '@drawable/splash_logo' in prep
        and "drawable-v24/ic_launcher_foreground.xml').unlink" in prep,
        'splash screen: the app icon\u2019s motif in light, the dark mark in dark; the template\u2019s foreground is dropped',
    )
    check(
        '#EEEDE7' in (res / 'values/ic_launcher_background.xml').read_text()
        and '#EEEDE7' in (res / 'values/colors.xml').read_text()
        and '#1B1C17' in (res / 'values-night/colors.xml').read_text()
        and 'design/schmeckts-app-icon.svg' in (ROOT / 'design/render-icons.py').read_text()
        and 'icon-512' not in (ROOT / 'design/render-icons.py').read_text(),
        'icon background #EEEDE7, splash screen #EEEDE7 in light and #1B1C17 in dark, Android 7 from schmeckts-app-icon.svg',
    )


async def test_logo(browser, url):
    ctx = await phone(browser)
    pg = await ctx.new_page()
    await pg.goto(url)
    A = '{http://schemas.android.com/apk/res/android}'
    g = ET.parse(ROOT / 'app/native/res/drawable/ic_launcher_foreground.xml').getroot().find('group')
    k, tx, ty = float(g.get(A + 'scaleX')), float(g.get(A + 'translateX')), float(g.get(A + 'translateY'))
    await pg.set_content((WWW / 'img/schmeckts-mark.svg').read_text())
    r = await pg.evaluate(
        """([k, tx, ty]) => { let m = 0; for (const p of document.querySelectorAll('path')) { const L = p.getTotalLength();
      for (let i = 0; i <= 600; i++) { const q = p.getPointAtLength(L * i / 600); m = Math.max(m, Math.hypot(tx + k * q.x - 54, ty + k * q.y - 54)); } } return m; }""",
        [k, tx, ty],
    )
    check(r <= 33, f'adaptive icon: the motif sits inside the safe zone (up to {r:.1f} dp from the centre, 33 allowed)')
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
    """(selector, [(property, value)]) for every innermost block, comments stripped"""
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return [
        (sel.strip(), [tuple(x.strip() for x in d.split(':', 1)) for d in body.split(';') if ':' in d])
        for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', text)
    ]


def css_value(value):
    """A declaration's value with the formatting taken out: whitespace collapsed, none around commas"""
    return re.sub(r'\s*,\s*', ',', ' '.join(value.split()))


def css_blocks(text):
    """[(selector, {property: value})] for every innermost block, at-rules such as @font-face included.

    Parses the rules instead of matching text, so the way Prettier lays the CSS out makes no difference."""
    return [(' '.join(sel.split()), {p: css_value(v) for p, v in decls}) for sel, decls in css_rules(text)]


SECTIONS = ('Foundations', 'Recipes', 'Views', 'Motion')
KEYFRAME_STEP = re.compile(r'(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*')
REDUCED = '@media (prefers-reduced-motion: reduce)'


def tokens_root(sel=':root'):
    return {p: v for s, d in css_blocks((WWW / 'css/tokens.css').read_text(encoding='utf-8')) if s == sel for p, v in d.items()}


def cut_block(text, head):
    """(text without the at-rule that starts with head, that rule's body)"""
    i = text.find(head)
    if i < 0:
        return text, ''
    j = k = text.index('{', i) + 1
    depth = 1
    while depth:
        depth += {'{': 1, '}': -1}.get(text[k], 0)
        k += 1
    return text[:i] + text[k:], text[j : k - 1]


def keyframes(text):
    """{name: body} of every @keyframes, brace-matched"""
    out = {}
    for m in re.finditer(r'@keyframes\s+([\w-]+)\s*\{', text):
        depth, i = 1, m.end()
        while depth:
            depth += {'{': 1, '}': -1}.get(text[i], 0)
            i += 1
        out[m.group(1)] = text[m.end() : i - 1]
    return out


def app_decls():
    """(section, selector, property, value) for app.css, keyframe steps and the reduced-motion rule left out"""
    text = re.sub(r'/\*(?! == )(.*?)\*/', '', (WWW / 'css/app.css').read_text(encoding='utf-8'), flags=re.S)
    text = cut_block(text, REDUCED)[0]
    parts = re.split(r'/\* == (\w+) == \*/', text)
    out = []
    for name, body in zip(['(before)'] + parts[1::2], [parts[0]] + parts[2::2]):
        for sel, decls in css_rules(body):
            sel = ' '.join(sel.split())
            if KEYFRAME_STEP.fullmatch(sel):
                continue
            out += [(name, sel, p, css_value(v)) for p, v in decls]
    return out


def split_top(value):
    """value split at commas outside parentheses: var(--c, var(--line)) stays whole"""
    parts, depth, cur = [], 0, ''
    for ch in value:
        depth += {'(': 1, ')': -1}.get(ch, 0)
        if ch == ',' and not depth:
            parts.append(cur.strip())
            cur = ''
        else:
            cur += ch
    return [p for p in parts + [cur.strip()] if p]


def literal_px(value):
    """px literals other than 0, env() fallbacks taken out"""
    bare = re.sub(r'env\([^()]*(\([^()]*\))?[^()]*\)', '', value)
    return [x for x in re.findall(r'(?<![\w.-])-?\d*\.?\d+px', bare) if float(x[:-2]) != 0]


def subjects(sel):
    return [re.split(r'\s*[\s>+~]\s*', s.strip())[-1] for s in split_top(sel)]


def test_rules_static():
    print('design rules in the sources')
    css = {f: (WWW / 'css' / f).read_text() for f in ('tokens.css', 'app.css')}
    blocks = css_blocks(css['tokens.css'])
    root = next(d for sel, d in blocks if sel == ':root')
    bad = []
    for f, text in css.items():
        for sel, decls in css_rules(text):
            for prop, val in decls:
                if prop == 'text-transform' and val != 'none' and '.field.code' not in sel:
                    bad.append(f'{sel} {prop}:{val}')
                # a token counts with its value, or var(--track-title) would read as positive
                real = root.get(val[4:-1], val) if val.startswith('var(--') else val
                if prop == 'letter-spacing' and not real.startswith('-') and real not in ('0', 'normal') and '.field.code' not in sel:
                    bad.append(f'{sel} {prop}:{val}')
    js = [f.name for f in (WWW / 'js').rglob('*.js') if re.search(r'text-?transform|letter-?spacing', f.read_text(), re.I)]
    js += [f for f in ('index.html',) if re.search(r'text-transform|letter-spacing', (WWW / f).read_text())]
    check(not bad and not js, f'no text-transform and no positive letter-spacing outside the code field, not in the JavaScript either ({bad + js})')
    # Typefaces: Figtree and Faustina ship with the app, Rubik is gone entirely
    fonts = sorted(p.name for p in (WWW / 'fonts').iterdir())
    check(
        fonts == ['OFL-Faustina.txt', 'OFL-Figtree.txt', 'faustina-latin.woff2', 'figtree-latin.woff2'],
        f'the typefaces with their licences, nothing else ({fonts})',
    )
    check(
        all('SIL Open Font License' in (WWW / 'fonts' / f).read_text() for f in ('OFL-Figtree.txt', 'OFL-Faustina.txt'))
        and 'Figtree' in (WWW / 'fonts/OFL-Figtree.txt').read_text()
        and 'Faustina' in (WWW / 'fonts/OFL-Faustina.txt').read_text(),
        'licences: SIL OFL',
    )
    prep = (ROOT / 'scripts/prepare.py').read_text()
    check(
        '8330490a01c60c196eae00b823de8102275aaa5862e7b76a7af21b8745338928' in prep
        and 'df206bf23e42149d22847217c70577855c9eebe5ef9d40706199fc9e5bee3450' in prep,
        'prepare.py downloads both typefaces with a checksum',
    )
    faces = {d.get('font-family'): d for sel, d in blocks if sel == '@font-face'}
    check(
        faces.get('"Figtree"', {}).get('font-weight') == '400 700'
        and faces.get('"Faustina"', {}).get('font-weight') == '500 700'
        and root.get('--font-display') == '"Faustina","Iowan Old Style",Georgia,serif'
        and root.get('--font-ui') == '"Figtree",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
        f'@font-face and the type tokens as specified ({sorted(k for k in faces if k)})',
    )
    tok = css['tokens.css']
    # Colours only in tokens.css, and there only the palette's values (derived tokens with opacity as 8-digit hex)
    literal = re.compile(r'#[0-9A-Fa-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|\b(?:white|black)\b(?!-)')
    outside = [f'app.css: {m.group(0)}' for m in literal.finditer(re.sub(r'/\*.*?\*/', '', css['app.css'], flags=re.S))]
    outside += [f'index.html: {m.group(0)}' for m in literal.finditer(re.sub(r'<!--.*?-->', '', (WWW / 'index.html').read_text(), flags=re.S))]
    outside += [
        f'{f.name}: {m.group(0)}'
        for f in (WWW / 'js').rglob('*.js')
        for m in re.finditer(r'#[0-9A-Fa-f]{6}\b|\b(?:rgba?|hsla?|oklch)\(', f.read_text())
    ]
    tok = re.sub(r'/\*.*?\*/', '', css['tokens.css'], flags=re.S)
    foreign = [c for c in re.findall(r'#[0-9A-Fa-f]{3,8}\b', tok) if c[:7].upper() not in PALETTE_HEX or len(c) not in (7, 9)]
    foreign += re.findall(r'\b(?:rgba?|hsla?|oklch)\(', tok)
    check(not outside and not foreign, f'colours only in tokens.css and only from the palette ({outside + foreign})')
    check(
        set(colors_in((WWW / 'webview-update.html').read_text())) == {'#EEEDE7', '#25261F', '#1B1C17', '#ECECE3'},
        'webview-update.html (without light-dark()): background and type from the palette',
    )
    res = ROOT / 'app/native/res'
    android = [
        (str(f.relative_to(res)), c)
        for f in res.rglob('*.xml')
        if str(f.relative_to(res)) not in VECTORS
        for c in colors_in(f.read_text())
        if c not in PALETTE_HEX
    ]
    check(
        not android and colors_in((ROOT / 'design/render-icons.py').read_text()) == [],
        f'Android resources use the palette\u2019s values only, apart from the logo vectors ({android})',
    )
    # Animation as movement and opacity within the shape only: no fill, no shadow, no border in @keyframes
    frames = {n: body for text in css.values() for n, body in keyframes(text).items()}
    loud = [
        f'{n}: {p}'
        for n, body in frames.items()
        for _, decls in css_rules(body)
        for p, _ in decls
        if re.match(r'background(?!-position)|box-shadow|outline|border(-[a-z]+)?-color|filter', p)
    ]
    check(
        frames and not loud,
        f'@keyframes with movement and opacity only, without background and shadow ({len(frames)} animations){": " + ", ".join(loud) if loud else ""}',
    )
    # Nothing fades at a scroll edge (PROJECT.md, „Building blocks“): a gradient only in the mood picture's mask and
    # the loading shimmer, a mask only in the mood picture
    shades = sorted({(sel, p) for sel, decls in css_rules(css['app.css']) for p, v in decls if 'gradient' in v or 'mask' in p})
    check(
        shades == [('.mood', '-webkit-mask-image'), ('.mood', 'mask-image'), ('.skel', 'background')],
        f'no fade at an edge: gradients only in .mood and .skel, a mask only in .mood ({shades})',
    )
    focus = [d for f, text in css.items() for sel, decls in css_rules(text) if 'focus' in sel for d in decls if d[0] == 'border-radius']
    ring = [d for sel, d in css_blocks(css['app.css']) if sel == ':focus-visible' and 'outline' in d]
    check(not focus and ring, f'focus rings follow the radius: an outline and no radius of their own on focus ({focus})')
    check(
        'data-logo' not in (WWW / 'index.html').read_text()
        and 'data-logo' not in (WWW / 'js/main.js').read_text()
        and "from './logo.js'" not in (WWW / 'js/main.js').read_text(),
        'header without a logo: nothing in index.html and main.js',
    )


FAUSTINA = '.brand, .card h2, .page-title, .bar-title, .sh-head h2, .welcome h2, .tl-date b, .pct, .cnt b, .thumb'


# The padding each recipe measures in the page. This catches an inline style, or a later rule that restyles a
# recipe, which the static parse cannot see.
INSETS = {
    '.card': '18px 18px 8px',
    '.group': '4px 16px',
    '.row, .pend, .card-btn': '10px 0px',
    '.box, .banner': '12px',
    '.tile': '10px 0px 8px',
    '.btn, .field:not(.in-row, .pick .field, .search .field)': '12px 16px',
    '.chip, .field.in-row, .toast button, .cam-hint': '8px 16px',
    '.badge:not(.ic-only)': '4px 10px',
    '.seg': '4px',
    '.seg button': '8px 6px',
}
FIGURES_JS = '.num, .tl-time, .pct, .cnt b, .share, .day .dn, .steps .n, .field.code'


SCAN = """([allowed, insets, figures]) => { const bad = [], seen = new Set();
  const rgba = c => { const m = (c.match(/[\\d.]+/g) || []).map(Number); return [m[0] || 0, m[1] || 0, m[2] || 0, m.length > 3 ? m[3] : 1]; };
  const lum = c => { const f = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const probe = document.createElement('i'); probe.style.color = 'var(--faint)'; document.body.append(probe);
  const faint = getComputedStyle(probe).color; probe.remove();
  const ratio = el => { // type with its opacity against the surfaces beneath
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
    if (el.id !== 'f-code' && s.textTransform !== 'none') bad.push('uppercase ' + tag);
    if (el.id !== 'f-code' && s.letterSpacing !== 'normal' && parseFloat(s.letterSpacing) > 0) bad.push('letter-spaced ' + tag);
    if (!own && el.tagName !== 'INPUT') continue;
    const size = parseFloat(s.fontSize), lead = Math.round(parseFloat(s.lineHeight) / size * 100) / 100;
    if (![12, 14, 16, 21, 30].includes(size) || !['400', '600', '650'].includes(s.fontWeight) || ![1.1, 1.25, 1.4, 1.5].includes(lead))
      bad.push(`type ${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${tag}`);
    if (s.letterSpacing !== 'normal' && el.id !== 'f-code' && !(size === 30 && s.letterSpacing === '-0.45px')) bad.push(`tracking ${s.letterSpacing} ${tag}`);
    if (el.matches(figures) && s.fontVariantNumeric !== 'tabular-nums') bad.push('proportional figures ' + tag);
    if (s.color !== faint && s.visibility === 'visible' && !el.closest(':disabled')) { const r = ratio(el); if (r < 4.5) bad.push(`contrast ${r.toFixed(2)} ${tag}`); }
    const fam = s.fontFamily.split(',')[0].replace(/"/g, '');
    if (fam === 'Faustina') { if (!el.closest(allowed)) bad.push('Faustina on ' + tag); seen.add(allowed.split(', ').find(a => el.closest(a))); }
    else if (fam !== 'Figtree') bad.push(fam + ' on ' + tag);
  }
  for (const [sel, pad] of Object.entries(insets)) for (const b of document.querySelectorAll(sel))
    if (b.getClientRects().length && getComputedStyle(b).padding !== pad) bad.push(`inset ${sel} ${getComputedStyle(b).padding}`);
  return {bad: [...new Set(bad)], seen: [...seen]}; }"""


async def test_rules(browser, url):
    print('design rules in every view')
    pictures = make_pictures()
    for scheme in ('light', 'dark'):
        ctx = await phone(browser, scheme)
        pg, errors = await open_page(ctx, url, choose=False)
        await pg.evaluate('document.fonts.ready')
        seen, bad = set(), []

        async def scan():
            r = await pg.evaluate(SCAN, [FAUSTINA, INSETS, FIGURES_JS])
            bad.extend(r['bad'])
            seen.update(r['seen'])

        await scan()  # Willkommen beim ersten Start: Wahl des Modus
        await pg.click('[data-action=mode-local]')
        await idle(pg)
        await scan()  # Willkommen
        top = await pg.eval_on_selector(
            '.top',
            """t => { const b = t.querySelector('.brand'), s = getComputedStyle(b);
          return [t.querySelectorAll('svg, img, [data-logo]').length - t.querySelectorAll('.top-end svg').length, b.innerText, b.children.length,
            s.fontFamily.split(',')[0].replace(/"/g, ''), s.fontWeight, s.fontSize, s.lineHeight, s.letterSpacing]; }""",
        )
        check(
            top == [0, 'Schmeckt’s?', 0, 'Faustina', '650', '30px', '33px', '-0.45px'],
            f'header ({scheme}): the wordmark only, Faustina 650, 30px ({top})',
        )
        logo = await pg.eval_on_selector_all(
            '.welcome .hero img', "l => l.filter(i => i.getClientRects().length).map(i => [i.getAttribute('src'), i.naturalWidth > 0, i.offsetWidth])"
        )
        want = 'img/schmeckts-mark.svg' if scheme == 'light' else 'img/schmeckts-mark-dark.svg'
        check(logo == [[want, True, 104]], f'welcome screen ({scheme}): the mark for this scheme ({logo})')
        vs = await pg.evaluate('getComputedStyle(document.body).fontVariationSettings')
        check(vs == 'normal', f'body: no font-variation-settings, Faustina has no axis of its own ({vs})')
        await pg.click('[data-action=demo]')
        await idle(pg)
        if await pg.query_selector('[data-action=close-week]'):  # „Letzte Woche“ only exists Monday to Wednesday
            await pg.click('[data-action=close-week]')
            await idle(pg)
        await pg.click('[data-action=expand][data-v=shop]')
        await pg.click('[data-action=expand][data-v=ins]')
        await idle(pg)
        await scan()  # Startseite mit allem
        layout = await pg.evaluate("""(() => { const app = getComputedStyle(document.querySelector('.app')), probe = document.createElement('i');
          probe.style.cssText = 'background:var(--surface);color:var(--ink)'; document.body.append(probe); const p = getComputedStyle(probe);
          const cards = [...document.querySelectorAll('#home > section')];
          const out = {app: [app.maxWidth, app.paddingLeft, app.paddingRight], cards: cards.map(c => { const s = getComputedStyle(c), h = getComputedStyle(c.querySelector('h2'));
            return [c.classList.contains('card'), s.backgroundColor === p.backgroundColor, s.backgroundImage, s.borderRadius, s.padding, s.boxShadow, s.borderTopWidth, s.borderBottomWidth,
              c.firstElementChild.tagName, h.fontFamily.split(',')[0].replace(/"/g, ''), h.fontWeight, h.fontSize, h.lineHeight, h.letterSpacing, h.color === p.color].join('|'); }),
            gaps: cards.slice(1).map((c, i) => Math.round(c.getBoundingClientRect().top - cards[i].getBoundingClientRect().bottom))};
          probe.remove(); return out; })()""")
        want = 'true|true|none|24px|18px 18px 8px|none|0px|0px|H2|Faustina|600|21px|26.25px|normal|true'
        first = want.replace('|H2|', '|BUTTON|')  # overview: the picture on the left, the heading beside it
        check(
            layout['app'] == ['600px', '18px', '18px']
            and len(layout['cards']) == 6
            and layout['cards'][0] == first
            and all(c == want for c in layout['cards'][1:])
            and layout['gaps'] == [14] * 5,
            f'home page ({scheme}): 600px, 18px margin; every card a surface, radius 24px, 18/18/8, without border and shadow, heading Faustina 600 21px on top (overview: beside the picture), 14px apart ({layout["gaps"]})',
        )
        await pg.click('[data-action=open-settings]')
        await idle(pg)
        await scan()
        label = await pg.eval_on_selector(
            '#sheet .label',
            """l => { const s = getComputedStyle(l), probe = document.createElement('i'); probe.style.color = 'var(--muted)'; l.after(probe);
          const c = getComputedStyle(probe).color; probe.remove(); return [s.fontFamily.split(',')[0].replace(/"/g, ''), s.fontWeight, s.fontSize, s.color === c, s.textTransform, s.letterSpacing, l.innerText]; }""",
        )
        check(
            label == ['Figtree', '600', '14px', True, 'none', 'normal', 'Tiere'],
            f'field label: Figtree 600, 14px, muted, normal casing ({label})',
        )
        await pg.click('#sheet [data-action=settings-page][data-v=house]')
        await idle(pg)
        await scan()  # the „Haushalt“ page
        await pg.click('#serverBox [data-action=connect-form]')
        await idle(pg)
        await scan()  # Adresse und Code
        await pg.fill('#f-code', 'abcd1234')
        code = await pg.eval_on_selector('#f-code', 'f => [getComputedStyle(f).textTransform, getComputedStyle(f).letterSpacing]')
        check(code[0] == 'uppercase' and float(code[1][:-2]) > 0, f'the exception: the household code field ({code})')
        await pg.click('#sheet [data-action=settings-back]')
        await idle(pg)
        await pg.click('#sheet [data-action=settings-back]')
        await idle(pg)
        await pg.click('#fab')
        await idle(pg)
        await scan()
        await pg.click('[data-action=close]')
        await idle(pg)
        await pg.click('[data-sec=shop] [data-action=open-product]')
        await idle(pg)
        await scan()
        await pg.click('[data-action=close]')
        await idle(pg)
        await pg.click('.tl [data-action=open-serving]')
        await idle(pg)
        await scan()
        await pg.click('[data-action=close]')
        await idle(pg)
        await pg.click('[data-action=open-settings]')
        await idle(pg)
        await pg.click('#sheet [data-action=edit-pet]')
        await idle(pg)
        await scan()  # the pet sheet
        await pg.set_input_files('#petPhotoInput', pictures[1])
        await pg.wait_for_selector('#sheet .crop img')
        await idle(pg)
        await scan()
        await pg.click('[data-action=crop-cancel]')
        await idle(pg)
        await pg.click('#sheet [data-action=settings-back]')
        await idle(pg)
        await pg.click('#sheet [data-action=settings-back]')
        await idle(pg)
        await pg.click('#fab')
        await idle(pg)
        await pg.click('#sheet [data-action=photo]')
        await pg.wait_for_selector('#camera[open]')
        await idle(pg)
        await scan()
        await pg.click('[data-cam=cancel]')
        await idle(pg)
        check(
            not bad,
            f'Figtree everywhere and Faustina only in the places laid down, no uppercase, no letter-spacing, every piece of type at 4.5:1 ({scheme}): {bad}',
        )
        check(seen == set(FAUSTINA.split(', ')), f'Faustina on the wordmark, headings, day lines, percentages, counters, initials ({sorted(seen)})')
        check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
        await ctx.close()


SMALL_ICONS = '.btn:not(.fab) .ic, .chip > .ic, .seg button .ic, .sugg > .ic, .set-row .chev, .prod-card .edit .ic, .search .ic, .pick .ic'
ICONS = """sel => [...document.querySelectorAll(sel)].filter(i => i.getClientRects().length).map(i => { const r = i.getBoundingClientRect(), box = i.closest('.pick, .sugg, .prod-card, .search'),
    b = (box?.querySelector('.field') || box)?.getBoundingClientRect(), left = !!i.closest('.search');
  return {where: i.closest('[class]:not(svg)').className, w: r.width, h: r.height, stroke: getComputedStyle(i).strokeWidth,
    edge: b ? Math.round((left ? r.left - b.left : b.right - r.right) * 10) / 10 : null, mid: b ? Math.abs((r.top + r.bottom) / 2 - (b.top + b.bottom) / 2) < .6 : null}; })"""


async def test_polish(browser, url):
    print('polish: small icons consistent, the „Serviert von“ select field, the gap under the wordmark')
    ctx = await phone(browser)
    pg, errors = await open_page(ctx, url)
    await pg.click('[data-action=demo]')
    await idle(pg)
    gap = await pg.evaluate(
        "[getComputedStyle(document.querySelector('.top')).paddingBottom, document.querySelector('#home > section').getBoundingClientRect().top - document.querySelector('.top').getBoundingClientRect().bottom]"
    )
    check(gap == ['10px', 0], f'home page: 10px from the wordmark to the first card, 8px more than before ({gap})')
    icons = []
    await pg.click('.pend-head')
    await idle(pg)
    # ::backdrop is not an element, so the reduced-motion rule has to name it: without that the sheet's dimming
    # still faded in for 350 ms while everything else stood still.
    dimming = await pg.evaluate("getComputedStyle(document.getElementById('sheet'), '::backdrop').animationDuration")
    check(float(dimming.rstrip('s')) < 0.01, f'reduced motion reaches the sheet’s dimming too (::backdrop {dimming})')
    pick = [i for i in await pg.evaluate(ICONS, '.pick .ic')]
    check(
        pick == [{'where': 'pick', 'w': 20, 'h': 20, 'stroke': '1.8px', 'edge': 14, 'mid': True}],
        f'select icon on „Serviert von“: 20px, the icon set\u2019s stroke width, 14px from the right edge, vertically centred ({pick})',
    )
    check(
        await pg.eval_on_selector('#f-time', 'f => getComputedStyle(f).appearance') == 'none',
        'the field does not draw the system\u2019s own arrow beside it (Android)',
    )
    await shot(pg, 'select-field')
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    await pg.click('[data-action=edit-name]')
    await idle(pg)
    await pg.fill('#f-variety', '')
    await pg.fill('#f-brand', 'She')
    await idle(pg)
    await pg.wait_for_selector('#sheet .sugg')
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    await pg.click('[data-action=close]')
    await idle(pg)
    await pg.click('[data-action=open-settings]')
    await idle(pg)
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    await pg.click('#sheet [data-action=edit-pet]')
    await idle(pg)
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    await pg.click('#sheet [data-action=settings-back]')
    await idle(pg)
    await pg.click('#fab')
    await idle(pg)
    icons += await pg.evaluate(ICONS, SMALL_ICONS)
    kinds = {i['where'].split()[0] for i in icons}
    odd = [i for i in icons if (i['w'], i['h'], i['stroke']) != (20, 20, '1.8px') or i['edge'] not in (None, 14) or i['mid'] is False]
    check(
        {'pick', 'box', 'edit', 'row', 'btn', 'chip'} <= kinds and not odd,
        f'select fields, arrows in rows and small icons in buttons: 20px, stroke width 1.8, 14px from the edge in boxes and vertically centred ({len(icons)} icons, {sorted(kinds)}) {odd[:3]}',
    )
    check(not errors, 'no errors in the console' + (f': {errors}' if errors else ''))
    await ctx.close()


def test_pack():
    """The sources in two files: unpacked together they make up the same working tree again"""
    sys.path.insert(0, str(ROOT / 'scripts'))
    import pack
    import unpack

    with tempfile.TemporaryDirectory() as tmp:
        with contextlib.redirect_stdout(io.StringIO()):
            pack.main(tmp)
            for name in ('schmeckts-sources.txt', 'schmeckts-server-sources.txt'):
                unpack.unpack(f'{tmp}/{name}', f'{tmp}/tree')
        names = {
            name: re.findall(r'^===== FILE: (.+) \(\d+ characters\) =====$', pathlib.Path(tmp, name).read_text(encoding='utf-8'), re.M)
            for name in ('schmeckts-sources.txt', 'schmeckts-server-sources.txt')
        }

        def server(rel):
            return rel.startswith('server/')

        app, srv = names['schmeckts-sources.txt'], names['schmeckts-server-sources.txt']
        check(
            app[0] == 'PROJECT.md'
            and not any(map(server, app))
            and all(map(server, srv))
            and {'server/main.go', 'server/packaging/debian/control', 'server/build-deb.sh', 'server/README.md'} <= set(srv)
            and {'scripts/unpack.py', 'scripts/pack.py', 'tests/ui_test.py', 'app/www/js/main.js'} <= set(app),
            f'app file with PROJECT.md first, tests and scripts ({len(app)} files), server file with everything under server/ ({len(srv)})',
        )
        want = dict(pack.files())
        got = {p.relative_to(f'{tmp}/tree').as_posix(): p.read_text(encoding='utf-8') for p in pathlib.Path(tmp, 'tree').rglob('*') if p.is_file()}
        check(got == want and len(got) == len(app) + len(srv), f'both files unpacked into the same folder: the same working tree ({len(got)} files)')
        first = pathlib.Path(tmp, 'schmeckts-server-sources.txt').read_text(encoding='utf-8').split('\n', 1)[0]
        check(
            f'version {(ROOT / "server/VERSION").read_text().strip()},' in first,
            f'the server file names the server\u2019s version, which does not change with the app ({first})',
        )


def test_version_code():
    """Every build installs over the ones from before the version restart.

    Android refuses a package whose versionCode is lower than the installed one. Builds before 0.1.0 reached
    10400, so prepare.py lifts every code above that mark."""
    sys.path.insert(0, str(ROOT / 'scripts'))
    import importlib

    prep = importlib.import_module('prepare')
    version = json.loads((ROOT / 'app/package.json').read_text())['version']
    code = 0
    for part in (int(x) for x in version.split('.')):
        code = code * 100 + part
    code += prep.VERSION_OFFSET
    src = (ROOT / 'scripts/prepare.py').read_text(encoding='utf-8')
    # The Gradle line is built from pieces, so a pattern matches it: the formatter may change the quotes around
    # the offset and break the line elsewhere.
    hands_over_offset = re.search(r'def appVersionCode = [\'"]\s*\+\s*str\(VERSION_OFFSET\)', src)
    check(
        code > 10400 and hands_over_offset,
        f'versionCode {code} for version {version} stays above the 10400 of the builds before the restart',
    )


def test_signing_key():
    """scripts/signing-key.py: a round trip keeps the keystore and the password, and older files still read.

    The signing key lives in a GitHub secret as a text file. Files written before the move to English say
    "Passwort:", so read() has to accept both spellings; otherwise a release build cannot sign."""
    sys.path.insert(0, str(ROOT / 'scripts'))
    import importlib

    key = importlib.import_module('signing-key') if 'signing-key' not in sys.modules else sys.modules['signing-key']
    with tempfile.TemporaryDirectory() as tmp:
        jks, pwfile = pathlib.Path(tmp, 'key.jks'), pathlib.Path(tmp, 'pw.txt')
        jks.write_bytes(bytes(range(256)) * 4)
        pwfile.write_text('geheim-123\n', encoding='utf-8')
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            key.create(str(jks), str(pwfile))
        text = out.getvalue()
        for name, body in (('English', text), ('German', text.replace('Password:', 'Passwort:'))):
            src, back = pathlib.Path(tmp, f'{name}.txt'), pathlib.Path(tmp, f'{name}.jks')
            src.write_text(body, encoding='utf-8')
            got = io.StringIO()
            with contextlib.redirect_stdout(got):
                key.read(str(src), str(back))
            check(
                got.getvalue().strip() == 'geheim-123' and back.read_bytes() == jks.read_bytes(),
                f'signing key, {name} wording: keystore and password come back unchanged',
            )


# Exceptions to the spacing scale, each with its reason; there are none now that the room for a field's icon and
# for the feeding button are sums of tokens. env()'s own fallback is no distance either and is taken out before
# the check.
SPACING_ALLOWED = {}
SPACING_PROPS = ('margin', 'padding', 'gap', 'row-gap', 'column-gap')


def test_spacing_scale():
    """Every margin, padding and gap comes from the scale in tokens.css; a literal px value is not allowed."""
    scale = {
        p: v
        for sel, d in css_blocks((WWW / 'css/tokens.css').read_text(encoding='utf-8'))
        if sel == ':root'
        for p, v in d.items()
        if p.startswith('--space-')
    }
    want = ['--space-hair'] + [f'--space-{n}{h}' for n in range(1, 8) for h in ('', 'h') if not (n == 7 and h) and not (n in (5, 6) and h)]
    check(sorted(scale) == sorted(want), f'the scale in tokens.css: {len(scale)} steps ({sorted(scale)})')
    loose = []
    for sel, decls in css_rules((WWW / 'css/app.css').read_text(encoding='utf-8')):
        for prop, value in decls:
            if prop.split('-top')[0].split('-right')[0].split('-bottom')[0].split('-left')[0] not in SPACING_PROPS:
                continue
            bare = re.sub(r'env\([^)]*\)', '', value)
            loose += [f'{sel} {prop}:{value}' for px in re.findall(r'\d+(?:\.\d+)?px', bare) if px not in SPACING_ALLOWED]
    check(not loose, f'every distance in app.css comes from the scale ({len(loose)} do not: {loose[:4]})')


# One radius per role (PROJECT.md, "Principles"): the four tokens, plus the circle. A literal value would put a
# fifth radius into the app, which is how the twelve of them came about in the first place.
RADIUS_ALLOWED = ('50%', '0')


def test_radius_scale():
    """Every border-radius in app.css comes from the tokens in tokens.css; only a circle says 50 %."""
    scale = {
        p: v
        for sel, d in css_blocks((WWW / 'css/tokens.css').read_text(encoding='utf-8'))
        if sel == ':root'
        for p, v in d.items()
        if p.startswith('--radius-')
    }
    check(
        scale == {'--radius-s': '12px', '--radius-m': '16px', '--radius-l': '24px', '--radius-full': '999px'},
        f'the four radii in tokens.css: small and nested, controls, containers, pills ({scale})',
    )
    loose = []
    for sel, decls in css_rules((WWW / 'css/app.css').read_text(encoding='utf-8')):
        for prop, value in decls:
            if 'radius' not in prop:
                continue
            loose += [f'{sel} {prop}:{value}' for part in value.split() if part not in RADIUS_ALLOWED and not part.startswith('var(--radius-')]
    check(not loose, f'every radius in app.css comes from the tokens ({len(loose)} do not: {loose[:4]})')


# ---------------------------------------------------------------- type
TYPE_STYLES = {
    '--type-title': '650 30px/1.1 var(--font-display)',
    '--type-heading': '600 21px/1.25 var(--font-display)',
    '--type-subheading': '600 16px/1.25 var(--font-display)',
    '--type-body': '400 16px/1.5 var(--font-ui)',
    '--type-body-strong': '600 16px/1.5 var(--font-ui)',
    '--type-small': '400 14px/1.4 var(--font-ui)',
    '--type-small-strong': '600 14px/1.4 var(--font-ui)',
    '--type-caption': '400 12px/1.25 var(--font-ui)',
    '--type-caption-strong': '600 12px/1.25 var(--font-ui)',
}
TYPE_SCALE = ({'12', '14', '16', '21', '30'}, {'1.1', '1.25', '1.4', '1.5'}, {'400', '600', '650'})
# Figures take table figures in the very rule that sets their font, because the font shorthand resets them
FIGURES = {
    '.pct',
    '.ring-mid .pct',
    '.cnt b',
    '.share',
    '.tl-time',
    '.day .dn',
    '.day.has .dn',
    '.day.today .dn',
    '.steps .n',
    '.field.code',
    '.t-main .num',
}
FIGURE_SUBJECT = re.compile(r'\.(pct|share|tl-time|dn|n|num)\b|^b$')
# Type set other than through a style, each with its reason
TYPE_ALLOWED = {
    ('b, strong', 'font-weight', 'var(--weight-strong)'): 'bold in running text is the app’s 600, not the browser’s bolder',
    ('.field.code', 'letter-spacing', 'var(--track-code)'): 'the one positive tracking: the household code is spelled out',
    ('.field.code', 'text-transform', 'uppercase'): 'the household code',
    ('.field.code::placeholder', 'letter-spacing', 'normal'): 'the placeholder is a sentence',
    ('.field.code::placeholder', 'text-transform', 'none'): 'the placeholder is a sentence',
    ('.pct small', 'letter-spacing', 'normal'): 'the Figtree % sign does not take the title’s tracking it inherits in the ring',
    ('.tl-note', 'font-style', 'italic'): 'a note in the timeline is the one quoted text',
}


def test_type_scale():
    """Nine text styles from one scale; app.css sets type only through them (PROJECT.md, "Type")."""
    root = tokens_root()
    styles = {k: v for k, v in root.items() if k.startswith('--type-')}
    check(styles == TYPE_STYLES, f'the nine text styles in tokens.css ({sorted(set(styles.items()) ^ set(TYPE_STYLES.items()))})')
    sizes, leads, weights = TYPE_SCALE
    off = [
        k
        for k, v in styles.items()
        if not (m := re.fullmatch(r'(\d+) (\d+)px ?/ ?([\d.]+) var\(--font-(?:ui|display)\)', v))
        or m[1] not in weights
        or m[2] not in sizes
        or m[3] not in leads
    ]
    check(not off, f'every style from the scale: sizes {sorted(sizes)}, leadings {sorted(leads)}, weights {sorted(weights)} ({off})')
    check(
        {k: root.get(k) for k in ('--weight-strong', '--track-title', '--track-code')}
        == {'--weight-strong': '600', '--track-title': '-0.015em', '--track-code': '0.14em'},
        'bold in running text, the title’s tracking and the code field’s as tokens',
    )
    decls, loose, rules = app_decls(), [], {}
    for _, sel, p, v in decls:
        rules.setdefault(sel, []).append((p, v))
        if (sel, p, v) in TYPE_ALLOWED:
            continue
        if p == 'font' and v != 'inherit' and not (v.startswith('var(') and v[4:-1] in TYPE_STYLES):
            loose.append(f'{sel} font:{v}')
        elif p in ('font-size', 'line-height', 'font-family', 'font-weight', 'font-stretch', 'font-style', 'font-variant', 'text-transform'):
            loose.append(f'{sel} {p}:{v}')
        elif p == 'letter-spacing' and v != 'var(--track-title)':
            loose.append(f'{sel} {p}:{v}')
        elif p == 'font-variant-numeric' and not (sel in FIGURES and v == 'tabular-nums'):
            loose.append(f'{sel} {p}:{v}')
    check(not loose, f'app.css sets type only as font: var(--type-…) ({len(loose)} do not: {loose[:4]})')
    odd = []
    for sel, ds in rules.items():
        d = dict(ds)
        if (d.get('font') == 'var(--type-title)') != (d.get('letter-spacing') == 'var(--track-title)'):
            odd.append(f'{sel}: the title and its tracking')
        if 'font' in d and (sel in FIGURES or any(FIGURE_SUBJECT.search(s) and s != 'b' or s == 'b' and '.cnt' in sel for s in subjects(sel))):
            names = [p for p, _ in ds]
            if sel not in FIGURES or d.get('font-variant-numeric') != 'tabular-nums' or names.index('font-variant-numeric') < names.index('font'):
                odd.append(f'{sel}: a figure takes tabular-nums after its font, in FIGURES')
    check(not odd, f'the title always with its tracking and nowhere else; every figure tabular in its own rule ({odd})')
    js = [
        f.name
        for f in (WWW / 'js').rglob('*.js')
        if re.search(
            r'\.style\.(font\w*|lineHeight|letterSpacing)\b|style="[^"]*\b(font|line-height|letter-spacing)\b', f.read_text(encoding='utf-8')
        )
    ]
    check(not js, f'no type set from JavaScript ({js})')


# ---------------------------------------------------------------- motion
DURATIONS = {'--dur-fade': '200ms', '--dur-step': '300ms', '--dur-long': '1200ms'}
EASINGS = {'--ease-out': 'cubic-bezier(0.22,1,0.36,1)', '--ease-in': 'cubic-bezier(0.5,0,0.75,0)', '--ease-spring': 'cubic-bezier(0.34,1.45,0.64,1)'}
STATE = ('transform', 'opacity', 'color', 'background-color', 'border-color', 'box-shadow')
LIBRARY = {
    'fadeIn': 'a dimming or a ground appears',
    'fadeOut': 'and goes',
    'sheetIn': 'a sheet rises',
    'sheetOut': 'a sheet sinks',
    'pageIn': 'a page, or the level you go to, comes in from the side',
    'pageOut': 'a page, or the level you leave going back, goes out',
    'pageAside': 'the level you leave going deeper moves a quarter aside',
    'pageFromAside': 'and comes back',
    'appear': 'content appears in place',
    'vanish': 'a piece of the home page goes',
    'dropIn': 'a new meal arrives at the top of „Heute“',
    'leave': 'a rated meal folds away',
    'pop': 'a confirmation',
    'bowlFill': 'the bowl in the feeding button',
    'ringFill': 'the ring draws its share',
    'spin': 'waiting',
    'shimmer': 'a line still loading',
}
# Keyframes move and fade; these three do what their purpose needs besides
KEYFRAME_ALLOWED = {
    'ringFill': {'stroke-dashoffset'},
    'shimmer': {'background-position'},
    'leave': {'max-height', 'padding-top', 'padding-bottom', 'border-top-width'},
}
TRANSITION_PART = re.compile(
    r'(transform|opacity|color|background-color|border-color|box-shadow|height) var\(--dur-(fade|step)\) var\(--ease-(out|in|spring)\)'
)
PRESS = ('scale(var(--press))', 'scale(var(--press-wide))')
# The browser names these animations itself, so only their timing can be set, and only from the tokens
MOTION_LONGHANDS = {'::view-transition-group(*)', '::view-transition-group(photo)'}
# Under reduced motion nothing moves: the one place with literal times, and all it may say
REDUCED_RULES = {
    '*,*::before,*::after,::backdrop': {
        'animation-duration': '0.01ms !important',
        'animation-iteration-count': '1 !important',
        'transition-duration': '0.01ms !important',
    },
    'html': {'transition': 'none !important'},
}


def test_motion_scale():
    """Three durations, three curves, one state transition, two presses, a closed library of keyframes (PROJECT.md, "Motion")."""
    root = tokens_root()
    got = {k: v for k, v in root.items() if k.startswith(('--dur-', '--ease-'))}
    check(got == {**DURATIONS, **EASINGS}, f'durations and curves in tokens.css ({sorted(set(got.items()) ^ set({**DURATIONS, **EASINGS}.items()))})')
    check(root.get('--state') == ','.join(f'{p} var(--dur-fade) var(--ease-out)' for p in STATE), f'--state: {STATE} in --dur-fade with --ease-out')
    check(root.get('--press') == '0.95' and root.get('--press-wide') == '0.98', 'two press scales')
    tok, app = (WWW / 'css/tokens.css').read_text(encoding='utf-8'), (WWW / 'css/app.css').read_text(encoding='utf-8')
    frames = keyframes(re.sub(r'/\*.*?\*/', '', tok, flags=re.S))
    check(
        set(frames) == set(LIBRARY) and not keyframes(app),
        f'@keyframes only in tokens.css and only the library ({sorted(set(frames) ^ set(LIBRARY))}, app.css: {sorted(keyframes(app))})',
    )
    loud = [
        f'{n}: {p}'
        for n, body in frames.items()
        for _, ds in css_rules(body)
        for p, _ in ds
        if p not in {'transform', 'opacity'} | KEYFRAME_ALLOWED.get(n, set())
    ]
    check(not loud, f'the library moves and fades, nothing else ({loud})')
    reduced = {' '.join(s.split()).replace(', ', ','): d for s, d in css_blocks(cut_block(re.sub(r'/\*.*?\*/', '', app, flags=re.S), REDUCED)[1])}
    check(reduced == REDUCED_RULES, f'under reduced motion nothing moves, ::backdrop named beside * ({reduced})')
    loose, used = [], set()
    for sec, sel, p, v in app_decls():
        if p == 'transition':
            if v not in ('none', 'var(--state)') and not all(TRANSITION_PART.fullmatch(x) for x in split_top(v)):
                loose.append(f'{sel} transition:{v}')
        elif p == 'animation':
            for part in split_top(v):
                w = part.split()
                if w == ['none']:
                    continue
                name = [x for x in w if x in LIBRARY]
                dur = [x for x in w if re.fullmatch(r'var\(--dur-(fade|step|long)\)', x)]
                ease = [x for x in w if re.fullmatch(r'var\(--ease-(out|in|spring)\)|linear', x)]
                rest = [x for x in w if x not in name + dur + ease and x not in ('both', 'forwards', 'infinite')]
                loop = 'linear' in ease or 'infinite' in w
                if (
                    len(name) != 1
                    or len(dur) != 1
                    or len(ease) != 1
                    or rest
                    or loop
                    and not ('linear' in ease and 'infinite' in w and dur == ['var(--dur-long)'])
                ):
                    loose.append(f'{sel} animation:{part}')
                used.update(name)
        elif p.startswith(('transition-', 'animation-')):
            ok = sel in MOTION_LONGHANDS and (
                p == 'animation-duration'
                and re.fullmatch(r'var\(--dur-(fade|step)\)', v)
                or p == 'animation-timing-function'
                and re.fullmatch(r'var\(--ease-(out|in)\)', v)
            )
            if not ok:
                loose.append(f'{sel} {p}:{v}')
        elif p == 'transform' and sel.endswith(':active') and v not in PRESS:
            loose.append(f'{sel} {p}:{v}')
        if (
            p in ('transition', 'animation') or p.startswith(('transition-', 'animation-')) or p == 'transform' and sel.endswith(':active')
        ) and sec != 'Motion':
            loose.append(f'{sel} {p}: motion lives in the Motion section')
    check(not loose, f'every movement from the tokens and the library, in the Motion section ({len(loose)} not: {loose[:4]})')
    check(used == set(LIBRARY), f'every motion of the library is in use ({sorted(set(LIBRARY) - used)})')


# ---------------------------------------------------------------- layers, lines, sizes, opacity
LAYERS = {'--z-raise': '1', '--z-sticky': '2', '--z-bar': '3', '--z-fab': '4', '--z-strip': '5', '--z-toast': '6'}
SIZES = {
    '--icon-s': '20px',
    '--icon': '24px',
    '--icon-l': '32px',
    '--icon-stroke': '1.8',
    '--icon-stroke-l': '1.4',
    '--tap-s': '44px',
    '--tap': '48px',
    '--control': '52px',
    '--control-l': '56px',
    '--bar': '56px',
    '--col-figure': '52px',
    '--pic-xs': '24px',
    '--pic-s': '32px',
    '--pic-m': '40px',
    '--pic-l': '48px',
    '--pic-xl': '56px',
    '--pic-xxl': '72px',
    '--pic-xxxl': '112px',
    '--page-width': '600px',
    '--gutter': 'var(--space-4h)',
}
LINES = {'--hairline': '1px', '--stroke': '2px', '--divider': 'var(--hairline) solid var(--line)'}
OPACITY = {'--dim': '0.35', '--busy': '0.6', '--mood': '0.16', '--mood-filter': 'saturate(0.85)'}
RING = re.compile(r'(inset )?0 0 0 (var\(--(hairline|stroke)\)|calc\([2-4] \* var\(--stroke\)\)|100vmax) var\(--[\w-]+(,var\(--[\w-]+\))?\)')
MIN_HEIGHT = {'0', 'var(--tap-s)', 'var(--tap)', 'var(--control)', 'var(--control-l)', 'var(--bar)'}
SIZE_PROPS = (
    'width',
    'height',
    'min-width',
    'min-height',
    'max-width',
    'max-height',
    'top',
    'right',
    'bottom',
    'left',
    'inset',
    'stroke-width',
    'flex-basis',
    'transform',
    'scroll-margin-top',
    'grid-template-columns',
    'background-size',
)
# The size of one component that nothing else shares, so it is no token; each with its reason
GEOMETRY_ALLOWED = {
    '.mood': 'the mood picture is 260px tall (PROJECT.md)',
    '.badge': 'a badge without an icon is as tall as one with: the small icon and the inset around it',
    '.pend': 'max-height 900px: where a rated meal starts folding away from',
    '.meter': 'a progress bar is 6px thick',
    '.dots': 'the row of meal dots under a day is 6px tall',
    '.dots i': 'a meal dot, 6px',
    '.tl-node i': 'a meal on the timeline, 12px',
    '.hero': 'the welcome picture, a 148px circle',
    '.hero .logo': 'the mark in it, 104px',
    '.grip': 'the grip of a sheet, 40 by 5',
    '.name-photo': 'the packaging photo while naming, 150px tall',
    '.pp .pp-name': 'names line up in a 64px column before their bars',
    '.field.in-row': 'a field beside a row’s title, about 130px wide (PROJECT.md)',
    '.sw': 'the switch track, 46 by 28',
    '.sw::after': 'its knob, 22, 3 from the edge',
    '[aria-checked="true"] > .sw::after': 'its travel, 18',
    '.ring': 'the evaluation’s ring, 104; views/sheets.js draws it at that size',
    '.ring circle': 'its 10px stroke, the same in views/sheets.js',
    '.ring-mid > span': 'the caption wraps inside the ring, 76 wide',
    '.shutter': 'the camera’s shutter, 78',
    '.crop': 'the crop stage, at most 340',
    '.toast': 'a toast is never wider than 520px',
}
ICON_SIZES = {'var(--icon-s)', 'var(--icon)', 'var(--icon-l)'}


def test_layers_lines_sizes():
    """Layers, lines, rings, shadows, sizes and opacities come from tokens.css (PROJECT.md, "Sizes, lines, layers")."""
    root = tokens_root()
    check({k: root.get(k) for k in LAYERS} == LAYERS and not [k for k in root if k.startswith('--z-') and k not in LAYERS], f'six layers {LAYERS}')
    check(
        {k: root.get(k) for k in SIZES} == SIZES and not [k for k in root if k.startswith(('--pic-', '--icon')) and k not in SIZES],
        'icons, controls and pictures as tokens',
    )
    check(
        {k: root.get(k) for k in {**LINES, **OPACITY}} == {**LINES, **OPACITY} and tokens_root(':root[data-theme="dark"]').get('--mood') == '0.26',
        'lines and opacities as tokens',
    )
    shadows = sorted(k for k in root if 'shadow' in k)
    check(shadows == ['--shadow-high', '--shadow-low'], f'two shadows ({shadows})')
    loose = []
    for _, sel, p, v in app_decls():
        subj = subjects(sel)
        if p == 'z-index' and v not in {f'var({k})' for k in LAYERS} | {'auto'}:
            loose.append(f'{sel} z-index:{v}')
        elif p == 'box-shadow' and v not in ('none', 'var(--shadow-low)', 'var(--shadow-high)') and not all(RING.fullmatch(x) for x in split_top(v)):
            loose.append(f'{sel} box-shadow:{v}')
        elif re.match(r'(border(?!-radius)|outline)', p) and literal_px(v):
            loose.append(f'{sel} {p}:{v}')
        elif p == 'opacity' and v not in ('0', '1', 'var(--dim)', 'var(--busy)', 'var(--mood)'):
            loose.append(f'{sel} opacity:{v}')
        elif p == 'filter' and v not in ('none', 'var(--mood-filter)'):
            loose.append(f'{sel} filter:{v}')
        elif p == 'min-height' and v not in MIN_HEIGHT and sel not in GEOMETRY_ALLOWED:
            loose.append(f'{sel} min-height:{v}')
        elif p == 'stroke-width' and v not in ('var(--icon-stroke)', 'var(--icon-stroke-l)') and sel not in GEOMETRY_ALLOWED:
            loose.append(f'{sel} stroke-width:{v}')
        elif p in ('width', 'height') and any(re.search(r'\.(ic|chev|spin)$', s) for s in subj) and v not in ICON_SIZES and not v.endswith('%'):
            loose.append(f'{sel} {p}:{v} (an icon)')
        elif p in ('width', 'height') and any(re.search(r'\.(av|thumb|sk)\b', s) for s in subj) and not re.fullmatch(r'var\(--pic-\w+\)|100%', v):
            loose.append(f'{sel} {p}:{v} (a picture)')
        elif p in SIZE_PROPS and literal_px(v) and sel not in GEOMETRY_ALLOWED:
            loose.append(f'{sel} {p}:{v}')
        elif p in ('width', 'height', 'min-width', 'min-height', 'grid-template-columns') and re.search(r'(^| )var\(--space-[\w-]+\)( |$)', v):
            loose.append(f'{sel} {p}:{v} (a distance is no size)')
        elif p == 'transform' and not sel.endswith(':active') and re.search(r'scale[XY]?\((?!0\)|1\))', v):
            loose.append(f'{sel} transform:{v} (a scale outside the press and the library)')
    check(not loose, f'layers, lines, rings, shadows, sizes and opacities from tokens.css ({len(loose)} not: {loose[:6]})')
    ring = {(sel, p): v for _, sel, p, v in app_decls() if (sel, p) in (('.ring', 'width'), ('.ring circle', 'stroke-width'))}
    js = (WWW / 'js/views/sheets.js').read_text(encoding='utf-8')
    drawn = [m and m[1] + 'px' for m in (re.search(rf'\b{n} = (\d+)', js) for n in ('RING', 'RING_STROKE'))]
    check(
        drawn == [ring.get(('.ring', 'width')), ring.get(('.ring circle', 'stroke-width'))],
        f'views/sheets.js draws the ring at the size and stroke app.css gives it ({drawn}, {ring})',
    )


# ---------------------------------------------------------------- boxes and sections
# Padding belongs to a recipe. A value means that exact value; None means tokens and env() only (the page
# scaffolding). A new box takes one of these recipes; where none fits, the recipe comes first, here and in PROJECT.md.
PADDING = {
    '.card': 'var(--inset-card)',
    '.group': 'var(--inset-group)',
    '.row': 'var(--inset-row)',
    '.pend': 'var(--inset-row)',
    '.card-btn': 'var(--inset-row)',
    '.box': 'var(--inset-box)',
    '.banner': 'var(--inset-box)',
    '.tile': 'var(--inset-tile)',
    '.btn': 'var(--inset-control)',
    '.field': 'var(--inset-control)',
    '.field.in-row': 'var(--inset-compact)',
    '.pick .field': 'var(--field-room)',
    '.search .field': 'var(--field-room)',
    '.chip': 'var(--inset-compact)',
    '.toast button': 'var(--inset-compact)',
    '.cam-hint': 'var(--inset-compact)',
    '.badge': 'var(--inset-badge)',
    '.seg': 'var(--space-1)',
    '.seg button': 'var(--space-2) var(--space-1h)',
    '.link': 'var(--space-3) 0',
    '.day': 'var(--space-1) 0 var(--space-2)',
    '.toast': 'var(--space-2) var(--space-2) var(--space-2) var(--gutter)',
    '.toast.plain': 'var(--gutter)',
    '.head': '0 var(--gutter)',
    '.tl-date': 'var(--space-2h) 0 var(--space-hair)',
    '.grip-zone': 'var(--space-2h) 0 var(--space-2)',
    '.sync-chip': '0 var(--space-1)',
    '.pets': 'var(--space-2h) var(--space-1) var(--space-3h)',
    '.app': None,
    '.top': None,
    '.sheet-body': None,
    'dialog.sheet.page': None,
    'dialog.sheet.page .sheet-body': None,
    '.cam-bar': None,
    '.viewer[open]': None,
}
VIEWS_FORBIDDEN = re.compile(
    r'(padding|font|line-height|letter-spacing|text-transform|border-radius|box-shadow|z-index|transition|animation|stroke-width|min-height)'
)


def test_boxes():
    """A box pads with its recipe's inset; screens only place recipes (PROJECT.md, "Recipes")."""
    root = tokens_root()
    check(
        all(
            k in root
            for k in (
                '--inset-card',
                '--inset-group',
                '--inset-row',
                '--inset-box',
                '--inset-tile',
                '--inset-control',
                '--inset-compact',
                '--inset-badge',
                '--field-room',
            )
        ),
        'one inset per kind of box in tokens.css',
    )
    decls = app_decls()
    check(
        [s for s in dict.fromkeys(d[0] for d in decls) if s != '(before)'] == list(SECTIONS),
        f'app.css in four sections: {SECTIONS} ({list(dict.fromkeys(d[0] for d in decls))})',
    )
    loose = []
    for sec, sel, p, v in decls:
        if p.startswith('padding') and v != '0':
            want = PADDING.get(sel, KeyError)
            if want is KeyError or (want and v != want) or literal_px(v) or sec == 'Views':
                loose.append(f'{sel} {p}:{v}')
        elif sec == 'Views' and VIEWS_FORBIDDEN.match(p):
            loose.append(f'{sel} {p} (a screen places recipes and styles none)')
        elif (
            sec == 'Views'
            and re.match(r'(width|height|max-width|max-height)$', p)
            and not re.fullmatch(r'auto|none|0|\d+%|\d+ch|min-content|max-content|fit-content', v)
        ):
            loose.append(f'{sel} {p}:{v} (a size belongs to a recipe)')
    check(not loose, f'padding only in the recipes that own it, screens only placing ({len(loose)}: {loose[:6]})')


# ---------------------------------------------------------------- JavaScript
# Delays that measure no movement, each with its reason. Anything that waits for motion uses settled() from js/motion.js.
TIMERS_ALLOWED = {
    ('api.js', '20e3'): 'a request gives up',
    ('store.js', '120'): 'the change hook runs once per burst of edits',
    ('disk.js', '60e3'): 'saving retries at most once a minute',
    ('disk.js', '5e3'): 'first after five seconds',
    ('disk.js', '2'): 'the pause doubling',
    ('native.js', '120e3'): 'installing the scanner gives up',
    ('sync.js', '60e3'): 'the sync runs every minute',
    ('main.js', '60000'): 'the home page is redrawn every minute, so „vor 2 Std.“ stays true',
    ('actions.js', '600'): 'a quick sync shows no spinner',
    ('actions.js', '3500'): 'an armed button disarms again',
    ('actions.js', '400'): 'a note is saved once typing pauses',
    ('ui/toast.js', '2600'): 'how long a message stays to be read',
    ('ui/toast.js', '5200'): 'and one with „Rückgängig“',
    ('ui/splash.js', '2500'): 'the splash screen goes, whatever failed on the way',
    ('views/home.js', '400'): 'a view transition whose callback never ran is skipped',
    ('logic/reminders.js', '250'): 'reminders are reconciled once per burst',
    ('logic/data.js', '2000'): 'the download has started before its address is revoked',
    ('logic/exchange.js', '2000'): 'the download has started before its address is revoked',
}


def js_delays(code):
    """The last argument of every setTimeout and setInterval call, all brackets matched"""
    out = []
    for m in re.finditer(r'\bset(?:Timeout|Interval)\(', code):
        depth, i, parts, cur = 1, m.end(), [], ''
        while depth and i < len(code):
            ch = code[i]
            depth += {'(': 1, '[': 1, '{': 1, ')': -1, ']': -1, '}': -1}.get(ch, 0)
            if ch == ',' and depth == 1:
                parts.append(cur)
                cur = ''
            elif depth:
                cur += ch
            i += 1
        parts = [x.strip() for x in parts + [cur] if x.strip()]
        if len(parts) > 1:
            out.append(parts[-1])
    return out


def test_motion_js():
    """JavaScript states no duration or curve: it starts motion with a class and waits with settled() (PROJECT.md, "Motion")."""
    bad = []
    for f in sorted((WWW / 'js').rglob('*.js')):
        name = f.relative_to(WWW / 'js').as_posix()
        code = re.sub(r'/\*.*?\*/', '', f.read_text(encoding='utf-8'), flags=re.S)
        code = re.sub(r'(?m)(^|[^:\'"`\\])//.*$', r'\1', code)
        bad += [f'{name}: .style.{m[1]}' for m in re.finditer(r'\.style\.(transition\w*|animation\w*)\b', code)]
        bad += [f'{name}: {m[0]}' for m in re.finditer(r'\.animate\(|\b(?:transition|animation)(?:end|start|cancel)\b', code)]
        strings = [m[0] for m in re.finditer(r'([\'"`])(?:(?!\1)[^\\\n]|\\.)*\1', code)]
        bad += [
            f'{name}: {s}'
            for s in strings
            if re.search(r'cubic-bezier|\bease(-in|-out|-in-out)?\b|\bsteps\(', s)
            or re.search(r'\b(transition|animation)\b', s)
            and re.search(r'(?<![\w.])\d*\.?\d+m?s\b', s)
        ]
        bad += [f'{name}: fadeOutDuration without dur()' for _ in re.finditer(r'fadeOutDuration:(?!\s*dur\()', code)]
        consts = dict(re.findall(r'(?:\bconst\s+|\blet\s+|,\s*)([A-Za-z_]\w*)\s*=\s*([^,;\n]+)', code))
        for arg in js_delays(code):
            expr = arg
            for _ in range(2):
                expr = re.sub(r'\b[A-Za-z_]\w*\b', lambda m: consts.get(m[0], m[0]), expr)
            if 'dur(' in expr:
                continue
            for n in re.findall(r'(?<![\w.])\d[\d_]*(?:\.\d+)?(?:e\d+)?', expr):
                if float(n.replace('_', '')) and (name, n) not in TIMERS_ALLOWED:
                    bad.append(f'{name}: waits {arg} = {n}')
    motion = (WWW / 'js/motion.js').read_text(encoding='utf-8') if (WWW / 'js/motion.js').exists() else ''
    check(
        'export function dur(' in motion and 'export function settled(' in motion,
        'js/motion.js: dur() reads a duration token, settled() waits for CSS',
    )
    check(not bad, f'no duration, curve or transition of its own in js/ ({len(bad)}: {bad})')


def test_ratings():
    """The server's overview labels every level of RATINGS, with the app's wording.

    The key alone decides points, wording and icon (PROJECT.md, "Evaluation"), so the two lists must not drift
    apart: the overview would otherwise print "offen" for a level that does have a rating."""
    config = (WWW / 'js/config.js').read_text(encoding='utf-8')
    block = re.search(r'export const RATINGS = \{(.*?)\n\};', config, re.S)
    app = dict(re.findall(r"(\w+):\s*\{label:\s*'([^']+)'", block.group(1) if block else ''))
    go = (ROOT / 'server/overview.go').read_text(encoding='utf-8')
    names = re.search(r'var ratingNames = map\[string\]string\{(.*?)\n\}', go, re.S)
    server = dict(re.findall(r'"(\w+)":\s*"([^"]+)"', names.group(1) if names else ''))
    check(len(app) == 13, f'RATINGS in config.js holds every level ({sorted(app)})')
    check(app == server, f'server/overview.go labels exactly those levels, with the same wording ({sorted(set(app.items()) ^ set(server.items()))})')


def test_isolated_tests():
    """Tests run side by side, so each of them needs phones of its own.

    common.phone() is the only place that makes a browser context, and run_tests checks after every test that
    the contexts it made are closed again. A context made past phone() would skip that check."""
    made = 'browser.' + 'new_context('  # in two pieces, or this line would report itself
    stray = []
    for f in sorted((ROOT / 'tests').glob('*.py')):
        if f.name == 'common.py':
            continue
        stray += [f'{f.name}:{i + 1}' for i, line in enumerate(f.read_text(encoding='utf-8').split('\n')) if made in line]
    common_py = (ROOT / 'tests/common.py').read_text(encoding='utf-8')
    check(common_py.count(made) == 1, 'tests/common.py makes a browser context in exactly one place (phone())')
    check(not stray, f'no test makes one past it, so no phone is shared ({stray})')


def test_prompt():
    """Photo recognition belongs to the server: it holds prompt and key, the app has neither."""
    text = (ROOT / 'server/recognize-prompt.txt').read_text(encoding='utf-8').strip()
    go = (ROOT / 'server/recognize.go').read_text(encoding='utf-8')
    check(
        len(text) > 100 and '//go:embed recognize-prompt.txt' in go and text.split('\n')[0] not in go,
        'the server embeds the prompt from recognize-prompt.txt and keeps it nowhere else',
    )
    app = '\n'.join(p.read_text(encoding='utf-8') for p in sorted(WWW.rglob('*.js')))
    check(
        'api.anthropic.com' not in app
        and 'data-setting="aiKey"' not in app
        and not (WWW / 'js/prompt.js').exists()
        and text.split('\n')[0] not in app,
        'the app has no key of its own for photo recognition, and no prompt',
    )


async def test_files(browser, url):
    test_logo_files()
    test_rules_static()
    test_pack()
    test_spacing_scale()
    test_radius_scale()
    test_type_scale()
    test_motion_scale()
    test_layers_lines_sizes()
    test_boxes()
    test_motion_js()
    test_ratings()
    test_isolated_tests()
    test_prompt()
    test_signing_key()
    test_version_code()


run_tests({'files': test_files, 'palette': test_palette, 'logo': test_logo, 'views': test_rules, 'polish': test_polish}, camera=('views',))
