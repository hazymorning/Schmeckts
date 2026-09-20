# Schmeckt’s?

Android-App, die festhält, welches Futter ein Haustier mag. Mehrere Personen eines Haushalts füttern dieselben Tiere und teilen die Daten über einen Server im Heimnetz.

## Zweck und Grundsätze

- **Füttern:** Barcode scannen, Packung mit der eigenen Kamera fotografieren (ein Tipp, ohne Bestätigung; im Haushalt erkennt die KI Marke und Sorte) oder eine bekannte Sorte antippen. Gespeichert wird sofort, bewertet mit einem Tipp auf der Skala der Futterart, auf Wunsch mit Erinnerung.
- **Zwei Modi:** „Nur auf diesem Handy“ (`lokal`) oder verbunden (`haushalt`). Der erste Start fragt, „Verbindung trennen“ wechselt zu `lokal`, die Daten bleiben. In `lokal` zeigt die App außer unter „Datenschutz“ nirgends Hinweise auf Server, Abgleich oder Erkennung: Ein Foto führt direkt zu „Futter benennen“ (Status `noserver`), unbekannte Barcodes zum Foto.

Bedienung: wenige Tipps, nichts fragen, was sich ableiten lässt, Rückgängig statt Sicherheitsabfrage, deutsche Texte, eigene SVG-Icons, keine Emojis. Qualität: keine Eingabe geht verloren (offline, Server aus, App beendet), kein Framework, kleine Module mit einer Aufgabe, feste Gestaltungsregeln, getestet ausliefern.

## Aufbau

`app/www/` ist die App (ES-Module ohne Build-Werkzeuge), `app/native/` eigene Android-Dateien, `app/android/` erzeugt `scripts/prepare.py`.

**App:** Capacitor 8.5, Ziel-SDK 36, ab Android 7, WebView ab 123 (`light-dark()`), sonst zeigt `webview-update.html` einen Hinweis. App-ID `de.schmeckts.app`. Die Version steht nur in `app/package.json` (1.2.3 wird `versionCode` 10203). `prepare.py` ändert die Capacitor-Vorlagen gezielt und bricht ab, wenn sich eine geändert hat.

**Server:** ein Go-Programm nur mit der Standardbibliothek, Zustand in einer atomar ersetzten Datei, Version in `server/VERSION`. Als .deb (amd64, arm64) ein systemd-Dienst auf dem Ubuntu-Mini-PC, Daten in `/var/lib/schmeckts`, Port ab 8486, unterwegs über WireGuard. Notfälle: `sudo schmeckts-server verbindung | uebersicht | wiederherstellen <backup>`, Anleitung in `docs/INSTALLATION.md`.

**Module** in `app/www/js/`, jedes importiert nur aus Schichten über seiner, ohne Kreise:

1. Grundlagen: `dom`, `text`, `dates`, `native` (Android-Brücke), `icons`, `config`, `fields`, `clock`, `disk`
2. Daten: `store`, `api`, `sync`, `smart`, `derive`, `images`, `recognize`
3. Oberfläche: `ui/theme`, `ui/toast`, `ui/sheet`, `ui/crop`, `ui/camera`
4. Ansichten: `views/parts`, `views/mood`, `views/home`, `views/sheets`
5. Logik: `logic/products`, `logic/reminders`, `logic/feeding`, `logic/scan`, `logic/editing`, `logic/pets`, `logic/data`
6. Steuerung: `actions`, `main`

