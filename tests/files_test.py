#!/usr/bin/env python3
"""Checks across files that need no browser. Usage: python3 tests/files_test.py"""

import contextlib
import importlib
import io
import json
import pathlib
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from common import ROOT, WWW, check, failures

sys.path.insert(0, str(ROOT / 'scripts'))


def test_version_code():
    # Android refuses a lower versionCode than the installed one; builds before 0.1.0 reached 10400
    prep = importlib.import_module('prepare')
    code = 0
    for part in json.loads((ROOT / 'app/package.json').read_text())['version'].split('.'):
        code = code * 100 + int(part)
    code += prep.VERSION_OFFSET
    src = (ROOT / 'scripts/prepare.py').read_text(encoding='utf-8')
    check(code > 10400 and re.search(r'def appVersionCode = [\'"]\s*\+\s*str\(VERSION_OFFSET\)', src), f'versionCode {code} above 10400')


def test_signing_key():
    # the GitHub secret was written with "Passwort:", so both spellings have to read
    key = importlib.import_module('signing-key')
    with tempfile.TemporaryDirectory() as tmp:
        jks, pwfile = pathlib.Path(tmp, 'key.jks'), pathlib.Path(tmp, 'pw.txt')
        jks.write_bytes(bytes(range(256)) * 4)
        pwfile.write_text('geheim-123\n', encoding='utf-8')
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            key.create(str(jks), str(pwfile))
        for name, body in (('English', out.getvalue()), ('German', out.getvalue().replace('Password:', 'Passwort:'))):
            src, back = pathlib.Path(tmp, f'{name}.txt'), pathlib.Path(tmp, f'{name}.jks')
            src.write_text(body, encoding='utf-8')
            got = io.StringIO()
            with contextlib.redirect_stdout(got):
                key.read(str(src), str(back))
            check(got.getvalue().strip() == 'geheim-123' and back.read_bytes() == jks.read_bytes(), f'signing key round trip ({name})')


def test_server_version():
    version = (ROOT / 'server/VERSION').read_text(encoding='utf-8').strip()
    changelog = re.match(r'schmeckts-server \(([^)]+)\)', (ROOT / 'server/packaging/debian/changelog').read_text(encoding='utf-8'))
    metainfo = re.search(r'<release version="([^"]+)"', (ROOT / 'server/packaging/de.schmeckts.server.metainfo.xml').read_text(encoding='utf-8'))
    check(changelog and metainfo and changelog[1] == metainfo[1] == version, f'server {version}: VERSION, changelog and metainfo agree')


def test_prompt():
    text = (ROOT / 'server/recognize-prompt.txt').read_text(encoding='utf-8').strip()
    app = (WWW / 'js/ai.js').read_text(encoding='utf-8')
    check(len(text) > 100 and f'`{text}`' in app, 'the phone with its own key asks as the server does')


def test_android():
    a = '{http://schemas.android.com/apk/res/android}'
    res = ROOT / 'app/native/res'
    root = ET.parse(res / 'xml/shortcuts.xml').getroot()
    links = [x.find('intent').get(a + 'data') for x in root.findall('shortcut')]
    labels = {'@string/' + n for n in re.findall(r'name="(\w+)"', (res / 'values/strings_shortcuts.xml').read_text())}
    ok = all(
        (res / f'drawable/{x.get(a + "icon").split("/")[1]}.xml').exists()
        and {x.get(a + 'shortcutShortLabel'), x.get(a + 'shortcutLongLabel')} <= labels
        and x.find('intent').get(a + 'targetClass') == 'de.schmeckts.app.MainActivity'
        for x in root.findall('shortcut')
    )
    check(links == ['schmeckts://feed', 'schmeckts://scan', 'schmeckts://photo'] and ok, f'shortcuts with icons and labels {links}')
    prep = (ROOT / 'scripts/prepare.py').read_text()
    main = (ROOT / 'app/native/java/de/schmeckts/app/MainActivity.java').read_text()
    check(
        all(x in prep for x in ('android:scheme="schmeckts"', '@xml/shortcuts', 'barcode_ui', '.FeedReceiver', 'BOOT_COMPLETED'))
        and all(f'registerPlugin({x}.class)' in main for x in ('PhotoPlugin', 'FeedReminderPlugin')),
        'manifest patches and plugins registered',
    )


for test in (test_version_code, test_signing_key, test_android, test_server_version, test_prompt):
    test()
sys.exit(1 if failures else 0)
