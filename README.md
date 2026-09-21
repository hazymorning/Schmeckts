<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/6de937ab-9d55-4474-939f-a8531965ff25">
    <img src="https://github.com/user-attachments/assets/c185d1f3-68fa-4d2a-89ce-02f7ed7a6293" width="880" alt="Schmeckt’s? – the app that remembers which food your pet actually likes.">
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Android-8.0%2B-965E4B?logo=android&logoColor=white&labelColor=2E2724" alt="Android 8.0 or newer">
  <img src="https://img.shields.io/badge/App%20language-German-965E4B?labelColor=2E2724" alt="App language: German">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-965E4B?labelColor=2E2724" alt="License: AGPL-3.0">
</p>

<p align="center">
  <a href="#how-to-install"><img src="https://github.com/user-attachments/assets/67f2a3c6-7ccb-484f-82e5-af64c5145dd0" width="292" alt="Install app"></a>
</p>

**Schmeckt’s?** is a feeding diary for pets. After every meal you record with a single tap how the bowl looked, from “finished at once” to “barely touched”. After a few days the app shows which varieties your animal really likes and which ones can stay on the shelf next time you shop.

> The app’s interface is German. This repository — code, comments, documentation — is English.

<!-- Add screenshots and remove these comment markers.
<p align="center">
  <img src="LIGHT-URL" width="270" alt="Home screen, light theme">
  &nbsp;&nbsp;&nbsp;
  <img src="DARK-URL" width="270" alt="Home screen, dark theme">
</p>
-->

## Photograph instead of typing

While feeding, just hold the packaging up to the camera. The app reads brand, variety and food type off the picture and creates the entry by itself — for cans without a barcode, for multipacks and for brands it has never seen. Adding a new variety takes exactly one photo.

The phone reads the text on the packaging itself, offline and at no extra cost. Connected to a household you also get the more accurate recognition, which reliably makes sense of ornate packaging as well. What else that brings is described further down.

## What the app does

- **Record a feeding.** Scan a barcode, photograph the packaging or tap a known variety. The entry is there immediately.
- **Rate.** One tap is enough. Wet food, dry food and treats each have their own, fitting scales.
- **Shopping list.** Every variety ends up under “buy again” or “don’t buy again”. You can set that yourself at any time and share the list.
- **Insights.** Which brand, which texture, which flavour goes down best? The app also speaks up when a variety keeps being left over or an animal is noticeably off its food.
- **History.** Calendar and daily overview of every meal, plus a short look back at the past week.
- **Reminders.** On request the app reminds you to rate a meal or about your usual feeding times. Both are off to begin with.
- **Several animals.** Cats, dogs, small pets and birds, each with a profile picture and its own evaluation.
- **Manual exchange.** Even without a server: “share changes” sends your new entries to another phone as a file, “receive exchange” merges both states.
- **Backup.** You can save your data to a file at any time and read it back in on a new phone.

The app comes in light and dark and follows whatever your phone is set to.

## On your own or in a household

The first time you start the app you decide how you want to use it. You can switch later at any point; your entries are kept either way.

**This phone only.** Everything stays on the device and the app does not go online by itself. It still reads the text on the packaging and prefills “name this food” with it; after that it recognises the variety by its barcode. Anyone who feeds their animals on their own gets along fine with this.

**Connected to a household.** Several people keep the same diary. Everyone sees what the others have entered, even when a phone had no connection for a while. On top of that comes the more accurate recognition: brand and variety from the photo, and unknown barcodes looked up automatically.

| | This phone only | In a household |
|---|---|---|
| Feed, rate, evaluate | yes | yes |
| Read packaging text | yes | yes |
| Recognise brand and variety from a photo | no | yes |
| Look up unknown barcodes | on request | yes |
| Share entries with others | manually, as a file | automatically |

A household needs a small server of its own, on a computer that stays on at home. It is not part of the app: its code and its setup guide live in [`server/`](server/).

## How to install

Schmeckt’s? isn’t on the Play Store, so you install it straight from this page. It takes about a minute, and you only need to give permission once.

