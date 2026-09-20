#!/usr/bin/env bash
# Richtet eine frische Build-Umgebung ein (Ubuntu 24.04, als root). Macht nur, was fehlt.
# Am Sitzungsanfang, nach dem Klonen des Repositorys: erst dieses Skript, dann scripts/test.sh
# Installiert: JDK 21, Android SDK (Plattform 36, Build-Tools) für die App, Go und lintian für Server und .deb.
# Vorausgesetzt: Node.js 22+, Python 3 mit Pillow und Playwright (Chromium) für Icons und Tests.
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

if ! command -v javac >/dev/null || ! command -v lintian >/dev/null; then
  apt-get update -q >/dev/null
  apt-get install -y -q openjdk-21-jdk-headless lintian >/dev/null
fi

if [ ! -x "$SDKM" ]; then
  ZIP="$(curl -s https://dl.google.com/android/repository/repository2-3.xml | grep -o 'commandlinetools-linux-[0-9]*_latest.zip' | sort -uV | tail -1)"
  curl -sL -o /tmp/cmdline-tools.zip "https://dl.google.com/android/repository/$ZIP"
  rm -rf /tmp/cmdline-tools && unzip -q /tmp/cmdline-tools.zip -d /tmp
  mkdir -p "$ANDROID_HOME/cmdline-tools" && mv /tmp/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
fi
yes | "$SDKM" --licenses >/dev/null 2>&1 || true
"$SDKM" "platforms;android-36" "build-tools;36.1.0" "build-tools;35.0.0" "platform-tools" >/dev/null

if ! command -v go >/dev/null && [ ! -x /usr/local/go/bin/go ]; then
  V="$(curl -s 'https://go.dev/VERSION?m=text' | head -1)"
  curl -sL "https://go.dev/dl/$V.linux-amd64.tar.gz" | tar -C /usr/local -xz
fi

node -e 'if (+process.versions.node.split(".")[0] < 22) { console.error("Node.js 22 oder neuer nötig"); process.exit(1) }'
python3 -c 'import PIL, playwright' 2>/dev/null || echo "Hinweis: Python-Pakete Pillow und playwright fehlen (für Icons und Tests)"
echo "Build-Umgebung bereit: $(javac -version 2>&1), $("${GO:-$(command -v go || echo /usr/local/go/bin/go)}" version | cut -d' ' -f3), Android SDK in $ANDROID_HOME"
