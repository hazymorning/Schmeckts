#!/usr/bin/env python3
"""Packt alle Quelltexte in zwei Textdateien für die Projektdateien:
dist/schmeckts-quellen.txt         App, Tests, Skripte, PROJEKT.md (vorn, damit man sie zuerst liest)
dist/schmeckts-server-quellen.txt  server/, packaging/, scripts/build-deb.sh, docs/INSTALLATION.md
Die Server-Datei ändert sich nur mit dem Server; ihr Kopf nennt deshalb dessen Version. Nicht enthalten ist alles, was
scripts/prepare.py oder der Build wieder erzeugt (node_modules, app/android, Schriften, Icons).
Zurück geht es mit scripts/unpack.py, beide Dateien in denselben Ordner."""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {'node_modules', 'android', 'dist', '.gradle', '.git'}
SKIP_FILES = {'app/www/js/prompt.js', 'server/recognize-prompt.txt'}  # erzeugt scripts/prepare.py aus shared/recognize-prompt.txt
SERVER = ('server/', 'packaging/', 'scripts/build-deb.sh', 'docs/INSTALLATION.md')
MARK = re.compile(r'^===== DATEI: ', re.M)


def files():
    for path in sorted(ROOT.rglob('*'), key=lambda p: (p.name != 'PROJEKT.md', str(p))):
        rel = path.relative_to(ROOT)
        if path.is_dir() or SKIP_DIRS & set(rel.parts) or rel.as_posix() in SKIP_FILES:
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue  # binär, wird erzeugt
        if MARK.search(text):
            sys.exit(f'{rel} enthält die Trennzeile, bitte umbenennen')
        yield rel.as_posix(), text


def main(out_dir=ROOT / 'dist'):
    parts = list(files())
    app = json.loads((ROOT / 'app/package.json').read_text())['version']
    server = (ROOT / 'server/VERSION').read_text().strip()
    for name, title, mine in (('schmeckts-quellen.txt', f'Quelltexte der App mit Tests, Skripten und PROJEKT.md, Version {app}', False),
                              ('schmeckts-server-quellen.txt', f'Quelltexte des Servers mit Paket und Installation, Version {server}', True)):
        part = [(rel, text) for rel, text in parts if rel.startswith(SERVER) == mine]
        out = pathlib.Path(out_dir) / name
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open('w', encoding='utf-8') as f:
            f.write(f'Schmeckt’s? – {title}, {len(part)} Dateien.\n'
                    'Zum Arbeitsbaum gehören schmeckts-quellen.txt und schmeckts-server-quellen.txt, beide in denselben Ordner entpackt.\n'
                    'Jede Datei beginnt mit einer Zeile „===== DATEI: <pfad> (<n> Zeichen) =====“, danach folgen genau n Zeichen Inhalt.\n'
                    'Entpacken: python3 scripts/unpack.py <datei> [<datei> …] <zielordner>\n'
                    '(scripts/unpack.py steht in schmeckts-quellen.txt, notfalls von Hand herauskopieren.)\n')
            for rel, text in part:
                f.write(f'\n===== DATEI: {rel} ({len(text)} Zeichen) =====\n{text}')
        print(f'Fertig: {out} ({len(part)} Dateien)')


if __name__ == '__main__':
    main()