- Muss eine untere Schicht eine obere erreichen, hängt sich die obere an (`hooks`, `syncHooks`, `diskHooks`, `setSheetView()`); `main.js` verbindet sie.
- Datenbank verändern und `save()`, komplett ersetzen nur über `replaceDb()`. Buttons tragen `data-action`, ausgeführt wird der gleichnamige Eintrag in `ACTIONS`.
- `Native` ist das Objekt mit den Capacitor-Plugins, im Browser `null`; dort ist `localStorage` der Speicher. So läuft derselbe Code in App, Browser und Tests.
- **Speicherung:** `db.json`, `prefs.json`, `sync.json`, `queue.json` im privaten App-Speicher, atomar (temporäre Datei, umbenennen), in der Reihenfolge Warteschlange, Daten, Uhren. Nach einem Absturz spielt der Start die Warteschlange nach. Eine beschädigte Datei wird beiseitegelegt.
- **Scannen:** Googles fertige Scan-Oberfläche (`scan()` aus `@capacitor-mlkit/barcode-scanning`, Modul `barcode_ui`), ohne Kamerarecht. Bekannter Code: servieren, bei mehreren Sorten Auswahl. Unbekannt: Server fragen (Feature `barcode`), sonst Foto der Vorderseite. `linkProduct` hängt den `scanCode` der Mahlzeit an jede Sorte, die sie bekommt; so wächst ein Multipack.
- **Kamera:** `getUserMedia`, der Stream stoppt beim Auslösen, Abbrechen, Zurück und im Hintergrund. Geht sie nicht, folgt das Plugin `Foto` (Kamera-App), im Browser die Dateiauswahl. Wartende Fotos erkennt die App später, höchstens fünf kostenpflichtige Versuche.
- **Erinnerung ans Bewerten:** Nur das servierende Handy plant, ohne exakten Alarm, für Mahlzeiten bis 10 Minuten Alter; `syncReminders()` sagt ab oder plant um.
- **Erinnerung ans Füttern** (`prefs.feedRemind`, pro Gerät, Standard aus): gefragt wird nichts, die üblichen Zeiten kommen aus dem Verlauf (`feedSlots()`, siehe Auswertung). `syncReminders()` plant je Zeit für heute und zwei Tage „Schon gefüttert?“ und sagt ab, sobald zur üblichen Zeit eine Mahlzeit serviert ist; ein Tipp öffnet das Füttern-Sheet. Im Haushalt erfährt ein Handy im Hintergrund nicht, was andere serviert haben; deshalb fragt der Text nur.
- **Rechte:** Internet, Vibration, Netzwerkstatus, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `CAMERA`; `build-apk.sh` prüft das Manifest. Deep Links: `schmeckts://fuettern`, `schmeckts://scan`, `schmeckts://foto`.

## Daten und Sync-Protokoll

```js
db = { version: 3,
  pets:     [{ id, name, species, photo, createdAt, photos: { [id]: dataUrl } }],
  products: [{ id, brand, variety, type, animal, texture, thumb, lastPets, createdAt, codes: { [ean]: true }, kaufen }],
  servings: [{ id, productId, servedAt, note, by, thumb,
               pets: { [petId]: { r: <Schlüssel aus RATINGS>|null, at, by } },
               photo, status, error, autoPets, scanCode }] }   // letzte Zeile: nur auf diesem Handy
prefs = { theme, hiddenHints, closedWeek, milestones, remind, feedRemind, backdrop, mode, server, code, name, activePet, lastPets }
```

`kaufen`: `'immer'`, `'nicht'` oder fehlt. `texture`: Konsistenz oder Snack-Art, ein Schlüssel aus `TEXTURES` oder fehlt. `hiddenHints`: `'art:sorte'`, beim Appetit `'appetit:tier:JJJJ-MM-TT'`. `closedWeek`: Montag der Woche. `milestones`: `'meals:100'`. `remind`: Minuten, 0 = aus, sonst ganze Stunden bis 24. `backdrop`: Tierfotos hinter der Kopfzeile, Standard an. `mode`: `'lokal'`, `'haushalt'` oder `''`. Bilder verkleinert das Handy: Vorschau 200 px, Profilbild 320 px, Album (bis 8) längste Seite 960 px als JPEG 0,72, notfalls schwächer, bis es in ein Feld passt (500 KB), jedes Foto sofort gespeichert. Das Packungsfoto bleibt auf dem Handy. Barcodes: EAN-13, EAN-8, UPC-A mit Prüfziffer, UPC-A wird EAN-13 mit führender 0. Beispieldaten (nur in `lokal`) tragen Kennungen mit `demo` und verschwinden beim Verbinden. Unbekannte Werte anderer Geräte bleiben unangetastet; Einträge einer Karte, die dieses Gerät nicht kennt (neuere Version), hält es nicht und löscht sie auch nicht (`setField()` meldet das, `applyRecord()` merkt sie sich nicht).

**Protokoll Version 1.** Erst lokal speichern, dann senden; der Server bestätigt nach dem Schreiben auf die Platte; doppelt Gesendetes ist harmlos; maßgeblich ist das Nachholen, Live-Meldungen beschleunigen nur.

