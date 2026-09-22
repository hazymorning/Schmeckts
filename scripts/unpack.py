#!/usr/bin/env python3
"""Unpacks schmeckts-sources.txt and schmeckts-server-sources.txt back into files, both into the same folder.
Usage: python3 scripts/unpack.py <schmeckts-sources.txt> <schmeckts-server-sources.txt> <target folder>"""

import pathlib
import re
import sys

HEAD = re.compile(r'\n===== FILE: (.+) \((\d+) characters\) =====\n')


def unpack(src, dest):
    text = pathlib.Path(src).read_text(encoding='utf-8').replace('\r\n', '\n')
    pos, count = 0, 0
    while m := HEAD.search(text, pos):
        rel, n = m.group(1), int(m.group(2))
        body = text[m.end() : m.end() + n]
        rest = text[m.end() + n :]
        if rest and not rest.startswith('\n===== FILE: '):  # the length does not match: read up to the next separator
            nxt = HEAD.search(text, m.end())
            body = text[m.end() : nxt.start() if nxt else len(text)]
            print(f'Warning: the length of {rel} differs, please check')
        out = pathlib.Path(dest) / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(body, encoding='utf-8')
        if out.suffix in ('.sh', '.py') and out.parts[-2] in ('scripts', 'design'):
            out.chmod(0o755)
        pos, count = m.end() + len(body), count + 1
    print(f'{src}: {count} files unpacked into {dest}')


if __name__ == '__main__':
    for src in sys.argv[1:-1]:
        unpack(src, sys.argv[-1])
