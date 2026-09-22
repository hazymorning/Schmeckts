# Schmeckt’s? – der Haushalts-Server

Den Server brauchst du nur, wenn mehrere Menschen dasselbe Fütterungstagebuch führen wollen. Er ist ein kleines
Programm für einen Rechner, der bei euch zu Hause läuft, und dafür reicht schon ein Mini-PC. Er verwaltet die
gemeinsamen Daten, gibt Packungsfotos zur Erkennung weiter und schlägt Barcodes nach. Die gespeicherten Daten
bleiben dabei bei euch, nach draußen gehen nur die Packungsfotos und die Barcode-Anfragen. [Die App](../README.md)
läuft aber auch ohne ihn.

In diesem Ordner liegt alles, was dazugehört: das Go-Programm, `packaging/` für das Debian-Paket und
`build-deb.sh`, mit dem es gebaut wird.

## Einrichten

Du brauchst dafür etwa zehn Minuten und arbeitest die ganze Zeit direkt am Mini-PC mit Maus und Tastatur. Dein
Passwort wird einmal abgefragt.

### 1. Die richtige Datei wählen

Das Paket gibt es in zwei Varianten:

- `schmeckts-server_<version>_amd64.deb` für PCs mit Intel- oder AMD-Prozessor, also so gut wie alle Mini-PCs
- `schmeckts-server_<version>_arm64.deb` für PCs mit ARM-Prozessor

Wenn du unsicher bist, öffne die Einstellungen, geh ganz unten auf „System“ und dann auf „Über“. Wenn dort Intel,
AMD oder Celeron steht, nimmst du amd64.

Lade die Datei anschließend auf den Mini-PC herunter, zum Beispiel indem du diese Seite dort im Browser öffnest.

### 2. Installieren

1. Doppelklicke im Ordner „Downloads“ auf die .deb-Datei. Daraufhin öffnet sich die Softwareverwaltung.
2. Klicke auf „Installieren“ und gib dein Passwort ein.

Falls sich nichts öffnet oder stattdessen eine Fehlermeldung kommt, mach einen Rechtsklick auf die Datei und wähle
„Öffnen mit“ und dann „Softwareverwaltung“. Wenn auch das nicht klappt, öffne ein Terminal mit Strg+Alt+T und gib
dort Folgendes ein:

```
sudo apt install ~/Downloads/schmeckts-server_<version>_amd64.deb
```

Danach läuft der Server sofort los und startet von nun an automatisch mit dem PC.

### 3. Einen API-Schlüssel besorgen

Mit diesem Schlüssel kann der Server die Packungsfotos von Claude erkennen lassen. Pro Foto kostet das ungefähr
einen halben Cent.

1. Melde dich bei [platform.claude.com](https://platform.claude.com) an, oder lege dir ein Konto an und hinterlege eine Zahlungsart.
2. Erstelle unter „API Keys“ einen neuen Schlüssel, zum Beispiel mit dem Namen „Schmeckts“, und kopiere ihn. Er beginnt mit `sk-ant-`.
3. Setz dir unter „Limits“ am besten noch ein kleines monatliches Ausgabenlimit, zum Beispiel 5 Dollar.

### 4. Einrichten

1. Öffne das Anwendungsmenü und starte „Schmeckt’s-Server einrichten“.
2. Wähle „Einrichten oder API-Schlüssel ändern“, füge den Schlüssel ein, bestätige und gib dein Passwort ein.
3. Der Server prüft den Schlüssel bei Anthropic, und danach zeigt dir das Fenster die **Adresse** und den **Haushalts-Code** an.

In diesem Fenster kannst du die Verbindungsdaten jederzeit wieder aufrufen. Unter „Übersicht“ siehst du außerdem,
was alles gespeichert ist (Tiere, Futter, letzte Mahlzeiten, Geräte), und mit „Neuer Code“ erstellst du einen neuen
Haushalts-Code, falls mal ein Handy verloren geht.

### 5. Die Handys verbinden

Tippe in der App beim ersten Start auf „Mit Haushalt verbinden“, später findest du den Punkt unter Einstellungen,
„Haushalt“, „Mit Haushalt verbinden“. Dort trägst du Adresse und Haushalts-Code ein und tippst auf „Verbinden“.
Danach gleichen alle Handys ihre Daten von allein ab, zu Hause über das WLAN und unterwegs, sobald WireGuard läuft.
Wenn etwas wartet oder der Abgleich hakt, erscheint oben in der App ein kleiner Hinweis. Nach einem neuen Code steht
dort „Code prüfen“, und du tippst den neuen Code einfach dort ein.

## Gut zu wissen

- **Backups:** Der Server legt täglich ein Backup an und behält die letzten 30 davon, zu finden unter `/var/lib/schmeckts/backups`.
- **Updates:** Doppelklicke einfach wieder auf die neue .deb-Datei, oder nimm im Terminal `sudo apt install ~/Downloads/schmeckts-server_<version>_amd64.deb`. Daten, Code und API-Schlüssel bleiben dabei erhalten.
- **Übersicht im Terminal:** `sudo schmeckts-server overview`.
- **Läuft er noch?** Mit `systemctl status schmeckts` siehst du den Zustand und mit `journalctl -u schmeckts -e` die letzten Meldungen.
- **Backup zurückspielen:** `sudo schmeckts-server restore` listet dir erst einmal alle Backups auf. Wenn du eines davon mit angibst, wird es zurückgespielt. Die Handys gleichen danach alles automatisch neu ab.
- **Nicht ins Internet stellen:** Richte im Router bitte keine Portweiterleitung für den Server ein. Er nimmt ohnehin nur Anfragen aus dem Heimnetz und über WireGuard entgegen.
