# Schmeckt’s? – der Haushalts-Server

Die App braucht keinen Server. Er ist ein Zusatz für Haushalte, in denen mehrere Leute füttern: Die Handys gleichen
sich über ihn im WLAN ab, und wenn du willst, lässt er Packungsfotos von einer KI erkennen. Jedes Handy behält dabei
alle Daten selbst und läuft weiter wie gewohnt, wenn der Server einmal aus ist. Er ist ein kleines Programm für einen
Rechner bei euch zu Hause, ein Mini-PC reicht. Nach draußen gehen von ihm nur die Packungsfotos zur Erkennung.

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

Beide hängen an jedem Release der App. Öffne am Mini-PC im Browser
[github.com/hazymorning/Schmeckts/releases/latest](https://github.com/hazymorning/Schmeckts/releases/latest) und lade
unter „Assets“ die passende Datei herunter.

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

### 3. Einen API-Schlüssel besorgen (optional)

Den Schlüssel brauchst du nur für die Foto-Erkennung. Damit lässt der Server die Packungsfotos von Claude erkennen,
pro Foto kostet das ungefähr einen halben Cent. Ohne Schlüssel gleicht der Server nur die Handys ab, dann kannst du
diesen Schritt überspringen.

1. Melde dich bei [platform.claude.com](https://platform.claude.com) an, oder lege dir ein Konto an und hinterlege eine Zahlungsart.
2. Erstelle unter „API Keys“ einen neuen Schlüssel, zum Beispiel mit dem Namen „Schmeckts“, und kopiere ihn. Er beginnt mit `sk-ant-`.
3. Setz dir unter „Limits“ am besten noch ein kleines monatliches Ausgabenlimit, zum Beispiel 5 Dollar.

### 4. Einrichten

1. Öffne das Anwendungsmenü und starte „Schmeckt’s-Server einrichten“.
2. Wähle „Einrichten“, füge den Schlüssel ein oder lass das Feld leer, bestätige und gib dein Passwort ein.
3. Einen Schlüssel prüft der Server bei Anthropic. Danach zeigt dir das Fenster die **Adresse** und den **Haushaltscode** an.

Unter „Verbindungsdaten“ rufst du beides jederzeit wieder auf. Mit „Neuer Code“ erstellst du einen neuen
Haushaltscode, falls mal ein Handy verloren geht. Einen Schlüssel kannst du später über „Einrichten“ nachtragen.

### 5. Die Handys verbinden

Tippe in der App auf Einstellungen, „Haushalt“, „Mit Haushalt verbinden“, trag Adresse und Haushaltscode ein und
tippe auf „Verbinden“. Was schon auf dem Handy ist, bleibt und wird mit dem Haushalt geteilt.
Danach gleichen alle Handys ihre Daten von allein ab, zu Hause über das WLAN und unterwegs, sobald WireGuard läuft.
Wenn etwas wartet oder der Abgleich hakt, erscheint oben in der App ein kleiner Hinweis. Nach einem neuen Code steht
dort „Code prüfen“, und du tippst den neuen Code einfach dort ein.

## Gut zu wissen

- **Die Daten liegen auf den Handys:** Geht auf dem Server etwas verloren, schicken die Handys beim nächsten Abgleich wieder alles, was sie haben. Ein eigenes Backup braucht der Server deshalb nicht.
- **Updates:** Lade die neue .deb-Datei wie oben vom neuesten Release herunter und doppelklicke sie, oder nimm im Terminal `sudo apt install ~/Downloads/schmeckts-server_<version>_amd64.deb`. Daten, Code und API-Schlüssel bleiben dabei erhalten.
- **Läuft er noch?** Mit `systemctl status schmeckts` siehst du den Zustand und mit `journalctl -u schmeckts -e` die letzten Meldungen.
- **Nicht ins Internet stellen:** Richte im Router bitte keine Portweiterleitung für den Server ein. Er nimmt ohnehin nur Anfragen aus dem Heimnetz und über WireGuard entgegen.
