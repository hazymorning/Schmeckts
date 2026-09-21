# Installing the Schmeckt’s server

About ten minutes, all of it on the mini-PC with mouse and keyboard. Your password is needed once.

The server’s setup window and its messages are German, like the app. This guide is English, like the rest of the repository.

## 1. Pick the right file

There are two builds of the package:

- `schmeckts-server_1.1.0_amd64.deb` for PCs with an Intel or AMD processor (nearly all mini-PCs)
- `schmeckts-server_1.1.0_arm64.deb` for PCs with an ARM processor

If you are unsure: open the settings, go to “System” right at the bottom, then “About”. If the processor says Intel, AMD or Celeron, take amd64.

Download the file onto the mini-PC, for example by opening this page there in a browser.

## 2. Install

1. In the “Downloads” folder, double-click the .deb file. The software centre opens.
2. Click “Install” and enter your password.

If nothing opens, or an error appears instead: right-click the file, “Open with”, “Software centre”. If that fails too, open a terminal (Ctrl+Alt+T) and enter:

```
sudo apt install ~/Downloads/schmeckts-server_1.1.0_amd64.deb
```

The server runs straight away afterwards and starts automatically with the PC.

## 3. Get an API key

The key lets the server have packaging photos recognised by Claude. That costs roughly half a cent per photo.

1. Sign in at [platform.claude.com](https://platform.claude.com) or create an account and add a payment method.
2. Under “API Keys”, create a new key — for example named “Schmeckts” — and copy it. It starts with `sk-ant-`.
3. Recommended: set a small monthly spending limit under “Limits”, around 5 dollars.

## 4. Set it up

1. Open the application menu and start „Schmeckt’s-Server einrichten“.
2. Choose „Einrichten oder API-Schlüssel ändern“, paste the key, confirm and enter your password.
3. The server checks the key with Anthropic. The window then shows the **address** and the **household code**.

The same window shows the connection details again at any time, shows the stored data with „Übersicht“ (animals, food, recent meals, devices), and creates a new household code with „Neuer Code“ should a phone go missing.

## 5. Connect the phones

In the app: on first start „Mit Haushalt verbinden“ (later: settings, „Haushalt“, „Mit Haushalt verbinden“), type in the address and household code, then „Verbinden“. After that all phones sync their data automatically — at home over Wi-Fi, and on the road as soon as WireGuard is up. If something is waiting or the sync is stuck, a small notice appears at the top of the app. After a new code it reads „Code prüfen“; type the new code in there.

## Good to know

- **Backups:** the server writes a backup every day and keeps the last 30, in `/var/lib/schmeckts/backups`.
- **Updates:** just double-click the new .deb file again, or run `sudo apt install ~/Downloads/schmeckts-server_1.1.0_amd64.deb` in the terminal. Data, code and API key are kept.
- **Overview in the terminal:** `sudo schmeckts-server overview`.
- **Is it running?** `systemctl status schmeckts` shows the state, `journalctl -u schmeckts -e` the latest messages.
- **Restoring a backup:** `sudo schmeckts-server restore` lists the backups. Given a file, the command reads it back in. The phones then automatically do a full resync.
- **Do not put it on the internet:** do not set up port forwarding for the server in your router. It only accepts requests from the home network and over WireGuard anyway.
