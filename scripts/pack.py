#!/usr/bin/env python3
"""Packs all sources into two text files, for passing the project on:
dist/schmeckts-sources.txt         app, tests, scripts, PROJECT.md (first, so that it gets read first)
dist/schmeckts-server-sources.txt  server/, which is everything the server is
The server file only changes with the server, which is why its header names the server's version. Left out is
everything scripts/prepare.py or the build regenerates (node_modules, app/android, fonts, icons).
scripts/unpack.py reads them back, both into the same folder."""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {'node_modules', 'android', 'dist', '.gradle', '.git'}
SERVER = 'server/'   # everything the server is lives in that one folder
MARK = re.compile(r'^===== FILE: ', re.M)


def files():
    for path in sorted(ROOT.rglob('*'), key=lambda p: (p.name != 'PROJECT.md', str(p))):
        rel = path.relative_to(ROOT)
        if path.is_dir() or SKIP_DIRS & set(rel.parts):
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue  # binary, or generated
        if MARK.search(text):
            sys.exit(f'{rel} contains the separator line, please rename it')
        yield rel.as_posix(), text


def main(out_dir=ROOT / 'dist'):
    parts = list(files())
    app = json.loads((ROOT / 'app/package.json').read_text())['version']
    server = (ROOT / 'server/VERSION').read_text().strip()
    for name, title, mine in (('schmeckts-sources.txt', f'sources of the app with tests, scripts and PROJECT.md, version {app}', False),
                              ('schmeckts-server-sources.txt', f'sources of the server with package and installation, version {server}', True)):
        part = [(rel, text) for rel, text in parts if rel.startswith(SERVER) == mine]
        out = pathlib.Path(out_dir) / name
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open('w', encoding='utf-8') as f:
            f.write(f'Schmeckt’s? – {title}, {len(part)} files.\n'
                    'The working tree is schmeckts-sources.txt and schmeckts-server-sources.txt, both unpacked into the same folder.\n'
                    'Every file starts with a line "===== FILE: <path> (<n> characters) =====", followed by exactly n characters of content.\n'
                    'Unpacking: python3 scripts/unpack.py <file> [<file> …] <target folder>\n'
                    '(scripts/unpack.py is inside schmeckts-sources.txt; copy it out by hand if need be.)\n')
            for rel, text in part:
                f.write(f'\n===== FILE: {rel} ({len(text)} characters) =====\n{text}')
        print(f'Done: {out} ({len(part)} files)')


if __name__ == '__main__':
    main()