- **Felder:** Jeder Schlüssel außer `id` ist ein Feld mit eigener Uhr. Karten zerfallen in Felder: `pets.<petId>`, `codes.<EAN>`, `photos.<id>` (`MAPS` in `fields.js`), `null` entfernt den Eintrag. `_del` ist ein Feld: `true` gelöscht, `false` vorhanden oder wiederhergestellt.
- **Uhr:** `<ms, 13 Ziffern>-<Zähler, 4 Ziffern>-<Gerät, 4–16 Zeichen a–z0–9>`, als Text sortierbar. `ms` ist `Date.now()` plus Abweichung zur Serverzeit (`now` in jeder Antwort). Die Geräte-Kennung entsteht einmal zufällig.
- **Zusammenführen:** Pro Feld gewinnt die größere Uhr. Eine Änderung an einem gelöschten Datensatz holt ihn nicht zurück, nur `_del: false` mit neuerer Uhr.
- **Änderung:** `{id, c, r, t, f}`: Kennung (8–64 Zeichen), Sammlung, Datensatz (4–40 Zeichen), Uhr, Felder. Angelegt oder wiederhergestellt: alle Felder plus `_del: false`. Geändert: nur geänderte Felder. Gelöscht: `{_del: true}`.
- **Warteschlange:** bleibt auf dem Handy, bis der Server in `ok` bestätigt. `rejected` mit `reason: "invalid"` wird verworfen und protokolliert, bei `"clock"` stempelt die App neu. Pro Anfrage höchstens 500 Änderungen und 12 MB.
- **Nachholen:** `GET /api/changes?since=<seq>&epoch=<epoch>` liefert geänderte Datensätze komplett: `{c, r, s, f: {feld: {v, t}}}`. Anlässe: Start, Rückkehr in die App, wieder Netz, Live-Meldung, alle 60 Sekunden, nach dem Speichern.
- **Epoche:** Weicht sie ab (Wiederherstellung), liefert der Server alles; die App führt zusammen und sendet jedes Feld mit neuerer Uhr erneut.
- **Selbstprüfung:** `GET /api/checksum`, SHA-256 über die sortierten Zeilen `sammlung/id/feld@uhr\n`. Die App vergleicht bei leerer Warteschlange und gleicht bei Abweichung vollständig ab.
- **Live:** `GET /api/events?code=…` (Server-Sent Events), `event: seq` mit `{"epoch","seq"}`.

## Server-Schnittstelle

| Anfrage | Zweck |
|---|---|
| `GET /api/info` | Version, Protokoll, Epoche, Serverzeit, Erkennung eingerichtet, `features` (`["barcode"]`); mit Code zusätzlich `auth` |
| `POST /api/changes` | Änderungen senden, Antwort nennt die angenommenen Kennungen |
| `GET /api/changes?since=N` | Änderungen seit Nummer N |
| `GET /api/events` | Live-Hinweis auf neue Nummern |
| `GET /api/checksum` | Prüfsumme über alle Daten |
| `POST /api/recognize` | `{"image": "<base64 JPEG>"}`, Antwort `{brand, variety, type, animal}`, die App liest auch `texture` |
| `GET /api/barcode/<code>` | Antwort `{found, brand, variety, type, animal}`, die App liest auch `texture` |

Außer `/api/info` braucht jede Anfrage `Authorization: Bearer <code>`, `/api/events` den Code als `?code=`. Groß- und Kleinschreibung, Leerzeichen und Bindestrich im Code zählen nicht. 20 falsche Codes in zehn Minuten sperren die Adresse so lange (429). Fehler: `{"error": "<deutsche Meldung>"}`. Jede Antwort enthält `now` (ms). Beim Verbinden prüfen beide Seiten die Protokollversion.

**Erkennung:** Schlüssel, Modell (`claude-sonnet-5`, etwa 0,5 Cent pro Foto), Prompt und die 60 neuesten Produkte liegen auf dem Server. 10 Erkennungen am Stück, danach eine alle 90 Sekunden.

**Barcode-Suche:** nur für unbekannte Codes. Der Server prüft den Code (sonst 400), fragt Open Pet Food Facts, dann Open Food Facts (API v2, je höchstens 5 Sekunden) und bildet Marke, Sorte (deutscher Name, ohne Marke und Mengen), Art und Tierart (nur bei eindeutigen Kategorien). Treffer merkt er 90 Tage, Fehlanzeigen 7 Tage. 30 Abfragen am Stück, danach eine alle 10 Sekunden (429). Keine Datenbank erreichbar: 502. Tests ersetzen die Adressen über `barcodeUrls` in `config.json`.

## Auswertung

