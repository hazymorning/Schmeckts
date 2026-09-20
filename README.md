<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/3452ef7d-22bc-457c-add0-9909317ddee5">
    <img src="https://github.com/user-attachments/assets/33fcbc0a-b332-4e04-8abf-8513f341388a" width="880" alt="Schmeckt’s? – Die App, die sich merkt, welches Futter bei deinem Tier ankommt.">
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Android-8.0%2B-965E4B?logo=android&logoColor=white&labelColor=2E2724" alt="Android 8.0 oder neuer">
  <img src="https://img.shields.io/badge/Sprache-Deutsch-965E4B?labelColor=2E2724" alt="Sprache: Deutsch">
</p>

<p align="center">
  <a href="https://github.com/hazymorning/Schmeckts/releases/latest"><img src="https://github.com/user-attachments/assets/f3f3026c-2e0e-408f-bb06-eb2754afd68f" width="292" alt="APK herunterladen"></a>
</p>

**Schmeckt’s?** ist ein Futtertagebuch für Haustiere. Nach jeder Mahlzeit hältst du mit einem Fingertipp fest, wie der Napf aussah, von „Sofort leer“ bis „Kaum angerührt“. Aus diesen Bewertungen entsteht ein belastbares Bild davon, welche Sorten dein Tier wirklich mag und welche beim nächsten Einkauf im Regal bleiben können.

