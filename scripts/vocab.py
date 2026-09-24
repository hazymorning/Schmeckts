#!/usr/bin/env python3
"""Generate app/www/js/vocab.js from the Open Pet Food Facts export.

Run this on your own machine, not inside a coding agent: it downloads ~3 MB.

    python3 scripts/vocab.py                 # downloads the export, writes app/www/js/vocab.js
    python3 scripts/vocab.py path/to/export.csv[.gz]   # uses a local copy instead

The export is the nightly CSV dump of Open Pet Food Facts (Open Database License, ODbL):
https://static.openpetfoodfacts.org/data/en.openpetfoodfacts.org.products.csv.gz

What comes out is a word list, not a catalogue: brands that occur on at least MIN_BRAND_PRODUCTS products, and
words of product names that occur in at least MIN_WORD_PRODUCTS products, each in its most common spelling.
`js/ocr.js` uses both to put misread words right; the hand-kept BRANDS list in config.js keeps precedence.
"""

import csv
import gzip
import io
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

URL = 'https://static.openpetfoodfacts.org/data/en.openpetfoodfacts.org.products.csv.gz'
OUT = Path(__file__).resolve().parent.parent / 'app' / 'www' / 'js' / 'vocab.js'
MIN_BRAND_PRODUCTS = 3
MIN_WORD_PRODUCTS = 2
MIN_WORD_LEN = 3
MAX_BRAND_LEN = 30
# products from these markets feed the word list: German packaging is German and English, and words from
# other languages (French, Spanish) would only invite wrong corrections. Brands are counted worldwide.
MARKETS = ('germany', 'austria', 'switzerland', 'united-kingdom', 'united-states', 'ireland', 'australia', 'canada', 'new-zealand')
# packaging words that are too short or too generic to reach the thresholds, and words we always want
EXTRA_WORDS = (
    'mit in und ohne für Sauce Soße Gelee Jelly Pastete Ragout Royal Adult Kitten Senior Junior Sterilised '
    'Sterilized Indoor Menü Mousse Terrine Stückchen Häppchen Filets Filet Snack Sticks Dose Beutel'
).split()
WORD = re.compile(r"[^\W\d_]+(?:['’-][^\W\d_]+)*", re.UNICODE)
JUNK_BRAND = re.compile(r'\d|www\.|http|@|\bgmbh\b|\bltd\b|\binc\b|\bsa\b', re.IGNORECASE)


def read_export(path):
    if path:
        data = Path(path).read_bytes()
    else:
        print('downloading', URL, file=sys.stderr)
        with urllib.request.urlopen(URL, timeout=120) as r:
            data = r.read()
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    text = data.decode('utf-8', errors='replace')
    csv.field_size_limit(10**9)
    return list(csv.DictReader(io.StringIO(text), delimiter='\t', quoting=csv.QUOTE_NONE))


def best_spelling(variants):
    """The spelling seen most often, except that a capitalised spelling beats an all-lower or all-caps one
    that is not at least twice as common: the word ends up in a variety name, and packaging shouts."""

    def key(item):
        s, n = item
        plain = not s.isupper() and not s.islower()
        return (n * (2 if plain else 1), plain, -len(s))

    return max(variants.items(), key=key)[0]


def main():
    rows = read_export(sys.argv[1] if len(sys.argv) > 1 else None)
    brand_count = Counter()
    brand_spell = defaultdict(Counter)
    word_count = Counter()
    word_spell = defaultdict(Counter)
    products = 0
    market_products = 0
    for r in rows:
        name = (r.get('product_name') or '').strip()
        brand = (r.get('brands') or '').split(',')[0].strip()
        if not name or not brand:
            continue
        products += 1
        if len(brand) <= MAX_BRAND_LEN and not JUNK_BRAND.search(brand):
            brand_count[brand.lower()] += 1
            brand_spell[brand.lower()][brand] += 1
        if not any(m in (r.get('countries_tags') or '') for m in MARKETS):
            continue
        market_products += 1
        seen = set()
        for w in WORD.findall(name):
            if len(w) < MIN_WORD_LEN:
                continue
            k = w.lower()
            if k in seen:
                continue
            seen.add(k)
            word_count[k] += 1
            word_spell[k][w] += 1

    brands = sorted(
        (best_spelling(brand_spell[k]) for k, n in brand_count.items() if n >= MIN_BRAND_PRODUCTS),
        key=str.lower,
    )
    brand_keys = {b.lower() for b in brands}
    words = {}
    for k, n in word_count.items():
        if n >= MIN_WORD_PRODUCTS and k not in brand_keys:
            words[k] = best_spelling(word_spell[k])
    for w in EXTRA_WORDS:
        words[w.lower()] = w  # our spelling wins for these
    word_list = sorted(words.values(), key=str.lower)

    def js_array(items):
        lines, line = [], ''
        for s in items:
            item = "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "',"
            if len(line) + len(item) + 1 > 110:
                lines.append(line.rstrip())
                line = ''
            line += ' ' + item
        if line:
            lines.append(line.rstrip())
        return '[\n' + '\n'.join(lines) + '\n]'

    out = (
        '/* generated by scripts/vocab.py, do not edit\n'
        f'   Source: Open Pet Food Facts export, {date.today().isoformat()}, {products} products with brand and name,\n'
        f'   {market_products} of them sold in {", ".join(MARKETS)}.\n'
        '   Licence: Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/\n'
        '   Attribution: "Contains information from Open Pet Food Facts, which is made available here under the\n'
        '   Open Database License (ODbL)."\n'
        f'   VOCAB_BRANDS: brands on at least {MIN_BRAND_PRODUCTS} products ({len(brands)}).\n'
        f'   VOCAB_WORDS: words of product names on at least {MIN_WORD_PRODUCTS} of those market products ({len(word_list)}),\n'
        '   plus a few\n'
        '   packaging words. Each in its most common spelling. Used by js/ocr.js to put misread words right;\n'
        '   BRANDS in config.js keeps precedence. */\n'
        f'export const VOCAB_BRANDS = {js_array(brands)};\n'
        f'export const VOCAB_WORDS = {js_array(word_list)};\n'
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(out, encoding='utf-8')
    print(f'{OUT}: {len(brands)} brands, {len(word_list)} words, {len(out.encode())} bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
