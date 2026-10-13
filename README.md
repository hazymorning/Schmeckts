<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme/header-dark.jpg">
  <img src=".github/readme/header-light.jpg" alt="Schmeckt’s? auf dem Handy: die Startseite mit dem Foto der Katze und der Frage „Wie war’s?“">
</picture>

Katzen sind wählerisch: Was letzte Woche noch ratzeputz aufgefressen wurde, bleibt heute stehen. Welche Sorte gut ankam und welche nicht, weiß nach einem Monat keiner mehr. Aufschreiben würde helfen, aber das hält im Alltag kaum jemand lange durch.

Mit Schmeckt’s? geht das nebenbei. Pro Mahlzeit tippst du zwei-, dreimal, um den Rest kümmert sich die App. Mit der Zeit zeigt sie dir, welche Sorten deiner Katze wirklich schmecken.

<a href="https://github.com/hazymorning/Schmeckts/releases/latest/download/schmeckts.apk"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-dark.png"><img src=".github/readme/download-light.png" width="224" alt="Download für Android"></picture></a><br>
[So installierst du die App](#installieren)

## So geht’s

1. Beim Füttern den Barcode scannen oder die Packung fotografieren. Kennt die App die Sorte schon, ist die Mahlzeit damit eingetragen. Bei einer neuen Sorte liest sie den Namen von der Packung ab.
2. Später antippen, wie viel gefressen wurde, von „Alles“ bis „Nix“. Wenn du magst, erinnert dich die App daran, und du antwortest gleich in der Benachrichtigung.
3. Nach ein paar Wochen unter „Vorlieben“ nachsehen, was deiner Katze schmeckt und was du dir beim nächsten Einkauf sparen kannst.

![Die Vorlieben zweimal, links hell, rechts dunkel: oben die Sorten, die am besten ankommen, darunter die, die stehen bleiben](.github/readme/light-dark.jpg)

<details>
<summary><b>Was die App sonst noch kann</b></summary>
<br>

- Oben auf der Startseite steht, wann es zuletzt was gab und wie’s geschmeckt hat.
- Wenn du das App-Symbol gedrückt hältst, kommst du direkt zum Scanner oder zur Kamera.
- Die App merkt, ob deine Katze lieber Gelee oder Soße mag und ob ihr Snacks den Appetit verderben.
- Frisst deine Katze seit ein paar Tagen schlechter als sonst, steht ein Hinweis auf der Startseite.
- Die Einkaufsliste zeigt, was du nachkaufen solltest und was lieber nicht. Du kannst sie an den schicken, der gerade einkaufen geht.
- Beobachtungen wie „Gut drauf“, „Extra hungrig“ oder „Erbrochen“ tippst du einfach an. Kommt so etwas nach einer bestimmten Sorte öfter vor, siehst du das unter „Vorlieben“.
- Die App kann dich auch ans Füttern erinnern, wenn zur üblichen Zeit noch nichts eingetragen ist.
- Auf der Startseite hängt ein Abreißkalender mit Wissenswertem und Kuriosem über Katzen. Freitags gibt’s einen Flachwitz.
- Du kannst auch mehrere Katzen eintragen. Mit einem Backup nimmst du alles aufs neue Handy mit.

</details>

<details>
<summary><b>Wenn mehrere Leute füttern</b></summary>
<br>

Trag in den Einstellungen deinen Namen ein, dann steht bei jeder Mahlzeit, wer gefüttert hat. Neue Einträge schickst du über „Austausch von Hand“ als Datei ans andere Handy, zum Beispiel per WhatsApp oder Mail. Ein Konto braucht dafür keiner. Frisst deine Katze bei einem von euch deutlich besser, steht das unter „Vorlieben“.

Wer sich ein bisschen mit Computern auskennt, kann zu Hause einen kleinen [Server](server/) einrichten. Der hält dann alle Handys von selbst auf dem gleichen Stand und erkennt Sorten auf Fotos mit KI. Nötig ist er nicht.

</details>

<!-- Der QR-Code springt hierher (…#how-to-install). Nicht löschen. -->
<a id="how-to-install"></a>

## Installieren

Im Play Store gibt es die App nicht, du lädst sie hier herunter. Du brauchst ein Handy mit Android 7 oder neuer.

<a href="https://github.com/hazymorning/Schmeckts/releases/latest/download/schmeckts.apk"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-dark.png"><img src=".github/readme/download-light.png" width="224" alt="Download für Android"></picture></a>

1. Öffne diese Seite auf dem Handy, tippe auf den Knopf und bestätige den Download, falls der Browser nachfragt.
2. Tippe auf „Öffnen“ oder suche `schmeckts.apk` in deinen Downloads.
3. Beim ersten Mal fragt Android, ob der Browser Apps installieren darf. Tippe auf „Einstellungen“, schalte „Aus dieser Quelle zulassen“ ein und geh zurück.
4. Tippe auf „Installieren“ und danach auf „Öffnen“.

<details>
<summary><b>Wenn’s hakt</b></summary>
<br>

Will „Play Protect“ die App prüfen, weil sie nicht aus dem Play Store kommt, kannst du das ruhig zulassen.

Für ein Update installierst du die neue Version einfach über die alte. Lösch die alte App vorher nicht, sonst sind alle Einträge weg.

Meldet Android „App nicht installiert“, ist meist noch eine alte Testversion drauf. Dann in den Einstellungen unter „Backup“ alles sichern, die alte App löschen, die neue installieren und das Backup wieder einlesen.

Auf Handys ohne Google-Dienste läuft alles außer dem Barcode-Scanner, weil der von Google kommt.

Ältere Versionen findest du [hier](https://github.com/hazymorning/Schmeckts/releases).

</details>

## Datenschutz

Weil Katzen bekanntlich großen Wert auf ihre Privatsphäre legen, bleibt bei Schmeckt’s? alles auf deinem Handy. Du brauchst kein Konto, und es gibt weder Werbung noch Tracking.

<details>
<summary><b>Ein paar Ausnahmen</b></summary>
<br>

Der Barcode-Scanner kommt von Google. Laut Google meldet er Gerätedaten wie das Handymodell, aber keine Bilder. Die „Sortensuche im Internet“ ist erst mal aus. Schaltest du sie ein, schlägt sie unbekannte Barcodes in zwei öffentlichen Datenbanken nach und schickt dabei nur die Nummer. Nutzt du „Fotos mit eigener KI erkennen“, gehen Packungsfotos direkt an die Firma hinter dieser KI, also Anthropic, OpenAI oder Google. Ein Server zu Hause schickt die Fotos zum Erkennen an Anthropic, das kannst du aber abschalten.

</details>

## Fragen und Fehler

Fragen und Ideen gern ins [Forum](https://github.com/hazymorning/Schmeckts/discussions), Fehler bitte [hier melden](https://github.com/hazymorning/Schmeckts/issues/new/choose), am besten mit Handymodell, Android-Version und App-Version. Die App-Version steht ganz unten in den Einstellungen. Für beides brauchst du ein kostenloses GitHub-Konto.

<!-- Wenn das Repo öffentlich ist, können diese Badges oben mit rein. Sie aktualisieren sich von selbst:
  <a href="https://github.com/hazymorning/Schmeckts/releases/latest"><img src="https://img.shields.io/github/v/release/hazymorning/Schmeckts?label=Version&color=58603F&labelColor=25261F" alt="Neueste Version"></a>
  <a href="https://github.com/hazymorning/Schmeckts/releases"><img src="https://img.shields.io/github/downloads/hazymorning/Schmeckts/total?label=Downloads&color=58603F&labelColor=25261F" alt="Downloads"></a>
-->
