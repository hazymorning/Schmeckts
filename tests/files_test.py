#!/usr/bin/env python3
"""Checks across files that need no build. Usage: python3 tests/files_test.py"""

import contextlib
import importlib
import io
import pathlib
import re
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
SRC = APP / 'src/main'
failures = []
sys.path.insert(0, str(ROOT / 'scripts'))


def check(cond, text):
    print(('  ok   ' if cond else '  FAIL ') + text)
    if not cond:
        failures.append(text)
    return cond


def version():
    return re.search(r'^version=(\S+)$', (APP / 'gradle.properties').read_text(encoding='utf-8'), re.M)[1]


def test_version_code():
    # Android refuses a lower versionCode than the installed one; builds before 0.1.0 reached 10400
    code = 0
    for part in version().split('.'):
        code = code * 100 + int(part)
    build = (APP / 'build.gradle.kts').read_text(encoding='utf-8')
    formula = 'versionCode = 20000 + appVersion.split(".").fold(0) { acc, n -> acc * 100 + n.toInt() }'
    check(20000 + code > 10400 and formula in build and 'versionName = appVersion' in build, f'versionCode {20000 + code} above 10400')
    check(
        not re.search(r'^\s*version\s*=', build, re.M) and 'version' not in (APP / 'settings.gradle.kts').read_text(encoding='utf-8'),
        f'the version {version()} lives only in app/gradle.properties',
    )


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
    app = (SRC / 'kotlin/de/schmeckts/app/Ai.kt').read_text(encoding='utf-8')
    check(len(text) > 100 and f'"""{text}"""' in app, 'the phone with its own key asks as the server does')


def test_android():
    a = '{http://schemas.android.com/apk/res/android}'
    res = SRC / 'res'
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
    manifest = ET.parse(SRC / 'AndroidManifest.xml').getroot()
    app = manifest.find('application')
    activity = {x.get(a + 'name'): x for x in app.findall('activity')}.get('.MainActivity')
    filters = [] if activity is None else activity.findall('intent-filter')

    def accepts(action, **data):
        return any(
            any(x.get(a + 'name') == action for x in f.findall('action'))
            and any(all(d.get(a + k) == v for k, v in data.items()) for d in f.findall('data'))
            for f in filters
        )

    receivers = {x.get(a + 'name'): x for x in app.findall('receiver')}
    boot = {name: {x.get(a + 'name') for f in r.findall('intent-filter') for x in f.findall('action')} for name, r in receivers.items()}
    check(
        activity is not None
        and activity.get(a + 'launchMode') == 'singleTask'
        and accepts('android.intent.action.VIEW', scheme='schmeckts')
        and accepts('android.intent.action.VIEW', mimeType='application/json')
        and accepts('android.intent.action.SEND', mimeType='application/json')
        and any(m.get(a + 'resource') == '@xml/shortcuts' for m in activity.findall('meta-data')),
        'MainActivity takes the deep links, exchange files and shortcuts',
    )
    check(
        any(m.get(a + 'value') == 'barcode_ui' for m in app.findall('meta-data'))
        and all(
            {'android.intent.action.BOOT_COMPLETED', 'android.intent.action.MY_PACKAGE_REPLACED'} <= boot.get(r, set())
            for r in ('.FeedReceiver', '.RateReceiver')
        ),
        'scanner module with the app, reminders set again after a restart and an update',
    )


for test in (test_version_code, test_signing_key, test_android, test_server_version, test_prompt):
    test()
sys.exit(1 if failures else 0)