Die App arbeitet wahlweise allein auf dem Gerät oder gemeinsam mit einem Server für den ganzen Haushalt. Die Unterschiede stehen unter [Lokal oder im Haushalt](#lokal-oder-im-haushalt).

<!-- Screenshots eintragen und diese Kommentarzeichen entfernen.
<p align="center">
  <img src="ADRESSE-HELL" width="270" alt="Startseite im hellen Design">
  &nbsp;&nbsp;&nbsp;
  <img src="ADRESSE-DUNKEL" width="270" alt="Startseite im dunklen Design">
</p>
-->

## Funktionen

- **Mahlzeiten erfassen:** Barcode scannen, Verpackung fotografieren oder eine bekannte Sorte aus der Liste wählen. Der Eintrag ist sofort gespeichert.
- **Bewerten:** Ein Fingertipp genügt. Nassfutter, Trockenfutter und Snacks haben jeweils eigene, passende Stufen.
- **Einkaufsliste:** Die App ordnet jede Sorte unter „Nachkaufen“ oder „Nicht mehr kaufen“ ein. Die Einordnung lässt sich von Hand überschreiben, die Liste lässt sich teilen.
- **Auswertung:** Welche Marke, welche Konsistenz und welche Geschmacksrichtung kommen am besten an? Die App meldet sich außerdem, wenn eine Sorte wiederholt liegen bleibt oder ein Tier spürbar schlechter frisst als sonst.
- **Verlauf:** Kalender und Tagesübersicht aller Mahlzeiten, dazu ein kurzer Rückblick auf die vergangene Woche.
- **Erinnerungen:** Auf Wunsch erinnert die App ans Bewerten oder an die üblichen Fütterungszeiten. Beides ist zunächst ausgeschaltet.
- **Mehrere Tiere:** Katzen, Hunde, Kleintiere und Vögel, jedes mit Profilbild und eigener Auswertung.
- **Datensicherung:** Alle Daten lassen sich als Datei exportieren und wieder einlesen.

Die App hat ein helles und ein dunkles Design und folgt darin der Einstellung des Geräts.

## Lokal oder im Haushalt

Beim ersten Start entscheidest du, wie die App arbeiten soll. Ein Wechsel ist später jederzeit möglich, die bereits erfassten Daten bleiben dabei erhalten.

**Nur auf diesem Gerät.** Alle Daten liegen auf dem Handy, die App baut von sich aus keine Internetverbindung auf. Eine unbekannte Sorte benennst du einmal selbst; danach erkennt die App sie am Barcode wieder. Für eine Person, die ihre Tiere allein füttert, reicht diese Betriebsart vollständig aus.

**Im Haushalt.** Mehrere Personen führen dasselbe Tagebuch: Jedes Gerät zeigt, was die anderen eingetragen haben, auch rückwirkend, wenn ein Handy zwischendurch offline war. Dafür läuft ein eigener Server, ein schlanker Cloudflare Worker. Er übernimmt zusätzlich die beiden Aufgaben, die sich auf dem Gerät allein nicht lösen lassen: Er erkennt Marke und Sorte auf dem Foto der Verpackung und schlägt unbekannte Barcodes in Produktdatenbanken nach. Ein Foto genügt dann, um eine neue Sorte anzulegen.

| | Nur auf diesem Gerät | Im Haushalt |
|---|---|---|
| Mahlzeiten erfassen und bewerten | ja | ja |
| Auswertung, Einkaufsliste, Erinnerungen | ja | ja |
| Daten mit anderen Personen teilen | nein | ja |
| Sorte automatisch vom Verpackungsfoto erkennen | nein | ja |
| Unbekannte Barcodes nachschlagen | nein | ja |
| Voraussetzung | keine | Server für den Haushalt |

Der Server steht derzeit noch nicht allgemein zur Verfügung.

## Installation

Schmeckt’s? ist nicht im Play Store erhältlich und wird als APK-Datei direkt von GitHub installiert.

1. Auf dem Android-Gerät die [aktuelle Version](https://github.com/hazymorning/Schmeckts/releases/latest) öffnen und unter „Assets“ die APK-Datei herunterladen.
2. Die heruntergeladene Datei öffnen. Beim ersten Mal fragt Android, ob der Browser Apps installieren darf. Die Erlaubnis in den angezeigten Einstellungen erteilen und zurückgehen.
3. „Installieren“ wählen.

Da die App nicht aus dem Play Store stammt, bietet Google Play Protect unter Umständen an, sie vor der Installation zu prüfen. Das ist bei APK-Dateien der Normalfall.

**Updates** werden über die vorhandene Version installiert, alle Daten bleiben erhalten.

**Systemvoraussetzungen:** Android 8.0 oder neuer. Der Barcode-Scanner setzt die Google Play-Dienste voraus; alle übrigen Funktionen arbeiten auch ohne sie.

## Datenschutz

- Alle Daten liegen im privaten Speicher der App. Fotos erscheinen nicht in der Galerie, und die App ist von der Cloud-Sicherung von Google ausgenommen.
- Die App enthält keine Werbung und keine Analyse- oder Tracking-Dienste.
- Mit der Einstellung „Nur auf diesem Gerät“ baut die App selbst keine Internetverbindung auf. Einzige Ausnahme ist der Barcode-Scanner: Er ist Bestandteil der Google Play-Dienste und überträgt nach Angaben von Google keine Bilder, aber allgemeine Diagnose- und Nutzungsdaten wie das Gerätemodell.
- Im Haushalt kommuniziert die App ausschließlich mit dem eigenen Server. Dieser übermittelt Verpackungsfotos zur Erkennung an einen KI-Dienst und die Nummern unbekannter Barcodes an Open Pet Food Facts und Open Food Facts. Übertragen wird jeweils nur das dafür Nötige, keine Angaben zu Tieren oder Personen.
- Berechtigungen: Die Kamera wird für Verpackungs- und Tierfotos verwendet. Nach der Erlaubnis für Benachrichtigungen fragt die App erst, wenn du eine Erinnerung einschaltest.

## Feedback

Fehler und Verbesserungsvorschläge bitte als [Issue](https://github.com/hazymorning/Schmeckts/issues/new/choose) melden. Hilfreich sind Gerätemodell, Android-Version und die Version der App. Sie steht in den Einstellungen ganz unten.

## Lizenz

© 2026 hazymorning. Alle Rechte vorbehalten. Die App darf für den eigenen Gebrauch installiert und genutzt werden.

Verwendete Open-Source-Komponenten: [Capacitor](https://capacitorjs.com) (MIT), [Capacitor ML Kit Barcode Scanning](https://github.com/capawesome-team/capacitor-mlkit) (Apache 2.0) sowie die Schriften [Figtree](https://github.com/erikdkennedy/figtree) und [Fraunces](https://github.com/undercasetype/Fraunces) (SIL Open Font License 1.1).

<!-- Sobald das Repo öffentlich ist, können diese Badges oben ergänzt werden. Sie halten sich selbst aktuell:
  <a href="https://github.com/hazymorning/Schmeckts/releases/latest"><img src="https://img.shields.io/github/v/release/hazymorning/Schmeckts?label=Version&color=965E4B&labelColor=2E2724" alt="Aktuelle Version"></a>
  <a href="https://github.com/hazymorning/Schmeckts/releases"><img src="https://img.shields.io/github/downloads/hazymorning/Schmeckts/total?label=Downloads&color=965E4B&labelColor=2E2724" alt="Downloads"></a>
-->