Alles liest aus einem Modell: `analyze(db, prefs, jetzt)` in `js/smart.js`, reine Funktionen; `shopGroups()`, `week()`, `review()` und `milestones()` leiten daraus ab. `model()` in `derive.js` hält es, bis sich Daten (`revision`), Tier-Filter, ausgeblendete Hinweise oder die Stunde ändern. Weil alle Gewichte gleich schnell schrumpfen, hängt die Wertung nicht vom Zeitpunkt ab: Die Summen je Sorte und Tier (`tally()`) bleiben, neu gerechnet werden nur Sorten mit geänderten Mahlzeiten (`takeStale()` in `store.js`). Appetit und „Geschmack bekannt“ lesen nur ihr Zeitfenster, der Rückblick bleibt, bis sich eine Mahlzeit bis zum Wochenende ändert.

- **Punkteskala:** Gemessen wird Akzeptanz, 0 bis 100; die ganze Auswertung rechnet nur mit Punkten. `RATINGS` in `config.js` ist die flache Liste aller Stufen. Die Schlüssel stehen in den Daten und ändern sich nie; der Schlüssel allein bestimmt Punkte, Text und Icon (`r_<Schlüssel>`), unabhängig von der heutigen Art der Sorte.
- **Beobachtungsskalen** (`SCALES`): Die Knöpfe sind die Beobachtung, und die hängt von der Futterart ab. Nur `scaleOf(sorte)` kennt die Zuordnung; ohne bekannte Art gilt Nassfutter (`typeOf`).
  - `portion` (Nassfutter): `top` „Sofort leer“ 100, `gut` „Später leer“ 80, `mittel` „Halb gegessen“ 50, `sosse` „Soße geleckt“ 30, `schlecht` „Kaum angerührt“ 0.
  - `bowl` (Trockenfutter): `gern` „Gern gefressen“ 100, `normal` „Normal gefressen“ 80, `wenig` „Wenig gefressen“ 35, `liegen` „Liegen gelassen“ 0.
  - `bite` (Snack, Sonstiges): `verputzt` „Sofort verputzt“ 100, `spaeter` „Später gefressen“ 70, `angeknabbert` „Nur angeknabbert“ 35, `unberuehrt` „Nicht angerührt“ 0.
  - Wechselt die Art, bleiben gespeicherte Bewertungen, wie sie sind: Die Bewertungsreihe zeigt eine Stufe außerhalb der Skala als Badge über den Knöpfen, ein Tipp ersetzt sie; das Futter-Sheet zählt solche Stufen hinter denen der Skala.
- **Konsistenz und Snack-Art** (`TEXTURES` in `config.js`, die einzige Stelle für Auswahl, Stichwörter und Auswertung): optionales Feld `texture` der Sorte, abgeglichen wie jedes Feld. Trockenfutter und Sonstiges haben keine Auswahl.
  - Nassfutter, „Konsistenz“: `sosse` „In Soße“ (Soße, Sauce, Gravy), `gelee` „In Gelee“ (Gelee, Jelly, Aspik), `pastete` „Pastete“ (Pastete, Pâté, Terrine), `mousse` „Mousse“, `block` „Fester Block“ (Loaf, Block), `suppe` „Suppe“ (Suppe, Soup, Brühe).
  - Snack, „Snack-Art“: `knusprig` „Knusprig“ (Knusp…, Crunch…), `weich` „Weich“ (soft, weich), `creme` „Creme“ (Creme, Cream, Paste), `milch` „Milch“ (Milch, Milk, Drink), `stick` „Stick“ (Stick, Streifen), `kau` „Kauartikel“ (Kau…, Chew).
  - Chip-Reihe unter der Art im Futter-Sheet (wirkt sofort, bei „Fester Block“ der Hinweis „Vor dem Servieren zerkleinern“) und beim Benennen: Einfachauswahl, ein zweiter Tipp hebt sie auf, keine Pflicht.
  - `applyTexture()` in `logic/products.js` nach Erkennung, Barcode-Treffer, Benennen und Auswahl: Die Auswahl des Menschen gilt, auch „keine“. Sonst bleibt ein vorhandener Wert; ein leeres Feld füllt `texture` aus der Antwort des Servers, dann das erste passende Stichwort in Marke und Sorte. Was nicht zur Art passt, fällt weg, auch beim Wechsel der Art.
