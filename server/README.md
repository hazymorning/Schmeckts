# Schmeckt’s? – der Haushalts-Server

Nur nötig, wenn mehrere Menschen dasselbe Fütterungstagebuch führen. Es ist ein kleines Programm für einen Rechner,
der zu Hause läuft; ein Mini-PC reicht dafür völlig. Er hält die gemeinsamen Daten, gibt Packungsfotos zur Erkennung
weiter und schlägt Barcodes nach. Nichts davon läuft auf fremden Rechnern. [Die App](../README.md) funktioniert auch
ohne ihn.

Alles, was den Server ausmacht, liegt in diesem Ordner: das Go-Programm, `packaging/` für das Debian-Paket und
`build-deb.sh`, das es baut.

## Einrichten

Etwa zehn Minuten, alles davon am Mini-PC mit Maus und Tastatur. Dein Passwort wird einmal gebraucht.

### 1. Die richtige Datei wählen

Vom Paket gibt es zwei Ausgaben:

- `schmeckts-server_<version>_amd64.deb` für PCs mit Intel- oder AMD-Prozessor (nahezu alle Mini-PCs)
- `schmeckts-server_<version>_arm64.deb` für PCs mit ARM-Prozessor

Im Zweifel: Einstellungen öffnen, ganz unten auf „System“, dann „Über“. Steht dort Intel, AMD oder Celeron, nimm amd64.

Lade die Datei auf den Mini-PC herunter, zum Beispiel indem du diese Seite dort im Browser öffnest.

### 2. Installieren

1. Doppelklicke im Ordner „Downloads“ auf die .deb-Datei. Die Softwareverwaltung öffnet sich.
2. Klicke auf „Installieren“ und gib dein Passwort ein.

Öffnet sich nichts oder erscheint stattdessen ein Fehler: Rechtsklick auf die Datei, „Öffnen mit“, „Softwareverwaltung“.
Klappt auch das nicht, öffne ein Terminal (Strg+Alt+T) und gib ein:

```
sudo apt install ~/Downloads/schmeckts-server_<version>_amd64.deb
```

Der Server läuft danach sofort und startet künftig automatisch mit dem PC.

### 3. Einen API-Schlüssel besorgen

Mit dem Schlüssel lässt der Server Packungsfotos von Claude erkennen. Das kostet etwa einen halben Cent je Foto.

1. Melde dich bei [platform.claude.com](https://platform.claude.com) an oder lege ein Konto an und hinterlege eine Zahlungsart.
2. Erstelle unter „API Keys“ einen neuen Schlüssel, zum Beispiel mit dem Namen „Schmeckts“, und kopiere ihn. Er beginnt mit `sk-ant-`.
3. Empfehlenswert: Setze unter „Limits“ ein kleines monatliches Ausgabenlimit, etwa 5 Dollar.

### 4. Einrichten

1. Öffne das Anwendungsmenü und starte „Schmeckt’s-Server einrichten“.
2. Wähle „Einrichten oder API-Schlüssel ändern“, füge den Schlüssel ein, bestätige und gib dein Passwort ein.
3. Der Server prüft den Schlüssel bei Anthropic. Danach zeigt das Fenster die **Adresse** und den **Haushalts-Code**.

Dasselbe Fenster zeigt die Verbindungsdaten jederzeit wieder an, listet mit „Übersicht“ die gespeicherten Daten auf
(Tiere, Futter, letzte Mahlzeiten, Geräte) und erstellt mit „Neuer Code“ einen neuen Haushalts-Code, falls ein Handy
abhandenkommt.

### 5. Die Handys verbinden

In der App: beim ersten Start „Mit Haushalt verbinden“ (später: Einstellungen, „Haushalt“, „Mit Haushalt verbinden“),
Adresse und Haushalts-Code eintippen, dann „Verbinden“. Danach gleichen alle Handys ihre Daten automatisch ab: zu
Hause über das WLAN, unterwegs, sobald WireGuard läuft. Wartet etwas oder hakt der Abgleich, erscheint oben in der App
ein kleiner Hinweis. Nach einem neuen Code steht dort „Code prüfen“; tippe den neuen Code dann dort ein.

## Gut zu wissen

- **Backups:** Der Server schreibt täglich ein Backup und behält die letzten 30, in `/var/lib/schmeckts/backups`.
- **Updates:** Einfach die neue .deb-Datei wieder doppelklicken, oder im Terminal `sudo apt install ~/Downloads/schmeckts-server_<version>_amd64.deb`. Daten, Code und API-Schlüssel bleiben erhalten.
- **Übersicht im Terminal:** `sudo schmeckts-server overview`.
- **Läuft er?** `systemctl status schmeckts` zeigt den Zustand, `journalctl -u schmeckts -e` die letzten Meldungen.
- **Backup zurückspielen:** `sudo schmeckts-server restore` listet die Backups auf. Mit einer Datei als Angabe liest der Befehl sie wieder ein. Die Handys gleichen danach automatisch alles neu ab.
- **Nicht ins Internet stellen:** Richte im Router keine Portweiterleitung für den Server ein. Er nimmt ohnehin nur Anfragen aus dem Heimnetz und über WireGuard an.