<!-- This button downloads the APK of the latest release directly.
     It only works if every release has the APK attached under exactly this name: schmeckts.apk -->
<p align="center">
  <a href="https://github.com/hazymorning/Schmeckts/releases/latest/download/schmeckts.apk"><img src="https://github.com/user-attachments/assets/ffbc6f1f-0da5-4c14-ae23-ab543318029d" width="292" alt="Download APK"></a>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/5e312f50-e1ec-493b-9ee2-99c3bb88fbed" width="150" alt="QR code that opens this guide on your phone"><br>
  <sub>On a computer? Scan this code with your phone’s camera to open this guide there.</sub>
</p>

1. **Download.** On your Android phone, tap the button above. If your browser asks whether you want to keep the file, confirm.
2. **Open.** Once the download has finished, tap *Open*, or open `schmeckts.apk` from your *Downloads*.
3. **Allow.** The first time, Android asks whether your browser may install apps. Tap *Settings*, switch on *Allow from this source* and go back.
4. **Install.** Tap *Install*, then *Open*. That’s it.

<details>
<summary><b>Android offers to scan the app first</b></summary>
<br>

Because the app doesn’t come from the Play Store, Google Play Protect may suggest scanning it before it is installed. Let it scan; it only takes a moment. Afterwards you can install the app as usual.

</details>

<details>
<summary><b>Installing an update</b></summary>
<br>

Download the new version with the same button and install it over the old one. Your entries stay where they are. Please don’t uninstall the old version first, as that would delete your data.

</details>

<details>
<summary><b>“App not installed”</b></summary>
<br>

This usually means an older test version is still on the phone. Save a backup in the app’s settings, uninstall the old version, install the new one and read the backup back in.

</details>

<details>
<summary><b>Requirements</b></summary>
<br>

Android 8.0 or newer. The barcode scanner needs Google Play services, which almost every phone has; everything else works without them.

</details>

<p align="right"><sub><a href="https://github.com/hazymorning/Schmeckts/releases">All versions</a></sub></p>

## Privacy

- Your entries and photos stay inside the app. They end up neither in the gallery nor in Google’s cloud backup.
- No ads, no trackers.
- If you use the app on your phone alone, nothing leaves it. The packaging text is read on the device. The one exception is the barcode scanner: it comes from Google and, according to Google, reports no images but does report general device data such as the model.
- One setting you can switch on yourself: looking up unknown barcodes in open product databases. Only the number is transmitted, and it is off by default.
- In a household the app only talks to your own server. From there the photo of the packaging goes on for recognition, and unknown barcodes are looked up in open product databases. Nothing else leaves the phone, in particular nothing about your animals.
- An exchange file contains only animals, varieties and meals — no settings and no household code.
- The app needs the camera for photos. It only asks about notifications once you switch a reminder on.

## Questions

Questions and ideas belong in the [discussions](https://github.com/hazymorning/Schmeckts/discussions). Phone model, Android version and the app version shown at the very bottom of the settings are helpful.

## Licence

Copyright © 2026 hazymorning.

Schmeckt’s? is free software under the **GNU Affero General Public License, version 3**. You may use, study, modify and pass it on, provided that you place derived works under the same licence and make their source code available — including when you offer a modified version as a network service. The full terms are in [LICENSE](LICENSE).

The name “Schmeckt’s?”, the logo and the app icon are not covered by this licence. Please use your own name and your own artwork for a fork.

<!-- Once the repo is public, these badges fit in above. They keep themselves up to date:
  <a href="https://github.com/hazymorning/Schmeckts/releases/latest"><img src="https://img.shields.io/github/v/release/hazymorning/Schmeckts?label=Version&color=965E4B&labelColor=2E2724" alt="Latest version"></a>
  <a href="https://github.com/hazymorning/Schmeckts/releases"><img src="https://img.shields.io/github/downloads/hazymorning/Schmeckts/total?label=Downloads&color=965E4B&labelColor=2E2724" alt="Downloads"></a>
-->
