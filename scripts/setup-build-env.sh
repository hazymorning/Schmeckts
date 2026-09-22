#!/usr/bin/env bash
# Sets up a fresh build environment (Ubuntu 24.04, as root). Only does what is missing.
# At the start of a session, after cloning the repository: this script first, then scripts/test.sh
# Installs: JDK 21 and the Android SDK (platform 36, build tools) for the app, Go and lintian for server and .deb,
# ruff and the shell checker for scripts/lint.sh (staticcheck that script installs itself, pinned).
# Assumed: Node.js 22+, Python 3 with Pillow and Playwright (Chromium) for icons and tests.
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

if ! command -v javac >/dev/null || ! command -v lintian >/dev/null || ! command -v shellcheck >/dev/null; then
  apt-get update -q >/dev/null
  apt-get install -y -q openjdk-21-jdk-headless lintian shellcheck >/dev/null
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

# ruff checks and formats the Python in tests/, scripts/ and design/ (scripts/lint.sh), pinned in tests/requirements.txt
command -v ruff >/dev/null || python3 -m pip install --quiet --break-system-packages --requirement "$(dirname "$0")/../tests/requirements.txt"

node -e 'if (+process.versions.node.split(".")[0] < 22) { console.error("Node.js 22 or newer required"); process.exit(1) }'
python3 -c 'import PIL, playwright' 2>/dev/null || echo "Note: the Python packages Pillow and playwright are missing (needed for icons and tests)"
echo "Build environment ready: $(javac -version 2>&1), $("${GO:-$(command -v go || echo /usr/local/go/bin/go)}" version | cut -d' ' -f3), Android SDK in $ANDROID_HOME"