- **Wertung:** Punkte der Bewertungen, das Gewicht halbiert sich alle 90 Tage ab der Mahlzeit. Grenzen gelten für ganze Prozent, wie angezeigt. Gezählt werden nur Mahlzeiten bis `jetzt`. Mit Tier-Filter gelten die Werte dieses Tiers, sonst die des Haushalts.
- **Urteil je Tier und Sorte:** „Nachkaufen“ ab 3 Bewertungen und Wertung ≥ 70, „Nicht mehr kaufen“ ab 2 Bewertungen und Wertung < 40, sonst „Beobachten“.
- **Urteil im Haushalt:** ein Tier „Nachkaufen“ und keines „Nicht mehr kaufen“: „Nachkaufen“; umgekehrt „Nicht mehr kaufen“; beides: „Gemischt“ („Minka ja, Tiger nein“); sonst „Beobachten“.
- **Eigene Einstellung** `kaufen` geht dem Urteil vor, „Automatisch“ entfernt das Feld (`null`).
- **Erkenntnisse:** ab 3 Bewertungen im Filter. Vergleiche nach Marke, Konsistenz und Geschmack laufen nur innerhalb einer Futterart, brauchen zwei Gruppen mit je 2 Bewertungen und nennen beste und schwächste, außer bei Nassfutter auch die Art. Die Konsistenz liest das Feld `texture` und nur ohne Feld die Stichwörter, getrennt für Nassfutter („Konsistenz“) und Snacks („Snack-Art“). „Meist nur die Soße“: Sorten mit mindestens 2 Bewertungen, davon mindestens die Hälfte „Soße geleckt“, höchstens zwei. Keine Aussagen zum Kaufen.
- **Hinweise,** höchstens einer sichtbar, nach Vorrang, 2 bis 4 nur für Sorten ohne eigene Einstellung, innerhalb einer Art der deutlichste zuerst:
  1. „Appetit“ je Tier: letzte 72 Stunden gegen die 30 Tage davor. Mindestens 3 Bewertungen und 2 Sorten im Fenster, 8 Bewertungen im Vergleich; Durchschnitt (ungewichtet, ganze Prozent) mindestens 30 Punkte unter dem Vergleich und unter 50. Ausgeblendet für Tier und Tag der neuesten Bewertung.
  2. „Nicht mehr kaufen?“ bei diesem Urteil, der Knopf setzt `kaufen="nicht"`.
  3. „Frisst meist nur die Soße“: ein Tier mit mindestens 3 Bewertungen einer Sorte, davon mindestens 60 % „Soße geleckt“.
  4. „Neuer Liebling“ bei Urteil „Nachkaufen“, der Knopf setzt `kaufen="immer"`.
  „Ausblenden“ gilt pro Gerät, `kaufen` erledigt den Hinweis überall.
- **„Geschmack bekannt“** je Tier (`tastes`) und im Filter (`taste`): Sorten, die das Tier in den letzten 180 Tagen bekommen hat; bekannt ab 3 Bewertungen oder ab 2 bei Wertung unter 40. Im Haushalt die Summe.
- **Wochenrückblick:** `week()` rechnet Montag 0:00 bis Sonntag 24:00 Ortszeit, immer für den Haushalt: Mahlzeiten, davon bewertete, je Tier die beste Sorte der Woche (ab 2 Bewertungen), neue Lieblinge (am Wochenende „Nachkaufen“, am Anfang nicht), Fütterungen je Person (`by`, ohne Namen nicht gezählt). `review()` zeigt die Vorwoche Montag 0:00 bis Mittwoch 23:59, ab 5 Mahlzeiten, bis „Schließen“.
- **Übersicht** (`overview` im Modell): im Filter die letzte Fütterung bis `jetzt` und je Tier die liebste Sorte (Urteil „Nachkaufen“, beste Wertung) und die schwächste (Urteil „Nicht mehr kaufen“, schlechteste Wertung).
- **Fütterungszeiten** (`feedSlots()`, `feedReminders()`): Mahlzeiten ohne Snacks der letzten 14 Tage; Uhrzeiten mit höchstens 90 Minuten Abstand bilden eine Zeit (mittlere Uhrzeit), sie gilt ab 4 verschiedenen Tagen. Erinnert wird 45 Minuten danach, außer es gab an dem Tag ab einer Stunde vor der frühesten üblichen Uhrzeit schon eine Mahlzeit.
- **Meilensteine:** 50, 100, 250, 500, 1000 Mahlzeiten und 10, 25, 50 probierte Sorten. Der Toast nennt eine Schwelle, wenn sie genau erreicht ist, einmal pro Gerät; Überschrittenes gilt still als gesehen.
- **Einkaufsliste:** „Nachkaufen“ (samt „Gemischt“ und „immer“) und „Nicht kaufen“. Die Schnellauswahl beim Füttern zeigt keine Sorten, die nicht mehr gekauft werden.

