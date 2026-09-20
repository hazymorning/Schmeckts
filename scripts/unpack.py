#!/usr/bin/env python3
"""Entpackt schmeckts-quellen.txt und schmeckts-server-quellen.txt wieder in Dateien, beide in denselben Ordner.
Aufruf: python3 scripts/unpack.py <schmeckts-quellen.txt> <schmeckts-server-quellen.txt> <zielordner>"""
import pathlib, re, sys

HEAD = re.compile(r'\n===== DATEI: (.+) \((\d+) Zeichen\) =====\n')


def unpack(src, dest):
    text = pathlib.Path(src).read_text(encoding='utf-8').replace('\r\n', '\n')
    pos, count = 0, 0
    while (m := HEAD.search(text, pos)):
        rel, n = m.group(1), int(m.group(2))
        body = text[m.end():m.end() + n]
        rest = text[m.end() + n:]
        if rest and not rest.startswith('\n===== DATEI: '):  # Länge passt nicht: bis zur nächsten Trennzeile
            nxt = HEAD.search(text, m.end())
            body = text[m.end():nxt.start() if nxt else len(text)]
            print(f'Warnung: Länge von {rel} weicht ab, bitte prüfen')
        out = pathlib.Path(dest) / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(body, encoding='utf-8')
        if out.suffix in ('.sh', '.py') and out.parts[-2] in ('scripts', 'design'):
            out.chmod(0o755)
        pos, count = m.end() + len(body), count + 1
    print(f'{src}: {count} Dateien nach {dest} entpackt')


if __name__ == '__main__':
    for src in sys.argv[1:-1]:
        unpack(src, sys.argv[-1])
