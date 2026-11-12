<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme/hero-dark.svg">
  <img src=".github/readme/hero-light.svg" alt="Schmeckt’s? Eine App für Katzen mit Ansprüchen.">
</picture></p>

Mau weiß genau, was ihr schmeckt. Sie sagt es dir nur nicht.

Schmeckt’s? schreibt mit. Beim Füttern fotografierst du die Packung, später tippst du an, wie viel Mau gefressen hat. Nach ein paar Wochen weißt du es auch.

<a href="https://github.com/hazymorning/Schmeckts/releases/latest/download/schmeckts.apk"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-dark.svg"><img src=".github/readme/download-light.svg" width="224" alt="Download für Android"></picture></a><br>
[So kommt die App aufs Handy](#how-to-install)

- Liest die Sorte von der Packung ab, per Foto oder Barcode.
- Kennt sechs Stufen von „Alles“ bis „Nix“, auch „nur die Soße geleckt“.
- Zeigt, was ankommt und was stehen bleibt, und macht daraus eine Einkaufsliste.
- Erinnert ans Füttern, falls Mau das mal vergisst.
- Merkt, wenn Mau ein paar Tage schlechter frisst als sonst.
- Kommt auch klar, wenn Mau nicht allein wohnt oder mehrere Leute füttern.
- Hat einen Katzenkalender zum Abreißen. Freitags steht ein Flachwitz drauf.
- Findet neue Versionen selbst und installiert sie auf einen Tipp.

Weil Mau bekanntlich sehr auf ihre Privatsphäre achtet, bleibt bei Schmeckt’s? alles auf deinem Handy.

<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme/screens-dark.png">
  <img src=".github/readme/screens-light.png" alt="Drei Bildschirme der App: „Was gibt’s heute?“ mit Barcode und Foto, die Frage „Wie war’s?“ mit den Stufen von Alles bis Nix und die Vorlieben mit Tops und Flops.">
</picture></p>

<!-- Der QR-Code springt hierher (…#how-to-install). Nicht löschen. -->
<a id="how-to-install"></a>

<details>
<summary>So kommt die App aufs Handy</summary>
<br>

Im Play Store gibt es Schmeckt’s? nicht, nur hier. Android stellt deshalb beim Installieren ein paar Fragen.

<a href="https://github.com/hazymorning/Schmeckts/releases/latest/download/schmeckts.apk"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readme/download-dark.svg"><img src=".github/readme/download-light.svg" width="224" alt="Download für Android"></picture></a>

1. Öffne diese Seite auf dem Handy und tippe auf „Download für Android“. Falls der Browser vor der Datei warnt, lade sie trotzdem herunter.
2. Öffne die Datei, sobald sie da ist. Später findest du sie als „schmeckts.apk“ in deinen Downloads.
3. Beim ersten Mal musst du deinem Browser erlauben, Apps zu installieren. Tippe dazu auf „Einstellungen“, schalte „Aus dieser Quelle zulassen“ ein und geh zurück.
4. Tippe auf „Installieren“. Danach liegt Schmeckt’s? bei deinen anderen Apps.

Neue Versionen findet die App danach selbst. Beim ersten Update fragt Android noch einmal, diesmal ob Schmeckt’s? Apps installieren darf.

</details>

<details>
<summary>Wenn dabei etwas hakt</summary>
<br>

Play Protect will die App vielleicht erst prüfen, weil sie nicht aus dem Play Store kommt. Das kannst du ruhig zulassen.

Lädst du eine neue Version doch mal von Hand, installier sie einfach über die alte. Lösch die alte App vorher nicht, sonst sind alle Einträge weg.

Steht da „App nicht installiert“, ist meistens noch eine alte Testversion auf dem Handy. Sichere dann in den Einstellungen unter „Backup“ deine Einträge und lösch die alte App. Danach installierst du die neue und liest das Backup wieder ein.

Auf Handys ohne Google-Dienste geht alles bis auf den Barcode-Scanner, denn der kommt von Google.

Ältere Versionen liegen [hier](https://github.com/hazymorning/Schmeckts/releases).

</details>

<details>
<summary>Wenn ihr zu mehreren füttert</summary>
<br>

Tragt in den Einstellungen eure Namen ein, dann steht bei jeder Mahlzeit, wer gefüttert hat. Neue Einträge schickt ihr euch über „Austausch von Hand“ als Datei zu, zum Beispiel per WhatsApp. Ein Konto braucht dafür keiner. Unter „Vorlieben“ steht dann auch, bei wem Mau besser frisst. Das kann zu Diskussionen führen.

Wer sich mit Computern auskennt, kann zu Hause einen kleinen [Server](server/) hinstellen, nötig ist er nicht. Mit ihm gleichen sich die Handys von selbst ab, und auf Wunsch erkennt eine KI die Sorten auf den Fotos.

</details>

<details>
<summary>Was das Handy doch verlässt</summary>
<br>

Du musst dich nirgends anmelden, und Werbung oder Tracking gibt es nicht. Ein paar Ausnahmen gibt es trotzdem.

Beim Start fragt die App bei GitHub nach, ob es eine neue Version gibt. Dabei geht nur diese Frage raus, keine Einträge. In den Einstellungen unter „Updates“ lässt sich das abschalten.

Der Barcode-Scanner kommt von Google. Laut Google schickt er allgemeine Daten mit, zum Beispiel welches Handy du hast. Bilder sind nicht dabei.

Alles andere passiert nur, wenn du es einschaltest. Mit der „Sortensuche im Internet“ schaut die App unbekannte Barcodes in zwei freien Datenbanken nach und schickt dabei nur die Nummer.

Mit „Fotos mit eigener KI erkennen“ gehen die Packungsfotos direkt an Anthropic, OpenAI oder Google, je nachdem, von wem dein Schlüssel ist. Steht bei euch ein Server, schickt er die Fotos an Anthropic, und dort erkennt eine KI die Sorte. Das lässt sich in den Einstellungen bei „Fotos über den Server erkennen“ abschalten.

</details>

<details>
<summary>Fragen und Probleme</summary>
<br>

Fragen und Ideen sind im [Forum](https://github.com/hazymorning/Schmeckts/discussions) gut aufgehoben. Wenn etwas nicht richtig funktioniert, melde es bitte [hier](https://github.com/hazymorning/Schmeckts/issues/new/choose). Das Formular fragt nach der App-Version, die steht ganz unten in den Einstellungen.

</details>

<!-- Wenn das Repo öffentlich ist, können diese Badges oben mit rein. Sie aktualisieren sich von selbst:
  <a href="https://github.com/hazymorning/Schmeckts/releases/latest"><img src="https://img.shields.io/github/v/release/hazymorning/Schmeckts?label=Version&color=58603F&labelColor=25261F" alt="Neueste Version"></a>
  <a href="https://github.com/hazymorning/Schmeckts/releases"><img src="https://img.shields.io/github/downloads/hazymorning/Schmeckts/total?label=Downloads&color=58603F&labelColor=25261F" alt="Downloads"></a>
-->
