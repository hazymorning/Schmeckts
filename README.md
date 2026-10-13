<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme/header-dark.jpg">
  <img src=".github/readme/header-light.jpg" alt="Die Startseite von Schmeckt’s? mit dem Foto der Katze und der Frage „Wie war’s?“">
</picture>

Schmeckt’s? ist ein Futtertagebuch für Katzen. Du trägst ein, welche Sorte deine Katze bekommt und wie viel sie davon frisst. So findest du nach und nach heraus, was ihr schmeckt und was du beim Einkaufen im Regal lassen kannst.

Im Alltag führt man so ein Tagebuch aber nur, wenn es kaum Arbeit macht. Deshalb nimmt dir die App so viel ab, wie es nur geht. Beim Füttern tippst du meistens nur zwei- bis viermal.

<a href="https://github.com/hazymorning/Schmeckts/releases/latest/download/schmeckts.apk"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-dark.png"><img src=".github/readme/download-light.png" width="224" alt="Download für Android"></picture></a><br>
[So kommt die App aufs Handy](#installieren)

## So geht’s

1. Beim Füttern scannst du den Barcode oder machst ein Foto von der Packung. Wenn es die Sorte schon mal gab, bist du damit fertig. Bei einer neuen Sorte schlägt dir die App den Namen von der Packung vor, und wenn er stimmt, tippst du auf „Passt so“.
2. Später tippst du an, wie viel deine Katze gefressen hat, von „Alles“ bis „Nix“. Wenn du dich daran erinnern lässt, geht das auch direkt in der Benachrichtigung.
3. Nach ein paar Wochen siehst du unter „Vorlieben“, welche Sorten gut ankommen und welche deine Katze lieber stehen lässt.

![Die Vorlieben im hellen und im dunklen Design](.github/readme/light-dark.jpg)

<details>
<summary><b>Was die App sonst so kann</b></summary>
<br>

- Was es zuletzt gab, trägst du beim Füttern mit einem Tipp wieder ein. Wenn du lange auf das App-Symbol drückst, kannst du auch gleich scannen oder ein Foto machen.
- Wenn du willst, merkt sich die App, wann ihr normalerweise füttert, und erinnert dich, falls noch nichts eingetragen ist.
- Unter „Vorlieben“ siehst du mit der Zeit auch, welche Marke am besten ankommt und ob deine Katze lieber Gelee oder Pastete mag.
- Die Startseite zeigt dir, wenn deine Katze ein paar Tage lang schlechter frisst als sonst.
- Mit einem Tipp notierst du, wie es deiner Katze geht, zum Beispiel „Gut drauf“ oder „Erbrochen“. Die App sagt dir, wenn so etwas nach einer bestimmten Sorte öfter vorkommt.
- Auf der Einkaufsliste steht, was du wieder kaufen kannst und was besser nicht mehr. Du kannst sie auch per Nachricht verschicken.
- Jeden Tag kannst du auf der Startseite ein Blatt vom Katzenkalender abreißen. Freitags steht ein Flachwitz drauf.
- Mehrere Katzen sind kein Problem. Wenn du das Handy wechselst, kommen per Backup alle Einträge mit.

</details>

<details>
<summary><b>Wenn ihr euch das Füttern teilt</b></summary>
<br>

Am besten trägt jeder von euch in den Einstellungen seinen Namen ein. Dann ist bei jeder Mahlzeit klar, wer gefüttert hat. Über „Austausch von Hand“ schickt ihr euch neue Einträge als Datei, zum Beispiel per WhatsApp. Ein Konto braucht ihr dafür nicht. Unter „Vorlieben“ seht ihr dann sogar, ob es eurer Katze bei einem von euch besser schmeckt.

Mit einem kleinen [Server](server/) bei euch zu Hause landen neue Einträge von selbst auf allen Handys, und eine KI erkennt die Sorten auf den Fotos. Zum Einrichten braucht ihr jemanden, der sich mit Computern auskennt. Die App kommt aber auch ganz ohne Server aus.

</details>

<!-- Der QR-Code springt hierher (…#how-to-install). Nicht löschen. -->
<a id="how-to-install"></a>

## Installieren

Die App gibt es nicht im Play Store, aber du kannst sie hier herunterladen. Dein Handy braucht mindestens Android 7.

<a href="https://github.com/hazymorning/Schmeckts/releases/latest/download/schmeckts.apk"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-dark.png"><img src=".github/readme/download-light.png" width="224" alt="Download für Android"></picture></a>

1. Öffne diese Seite auf deinem Handy und tippe auf „Download für Android“. Falls der Browser vor der Datei warnt, lade sie trotzdem herunter.
2. Sobald die Datei heruntergeladen ist, öffne sie. Du findest sie auch später noch als `schmeckts.apk` in deinen Downloads.
3. Beim ersten Mal musst du deinem Browser erlauben, Apps zu installieren. Tippe dazu auf „Einstellungen“, schalte „Aus dieser Quelle zulassen“ ein und geh zurück.
4. Tippe auf „Installieren“. Danach findest du Schmeckt’s? bei deinen anderen Apps.

<details>
<summary><b>Wenn etwas nicht klappt</b></summary>
<br>

Play Protect möchte die App vielleicht erst prüfen, weil sie nicht aus dem Play Store kommt. Das kannst du ruhig zulassen.

Für ein Update installierst du die neue Version einfach über die alte. Lösch die alte App vorher aber nicht, sonst sind alle Einträge weg.

Die Meldung „App nicht installiert“ bedeutet meistens, dass noch eine alte Testversion auf dem Handy ist. Sichere dann in den Einstellungen unter „Backup“ deine Einträge und lösch die alte App. Sobald die neue installiert ist, liest du die Sicherung dort wieder ein.

Auf Handys ohne Google-Dienste geht nur der Barcode-Scanner nicht, weil er von Google kommt.

[Hier](https://github.com/hazymorning/Schmeckts/releases) findest du alle bisherigen Versionen.

</details>

## Datenschutz

Weil Katzen bekanntlich sehr auf ihre Privatsphäre achten, bleibt bei Schmeckt’s? alles auf deinem Handy. Du musst dich nirgends anmelden, und Werbung oder Tracking gibt es auch nicht.

<details>
<summary><b>Es gibt ein paar Ausnahmen</b></summary>
<br>

Der Barcode-Scanner kommt von Google. Google bekommt darüber nach eigenen Angaben allgemeine Nutzungsdaten wie das Handymodell, aber keine Bilder. Die „Sortensuche im Internet“ ist am Anfang ausgeschaltet. Wenn du sie einschaltest, schaut die App unbekannte Barcodes in zwei freien Datenbanken nach und schickt dabei nur die Nummer.

Mit „Fotos mit eigener KI erkennen“ gehen die Packungsfotos direkt an deinen KI-Anbieter, also an Anthropic, OpenAI oder Google. Falls ihr einen Server zu Hause habt, schickt er die Fotos an Anthropic, damit dort eine KI die Sorte erkennt. Das kannst du in den Einstellungen abschalten.

</details>

## Fragen und Probleme

Für Fragen und Ideen gibt es das [Forum](https://github.com/hazymorning/Schmeckts/discussions). Wenn etwas nicht richtig funktioniert, melde es bitte [hier](https://github.com/hazymorning/Schmeckts/issues/new/choose). Das Formular fragt dabei nach der App-Version, die ganz unten in den Einstellungen steht. Für beides brauchst du ein Konto bei GitHub, aber das ist kostenlos.

<!-- Wenn das Repo öffentlich ist, können diese Badges oben mit rein. Sie aktualisieren sich von selbst:
  <a href="https://github.com/hazymorning/Schmeckts/releases/latest"><img src="https://img.shields.io/github/v/release/hazymorning/Schmeckts?label=Version&color=58603F&labelColor=25261F" alt="Neueste Version"></a>
  <a href="https://github.com/hazymorning/Schmeckts/releases"><img src="https://img.shields.io/github/downloads/hazymorning/Schmeckts/total?label=Downloads&color=58603F&labelColor=25261F" alt="Downloads"></a>
-->
