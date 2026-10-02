#!/usr/bin/env bash
# What building the APK and the server packages needs on Ubuntu 24.04, as root: JDK 21, the Android SDK and Go.
# Only installs what is missing. The tests do not need it.
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

if ! command -v javac >/dev/null; then
  apt-get update -q >/dev/null
  apt-get install -y -q openjdk-21-jdk-headless >/dev/null
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

node -e 'if (+process.versions.node.split(".")[0] < 22) { console.error("Node.js 22 or newer required"); process.exit(1) }'
echo "Build environment ready: $(javac -version 2>&1), Android SDK in $ANDROID_HOME"
