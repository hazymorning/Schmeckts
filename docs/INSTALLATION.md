# Schmeckt’s-Server installieren

Etwa zehn Minuten, alles am Mini-PC mit Maus und Tastatur. Einmal wird dein Passwort gebraucht.

## 1. Passende Datei wählen

Es gibt zwei Fassungen des Pakets:

- `schmeckts-server_1.1.0_amd64.deb` für PCs mit Intel- oder AMD-Prozessor (fast alle Mini-PCs)
- `schmeckts-server_1.1.0_arm64.deb` für PCs mit ARM-Prozessor

Wenn du unsicher bist: Einstellungen öffnen, ganz unten „System“, dann „Info“. Steht beim Prozessor Intel, AMD oder Celeron, nimm amd64.

Lade die Datei auf dem Mini-PC herunter, zum Beispiel indem du diesen Chat dort im Browser öffnest.

## 2. Installieren

1. Im Ordner „Downloads“ doppelt auf die .deb-Datei klicken. Das App-Zentrum öffnet sich.
2. Auf „Installieren“ klicken und dein Passwort eingeben.

Öffnet sich stattdessen nichts oder eine Fehlermeldung: rechte Maustaste auf die Datei, „Öffnen mit“, „App-Zentrum“. Klappt auch das nicht, ein Terminal öffnen (Strg+Alt+T) und eingeben:

```
sudo apt install ~/Downloads/schmeckts-server_1.1.0_amd64.deb
```

Der Server läuft danach sofort und startet mit dem PC automatisch.

## 3. API-Schlüssel besorgen

Der Schlüssel erlaubt dem Server, Packungsfotos von Claude erkennen zu lassen. Das kostet grob einen halben Cent pro Foto.

1. Auf [platform.claude.com](https://platform.claude.com) anmelden oder ein Konto anlegen und ein Zahlungsmittel hinterlegen.
2. Unter „API Keys“ einen neuen Schlüssel erstellen, zum Beispiel mit dem Namen „Schmeckts“, und kopieren. Er beginnt mit `sk-ant-`.
3. Empfehlung: Unter „Limits“ ein kleines monatliches Ausgabenlimit setzen, etwa 5 Dollar.

## 4. Einrichten

1. Das App-Menü öffnen und „Schmeckt’s-Server einrichten“ starten.
2. „Einrichten oder API-Schlüssel ändern“ wählen, den Schlüssel einfügen, bestätigen und das Passwort eingeben.
3. Der Server prüft den Schlüssel bei Anthropic. Danach zeigt das Fenster die **Adresse** und den **Haushaltscode**.

Dasselbe Fenster zeigt jederzeit wieder die Verbindungsdaten, mit „Übersicht“ den Datenbestand (Tiere, Futter, letzte Mahlzeiten, Geräte) und erzeugt mit „Neuer Code“ einen neuen Haushaltscode, falls ein Handy verloren geht.

## 5. Handys verbinden

In der App: beim ersten Start „Mit Haushalt verbinden“ (später: Einstellungen, „Haushalt“, „Mit Haushalt verbinden“), Adresse und Haushaltscode eintippen, „Verbinden“. Danach gleichen alle Handys ihre Daten automatisch ab, zu Hause über das WLAN und unterwegs, sobald WireGuard aktiv ist. Wartet etwas oder hakt der Abgleich, erscheint oben in der App ein kleiner Hinweis. Nach einem neuen Code zeigt er „Code prüfen“, dann dort den neuen Code eintippen.

## Gut zu wissen

- **Backups:** Der Server legt jeden Tag eine Sicherung an und behält die letzten 30, im Ordner `/var/lib/schmeckts/backups`.
- **Update:** Die neue .deb-Datei einfach wieder doppelklicken oder im Terminal `sudo apt install ~/Downloads/schmeckts-server_1.1.0_amd64.deb`. Daten, Code und API-Schlüssel bleiben erhalten.
- **Übersicht im Terminal:** `sudo schmeckts-server uebersicht`.
- **Läuft er?** Im Terminal `systemctl status schmeckts` zeigt den Zustand, `journalctl -u schmeckts -e` die letzten Meldungen.
- **Backup zurückspielen:** `sudo schmeckts-server wiederherstellen` listet die Sicherungen auf. Mit einer Datei dahinter spielt der Befehl sie ein. Die Handys gleichen danach automatisch komplett neu ab.
- **Nicht ins Internet stellen:** Für den Server keine Portfreigabe im Router einrichten. Er nimmt ohnehin nur Anfragen aus dem Heimnetz und über WireGuard an.
