# Schmeckt’s?

Android-App, die festhält, welches Futter ein Haustier mag: Barcode scannen, Packung fotografieren
oder eine bekannte Sorte antippen, mit einem Tipp bewerten. Mehrere Personen eines Haushalts füttern
dieselben Tiere und teilen die Daten über einen eigenen Server im Heimnetz.

## Aufbau

`app/www/` ist die App, ES-Module ohne Build-Werkzeuge, verpackt mit Capacitor; `app/native/` enthält
die eigenen Android-Dateien, `app/android/` erzeugt `scripts/prepare.py`, und in `shared/` steht, was
App und Server teilen. `server/` ist ein Go-Programm nur mit der Standardbibliothek, das seinen Zustand
in einer atomar ersetzten Datei hält und als .deb aus `packaging/` auf einem Mini-PC läuft. `tests/`
prüft beides, `scripts/` baut und `design/` liefert die Vorlagen für die Icons.

## Bauen und testen

Voraussetzung ist Ubuntu mit Node.js 22+ und Python 3 mit Pillow und Playwright.

```sh
scripts/setup-build-env.sh              # JDK 21, Android SDK 36, Go und lintian (als root, macht nur was fehlt)
scripts/test.sh                         # alle Tests: Go, Node, Chromium, Abgleich gegen den echten Server
scripts/build-apk.sh <schmeckts-signatur.txt>   # signierte APK nach dist/, nur mit grünen Tests
```

Einzelne Tests gehen auch direkt, etwa `python3 tests/ui_test.py modi`. Den Server als .deb baut
`scripts/build-deb.sh`. `scripts/prepare.py` erzeugt, was nicht im Repository liegt: die Schriften, das
Android-Projekt und aus `shared/recognize-prompt.txt` den Prompt für App und Server. Der
Signaturschlüssel liegt außerhalb des Repositorys und gehört nicht hinein.

## Mehr

Zweck, Datenmodell, Sync-Protokoll, Server-Schnittstelle, Gestaltungsregeln und Arbeitsweise stehen
in [PROJEKT.md](PROJEKT.md). Wie der Server auf den Mini-PC kommt, steht in
[docs/INSTALLATION.md](docs/INSTALLATION.md).