## Gestaltungsregeln

Verbindlich für jede Änderung, `tests/design_test.py` prüft sie.

**Schriften:** Figtree (`400 700`), Fraunces (`500 700`) nur für Wortmarke, Überschriften, Tageszeilen, Prozentzahlen, Zähler und Anfangsbuchstaben in Vorschaubildern; `prepare.py` lädt sie mit Prüfsumme, die Lizenzen liegen bei. `body`: `font-variation-settings: "SOFT" 100`, `text-rendering: geometricPrecision`. Kopfzeile 650, 30px, Zeilenhöhe 1.1, `-.02em`; Abschnittsüberschrift 600, 21px, 1.25, `-.01em`; Feldbeschriftung Figtree 600, 13.5px, `--muted`. Kein `text-transform`, kein positives `letter-spacing`, außer im Feld für den Haushaltscode.

**Farben:** festes Konzept ohne Auswahl, `light-dark(hell, dunkel)`, nur in `css/tokens.css`.

| Token | Hell | Dunkel |
|---|---|---|
| `--bg` | #F4F0EC | #191513 |
| `--surface` | #FCFAF7 | #231E1B |
| `--surface-2` | #E8E2DB | #302A27 |
| `--ink` | #2E2724 | #EBE7E2 |
| `--muted` | #6C615A | #B2A9A1 |
| `--faint` | #A0958C | #7C726B |
| `--line` | #D8CFC7 | #403935 |
| `--accent` | #965E4B | #C78F7A |
| `--accent-ink` | #7F4C3A | #C78F7A |
| `--accent-soft` | #F9E0D7 | #422920 |
| `--on-accent` | #FFFFFF | #191513 |
| `--good` / `--good-soft` | #4F725F / #DBE0DA | #97BBAA / #363731 |
| `--mid` / `--mid-soft` | #997238 / #E8DED0 | #DBB87E / #43392D |
| `--sauce` / `--sauce-soft` | #7C5B45 / #E2D8D1 | #BD9E86 / #3E352E |
| `--bad` / `--bad-soft` | #823B4E / #EADADA | #D88095 / #3D2C2C |

