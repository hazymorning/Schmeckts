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
    app = '\n'.join(p.read_text(encoding='utf-8') for p in sorted(WWW.rglob('*.js')))
    check(
        len(text) > 100 and 'api.anthropic.com' not in app and text.split('\n')[0] not in app,
        'the recognition prompt and the API are only on the server',
    )


for test in (test_version_code, test_signing_key, test_server_version, test_prompt):
    test()
sys.exit(1 if failures else 0)