- Farbwerte sonst nur in den Logo-Dateien, in `webview-update.html` und in `app/native` (Werte der Palette, Kurzbefehl-Icons weiß auf #965E4B).
- Abgeleitete Tokens ohne eigene Farbtöne: `--seg-on` (hell `--surface`, dunkel `--line`), `--toast-action` (#C78F7A / #7F4C3A), `--backdrop` (hell #2E2724 mit 40 %, dunkel #191513 mit 70 %) und die drei Schatten.
- `--on-accent` ist die Schrift auf Akzent und `.btn.armed`. Bewertungsfarben nur für Icons, Punkte, Balken und ihre zarten Flächen. Die Farbe einer Stufe folgt ihren Punkten (`rateCls`): ab 70 `--good`, ab 40 `--mid`, darunter `--sauce`, bei 0 `--bad`.
- Kontrast: Text mindestens 4,5:1, hell und dunkel, Bewertungsfarben als Icons 3:1. `--faint` nur für Schmuck.

**Logo** (Dateien ohne Metadaten): `schmeckts-zeichen.svg` (hell, Icon-Motiv auf #F4F0EC) und `-dunkel.svg` in `app/www/img/`, `schmeckts-zeichen-einfarbig.svg` und `schmeckts-app-icon.svg` in `design/`. Die Android-Vektoren übernehmen Pfade und Farben unverändert, das Motiv bleibt in der sicheren Zone (33 dp um die Mitte). Die Kopfzeile ist reine Wortmarke.

**Animationen:** nur Bewegung und Deckkraft; `@keyframes` ohne Hintergrund, `box-shadow`, Rahmen und Filter. `:focus-visible` setzt nur `outline` und `outline-offset`. Vibration: Auswahl leicht, Erfolg mittel, Löschen und Fehler deutlich.

**Karten:** Seite höchstens 600px, 18px Rand. Karte: `--surface`, Radius 26px, innen 18px oben und seitlich, 8px unten, 14px Abstand, ohne Rahmen und Schatten. Reihenfolge: Tiere-Leiste (ab zwei Tieren), Übersicht, „Wie war’s?“, Hinweis, „Letzte Woche“, „Verlauf“ (immer ganz sichtbar), „Einkaufen“, „Erkenntnisse“. Textknopf `.card-btn` („Alle anzeigen“, nur wenn es mehr gibt, Zustand bis zum Neustart): volle Breite, Figtree 600, 14.5px, Akzenttext, Linie darüber.

- **Übersicht:** sobald etwas serviert wurde, 108px hoch. Links das Bild mit 72px (ein Tipp öffnet das Tier), bei „Alle“ mit mehreren Tieren zwei Bilder versetzt; daneben der Name als Überschrift und ein kurzer Text aus dem Modell, das Wichtigste fett. Ein Tier: „Bekam zuletzt **vor 2 Std.** einen Snack: **Käse** (Sofort verputzt). Am liebsten **Lachs**, **Rind** kommt nicht an.“ Mehrere: „Minka und Tiger bekamen zuletzt …. Minka mag am liebsten **Lachs**, Tiger **Pute**. Nicht an kommt bei Minka **Rind**.“ Nie mehr als zwei Zeilen, längerer Text endet mit „…“. Ein Tipp auf die Karte zeigt ihn ganz, ein zweiter klappt zu: ohne Neuzeichnen, nur die Klasse wechselt, die Höhe läuft weich wie bei den anderen Karten (`slideHeight()`, 220 ms; Zustand bis zum Neustart). Einzige Karte, deren Überschrift nicht oben, sondern neben dem Bild steht.
- **Verlauf:** Die Tageszeile zählt „2 Mahlzeiten, 1 Snack“ (Art Snack ist keine Mahlzeit, alles andere schon); sonst heißt es neutral „gefüttert“ (Rückblick, Meilenstein). Über dem Kalender 14px.
- **Einkaufen:** zugeklappt bis 3 „Nachkaufen“ („Gemischt“ mit „für Minka“) und bis 2 „Nicht mehr kaufen“; aufgeklappt alle Gruppen samt „Beobachten“ und „Als Liste teilen“. Eigene Einstellung zeigt `pin`. Ab 3 Sorten: „Minkas Geschmack: 6 von 10 Sorten bekannt“.

**Bausteine:** Tippflächen mindestens 48px, bei 360px Breite nichts abgeschnitten. Unter der Wortmarke 10px bis zur ersten Karte. Kleine Icons in Knöpfen, Zeilen (Pfeile) und Auswahlfeldern: 20px, Strichstärke des Icon-Sets (1.8), senkrecht mittig, in Feldern und Kästen 14px vom Rand. Auswahlfeld (`.pick`, „Serviert von“): eigener Pfeil, `appearance:none` gegen den Pfeil von Android, das Zeichen des Systems liegt unsichtbar darüber. Server-Kasten: Icon auf `--surface`, nur das Icon trägt die Farbe (die zarten Flächen heben sich von `--surface-2` kaum ab). Bewertungsreihe: so viele gleich breite Spalten wie die Skala Stufen hat. Kamera immer dunkel. Zuschnitt: Zoom 1 bis 4, Ergebnis 320 px. Stimmungsbild: 260px, Deckkraft 0,16 hell und 0,26 dunkel, `saturate(.85)`, Wechsel alle 12 Sekunden, nur sichtbar und ohne reduzierte Bewegung; in den Einstellungen an oder aus. Einstellungen: Auswahlen mit zwei Möglichkeiten sehen aus wie die anderen (`.seg`), Schalter gibt es nicht; die Hinweise unter den Erinnerungen sagen, was mit der Auswahl gerade gilt; „Jetzt abgleichen“ erscheint nur, wenn etwas wartet oder der Abgleich hakt.

## Sicherheit und Datenschutz

- **API-Schlüssel nur auf dem Server,** nie in Logs. Kostenschutz: festes Modell, feste Antwortlänge, Grenzen für Bildgröße und Erkennungen.
- **Haushaltscode** für jede Anfrage; geht ein Handy verloren, gibt es einen neuen.
- **Server:** nimmt nur Anfragen aus privaten Adressbereichen an und prüft Größe und Aufbau jeder Anfrage; eigenes Konto, systemd-Härtung. Die App zeigt fremde Texte nur maskiert.
- **http nur im Heimnetz:** erlaubt für 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10, 127.0.0.0/8, fc00::/7, fe80::/10, `localhost`, `*.local`, `*.home.arpa`. Alles andere braucht https. Geprüft für jede Anfrage in `normServer()` (`js/api.js`); Androids Netzwerkregeln kennen keine Adressbereiche.
- **Auf dem Handy:** Daten im privaten App-Speicher, nie in Googles Cloud-Sicherung, aber direkt auf ein neues Gerät übertragbar: `data_extraction_rules.xml` (ab Android 12), `backup_rules.xml` (Android 7 und 8 nichts, ab Android 9 in `xml-v28` nur `deviceToDeviceTransfer`); `build-apk.sh` prüft die APK. Fotos kommen nie in die Galerie, das Foto-Plugin löscht seine Cache-Datei, geteilte Backups verschwinden beim nächsten Start aus dem Cache.
- **Modus `lokal`:** keine einzige Netzwerkanfrage (Test). Ausnahme ist Googles Scanner in den Play-Diensten: Laut Google bleibt das Bild auf dem Gerät, gespeichert wird nichts; ML Kit sendet aber Diagnose- und Nutzungsdaten (Gerät, App, Kennungen, Leistung) an Google.
- **Modus `haushalt`:** Die App spricht nur mit dem eigenen Server. Von dort gehen Packungsfotos zur Erkennung an Anthropic und die Nummer unbekannter Barcodes an Open Pet Food Facts und Open Food Facts. Keine Werbung, kein Tracking. In den Einstellungen öffnet der Knopf „Datenschutz“ unter „Daten“ ein Sheet, das beide Modi in vier kurzen Absätzen sachlich erklärt, ohne Versprechen (`PRIVACY` in `views/sheets.js`).
- **Backups** des Servers täglich, 30 Tage. „Alle Daten löschen“ und „Backup importieren“ gelten für den Haushalt.

## Arbeitsweise

- **Befehle:** `scripts/test.sh`, `scripts/build-apk.sh <schmeckts-signatur.txt>`, `scripts/build-deb.sh`, Ergebnisse in `dist/`. Gebaut wird nur mit grünen Tests. `scripts/setup-build-env.sh` richtet JDK 21, Android SDK 36, Go und lintian ein; vorausgesetzt sind Node.js 22+ und Python 3 mit Pillow und Playwright.
- **Tests:** `tests/*.test.js` prüfen reine Module in Node, die übrigen laufen in Chromium mit simulierten Plugins: `ui_test.py` (Abläufe), `storage_test.py`, `design_test.py` (auch pack/unpack), `sync_test.py` (mehrere Handys gegen den echten Server), `perf_test.py` (Neuzeichnen nach einer Bewertung unter 40 ms bei 5 Jahren Daten, CPU 4-fach gedrosselt). Einzeln: `python3 tests/ui_test.py modi`.
- **Austausch:** Es gilt Git. Der Austausch über die beiden Quellen-Dateien entfällt; sie liegen nicht mehr im Projekt. Eine Sitzung beginnt mit `git clone` oder `git pull` und einem eigenen Zweig, dann `setup-build-env.sh` und `test.sh`, am Ende Commit und Pull Request. Was `scripts/prepare.py` oder der Build wieder erzeugt (`app/node_modules/`, `app/android/`, `dist/`, die Schriften), steht in `.gitignore` und gehört nicht ins Repository. `.github/workflows/tests.yml` fährt die Testsuite bei jedem Push und Pull Request auf `ubuntu-latest`.
- **Notfälle:** `scripts/pack.py` und `scripts/unpack.py` bleiben. `pack.py` schreibt den Arbeitsbaum weiterhin nach `dist/schmeckts-quellen.txt` (App, Tests, Skripte, `PROJEKT.md`) und `dist/schmeckts-server-quellen.txt` (`server/`, `packaging/`, `scripts/build-deb.sh`, `docs/INSTALLATION.md`), `unpack.py` liest beide in denselben Ordner zurück, `design_test.py` prüft den Weg hin und zurück. Gebraucht wird das nur noch, wenn der Quelltext einmal ohne Git weitergereicht werden muss — im Alltag nicht mehr.
- **Signaturschlüssel:** immer derselbe, sonst sind keine Updates über die installierte App möglich; eine Kopie gehört an einen sicheren Ort. `schmeckts-signatur.txt` (Schlüssel mit Passwort, `scripts/signatur.py`) liegt außerhalb des Repositorys und wird `build-apk.sh` als Pfad übergeben; weder er noch ein `.jks` gehören je in Git. Handys eines Haushalts gemeinsam aktualisieren.

## Offene Punkte

- Installation auf dem Mini-PC und Praxistest mit zwei Handys, auch offline.
- Die Server-Übersicht (`server/overview.go`) kennt nur die Stufen `gut`, `mittel`, `sosse`, `schlecht` und zeigt andere als „offen“; beim nächsten Server-Update alle Stufen aus `RATINGS` beschriften.
